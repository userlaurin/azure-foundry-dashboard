import { NextRequest, NextResponse } from 'next/server';

const REALM = 'Azure Foundry Dashboard';

function unauthorized(): NextResponse {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Cache-Control': 'no-store',
    },
  });
}

function unavailable(): NextResponse {
  return new NextResponse('Dashboard password is not configured', {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
}

export function middleware(req: NextRequest) {
  const expectedPassword = process.env.DASHBOARD_PASSWORD;
  if (!expectedPassword) return unavailable();

  const expectedUsername = process.env.DASHBOARD_USERNAME ?? 'admin';
  const header = req.headers.get('authorization') ?? '';
  if (!header.startsWith('Basic ')) return unauthorized();

  let decoded = '';
  try {
    decoded = atob(header.slice('Basic '.length));
  } catch {
    return unauthorized();
  }

  const separator = decoded.indexOf(':');
  if (separator < 0) return unauthorized();

  const username = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  if (
    !safeEqual(username, expectedUsername) ||
    !safeEqual(password, expectedPassword)
  ) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
