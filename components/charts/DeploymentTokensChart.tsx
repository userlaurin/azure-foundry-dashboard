'use client';

import type { TooltipItem } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { ensureChartRegistered, formatTimeLabels } from './chartSetup';

ensureChartRegistered();

interface Point {
  t: string;
  deployment: string;
  tokens: number;
}

const PALETTE = [
  '#6ea8fe',
  '#8ad5a5',
  '#f0883e',
  '#d2a8ff',
  '#ffa657',
  '#79c0ff',
  '#ff7b72',
  '#a5d6ff',
  '#d29922',
  '#56d364',
  '#7ee787',
  '#f2cc60',
];

const MAX_DEPLOYMENTS = 10;

function buildSeries(data: Point[]) {
  const times = Array.from(new Set(data.map((d) => d.t))).sort((a, b) =>
    a.localeCompare(b),
  );
  const timeIndex = new Map(times.map((t, i) => [t, i]));

  const totalByDeployment = new Map<string, number>();
  for (const p of data) {
    totalByDeployment.set(
      p.deployment,
      (totalByDeployment.get(p.deployment) ?? 0) + p.tokens,
    );
  }

  const deployments = Array.from(totalByDeployment.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_DEPLOYMENTS)
    .map(([name]) => name);

  const valueByKey = new Map<string, number>();
  for (const p of data) {
    if (!deployments.includes(p.deployment)) continue;
    const key = `${p.t}|${p.deployment}`;
    valueByKey.set(key, (valueByKey.get(key) ?? 0) + p.tokens);
  }

  const datasets = deployments.map((deployment, i) => {
    const values = times.map((t) => valueByKey.get(`${t}|${deployment}`) ?? 0);
    const color = PALETTE[i % PALETTE.length];
    return {
      label: deployment,
      data: values,
      borderColor: color,
      backgroundColor: color,
      fill: false,
      tension: 0.25,
      pointRadius: 0,
      borderWidth: 2,
    };
  });

  return {
    labels: formatTimeLabels(times.map((t) => ({ t }))),
    datasets,
    hasData: datasets.length > 0,
    timeIndex,
  };
}

export function DeploymentTokensChart({ data }: { data: Point[] }) {
  const series = buildSeries(data);

  if (!series.hasData) {
    return <div className="empty">No deployment series available.</div>;
  }

  return (
    <div className="chart-wrap">
      <Line data={{ labels: series.labels, datasets: series.datasets }} options={OPTIONS} />
    </div>
  );
}

const OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: { labels: { color: '#c9d1d9' } },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<'line'>) =>
          `${ctx.dataset.label}: ${(ctx.parsed.y ?? 0).toLocaleString()} tokens`,
      },
    },
  },
  scales: {
    x: {
      ticks: { color: '#8b949e', maxRotation: 0, autoSkipPadding: 16 },
      grid: { color: 'rgba(255,255,255,0.05)' },
    },
    y: {
      ticks: {
        color: '#8b949e',
        callback: (v: string | number) => {
          const n = Number(v);
          if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
          if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
          return `${n}`;
        },
      },
      grid: { color: 'rgba(255,255,255,0.05)' },
    },
  },
};
