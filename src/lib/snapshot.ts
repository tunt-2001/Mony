import type { Transaction } from './supabase';
import type { SettingsData } from './userSettings';

/**
 * Last data shown, kept on this device so the next launch renders at once and refreshes in the background.
 * Convenience only: any failure (private mode, full storage) just means no instant start.
 */
export interface Snapshot {
  userId: string;
  range: string; // the period it was loaded for, "from|to"
  all: Transaction[];
  settings: SettingsData | null;
}

const KEY = 'snapshot.v1';

export function readSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

export function writeSnapshot(s: Snapshot) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Ignore: next launch simply waits for the network.
  }
}

/** On sign-out: the next person on this phone must not see the previous member's data. */
export function clearSnapshot() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}

/** The user id in the stored session, read synchronously (supabase-js keeps it under sb-<ref>-auth-token). */
export function storedUserId(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith('sb-') && k.endsWith('-auth-token')) return JSON.parse(localStorage.getItem(k)!)?.user?.id ?? null;
    }
  } catch {
    // Fall through.
  }
  return null;
}
