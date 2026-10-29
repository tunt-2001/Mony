export const TZ = 'Asia/Ho_Chi_Minh';

const vnd = new Intl.NumberFormat('vi-VN');

/** 1234567 -> "1.234.567 ₫" */
export const formatVnd = (n: number) => `${vnd.format(n)} ₫`;

/** 1234567 -> "1.234.567" (columns whose header already says ₫). */
export const formatNumber = (n: number) => vnd.format(n);

/** 1234567 -> "1,2tr", 45000 -> "45k" (chart axes). */
export function formatShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}tr`;
  if (a >= 1_000) return `${(n / 1_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}k`;
  return String(n);
}

const BANK_NAMES: Record<string, string> = {
  BIDV: 'BIDV',
  TCB: 'Techcombank',
  VIETTELPAY: 'Viettel Money',
};

/** "Techcombank", "Viettel Money", plain "SMS" when the sender was not recognised, or "Nhập tay". */
export function sourceLabel(t: { source: string; bank: string }): string {
  if (t.source !== 'sms') return 'Nhập tay';
  return BANK_NAMES[t.bank] ?? 'SMS';
}

/** What a list shows for a transaction: the user's note if any, else the SMS description. */
export function txTitle(t: { note?: string | null; description: string }): string {
  return t.note?.trim() || t.description || '(không có nội dung)';
}

/** "YYYY-MM-DD" of a timestamp in Vietnam time. */
export function dayKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  );
}

export const todayKey = () => dayKey(new Date().toISOString());

/** Day arithmetic on "YYYY-MM-DD" strings. */
export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/** "2026-10-29" -> "29/10/2026"; withYear=false -> "29/10" */
export function shortDay(day: string, withYear = true): string {
  const [y, m, d] = day.split('-');
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}

export function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00+07:00`);
  return new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit' }).format(d);
}

export const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** Value for <input type="datetime-local"> in Vietnam time. */
export function toLocalInput(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export const fromLocalInput = (value: string) => new Date(`${value}:00+07:00`).toISOString();
