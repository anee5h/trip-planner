create index if not exists trips_user_id_idx on public.trips (user_id);

alter policy "Users can view own user_data"
on public.user_data
to authenticated
using ((select auth.uid()) = id);

alter policy "Users can insert own user_data"
on public.user_data
to authenticated
with check ((select auth.uid()) = id);

alter policy "Users can update own user_data"
on public.user_data
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

alter policy "Users can delete own data"
on public.user_data
to authenticated
using ((select auth.uid()) = id);

alter policy "Users can manage their own trips"
on public.trips
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
