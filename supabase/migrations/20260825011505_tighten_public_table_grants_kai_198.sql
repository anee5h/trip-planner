revoke all privileges on table public.feedback from anon, authenticated;
revoke all privileges on table public.error_events from anon, authenticated;

revoke all privileges on table public.user_data from anon;
revoke all privileges on table public.trips from anon;

revoke references, trigger, truncate on table public.user_data from authenticated;
revoke references, trigger, truncate on table public.trips from authenticated;

grant select, insert, update, delete on table public.user_data to authenticated;
grant select, insert, update, delete on table public.trips to authenticated;

grant all privileges on table public.feedback to service_role;
grant all privileges on table public.error_events to service_role;
grant all privileges on table public.user_data to service_role;
grant all privileges on table public.trips to service_role;
