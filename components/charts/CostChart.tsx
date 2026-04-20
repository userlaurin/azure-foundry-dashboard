'use client';

import type { TooltipItem } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { ensureChartRegistered, formatTimeLabels } from './chartSetup';

ensureChartRegistered();

interface Point {
  t: string;
  cost: number;
}

export function CostChart({ data }: { data: Point[] }) {
  const labels = formatTimeLabels(data);
  const chartData = {
    labels,
    datasets: [
      {
        label: 'Cost (USD)',
        data: data.map((d) => d.cost),
        borderColor: '#f0883e',
        backgroundColor: 'rgba(240,136,62,0.25)',
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
          `$${(ctx.parsed.y ?? 0).toFixed(4)}`,
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
        callback: (v: string | number) => `$${Number(v).toFixed(2)}`,
      },
      grid: { color: 'rgba(255,255,255,0.05)' },
    },
  },
};
