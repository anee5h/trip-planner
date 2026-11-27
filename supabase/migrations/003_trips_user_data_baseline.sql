-- Baseline for public.trips and public.user_data (KAI-198 follow-up).
--
-- These two tables were created directly on the remote project and never
-- had DDL in the repo, so a fresh Supabase preview branch could not replay
-- the KAI-198 migrations (they GRANT/REVOKE/ALTER POLICY on these tables).
-- This file reproduces the live schema (read from the remote catalog) and is
-- fully idempotent, so applying it to the existing remote is a no-op.
-- Sorts before the 2026082501xxxx migrations on purpose.

create table if not exists public.user_data (
  id uuid primary key references auth.users(id),
  destination_ratings jsonb default '{}'::jsonb,
  favorites text[] default '{}'::text[],
  home_station text default 'Tokyo Station'::text,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  visited text[] default '{}'::text[],
  visited_dates jsonb default '{}'::jsonb,
  visited_prefectures text[] default '{}'::text[]
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'draft'::text,
  stops jsonb not null default '[]'::jsonb,
  start_date date,
  end_date date,
  journal_notes text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.user_data enable row level security;
alter table public.trips enable row level security;

-- Policies exist before the KAI-198 migration ALTERs them; created here in
-- their live (post-KAI-198) form, guarded so reruns are no-ops.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_data' and policyname = 'Users can view own user_data') then
    create policy "Users can view own user_data" on public.user_data for select to authenticated using ((select auth.uid()) = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_data' and policyname = 'Users can insert own user_data') then
    create policy "Users can insert own user_data" on public.user_data for insert to authenticated with check ((select auth.uid()) = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_data' and policyname = 'Users can update own user_data') then
    create policy "Users can update own user_data" on public.user_data for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_data' and policyname = 'Users can delete own data') then
    create policy "Users can delete own data" on public.user_data for delete to authenticated using ((select auth.uid()) = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trips' and policyname = 'Users can manage their own trips') then
    create policy "Users can manage their own trips" on public.trips for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
end
$$;
