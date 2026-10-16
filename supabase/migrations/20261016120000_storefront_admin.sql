-- Product catalog, inventory, admin management, analytics and realtime order notices.
-- Safe to re-apply. Browser clients only use the public anon/publishable key.

alter table public.profiles add column if not exists is_admin boolean not null default false;

create table if not exists public.products (
  id text primary key,
  category text not null check (category in ('pillow','linen','duvet','bedcare','sleepwear','bath','accessory','gift')),
  name jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  price numeric(12,2) not null check (price >= 0),
  sale_price numeric(12,2) check (sale_price is null or (sale_price >= 0 and sale_price < price)),
  image_url text not null default '',
  material jsonb not null default '{}'::jsonb,
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storefront_events (
  id bigint generated always as identity primary key,
  event_name text not null check (event_name in ('page_view','product_view','product_click','add_to_cart','search','wishlist_add','order_created')),
  product_id text,
  session_id text not null,
  page text not null default '',
  referrer text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists storefront_events_created_at_idx on public.storefront_events (created_at desc);
create index if not exists storefront_events_name_idx on public.storefront_events (event_name, created_at desc);
create index if not exists orders_created_at_idx on public.orders (created_at desc);

create or replace function public.is_melatoni_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_admin = true
  );
$$;
revoke all on function public.is_melatoni_admin() from public;
grant execute on function public.is_melatoni_admin() to anon, authenticated;

create or replace function public.prevent_profile_admin_escalation()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is not null and new.is_admin is distinct from old.is_admin and not public.is_melatoni_admin() then
    raise exception 'Only a Melatoni administrator can change administrator access';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_protect_admin_flag on public.profiles;
create trigger profiles_protect_admin_flag
before update of is_admin on public.profiles
for each row execute function public.prevent_profile_admin_escalation();
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
for insert to authenticated with check ((select auth.uid()) = id and (not is_admin or public.is_melatoni_admin()));

alter table public.products enable row level security;
alter table public.storefront_events enable row level security;
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant insert on public.storefront_events to anon, authenticated;
grant select on public.storefront_events to authenticated;
grant update on public.orders to authenticated;

drop policy if exists products_read_active_or_admin on public.products;
create policy products_read_active_or_admin on public.products
for select to anon, authenticated using (is_active or public.is_melatoni_admin());
drop policy if exists products_admin_insert on public.products;
create policy products_admin_insert on public.products
for insert to authenticated with check (public.is_melatoni_admin());
drop policy if exists products_admin_update on public.products;
create policy products_admin_update on public.products
for update to authenticated using (public.is_melatoni_admin()) with check (public.is_melatoni_admin());
drop policy if exists products_admin_delete on public.products;
create policy products_admin_delete on public.products
for delete to authenticated using (public.is_melatoni_admin());

drop policy if exists events_public_insert on public.storefront_events;
create policy events_public_insert on public.storefront_events
for insert to anon, authenticated with check (length(session_id) between 8 and 100 and length(page) <= 500 and length(referrer) <= 500 and jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 4000);
drop policy if exists events_admin_read on public.storefront_events;
create policy events_admin_read on public.storefront_events
for select to authenticated using (public.is_melatoni_admin());

drop policy if exists orders_admin_read on public.orders;
create policy orders_admin_read on public.orders
for select to authenticated using (public.is_melatoni_admin());
drop policy if exists orders_admin_update on public.orders;
create policy orders_admin_update on public.orders
for update to authenticated using (public.is_melatoni_admin()) with check (public.is_melatoni_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('melatoni-products', 'melatoni-products', true, 5242880, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists melatoni_product_images_public_read on storage.objects;
create policy melatoni_product_images_public_read on storage.objects
for select to anon, authenticated using (bucket_id = 'melatoni-products');
drop policy if exists melatoni_product_images_admin_insert on storage.objects;
create policy melatoni_product_images_admin_insert on storage.objects
for insert to authenticated with check (bucket_id = 'melatoni-products' and public.is_melatoni_admin());
drop policy if exists melatoni_product_images_admin_update on storage.objects;
create policy melatoni_product_images_admin_update on storage.objects
for update to authenticated using (bucket_id = 'melatoni-products' and public.is_melatoni_admin()) with check (bucket_id = 'melatoni-products' and public.is_melatoni_admin());
drop policy if exists melatoni_product_images_admin_delete on storage.objects;
create policy melatoni_product_images_admin_delete on storage.objects
for delete to authenticated using (bucket_id = 'melatoni-products' and public.is_melatoni_admin());

-- Seed the current storefront catalog once. Admin edits are retained on re-application.
insert into public.products (id, category, name, description, price, sale_price, image_url, material)
select item->>'id', item->>'category', item->'name', item->'desc', (item->>'price')::numeric,
       nullif(item->>'salePrice','')::numeric, item->>'image', coalesce(item->'desc','{}'::jsonb)
from jsonb_array_elements($melatoni_seed$[{"id":"pillow-cloud","category":"pillow","name":{"az":"Cloud Comfort Yastıq","ru":"Подушка Cloud Comfort","en":"Cloud Comfort Pillow"},"desc":{"az":"Yumşaq dəstək · pambıq üzlük","ru":"Мягкая поддержка · хлопковый чехол","en":"Soft support · cotton cover"},"price":79,"salePrice":65,"image":"assets/products/pillow-cloud.jpg"},{"id":"pillow-balance","category":"pillow","name":{"az":"Balance Ortopedik Yastıq","ru":"Ортопедическая подушка Balance","en":"Balance Support Pillow"},"desc":{"az":"Yaddaş köpüyü · boyun dəstəyi","ru":"Пена с эффектом памяти · поддержка шеи","en":"Memory foam · gentle neck support"},"price":119,"salePrice":99,"image":"assets/products/pillow-balance.jpg"},{"id":"pillow-down","category":"pillow","name":{"az":"Feather Soft Yastıq","ru":"Мягкая подушка Feather Soft","en":"Feather Soft Pillow"},"desc":{"az":"Yüngül dolğu · rahat forma","ru":"Лёгкий наполнитель · удобная форма","en":"Light fill · a comfortable shape"},"price":99,"image":"assets/products/pillow-down.jpg"},{"id":"linen-calm","category":"linen","name":{"az":"Calm Linen Yataq Dəsti","ru":"Комплект постельного белья Calm Linen","en":"Calm Linen Bedding Set"},"desc":{"az":"Nəfəs alan pambıq · təbii tekstura","ru":"Дышащий хлопок · натуральная фактура","en":"Breathable cotton · natural texture"},"price":189,"salePrice":159,"image":"assets/products/linen-calm.jpg"},{"id":"linen-percale","category":"linen","name":{"az":"Pure Percale Yataq Dəsti","ru":"Комплект Pure Percale","en":"Pure Percale Bedding Set"},"desc":{"az":"Xırtıldayan pambıq · sərin toxunuş","ru":"Хрустящий хлопок · прохладное прикосновение","en":"Crisp cotton · a cool, clean feel"},"price":229,"image":"assets/products/linen-percale.jpg"},{"id":"linen-satin","category":"linen","name":{"az":"Silk Touch Yataq Dəsti","ru":"Комплект Silk Touch","en":"Silk Touch Bedding Set"},"desc":{"az":"İpək kimi yumşaqlıq · pambıq satin","ru":"Шёлковая мягкость · хлопковый сатин","en":"Silky softness · cotton sateen"},"price":279,"image":"assets/products/linen-satin.jpg"},{"id":"duvet-dream","category":"duvet","name":{"az":"Dream Balance Yorğan","ru":"Одеяло Dream Balance","en":"Dream Balance Duvet"},"desc":{"az":"Yüngül istilik · dörd fəsil üçün","ru":"Лёгкое тепло · на все сезоны","en":"Light warmth · made for every season"},"price":149,"salePrice":125,"image":"assets/products/duvet-dream.jpg"},{"id":"duvet-airy","category":"duvet","name":{"az":"Airy Summer Yorğan","ru":"Летнее одеяло Airy","en":"Airy Summer Duvet"},"desc":{"az":"Yüngül və nəfəs alan dolğu","ru":"Лёгкое дышащее наполнение","en":"Light, breathable filling"},"price":119,"image":"assets/products/duvet-airy.jpg"},{"id":"duvet-winter","category":"duvet","name":{"az":"Winter Cloud İsti Yorğan","ru":"Тёплое одеяло Winter Cloud","en":"Winter Cloud Warm Duvet"},"desc":{"az":"Yumşaq istilik · soyuq gecələr üçün","ru":"Мягкое тепло · для прохладных ночей","en":"Soft warmth · for cooler nights"},"price":199,"image":"assets/products/duvet-winter.jpg"},{"id":"protector-pure","category":"bedcare","name":{"az":"Pure Döşək Qoruyucusu","ru":"Наматрасник Pure","en":"Pure Mattress Protector"},"desc":{"az":"Yumşaq qoruma · rahat gecələr","ru":"Мягкая защита · комфортный сон","en":"Soft protection · peaceful sleep"},"price":69,"image":"assets/products/protector-pure.jpg"},{"id":"sheet-cloud","category":"bedcare","name":{"az":"Cloud Fit Çarşaf","ru":"Простыня Cloud Fit","en":"Cloud Fit Fitted Sheet"},"desc":{"az":"Elastik kənar · pambıq rahatlığı","ru":"Эластичный край · хлопковый комфорт","en":"Elasticated edge · cotton comfort"},"price":59,"salePrice":49,"image":"assets/products/sheet-cloud.jpg"},{"id":"mattress-rest","category":"bedcare","name":{"az":"Rest Ortopedik Döşək","ru":"Ортопедический матрас Rest","en":"Rest Support Mattress"},"desc":{"az":"Balanslı dəstək · orta sərtlik","ru":"Сбалансированная поддержка · средняя жёсткость","en":"Balanced support · medium feel"},"price":379,"image":"assets/products/mattress-rest.jpg"},{"id":"throw-knit","category":"accessory","name":{"az":"Soft Knit Plaid","ru":"Плед Soft Knit","en":"Soft Knit Throw"},"desc":{"az":"Toxunma naxış · rahat axşamlar","ru":"Фактурная вязка · уютные вечера","en":"Textured knit · slower evenings"},"price":119,"salePrice":99,"image":"assets/products/throw-knit.jpg"},{"id":"candle-night","category":"accessory","name":{"az":"Evening Yuxu Şamı","ru":"Аромасвеча Evening","en":"Evening Sleep Candle"},"desc":{"az":"Zərif ətir · sakit axşam ritualı","ru":"Нежный аромат · вечерний ритуал","en":"A gentle scent · an evening ritual"},"price":39,"image":"assets/products/candle-night.jpg"},{"id":"diffuser-calm","category":"accessory","name":{"az":"Calm Otaq Diffuzoru","ru":"Аромадиффузор Calm","en":"Calm Room Diffuser"},"desc":{"az":"Yumşaq aroma · uzunmüddətli təravət","ru":"Мягкий аромат · длительная свежесть","en":"Subtle fragrance · lasting freshness"},"price":59,"image":"assets/products/diffuser-calm.jpg"},{"id":"mask-silk","category":"accessory","name":{"az":"Silk Rest Göz Maskası","ru":"Шёлковая маска Silk Rest","en":"Silk Rest Eye Mask"},"desc":{"az":"Yumşaq satin · rahat istirahət","ru":"Мягкий сатин · спокойный отдых","en":"Soft satin · a little more rest"},"price":29,"image":"assets/products/mask-silk.jpg"},{"id":"robe-soft","category":"sleepwear","name":{"az":"Soft Touch Xalat","ru":"Халат Soft Touch","en":"Soft Touch Robe"},"desc":{"az":"Zərif toxunuş · gündəlik rahatlıq","ru":"Нежное прикосновение · ежедневный уют","en":"Gentle touch · everyday comfort"},"price":99,"salePrice":79,"image":"assets/products/robe-soft.jpg"},{"id":"pajama-cotton","category":"sleepwear","name":{"az":"Cotton Rest Pijama Dəsti","ru":"Пижамный комплект Cotton Rest","en":"Cotton Rest Pajama Set"},"desc":{"az":"Nəfəs alan pambıq · rahat gecə geyimi","ru":"Дышащий хлопок · комфорт для сна","en":"Breathable cotton · made for winding down"},"price":129,"salePrice":109,"image":"assets/products/pajama-cotton.png"},{"id":"slippers-cloud","category":"sleepwear","name":{"az":"Cloud Ev Başmağı","ru":"Домашние тапочки Cloud","en":"Cloud House Slippers"},"desc":{"az":"Yumşaq içlik · rahat addımlar","ru":"Мягкая стелька · лёгкий шаг","en":"Plush lining · easy steps"},"price":45,"image":"assets/products/slippers-cloud.jpg"},{"id":"towel-spa","category":"bath","name":{"az":"Spa Pambıq Dəsmal Dəsti","ru":"Набор полотенец Spa","en":"Spa Cotton Towel Set"},"desc":{"az":"Yumşaq pambıq · yüksək hopdurma","ru":"Мягкий хлопок · высокая впитываемость","en":"Soft cotton · absorbent and plush"},"price":89,"salePrice":75,"image":"assets/products/towel-spa.jpg"},{"id":"gift-rest","category":"gift","name":{"az":"Restful Hədiyyə Dəsti","ru":"Подарочный набор Restful","en":"Restful Gift Set"},"desc":{"az":"Yuxu ritualı üçün zərif seçim","ru":"Нежный набор для ритуала сна","en":"A thoughtful set for a bedtime ritual"},"price":159,"salePrice":135,"image":"assets/products/gift-rest.jpg"}]$melatoni_seed$::jsonb) as item
on conflict (id) do nothing;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
      alter publication supabase_realtime add table public.orders;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products') then
      alter publication supabase_realtime add table public.products;
    end if;
  end if;
end $$;

-- To grant the store operator access after creating their account, run in Supabase SQL Editor:
-- update public.profiles set is_admin = true
-- where id = (select id from auth.users where email = 'YOUR_LOGIN_EMAIL');
