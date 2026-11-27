-- KAI-46: privacy-safe frontend error events.
--
-- Apply in Supabase dashboard: SQL Editor -> New query -> run -> Save.
-- Rollback / compensation plan: DROP TABLE IF EXISTS public.error_events;
--
-- No anon/authenticated policies: writes happen only via the Pages Function
-- (functions/api/errors.js) using the service-role key; the owner reads via
-- the dashboard. Columns are capped server-side; tokens/payloads are never
-- stored by design (shared redaction on client AND server).
--
-- Retention: rows older than 90 days are deleted by the Function's
-- opportunistic cleanup (functions/api/errors.js, at most hourly per
-- isolate) and by the manual cleanup below. user_id references
-- auth.users(id) with ON DELETE SET NULL so account deletion (#195) does
-- not leave dangling or owner-identifying error rows behind.
--
-- Manual retention cleanup (scheduled variant, e.g. pg_cron or an external
-- cron hitting the SQL editor):
--   delete from public.error_events
--    where created_at < now() - interval '90 days';

create table if not exists public.error_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message text not null check (char_length(message) between 1 and 2000),
  feature text not null default 'app' check (char_length(feature) <= 64),
  route text check (char_length(route) <= 200),
  locale text check (char_length(locale) <= 16),
  app_version text check (char_length(app_version) <= 32),
  commit_sha text check (char_length(commit_sha) <= 40),
  browser text check (char_length(browser) <= 16),
  error_name text check (char_length(error_name) <= 64),
  stack_head text check (char_length(stack_head) <= 500),
  user_id uuid references auth.users(id) on delete set null
);

alter table public.error_events enable row level security;

-- Owner triage view: 15-minute crash-loop window per feature/browser.
create index if not exists error_events_created_idx
  on public.error_events (created_at desc);
create index if not exists error_events_feature_idx
  on public.error_events (feature, created_at desc);
