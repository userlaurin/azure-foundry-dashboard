'use client';

import { TIMEFRAMES, type Timeframe } from '@/lib/timeframe';

export function TimeframeSwitcher({
  value,
  onChange,
}: {
  value: Timeframe;
  onChange: (v: Timeframe) => void;
}) {
  return (
    <div className="timeframes" role="tablist" aria-label="Timeframe">
      {TIMEFRAMES.map((opt) => (
        <button
          key={opt}
          role="tab"
          aria-selected={value === opt}
          className={value === opt ? 'active' : ''}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
