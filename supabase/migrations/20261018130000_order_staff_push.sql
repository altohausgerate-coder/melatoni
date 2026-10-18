-- Durable push queue for new orders. Notifications go only to opted-in admin devices.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.order_push_queue (
  order_id uuid primary key references public.orders(id) on delete cascade,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  sent_at timestamptz,
  last_error text
);
create index if not exists order_push_queue_pending_idx
  on public.order_push_queue (next_attempt_at, created_at)
  where sent_at is null;
alter table public.order_push_queue enable row level security;
revoke all on public.order_push_queue from anon, authenticated;

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'melatoni_order_push_secret',
  'Melatoni order push queue authorization'
)
where not exists (
  select 1 from vault.decrypted_secrets where name = 'melatoni_order_push_secret'
);

create or replace function public.enqueue_order_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.order_push_queue(order_id) values (new.id)
  on conflict (order_id) do nothing;
  return new;
end;
$$;
revoke all on function public.enqueue_order_push() from public, anon, authenticated;
drop trigger if exists orders_enqueue_push on public.orders;
create trigger orders_enqueue_push
  after insert on public.orders
  for each row execute function public.enqueue_order_push();

create or replace function public.authorize_order_push(p_secret text)
returns boolean
language sql
security definer
set search_path = vault
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'melatoni_order_push_secret' and decrypted_secret = p_secret
  );
$$;
revoke all on function public.authorize_order_push(text) from public, authenticated;
grant execute on function public.authorize_order_push(text) to anon;

create or replace function public.claim_order_pushes(p_secret text)
returns setof jsonb
language plpgsql
security definer
set search_path = public, auth, vault
as $$
declare
  queue_row public.order_push_queue%rowtype;
  order_row public.orders%rowtype;
  recipients jsonb;
  item_summary text;
begin
  if not public.authorize_order_push(p_secret) then
    raise exception 'not_authorized';
  end if;

  for queue_row in
    select q.*
    from public.order_push_queue q
    where q.sent_at is null
      and q.attempts < 8
      and q.next_attempt_at <= now()
      and (q.locked_until is null or q.locked_until < now())
      and exists (
        select 1 from public.orders o
        where o.id = q.order_id and o.status = 'pending'
          and o.created_at > now() - interval '48 hours'
      )
      and exists (
        select 1 from public.push_subscriptions s
        join public.profiles p on p.id = s.user_id and p.is_admin
      )
    order by q.created_at
    for update of q skip locked
    limit 25
  loop
    select * into order_row from public.orders where id = queue_row.order_id;
    if not found then
      delete from public.order_push_queue where order_id = queue_row.order_id;
      continue;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('subscription', s.subscription)), '[]'::jsonb)
      into recipients
    from public.push_subscriptions s
    join public.profiles p on p.id = s.user_id and p.is_admin;

    select string_agg(
      coalesce(nullif(item->>'name', ''), nullif(item->>'id', ''), 'Məhsul') || ' × ' ||
      case when coalesce(item->>'qty', '') ~ '^[0-9]+$' then item->>'qty' else '1' end,
      ', '
    ) into item_summary
    from jsonb_array_elements(order_row.items) as item_rows(item);

    update public.order_push_queue
      set attempts = attempts + 1, locked_until = now() + interval '3 minutes'
      where order_id = queue_row.order_id;

    return next jsonb_build_object(
      'order_id', order_row.id,
      'total', order_row.total,
      'items', left(coalesce(item_summary, 'Yeni sifariş'), 180),
      'recipients', recipients
    );
  end loop;
end;
$$;
revoke all on function public.claim_order_pushes(text) from public, authenticated;
grant execute on function public.claim_order_pushes(text) to anon;

create or replace function public.finish_order_push(
  p_secret text,
  p_order_id uuid,
  p_sent integer,
  p_failed integer,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  if not public.authorize_order_push(p_secret) then
    raise exception 'not_authorized';
  end if;

  update public.order_push_queue
  set sent_at = case when greatest(coalesce(p_sent, 0), 0) > 0 then now() else sent_at end,
      locked_until = null,
      next_attempt_at = now() + make_interval(mins => least(60, power(2, greatest(attempts - 1, 0))::integer)),
      last_error = case when greatest(coalesce(p_sent, 0), 0) > 0 then null else left(coalesce(p_error, 'Push göndərilmədi'), 300) end
  where order_id = p_order_id and sent_at is null;
  return found;
end;
$$;
revoke all on function public.finish_order_push(text, uuid, integer, integer, text) from public, authenticated;
grant execute on function public.finish_order_push(text, uuid, integer, integer, text) to anon;

select cron.unschedule(jobid) from cron.job where jobname = 'melatoni-order-push';
select cron.schedule(
  'melatoni-order-push',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://zjmfvtcclecmbjcimddc.supabase.co/functions/v1/send-order-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_1pNMgE8BRyWcx50UQOknnQ_DPYy6HsA',
        'x-order-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'melatoni_order_push_secret' limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  $job$
);
