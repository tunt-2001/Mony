import { supabase } from './supabase';
import { isPushEnabled } from './push';

/** One row per user in public.user_settings; defaults apply until the first save. */
export interface UserSettings {
  monthly_limit: number | null;
  notify_limit: boolean;
  big_spend_threshold: number | null;
  notify_gaps: boolean;
  notify_weekly: boolean;
  notify_monthly: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  monthly_limit: null,
  notify_limit: true,
  big_spend_threshold: null,
  notify_gaps: true,
  notify_weekly: false,
  notify_monthly: true,
};

export async function loadSettings(): Promise<UserSettings> {
  const { data } = await supabase
    .from('user_settings')
    .select('monthly_limit, notify_limit, big_spend_threshold, notify_gaps, notify_weekly, notify_monthly')
    .maybeSingle();
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) };
}

export async function saveSettings(s: UserSettings): Promise<string | null> {
  // getSession reads the stored session; getUser would be another round trip to the server.
  const { data } = await supabase.auth.getSession();
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: data.session?.user.id, ...s, updated_at: new Date().toISOString() });
  return error ? error.message : null;
}

/** A phone allowed to forward this member's SMS (public.ingest_tokens, without the hash). */
export interface Device {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
}

export async function loadDevices(): Promise<Device[]> {
  const { data } = await supabase
    .from('ingest_tokens')
    .select('id, label, created_at, last_used_at')
    .order('created_at', { ascending: false });
  return (data ?? []) as Device[];
}

/** Everything the Settings sheet shows, fetched in parallel. */
export interface SettingsData {
  email: string;
  prefs: UserSettings;
  devices: Device[];
  pushOn: boolean;
}

export async function loadSettingsData(): Promise<SettingsData> {
  const [{ data }, prefs, devices, pushOn] = await Promise.all([
    supabase.auth.getSession(),
    loadSettings(),
    loadDevices(),
    isPushEnabled().catch(() => false),
  ]);
  return { email: data.session?.user.email ?? '', prefs, devices, pushOn };
}
