-- Weekly privacy-safe customer journey report and real product impression events.
-- No customer identity, contact field, free text, or full URL is included.

alter table public.storefront_events drop constraint if exists storefront_events_event_name_check;
alter table public.storefront_events add constraint storefront_events_event_name_check
  check (event_name in (
    'page_view','product_impression','product_view','product_click','add_to_cart',
    'cart_removed','checkout_started','search','wishlist_add','order_created'
  ));

create index if not exists storefront_events_product_funnel_idx
  on public.storefront_events (product_id,event_name,created_at desc)
  where product_id is not null;

create or replace function public.store_weekly_report(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare report jsonb;
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name='melatoni_store_automation_secret' and decrypted_secret=p_secret
  ) then
    raise exception 'not_authorized';
  end if;

  with bounds as (
    select now() as period_end, now()-interval '7 days' as period_start,
      now()-interval '14 days' as previous_start
  ),
  current_events as (
    select e.* from public.storefront_events e,bounds b
    where e.created_at>=b.period_start and e.created_at<b.period_end
  ),
  previous_events as (
    select e.* from public.storefront_events e,bounds b
    where e.created_at>=b.previous_start and e.created_at<b.period_start
  ),
  current_orders as (
    select o.* from public.orders o,bounds b
    where o.created_at>=b.period_start and o.created_at<b.period_end
  ),
  previous_orders as (
    select o.* from public.orders o,bounds b
    where o.created_at>=b.previous_start and o.created_at<b.period_start
  ),
  product_events as (
    select product_id,
      count(*) filter(where event_name='product_impression')::integer as impressions,
      count(*) filter(where event_name='product_click')::integer as clicks,
      count(*) filter(where event_name='product_view')::integer as detail_views,
      count(*) filter(where event_name='add_to_cart')::integer as cart_adds
    from current_events where product_id is not null group by product_id
  ),
  product_orders as (
    select item->>'id' as product_id,
      sum(case when coalesce(item->>'qty','')~'^[0-9]{1,3}$' then (item->>'qty')::integer else 1 end)::integer as ordered_quantity
    from current_orders o cross join lateral jsonb_array_elements(o.items) item
    where o.status in ('confirmed','preparing','processing','shipping','delivered')
    group by item->>'id'
  ),
  product_rows as (
    select pe.product_id,coalesce(p.name->>'az',p.name->>'en',pe.product_id) as name,
      pe.impressions,pe.clicks,pe.detail_views,pe.cart_adds,coalesce(po.ordered_quantity,0) as ordered_quantity,
      round(100.0*pe.clicks/nullif(pe.impressions,0),1) as click_rate,
      round(100.0*pe.cart_adds/nullif(pe.clicks,0),1) as click_to_cart_rate
    from product_events pe
    left join public.products p on p.id=pe.product_id
    left join product_orders po on po.product_id=pe.product_id
  )
  select jsonb_build_object(
    'period_start',b.period_start,'period_end',b.period_end,
    'sessions',(select count(distinct session_id) from current_events),
    'page_views',(select count(*) from current_events where event_name='page_view'),
    'product_impressions',(select count(*) from current_events where event_name='product_impression'),
    'product_clicks',(select count(*) from current_events where event_name='product_click'),
    'product_views',(select count(*) from current_events where event_name='product_view'),
    'cart_adds',(select count(*) from current_events where event_name='add_to_cart'),
    'checkout_starts',(select count(*) from current_events where event_name='checkout_started'),
    'order_count',(select count(*) from current_orders),
    'confirmed_orders',(select count(*) from current_orders where status in ('confirmed','preparing','processing','shipping','delivered')),
    'cancelled_orders',(select count(*) from current_orders where status='cancelled'),
    'sales',coalesce((select sum(total) from current_orders where status in ('confirmed','preparing','processing','shipping','delivered')),0),
    'new_orders',(select count(*) from current_orders where status='pending'),
    'session_to_order_rate',round(100.0*(select count(*) from current_orders)/nullif((select count(distinct session_id) from current_events),0),1),
    'impression_to_click_rate',round(100.0*(select count(*) from current_events where event_name='product_click')/nullif((select count(*) from current_events where event_name='product_impression'),0),1),
    'click_to_cart_rate',round(100.0*(select count(*) from current_events where event_name='add_to_cart')/nullif((select count(*) from current_events where event_name='product_click'),0),1),
    'previous_period',jsonb_build_object(
      'sessions',(select count(distinct session_id) from previous_events),
      'order_count',(select count(*) from previous_orders),
      'sales',coalesce((select sum(total) from previous_orders where status in ('confirmed','preparing','processing','shipping','delivered')),0)
    ),
    'recommendation_performance',jsonb_build_object(
      'impressions',(select count(*) from current_events where event_name='product_impression' and metadata->>'source' in ('popular_products','home_collection','personal_recommendations')),
      'clicks',(select count(*) from current_events where event_name='product_click' and metadata->>'source' in ('popular_products','home_collection','personal_recommendations')),
      'click_rate',round(100.0*(select count(*) from current_events where event_name='product_click' and metadata->>'source' in ('popular_products','home_collection','personal_recommendations'))/nullif((select count(*) from current_events where event_name='product_impression' and metadata->>'source' in ('popular_products','home_collection','personal_recommendations')),0),1)
    ),
    'top_products',coalesce((select jsonb_agg(to_jsonb(t) order by t.impressions desc,t.clicks desc) from (
      select * from product_rows order by impressions desc,clicks desc limit 7
    ) t),'[]'::jsonb),
    'opportunities',coalesce((select jsonb_agg(to_jsonb(t) order by t.impressions desc) from (
      select product_id,name,impressions,clicks,cart_adds,click_rate
      from product_rows where impressions>=2 and (clicks=0 or coalesce(click_rate,0)<12) and cart_adds=0
      order by impressions desc limit 5
    ) t),'[]'::jsonb),
    'top_products_sold',coalesce((select jsonb_agg(to_jsonb(t) order by t.quantity desc) from (
      select item->>'name' as name,sum(case when coalesce(item->>'qty','')~'^[0-9]{1,3}$' then (item->>'qty')::integer else 1 end)::integer as quantity
      from current_orders o cross join lateral jsonb_array_elements(o.items) item
      where o.status in ('confirmed','preparing','processing','shipping','delivered')
      group by item->>'name' order by quantity desc limit 5
    ) t),'[]'::jsonb),
    'low_stock',coalesce((select jsonb_agg(jsonb_build_object('name',coalesce(name->>'az',id),'stock',stock_quantity)) from public.products where is_active and stock_quantity is not null and stock_quantity<5),'[]'::jsonb),
    'abandoned_carts',(select count(*) from public.abandoned_carts c where c.updated_at<now()-interval '1 hour' and c.updated_at>now()-interval '30 days' and jsonb_array_length(c.items)>0 and not exists(select 1 from public.orders o where o.user_id=c.user_id and o.created_at>=c.updated_at)),
    'abandoned_value',coalesce((select sum(c.total) from public.abandoned_carts c where c.updated_at<now()-interval '1 hour' and c.updated_at>now()-interval '30 days' and not exists(select 1 from public.orders o where o.user_id=c.user_id and o.created_at>=c.updated_at)),0)
  ) into report from bounds b;

  return report;
end;
$$;

revoke all on function public.store_weekly_report(text) from public,anon,authenticated;
grant execute on function public.store_weekly_report(text) to service_role;

