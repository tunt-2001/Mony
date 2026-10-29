import { todayKey } from '../lib/format';
import { PRESETS, presetPeriod, type Period } from '../lib/period';

interface Props {
  value: Period;
  onChange: (p: Period) => void;
}

export function PeriodFilter({ value, onChange }: Props) {
  const today = todayKey();

  return (
    <div className="period">
      <div className="chips" role="tablist" aria-label="Khoảng thời gian">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={value.preset === p.id}
            className={`chip ${value.preset === p.id ? 'active' : ''}`}
            onClick={() => onChange(p.id === 'custom' ? { ...value, preset: 'custom' } : presetPeriod(p.id))}
          >
            {p.label}
          </button>
        ))}
      </div>
      {value.preset === 'custom' && (
        <div className="range">
          <label>
            Từ ngày
            <input
              type="date"
              value={value.from}
              max={value.to}
              onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })}
            />
          </label>
          <label>
            Đến ngày
            <input
              type="date"
              value={value.to}
              min={value.from}
              max={today}
              onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
