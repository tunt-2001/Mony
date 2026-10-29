import { lazy, Suspense, useState } from 'react';
import type { Transaction } from '../lib/supabase';
import { formatVnd, shortDay, dayKey, sourceLabel, timeLabel, txTitle } from '../lib/format';
// Recharts is most of the bundle: load it after the numbers are on screen.
const FlowChart = lazy(() => import('./FlowChart').then((m) => ({ default: m.FlowChart })));
import type { Period } from '../lib/period';
import { periodStats, totals } from '../lib/stats';
import { IconIn, IconOut } from './Icons';
import { TxDetail } from './TxDetail';
import { TransactionForm } from './TransactionForm';
import type { Gap } from '../lib/ledger';
import { LimitCard, type Budget } from './LimitCard';
import { CategoryCard } from './CategoryCard';

interface Props {
  period: Period;
  txs: Transaction[];
  prevTxs: Transaction[];
  transfers: Map<string, string | null>;
  gaps: Gap<Transaction>[];
  budget: Budget | null;
  onChange: () => void;
}

const DISMISSED_KEY = 'gaps.dismissed';

function loadDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
  } catch {
    return [];
  }
}

/** "▲ 12% so với kỳ trước" or null when there is nothing to compare against. */
function compare(now: number, before: number): string | null {
  if (before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return 'bằng kỳ trước';
  return `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% so với kỳ trước`;
}

export function Dashboard({ period, txs: all, prevTxs, transfers, gaps, budget, onChange }: Props) {
  const [detail, setDetail] = useState<Transaction | null>(null);
  // Own transfers are moves, not income or spending.
  const txs = all.filter((t) => !transfers.has(t.id));
  const transferCount = all.length - txs.length;
  const s = periodStats(txs, period);
  const prev = totals(prevTxs.filter((t) => !transfers.has(t.id)));
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
        {transferCount > 0 && <p className="hero-note">Không tính {transferCount} khoản chuyển giữa các tài khoản của bạn</p>}
      </section>

      {budget && <LimitCard budget={budget} />}

      <GapCard gaps={gaps} onChange={onChange} />

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
          <Suspense fallback={<div className="chart-placeholder" />}>
            <FlowChart buckets={s.buckets} monthly={s.monthly} />
          </Suspense>
        </section>
      )}

      {txs.length > 0 && <CategoryCard txs={txs} onPick={setDetail} />}

      {txs.length > 0 && (
        <div className="top-grid">
          <TopList title="Khoản nhận" kind="in" items={s.topIn} onPick={setDetail} />
          <TopList title="Khoản chi" kind="out" items={s.topOut} onPick={setDetail} />
        </div>
      )}

      {detail && (
        <TxDetail
          tx={detail}
          transfers={transfers}
          onClose={() => setDetail(null)}
          onEdited={onChange}
          onChanged={() => {
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
                <span className="ellipsis">{txTitle(t)}</span>
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

const when = (iso: string) => `${timeLabel(iso)} ${shortDay(dayKey(iso), false)}`;

/** Balance mismatches: SMS that never reached the app. Fill them by hand or dismiss them on this phone. */
function GapCard({ gaps, onChange }: { gaps: Gap<Transaction>[]; onChange: () => void }) {
  const [dismissed, setDismissed] = useState(loadDismissed);
  const [filling, setFilling] = useState<string | null>(null);
  const open = gaps.filter((g) => !dismissed.includes(g.id));
  if (open.length === 0) return null;

  function dismiss(id: string) {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      // Private mode: dismissal lasts until reload.
    }
  }

  return (
    <section className="card gap-card">
      <h2>Có thể thiếu giao dịch</h2>
      <p className="muted small">Số dư trong SMS không khớp, nghĩa là có giao dịch chưa vào app. Đối chiếu với app ngân hàng rồi thêm vào.</p>
      <ul className="gap-list">
        {open.map((g) => (
          <li key={g.id}>
            <div className="gap-row">
              <span className="gap-text">
                <strong className="ellipsis">
                  {sourceLabel({ source: 'sms', bank: g.bank })} {g.account}
                </strong>
                <small className="muted">
                  Từ {when(g.after)} đến {when(g.next.occurred_at)}
                </small>
              </span>
              <span className={`num amount ${g.amount > 0 ? 'in' : 'out'}`}>
                {g.amount > 0 ? '+' : '−'}
                {formatVnd(Math.abs(g.amount))}
              </span>
            </div>
            {filling === g.id ? (
              <TransactionForm
                preset={{
                  amount: g.amount,
                  // Just before the SMS that revealed the gap, so it lands inside it.
                  when: new Date(Date.parse(g.next.occurred_at) - 60_000).toISOString(),
                  description: 'Giao dịch không có SMS',
                  bank: g.bank,
                  account: g.account,
                }}
                onDone={(saved) => {
                  setFilling(null);
                  if (saved) onChange();
                }}
              />
            ) : (
              <div className="gap-actions">
                <button className="link" onClick={() => dismiss(g.id)}>
                  Bỏ qua
                </button>
                <button className="primary small-btn" onClick={() => setFilling(g.id)}>
                  Thêm giao dịch này
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
