import type { Transaction } from './supabase';
import { addDays, dayKey, daysBetween, shortDay } from './format';
import type { Period } from './period';

export interface Bucket {
  key: string; // "YYYY-MM-DD", or "YYYY-MM" when monthly
  label: string;
  income: number;
  spent: number; // positive number
}

export interface PeriodStats {
  income: number;
  spent: number;
  incomeCount: number;
  spentCount: number;
  monthly: boolean;
  buckets: Bucket[];
  topIn: Transaction[];
  topOut: Transaction[];
}

export function totals(txs: Transaction[]) {
  let income = 0;
  let spent = 0;
  for (const t of txs) {
    if (t.amount > 0) income += t.amount;
    else spent -= t.amount;
  }
  return { income, spent };
}

/** Daily buckets up to ~2 months, monthly beyond that so the chart stays readable. */
export function periodStats(txs: Transaction[], period: Period): PeriodStats {
  const monthly = daysBetween(period.from, period.to) > 62;
  const keyOf = (day: string) => (monthly ? day.slice(0, 7) : day);

  const buckets = new Map<string, Bucket>();
  if (monthly) {
    for (let m = period.from.slice(0, 7); m <= period.to.slice(0, 7); m = addDays(`${m}-28`, 7).slice(0, 7)) {
      buckets.set(m, { key: m, label: `T${Number(m.slice(5))}/${m.slice(2, 4)}`, income: 0, spent: 0 });
    }
  } else {
    for (let d = period.from; d <= period.to; d = addDays(d, 1)) {
      buckets.set(d, { key: d, label: shortDay(d, false), income: 0, spent: 0 });
    }
  }

  for (const t of txs) {
    const b = buckets.get(keyOf(dayKey(t.occurred_at)));
    if (!b) continue;
    if (t.amount > 0) b.income += t.amount;
    else b.spent -= t.amount;
  }

  const ins = txs.filter((t) => t.amount > 0);
  const outs = txs.filter((t) => t.amount < 0);
  return {
    ...totals(txs),
    incomeCount: ins.length,
    spentCount: outs.length,
    monthly,
    buckets: [...buckets.values()],
    topIn: [...ins].sort((a, b) => b.amount - a.amount).slice(0, 5),
    topOut: [...outs].sort((a, b) => a.amount - b.amount).slice(0, 5),
  };
}
