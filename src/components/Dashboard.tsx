import { useState } from 'react';
import type { Transaction } from '../lib/supabase';
import { formatVnd, shortDay, dayKey, timeLabel } from '../lib/format';
import { FlowChart } from './FlowChart';
import type { Period } from '../lib/period';
import { periodStats, totals } from '../lib/stats';
import { IconIn, IconOut } from './Icons';
import { TxDetail } from './TxDetail';

interface Props {
  period: Period;
  txs: Transaction[];
  prevTxs: Transaction[];
  onChange: () => void;
}

/** "▲ 12% so với kỳ trước" or null when there is nothing to compare against. */
function compare(now: number, before: number): string | null {
  if (before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return 'bằng kỳ trước';
  return `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% so với kỳ trước`;
}

export function Dashboard({ period, txs, prevTxs, onChange }: Props) {
  const [detail, setDetail] = useState<Transaction | null>(null);
  const s = periodStats(txs, period);
  const prev = totals(prevTxs);
  const net = s.income - s.spent;
  const showChart = s.buckets.length > 1;

  return (
    <div className="dashboard">
      <section className="hero">
        <p className="hero-label">Chênh lệch thu – chi</p>
        <p className="hero-value num">
          {net > 0 ? '+' : ''}
          {formatVnd(net)}
        </p>
        <div className="hero-split">
          <div>
            <span className="hero-pill in">
              <IconIn size={14} /> Nhận
            </span>
            <strong className="num">{formatVnd(s.income)}</strong>
            <small>
              {s.incomeCount} giao dịch{compare(s.income, prev.income) && ` · ${compare(s.income, prev.income)}`}
            </small>
          </div>
          <div>
            <span className="hero-pill out">
              <IconOut size={14} /> Chi
            </span>
            <strong className="num">{formatVnd(s.spent)}</strong>
            <small>
              {s.spentCount} giao dịch{compare(s.spent, prev.spent) && ` · ${compare(s.spent, prev.spent)}`}
            </small>
          </div>
        </div>
      </section>

      {txs.length === 0 && <p className="empty">Không có giao dịch trong khoảng thời gian này.</p>}

      {txs.length > 0 && showChart && (
        <section className="card">
          <div className="card-head">
            <h2>Nhận và chi theo {s.monthly ? 'tháng' : 'ngày'}</h2>
            <div className="legend">
              <span>
                <i className="dot in" /> Nhận
              </span>
              <span>
                <i className="dot out" /> Chi
              </span>
            </div>
          </div>
          <FlowChart buckets={s.buckets} monthly={s.monthly} />
        </section>
      )}

      {txs.length > 0 && (
        <div className="top-grid">
          <TopList title="Khoản nhận" kind="in" items={s.topIn} onPick={setDetail} />
          <TopList title="Khoản chi" kind="out" items={s.topOut} onPick={setDetail} />
        </div>
      )}

      {detail && (
        <TxDetail
          tx={detail}
          onClose={() => setDetail(null)}
          onDeleted={() => {
            setDetail(null);
            onChange();
          }}
        />
      )}
    </div>
  );
}

function TopList(props: { title: string; kind: 'in' | 'out'; items: Transaction[]; onPick: (t: Transaction) => void }) {
  return (
    <section className="card">
      <h2>{props.title}</h2>
      {props.items.length === 0 ? (
        <p className="muted small">Không có.</p>
      ) : (
        <ol className="top-list">
          {props.items.map((t) => (
            <li key={t.id} className="clickable" onClick={() => props.onPick(t)}>
              <span className={`badge-icon ${props.kind}`}>{props.kind === 'in' ? <IconIn size={14} /> : <IconOut size={14} />}</span>
              <span className="top-text">
                <span className="ellipsis">{t.description || '(không có nội dung)'}</span>
                <small className="muted">
                  {shortDay(dayKey(t.occurred_at), false)} · {timeLabel(t.occurred_at)}
                </small>
              </span>
              <span className={`num amount ${props.kind}`}>{formatVnd(Math.abs(t.amount))}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
