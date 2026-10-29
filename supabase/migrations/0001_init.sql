-- Personal expense tracker schema. Every table is scoped to auth.uid() via RLS.

create table public.raw_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  sender      text,
  body        text not null,
  received_at timestamptz not null default now(),
  -- parsed | failed (needs manual review) | duplicate | ignored
  status      text not null default 'failed',
  created_at  timestamptz not null default now()
);

create table public.transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  occurred_at    timestamptz not null,
  amount         bigint not null check (amount <> 0), -- VND, negative = spending
  balance        bigint,
  bank           text not null default 'UNKNOWN',
  account        text,
  description    text not null default '',
  category       text not null,
  source         text not null default 'manual', -- sms | manual
  raw_message_id uuid references public.raw_messages (id) on delete set null,
  -- Same SMS forwarded twice must not create two transactions.
  dedupe_key     text,
  created_at     timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index transactions_user_time on public.transactions (user_id, occurred_at desc);

create table public.category_rules (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  pattern    text not null,
  category   text not null,
  created_at timestamptz not null default now(),
  unique (user_id, pattern)
);

alter table public.raw_messages   enable row level security;
alter table public.transactions   enable row level security;
alter table public.category_rules enable row level security;

create policy own_raw_messages on public.raw_messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_transactions on public.transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_category_rules on public.category_rules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- user_id defaults to the caller so the web app never has to send it.
alter table public.raw_messages   alter column user_id set default auth.uid();
alter table public.transactions   alter column user_id set default auth.uid();
alter table public.category_rules alter column user_id set default auth.uid();
