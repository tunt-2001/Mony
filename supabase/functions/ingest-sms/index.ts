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

import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseBankSms } from '../_shared/smsParser.ts';
import { categorize, type Rule } from '../_shared/categorize.ts';

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

  const { error: txError } = await db.from('transactions').insert({
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
  });

  if (txError) {
    const duplicate = txError.code === '23505';
    await db.from('raw_messages').update({ status: duplicate ? 'duplicate' : 'failed' }).eq('id', raw.id);
    return duplicate ? json({ status: 'duplicate' }) : json({ error: txError.message }, 500);
  }

  return json({ status: 'parsed', amount: parsed.amount, category });
});
