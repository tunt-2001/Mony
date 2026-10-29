-- Monthly spending limit and push notification preferences (one row per user, created on first save).
create table public.user_settings (
  user_id             uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  monthly_limit       bigint check (monthly_limit > 0),       -- null = no limit, no limit alerts
  notify_limit        boolean not null default true,          -- push at 80% and 100% of the limit
  big_spend_threshold bigint check (big_spend_threshold > 0), -- null = no "big spending" push
  notify_gaps         boolean not null default true,          -- push when a balance gap is found
  notify_weekly       boolean not null default false,         -- Sunday-evening summary
  updated_at          timestamptz not null default now()
);

-- One row per phone/browser that agreed to receive notifications.
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.user_settings      enable row level security;
alter table public.push_subscriptions enable row level security;

create policy own_settings on public.user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_push_subscriptions on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Weekly summary: Sunday 20:00 Vietnam time (13:00 UTC) the database calls the "notify" function.
-- Before running this part, store the shared secret once (same value as the function secret CRON_SECRET):
--   select vault.create_secret('<random>', 'notify_cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'weekly-summary',
  '0 13 * * 0',
  $$
  select net.http_post(
    url := 'https://jirvkxpeurdbdjfhmfrn.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_cron_secret')
    ),
    body := '{"type":"weekly"}'::jsonb
  );
  $$
);
