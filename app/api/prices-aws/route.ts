import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import type { ManualPrices, PriceItem } from '@/lib/pricing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BULK_URL =
  'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/index.json';

const CACHE_TTL_MS = 60 * 60 * 1000;
let cache: { at: number; items: PriceItem[] } | null = null;
let inflight: Promise<PriceItem[]> | null = null;

async function fetchBedrockPrices(): Promise<PriceItem[]> {
  const res = await fetch(BULK_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`AWS bulk pricing ${res.status}`);
  const body = await res.json();

  const products: Record<string, any> = body.products ?? {};
  const onDemand: Record<string, any> = body.terms?.OnDemand ?? {};
  const items: PriceItem[] = [];

  for (const [sku, prod] of Object.entries(products)) {
    const attrs = prod.attributes ?? {};
    const inferenceType: string = attrs.inferenceType ?? '';

    // Only on-demand input/output token pricing (skip embeddings, images, etc.)
    if (!/^(Input|Output) tokens$/i.test(inferenceType)) continue;

    const skuTerms = onDemand[sku] ?? {};
    for (const offer of Object.values(skuTerms) as any[]) {
      for (const dim of Object.values(offer.priceDimensions ?? {}) as any[]) {
        const usdPrice = parseFloat(dim.pricePerUnit?.USD ?? '0');
        if (!usdPrice) continue;
        items.push({
          // Re-use PriceItem fields — map Bedrock attrs into them
          meterName: `${attrs.model ?? ''} ${inferenceType}`,
          productName: `${attrs.provider ?? ''} ${attrs.model ?? ''}`.trim(),
          skuName: sku,
          unitPrice: usdPrice,
          retailPrice: usdPrice,
          unitOfMeasure: dim.unit ?? '1K tokens',
          armRegionName: attrs.regionCode ?? '',
          currencyCode: 'USD',
          serviceName: 'AmazonBedrock',
          priceType: 'Consumption',
        });
      }
    }
  }

  return items;
}

async function getPrices(): Promise<PriceItem[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.items;
  if (!inflight) {
    inflight = fetchBedrockPrices()
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

async function loadManualPrices(): Promise<ManualPrices> {
  try {
    const raw = await readFile(
      join(process.cwd(), 'data', 'aws-prices.json'),
      'utf8',
    );
    const parsed = JSON.parse(raw);
    return parsed.models ?? {};
  } catch {
    return {};
  }
}

export async function GET() {
  try {
    const [items, manual] = await Promise.all([getPrices(), loadManualPrices()]);
    return NextResponse.json({ items, manual });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/prices-aws]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
