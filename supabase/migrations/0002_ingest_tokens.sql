-- One token per device (iPhone Shortcut, Android MacroDroid) and per family member.
-- Only the SHA-256 of the token is stored; the app shows the token once when it is created.

create table public.ingest_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label        text not null default '',
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.ingest_tokens enable row level security;

-- Users list, add and revoke their own devices. No update: a token is replaced, never edited.
create policy own_tokens_select on public.ingest_tokens for select using (user_id = auth.uid());
create policy own_tokens_insert on public.ingest_tokens for insert with check (user_id = auth.uid());
create policy own_tokens_delete on public.ingest_tokens for delete using (user_id = auth.uid());
