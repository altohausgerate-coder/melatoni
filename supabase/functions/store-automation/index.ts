import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const response = (status: number, error?: string, extra: Record<string, unknown> = {}) =>
  Response.json(error ? { error, ...extra } : extra, { status, headers: { 'Cache-Control': 'no-store' } });

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]!));
const money = (value: unknown) => `${new Intl.NumberFormat('az-AZ', { maximumFractionDigits: 2 }).format(Number(value) || 0)} AZN`;
const statusAz: Record<string, string> = {
  pending: 'Yeni', confirmed: 'Təsdiqləndi', preparing: 'Hazırlanır', processing: 'Hazırlanır',
  shipping: 'Kuryerə verildi', delivered: 'Çatdırıldı', cancelled: 'Ləğv edildi'
};
const statusCopy: Record<string, Record<string, string>> = {
  az: { order: 'Sifarişiniz qəbul edildi', status: 'Sifariş statusu yeniləndi', body: 'Sifarişinizin yeni statusu', follow: 'Sifarişinizi hesabınızın “Sifarişlərim” bölməsindən izləyə bilərsiniz.', quote: 'Qiyməti soruşulan məhsulların yekun qiyməti Melatoni komandası tərəfindən ayrıca dəqiqləşdiriləcək.' },
  ru: { order: 'Ваш заказ принят', status: 'Статус заказа обновлён', body: 'Новый статус заказа', follow: 'Вы можете следить за заказом в разделе «Мои заказы».', quote: 'Цена товаров по запросу будет уточнена командой Melatoni отдельно.' },
  en: { order: 'Your order has been received', status: 'Your order status was updated', body: 'Your order status', follow: 'You can follow your order in the “My orders” section.', quote: 'Melatoni will confirm the prices of quote-request items separately.' }
};

async function telegram(text: string, token: string, chatId: string) {
  const result = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  });
  if (!result.ok) throw new Error(`telegram_${result.status}`);
}

async function email(to: string, subject: string, html: string, key: string, from: string, idempotencyKey: string) {
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ from, to: [to], subject, html })
  });
  if (!result.ok) throw new Error(`email_${result.status}`);
}

function orderAdminMessage(job: Record<string, any>) {
  const address = job.shipping_address || {};
  const addressText = [address.city, address.district, address.street, address.note].filter(Boolean).join(', ') || 'Ünvan qeyd edilməyib';
  const items = Array.isArray(job.items) ? job.items.map((item: Record<string, unknown>) =>
    `• ${String(item.name || item.id || 'Məhsul')} × ${Number(item.qty) || 1}${item.quote_only ? ' · qiyməti soruşulur' : ''}`
  ).join('\n') : 'Məhsul məlumatı yoxdur';
  return [
    job.event_type === 'order_created' ? 'Yeni sifariş daxil oldu' : `Sifariş statusu: ${statusAz[job.status] || job.status}`,
    `Nömrə: ${job.order_number || job.order_id}`,
    `Müştəri: ${job.customer_name || 'Ad yoxdur'}`,
    `Telefon: ${job.customer_phone || 'Telefon yoxdur'}`,
    `E-poçt: ${job.customer_email || 'E-poçt yoxdur'}`,
    'Məhsullar:', items,
    Array.isArray(job.items) && job.items.some((item: Record<string, unknown>) => item.quote_only) ? `Məbləğ: qiyməti olan məhsullar ${money(job.total)} · bəzi məhsullar üçün qiymət dəqiqləşdiriləcək` : `Məbləğ: ${money(job.total)}`,
    `Ödəniş: ${job.payment_method === 'to_be_confirmed' ? 'Mağaza ilə razılaşdırılacaq' : job.payment_method || 'Qeyd edilməyib'} · ${job.payment_status || 'ödəniş məlumatı yoxdur'}`,
    `Çatdırılma: ${addressText}`,
    `Vaxt: ${new Date(job.created_at).toLocaleString('az-AZ', { timeZone: 'Asia/Baku' })}`
  ].join('\n');
}

function customerOrderEmail(job: Record<string, any>) {
  const language = statusCopy[job.language] ? job.language : 'az';
  const copy = statusCopy[language];
  const title = job.event_type === 'order_created' ? copy.order : copy.status;
  const lines = Array.isArray(job.items) ? job.items.map((item: Record<string, unknown>) =>
    `<li>${escapeHtml(item.name || item.id)} × ${Number(item.qty) || 1}${item.quote_only ? ` · ${escapeHtml(copy.quote)}` : ''}</li>`
  ).join('') : '';
  const status = statusAz[job.status] || String(job.status || '');
  const quoteOnly = Array.isArray(job.items) && job.items.some((item: Record<string, unknown>) => item.quote_only);
  const amount = quoteOnly ? `<p>${escapeHtml(copy.quote)}${Number(job.total)>0?` ${escapeHtml(money(job.total))}`:''}</p>` : `<p><strong>${escapeHtml(money(job.total))}</strong></p>`;
  const orderNumber = job.order_number || String(job.order_id || '').slice(0, 8).toUpperCase();
  return `<div style="max-width:600px;margin:0 auto;padding:32px 24px;background:#f7f7f3;color:#193247;font-family:Arial,sans-serif;line-height:1.6"><p style="letter-spacing:.15em;color:#708498;font-size:12px">MELATONI</p><h1 style="font-size:26px">${escapeHtml(title)}</h1><p>${escapeHtml(copy.body)}: <strong>${escapeHtml(status)}</strong></p><p><strong>${escapeHtml(orderNumber)}</strong></p><ul>${lines}</ul>${amount}<p>${escapeHtml(copy.follow)}</p><a href="https://melatoni.com/account.html#orders" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#17457c;color:#fff;text-decoration:none">${language === 'en' ? 'View my orders' : language === 'ru' ? 'Мои заказы' : 'Sifarişlərim'}</a></div>`;
}

