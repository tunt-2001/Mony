// Shared by the web app and the Edge Functions (no imports: Deno and Vite both load it as is).

/** The fields of a transaction row this module needs. */
export interface LedgerTx {
  id: string;
  occurred_at: string;
  amount: number;
  balance: number | null;
  bank: string;
  account: string | null;
  transfer: boolean | null;
}

/** Own transfers: an outgoing and an incoming SMS this close together can be one move between accounts. */
export const TRANSFER_WINDOW_MS = 15 * 60_000;

/** Same bank + account = one balance chain. Transactions without an account belong to none. */
export const chainKey = (t: LedgerTx) => (t.account ? `${t.bank}|${t.account}` : null);

/**
 * Transfers between the user's own accounts, mapped to their other half (null when marked by hand).
 * They are excluded from income/spending, otherwise one move would count as both.
 */
export function findTransfers(txs: LedgerTx[]): Map<string, string | null> {
  const result = new Map<string, string | null>();
  for (const t of txs) if (t.transfer === true) result.set(t.id, null);

  const open = (t: LedgerTx) => t.transfer == null && chainKey(t) !== null;
  const byTime = [...txs].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  const ins = byTime.filter((t) => t.amount > 0 && open(t));
  const used = new Set<string>();

  for (const out of byTime) {
    if (out.amount >= 0 || !open(out)) continue;
    const at = Date.parse(out.occurred_at);
    let best: LedgerTx | null = null;
    let bestGap = Infinity;
    for (const t of ins) {
      if (used.has(t.id) || t.amount !== -out.amount || chainKey(t) === chainKey(out)) continue;
      const gap = Math.abs(Date.parse(t.occurred_at) - at);
      if (gap <= TRANSFER_WINDOW_MS && gap < bestGap) {
        best = t;
        bestGap = gap;
      }
    }
    if (best) {
      used.add(best.id);
      result.set(out.id, best.id);
      result.set(best.id, out.id);
    }
  }
  return result;
}

export interface Gap<T extends LedgerTx = LedgerTx> {
  id: string;
  bank: string;
  account: string;
  /** Net amount that never arrived as SMS: positive = money in, negative = money out. */
  amount: number;
  /** The missing transaction(s) happened after this instant (null at the start of the data)… */
  after: string;
  /** …and before this transaction, whose balance gave it away. */
  next: T;
}

/** Orders a chain by time; for equal timestamps, follows the balances so "same minute" SMS don't look like gaps. */
function orderChain<T extends LedgerTx>(chain: T[]): T[] {
  const rest = [...chain].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  const ordered: T[] = [];
  let expected: number | null = null;
  while (rest.length) {
    const at = Date.parse(rest[0].occurred_at);
    let i = rest.findIndex(
      (t) => Date.parse(t.occurred_at) === at && t.balance !== null && expected !== null && t.balance - t.amount === expected,
    );
    if (i < 0) i = 0;
    const [t] = rest.splice(i, 1);
    ordered.push(t);
    expected = t.balance ?? (expected === null ? null : expected + t.amount);
  }
  return ordered;
}

/**
 * Every SMS states the balance after it, so balance(prev) + amount(next) must equal balance(next).
 * When it doesn't, some transaction on that account never reached the app.
 */
export function findGaps<T extends LedgerTx>(txs: T[]): Gap<T>[] {
  const chains = new Map<string, T[]>();
  for (const t of txs) {
    const key = chainKey(t);
    if (key) chains.set(key, [...(chains.get(key) ?? []), t]);
  }

  const gaps: Gap<T>[] = [];
  for (const chain of chains.values()) {
    let expected: number | null = null;
    let prev: T | null = null;
    for (const t of orderChain(chain)) {
      if (t.balance !== null) {
        const before = t.balance - t.amount;
        if (prev && expected !== null && before !== expected) {
          gaps.push({
            id: `${prev.id}>${t.id}`,
            bank: t.bank,
            account: t.account!,
            amount: before - expected,
            after: prev.occurred_at,
            next: t,
          });
        }
        expected = t.balance;
      } else if (expected !== null) {
        // Hand-entered transaction on this account (e.g. filling a gap): no balance, but it moves the chain.
        expected += t.amount;
      }
      prev = t;
    }
  }
  return gaps.sort((a, b) => Date.parse(b.next.occurred_at) - Date.parse(a.next.occurred_at));
}
