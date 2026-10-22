-- Melatoni order automation, customer snapshots, controlled status transitions,
-- atomic stock changes, and durable notification jobs. No existing rows are deleted.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;

alter table public.orders
  add column if not exists order_number text,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists customer_email text,
  add column if not exists shipping_address jsonb,
  add column if not exists payment_method text,
  add column if not exists payment_status text,
  add column if not exists delivery_fee numeric(12,2) check (delivery_fee is null or delivery_fee >= 0),
  add column if not exists discount_amount numeric(12,2) check (discount_amount is null or discount_amount >= 0),
  add column if not exists coupon_code text;

-- Preserve all existing orders unchanged. New checkout orders receive their
-- order number in create_store_order; historical rows can keep a NULL number.
create unique index if not exists orders_order_number_uidx on public.orders(order_number)
  where order_number is not null;

alter table public.orders drop constraint if exists orders_status_check;
-- Retain the legacy value without rewriting historical status data.
alter table public.orders add constraint orders_status_check
  check (status in ('pending','confirmed','preparing','processing','shipping','delivered','cancelled'));

alter table public.customer_preferences
  add column if not exists cart_reminders_consent boolean not null default false,
  add column if not exists cart_reminders_consent_at timestamptz;

create table if not exists public.stock_audit_log (
  id bigint generated always as identity primary key,
  product_id text not null references public.products(id) on delete restrict,
  old_quantity integer,
  new_quantity integer,
  changed_by uuid references auth.users(id) on delete set null,
  reason text not null default 'admin_update',
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists stock_audit_log_created_idx on public.stock_audit_log(created_at desc);
create index if not exists stock_audit_log_product_idx on public.stock_audit_log(product_id, created_at desc);
alter table public.stock_audit_log enable row level security;
revoke all on public.stock_audit_log from anon, authenticated;
grant select on public.stock_audit_log to authenticated;
drop policy if exists stock_audit_admin_read on public.stock_audit_log;
create policy stock_audit_admin_read on public.stock_audit_log
  for select to authenticated using (public.is_melatoni_admin());

create table if not exists public.store_automation_queue (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('order_created','order_status','low_stock')),
  order_id uuid references public.orders(id) on delete cascade,
  product_id text references public.products(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  admin_email_sent_at timestamptz,
  customer_email_sent_at timestamptz,
  sent_at timestamptz,
  last_error text,
  check ((event_type in ('order_created','order_status') and order_id is not null)
      or (event_type = 'low_stock' and product_id is not null))
);
create index if not exists store_automation_queue_pending_idx
  on public.store_automation_queue(next_attempt_at, created_at) where sent_at is null;
alter table public.store_automation_queue enable row level security;
revoke all on public.store_automation_queue from anon, authenticated;

create table if not exists public.order_lookup_attempts (
  fingerprint text primary key check (fingerprint ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0
);
alter table public.order_lookup_attempts enable row level security;
revoke all on public.order_lookup_attempts from anon, authenticated;

create table if not exists public.support_escalations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  contact_name text not null check (char_length(contact_name) between 2 and 120),
  contact_email text not null check (char_length(contact_email) <= 254),
  contact_phone text not null check (char_length(contact_phone) between 5 and 40),
  message text not null check (char_length(message) between 5 and 2000),
  status text not null default 'open' check (status in ('open','in_progress','closed')),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_escalations_created_idx on public.support_escalations(created_at desc);
alter table public.support_escalations enable row level security;
grant select, update on public.support_escalations to authenticated;
drop policy if exists support_escalations_admin_read on public.support_escalations;
create policy support_escalations_admin_read on public.support_escalations
  for select to authenticated using (public.is_melatoni_admin());
drop policy if exists support_escalations_admin_update on public.support_escalations;
create policy support_escalations_admin_update on public.support_escalations
  for update to authenticated using (public.is_melatoni_admin())
  with check (public.is_melatoni_admin());

alter table public.store_automation_queue
  add column if not exists support_escalation_id uuid references public.support_escalations(id) on delete cascade;
alter table public.store_automation_queue drop constraint if exists store_automation_queue_event_type_check;
alter table public.store_automation_queue add constraint store_automation_queue_event_type_check
  check (event_type in ('order_created','order_status','low_stock','support_escalation'));
alter table public.store_automation_queue drop constraint if exists store_automation_queue_check;
alter table public.store_automation_queue drop constraint if exists store_automation_queue_target_check;
alter table public.store_automation_queue add constraint store_automation_queue_target_check
  check ((event_type in ('order_created','order_status') and order_id is not null)
      or (event_type = 'low_stock' and product_id is not null)
      or (event_type = 'support_escalation' and support_escalation_id is not null));

create or replace function public.audit_product_stock_change()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  if new.stock_quantity is distinct from old.stock_quantity then
    insert into public.stock_audit_log(product_id,old_quantity,new_quantity,changed_by,reason,order_id)
    values (
      new.id, old.stock_quantity, new.stock_quantity, auth.uid(),
      coalesce(nullif(current_setting('melatoni.stock_reason', true), ''), 'admin_update'),
      nullif(current_setting('melatoni.order_id', true), '')::uuid
    );
    if old.stock_quantity is not null and new.stock_quantity is not null
       and old.stock_quantity >= 5 and new.stock_quantity < 5 then
      insert into public.store_automation_queue(event_type,product_id,payload)
      values ('low_stock',new.id,jsonb_build_object('stock_quantity',new.stock_quantity));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists products_audit_stock_change on public.products;
create trigger products_audit_stock_change after update of stock_quantity on public.products
for each row execute function public.audit_product_stock_change();



-- Add the existing locally bundled, priced SKUs to the server-authoritative catalog.
-- Existing product rows and stock counts are preserved; new SKUs start with unknown stock (NULL).
insert into public.products(id,category,name,description,price,sale_price,image_url,material,stock_quantity,is_active) values
('pillow-side-cloud','pillow','{"az":"Side Comfort Yastıq","ru":"Подушка Side Comfort","en":"Side Comfort Pillow"}'::jsonb,'{"az":"Yan üstə yatanlar üçün daha dolğun, yumşaq dəstək; hündürlük və dolğunluq sifariş zamanı təsdiqlənir.","ru":"Более объёмная мягкая поддержка для сна на боку; высота и плотность подтверждаются при заказе.","en":"A fuller, softer feel for side sleepers; loft and fill are confirmed when ordering."}'::jsonb,89.0,null,'assets/products/pillow-cloud.jpg','{}'::jsonb),
('pillow-cool-rest','pillow','{"az":"Cool Rest Yastıq","ru":"Подушка Cool Rest","en":"Cool Rest Pillow"}'::jsonb,'{"az":"Yüngül və sərin hiss üçün nəzərdə tutulmuş rahat yastıq; örtük və dolğu məlumatı sifariş zamanı dəqiqləşdirilir.","ru":"Комфортная подушка с лёгким ощущением прохлады; состав чехла и наполнителя уточняется при заказе.","en":"A comfortable pillow with a light, cool feel; cover and fill details are confirmed when ordering."}'::jsonb,109.0,null,'assets/products/pillow-cloud.jpg','{}'::jsonb),
('pillow-support-high','pillow','{"az":"High Support Yastıq","ru":"Подушка High Support","en":"High Support Pillow"}'::jsonb,'{"az":"Daha hündür və dəstəkləyici forma axtaranlar üçün; uyğun ölçü və sərtlik WhatsApp-da dəqiqləşdirilir.","ru":"Для тех, кто предпочитает более высокую и поддерживающую форму; размер и упругость уточняются в WhatsApp.","en":"For sleepers who prefer a higher, more supportive shape; size and firmness are confirmed on WhatsApp."}'::jsonb,119.0,null,'assets/products/pillow-balance.jpg','{}'::jsonb),
('pillow-duo-rest','pillow','{"az":"Duo Rest Yastıq Dəsti","ru":"Набор подушек Duo Rest","en":"Duo Rest Pillow Pair"}'::jsonb,'{"az":"Yataq otağı üçün iki uyğun yastıqdan ibarət dəst; ölçü və rəng seçimi sifarişdən əvvəl təsdiqlənir.","ru":"Комплект из двух сочетающихся подушек; размер и цвет подтверждаются перед заказом.","en":"A matching pair of pillows for your bed; size and color are confirmed before ordering."}'::jsonb,149.0,null,'assets/products/pillow-cloud.jpg','{}'::jsonb),
('linen-tencel-touch','linen','{"az":"Tencel Touch Yataq Dəsti","ru":"Комплект Tencel Touch","en":"Tencel Touch Bedding Set"}'::jsonb,'{"az":"Hamar, yüngül toxunuşlu yataq dəsti seçimi. Parça tərkibi, ölçü və komplektasiya sifarişdən əvvəl təsdiqlənir.","ru":"Гладкий и лёгкий комплект постельного белья. Состав ткани, размер и комплектность подтверждаются перед заказом.","en":"A smooth, lightweight bedding option. Fabric content, sizing, and set contents are confirmed before ordering."}'::jsonb,219.0,null,'assets/products/linen-calm.jpg','{}'::jsonb),
('linen-cotton-blend','linen','{"az":"Everyday Yataq Dəsti","ru":"Комплект Everyday","en":"Everyday Bedding Set"}'::jsonb,'{"az":"Gündəlik istifadə üçün rahat yataq dəsti. Ölçü, rəng və dəstə daxil olan parçalar sifariş zamanı dəqiqləşdirilir.","ru":"Удобный комплект для повседневного использования. Размер, цвет и состав комплекта уточняются при заказе.","en":"An easy everyday bedding set. Size, color, and included pieces are confirmed when ordering."}'::jsonb,169.0,null,'assets/products/linen-percale.jpg','{}'::jsonb),
('linen-winter-soft','linen','{"az":"Winter Soft İsti Yataq Dəsti","ru":"Тёплый комплект Winter Soft","en":"Winter Soft Bedding Set"}'::jsonb,'{"az":"Soyuq mövsüm üçün yumşaq və isti hiss verən yataq dəsti. Parça və ölçü mövcudluğu sifariş zamanı təsdiqlənir.","ru":"Мягкий и тёплый комплект для прохладного сезона. Наличие ткани и размеров подтверждается при заказе.","en":"A soft, warm-feel bedding option for cooler nights. Fabric and sizing are confirmed when ordering."}'::jsonb,239.0,null,'assets/products/linen-satin.jpg','{}'::jsonb),
('pillowcase-pair-soft','linen','{"az":"Soft Touch Yastıq Üzü Dəsti","ru":"Комплект наволочек Soft Touch","en":"Soft Touch Pillowcase Pair"}'::jsonb,'{"az":"Yastıqlarınızı yataq dəstinizlə uyğunlaşdırmaq üçün iki üzlük. Ölçü, rəng və parça tərkibi sifarişdən əvvəl təsdiqlənir.","ru":"Две наволочки, которые легко сочетать с постельным бельём. Размер, цвет и состав подтверждаются перед заказом.","en":"Two pillowcases to coordinate with your bedding. Size, color, and fabric details are confirmed before ordering."}'::jsonb,49.0,null,'assets/products/linen-calm.jpg','{}'::jsonb),
('duvet-summer-light','duvet','{"az":"Summer Light Yay Yorğanı","ru":"Летнее одеяло Summer Light","en":"Summer Light Duvet"}'::jsonb,'{"az":"İsti gecələrdə daha yüngül örtük istəyənlər üçün. Dolğu, ölçü və qulluq qaydaları sifariş zamanı dəqiqləşdirilir.","ru":"Лёгкое одеяло для тёплых ночей. Наполнитель, размер и уход уточняются при заказе.","en":"A lighter cover for warm nights. Fill, size, and care details are confirmed when ordering."}'::jsonb,109.0,null,'assets/products/duvet-airy.jpg','{}'::jsonb),
('duvet-four-season','duvet','{"az":"Four Season Yorğan","ru":"Одеяло Four Season","en":"Four Season Duvet"}'::jsonb,'{"az":"İlboyu istifadə üçün nəzərdə tutulan orta istilikli seçim. Ölçü və dolğu məlumatı sifarişdən əvvəl təsdiqlənir.","ru":"Вариант средней теплоты для использования круглый год. Размер и наполнитель подтверждаются перед заказом.","en":"A medium-warmth option for year-round use. Size and fill details are confirmed before ordering."}'::jsonb,169.0,null,'assets/products/duvet-dream.jpg','{}'::jsonb),
('linen-wedding-set','linen','{"az":"Cehizlik Yataq Dəsti","ru":"Комплект постельного белья для свадьбы","en":"Wedding Bedding Set"}'::jsonb,'{"az":"Xüsusi günlər və hədiyyə üçün zərif yataq dəsti seçimi. Parça, ölçü və dəstə daxil olan məhsullar sifarişdən əvvəl təsdiqlənir.","ru":"Элегантный комплект для особого события или подарка. Ткань, размер и состав подтверждаются перед заказом.","en":"A considered bedding choice for a special occasion or gift. Fabric, sizing, and set contents are confirmed before ordering."}'::jsonb,289.0,null,'assets/products/linen-satin.jpg','{}'::jsonb),
('linen-kids-dream','linen','{"az":"Little Dream Uşaq Yataq Dəsti","ru":"Детский комплект Little Dream","en":"Little Dream Kids Bedding Set"}'::jsonb,'{"az":"Uşaq yatağı üçün yumşaq, sakit rəngli yataq dəsti. Dəqiq ölçü, naxış və parça tərkibi sifariş zamanı dəqiqləşdirilir.","ru":"Комплект спокойных оттенков для детской кровати. Размер, рисунок и состав ткани уточняются при заказе.","en":"A calm-toned bedding choice for a child''s bed. Exact size, print, and fabric content are confirmed when ordering."}'::jsonb,159.0,null,'assets/products/melatoni-mini/mini-star-bedding.webp','{}'::jsonb)
on conflict(id) do nothing;

create table if not exists public.quote_only_catalog (
  id text primary key,
  category text not null check (category in ('pillow','linen','duvet','bedcare','sleepwear','bath','accessory','gift')),
  name jsonb not null,
  description jsonb not null default '{}'::jsonb,
  material jsonb not null default '{}'::jsonb,
  brand text not null,
  image_url text not null default ''
);
alter table public.quote_only_catalog enable row level security;
revoke all on public.quote_only_catalog from public, anon, authenticated;
insert into public.quote_only_catalog(id,category,name,description,material,brand,image_url) values
('markcross-velvet-sheet-set-with-lace-trim','linen','{"en":"Velvet Sheet Set with Lace Trim","az":"Velvet krujevalı yataq dəsti"}'::jsonb,'{"en":"The Velvet Sheet Set with Lace Trim draws inspiration from the Archibald collection of Italian furniture brand Poltrona Frau. The designer captures its signature structural aesthetics, focusing on the most essential lines and meticulously capturing the captivating interplay of light and shadow created by these lines. Here, the beauty of rational lines contrasts subtly with the soft texture of the space, paying homage to Poltrona Frau''s design language while constructing a warm and aesthetically pleasing sleeping space.","az":"Zərif xəttləri və krujeva kənarlarını vurğulayan yumşaq məxmər səthli dəst. Mark Cross təsvirində dolğun, sıx xovlu süni dovşan xəzi toxuması və 3D naxışlı çiçək detalları qeyd olunur."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-velvet-sheet-set-with-lace-trim.jpg'),
('markcross-luxury-faux-fur-sheet-set','linen','{"en":"Luxury Faux Fur Sheet Set","az":"Yumşaq süni xəz yataq dəsti"}'::jsonb,'{"en":"The Luxury Faux Fur Sheet Set utilizes eco-friendly faux fur technology to mimic the rich texture of fur. The addition of a 3D embossed floral pattern enhances the fineness and fullness of the fleece, creating a soft and fluffy feel, like cradling a small animal in your arms, gently cradling your body. Its highly efficient heat-locking structure provides instant warmth upon entry, quickly dispelling any chill, offering just the right amount of warmth without feeling dry or stuffy. Enjoy a restful night''s sleep, accompanied by its warm and soft comfort.","az":"Ekoloji süni xəz görünüşlü, 3D çiçək naxışlı dolğun parça. İstehsalçı təsvirinə görə istiliyi yaxşı saxlayır və soyuq yataq hissini tez aradan qaldırır."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-luxury-faux-fur-sheet-set.jpg'),
('markcross-winter-floral-fleece-sheet-set','linen','{"en":"Winter Floral Fleece Sheet Set","az":"Qış çiçək naxışlı fleece dəst"}'::jsonb,'{"en":"The Winter Floral Fleece Sheet Set features a short-pile design that''s as addictive to the touch as petting a cat. Made with premium DTY120 ultrafine yarn and a 300+ gram high-density fleece woven in A-grade fabric, it boasts a rich and thick feel. It effectively locks in warmth, allowing heat to spread and diffuse throughout the body, providing instant warmth to the touch. Romantic floral prints add a touch of elegance, combining warmth and beauty.","az":"Qısa xovlu, yumşaq səth və romantik çiçək naxışı. Mark Cross 120D incə iplik və 300 qramdan ağır sıx fleece toxumasını istilik saxlayan quruluş kimi təqdim edir."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-winter-floral-fleece-sheet-set.jpg'),
('markcross-yarn-dyed-jacquard-velvet-sheet-set','linen','{"en":"Yarn Dyed Jacquard Velvet Sheet Set","az":"İplikdən boyanmış jakarlı velvet dəst"}'::jsonb,'{"en":"The Yarn Dyed Jacquard Velvet Sheet Set utilizes Polar Bear Biomimetic Fleece 2.0 technology to reshape the sleep microenvironment in terms of breathability, warmth, and mite prevention. Regarding temperature and humidity balance, it maintains the sleep environment within the golden humidity range of 40%-60%, with a water absorption rate exceeding national standards by 13.6 times and a drying speed reaching 1.85 times the national standard.","az":"Nəfəsalma və istilik balansı üçün nəzərdə tutulan sıx jakarlı fleece toxuması. İstehsalçı təsvirində nəm balansı və tez quruma xüsusiyyəti vurğulanır."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-yarn-dyed-jacquard-velvet-sheet-set.jpg'),
('markcross-3d-embossed-milk-fleece-antibacterial-sheet-set','linen','{"en":"3D Embossed Milk Fleece Antibacterial Sheet Set","az":"3D naxışlı milk fleece yataq dəsti"}'::jsonb,'{"en":"The 3D Embossed Milk Fleece Antibacterial Sheet Set brings Bottega Veneta''s tassel aesthetics to life with the gentle fabric of warm fleece. We captured the dynamic interplay of light and shadow in the dangling, swaying tassels, transforming it into a visual rhythm of varying shades on the fleece surface, freezing the flowing lines onto the fabric. The tassels break the order of the wood grain, introducing an irregular, handcrafted feel and draped lines, much like BV''s philosophy of juxtaposing meticulous leather with flowing tassels. This is not merely bedding; it is an interpretation of contemporary home aesthetics that find depth in simplicity.","az":"İsti və yumşaq fleece üzərində relyefli xətt və saçaq detalları. Teksturanın kölgə və naxış oyunları yatağa ifadəli görünüş verir."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-3d-embossed-milk-fleece-antibacterial-sheet-set.jpg'),
('markcross-tone-on-tone-jacquard-sheet-set','linen','{"en":"Tone on Tone Jacquard Sheet Set","az":"Ton-ton jakarlı yataq dəsti"}'::jsonb,'{"en":"The Tone on Tone Jacquard Sheet Set uses color as its core design language. Breaking away from the monotonous color schemes of conventional bedding, it employs dreamy and romantic color combinations to inject freshness and vitality into the home space. The design revolves around patterns such as fresh florals, retro paisley, and artistic geometric shapes, combined with soft-focus colors and a dreamy Eden concept, allowing art and nature to intertwine on the fabric. Multiple sophisticated elements are layered, and the subtle jacquard weave technique makes the patterns appear and disappear, creating rich layers without being ostentatious.","az":"Yumşaq rəng keçidləri ilə çiçək, paisley və həndəsi naxışları birləşdirən jakarlı toxuma. Səthdə naxışlar zərif görünür, ümumi görünüş isə sakit qalır."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-tone-on-tone-jacquard-sheet-set.jpg'),
('markcross-luxury-cutwork-sheet-set','linen','{"en":"Luxury Cutwork Sheet Set","az":"Zərif ajur naxışlı yataq dəsti"}'::jsonb,'{"en":"Openwork and lace, as core elements of spring and summer, possess a strong fashion gene and can be played with in different ways by different designers, ranging from charming and sexy to dynamic and energetic. The Luxury Cutwork Sheet Set features delicate openwork lace created through knitting and hand-crocheting, maintaining a clean and simple design while crafting a rustic, handmade feel. Contrasting wide ruffles add a sense of layering, exuding a serene aristocratic feel, and a noble and mysterious image that resonates deeply.","az":"Açıq işləmə krujeva detalları və enli büzməli kənarları olan yüngül görünüşlü dəst. Toxuma əl işi təsiri və zərif qatlı görünüş yaradır."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-luxury-cutwork-sheet-set.jpg'),
('markcross-tencel-egyptian-cotton-sheet-set','linen','{"en":"Tencel Egyptian Cotton Sheet Set","az":"Tencel və Misir pambığı yataq dəsti"}'::jsonb,'{"en":"The Tencel Egyptian Cotton Sheet Set is crafted from two rare fibers: Austrian 0.9dtex ultra-fine Tencel and Nile Egyptian long-staple cotton. Tencel, finer than silk, provides a naturally cool touch; Egyptian cotton fibers are up to 35mm long, representing only 1% of global production, possessing a lustrous sheen and resisting aging after washing. The high-count, high-density weave creates a smooth, satin-like fabric with a low coefficient of friction of 0.2, ensuring a smooth, frictionless feel against the skin. It is highly breathable, non-sticky, and non-stuffy. The dyes meet zero-allergenic standards, and there is no formaldehyde or fluorescent additive, making it safe for sensitive skin.","az":"İncə Tencel lifləri və uzun lifli Misir pambığını birləşdirən hamar, sərin toxunuşlu parça. İstehsalçı nəfəsalan, dəriyə yüngül hiss verən satinəbənzər səthini vurğulayır."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-tencel-egyptian-cotton-sheet-set.jpg'),
('markcross-printed-brushed-sheet-set','linen','{"en":"Printed Brushed Sheet Set","az":"Fırçalanmış naxışlı yataq dəsti"}'::jsonb,'{"en":"The Printed Brushed Sheet Set combines lightweight, silky Austrian superfine Tencel with soft, skin-friendly Xinjiang Awati long-staple cotton. A gentle brushing process creates a delicate, warm fleece layer on the surface, offering a soft, breathable, and comfortable feel. The unique fiber structure ensures excellent airflow, providing just the right amount of warmth, making it ideal for autumn and winter. The printed pattern adds a touch of warmth and silkiness, ensuring a light and cozy sleep.","az":"Tencel və uzun lifli pambığın qarışığına incə fırçalama ilə yumşaq səth verilir. Nəfəsalan toxuma payız və qışda yüngül istilik üçün nəzərdə tutulub."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-printed-brushed-sheet-set.jpg'),
('markcross-french-lace-edge-sheet-set','linen','{"en":"French Lace Edge Sheet Set","az":"Fransız krujevalı kənar yataq dəsti"}'::jsonb,'{"en":"Inspired by the iconic three-dimensional lace technique of the French brand Yves Delorme, the French Lace Edge Sheet Set features three-dimensional cut-out lace along the edges of the bedding, delicately outlining irregularly scattered cherry blossom and rose petals. Each petal is connected by delicate, gossamer-like veins, as if gently blown by a breeze, naturally spreading across the fabric to create a dynamic and breathtaking scene. This design gently captures the fleeting moments of nature''s fall, infusing the bedroom space with a tranquil and romantic atmosphere.","az":"Kənarlardakı üçölçülü krujeva və çiçək ləçəyi motivləri yatağa romantik, zərif görünüş verir. Detallar parçanın üzərində yüngül və hərəkətli təsir yaradır."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-french-lace-edge-sheet-set.jpg'),
('markcross-printed-floral-sheet-set','linen','{"en":"Printed Floral Sheet Set","az":"Çiçək naxışlı Tencel yataq dəsti"}'::jsonb,'{"en":"The Printed Floral Sheet Set is made from premium Austrian Lenzing Tencel, offering a delicate, smooth, soft, and comfortable feel, perfect for sensitive skin to sleep in without. The fine, natural plant fibers interwoven create a fabric that is cool and gentle on the skin, highly absorbent and breathable, combining a luxurious feel with eco-friendly properties. It possesses the luxurious and flowing quality of silk, with a fresh, soft matte sheen that exudes elegant femininity, inspiring endless beautiful daydreams.","az":"Avstriya Lenzing Tencel liflərindən hazırlanmış hamar və yumşaq toxunuşlu parça. İstehsalçı sərinlik, nəfəsalma və həssas dəri üçün zərif hissi qeyd edir."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-printed-floral-sheet-set.jpg'),
('markcross-letter-embroidered-sheet-set','linen','{"en":"Letter Embroidered Sheet Set","az":"Hərf naxışlı tikmə yataq dəsti"}'::jsonb,'{"en":"The Letter Embroidered Sheet Set embodies the essence of minimalism with its simple yet sophisticated design. The use of pure white space sparks boundless spatial imagination while perfectly combining practical functionality. The brand''s \\"M\\" letter embroidery adds a delicate finishing touch, subtly integrated with gold thread to create a unique display of detail. Wide fringed edges and piping edging enhance the sense of layering and visual impact, allowing one to perceive a deep-seated, passionate yearning for a beautiful life within its refined taste.","az":"Ağ sahə üzərində zərif hərf tikməsi, qızılı sap detalı, enli saçaq və kant kənarları. Minimal görünüşündə incə işləmələr və qatlı tekstura seçilir."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-letter-embroidered-sheet-set.jpg'),
('markcross-tencel-sheet-set-with-lace-trim','linen','{"en":"Tencel Sheet Set with Lace Trim","az":"Krujeva haşiyəli Tencel yataq dəsti"}'::jsonb,'{"en":"The Tencel Sheet Set with Lace Trim features imported water-soluble lace trim with a delicate openwork texture, reminiscent of classic European court craftsmanship. Every stitch weaves a floral curve, creating a subtly luxurious and romantic visual feast, filling the bedroom with a sense of sophistication. When the free-spiritedness of Bohemian style meets the refined elegance of French lace, it bestows upon sleep a luxurious experience that blends dynamism and romance.","az":"Su ilə həll olunan incə krujeva haşiyəsi və çiçək motivli tikişlər romantik görünüş yaradır. Tencel parça dəstə hamar və yüngül toxunuş bəxş edir."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-tencel-sheet-set-with-lace-trim.jpg'),
('markcross-premium-tencel-lyocell-sheet-set','linen','{"en":"Premium Tencel Lyocell Sheet Set","az":"Premium Tencel Lyocell yataq dəsti"}'::jsonb,'{"en":"Light and shadow play a crucial role in the perception of urban dwellers and the creation of spatial atmosphere. The Premium Tencel Lyocell Sheet Set , through its unique openwork design, imbues the space with a dynamic beauty, creating a visually soothing effect. In the development of the Spring/Summer 2024 product line, the designers paid special attention to the presentation of natural dynamism and light and shadow effects. The minimalist base color, with its elegant undertones, exudes a natural feel, conveying a sense of lightness, freshness, and romance.","az":"Minimal əsas rəng və açıq işləmə detalları ilə yüngül görünüşlü dəst. Dizayn təbii dinamika, işıq-kölgə oyunu və sakit yataq otağı atmosferi üzərində qurulub."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-premium-tencel-lyocell-sheet-set.jpg'),
('markcross-solid-color-tencel-lyocell-sheet-set','linen','{"en":"Solid Color Tencel Lyocell Sheet Set","az":"Bircins rəngli Tencel Lyocell yataq dəsti"}'::jsonb,'{"en":"The Solid Color Tencel Lyocell Sheet Set is made with 100-count ultra-fine denier Tencel from Austria, with a fiber fineness of only 0.9 dtex. The raw material is natural wood pulp fiber sourced from pristine European forests, making it environmentally friendly and natural. The high-count, high-density fine spinning process results in a silky smooth surface surpassing even satin. SGS testing shows it has superior friction compared to silk, making it gentle and smooth against the skin during rollovers. The product is SGS certified, meeting Class A safety standards for mothers and babies, and is hypoallergenic, making it especially suitable for families with sensitive skin and infants.","az":"Avstriya mənşəli incə lifli Tencel Lyocell-dən hazırlanmış hamar, ipəkvari səth. İstehsalçı ağac sellülozasından alınan lif və sıx toxuma quruluşunu vurğulayır."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-solid-color-tencel-lyocell-sheet-set.jpg'),
('markcross-thick-brushed-warm-sheet-set','linen','{"en":"Thick Brushed Warm Sheet Set","az":"Qalın fırçalanmış isti yataq dəsti"}'::jsonb,'{"en":"The Thick Brushed Warm Sheet Set is made from premium Aksu long-staple cotton from Xinjiang, known for its long and resilient fibers. The brushed finish creates a delicate, soft, and comfortable surface, offering a luxurious yet gentle feel against the skin. It retains the natural texture of cotton without adding any extra burden, allowing you to relax and fall asleep in a secure embrace.","az":"Uzun lifli pambıqdan hazırlanmış, fırçalanmış yumşaq səthli dəst. Zərif və isti toxunuşu sərin mövsümlərdə əlavə rahatlıq üçün nəzərdə tutulub."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-thick-brushed-warm-sheet-set.jpg'),
('markcross-cutwork-lace-sheet-set','linen','{"en":"Cutwork Lace Sheet Set","az":"Ajur krujevalı pambıq yataq dəsti"}'::jsonb,'{"en":"The Cutwork Lace Sheet Set is made from premium Xinjiang fine cotton, renowned as the \\"best of cottons.\\" This superior material offers a luxurious and high-quality experience. Utilizing ceramic temperature-sensitive napping technology combined with a compact combing process, short fibers are removed while long fibers are retained, resulting in a short-fiber surface that enhances the fabric''s warmth, providing long-lasting heat retention and strong heat locking. The fabric is delicate, full, and lustrous, with a silky smoothness comparable to satin, its lightweight drape adding to its beauty. Made entirely of natural cotton, it is gentle on the skin, breathable, comfortable, and resistant to pilling, offering a feeling of softness and comfort as if falling into a cloud.","az":"Yüksək keyfiyyətli pambıq və sıx daranmış liflərin birləşməsi. İstehsalçı qısa liflərin ayrıldığı toxuma emalının istilik saxlayan yumşaq səth yaratdığını bildirir."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-cutwork-lace-sheet-set.jpg'),
('markcross-french-lace-trim-sheet-set','linen','{"en":"French Lace Trim Sheet Set","az":"Fransız krujeva haşiyəli pambıq dəst"}'::jsonb,'{"en":"The French Lace Trim Sheet Set features delicate lace, as dreamy and ethereal as morning mist; its cotton texture is soft against the skin, as gentle as a breeze caressing flower petals. It combines the elegant grace of French romance with the comforting feel of premium long-staple cotton, making every night a tender and cherished moment.","az":"Uzun lifli pambığın yumşaq toxunuşu incə krujeva detalları ilə tamamlanır. Romantik fransız üslubunu gündəlik rahatlıqla birləşdirən sakit dizayn."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-french-lace-trim-sheet-set.jpg'),
('markcross-american-vintage-printed-sheet-set','linen','{"en":"American Vintage Printed Sheet Set","az":"Amerikan vintage naxışlı yataq dəsti"}'::jsonb,'{"en":"The American Vintage Printed Sheet Set is crafted from premium high-count Pima cotton, where the delicate softness of the long fibers restores the inherent characteristics of cotton, returning to the beauty of nature. Its understated elegance, reminiscent of brocade, exudes high-end taste. Employing a sophisticated yarn-dyed jacquard technique, the threads are arranged in a regular pattern to create a defined relief, fulfilling the mission from thread to surface, weaving a magnificent work of art. A gentle touch to every inch of its texture reveals pure comfort, rustic charm, and a timeless elegance, creating a truly classic piece for enjoying the beauty of modern artistic living.","az":"Uzun lifli Pima pambığından hazırlanmış naxışlı dəst. Təbii yumşaqlıq və zərif, brokarı xatırladan naxış yatağa klassik görünüş verir."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-american-vintage-printed-sheet-set.jpg'),
('markcross-embroidered-sheet-set','linen','{"en":"Embroidered Sheet Set","az":"Tikmə detallı pambıq yataq dəsti"}'::jsonb,'{"en":"The Embroidered Sheet Set , crafted with long-staple cotton from Aksu, Xinjiang, offers an immersive sleep experience. The fabric is soft and skin-friendly, delicate and warm to the touch, as soothing and comforting as a gentle embrace, relaxing your mind and body from the inside out, allowing every moment to feel blissful. Made from natural cotton, pure and elegant, it leverages the strength and richness of long fibers to restore the unique texture of premium cotton, returning to the beauty of nature.","az":"Aksu bölgəsinin uzun lifli pambığından hazırlanmış yumşaq, dəriyə xoş toxunuşlu parça. Zərif tikmə və sakit görünüş yataq otağına rahatlıq qatır."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-embroidered-sheet-set.jpg'),
('markcross-yarn-dyed-jacquard-sheet-set','linen','{"en":"Yarn Dyed Jacquard Sheet Set","az":"İplikdən boyanmış jakarlı pambıq dəst"}'::jsonb,'{"en":"The Yarn Dyed Jacquard Sheet Set is crafted from premium high-count Awati long-staple cotton, where the delicate softness of the long fibers restores the inherent characteristics of cotton, returning to the beauty of nature. Its understated elegance, reminiscent of brocade, exudes high-end taste. Employing a sophisticated yarn-dyed jacquard technique, the threads are arranged in a regular pattern to create a defined texture, fulfilling the mission from thread to surface, weaving a magnificent work of art. A gentle touch to every inch of its texture reveals pure comfort, rustic charm, and a timeless elegance, creating a truly classic and modern artistic living experience.","az":"Uzun lifli Awati pambığının yumşaqlığını jakarlı toxuma və təmkinli naxışla birləşdirir. Təbii pambıq görünüşlü, səliqəli və dolğun səth."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-yarn-dyed-jacquard-sheet-set.jpg'),
('markcross-egyptian-cotton-sheet-set','linen','{"en":"Egyptian Cotton Sheet Set","az":"Misir pambığı yataq dəsti"}'::jsonb,'{"en":"Egyptian Cotton Sheet Set selects rare cotton from around the world, specifically Egyptian long-staple cotton.","az":"Nildə yetişdirilən uzun lifli Misir pambığı ilə seçilən incə toxunuşlu dəst. İstehsalçı pambığın nadirliyini və lif keyfiyyətini məhsulun əsas üstünlükləri kimi təqdim edir."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-egyptian-cotton-sheet-set.jpg'),
('markcross-long-staple-cotton-sheet-set','linen','{"en":"Long Staple Cotton Sheet Set","az":"Uzun lifli pambıq yataq dəsti"}'::jsonb,'{"en":"The Long Staple Cotton Sheet Set is made from premium Xinjiang Awati long-staple cotton, whose fine, long, and supple fibers create an exceptionally delicate fabric. 100% pure cotton, it retains the natural softness of cotton, representing a revolutionary exploration of cotton varieties. The high-count, high-density design offers both crispness and a refined texture, combining everyday comfort with sophisticated luxury to create an ethereal and elegant artistic atmosphere. Superior quality weaves a silky smooth touch and a lustrous sheen, showcasing high-end taste and exuding a striking style through meticulous tailoring.","az":"Xinjiang Awati bölgəsinin uzun və elastik pambıq liflərindən hazırlanmış 100% pambıq dəst. Təbii yumşaqlığı və incə parça səthi ilə rahat gündəlik istifadə üçün nəzərdə tutulub."}'::jsonb,'{}'::jsonb,'Mark Cross','assets/products/markcross-long-staple-cotton-sheet-set.jpg'),
('lm-meser-ya-warm-duck-retro-brown','duvet','{"az":"YA Warm Duck isti yorğan — qəhvəyi","en":"YA Warm Duck Warm Duvet — Brown"}'::jsonb,'{"az":"YA Warm Duck kolleksiyasının qəhvəyi rəngli isti yorğanı.","en":"Brown warm duvet from the YA Warm Duck collection."}'::jsonb,'{}'::jsonb,'L’M MESER','assets/products/lm-meser/ya-warm-duck-retro-brown-studio.webp'),
('lm-meser-miro-knitted-bedcover-purple','duvet','{"az":"MIRO toxunma isti yorğan — bənövşəyi","en":"MIRO Knit Warm Duvet — Purple"}'::jsonb,'{"az":"MIRO toxunma isti tekstil kolleksiyasından bənövşəyi rəng seçimi.","en":"Purple option from the MIRO knitted warm textile collection."}'::jsonb,'{}'::jsonb,'L’M MESER','assets/products/lm-meser/miro-knitted-bedcover-purple-studio.webp'),
('lm-meser-dry-motion-tencel-bedding-sand','linen','{"az":"Dry Motion Tencel pambıq yataq dəsti","en":"Dry Motion Tencel Cotton Bedding Set"}'::jsonb,'{"az":"80 saplı Tencel pambıqdan dörd hissəli yaz və payız yataq dəsti.","en":"Four-piece spring and autumn bedding set in 80-count Tencel cotton."}'::jsonb,'{}'::jsonb,'L’M MESER','assets/products/lm-meser/dry-motion-tencel-bedding-sand-studio.webp'),
('lm-meser-soy-fiber-duvet-rose','duvet','{"az":"Bio əsaslı soya lifli yorğan — pudra","en":"Bio-Based Soy Fiber Duvet — Rose"}'::jsonb,'{"az":"Soya lifli dolğulu, pudra rəng variantında yorğan.","en":"Soy-fiber filled duvet in a rose colour option."}'::jsonb,'{}'::jsonb,'L’M MESER','assets/products/lm-meser/soy-fiber-duvet-rose-studio.webp'),
('lm-meser-merino-wool-duvet-evelyn','duvet','{"az":"Merino Avstraliya yun yorğanı — Evelyn","en":"Merino Australian Wool Duvet — Evelyn"}'::jsonb,'{"az":"Avstraliya Merino yunundan hazırlanmış yorğan.","en":"Duvet made with Australian Merino wool."}'::jsonb,'{}'::jsonb,'L’M MESER','assets/products/lm-meser/merino-wool-duvet-evelyn-studio.webp'),
('lm-meser-merino-wool-mattress-topper','bedcare','{"az":"Merino yun döşək üstü","en":"Merino Wool Mattress Topper"}'::jsonb,'{"az":"Avstraliya Merino yunu ilə hazırlanmış yumşaq döşək üstü.","en":"Soft mattress topper made with Australian Merino wool."}'::jsonb,'{}'::jsonb,'L’M MESER','assets/products/lm-meser/merino-wool-mattress-topper-studio.webp'),
('lm-meser-ya-cool-duck-summer-duvet','duvet','{"az":"YA Cool Duck yüngül yay yorğanı","en":"YA Cool Duck Lightweight Summer Duvet"}'::jsonb,'{"az":"YA Cool Duck yay kolleksiyasından yüngül yorğan.","en":"Lightweight duvet from the YA Cool Duck summer collection."}'::jsonb,'{}'::jsonb,'L’M MESER','assets/products/lm-meser/ya-cool-duck-summer-duvet-studio.webp'),
('lm-meser-95-goose-down-pillow','pillow','{"az":"95% ağ qaz tükü yastıq","en":"95% White Goose Down Pillow"}'::jsonb,'{"az":"95% ağ qaz tükü dolğulu yumşaq yastıq.","en":"Soft pillow filled with 95% white goose down."}'::jsonb,'{}'::jsonb,'L’M MESER','assets/products/lm-meser/95-goose-down-pillow-studio.webp'),
('lm-meser-soy-fiber-ergonomic-pillow','pillow','{"az":"100D bio lifli formalı dəstək yastığı","en":"100D Bio-Fiber Shaped Support Pillow"}'::jsonb,'{"az":"100D bio əsaslı lifdən formaverilmiş dəstək yastığı.","en":"Shaped support pillow made with 100D bio-based fiber."}'::jsonb,'{}'::jsonb,'L’M MESER','assets/products/lm-meser/soy-fiber-ergonomic-pillow-studio.webp'),
('lm-meser-tencel-bedcover-mandola','linen','{"az":"80 saplı ikiüzlü Tencel yataq örtüyü — Mandola","en":"80-Count Double-Sided Tencel Bedcover — Mandola"}'::jsonb,'{"az":"80 saplı, yuyulmuş Tencel parçadan ikiüzlü yataq örtüyü.","en":"Double-sided bedcover in washed 80-count Tencel fabric."}'::jsonb,'{}'::jsonb,'L’M MESER','assets/products/lm-meser/tencel-bedcover-mandola-studio.webp'),
('mini-star-pillow','pillow','{"az":"Mini Ulduz Uşaq Yastığı","en":"Mini Star Kids Pillow","ru":"Детская подушка Mini Star"}'::jsonb,'{"az":"Uşaq yatağı üçün ulduz naxışlı, yumşaq görünüşlü yastıq. Ölçü və parça tərkibi sifarişdən əvvəl dəqiqləşdirilir.","en":"A soft-looking star-print pillow for a child’s bed. Size and fabric details are confirmed before ordering.","ru":"Подушка со звёздным принтом для детской кровати. Размер и состав ткани уточняются перед заказом."}'::jsonb,'{}'::jsonb,'Melatoni Mini','assets/products/melatoni-mini/mini-star-pillow.webp'),
('mini-moon-bedding','linen','{"az":"Mini Ay İşığı Yataq Dəsti","en":"Mini Moonlight Bedding Set","ru":"Детский комплект Mini Moonlight"}'::jsonb,'{"az":"Ay və ulduz motivli, sakit adaçayı tonlarında uşaq yataq dəsti. Ölçü və parça tərkibi sifarişdən əvvəl dəqiqləşdirilir.","en":"A child’s bedding set in a calm sage tone with moon and star motifs. Size and fabric details are confirmed before ordering.","ru":"Детский комплект в спокойном шалфейном оттенке с мотивами луны и звёзд. Размер и состав ткани уточняются перед заказом."}'::jsonb,'{}'::jsonb,'Melatoni Mini','assets/products/melatoni-mini/mini-moon-bedding.webp'),
('mini-moon-pajamas','sleepwear','{"az":"Mini Ay İşığı Uşaq Pijaması","en":"Mini Moonlight Kids Pajamas","ru":"Детская пижама Mini Moonlight"}'::jsonb,'{"az":"Ay və ulduz naxışlı, yumşaq görünüşlü uşaq pijama dəsti. Ölçü və parça tərkibi sifarişdən əvvəl dəqiqləşdirilir.","en":"A soft-looking children’s pajama set with moon and star motifs. Size and fabric details are confirmed before ordering.","ru":"Детская пижама с мотивами луны и звёзд. Размер и состав ткани уточняются перед заказом."}'::jsonb,'{}'::jsonb,'Melatoni Mini','assets/products/melatoni-mini/mini-moon-pajamas.webp')
on conflict(id) do nothing;

create or replace function public.create_store_order(p_items jsonb, p_language text default 'az')
returns table(order_id uuid, order_number text, total numeric)
language plpgsql security definer set search_path = public, auth, extensions
as $$
declare
  actor uuid := auth.uid();
  language_value text := case when p_language in ('az','ru','en') then p_language else 'az' end;
  customer_record public.profiles%rowtype;
  address_record public.addresses%rowtype;
  product_record public.products%rowtype;
  quote_product_record public.quote_only_catalog%rowtype;
  input_item jsonb;
  normalized_items jsonb := '[]'::jsonb;
  item_id text;
  item_qty integer;
  total_item_qty integer;
  item_color text;
  item_size text;
  unit_price numeric(12,2);
  order_total numeric(12,2) := 0;
  new_order_id uuid := gen_random_uuid();
  new_order_number text := 'ML-' || upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,12));
  customer_email_value text;
