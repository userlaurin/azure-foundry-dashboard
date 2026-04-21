'use client';

import type { TooltipItem } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { ensureChartRegistered } from './chartSetup';

ensureChartRegistered();

interface DeploymentTotal {
  deployment: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
}

const PALETTE = [
  '#f0883e',
  '#6ea8fe',
  '#8ad5a5',
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

export function DeploymentBarChart({ data }: { data: DeploymentTotal[] }) {
  const top = data.slice(0, 12);
  const chartData = {
    labels: top.map((d) => d.deployment),
    datasets: [
      {
        label: 'Cost (USD)',
        data: top.map((d) => d.cost),
        backgroundColor: top.map((_, i) => PALETTE[i % PALETTE.length]),
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  };

  return (
    <div className="chart-wrap">
      <Bar data={chartData} options={options(top)} />
    </div>
  );
}

function options(top: DeploymentTotal[]) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y' as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => {
            const idx = ctx.dataIndex;
            const row = top[idx];
            if (!row) return `$${(ctx.parsed.x ?? 0).toFixed(4)}`;
            return `Cost: $${row.cost.toFixed(4)} | Tokens: ${row.tokens.toLocaleString()}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#8b949e',
          callback: (v: string | number) => `$${Number(v).toFixed(2)}`,
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
      y: {
        ticks: { color: '#c9d1d9' },
        grid: { display: false },
      },
    },
  };
}
