import type { Timeframe } from '@/lib/timeframe';

function fmtTokens(n: number): string {
  if (n < 1000) return n.toFixed(0);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  return `${(n / 1_000_000_000).toFixed(2)}B`;
}

function fmtCost(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function TotalsCards({
  totals,
  timeframe,
}: {
  totals: { inputTokens: number; outputTokens: number; cost: number };
  timeframe: Timeframe;
}) {
  const totalTokens = totals.inputTokens + totals.outputTokens;
  return (
    <section className="totals">
      <div className="card">
        <div className="label">Total tokens · {timeframe}</div>
        <div className="value">{fmtTokens(totalTokens)}</div>
      </div>
      <div className="card">
        <div className="label">Input tokens</div>
        <div className="value">{fmtTokens(totals.inputTokens)}</div>
      </div>
      <div className="card">
        <div className="label">Output tokens</div>
        <div className="value">{fmtTokens(totals.outputTokens)}</div>
      </div>
      <div className="card accent">
        <div className="label">Total cost</div>
        <div className="value">{fmtCost(totals.cost)}</div>
      </div>
    </section>
  );
}
