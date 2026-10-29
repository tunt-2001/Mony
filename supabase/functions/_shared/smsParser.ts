// Parses BIDV / Techcombank / Viettel Money balance-change SMS into a structured transaction.
// Pure TypeScript with no dependencies: shared by the Supabase Edge Function (Deno)
// and the web app's tests (Vitest).

export type Bank = 'BIDV' | 'TCB' | 'VIETTELPAY' | 'UNKNOWN';

export interface ParsedSms {
  bank: Bank;
  account: string | null;
  /** Signed amount in VND: negative = money out, positive = money in. */
  amount: number;
  /** Balance after the transaction, if the SMS includes it. */
  balance: number | null;
  /** ISO timestamp; falls back to receivedAt when the SMS has no date. */
  occurredAt: string;
  description: string;
}

const VN_OFFSET = '+07:00';

/** Lowercase-insensitive, accent-free copy: "Số dư" -> "So du". */
export function stripAccents(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** "1,234,567" | "1.234.567" | "1,234,567.00" -> 1234567 */
export function parseVnd(raw: string): number {
  let s = raw.trim();
  // Drop a 2-digit decimal tail when another separator precedes it (e.g. 50,000.00).
  if (/[.,]\d{2}$/.test(s) && /[.,]/.test(s.slice(0, -3))) s = s.slice(0, -3);
  return Number(s.replace(/[.,\s]/g, ''));
}

function detectBank(text: string, sender?: string): Bank {
  const hay = `${sender ?? ''} ${text}`.toLowerCase();
  // "TK ViettelPay ..." names the wallet itself; a bank SMS may only mention
  // ViettelMoney in its content, so the banks are checked before the loose match.
  if (/\btk\s+viettel\s?(pay|money)/.test(hay)) return 'VIETTELPAY';
  if (hay.includes('techcombank') || /\btcb\b/.test(hay)) return 'TCB';
  if (hay.includes('bidv')) return 'BIDV';
  if (/viettel\s?(pay|money)/.test(hay)) return 'VIETTELPAY';
  return 'UNKNOWN';
}

const pad = (n: number) => String(n).padStart(2, '0');

function parseDate(text: string): string | null {
  // ISO-style "2026-10-29 10:04:09" (Viettel Money).
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (isoMatch) {
    const [, y, mo, d, h, mi, s] = isoMatch;
    const date = new Date(`${y}-${mo}-${d}T${pad(Number(h))}:${mi}:${s ?? '00'}${VN_OFFSET}`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const d = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!d) return null;
  const day = Number(d[1]);
  const month = Number(d[2]);
  let year = Number(d[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const t = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const h = t ? Number(t[1]) : 0;
  const mi = t ? Number(t[2]) : 0;
  const s = t?.[3] ? Number(t[3]) : 0;

  const iso = `${year}-${pad(month)}-${pad(day)}T${pad(h)}:${pad(mi)}:${pad(s)}${VN_OFFSET}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Amount next to a known label, e.g. "So tien GD:-65,000" or "PS: +1,000,000".
const LABELLED_AMOUNT = /(?:so tien gd|so tien|giao dich|\bgd|\bps)\s*:?\s*([+-])\s*(\d[\d.,]*)/i;
// Bare signed amount, e.g. "-150,000VND". Needs thousands separators or 4+ digits so dates don't match.
const BARE_AMOUNT = /(?:^|[\s:])([+-])\s?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d{4,})\s?(?:vnd|d\b)?/i;
const BALANCE = /(?:so du(?: cuoi)?|\bsd)\s*:?\s*(\d[\d.,]*)\s*(?:vnd)?/i;
// "TK 1903xxxx012" or "TK ViettelPay 9704...9946" (masked with x, * or dots).
const ACCOUNT = /\btk\s*:?\s*(?:viettel\s?(?:pay|money)\s+)?([0-9][0-9xX*.]{2,}[0-9xX*])/i;
const DESCRIPTION = /(?:\bnd|noi dung(?: gd)?)\s*:\s*([\s\S]+)$/i;
const DATE_TIME =
  /\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}(?::\d{2})?|(\d{1,2}:\d{2}(?::\d{2})?\s*)?\d{1,2}\/\d{1,2}\/\d{2,4}(\s*\d{1,2}:\d{2}(?::\d{2})?)?/;

/**
 * Returns null when no signed amount is found; the caller should queue the SMS
 * for manual review instead of dropping it.
 */
export function parseBankSms(body: string, sender?: string, receivedAt: Date = new Date()): ParsedSms | null {
  const text = stripAccents(body).replace(/\r/g, '');
  const flat = text.replace(/\s+/g, ' ').trim();

  const amountMatch = flat.match(LABELLED_AMOUNT) ?? flat.match(BARE_AMOUNT);
  if (!amountMatch) return null;
  const amount = parseVnd(amountMatch[2]) * (amountMatch[1] === '-' ? -1 : 1);
  if (!Number.isFinite(amount) || amount === 0) return null;

  const balanceMatch = flat.match(BALANCE);
  const accountMatch = flat.match(ACCOUNT);

  let description: string;
  const descMatch = text.match(DESCRIPTION);
  if (descMatch) {
    description = descMatch[1];
  } else {
    // No "ND:" label (common in Techcombank SMS): keep whatever is left after
    // removing the fields we already extracted.
    description = flat;
    for (const m of [amountMatch, balanceMatch, accountMatch, flat.match(DATE_TIME)]) {
      if (m) description = description.replace(m[0], ' ');
    }
    description = description.replace(/\b(techcombank|bidv|tai|vao|luc|thong bao)\b:?/gi, ' ');
  }
  description = description.replace(/\s+/g, ' ').replace(/^[\s.:;,-]+|[\s.:;,-]+$/g, '');

  return {
    bank: detectBank(flat, sender),
    account: accountMatch ? accountMatch[1] : null,
    amount,
    balance: balanceMatch ? parseVnd(balanceMatch[1]) : null,
    occurredAt: parseDate(flat) ?? receivedAt.toISOString(),
    description,
  };
}
