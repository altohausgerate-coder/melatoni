-- Melatoni customer accounts. Safe to re-apply; no privileged client keys required.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Ev',
  city text not null default 'Bakı',
  district text not null default '',
  street text not null default '',
  note text not null default '',
  is_default boolean not null default false
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null default 0 check (total >= 0),
  language text not null default 'az' check (language in ('az','ru','en')),
  status text not null default 'pending' check (status in ('pending','confirmed','shipping','delivered','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.wishlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  primary key (user_id, product_id)
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.addresses, public.wishlist to authenticated;
grant select, insert on public.orders to authenticated;

alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.wishlist enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles for delete to authenticated using ((select auth.uid()) = id);

drop policy if exists "addresses_select_own" on public.addresses;
create policy "addresses_select_own" on public.addresses for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "addresses_insert_own" on public.addresses;
create policy "addresses_insert_own" on public.addresses for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "addresses_update_own" on public.addresses;
create policy "addresses_update_own" on public.addresses for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "addresses_delete_own" on public.addresses;
create policy "addresses_delete_own" on public.addresses for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own" on public.orders for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own" on public.orders for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "wishlist_select_own" on public.wishlist;
create policy "wishlist_select_own" on public.wishlist for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "wishlist_insert_own" on public.wishlist;
create policy "wishlist_insert_own" on public.wishlist for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "wishlist_update_own" on public.wishlist;
create policy "wishlist_update_own" on public.wishlist for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "wishlist_delete_own" on public.wishlist;
create policy "wishlist_delete_own" on public.wishlist for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), coalesce(new.raw_user_meta_data ->> 'phone', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();
