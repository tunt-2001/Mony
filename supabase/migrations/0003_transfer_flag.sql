-- Manual override for "transfer between my own accounts".
-- null = let the app decide (it pairs matching in/out SMS), true/false = the user's choice.
alter table public.transactions add column transfer boolean;
