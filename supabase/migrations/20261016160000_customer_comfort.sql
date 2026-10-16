-- Customer preferences, product alerts and support inbox.
-- No service_role key is used in the storefront.

create table if not exists public.customer_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  recommendations_consent boolean not null default false,
  interests text[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint customer_preferences_interests_check check (
    interests <@ array['linen','pillow','duvet','bedcare','sleepwear','bath','accessory','gift']::text[]
  )
);

create table if not exists public.customer_interactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  event_name text not null check (event_name in ('view','add_to_cart')),
  created_at timestamptz not null default now()
);
create index if not exists customer_interactions_recent_idx
  on public.customer_interactions (user_id, created_at desc);

create table if not exists public.product_alerts (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  email text not null,
  language text not null default 'az' check (language in ('az','ru','en')),
  target_price numeric(12,2) check (target_price is null or target_price >= 0),
  notify_price_drop boolean not null default false,
  notify_restock boolean not null default true,
  last_notified_price numeric(12,2),
  last_notified_stock integer,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id),
  constraint product_alerts_channel_check check (notify_price_drop or notify_restock),
  constraint product_alerts_email_check check (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
);
alter table public.product_alerts add column if not exists language text not null default 'az';
alter table public.product_alerts drop constraint if exists product_alerts_language_check;
alter table public.product_alerts add constraint product_alerts_language_check check (language in ('az','ru','en'));
create index if not exists product_alerts_product_idx on public.product_alerts (product_id);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  subject text not null check (char_length(subject) between 3 and 120),
  message text not null check (char_length(message) between 10 and 4000),
  status text not null default 'open' check (status in ('open','in_progress','answered','closed')),
  admin_reply text not null default '' check (char_length(admin_reply) <= 4000),
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_tickets_created_idx on public.support_tickets (created_at desc);
create index if not exists support_tickets_user_idx on public.support_tickets (user_id, created_at desc);

alter table public.customer_preferences enable row level security;
alter table public.customer_interactions enable row level security;
alter table public.product_alerts enable row level security;
alter table public.support_tickets enable row level security;

grant select, insert, update on public.customer_preferences to authenticated;
grant select, insert, delete on public.customer_interactions to authenticated;
grant select, insert, update, delete on public.product_alerts to authenticated;
grant select, insert on public.support_tickets to authenticated;
grant select, update on public.support_tickets to authenticated;

drop policy if exists customer_preferences_select_own on public.customer_preferences;
create policy customer_preferences_select_own on public.customer_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists customer_preferences_insert_own on public.customer_preferences;
create policy customer_preferences_insert_own on public.customer_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists customer_preferences_update_own on public.customer_preferences;
create policy customer_preferences_update_own on public.customer_preferences
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists customer_interactions_select_own on public.customer_interactions;
create policy customer_interactions_select_own on public.customer_interactions
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists customer_interactions_delete_own on public.customer_interactions;
create policy customer_interactions_delete_own on public.customer_interactions
  for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists customer_interactions_insert_with_consent on public.customer_interactions;
create policy customer_interactions_insert_with_consent on public.customer_interactions
  for insert to authenticated with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.customer_preferences p
      where p.user_id = (select auth.uid()) and p.recommendations_consent
    )
  );

drop policy if exists product_alerts_select_own_or_admin on public.product_alerts;
create policy product_alerts_select_own_or_admin on public.product_alerts
  for select to authenticated using ((select auth.uid()) = user_id or public.is_melatoni_admin());
drop policy if exists product_alerts_insert_own on public.product_alerts;
create policy product_alerts_insert_own on public.product_alerts
  for insert to authenticated with check (
    (select auth.uid()) = user_id and lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))
  );
drop policy if exists product_alerts_update_own_or_admin on public.product_alerts;
create policy product_alerts_update_own_or_admin on public.product_alerts
  for update to authenticated using ((select auth.uid()) = user_id or public.is_melatoni_admin())
  with check (
    public.is_melatoni_admin() or (
      (select auth.uid()) = user_id and lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))
    )
  );
drop policy if exists product_alerts_delete_own on public.product_alerts;
create policy product_alerts_delete_own on public.product_alerts
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists support_tickets_select_own_or_admin on public.support_tickets;
create policy support_tickets_select_own_or_admin on public.support_tickets
  for select to authenticated using ((select auth.uid()) = user_id or public.is_melatoni_admin());
drop policy if exists support_tickets_insert_own on public.support_tickets;
create policy support_tickets_insert_own on public.support_tickets
  for insert to authenticated with check (
    (select auth.uid()) = user_id and (
      order_id is null or exists (
        select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())
      )
    )
  );
drop policy if exists support_tickets_admin_update on public.support_tickets;
create policy support_tickets_admin_update on public.support_tickets
  for update to authenticated using (public.is_melatoni_admin())
  with check (public.is_melatoni_admin());

-- Admins can inspect opted-in interactions for aggregate recommendation reporting.
grant select on public.customer_interactions to authenticated;
drop policy if exists customer_interactions_admin_read on public.customer_interactions;
create policy customer_interactions_admin_read on public.customer_interactions
  for select to authenticated using (public.is_melatoni_admin());

-- Extend the existing event vocabulary for auditable cart changes.
alter table public.storefront_events drop constraint if exists storefront_events_event_name_check;
alter table public.storefront_events add constraint storefront_events_event_name_check
  check (event_name in ('page_view','product_view','product_click','add_to_cart','cart_removed','checkout_started','search','wishlist_add','order_created'));