begin
  if actor is null then raise exception 'authentication_required'; end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'invalid_order_items';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'invalid_order_items';
  end if;
  select * into customer_record from public.profiles where id = actor;
  select * into address_record from public.addresses where user_id = actor order by is_default desc, id limit 1;
  select email into customer_email_value from auth.users where id = actor;
  if nullif(trim(customer_record.full_name),'') is null or nullif(trim(customer_record.phone),'') is null then
    raise exception 'customer_details_required';
  end if;
  if address_record.id is null or nullif(trim(address_record.street),'') is null then
    raise exception 'delivery_address_required';
  end if;

  for input_item in select value from jsonb_array_elements(p_items)
  loop
    item_id := input_item->>'id';
    if item_id is null or length(item_id) > 120 then raise exception 'invalid_product'; end if;
    if coalesce(input_item->>'qty','') !~ '^[0-9]{1,3}$' then raise exception 'invalid_quantity'; end if;
    item_qty := (input_item->>'qty')::integer;
    if item_qty < 1 or item_qty > 99 then raise exception 'invalid_quantity'; end if;
    select * into product_record from public.products where id = item_id and is_active for update;
    if not found then
      select * into quote_product_record from public.quote_only_catalog where id=item_id;
      if not found then raise exception 'product_unavailable'; end if;
      item_color := left(coalesce(input_item->>'color',''),60);
      item_size := left(coalesce(input_item->>'size',''),60);
      normalized_items := normalized_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'id',quote_product_record.id,
        'name',coalesce(quote_product_record.name->>language_value,quote_product_record.name->>'az',quote_product_record.id),
        'brand',quote_product_record.brand,'category',quote_product_record.category,
        'qty',item_qty,'quote_only',true,'color',nullif(item_color,''),'size',nullif(item_size,'')
      )));
      continue;
    end if;
    select coalesce(sum(case when coalesce(value->>'qty','') ~ '^[0-9]{1,3}$' then (value->>'qty')::integer else 0 end),0)::integer
      into total_item_qty from jsonb_array_elements(p_items) where value->>'id'=item_id;
    if product_record.stock_quantity is not null and product_record.stock_quantity < total_item_qty then
      raise exception 'insufficient_stock';
    end if;
    unit_price := coalesce(product_record.sale_price, product_record.price);
    order_total := order_total + unit_price * item_qty;
    item_color := left(coalesce(input_item->>'color',''),60);
    item_size := left(coalesce(input_item->>'size',''),60);
    normalized_items := normalized_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id',product_record.id,
      'name',coalesce(product_record.name->>language_value,product_record.name->>'az',product_record.id),
      'qty',item_qty,'unit_price',unit_price,
      'color',nullif(item_color,''),'size',nullif(item_size,'')
    )));
  end loop;

  insert into public.orders(id,order_number,user_id,items,total,language,status,customer_name,customer_phone,customer_email,shipping_address,payment_method,payment_status,delivery_fee,discount_amount)
  values (
    new_order_id,new_order_number,actor,normalized_items,order_total,language_value,'pending',
    trim(customer_record.full_name),trim(customer_record.phone),coalesce(customer_email_value,''),
    jsonb_strip_nulls(jsonb_build_object('label',address_record.label,'city',address_record.city,'district',address_record.district,'street',address_record.street,'note',address_record.note)),
    'to_be_confirmed','unpaid',0,0
  );
  return query select new_order_id,new_order_number,order_total;
