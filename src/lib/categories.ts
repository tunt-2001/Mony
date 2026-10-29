import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  TRANSFER_CATEGORY,
  fallbackCategory,
} from '../../supabase/functions/_shared/categorize.ts';
import { supabase } from './supabase';

export { fallbackCategory };

/** Built-in choices for money out / money in, without the fallback (that one is the "Khác" chip). */
export function baseCategories(amount: number): string[] {
  const list: readonly string[] = amount > 0 ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return list.filter((c) => c !== fallbackCategory(amount));
}

const isBuiltIn = (c: string) =>
  c === TRANSFER_CATEGORY ||
  (EXPENSE_CATEGORIES as readonly string[]).includes(c) ||
  (INCOME_CATEGORIES as readonly string[]).includes(c);

let customCache: Promise<{ out: string[]; in: string[] }> | null = null;

/** Names the user typed under "Khác" before, so they can be picked again instead of retyped. */
export function customCategories(): Promise<{ out: string[]; in: string[] }> {
  customCache ??= (async () => {
    const { data } = await supabase.from('transactions').select('category, amount');
    const out = new Set<string>();
    const inc = new Set<string>();
    for (const t of data ?? []) if (!isBuiltIn(t.category)) (t.amount > 0 ? inc : out).add(t.category);
    const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, 'vi'));
    return { out: sort(out), in: sort(inc) };
  })();
  return customCache;
}

/** After saving a new custom name, so the next picker lists it. */
export function forgetCustomCategories() {
  customCache = null;
}
