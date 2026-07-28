-- 1. Pastikan kolom tenant_id dan role_id tersedia di tabel profiles
alter table public.profiles add column if not exists tenant_id uuid;
alter table public.profiles add column if not exists role_id text;

-- 2. Aktifkan RLS (jika belum)
alter table public.profiles enable row level security;

-- 3. Perbarui policy agar penyimpanan anggota multi-tenant tidak diblokir
drop policy if exists "Enable read access for all users" on public.profiles;
drop policy if exists "Enable insert/update for authenticated users" on public.profiles;

create policy "Profiles select policy" on public.profiles
  for select using (true);

create policy "Profiles insert update policy" on public.profiles
  for all using (true) with check (true);
