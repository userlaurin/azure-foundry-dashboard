import { NextRequest, NextResponse } from 'next/server';
import { getAwsUsage } from '@/lib/aws';
import { isTimeframe } from '@/lib/timeframe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const tf = req.nextUrl.searchParams.get('timeframe') ?? '24h';
  if (!isTimeframe(tf)) {
    return NextResponse.json({ error: `Invalid timeframe: ${tf}` }, { status: 400 });
  }
  try {
    const data = await getAwsUsage(tf);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/usage-aws]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
