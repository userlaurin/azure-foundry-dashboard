'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  findPrice,
  type ManualPrices,
  type PriceItem,
} from '@/lib/pricing';
import type { Timeframe } from '@/lib/timeframe';
import { CloudSwitcher, type CloudProvider } from './CloudSwitcher';
import { TimeframeSwitcher } from './TimeframeSwitcher';
import { TotalsCards } from './TotalsCards';
import { UsageChart } from './charts/UsageChart';
import { CostChart } from './charts/CostChart';
import { ModelBarChart } from './charts/ModelBarChart';
import { DeploymentTokensChart } from './charts/DeploymentTokensChart';
import { DeploymentCostChart } from './charts/DeploymentCostChart';
import { DeploymentBarChart } from './charts/DeploymentBarChart';

interface UsagePoint {
  t: string;
  model: string;
  modelVersion: string | null;
  deployment: string;
  region: string;
  inputTokens: number;
  outputTokens: number;
}

interface UsageResponse {
  timeframe: Timeframe;
  start: string;
  end: string;
  interval: string;
  accounts: Array<{ id: string; name: string; kind: string; location: string }>;
  points: UsagePoint[];
}

const REFRESH_MS = Number(process.env.NEXT_PUBLIC_REFRESH_MS ?? 5000);

export function Dashboard() {
  const [cloudProvider, setCloudProvider] = useState<CloudProvider>('azure');
  const [timeframe, setTimeframe] = useState<Timeframe>('24h');
  const [prices, setPrices] = useState<PriceItem[] | null>(null);
  const [manualPrices, setManualPrices] = useState<ManualPrices>({});
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset all data when switching cloud provider
  useEffect(() => {
    setPrices(null);
    setManualPrices({});
    setUsage(null);
    setError(null);
    setLastUpdated(null);
  }, [cloudProvider]);

  useEffect(() => {
    let cancelled = false;
    const url = cloudProvider === 'azure' ? '/api/prices' : '/api/prices-aws';
    fetch(url)
      .then((r) =>
        r.ok ? r.json() : r.json().then((b: { error?: string }) => Promise.reject(new Error(b.error ?? r.statusText))),
      )
      .then(({ items, manual }: { items: PriceItem[]; manual: ManualPrices }) => {
        if (!cancelled) {
          setPrices(items ?? []);
          setManualPrices(manual ?? {});
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(`Pricing fetch failed: ${e.message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [cloudProvider]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (cancelled) return;
      setLoading(true);
      try {
        const endpoint = cloudProvider === 'azure' ? '/api/usage' : '/api/usage-aws';
        const res = await fetch(`${endpoint}?timeframe=${timeframe}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || res.statusText);
        if (!cancelled) {
          setUsage(json);
          setLastUpdated(new Date());
          setError(null);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = setTimeout(poll, REFRESH_MS);
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [timeframe, cloudProvider]);

  const enriched = useMemo(() => {
    if (!usage || !prices) return [];
    return usage.points.map((p) => {
      const inPrice =
        findPrice(prices, p.model, 'input', p.region, p.modelVersion ?? undefined, manualPrices) ?? 0;
      const outPrice =
        findPrice(prices, p.model, 'output', p.region, p.modelVersion ?? undefined, manualPrices) ?? 0;
      const cost = p.inputTokens * inPrice + p.outputTokens * outPrice;
      const tokens = p.inputTokens + p.outputTokens;
      const deploymentKey = `${p.deployment}|${p.model}|${p.region}`;
      const deploymentLabel = `${p.deployment} · ${p.model} · ${p.region}`;
      return { ...p, cost, tokens, deploymentKey, deploymentLabel };
    });
  }, [usage, prices, manualPrices]);

  const byTime = useMemo(() => {
    const map = new Map<
      string,
      { t: string; inputTokens: number; outputTokens: number; cost: number }
    >();
    for (const p of enriched) {
      const existing =
        map.get(p.t) ?? { t: p.t, inputTokens: 0, outputTokens: 0, cost: 0 };
      existing.inputTokens += p.inputTokens;
      existing.outputTokens += p.outputTokens;
      existing.cost += p.cost;
      map.set(p.t, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.t.localeCompare(b.t));
  }, [enriched]);

  const byModel = useMemo(() => {
    const map = new Map<
      string,
      { model: string; inputTokens: number; outputTokens: number; cost: number }
    >();
    for (const p of enriched) {
      const existing =
        map.get(p.model) ??
        { model: p.model, inputTokens: 0, outputTokens: 0, cost: 0 };
      existing.inputTokens += p.inputTokens;
      existing.outputTokens += p.outputTokens;
      existing.cost += p.cost;
      map.set(p.model, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
  }, [enriched]);

  const byDeploymentTime = useMemo(() => {
    const map = new Map<
      string,
      {
        t: string;
        deployment: string;
        inputTokens: number;
        outputTokens: number;
        tokens: number;
        cost: number;
      }
    >();

    for (const p of enriched) {
      const key = `${p.t}|${p.deploymentKey}`;
      const existing =
        map.get(key) ??
        {
          t: p.t,
          deployment: p.deploymentLabel,
          inputTokens: 0,
          outputTokens: 0,
          tokens: 0,
          cost: 0,
        };
      existing.inputTokens += p.inputTokens;
      existing.outputTokens += p.outputTokens;
      existing.tokens += p.tokens;
      existing.cost += p.cost;
      map.set(key, existing);
    }

    return Array.from(map.values()).sort((a, b) => a.t.localeCompare(b.t));
  }, [enriched]);

  const byDeploymentTotals = useMemo(() => {
    const map = new Map<
      string,
      {
        deployment: string;
        inputTokens: number;
        outputTokens: number;
        tokens: number;
        cost: number;
      }
    >();

    for (const p of enriched) {
      const existing =
        map.get(p.deploymentKey) ??
        {
          deployment: p.deploymentLabel,
          inputTokens: 0,
          outputTokens: 0,
          tokens: 0,
          cost: 0,
        };
      existing.inputTokens += p.inputTokens;
      existing.outputTokens += p.outputTokens;
      existing.tokens += p.tokens;
      existing.cost += p.cost;
      map.set(p.deploymentKey, existing);
    }

    return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
  }, [enriched]);

  const totals = useMemo(
    () =>
      byModel.reduce(
        (acc, m) => ({
          inputTokens: acc.inputTokens + m.inputTokens,
          outputTokens: acc.outputTokens + m.outputTokens,
          cost: acc.cost + m.cost,
        }),
        { inputTokens: 0, outputTokens: 0, cost: 0 },
      ),
    [byModel],
  );

  const hasData = enriched.length > 0;
  const pricesReady = prices !== null;

  return (
    <div className="dashboard">
      <header className="hdr">
        <div>
          <h1>{cloudProvider === 'azure' ? 'Azure Foundry' : 'AWS Bedrock'} · Usage &amp; Cost</h1>
          <p className="sub">
            {usage?.accounts.length ?? 0}{' '}
            {cloudProvider === 'azure' ? 'account' : 'region'}
            {(usage?.accounts.length ?? 0) === 1 ? '' : 's'} ·{' '}
            {pricesReady
              ? cloudProvider === 'azure'
                ? `${prices!.length} price entries`
                : 'Bedrock prices loaded'
              : 'loading prices…'}
          </p>
        </div>
        <div className="controls">
          <CloudSwitcher value={cloudProvider} onChange={setCloudProvider} />
          <TimeframeSwitcher value={timeframe} onChange={setTimeframe} />
          <div className="status">
            <span className={loading ? 'dot loading' : 'dot'} />
            <span className="ts">
              {lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString()}`
                : 'Loading…'}
            </span>
          </div>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <TotalsCards totals={totals} timeframe={timeframe} />

      <section className="grid">
        <div className="panel">
          <h2>Token usage</h2>
          {hasData ? (
            <UsageChart data={byTime} />
          ) : (
            <div className="empty">No usage in this window.</div>
          )}
        </div>
        <div className="panel">
          <h2>Cost over time</h2>
          {hasData ? (
            <CostChart data={byTime} />
          ) : (
            <div className="empty">No cost in this window.</div>
          )}
        </div>
        <div className="panel wide">
          <h2>Cost by model</h2>
          {byModel.length > 0 ? (
            <ModelBarChart data={byModel} />
          ) : (
            <div className="empty">No model usage in this window.</div>
          )}
        </div>
        <div className="panel wide">
          <h2>Deployment token usage over time</h2>
          {byDeploymentTime.length > 0 ? (
            <DeploymentTokensChart data={byDeploymentTime} />
          ) : (
            <div className="empty">No deployment usage in this window.</div>
          )}
        </div>
        <div className="panel wide">
          <h2>Deployment cost over time</h2>
          {byDeploymentTime.length > 0 ? (
            <DeploymentCostChart data={byDeploymentTime} />
          ) : (
            <div className="empty">No deployment cost in this window.</div>
          )}
        </div>
        <div className="panel wide">
          <h2>Top deployments by cost</h2>
          {byDeploymentTotals.length > 0 ? (
            <DeploymentBarChart data={byDeploymentTotals} />
          ) : (
            <div className="empty">No deployment totals in this window.</div>
          )}
        </div>
      </section>
    </div>
  );
}
