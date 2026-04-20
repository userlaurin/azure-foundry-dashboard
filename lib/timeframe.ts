export type Timeframe = '24h' | '7d' | '31d';

export const TIMEFRAMES: Timeframe[] = ['24h', '7d', '31d'];

export function isTimeframe(v: string): v is Timeframe {
  return v === '24h' || v === '7d' || v === '31d';
}

export function resolveTimeframe(tf: Timeframe): { start: Date; end: Date; interval: string } {
  const end = new Date();
  switch (tf) {
    case '24h':
      return { start: new Date(end.getTime() - 24 * 3600_000), end, interval: 'PT1H' };
    case '7d':
      return { start: new Date(end.getTime() - 7 * 24 * 3600_000), end, interval: 'PT6H' };
    case '31d':
      return { start: new Date(end.getTime() - 31 * 24 * 3600_000), end, interval: 'P1D' };
  }
}
