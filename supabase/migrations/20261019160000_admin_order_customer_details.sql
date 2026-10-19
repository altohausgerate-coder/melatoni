-- Let authenticated Melatoni admins view customer names and phone numbers in orders.
-- Customers can still view and edit only their own profile; no anonymous access is added.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_own_or_admin" on public.profiles;

create policy "profiles_select_own_or_admin" on public.profiles
for select to authenticated
using ((select auth.uid()) = id or public.is_melatoni_admin());
