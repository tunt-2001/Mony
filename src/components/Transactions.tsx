import { useState } from 'react';
import { stripAccents } from '../../supabase/functions/_shared/smsParser.ts';
import type { Transaction } from '../lib/supabase';
import { dayKey, dayLabel, formatNumber, formatVnd, sourceLabel, timeLabel } from '../lib/format';
import { totals } from '../lib/stats';
import { TransactionForm } from './TransactionForm';
import { TxDetail } from './TxDetail';
import { IconIn, IconOut, IconPlus, IconSearch } from './Icons';

interface Props {
  txs: Transaction[];
  transfers: Map<string, string | null>;
  onChange: () => void;
}

const normalize = (s: string) => stripAccents(s).toLowerCase();

/** Ledger: one row per transaction, money in and money out in separate columns. */
export function Transactions({ txs, transfers, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<Transaction | null>(null);

  const q = normalize(query.trim());
  const visible = q ? txs.filter((t) => normalize(t.description).includes(q)) : txs;
  // Own transfers stay listed but are left out of every total.
  const counted = (items: Transaction[]) => items.filter((t) => !transfers.has(t.id));
  const sum = totals(counted(visible));
  const transferCount = visible.length - counted(visible).length;

  const days = new Map<string, Transaction[]>();
  for (const t of visible) {
    const k = dayKey(t.occurred_at);
    days.set(k, [...(days.get(k) ?? []), t]);
  }

  return (
    <div>
      <section className="summary">
        <div className="summary-cell in">
          <span>
            <IconIn size={14} /> Tổng nhận
          </span>
          <strong className="num">{formatVnd(sum.income)}</strong>
        </div>
        <div className="summary-cell out">
          <span>
            <IconOut size={14} /> Tổng chi
          </span>
          <strong className="num">{formatVnd(sum.spent)}</strong>
        </div>
      </section>
      {transferCount > 0 && (
        <p className="muted small note">Không tính {transferCount} khoản chuyển giữa các tài khoản của bạn (in mờ bên dưới).</p>
      )}

      <div className="toolbar">
        <label className="search">
          <IconSearch />
          <input
            type="search"
            placeholder="Tìm theo nội dung"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Tìm theo nội dung"
          />
        </label>
        <button className="primary add-btn" onClick={() => setAdding(true)} aria-label="Thêm giao dịch">
          <IconPlus /> Thêm
        </button>
      </div>

      {adding && (
        <TransactionForm
          onDone={(saved) => {
            setAdding(false);
            if (saved) onChange();
          }}
        />
      )}

      {visible.length === 0 ? (
        <p className="empty">Không có giao dịch.</p>
      ) : (
        <div className="ledger" role="table" aria-label="Sổ giao dịch">
          <div className="ledger-head" role="row">
            <span role="columnheader">Nội dung</span>
            <span role="columnheader" className="num in">
              Nhận (₫)
            </span>
            <span role="columnheader" className="num out">
              Chi (₫)
            </span>
          </div>

          {[...days].map(([day, items]) => {
            const d = totals(counted(items));
            return (
              <div key={day} role="rowgroup">
                <div className="ledger-day" role="row">
                  <span role="cell">{dayLabel(day)}</span>
                  <span role="cell" className="num in">
                    {d.income ? formatNumber(d.income) : ''}
                  </span>
                  <span role="cell" className="num out">
                    {d.spent ? formatNumber(d.spent) : ''}
                  </span>
                </div>
                {items.map((t) => (
                  <button
                    key={t.id}
                    className={`ledger-row${transfers.has(t.id) ? ' transfer' : ''}`}
                    role="row"
                    onClick={() => setDetail(t)}
                  >
                    <span role="cell" className="ledger-desc">
                      <span className="ellipsis">{t.description || '(không có nội dung)'}</span>
                      <small>
                        {timeLabel(t.occurred_at)} · {sourceLabel(t)}
                        {transfers.has(t.id) && ' · Chuyển nội bộ'}
                      </small>
                    </span>
                    <span role="cell" className="num in">
                      {t.amount > 0 ? formatNumber(t.amount) : ''}
                    </span>
                    <span role="cell" className="num out">
                      {t.amount < 0 ? formatNumber(-t.amount) : ''}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {detail && (
        <TxDetail
          tx={detail}
          transfers={transfers}
          onClose={() => setDetail(null)}
          onChanged={() => {
            setDetail(null);
            onChange();
          }}
        />
      )}
    </div>
  );
}
