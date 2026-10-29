-- Free-text note on a transaction, shown instead of the often cryptic SMS description.
alter table public.transactions add column note text;

-- Monthly report push, on the 1st of each month.
alter table public.user_settings add column notify_monthly boolean not null default true;

-- 08:00 Vietnam time (01:00 UTC) on the 1st: report on the month that just ended.
-- Uses the same vault secret as the weekly summary (migration 0004).
select cron.schedule(
  'monthly-report',
  '0 1 1 * *',
  $$
  select net.http_post(
    url := 'https://jirvkxpeurdbdjfhmfrn.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_cron_secret')
    ),
    body := '{"type":"monthly"}'::jsonb
  );
  $$
);
