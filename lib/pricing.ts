export interface PriceItem {
  meterName: string;
  productName: string;
  skuName: string;
  unitPrice: number;
  retailPrice: number;
  unitOfMeasure: string;
  armRegionName: string;
  currencyCode: string;
  serviceName: string;
  priceType: string;
}

export type ManualPrices = Record<string, { input: number; output: number }>;

export interface PricesResponse {
  items: PriceItem[];
  manual: ManualPrices;
}

export async function fetchCognitiveServicesPrices(): Promise<PricesResponse> {
  const res = await fetch('/api/prices');
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Prices ${res.status}`);
  }
  const body = await res.json();
  return {
    items: (body.items ?? []) as PriceItem[],
    manual: (body.manual ?? {}) as ManualPrices,
  };
}

function normalizeModelKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function findManualPrice(
  manual: ManualPrices,
  modelName: string,
  kind: 'input' | 'output',
): number | null {
  if (!manual || Object.keys(manual).length === 0) return null;
  const target = normalizeModelKey(modelName);
  if (!target) return null;
  let best: { key: string; entry: { input: number; output: number } } | null = null;
  for (const [key, entry] of Object.entries(manual)) {
    const normKey = normalizeModelKey(key);
    if (normKey === target) {
      best = { key: normKey, entry };
      break;
    }
    if (target.startsWith(normKey) || normKey.startsWith(target)) {
      if (!best || normKey.length > best.key.length) {
        best = { key: normKey, entry };
      }
    }
  }
  if (!best) return null;
  const per1k = kind === 'input' ? best.entry.input : best.entry.output;
  return per1k / 1000;
}

const INPUT_KWS = new Set(['input', 'inp', 'inpt']);
const OUTPUT_KWS = new Set(['output', 'outp', 'opt']);

const HARD_EXCLUDE = new Set([
  'batch',
  'ft',
  'fine',
  'tuned',
  'tune',
  'training',
  'trng',
  'hstng',
  'hosting',
  'cached',
  'cchd',
  'grader',
  'grdr',
  'dev',
]);

const MODAL_QUALIFIERS = new Set([
  'aud',
  'audio',
  'transcribe',
  'tts',
  'rt',
  'rtime',
  'realtime',
  'realtimeprvw',
  'prvw',
  'preview',
  'image',
  'img',
  'vision',
]);

const SUBMODEL_QUALIFIERS = new Set([
  'mini',
  'nano',
  'pro',
  'turbo',
  'codex',
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function parseUnits(uom: string): number {
  const m = uom.match(/(\d+(?:,\d+)*)\s*([KkMm])?/);
  if (!m) return 1;
  const n = parseInt(m[1].replace(/,/g, ''), 10);
  const suffix = m[2];
  if (!suffix) return n || 1;
  return n * (suffix.toLowerCase() === 'k' ? 1000 : 1_000_000);
}

function regionTier(meterTokens: string[]): 0 | 1 | 2 | 3 {
  if (meterTokens.includes('glbl') || meterTokens.includes('global') || meterTokens.includes('gl')) return 0;
  for (let i = 0; i < meterTokens.length - 1; i++) {
    if (meterTokens[i] === 'data' && meterTokens[i + 1] === 'zone') return 1;
  }
  if (meterTokens.includes('dzone') || meterTokens.includes('dz')) return 1;
  if (meterTokens.includes('regional') || meterTokens.includes('regnl') || meterTokens.includes('rgnl')) return 2;
  return 3;
}

function mmddFromVersion(version: string | undefined): string | null {
  if (!version) return null;
  const m = version.match(/^\d{4}-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}${m[2]}`;
}

