import { describe, expect, it } from 'vitest';
import { alertsFor, vnMonthStart, weeklySummary, type AlertSettings } from '../supabase/functions/_shared/alerts.ts';

let n = 0;
const tx = (p: { amount: number; occurred_at: string; balance?: number | null; bank?: string; account?: string }) => ({
  id: `t${++n}`,
  balance: null,
  bank: 'BIDV',
  account: '1201xxx789',
  transfer: null,
  description: 'Mua sắm',
  ...p,
});

const settings: AlertSettings = { monthly_limit: 10_000_000, notify_limit: true, big_spend_threshold: 2_000_000, notify_gaps: true };
const now = new Date('2026-10-29T05:00:00Z');

describe('alertsFor', () => {
  it('warns once when spending crosses 80% of the limit', () => {
    const earlier = tx({ amount: -7_500_000, occurred_at: '2026-10-10T05:00:00Z' });
    const cur = tx({ amount: -600_000, occurred_at: '2026-10-29T04:59:00Z' });
    const alerts = alertsFor(cur, [earlier, cur], settings, now);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ title: 'Đã chi 81% hạn mức tháng 10', tag: 'limit-2026-10' });

    const next = tx({ amount: -100_000, occurred_at: '2026-10-29T04:59:30Z' });
    expect(alertsFor(next, [earlier, cur, next], settings, now)).toEqual([]);
  });

  it('reports crossing 100% (and not 80%) when one payment jumps past both', () => {
    const earlier = tx({ amount: -7_000_000, occurred_at: '2026-10-10T05:00:00Z' });
    const cur = tx({ amount: -1_500_000, occurred_at: '2026-10-29T04:00:00Z' });
    const big = tx({ amount: -3_500_000, occurred_at: '2026-10-29T04:30:00Z' });
    const titles = alertsFor(big, [earlier, cur, big], settings, now).map((a) => a.title);
    expect(titles).toEqual(['Khoản chi lớn: 3.500.000 ₫', 'Đã vượt hạn mức chi tháng 10']);
  });

  it('stays silent without a limit, for last month, and for own transfers', () => {
    const noLimit = { ...settings, monthly_limit: null, big_spend_threshold: null };
    const cur = tx({ amount: -9_000_000, occurred_at: '2026-10-29T04:00:00Z' });
    expect(alertsFor(cur, [cur], noLimit, now)).toEqual([]);

    const old = tx({ amount: -9_000_000, occurred_at: '2026-09-29T04:00:00Z' });
    expect(alertsFor(old, [old], { ...settings, big_spend_threshold: null }, now)).toEqual([]);

    const out = tx({ amount: -9_000_000, occurred_at: '2026-10-29T04:00:00Z' });
    const inn = tx({ amount: 9_000_000, occurred_at: '2026-10-29T04:01:00Z', bank: 'TCB', account: '1903xxx123' });
    expect(alertsFor(out, [out, inn], settings, now)).toEqual([]);
  });

  it('flags a balance gap revealed by this SMS', () => {
    const a = tx({ amount: -50_000, balance: 950_000, occurred_at: '2026-10-28T01:00:00Z' });
    const b = tx({ amount: -20_000, balance: 610_000, occurred_at: '2026-10-29T04:00:00Z' });
    const alerts = alertsFor(b, [a, b], { ...settings, notify_limit: false }, now);
    expect(alerts.map((x) => x.body)).toEqual(['BIDV 1201xxx789: −320.000 ₫ chưa có SMS. Mở app để thêm.']);
  });
});

describe('vnMonthStart', () => {
  it('uses the Vietnam calendar', () => {
    expect(vnMonthStart(new Date('2026-10-31T18:00:00Z'))).toBe('2026-10-31T17:00:00.000Z');
  });
});

describe('weeklySummary', () => {
  it('sums the last 7 days without transfers and adds the limit progress', () => {
    const sunday = new Date('2026-11-01T13:00:00Z');
    const txs = [
      tx({ amount: -1_200_000, occurred_at: '2026-10-28T03:00:00Z' }),
      tx({ amount: 15_000_000, occurred_at: '2026-10-30T03:00:00Z', bank: 'TCB', account: '1903xxx123' }),
      tx({ amount: -500_000, occurred_at: '2026-10-20T03:00:00Z' }), // older than a week
      tx({ amount: -3_000_000, occurred_at: '2026-11-01T02:00:00Z' }), // transfer out…
      tx({ amount: 3_000_000, occurred_at: '2026-11-01T02:01:00Z', bank: 'TCB', account: '1903xxx123' }), // …and in
      tx({ amount: -2_000_000, occurred_at: '2026-11-01T05:00:00Z' }),
    ];
    expect(weeklySummary(txs, { monthly_limit: 10_000_000 }, sunday)).toEqual({
      title: 'Tóm tắt tuần 25/10 – 01/11',
      body: 'Chi 3.200.000 ₫ · Nhận 15.000.000 ₫ · Tháng 11 đã chi 20% hạn mức',
      tag: 'weekly',
    });
  });
});
