import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

Deno.serve(async request => {
  if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  const url = Deno.env.get('SUPABASE_URL'), anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const secret = request.headers.get('x-recovery-secret');
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY'), privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!url || !anonKey || !secret || !publicKey || !privateKey) return Response.json({ error: 'push_not_configured' }, { status: 503 });
  const client = createClient(url, anonKey);
  const { data, error } = await client.rpc('claim_abandoned_cart_pushes', { p_secret: secret });
  if (error) return Response.json({ error: 'recovery_unavailable' }, { status: 403 });
  webpush.setVapidDetails('mailto:taghilituran@gmail.com', publicKey, privateKey);
  let sent = 0, failed = 0;
  for (const row of data || []) {
    try { await webpush.sendNotification(row.subscription, JSON.stringify({ title: row.title, body: row.body, url: row.url })); sent += 1; }
    catch { failed += 1; }
  }
  return Response.json({ sent, failed });
});