function containsTokens(haystack: string[], needle: string[]): number {
  if (needle.length === 0) return -1;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

function findEmbeddingPrice(
  items: PriceItem[],
  modelTokens: string[],
): number | null {
  const candidates: Array<{ item: PriceItem; region: number }> = [];
  for (const item of items) {
    const meterTokens = tokenize(item.meterName);
    if (meterTokens.some((t) => HARD_EXCLUDE.has(t))) continue;
    if (meterTokens.some((t) => INPUT_KWS.has(t) || OUTPUT_KWS.has(t))) continue;
    if (containsTokens(meterTokens, modelTokens) < 0) continue;
    if (!meterTokens.includes('tokens')) continue;
    candidates.push({ item, region: regionTier(meterTokens) });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.region - b.region || a.item.unitPrice - b.item.unitPrice);
  const chosen = candidates[0].item;
  const per = parseUnits(chosen.unitOfMeasure);
  return per > 0 ? chosen.unitPrice / per : null;
}

export function findPrice(
  items: PriceItem[],
  modelName: string,
  kind: 'input' | 'output',
  _region: string,
  modelVersion?: string,
  manual?: ManualPrices,
): number | null {
  if (manual) {
    const manualPrice = findManualPrice(manual, modelName, kind);
    if (manualPrice !== null) return manualPrice;
  }

  const modelTokens = tokenize(modelName);
  if (modelTokens.length === 0) return null;

  if (modelTokens.includes('embedding')) {
    if (kind === 'output') return 0;
    return findEmbeddingPrice(items, modelTokens);
  }

  const modelHasMini = modelTokens.includes('mini');
  const modelHasNano = modelTokens.includes('nano');
  const modelHasPro = modelTokens.includes('pro');
  const modelHasTurbo = modelTokens.includes('turbo');
  const modelQualifiers = new Set(
    modelTokens.filter(
      (t) => SUBMODEL_QUALIFIERS.has(t) || MODAL_QUALIFIERS.has(t),
    ),
  );

  const mmdd = mmddFromVersion(modelVersion);

  interface Scored {
    item: PriceItem;
    region: number;
    versionMatch: number;
    recency: number;
  }
  const candidates: Scored[] = [];

  for (const item of items) {
    const meterTokens = tokenize(item.meterName);

    if (meterTokens.some((t) => HARD_EXCLUDE.has(t))) continue;

    const hasInput = meterTokens.some((t) => INPUT_KWS.has(t));
    const hasOutput = meterTokens.some((t) => OUTPUT_KWS.has(t));
    if (kind === 'input' && (!hasInput || hasOutput)) continue;
    if (kind === 'output' && (!hasOutput || hasInput)) continue;

    const idx = containsTokens(meterTokens, modelTokens);
    if (idx < 0) continue;

    const after = meterTokens.slice(idx + modelTokens.length);

    // Reject if any sub/modal qualifier appears between the model tokens
    // and the kind keyword, unless the model itself has that qualifier.
    let badQualifier = false;
    for (const t of after) {
      if (INPUT_KWS.has(t) || OUTPUT_KWS.has(t)) break;
      if (SUBMODEL_QUALIFIERS.has(t) || MODAL_QUALIFIERS.has(t)) {
        if (!modelQualifiers.has(t)) {
          badQualifier = true;
          break;
        }
      }
    }
    if (badQualifier) continue;

    // Guard: if model is NOT "mini"/"nano"/"pro"/"turbo" but a "mini" etc
    // appears before the model tokens in meter, reject (handles edge ordering).
    const before = meterTokens.slice(0, idx);
    if (
      (!modelHasMini && before.includes('mini')) ||
      (!modelHasNano && before.includes('nano')) ||
      (!modelHasPro && before.includes('pro')) ||
      (!modelHasTurbo && before.includes('turbo'))
    ) {
      continue;
    }

    let meterMmdd = 0;
    for (const t of after) {
      if (INPUT_KWS.has(t) || OUTPUT_KWS.has(t)) break;
      if (/^\d{4}$/.test(t)) {
        meterMmdd = parseInt(t, 10);
        break;
      }
    }

    const versionMatch = mmdd && meterMmdd === parseInt(mmdd, 10) ? 0 : 1;

    candidates.push({
      item,
      region: regionTier(meterTokens),
      versionMatch,
      recency: -meterMmdd,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.versionMatch !== b.versionMatch) return a.versionMatch - b.versionMatch;
    if (a.region !== b.region) return a.region - b.region;
    if (a.recency !== b.recency) return a.recency - b.recency;
    return a.item.unitPrice - b.item.unitPrice;
  });

  const chosen = candidates[0].item;
  const per = parseUnits(chosen.unitOfMeasure);
  if (!per) return null;
  return chosen.unitPrice / per;
}
