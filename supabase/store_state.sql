create table if not exists public.store_state (
  id text primary key,
  state jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create or replace function public.touch_store_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_store_state_updated_at on public.store_state;
create trigger touch_store_state_updated_at
before update on public.store_state
for each row
execute function public.touch_store_state_updated_at();

-- one row is enough; the app writes the whole shop state as the single `shop` record.
-- Example insert:
-- insert into public.store_state (id, state) values ('shop', '{}')
-- on conflict (id) do update set state = excluded.state;
