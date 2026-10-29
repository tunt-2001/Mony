import { useState } from 'react';
import type { Transaction } from '../lib/supabase';
import { byCategory } from '../lib/stats';
import { dayKey, formatVnd, shortDay, timeLabel, txTitle } from '../lib/format';

/** Ranked bars per category; tap a row to see its transactions. Own transfers are excluded by the caller. */
export function CategoryCard({ txs, onPick }: { txs: Transaction[]; onPick: (t: Transaction) => void }) {
  const [kind, setKind] = useState<'out' | 'in'>('out');
  const [open, setOpen] = useState<string | null>(null);
  const rows = byCategory(txs, kind);
  const sum = rows.reduce((n, r) => n + r.total, 0);
  const max = rows[0]?.total ?? 0;

  return (
    <section className="card">
      <div className="card-head">
        <h2>Theo danh mục</h2>
        <div className="segmented mini">
          <button className={kind === 'out' ? 'active out' : ''} onClick={() => setKind('out')}>
            Chi
          </button>
          <button className={kind === 'in' ? 'active in' : ''} onClick={() => setKind('in')}>
            Nhận
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="muted small">Không có.</p>
      ) : (
        <ul className="cat-list">
          {rows.map((r) => (
            <li key={r.category}>
              <button
                className="cat-row"
                aria-expanded={open === r.category}
                onClick={() => setOpen(open === r.category ? null : r.category)}
              >
                <span className="cat-name ellipsis">{r.category}</span>
                <span className="cat-value num">
                  {formatVnd(r.total)} <small className="muted">{Math.round((r.total / sum) * 100)}%</small>
                </span>
                <span className="cat-track" aria-hidden="true">
                  <span className={`cat-bar ${kind}`} style={{ width: `${Math.max(2, (r.total / max) * 100)}%` }} />
                </span>
              </button>
              {open === r.category && (
                <ul className="cat-items">
                  {r.items.map((t) => (
                    <li key={t.id}>
                      <button onClick={() => onPick(t)}>
                        <span className="top-text">
                          <span className="ellipsis">{txTitle(t)}</span>
                          <small className="muted">
                            {shortDay(dayKey(t.occurred_at), false)} · {timeLabel(t.occurred_at)}
                          </small>
                        </span>
                        <span className={`num amount ${kind}`}>{formatVnd(Math.abs(t.amount))}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
