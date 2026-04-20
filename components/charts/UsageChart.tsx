'use client';

import type { TooltipItem } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { ensureChartRegistered, formatTimeLabels } from './chartSetup';

ensureChartRegistered();

interface Point {
  t: string;
  inputTokens: number;
  outputTokens: number;
}

export function UsageChart({ data }: { data: Point[] }) {
  const labels = formatTimeLabels(data);
  const chartData = {
    labels,
    datasets: [
      {
        label: 'Input',
        data: data.map((d) => d.inputTokens),
        borderColor: '#6ea8fe',
        backgroundColor: 'rgba(110,168,254,0.25)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
      },
      {
        label: 'Output',
        data: data.map((d) => d.outputTokens),
        borderColor: '#8ad5a5',
        backgroundColor: 'rgba(138,213,165,0.25)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
      },
    ],
  };

  return (
    <div className="chart-wrap">
      <Line data={chartData} options={OPTIONS} />
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