end;
$$;
revoke all on function public.create_store_order(jsonb,text) from public, anon;
grant execute on function public.create_store_order(jsonb,text) to authenticated;
-- Keep the current direct-insert checkout working during deployment. A follow-up
-- migration revokes this permission after the new storefront is live.

create or replace function public.handle_order_status_stock_and_notifications()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
declare item jsonb; item_id text; item_qty integer; stock_value integer;
begin
  if tg_op = 'INSERT' then
    insert into public.store_automation_queue(event_type,order_id)
    values ('order_created',new.id);
    return new;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status='pending' and new.status in ('confirmed','cancelled')) or
      (old.status='confirmed' and new.status in ('preparing','cancelled')) or
      (old.status='preparing' and new.status in ('shipping','cancelled')) or
      (old.status='processing' and new.status in ('preparing','shipping','cancelled')) or
      (old.status='shipping' and new.status in ('delivered','cancelled'))
    ) then raise exception 'invalid_order_status_transition'; end if;

    if new.status='confirmed' and old.status <> 'confirmed' then
      perform set_config('melatoni.stock_reason','order_confirmed',true);
      perform set_config('melatoni.order_id',new.id::text,true);
      for item in select value from jsonb_array_elements(new.items) order by value->>'id'
      loop
        if coalesce((item->>'quote_only')::boolean,false) then continue; end if;
        item_id := item->>'id'; item_qty := greatest(1,least(99,coalesce((item->>'qty')::integer,1)));
        select stock_quantity into stock_value from public.products where id=item_id and is_active for update;
        if not found then raise exception 'product_unavailable'; end if;
        if stock_value is not null then
          if stock_value < item_qty then raise exception 'insufficient_stock'; end if;
          update public.products set stock_quantity=stock_value-item_qty where id=item_id;
        end if;
      end loop;
    elsif new.status='cancelled' and old.status in ('confirmed','preparing','shipping') then
      perform set_config('melatoni.stock_reason','order_cancelled',true);
      perform set_config('melatoni.order_id',new.id::text,true);
      for item in select value from jsonb_array_elements(new.items) order by value->>'id'
      loop
        item_id := item->>'id'; item_qty := greatest(1,least(99,coalesce((item->>'qty')::integer,1)));
        update public.products set stock_quantity=stock_quantity+item_qty
        where id=item_id and stock_quantity is not null;
      end loop;
    end if;
    insert into public.store_automation_queue(event_type,order_id,payload)
    values ('order_status',new.id,jsonb_build_object('previous_status',old.status,'status',new.status));
  end if;
  return new;
