// Receives a bank SMS forwarded from a phone: an iOS Shortcuts automation or an
// Android MacroDroid macro.
//
//   POST /functions/v1/ingest-sms
//   x-ingest-token: <device token created in the app's Settings>
//   { "body": "<SMS text>", "sender": "BIDV", "receivedAt": "2026-10-29T08:15:00+07:00" }
//   or, with any non-JSON content type, the raw SMS text as the whole body.
//
// The token identifies the family member: only its SHA-256 is stored in
// public.ingest_tokens. Deploy with --no-verify-jwt: phones authenticate with
// x-ingest-token, not a Supabase JWT.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { parseBankSms } from '../_shared/smsParser.ts';
import { categorize, type Rule } from '../_shared/categorize.ts';
import { alertsFor, vnMonthStart, type AlertSettings } from '../_shared/alerts.ts';
import { pushToUser } from '../_shared/push.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

/**
 * Waits before deciding: the other half of an own-account transfer, or an SMS from the same minute,
 * usually arrives within this time and changes the answer (no "big spending" for a transfer, no false gap).
 */
const SETTLE_MS = 60_000;

async function notifyAfterSettle(db: SupabaseClient, userId: string, txId: string) {
  const [{ data: settings }, { count }] = await Promise.all([
    db.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
    db.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  if (!count) return; // No device wants notifications: skip the wait entirely.
  await new Promise((r) => setTimeout(r, SETTLE_MS));

  const now = new Date();
  // This month, plus a week before it so the balance chain and transfer pairs reach across the month start.
  const from = new Date(Date.parse(vnMonthStart(now)) - 7 * 24 * 3600_000).toISOString();
  const { data: txs } = await db
    .from('transactions')
    .select('id, occurred_at, amount, balance, bank, account, transfer, description')
    .eq('user_id', userId)
    .gte('occurred_at', from);
  const tx = txs?.find((t) => t.id === txId);
  if (!tx) return; // Deleted in the meantime, or older than the window.

  const prefs: AlertSettings = {
    monthly_limit: settings?.monthly_limit ?? null,
    notify_limit: settings?.notify_limit ?? true,
    big_spend_threshold: settings?.big_spend_threshold ?? null,
    notify_gaps: settings?.notify_gaps ?? true,
  };
  await pushToUser(db, userId, alertsFor(tx, txs!, prefs, now));
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface Payload {
  body?: unknown;
  sender?: unknown;
  receivedAt?: unknown;
}

/**
 * JSON from the iOS Shortcut; plain text from MacroDroid, whose JSON body would
 * break on the quotes and line breaks an SMS can contain.
 */
async function readPayload(req: Request): Promise<Payload | null> {
  const text = await req.text();
  const isJson = (req.headers.get('content-type') ?? '').includes('json') || text.trimStart().startsWith('{');
  if (!isJson) return { body: text };
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const token = (req.headers.get('x-ingest-token') ?? '').trim();
  if (!token) return json({ error: 'unauthorized' }, 401);

  // Service role bypasses RLS, so every query below sets user_id explicitly.
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: device } = await db
    .from('ingest_tokens')
    .select('id, user_id')
    .eq('token_hash', await sha256Hex(token))
    .maybeSingle();
  if (!device) return json({ error: 'unauthorized' }, 401);
  const userId: string = device.user_id;
  await db.from('ingest_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', device.id);

  const payload = await readPayload(req);
  if (!payload) return json({ error: 'invalid json' }, 400);
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (!body) return json({ error: 'missing body' }, 400);
  const sender = typeof payload.sender === 'string' ? payload.sender : null;
  const parsedReceived = typeof payload.receivedAt === 'string' ? new Date(payload.receivedAt) : new Date();
  const receivedAt = Number.isNaN(parsedReceived.getTime()) ? new Date() : parsedReceived;

  const parsed = parseBankSms(body, sender ?? undefined, receivedAt);

  const { data: raw, error: rawError } = await db
    .from('raw_messages')
    .insert({ user_id: userId, sender, body, received_at: receivedAt.toISOString(), status: parsed ? 'parsed' : 'failed' })
    .select('id')
    .single();
  if (rawError) return json({ error: rawError.message }, 500);

  // Unparsed SMS stay in the inbox for manual review in the app.
  if (!parsed) return json({ status: 'failed' });

  const { data: rules } = await db.from('category_rules').select('pattern, category').eq('user_id', userId);
  const category = categorize(parsed.description, parsed.amount, (rules ?? []) as Rule[]);
  const dedupeKey = [parsed.bank, parsed.account, parsed.amount, parsed.balance, parsed.occurredAt].join('|');

  const { data: inserted, error: txError } = await db.from('transactions').insert({
    user_id: userId,
    occurred_at: parsed.occurredAt,
    amount: parsed.amount,
    balance: parsed.balance,
    bank: parsed.bank,
    account: parsed.account,
    description: parsed.description,
    category,
    source: 'sms',
    raw_message_id: raw.id,
    dedupe_key: dedupeKey,
  }).select('id').single();

  if (txError) {
    const duplicate = txError.code === '23505';
    await db.from('raw_messages').update({ status: duplicate ? 'duplicate' : 'failed' }).eq('id', raw.id);
    return duplicate ? json({ status: 'duplicate' }) : json({ error: txError.message }, 500);
  }

  // Answer the phone right away; notifications are worked out in the background.
  EdgeRuntime.waitUntil(notifyAfterSettle(db, userId, inserted.id).catch((e) => console.error('notify failed', e)));

  return json({ status: 'parsed', amount: parsed.amount, category });
});
