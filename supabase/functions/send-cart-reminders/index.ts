import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const html = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]!));
const money = (value: unknown) => `${new Intl.NumberFormat('az-AZ',{maximumFractionDigits:2}).format(Number(value)||0)} AZN`;
const bodyFor = (row: Record<string, any>) => {
  const lang = ['az','ru','en'].includes(row.payload?.language) ? row.payload.language : 'az';
  const lines = Array.isArray(row.payload?.items) ? row.payload.items.slice(0,20).map((item: any) => `<li>${html(item.name || item.id)} × ${Math.max(1,Number(item.qty)||1)}</li>`).join('') : '';
  const subjects: Record<string,string> = {az:'Səbətiniz sizi gözləyir',ru:'Ваша корзина ждёт',en:'Your bag is waiting'};
  const intros: Record<string,string> = {az:'Seçdiyiniz məhsullara qayıtmaq istəsəniz, səbətiniz hazırdır.',ru:'Если вы хотите вернуться к выбранным товарам, ваша корзина сохранена.',en:'Your selected items are saved if you would like to come back.'};
  const cta: Record<string,string> = {az:'Səbətə qayıt',ru:'Вернуться в корзину',en:'Return to your bag'};
  const title = subjects[lang];
  const url = 'https://melatoni.com/index.html#bag';
  return {title,lang,url,subject:`Melatoni · ${title}`,html:`<div style="max-width:600px;margin:0 auto;padding:32px 24px;background:#f7f7f3;color:#193247;font:16px/1.6 Arial,sans-serif"><p style="letter-spacing:.15em;color:#708498;font-size:12px">MELATONI</p><h1 style="font-size:26px">${title}</h1><p>${intros[lang]}</p><ul>${lines}</ul><p><strong>${money(row.payload?.total)}</strong></p><a href="${url}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#17457c;color:#fff;text-decoration:none">${cta[lang]}</a><p style="color:#708498;font-size:12px">${lang==='az'?'Bu xatırlatmanı hesabınızdakı seçimə əsasən göndəririk.':lang==='ru'?'Это напоминание отправлено согласно настройкам вашего аккаунта.':'This reminder was sent based on your account preference.'}</p></div>`};
};

Deno.serve(async request => {
  if (request.method !== 'POST') return Response.json({error:'method_not_allowed'},{status:405});
  const url=Deno.env.get('SUPABASE_URL'), serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const secret=request.headers.get('x-recovery-secret');
  if (!url || !serviceKey || !secret) return Response.json({error:'recovery_not_configured'},{status:503});
  const db=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
  const {error:enqueueError}=await db.rpc('enqueue_cart_reminders',{p_secret:secret});
  if(enqueueError)return Response.json({error:'recovery_unavailable'},{status:503});
  const {data:jobs,error}=await db.rpc('claim_cart_reminder_jobs',{p_secret:secret});
  if(error)return Response.json({error:'queue_unavailable'},{status:503});
  const resendKey=Deno.env.get('RESEND_API_KEY'), emailFrom=Deno.env.get('EMAIL_FROM');
  const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'), privateKey=Deno.env.get('VAPID_PRIVATE_KEY');
  const canPush=Boolean(publicKey&&privateKey);
  if(canPush)webpush.setVapidDetails('mailto:support@melatoni.com',publicKey!,privateKey!);
  let sent=0,failed=0;
  for(const row of jobs||[]){
    const jobId=String(row.job_id), copy=bodyFor(row), pushList=Array.isArray(row.push_subscriptions)?row.push_subscriptions:[];
    if(row.email&&!row.email_sent_at){
      if(resendKey&&emailFrom){
        try{
          const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json','Idempotency-Key':`melatoni-cart-${jobId}`},body:JSON.stringify({from:emailFrom,to:[row.email],subject:copy.subject,html:copy.html})});
          if(!result.ok)throw new Error(`email_${result.status}`);
          await db.rpc('finish_cart_reminder',{p_secret:secret,p_job_id:jobId,p_channel:'email',p_success:true});sent++;
        }catch{await db.rpc('finish_cart_reminder',{p_secret:secret,p_job_id:jobId,p_channel:'email',p_success:false,p_error:'email_delivery_failed'});failed++}
      }else{await db.rpc('finish_cart_reminder',{p_secret:secret,p_job_id:jobId,p_channel:'email',p_success:false,p_error:'email_provider_not_configured'});failed++}
    }
    if(!row.push_sent_at){
      if(!pushList.length){await db.rpc('finish_cart_reminder',{p_secret:secret,p_job_id:jobId,p_channel:'push',p_success:true});}
      else if(canPush){
        let channelFailed=false;
        for(const subscription of pushList){try{await webpush.sendNotification(subscription,JSON.stringify({title:copy.title,body:copy.lang==='ru'?'Вернитесь к выбранным товарам для комфортного сна.':copy.lang==='en'?'Come back to your saved sleep essentials.':'Seçdiyiniz rahat yuxu məhsullarına qayıdın.',url:copy.url}));}catch{channelFailed=true}}
        await db.rpc('finish_cart_reminder',{p_secret:secret,p_job_id:jobId,p_channel:'push',p_success:!channelFailed,p_error:channelFailed?'push_delivery_failed':null});
        if(channelFailed)failed++;else sent++;
      }else{await db.rpc('finish_cart_reminder',{p_secret:secret,p_job_id:jobId,p_channel:'push',p_success:false,p_error:'push_provider_not_configured'});failed++}
    }
  }
  return Response.json({jobs:jobs?.length||0,sent,failed});
});
