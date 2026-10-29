import { addDays, daysBetween, shortDay, todayKey } from './format';

export type Preset = 'today' | '7d' | '30d' | 'month' | 'lastMonth' | 'year' | 'custom';

/** Inclusive day range in Vietnam time, as "YYYY-MM-DD". */
export interface Period {
  preset: Preset;
  from: string;
  to: string;
}

export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'Hôm nay' },
  { id: '7d', label: '7 ngày' },
  { id: '30d', label: '30 ngày' },
  { id: 'month', label: 'Tháng này' },
  { id: 'lastMonth', label: 'Tháng trước' },
  { id: 'year', label: 'Năm nay' },
  { id: 'custom', label: 'Tùy chọn' },
];

export function presetPeriod(preset: Exclude<Preset, 'custom'>): Period {
  const today = todayKey();
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (preset) {
    case 'today':
      return { preset, from: today, to: today };
    case '7d':
      return { preset, from: addDays(today, -6), to: today };
    case '30d':
      return { preset, from: addDays(today, -29), to: today };
    case 'month':
      return { preset, from: monthStart, to: today };
    case 'lastMonth': {
      const end = addDays(monthStart, -1);
      return { preset, from: `${end.slice(0, 7)}-01`, to: end };
    }
    case 'year':
      return { preset, from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

/** [start, end) as ISO timestamps for querying. */
export function periodRange(p: { from: string; to: string }): [string, string] {
  return [
    new Date(`${p.from}T00:00:00+07:00`).toISOString(),
    new Date(`${addDays(p.to, 1)}T00:00:00+07:00`).toISOString(),
  ];
}

/** The same number of days immediately before, for "so với kỳ trước". */
export function previousPeriod(p: Period): { from: string; to: string } {
  const len = daysBetween(p.from, p.to);
  return { from: addDays(p.from, -len), to: addDays(p.from, -1) };
}

export function periodLabel(p: Period): string {
  if (p.from === p.to) return shortDay(p.from);
  const sameYear = p.from.slice(0, 4) === p.to.slice(0, 4);
  return `${shortDay(p.from, !sameYear)} – ${shortDay(p.to)}`;
}
