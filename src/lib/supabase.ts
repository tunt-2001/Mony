import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey);

// Placeholder values keep the client constructible so the app can render a setup hint.
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing');

export interface Transaction {
  id: string;
  occurred_at: string;
  amount: number;
  balance: number | null;
  bank: string;
  account: string | null;
  description: string;
  category: string;
  source: 'sms' | 'manual';
  raw_message_id: string | null;
  /** Own-account transfer override: null = detect automatically. */
  transfer: boolean | null;
  /** The user's own words for it; shown instead of the SMS description when set. */
  note: string | null;
}

export interface RawMessage {
  id: string;
  sender: string | null;
  body: string;
  received_at: string;
  status: string;
}
