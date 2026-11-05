create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  guest_name text not null,
  email text,
  phone text,
  res_date date not null,
  res_time text not null,
  party_size int not null default 2,
  note text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.reservations enable row level security;
create policy "res_anon_select" on public.reservations for select to anon using (true);
create policy "res_anon_insert" on public.reservations for insert to anon with check (true);
create policy "res_anon_update" on public.reservations for update to anon using (true) with check (true);
create policy "res_anon_delete" on public.reservations for delete to anon using (true);
create index if not exists reservations_date_idx on public.reservations (res_date, res_time);
