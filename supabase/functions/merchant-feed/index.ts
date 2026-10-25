import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const xml = (value: unknown) => String(value ?? '').replace(/[<>&"']/g, character => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
}[character]!));
const localized = (value: unknown, fallback = '') => {
  if (typeof value === 'string') return value.trim() || fallback;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return String(record.az || record.en || record.ru || fallback).trim();
  }
  return fallback;
};
const absoluteUrl = (value: unknown) => {
  const source = String(value || '').trim();
  if (!source) return 'https://melatoni.com/assets/melatoni-logo.png';
  try { return new URL(source, 'https://melatoni.com/').href; }
  catch { return 'https://melatoni.com/assets/melatoni-logo.png'; }
};

Deno.serve(async request => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return new Response('Feed is not configured', { status: 503 });

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from('products')
    .select('id,category,name,description,price,sale_price,image_url,stock_quantity,is_active')
    .eq('is_active', true)
    .gt('price', 0)
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) return new Response('Feed unavailable', { status: 503 });

  const items = (data || []).map(product => {
    const title = localized(product.name, product.id).slice(0, 150);
    const description = localized(product.description, `${title} — Melatoni`).slice(0, 5000);
    const link = `https://melatoni.com/product.html?id=${encodeURIComponent(product.id)}`;
    const price = Number(product.price);
    const salePrice = Number(product.sale_price);
    const sale = Number.isFinite(salePrice) && salePrice > 0 && salePrice < price
      ? `<g:sale_price>${salePrice.toFixed(2)} AZN</g:sale_price>` : '';
    return `<item>
      <g:id>${xml(product.id)}</g:id>
      <title>${xml(title)}</title>
      <description>${xml(description)}</description>
      <link>${xml(link)}</link>
      <g:image_link>${xml(absoluteUrl(product.image_url))}</g:image_link>
      <g:availability>${product.stock_quantity != null && Number(product.stock_quantity) <= 0 ? 'out_of_stock' : 'in_stock'}</g:availability>
      <g:price>${price.toFixed(2)} AZN</g:price>
      ${sale}
      <g:condition>new</g:condition>
      <g:brand>Melatoni</g:brand>
      <g:product_type>${xml(product.category)}</g:product_type>
    </item>`;
  }).join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Melatoni məhsulları</title>
    <link>https://melatoni.com/products.html</link>
    <description>Melatoni mağazasının qiymətli və aktiv məhsulları</description>
    ${items}
  </channel>
</rss>`;
  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=900'
    }
  });
});
