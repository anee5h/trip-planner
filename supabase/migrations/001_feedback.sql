-- KAI-96: durable owner-visible feedback capture.
--
-- Apply in Supabase dashboard: SQL Editor -> New query -> run -> Save.
-- Rollback / compensation plan: DROP TABLE IF EXISTS public.feedback;
-- (Feedback rows are append-only diagnostic content; dropping the table
--  discards them, which is the intended rollback semantics.)

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null check (type in ('general', 'feature', 'bug')),
  message text not null check (char_length(message) between 1 and 2000),
  route text,
  locale text,
  app_version text,
  browser_class text,
  user_id uuid
);

-- RLS is enabled with NO policies: the Pages Function writes via the
-- service-role key (RLS bypassing), so anon/authenticated clients have no
-- direct write path. The owner reads rows from the dashboard (or a future
-- owner-only view).
alter table public.feedback enable row level security;

create index if not exists feedback_created_at_idx
  on public.feedback (created_at desc);
