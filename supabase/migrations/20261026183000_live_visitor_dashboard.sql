-- Privacy-safe visitor presence for the Melatoni admin dashboard.
-- Direct table access is blocked; storefront writes and admin reads use limited RPCs.

create table if not exists public.visitor_presence (
  session_id text primary key check (char_length(session_id) between 8 and 100),
  visitor_id text not null check (char_length(visitor_id) between 8 and 100),
  user_id uuid references auth.users(id) on delete set null,
  current_page text not null default '/',
  page_title text not null default '',
  product_id text,
  product_name text,
  device_type text not null default 'unknown' check (device_type in ('phone','tablet','desktop','unknown')),
  referrer_host text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active_seconds integer not null default 0 check (active_seconds between 0 and 86400)
);

create index if not exists visitor_presence_last_seen_idx on public.visitor_presence(last_seen_at desc);
create index if not exists visitor_presence_first_seen_idx on public.visitor_presence(first_seen_at desc);

alter table public.visitor_presence enable row level security;
revoke all on table public.visitor_presence from anon, authenticated;

create or replace function public.track_visitor_presence(
  p_session_id text,
  p_visitor_id text,
  p_current_page text,
  p_page_title text default '',
  p_product_id text default null,
  p_product_name text default null,
  p_device_type text default 'unknown',
  p_referrer_host text default '',
  p_active_seconds integer default 0
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean_session text := left(trim(coalesce(p_session_id,'')),100);
  clean_visitor text := left(trim(coalesce(p_visitor_id,'')),100);
  clean_page text := left(coalesce(nullif(trim(p_current_page),''),'/'),500);
  clean_device text := case when p_device_type in ('phone','tablet','desktop') then p_device_type else 'unknown' end;
begin
  if char_length(clean_session) < 8 or char_length(clean_visitor) < 8 then
    return;
  end if;
  insert into public.visitor_presence(
    session_id,visitor_id,user_id,current_page,page_title,product_id,product_name,
    device_type,referrer_host,first_seen_at,last_seen_at,active_seconds
  ) values (
    clean_session,clean_visitor,auth.uid(),clean_page,left(coalesce(p_page_title,''),180),
    nullif(left(coalesce(p_product_id,''),120),''),nullif(left(coalesce(p_product_name,''),180),''),
    clean_device,left(coalesce(p_referrer_host,''),180),now(),now(),least(86400,greatest(0,coalesce(p_active_seconds,0)))
  )
  on conflict (session_id) do update set
    visitor_id=excluded.visitor_id,
    user_id=coalesce(excluded.user_id,public.visitor_presence.user_id),
    current_page=excluded.current_page,
    page_title=excluded.page_title,
    product_id=excluded.product_id,
    product_name=excluded.product_name,
    device_type=excluded.device_type,
    referrer_host=excluded.referrer_host,
    last_seen_at=now(),
    active_seconds=greatest(public.visitor_presence.active_seconds,excluded.active_seconds);
end;
$$;

revoke all on function public.track_visitor_presence(text,text,text,text,text,text,text,text,integer) from public;
grant execute on function public.track_visitor_presence(text,text,text,text,text,text,text,text,integer) to anon, authenticated;

create or replace function public.get_visitor_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
begin
  if not public.is_melatoni_admin() then
    raise exception 'admin_required';
  end if;

  with historical as (
    select
      e.session_id,
      min(e.created_at) as first_seen_at,
      max(e.created_at) as last_seen_at,
      (array_agg(e.page order by e.created_at desc))[1] as current_page,
      (array_agg(e.product_id order by e.created_at desc) filter (where e.product_id is not null))[1] as product_id,
      (array_agg(e.referrer order by e.created_at) filter (where coalesce(e.referrer,'') <> ''))[1] as referrer
    from public.storefront_events e
    where coalesce(e.session_id,'') <> ''
    group by e.session_id
  ), combined as (
    select
      h.session_id,
      coalesce(v.visitor_id,h.session_id) as visitor_id,
      least(h.first_seen_at,coalesce(v.first_seen_at,h.first_seen_at)) as first_seen_at,
      greatest(h.last_seen_at,coalesce(v.last_seen_at,h.last_seen_at)) as last_seen_at,
      coalesce(v.current_page,h.current_page,'/') as current_page,
      coalesce(v.page_title,'') as page_title,
      coalesce(v.product_id,h.product_id) as product_id,
      coalesce(v.product_name,'') as product_name,
      coalesce(v.device_type,'unknown') as device_type,
      coalesce(nullif(v.referrer_host,''),h.referrer,'') as referrer_host,
      coalesce(v.active_seconds,greatest(0,extract(epoch from (h.last_seen_at-h.first_seen_at))::integer)) as active_seconds,
      v.user_id
    from historical h
    left join public.visitor_presence v using(session_id)
    union all
    select v.session_id,v.visitor_id,v.first_seen_at,v.last_seen_at,v.current_page,v.page_title,
      v.product_id,coalesce(v.product_name,''),v.device_type,v.referrer_host,v.active_seconds,v.user_id
    from public.visitor_presence v
    where not exists (select 1 from historical h where h.session_id=v.session_id)
  )
  select jsonb_build_object(
    'active_now',count(*) filter (where last_seen_at >= now()-interval '2 minutes'),
    'last_30_minutes',count(*) filter (where last_seen_at >= now()-interval '30 minutes'),
    'today',count(*) filter (where last_seen_at >= date_trunc('day',now() at time zone 'Asia/Baku') at time zone 'Asia/Baku'),
    'all_time',count(*),
    'sessions',coalesce((
      select jsonb_agg(to_jsonb(s) order by s.last_seen_at desc)
      from (select * from combined order by last_seen_at desc limit 500) s
    ),'[]'::jsonb)
  ) into result
  from combined;

  return coalesce(result,jsonb_build_object('active_now',0,'last_30_minutes',0,'today',0,'all_time',0,'sessions','[]'::jsonb));
end;
$$;

revoke all on function public.get_visitor_dashboard() from public;
grant execute on function public.get_visitor_dashboard() to authenticated;
