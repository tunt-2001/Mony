import { stripAccents } from './smsParser.ts';

export const TRANSFER_CATEGORY = 'Chuyển nội bộ';

export const EXPENSE_CATEGORIES = [
  'Ăn uống',
  'Đi chợ & Siêu thị',
  'Di chuyển',
  'Mua sắm',
  'Hóa đơn & Tiện ích',
  'Nhà ở',
  'Sức khỏe',
  'Giải trí',
  'Giáo dục',
  'Gia đình',
  'Ví điện tử',
  'Chuyển tiền',
  'Khác',
] as const;

export const INCOME_CATEGORIES = ['Lương', 'Thưởng', 'Hoàn tiền', 'Được chuyển tiền', 'Thu nhập khác'] as const;

/** Where a transaction lands when no rule matches; shown as "Khác" in the picker. */
export const fallbackCategory = (amount: number) => (amount > 0 ? 'Thu nhập khác' : 'Khác');

/** Every category, including the internal-transfer one that statistics ignore. */
export const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, TRANSFER_CATEGORY];

export interface Rule {
  pattern: string;
  category: string;
}

// Matched as whole words against the accent-free, lowercased description.
export const DEFAULT_RULES: Rule[] = [
  { pattern: 'grab', category: 'Di chuyển' },
  { pattern: 'xanh sm', category: 'Di chuyển' },
  { pattern: 'gsm', category: 'Di chuyển' },
  { pattern: 'vetc', category: 'Di chuyển' },
  { pattern: 'petrolimex', category: 'Di chuyển' },
  { pattern: 'shopee', category: 'Mua sắm' },
  { pattern: 'lazada', category: 'Mua sắm' },
  { pattern: 'tiki', category: 'Mua sắm' },
  { pattern: 'tiktok shop', category: 'Mua sắm' },
  { pattern: 'highlands', category: 'Ăn uống' },
  { pattern: 'phuc long', category: 'Ăn uống' },
  { pattern: 'starbucks', category: 'Ăn uống' },
  { pattern: 'katinat', category: 'Ăn uống' },
  { pattern: 'kfc', category: 'Ăn uống' },
  { pattern: 'lotteria', category: 'Ăn uống' },
  { pattern: 'shopeefood', category: 'Ăn uống' },
  { pattern: 'winmart', category: 'Đi chợ & Siêu thị' },
  { pattern: 'bach hoa xanh', category: 'Đi chợ & Siêu thị' },
  { pattern: 'co.opmart', category: 'Đi chợ & Siêu thị' },
  { pattern: 'coopmart', category: 'Đi chợ & Siêu thị' },
  { pattern: 'circle k', category: 'Đi chợ & Siêu thị' },
  { pattern: 'aeon', category: 'Đi chợ & Siêu thị' },
  { pattern: 'go!', category: 'Đi chợ & Siêu thị' },
  { pattern: 'evn', category: 'Hóa đơn & Tiện ích' },
  { pattern: 'tien dien', category: 'Hóa đơn & Tiện ích' },
  { pattern: 'tien nuoc', category: 'Hóa đơn & Tiện ích' },
  { pattern: 'viettel', category: 'Hóa đơn & Tiện ích' },
  { pattern: 'vnpt', category: 'Hóa đơn & Tiện ích' },
  { pattern: 'fpt telecom', category: 'Hóa đơn & Tiện ích' },
  { pattern: 'mobifone', category: 'Hóa đơn & Tiện ích' },
  { pattern: 'vinaphone', category: 'Hóa đơn & Tiện ích' },
  { pattern: 'tien nha', category: 'Nhà ở' },
  { pattern: 'pharmacity', category: 'Sức khỏe' },
  { pattern: 'long chau', category: 'Sức khỏe' },
  { pattern: 'netflix', category: 'Giải trí' },
  { pattern: 'spotify', category: 'Giải trí' },
  { pattern: 'cgv', category: 'Giải trí' },
  { pattern: 'momo', category: 'Ví điện tử' },
  { pattern: 'zalopay', category: 'Ví điện tử' },
  { pattern: 'luong', category: 'Lương' },
  { pattern: 'salary', category: 'Lương' },
];

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function matches(normalized: string, pattern: string): boolean {
  const p = stripAccents(pattern).toLowerCase().trim();
  if (!p) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(p)}($|[^a-z0-9])`).test(normalized);
}

/**
 * User rules win over defaults; within each set the longest pattern wins so
 * "shopeefood" beats "shopee". Income rules only apply to money in and vice versa,
 * except the internal-transfer category which applies both ways.
 */
export function categorize(description: string, amount: number, userRules: Rule[] = []): string {
  const normalized = stripAccents(description).toLowerCase();
  const isIncome = amount > 0;
  const fits = (category: string) =>
    category === TRANSFER_CATEGORY ||
    (INCOME_CATEGORIES as readonly string[]).includes(category) === isIncome;

  for (const rules of [userRules, DEFAULT_RULES]) {
    const hit = [...rules]
      .sort((a, b) => b.pattern.length - a.pattern.length)
      .find((r) => fits(r.category) && matches(normalized, r.pattern));
    if (hit) return hit.category;
  }
  return fallbackCategory(amount);
}
