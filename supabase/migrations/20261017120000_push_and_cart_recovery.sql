-- Opt-in web push notifications and scheduled reminders for signed-in carts.
-- Uses the public anon key and a random Vault secret; no service_role key.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;

alter table public.product_alerts add column if not exists notify_email boolean not null default true;
alter table public.product_alerts add column if not exists notify_push boolean not null default false;
alter table public.product_alerts alter column email drop not null;
alter table public.product_alerts drop constraint if exists product_alerts_email_check;
alter table public.product_alerts add constraint product_alerts_email_check
  check (not notify_email or (email is not null and email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'));
drop policy if exists product_alerts_insert_own on public.product_alerts;
create policy product_alerts_insert_own on public.product_alerts
  for insert to authenticated with check (
    (select auth.uid()) = user_id and (
      (notify_email and lower(email) = lower(coalesce(auth.jwt() ->> 'email','')))
      or (not notify_email and email is null)
    )
  );
drop policy if exists product_alerts_update_own_or_admin on public.product_alerts;
create policy product_alerts_update_own_or_admin on public.product_alerts
  for update to authenticated using ((select auth.uid()) = user_id or public.is_melatoni_admin())
  with check (
    public.is_melatoni_admin() or (
      (select auth.uid()) = user_id and (
        (notify_email and lower(email) = lower(coalesce(auth.jwt() ->> 'email','')))
        or (not notify_email and email is null)
      )
    )
  );

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) <= 3000),
  subscription jsonb not null check (jsonb_typeof(subscription) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

create table if not exists public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('campaign','cart_recovery','product_alert')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 300),
  url text not null default 'products.html' check (url !~ '^(\/|\/\/|[A-Za-z][A-Za-z0-9+.-]*:)'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists customer_notifications_user_created_idx on public.customer_notifications(user_id, created_at desc);

create table if not exists public.abandoned_carts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  items jsonb not null check (jsonb_typeof(items) = 'array' and octet_length(items::text) <= 12000),
  total numeric(12,2) not null default 0 check (total >= 0),
  language text not null default 'az' check (language in ('az','ru','en')),
  updated_at timestamptz not null default now(),
  recovery_sent_at timestamptz
);

alter table public.push_subscriptions enable row level security;
alter table public.customer_notifications enable row level security;
alter table public.abandoned_carts enable row level security;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select on public.customer_notifications to authenticated;
grant update (read_at) on public.customer_notifications to authenticated;
grant insert on public.customer_notifications to authenticated;
grant select, insert, update, delete on public.abandoned_carts to authenticated;

drop policy if exists push_subscription_owner_all on public.push_subscriptions;
create policy push_subscription_owner_all on public.push_subscriptions
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists push_subscription_admin_read on public.push_subscriptions;
create policy push_subscription_admin_read on public.push_subscriptions
  for select to authenticated using (public.is_melatoni_admin());

drop policy if exists notifications_owner_read on public.customer_notifications;
create policy notifications_owner_read on public.customer_notifications
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists notifications_owner_update on public.customer_notifications;
create policy notifications_owner_update on public.customer_notifications
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists notifications_admin_insert on public.customer_notifications;
create policy notifications_admin_insert on public.customer_notifications
  for insert to authenticated with check (public.is_melatoni_admin());

drop policy if exists abandoned_cart_owner_all on public.abandoned_carts;
create policy abandoned_cart_owner_all on public.abandoned_carts
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists abandoned_cart_admin_read on public.abandoned_carts;
create policy abandoned_cart_admin_read on public.abandoned_carts
  for select to authenticated using (public.is_melatoni_admin());

-- Create one secret for the cron-to-function call. It is never returned by this migration.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'melatoni_cart_recovery_secret', 'Melatoni scheduled cart recovery')
where not exists (select 1 from vault.decrypted_secrets where name = 'melatoni_cart_recovery_secret');

create or replace function public.claim_abandoned_cart_pushes(p_secret text)
returns setof jsonb
language plpgsql
security definer
set search_path = public, auth, vault
as $$
declare
  cart_row public.abandoned_carts%rowtype;
  subscription_row public.push_subscriptions%rowtype;
  notification_id uuid;
  secret_value text;
  language_value text;
  message_title text;
  message_body text;
begin
  select decrypted_secret into secret_value
  from vault.decrypted_secrets where name = 'melatoni_cart_recovery_secret' limit 1;
  if secret_value is null or p_secret is distinct from secret_value then
    raise exception 'not_authorized';
  end if;

  for cart_row in
    select c.* from public.abandoned_carts c
    where c.recovery_sent_at is null
      and c.updated_at < now() - interval '60 minutes'
      and c.updated_at > now() - interval '30 hours'
      and jsonb_array_length(c.items) > 0
      and exists (select 1 from public.push_subscriptions s where s.user_id = c.user_id)
      and not exists (select 1 from public.orders o where o.user_id = c.user_id and o.created_at >= c.updated_at)
    for update skip locked
  loop
    language_value := case when cart_row.language in ('az','ru','en') then cart_row.language else 'az' end;
    message_title := case language_value when 'ru' then 'Ваша корзина ждёт' when 'en' then 'Your bag is waiting' else 'Səbətiniz sizi gözləyir' end;
    message_body := case language_value when 'ru' then 'Вернитесь и завершите выбор товаров для комфортного сна.' when 'en' then 'Come back to finish choosing your sleep essentials.' else 'Rahat yuxu seçiminizi tamamlamaq üçün geri qayıdın.' end;
    insert into public.customer_notifications(user_id, kind, title, body, url)
      values (cart_row.user_id, 'cart_recovery', message_title, message_body, 'index.html#bag')
      returning id into notification_id;
    update public.abandoned_carts set recovery_sent_at = now() where user_id = cart_row.user_id;
    for subscription_row in select * from public.push_subscriptions where user_id = cart_row.user_id loop
      return next jsonb_build_object(
        'user_id', cart_row.user_id, 'notification_id', notification_id,
        'subscription', subscription_row.subscription,
        'title', message_title, 'body', message_body, 'url', 'index.html#bag'
      );
    end loop;
  end loop;
end;
$$;
revoke all on function public.claim_abandoned_cart_pushes(text) from public, authenticated;
grant execute on function public.claim_abandoned_cart_pushes(text) to anon;

-- Schedule a single reminder after one hour of inactivity, checked every 15 minutes.
select cron.unschedule(jobid) from cron.job where jobname = 'melatoni-abandoned-cart-push';
select cron.schedule(
  'melatoni-abandoned-cart-push',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := 'https://zjmfvtcclecmbjcimddc.supabase.co/functions/v1/send-cart-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_1pNMgE8BRyWcx50UQOknnQ_DPYy6HsA',
        'x-recovery-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'melatoni_cart_recovery_secret' limit 1)
      ),
      body := '{}'::jsonb
    );
  $job$
);
