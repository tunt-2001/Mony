// Which push notifications a newly recorded transaction should trigger. Pure, so it is unit-tested.
import { findGaps, findTransfers, type LedgerTx } from './ledger.ts';

export interface AlertSettings {
  monthly_limit: number | null; // null = no limit, so no limit alerts
  notify_limit: boolean;
  big_spend_threshold: number | null; // null = off
  notify_gaps: boolean;
}

export interface PushMessage {
  title: string;
  body: string;
  tag: string; // same tag replaces an older notification instead of stacking
}

const TZ = 'Asia/Ho_Chi_Minh';
/** Limit alerts fire once when spending first crosses each of these shares of the limit. */
export const LIMIT_LEVELS = [1, 0.8];

export const vnd = (n: number) => `${new Intl.NumberFormat('vi-VN').format(Math.abs(n))} ₫`;
const signed = (n: number) => `${n > 0 ? '+' : '−'}${vnd(n)}`;
const BANK_NAMES: Record<string, string> = { BIDV: 'BIDV', TCB: 'Techcombank', VIETTELPAY: 'Viettel Money' };
const bankName = (bank: string) => BANK_NAMES[bank] ?? bank;

/** "YYYY-MM" of an instant in Vietnam time. */
export const vnMonth = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(new Date(iso)).slice(0, 7);

/** Start of the Vietnam calendar month containing `now`, as an ISO instant. */
export const vnMonthStart = (now: Date) => new Date(`${vnMonth(now.toISOString())}-01T00:00:00+07:00`).toISOString();

/** Money spent in a month, own transfers excluded (positive number). */
export function monthSpent(txs: LedgerTx[], month: string, transfers = findTransfers(txs)): number {
  let spent = 0;
  for (const t of txs) if (t.amount < 0 && !transfers.has(t.id) && vnMonth(t.occurred_at) === month) spent -= t.amount;
  return spent;
}

/**
 * `txs` holds the user's recent history (at least this month and a few days before), including `tx` itself.
 * Called a minute after the SMS arrived, so the other half of a transfer has usually arrived too.
 */
export function alertsFor<T extends LedgerTx & { description: string }>(
  tx: T,
  txs: T[],
  settings: AlertSettings,
  now: Date,
): PushMessage[] {
  const out: PushMessage[] = [];
  const transfers = findTransfers(txs);
  const isSpending = tx.amount < 0 && !transfers.has(tx.id);

  if (isSpending && settings.big_spend_threshold && -tx.amount >= settings.big_spend_threshold) {
    out.push({
      title: `Khoản chi lớn: ${vnd(tx.amount)}`,
      body: [bankName(tx.bank), tx.description].filter(Boolean).join(' · '),
      tag: `big-${tx.id}`,
    });
  }

  const month = vnMonth(now.toISOString());
  const limit = settings.monthly_limit;
  if (isSpending && limit && settings.notify_limit && vnMonth(tx.occurred_at) === month) {
    const after = monthSpent(txs, month, transfers);
    const before = after + tx.amount;
    const level = LIMIT_LEVELS.find((l) => before < limit * l && after >= limit * l);
    if (level) {
      const pct = Math.round((after / limit) * 100);
      out.push({
        title: level >= 1 ? `Đã vượt hạn mức chi tháng ${Number(month.slice(5))}` : `Đã chi ${pct}% hạn mức tháng ${Number(month.slice(5))}`,
        body: `Đã chi ${vnd(after)} / ${vnd(limit)}${after < limit ? ` · còn ${vnd(limit - after)}` : ''}`,
        tag: `limit-${month}`,
      });
    }
  }

  if (settings.notify_gaps) {
    for (const g of findGaps(txs)) {
      if (g.next.id !== tx.id) continue;
      out.push({
        title: 'Có thể thiếu giao dịch',
        body: `${bankName(g.bank)} ${g.account}: ${signed(g.amount)} chưa có SMS. Mở app để thêm.`,
        tag: `gap-${g.id}`,
      });
    }
  }
  return out;
}

/** Sunday-evening recap of the last 7 days, plus the month's progress when a limit is set. */
export function weeklySummary(txs: LedgerTx[], settings: Pick<AlertSettings, 'monthly_limit'>, now: Date): PushMessage {
  const transfers = findTransfers(txs);
  const from = now.getTime() - 7 * 24 * 3600_000;
  let income = 0;
  let spent = 0;
  for (const t of txs) {
    const at = Date.parse(t.occurred_at);
    if (at < from || at > now.getTime() || transfers.has(t.id)) continue;
    if (t.amount > 0) income += t.amount;
    else spent -= t.amount;
  }
  // Built by hand: ICU versions disagree on the separator vi-VN uses for day/month.
  const day = (ms: number) => {
    const [, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ms)).split('-');
    return `${d}/${m}`;
  };
  const parts = [`Chi ${vnd(spent)}`, `Nhận ${vnd(income)}`];
  const limit = settings.monthly_limit;
  if (limit) {
    const month = vnMonth(now.toISOString());
    const pct = Math.round((monthSpent(txs, month, transfers) / limit) * 100);
    parts.push(`Tháng ${Number(month.slice(5))} đã chi ${pct}% hạn mức`);
  }
  return {
    title: `Tóm tắt tuần ${day(from + 3600_000)} – ${day(now.getTime())}`,
    body: parts.join(' · '),
    tag: 'weekly',
  };
}
