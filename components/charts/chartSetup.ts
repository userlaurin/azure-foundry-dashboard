import {
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';

let registered = false;

export function ensureChartRegistered() {
  if (registered) return;
  Chart.register(
    LineElement,
    PointElement,
    BarElement,
    LinearScale,
    CategoryScale,
    Title,
    Tooltip,
    Legend,
    Filler,
  );
  Chart.defaults.color = '#8b949e';
  Chart.defaults.font.family =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  registered = true;
}

export function formatTimeLabels(points: { t: string }[]): string[] {
  if (points.length === 0) return [];
  const first = new Date(points[0].t).getTime();
  const last = new Date(points[points.length - 1].t).getTime();
  const spanMs = last - first;
  const showTimeOnly = spanMs <= 36 * 3600_000;
  return points.map(({ t }) => {
    const d = new Date(t);
    if (showTimeOnly) {
      return d.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  });
}
