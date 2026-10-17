import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: cors });
  const url = Deno.env.get('SUPABASE_URL'), anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = request.headers.get('Authorization');
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY'), privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!url || !anonKey || !authorization || !publicKey || !privateKey) return Response.json({ error: 'push_not_configured' }, { status: 503, headers: cors });
  const client = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return Response.json({ error: 'unauthorized' }, { status: 401, headers: cors });
  const { data: profile } = await client.from('profiles').select('is_admin').eq('id', auth.user.id).maybeSingle();
  if (!profile?.is_admin) return Response.json({ error: 'forbidden' }, { status: 403, headers: cors });
  let input: { title?: unknown; body?: unknown; url?: unknown };
  try { input = await request.json(); } catch { return Response.json({ error: 'invalid_body' }, { status: 400, headers: cors }); }
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 120) : '';
  const body = typeof input.body === 'string' ? input.body.trim().slice(0, 300) : '';
  const target = typeof input.url === 'string' ? input.url.trim().slice(0, 300) : 'products.html';
  if (!title || !body || !target || /^(?:\/|[a-z][a-z\d+.-]*:)/i.test(target)) return Response.json({ error: 'invalid_message' }, { status: 400, headers: cors });
  const { data: subscriptions, error } = await client.from('push_subscriptions').select('user_id,subscription');
  if (error) return Response.json({ error: 'subscriptions_unavailable' }, { status: 503, headers: cors });
  const recipientIds = [...new Set((subscriptions || []).map(row => row.user_id))];
  const notifications = recipientIds.map(user_id => ({ user_id, kind: 'campaign', title, body, url: target }));
  if (notifications.length) {
    const { error: insertError } = await client.from('customer_notifications').insert(notifications);
    if (insertError) return Response.json({ error: 'notifications_unavailable' }, { status: 503, headers: cors });
  }
  webpush.setVapidDetails('mailto:taghilituran@gmail.com', publicKey, privateKey);
  let sent = 0, failed = 0;
  for (const row of subscriptions || []) {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify({ title, body, url: target }));
      sent += 1;
    } catch (error) {
      failed += 1;
      if ((error as { statusCode?: number })?.statusCode === 404 || (error as { statusCode?: number })?.statusCode === 410) {
        await client.from('push_subscriptions').delete().eq('user_id', row.user_id).eq('subscription->>endpoint', row.subscription?.endpoint);
      }
    }
  }
  return Response.json({ sent, failed, recipients: recipientIds.length }, { headers: cors });
});
