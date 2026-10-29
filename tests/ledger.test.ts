import { describe, expect, it } from 'vitest';
import { findGaps, findTransfers } from '../src/lib/ledger';
import type { Transaction } from '../src/lib/supabase';

let n = 0;
function tx(p: Partial<Transaction> & { amount: number; occurred_at: string }): Transaction {
  return {
    id: `t${++n}`,
    balance: null,
    bank: 'BIDV',
    account: '1201xxx789',
    description: '',
    category: 'Khác',
    source: 'sms',
    raw_message_id: null,
    transfer: null,
    ...p,
  };
}

describe('findTransfers', () => {
  it('pairs an out and an in of the same amount on two own accounts', () => {
    const out = tx({ amount: -5_000_000, occurred_at: '2026-10-28T02:00:00Z' });
    const inn = tx({ amount: 5_000_000, occurred_at: '2026-10-28T02:01:00Z', bank: 'TCB', account: '1903xxx123' });
    const other = tx({ amount: -5_000_000, occurred_at: '2026-10-28T09:00:00Z' });
    const m = findTransfers([out, inn, other]);
    expect(m.get(out.id)).toBe(inn.id);
    expect(m.get(inn.id)).toBe(out.id);
    expect(m.has(other.id)).toBe(false);
  });

  it('ignores same-account pairs, far-apart pairs and user overrides', () => {
    const a = tx({ amount: -100_000, occurred_at: '2026-10-28T02:00:00Z' });
    const b = tx({ amount: 100_000, occurred_at: '2026-10-28T02:01:00Z' }); // same account: a refund, not a transfer
    const c = tx({ amount: 100_000, occurred_at: '2026-10-28T03:00:00Z', bank: 'TCB', account: '1903xxx123' });
    const d = tx({ amount: -200_000, occurred_at: '2026-10-28T04:00:00Z', transfer: false });
    const e = tx({ amount: 200_000, occurred_at: '2026-10-28T04:00:30Z', bank: 'TCB', account: '1903xxx123' });
    const f = tx({ amount: -70_000, occurred_at: '2026-10-28T05:00:00Z', transfer: true });
    const m = findTransfers([a, b, c, d, e, f]);
    expect([...m.keys()]).toEqual([f.id]);
  });
});

describe('findGaps', () => {
  it('finds nothing when balances chain up, even with equal timestamps', () => {
    const at = '2026-10-28T02:00:00Z';
    const txs = [
      tx({ amount: -50_000, balance: 950_000, occurred_at: '2026-10-28T01:00:00Z' }),
      // Same minute, listed in the "wrong" order.
      tx({ amount: -20_000, balance: 880_000, occurred_at: at }),
      tx({ amount: -50_000, balance: 900_000, occurred_at: at }),
    ];
    expect(findGaps(txs)).toEqual([]);
  });

  it('reports the missing net amount between two SMS', () => {
    const a = tx({ amount: -50_000, balance: 950_000, occurred_at: '2026-10-28T01:00:00Z' });
    const b = tx({ amount: -20_000, balance: 610_000, occurred_at: '2026-10-28T05:00:00Z' });
    const gaps = findGaps([b, a]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ amount: -320_000, after: a.occurred_at, account: '1201xxx789' });
    expect(gaps[0].next.id).toBe(b.id);
  });

  it('is closed by a hand-entered transaction on the same account', () => {
    const a = tx({ amount: -50_000, balance: 950_000, occurred_at: '2026-10-28T01:00:00Z' });
    const fill = tx({ amount: -320_000, occurred_at: '2026-10-28T03:00:00Z', source: 'manual' });
    const b = tx({ amount: -20_000, balance: 610_000, occurred_at: '2026-10-28T05:00:00Z' });
    expect(findGaps([a, fill, b])).toEqual([]);
  });

  it('keeps accounts apart', () => {
    const a = tx({ amount: -50_000, balance: 950_000, occurred_at: '2026-10-28T01:00:00Z' });
    const b = tx({ amount: -20_000, balance: 4_980_000, occurred_at: '2026-10-28T02:00:00Z', bank: 'TCB', account: '1903xxx123' });
    expect(findGaps([a, b])).toEqual([]);
  });
});