end;
$$;
drop trigger if exists orders_status_stock_and_notifications on public.orders;
create trigger orders_status_stock_and_notifications
after insert or update of status on public.orders
for each row execute function public.handle_order_status_stock_and_notifications();

select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'melatoni_store_automation_secret','Melatoni order and low-stock automation')
where not exists (select 1 from vault.decrypted_secrets where name='melatoni_store_automation_secret');

create or replace function public.claim_store_automation(p_secret text)
returns setof jsonb language plpgsql security definer set search_path = public, auth, vault
as $$
declare queue_row public.store_automation_queue%rowtype; order_row public.orders%rowtype; product_row public.products%rowtype; item_text text;
begin
  if not exists(select 1 from vault.decrypted_secrets where name='melatoni_store_automation_secret' and decrypted_secret=p_secret) then
    raise exception 'not_authorized';
  end if;
  for queue_row in
    select * from public.store_automation_queue q
    where q.sent_at is null and q.attempts < 8 and q.next_attempt_at <= now()
      and (q.locked_until is null or q.locked_until < now())
    order by q.created_at for update skip locked limit 25
  loop
    update public.store_automation_queue set attempts=attempts+1,locked_until=now()+interval '3 minutes' where id=queue_row.id;
    if queue_row.order_id is not null then
      select * into order_row from public.orders where id=queue_row.order_id;
      if not found then continue; end if;
      select coalesce(string_agg(coalesce(item->>'name',item->>'id','Məhsul')||' × '||coalesce(item->>'qty','1'),E'\n'),'Məhsul qeyd edilməyib')
      into item_text from jsonb_array_elements(order_row.items) item;
      return next jsonb_build_object(
        'job_id',queue_row.id,'event_type',queue_row.event_type,'order_number',order_row.order_number,
        'customer_name',order_row.customer_name,'customer_phone',order_row.customer_phone,'customer_email',order_row.customer_email,
        'items',order_row.items,'item_summary',item_text,'total',order_row.total,'language',order_row.language,
        'status',order_row.status,'payment_method',order_row.payment_method,'payment_status',order_row.payment_status,
        'shipping_address',order_row.shipping_address,'created_at',order_row.created_at,'payload',queue_row.payload,
        'admin_email_sent_at',queue_row.admin_email_sent_at,'customer_email_sent_at',queue_row.customer_email_sent_at
      );
    elsif queue_row.support_escalation_id is not null then
      return next (select jsonb_build_object('job_id',queue_row.id,'event_type','support_escalation',
        'support_escalation_id',s.id,'contact_name',s.contact_name,'contact_email',s.contact_email,
        'contact_phone',s.contact_phone,'message',s.message,'created_at',s.created_at,
        'admin_email_sent_at',queue_row.admin_email_sent_at) from public.support_escalations s where s.id=queue_row.support_escalation_id);
    else
      select * into product_row from public.products where id=queue_row.product_id;
      return next jsonb_build_object('job_id',queue_row.id,'event_type','low_stock','product_id',queue_row.product_id,
        'product_name',product_row.name,'stock_quantity',product_row.stock_quantity,'payload',queue_row.payload,
        'admin_email_sent_at',queue_row.admin_email_sent_at);
    end if;
  end loop;
