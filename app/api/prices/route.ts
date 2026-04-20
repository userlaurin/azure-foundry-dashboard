import { NextResponse } from 'next/server';
import type { PriceItem } from '@/lib/pricing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_TTL_MS = 60 * 60 * 1000;
const BASE =
  'https://prices.azure.com/api/retail/prices?$filter=' +
  encodeURIComponent("serviceName eq 'Foundry Models' and priceType eq 'Consumption'");

let cache: { at: number; items: PriceItem[] } | null = null;
let inflight: Promise<PriceItem[]> | null = null;

async function fetchAll(): Promise<PriceItem[]> {
  const items: PriceItem[] = [];
  let url: string | null = BASE;
  let pages = 0;
  while (url && pages < 50) {
    const res: Response = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Retail prices ${res.status}`);
    const body = await res.json();
    if (Array.isArray(body.Items)) items.push(...body.Items);
    url = body.NextPageLink || null;
    pages += 1;
  }
  return items;
}

async function getPrices(): Promise<PriceItem[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.items;
  if (!inflight) {
    inflight = fetchAll()
      .then((items) => {
        cache = { at: Date.now(), items };
        return items;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export async function GET() {
  try {
    const items = await getPrices();
    return NextResponse.json({ items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/prices]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
