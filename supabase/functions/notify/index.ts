// Push notifications that are not triggered by an SMS.
//
//   POST /functions/v1/notify  {"type":"weekly"}  x-cron-secret: <CRON_SECRET>
//     Sunday-evening summary for everyone who turned it on; called by pg_cron (migration 0004).
//   POST /functions/v1/notify  {"type":"monthly"} x-cron-secret: <CRON_SECRET>
//     Report on the month that just ended, on the 1st at 08:00; called by pg_cron (migration 0005).
//   POST /functions/v1/notify  {"type":"test"}    Authorization: Bearer <user's session JWT>
//     "Gửi thử" button in Settings: one test message to the caller's devices.
//
// Deploy with --no-verify-jwt: the cron call has no user JWT, so each branch checks its own credential.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { monthlyReport, vnMonthStart, weeklySummary } from '../_shared/alerts.ts';
import { pushToUser } from '../_shared/push.ts';

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { type } = await req.json().catch(() => ({ type: null }));

  if (type === 'weekly' || type === 'monthly') {
    const secret = Deno.env.get('CRON_SECRET');
    if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'unauthorized' }, 401);
  }

  if (type === 'monthly') {
    const now = new Date();
    // Start of the month before the one that just ended (the comparison), minus a day for transfer pairs.
    const ended = new Date(Date.parse(vnMonthStart(now)) - 1);
    const from = new Date(Date.parse(vnMonthStart(new Date(Date.parse(vnMonthStart(ended)) - 1))) - 24 * 3600_000);
    const { data: users } = await db.from('user_settings').select('user_id').eq('notify_monthly', true);

    let sent = 0;
    for (const u of users ?? []) {
      const { data: txs } = await db
        .from('transactions')
        .select('id, occurred_at, amount, balance, bank, account, transfer, category')
        .eq('user_id', u.user_id)
        .gte('occurred_at', from.toISOString())
        .lt('occurred_at', vnMonthStart(now));
      const report = monthlyReport(txs ?? [], now);
      if (report) sent += await pushToUser(db, u.user_id, [report]);
    }
    return json({ status: 'ok', users: users?.length ?? 0, sent });
  }

  if (type === 'weekly') {
    const now = new Date();
    // The week, plus the whole month for the limit line, plus a day so transfers at the edge still pair up.
    const from = new Date(Math.min(Date.parse(vnMonthStart(now)), now.getTime() - 7 * 24 * 3600_000) - 24 * 3600_000);
    const { data: users } = await db
      .from('user_settings')
      .select('user_id, monthly_limit')
      .eq('notify_weekly', true);

    let sent = 0;
    for (const u of users ?? []) {
      const { data: txs } = await db
        .from('transactions')
        .select('id, occurred_at, amount, balance, bank, account, transfer')
        .eq('user_id', u.user_id)
        .gte('occurred_at', from.toISOString());
      sent += await pushToUser(db, u.user_id, [weeklySummary(txs ?? [], u, now)]);
    }
    return json({ status: 'ok', users: users?.length ?? 0, sent });
  }

  if (type === 'test') {
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data } = await db.auth.getUser(jwt);
    if (!data.user) return json({ error: 'unauthorized' }, 401);
    const sent = await pushToUser(db, data.user.id, [
      { title: 'Thông báo đã bật', body: 'Máy này sẽ nhận cảnh báo chi tiêu từ app.', tag: 'test' },
    ]);
    return json({ status: 'ok', sent });
  }

  return json({ error: 'unknown type' }, 400);
});
