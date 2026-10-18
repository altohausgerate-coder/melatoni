import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

Deno.serve(async request => {
  if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const secret = request.headers.get('x-order-push-secret');
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!url || !anonKey || !secret || !publicKey || !privateKey) {
    return Response.json({ error: 'push_not_configured' }, { status: 503 });
  }

  const client = createClient(url, anonKey);
  const { data: orders, error } = await client.rpc('claim_order_pushes', { p_secret: secret });
  if (error) return Response.json({ error: 'order_queue_unavailable' }, { status: 403 });

  webpush.setVapidDetails('mailto:taghilituran@gmail.com', publicKey, privateKey);
  let sent = 0;
  let failed = 0;

  for (const order of orders || []) {
    let orderSent = 0;
    let orderFailed = 0;
    const shortId = String(order.order_id || '').slice(0, 8).toUpperCase();
    const total = `${new Intl.NumberFormat('az-AZ', { maximumFractionDigits: 2 }).format(Number(order.total) || 0)} AZN`;
    const title = 'Yeni sifariş daxil oldu';
    const body = `#${shortId} · ${total} · ${String(order.items || 'Yeni sifariş').slice(0, 180)}`.slice(0, 300);
    const payload = JSON.stringify({ title, body, url: 'admin.html#orders', tag: `order-${shortId}` });

    for (const recipient of order.recipients || []) {
      try {
        await webpush.sendNotification(recipient.subscription, payload);
        orderSent += 1;
        sent += 1;
      } catch {
        orderFailed += 1;
        failed += 1;
      }
    }

    await client.rpc('finish_order_push', {
      p_secret: secret,
      p_order_id: order.order_id,
      p_sent: orderSent,
      p_failed: orderFailed,
      p_error: orderSent ? null : 'Push xidməti bu cihazlara çatdıra bilmədi.'
    });
  }

  return Response.json({ orders: orders?.length || 0, sent, failed });
});
