import { formatVnd, todayKey } from '../lib/format';

export interface Budget {
  limit: number;
  spent: number; // this calendar month, own transfers excluded
  month: string; // "YYYY-MM"
}

/** Progress of this month's spending against the limit set in Settings. Hidden when no limit is set. */
export function LimitCard({ budget }: { budget: Budget }) {
  const { limit, spent, month } = budget;
  const ratio = spent / limit;
  const level = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'near' : 'ok';
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const daysLeft = daysInMonth - Number(todayKey().slice(8)) + 1;
  const left = limit - spent;

  return (
    <section className={`card limit-card ${level}`}>
      <div className="limit-head">
        <h2>Hạn mức tháng {m}</h2>
        <strong className="num">{Math.round(ratio * 100)}%</strong>
      </div>
      <div
        className="limit-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(ratio * 100))}
        aria-label="Đã chi so với hạn mức"
      >
        <span style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      <p className="limit-line num">
        Đã chi {formatVnd(spent)} / {formatVnd(limit)}
      </p>
      <p className="muted small">
        {left >= 0
          ? `Còn ${formatVnd(left)} · khoảng ${formatVnd(Math.floor(left / daysLeft / 1000) * 1000)}/ngày cho ${daysLeft} ngày còn lại`
          : `Đã vượt ${formatVnd(-left)}`}
      </p>
    </section>
  );
}