end;
$$;
revoke all on function public.claim_store_automation(text) from public, anon, authenticated;
grant execute on function public.claim_store_automation(text) to service_role;

create or replace function public.finish_store_automation(p_secret text,p_job_id uuid,p_channel text,p_success boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path = public, vault
as $$
begin
  if not exists(select 1 from vault.decrypted_secrets where name='melatoni_store_automation_secret' and decrypted_secret=p_secret) then raise exception 'not_authorized'; end if;
  if p_channel not in ('admin_email','customer_email') then raise exception 'invalid_channel'; end if;
  update public.store_automation_queue set
    admin_email_sent_at=case when p_success and p_channel='admin_email' then now() else admin_email_sent_at end,
    customer_email_sent_at=case when p_success and p_channel='customer_email' then now() else customer_email_sent_at end,
    sent_at=case when p_success and (
      (event_type in ('low_stock','support_escalation') and (p_channel='admin_email' or admin_email_sent_at is not null)) or
      (event_type in ('order_created','order_status') and
        (p_channel='admin_email' or admin_email_sent_at is not null) and
        (p_channel='customer_email' or customer_email_sent_at is not null or not exists(select 1 from public.orders o where o.id=public.store_automation_queue.order_id and nullif(o.customer_email,'') is not null))
      )
    ) then now() else sent_at end,
    locked_until=null,
    next_attempt_at=now()+make_interval(mins=>least(60,power(2,greatest(attempts-1,0))::integer)),
    last_error=case when p_success then null else left(coalesce(p_error,'delivery_failed'),160) end
  where id=p_job_id and sent_at is null;
  return found;
end;
$$;
revoke all on function public.finish_store_automation(text,uuid,text,boolean,text) from public, anon, authenticated;
grant execute on function public.finish_store_automation(text,uuid,text,boolean,text) to service_role;

create or replace function public.consume_order_lookup_attempt(p_fingerprint text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare attempt_value integer;
begin
  if p_fingerprint !~ '^[a-f0-9]{64}$' then return false; end if;
  insert into public.order_lookup_attempts(fingerprint,window_started_at,attempt_count) values (p_fingerprint,now(),1)
  on conflict (fingerprint) do update set
    window_started_at=case when public.order_lookup_attempts.window_started_at < now()-interval '15 minutes' then now() else public.order_lookup_attempts.window_started_at end,
    attempt_count=case when public.order_lookup_attempts.window_started_at < now()-interval '15 minutes' then 1 else public.order_lookup_attempts.attempt_count+1 end
  returning attempt_count into attempt_value;
  return attempt_value <= 8;
end;
$$;
revoke all on function public.consume_order_lookup_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_order_lookup_attempt(text) to service_role;

create or replace function public.lookup_order_status(p_order_number text,p_phone text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare order_row public.orders%rowtype; phone_value text := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
begin
  if length(phone_value) < 8 or length(phone_value) > 15 then return null; end if;
  select * into order_row from public.orders
  where upper(order_number)=upper(trim(p_order_number))
    and regexp_replace(customer_phone,'[^0-9]','','g')=phone_value limit 1;
  if not found then return null; end if;
  return jsonb_build_object('order_number',order_row.order_number,'status',order_row.status,
    'items',order_row.items,'total',order_row.total,'created_at',order_row.created_at);
end;
$$;
revoke all on function public.lookup_order_status(text,text) from public, anon, authenticated;
grant execute on function public.lookup_order_status(text,text) to service_role;

create or replace function public.store_weekly_report(p_secret text)
returns jsonb language plpgsql security definer set search_path = public, vault
as $$
declare report jsonb;
begin
  if not exists(select 1 from vault.decrypted_secrets where name='melatoni_store_automation_secret' and decrypted_secret=p_secret) then raise exception 'not_authorized'; end if;
  select jsonb_build_object(
    'period_start',now()-interval '7 days','period_end',now(),
    'order_count',count(*),
    'sales',coalesce(sum(total) filter(where status in ('confirmed','preparing','processing','shipping','delivered')),0),
    'new_orders',count(*) filter(where status='pending'),
    'top_products',coalesce((select jsonb_agg(t) from (
      select item->>'name' as name,sum(coalesce((item->>'qty')::integer,1)) as quantity
      from public.orders o cross join lateral jsonb_array_elements(o.items) item
      where o.created_at>=now()-interval '7 days' and o.status in ('confirmed','preparing','processing','shipping','delivered')
      group by item->>'name' order by quantity desc limit 5) t),'[]'::jsonb),
    'low_stock',coalesce((select jsonb_agg(jsonb_build_object('name',coalesce(name->>'az',id),'stock',stock_quantity)) from public.products where is_active and stock_quantity is not null and stock_quantity<5),'[]'::jsonb),
    'abandoned_carts', (select count(*) from public.abandoned_carts c where c.updated_at<now()-interval '1 hour' and c.updated_at>now()-interval '30 days' and jsonb_array_length(c.items)>0 and not exists(select 1 from public.orders o where o.user_id=c.user_id and o.created_at>=c.updated_at)),
    'abandoned_value',coalesce((select sum(c.total) from public.abandoned_carts c where c.updated_at<now()-interval '1 hour' and c.updated_at>now()-interval '30 days' and not exists(select 1 from public.orders o where o.user_id=c.user_id and o.created_at>=c.updated_at)),0)
  ) into report from public.orders where created_at>=now()-interval '7 days';
  return report;
end;
$$;
revoke all on function public.store_weekly_report(text) from public, anon, authenticated;
grant execute on function public.store_weekly_report(text) to service_role;

select cron.unschedule(jobid) from cron.job where jobname='melatoni-store-automation';
select cron.schedule('melatoni-store-automation','* * * * *',
  $job$select net.http_post(
    url:='https://zjmfvtcclecmbjcimddc.supabase.co/functions/v1/store-automation',
    headers:=jsonb_build_object('Content-Type','application/json','apikey','sb_publishable_1pNMgE8BRyWcx50UQOknnQ_DPYy6HsA',
      'x-store-automation-secret',(select decrypted_secret from vault.decrypted_secrets where name='melatoni_store_automation_secret' limit 1)),
    body:='{"task":"queue"}'::jsonb,timeout_milliseconds:=10000)$job$);
select cron.unschedule(jobid) from cron.job where jobname='melatoni-weekly-report';
select cron.schedule('melatoni-weekly-report','0 9 * * 1',
  $job$select net.http_post(
    url:='https://zjmfvtcclecmbjcimddc.supabase.co/functions/v1/store-automation',
    headers:=jsonb_build_object('Content-Type','application/json','apikey','sb_publishable_1pNMgE8BRyWcx50UQOknnQ_DPYy6HsA',
      'x-store-automation-secret',(select decrypted_secret from vault.decrypted_secrets where name='melatoni_store_automation_secret' limit 1)),
    body:='{"task":"weekly-report"}'::jsonb,timeout_milliseconds:=10000)$job$);


-- Consent-gated, retryable 1-hour and 24-hour cart reminder delivery.
create table if not exists public.cart_reminder_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stage text not null check (stage in ('1h','24h')),
  cart_updated_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  email_sent_at timestamptz,
  push_sent_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique(user_id, cart_updated_at, stage)
);
alter table public.cart_reminder_queue enable row level security;
revoke all on public.cart_reminder_queue from anon, authenticated;
create index if not exists cart_reminder_queue_pending_idx on public.cart_reminder_queue(next_attempt_at,created_at) where sent_at is null;

create or replace function public.enqueue_cart_reminders(p_secret text)
returns integer language plpgsql security definer set search_path = public, auth, vault
as $$
declare inserted_count integer;
begin
  if not exists(select 1 from vault.decrypted_secrets where name='melatoni_cart_recovery_secret' and decrypted_secret=p_secret) then raise exception 'not_authorized'; end if;
  insert into public.cart_reminder_queue(user_id,stage,cart_updated_at,payload)
  select c.user_id, due.stage, c.updated_at,
    jsonb_build_object('items',c.items,'total',c.total,'language',c.language,
      'email_allowed',coalesce(pref.cart_reminders_consent,false),
      'push_allowed',exists(select 1 from public.push_subscriptions ps where ps.user_id=c.user_id))
  from public.abandoned_carts c
  left join public.customer_preferences pref on pref.user_id=c.user_id
  cross join lateral (values ('1h'::text,interval '1 hour'),('24h'::text,interval '24 hours')) as due(stage,delay)
  where c.updated_at <= now()-due.delay and c.updated_at > now()-interval '48 hours'
    and jsonb_array_length(c.items)>0
    and (coalesce(pref.cart_reminders_consent,false) or exists(select 1 from public.push_subscriptions ps where ps.user_id=c.user_id))
    and not exists(select 1 from public.orders o where o.user_id=c.user_id and o.created_at>=c.updated_at)
  on conflict(user_id,cart_updated_at,stage) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke all on function public.enqueue_cart_reminders(text) from public, anon, authenticated;
grant execute on function public.enqueue_cart_reminders(text) to service_role;

create or replace function public.claim_cart_reminder_jobs(p_secret text)
returns setof jsonb language plpgsql security definer set search_path = public, auth, vault
as $$
declare job public.cart_reminder_queue%rowtype; account_email text; push_list jsonb; email_consent boolean; push_consent boolean;
begin
  if not exists(select 1 from vault.decrypted_secrets where name='melatoni_cart_recovery_secret' and decrypted_secret=p_secret) then raise exception 'not_authorized'; end if;
  for job in select * from public.cart_reminder_queue q
    where q.sent_at is null and q.attempts<8 and q.next_attempt_at<=now() and (q.locked_until is null or q.locked_until<now())
    order by q.created_at for update skip locked limit 25
  loop
    select coalesce(p.cart_reminders_consent,false) into email_consent from public.customer_preferences p where p.user_id=job.user_id;
    email_consent := coalesce(email_consent,false);
    push_list := '[]'::jsonb;
    select coalesce(jsonb_agg(subscription),'[]'::jsonb) into push_list from public.push_subscriptions where user_id=job.user_id;
    push_consent := jsonb_array_length(push_list)>0;
    update public.cart_reminder_queue set attempts=attempts+1,locked_until=now()+interval '3 minutes',
      payload=jsonb_set(jsonb_set(payload,'{email_allowed}',to_jsonb(email_consent),true),'{push_allowed}',to_jsonb(push_consent),true)
      where id=job.id;
    account_email := null;
    if email_consent then select email into account_email from auth.users where id=job.user_id; end if;
    return next jsonb_build_object('job_id',job.id,'stage',job.stage,'email',account_email,'push_subscriptions',push_list,
      'email_sent_at',job.email_sent_at,'push_sent_at',job.push_sent_at,'payload',jsonb_set(jsonb_set(job.payload,'{email_allowed}',to_jsonb(email_consent),true),'{push_allowed}',to_jsonb(push_consent),true));
  end loop;
end;
$$;
revoke all on function public.claim_cart_reminder_jobs(text) from public, anon, authenticated;
grant execute on function public.claim_cart_reminder_jobs(text) to service_role;

create or replace function public.finish_cart_reminder(p_secret text,p_job_id uuid,p_channel text,p_success boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path = public, vault
as $$
begin
  if not exists(select 1 from vault.decrypted_secrets where name='melatoni_cart_recovery_secret' and decrypted_secret=p_secret) then raise exception 'not_authorized'; end if;
  if p_channel not in ('email','push') then raise exception 'invalid_channel'; end if;
  update public.cart_reminder_queue q set
    email_sent_at=case when p_success and p_channel='email' then now() else q.email_sent_at end,
    push_sent_at=case when p_success and p_channel='push' then now() else q.push_sent_at end,
    sent_at=case when p_success and (
      (not coalesce((q.payload->>'email_allowed')::boolean,false) or p_channel='email' or q.email_sent_at is not null) and
      (not coalesce((q.payload->>'push_allowed')::boolean,false) or p_channel='push' or q.push_sent_at is not null)
    ) then now() else q.sent_at end,
    locked_until=null,
    next_attempt_at=now()+make_interval(mins=>least(60,power(2,greatest(q.attempts-1,0))::integer)),
    last_error=case when p_success then null else left(coalesce(p_error,'delivery_failed'),160) end
  where q.id=p_job_id and q.sent_at is null;
  return found;
end;
$$;
revoke all on function public.finish_cart_reminder(text,uuid,text,boolean,text) from public, anon, authenticated;
grant execute on function public.finish_cart_reminder(text,uuid,text,boolean,text) to service_role;


create table if not exists public.assistant_request_attempts (
  fingerprint text primary key check (fingerprint ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0
);
alter table public.assistant_request_attempts enable row level security;
revoke all on public.assistant_request_attempts from anon, authenticated;
create or replace function public.consume_assistant_attempt(p_fingerprint text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare attempt_value integer;
begin
  if p_fingerprint !~ '^[a-f0-9]{64}$' then return false; end if;
  insert into public.assistant_request_attempts(fingerprint,window_started_at,attempt_count) values(p_fingerprint,now(),1)
  on conflict(fingerprint) do update set
    window_started_at=case when public.assistant_request_attempts.window_started_at < now()-interval '15 minutes' then now() else public.assistant_request_attempts.window_started_at end,
    attempt_count=case when public.assistant_request_attempts.window_started_at < now()-interval '15 minutes' then 1 else public.assistant_request_attempts.attempt_count+1 end
  returning attempt_count into attempt_value;
  return attempt_value<=30;
end;
$$;
revoke all on function public.consume_assistant_attempt(text) from public,anon,authenticated;
grant execute on function public.consume_assistant_attempt(text) to service_role;
