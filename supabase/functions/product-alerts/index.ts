import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: cors });

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const sender = Deno.env.get('EMAIL_FROM');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !authorization) return Response.json({ error: 'unauthorized' }, { status: 401, headers: cors });

  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return Response.json({ error: 'unauthorized' }, { status: 401, headers: cors });
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', authData.user.id).maybeSingle();
  if (!profile?.is_admin) return Response.json({ error: 'forbidden' }, { status: 403, headers: cors });

  let body: { product_id?: unknown; previous_price?: unknown; previous_stock?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid_body' }, { status: 400, headers: cors }); }
  const productId = typeof body.product_id === 'string' ? body.product_id.slice(0, 100) : '';
  if (!productId) return Response.json({ error: 'invalid_product' }, { status: 400, headers: cors });

  const { data: product, error: productError } = await supabase.from('products')
    .select('id,name,price,sale_price,stock_quantity').eq('id', productId).maybeSingle();
  if (productError || !product) return Response.json({ error: 'product_unavailable' }, { status: 404, headers: cors });
  const { data: alerts, error: alertError } = await supabase.from('product_alerts')
    .select('user_id,email,language,target_price,notify_price_drop,notify_restock')
    .eq('product_id', productId);
  if (alertError) return Response.json({ error: 'alerts_unavailable' }, { status: 503, headers: cors });
  if (!resendKey || !sender) return Response.json({ sent: 0, pending: alerts?.length || 0, configured: false }, { headers: cors });

  const currentPrice = Number(product.sale_price ?? product.price);
  const previousPrice = Number(body.previous_price);
  const restocked = body.previous_stock != null && Number(body.previous_stock) === 0 && Number(product.stock_quantity) > 0;
  const priceDropped = Number.isFinite(previousPrice) && currentPrice < previousPrice;
  const emailCopy = {
    az: { name: product.name?.az || 'Melatoni məhsulu', restock: 'Məhsul yenidən stokdadır.', drop: 'İzlədiyiniz məhsulun qiyməti düşüb.', both: 'Məhsul yenidən stokdadır və qiyməti düşüb.', price: 'Yeni qiymət' },
    ru: { name: product.name?.ru || product.name?.az || 'Товар Melatoni', restock: 'Товар снова в наличии.', drop: 'Цена выбранного товара снизилась.', both: 'Товар снова в наличии, и его цена снизилась.', price: 'Новая цена' },
    en: { name: product.name?.en || product.name?.az || 'Melatoni product', restock: 'The item is back in stock.', drop: 'The price of your selected item has dropped.', both: 'The item is back in stock and its price has dropped.', price: 'New price' },
  };
  const siteUrl = (Deno.env.get('SITE_URL') || 'https://altohausgerate-coder.github.io/melatoni').replace(/\/$/, '');
  let sent = 0, matched = 0, failed = 0;
  for (const alert of alerts || []) {
    const priceMatch = priceDropped && alert.notify_price_drop && (alert.target_price == null || currentPrice <= Number(alert.target_price));
    const stockMatch = restocked && alert.notify_restock;
    if (!priceMatch && !stockMatch) continue;
    matched += 1;
    const lang = ['az','ru','en'].includes(alert.language) ? alert.language : 'az';
    const copy = emailCopy[lang];
    const reason = stockMatch && priceMatch ? copy.both : stockMatch ? copy.restock : copy.drop;
    const formattedPrice = new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-US' : 'az-AZ', { minimumFractionDigits: 2 }).format(currentPrice);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: sender,
        to: [alert.email],
        subject: `${copy.name} — Melatoni`,
        text: `${reason}\n${copy.name}\n${copy.price}: ${formattedPrice} AZN\n${siteUrl}/products.html?q=${encodeURIComponent(copy.name)}`,
      }),
    });
    if (!response.ok) { failed += 1; continue; }
    const { error: updateError } = await supabase.from('product_alerts').update({
      last_notified_price: currentPrice,
      last_notified_stock: product.stock_quantity,
      last_notified_at: new Date().toISOString(),
    }).eq('user_id', alert.user_id).eq('product_id', productId);
    if (!updateError) sent += 1; else failed += 1;
  }
  return Response.json({ sent, matched, failed, configured: true }, { headers: cors });
});