Deno.serve(async request => {
  if (request.method !== 'POST') return response(405, 'method_not_allowed');
  const secret = request.headers.get('x-store-automation-secret');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const emailFrom = Deno.env.get('EMAIL_FROM');
  if (!secret || !serviceKey || !url || !botToken || !chatId || !resendKey || !emailFrom) {
    return response(503, 'automation_secrets_missing');
  }
  let input: { task?: unknown };
  try { input = await request.json(); } catch { return response(400, 'invalid_body'); }
  const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  if (input.task === 'weekly-report') {
    const { data, error } = await db.rpc('store_weekly_report', { p_secret: secret });
    if (error || !data) return response(503, 'report_unavailable');
    const top = Array.isArray(data.top_products) ? data.top_products.map((item: any) => `${item.name || 'Məhsul'} × ${item.quantity}`).join('\n') : '—';
    const low = Array.isArray(data.low_stock) ? data.low_stock.map((item: any) => `${item.name}: ${item.stock}`).join('\n') : '—';
    const message = [
      'Melatoni · həftəlik hesabat',
      `Dövr: ${new Date(data.period_start).toLocaleDateString('az-AZ')} – ${new Date(data.period_end).toLocaleDateString('az-AZ')}`,
      `Sifarişlər: ${data.order_count}`, `Satış: ${money(data.sales)}`, `Yeni sifarişlər: ${data.new_orders}`,
      'Ən çox satılanlar:', top || '—', 'Azalan stok:', low || '—',
      `Tərk edilmiş səbətlər: ${data.abandoned_carts} · ${money(data.abandoned_value)}`
    ].join('\n');
    try { await telegram(message, botToken, chatId); return response(200, undefined, { sent: true }); }
    catch { return response(502, 'telegram_delivery_failed'); }
  }
  if (input.task !== 'queue') return response(400, 'unknown_task');

  const { data: jobs, error } = await db.rpc('claim_store_automation', { p_secret: secret });
  if (error) return response(503, 'queue_unavailable');
  let processed = 0, failed = 0;
  for (const job of jobs || []) {
    const id = String(job.job_id);
    if (job.event_type === 'support_escalation') {
      if (job.telegram_sent_at) continue;
      const message = [
        'Melatoni · canlı dəstək müraciəti',
        `Ad: ${job.contact_name}`,
        `Telefon: ${job.contact_phone}`,
        `E-poçt: ${job.contact_email || 'Qeyd edilməyib'}`,
        `Mesaj: ${job.message}`,
        `Vaxt: ${new Date(job.created_at).toLocaleString('az-AZ', { timeZone: 'Asia/Baku' })}`
      ].join('\n');
      try {
        await telegram(message, botToken, chatId);
        await db.rpc('finish_store_automation', { p_secret: secret, p_job_id: id, p_channel: 'telegram', p_success: true });
        processed += 1;
      } catch {
        await db.rpc('finish_store_automation', { p_secret: secret, p_job_id: id, p_channel: 'telegram', p_success: false, p_error: 'telegram_delivery_failed' });
        failed += 1;
      }
      continue;
    }
    if (job.event_type === 'low_stock') {
      if (job.telegram_sent_at) continue;
      const name = job.product_name?.az || job.product_name?.en || job.product_id;
      try {
        await telegram(`Melatoni · stok xəbərdarlığı\n${name}\nQalıq: ${job.stock_quantity} ədəd`, botToken, chatId);
        await db.rpc('finish_store_automation', { p_secret: secret, p_job_id: id, p_channel: 'telegram', p_success: true });
        processed += 1;
      } catch {
        await db.rpc('finish_store_automation', { p_secret: secret, p_job_id: id, p_channel: 'telegram', p_success: false, p_error: 'telegram_delivery_failed' });
        failed += 1;
      }
      continue;
    }

    if (!job.telegram_sent_at) {
      try {
        await telegram(orderAdminMessage(job), botToken, chatId);
        await db.rpc('finish_store_automation', { p_secret: secret, p_job_id: id, p_channel: 'telegram', p_success: true });
        job.telegram_sent_at = true;
      } catch {
        await db.rpc('finish_store_automation', { p_secret: secret, p_job_id: id, p_channel: 'telegram', p_success: false, p_error: 'telegram_delivery_failed' });
        failed += 1;
      }
    }
    if (job.customer_email && !job.email_sent_at) {
      try {
        const copy = statusCopy[job.language] || statusCopy.az;
        const subject = `${job.event_type === 'order_created' ? copy.order : copy.status} · ${job.order_number}`;
        await email(job.customer_email, subject, customerOrderEmail(job), resendKey, emailFrom, `melatoni-${id}-customer-email`);
        await db.rpc('finish_store_automation', { p_secret: secret, p_job_id: id, p_channel: 'email', p_success: true });
        job.email_sent_at = true;
      } catch {
        await db.rpc('finish_store_automation', { p_secret: secret, p_job_id: id, p_channel: 'email', p_success: false, p_error: 'customer_email_delivery_failed' });
        failed += 1;
      }
    }
    if (job.telegram_sent_at || job.customer_email) processed += 1;
  }
  return response(200, undefined, { jobs: jobs?.length || 0, processed, failed });
});
