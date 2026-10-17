/* Public browser configuration only. Never place a service_role key here. */
window.MELATONI_SUPABASE_URL = 'https://zjmfvtcclecmbjcimddc.supabase.co';
window.MELATONI_SUPABASE_ANON_KEY = 'sb_publishable_1pNMgE8BRyWcx50UQOknnQ_DPYy6HsA';
// Public VAPID key is safe to publish. The matching private key belongs in Supabase Function secrets only.
window.MELATONI_PUSH_VAPID_PUBLIC_KEY = 'BB-IiIghHyRTqBxg6lj-7gjbaY4rrP6Bfp8sYJTBiKmAPk3qq9zamp4QEXNBrZQbhpqcFA5ukMW-LUAR_UYOqeY';
window.MELATONI_SUPABASE_READY = Boolean(
  window.supabase?.createClient &&
  window.MELATONI_SUPABASE_URL &&
  window.MELATONI_SUPABASE_ANON_KEY &&
  !window.MELATONI_SUPABASE_ANON_KEY.includes('<')
);
window.MELATONI_SUPABASE = window.MELATONI_SUPABASE_READY
  ? window.supabase.createClient(window.MELATONI_SUPABASE_URL, window.MELATONI_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.MelatoniStorage?.supabaseAdapter }
    })
  : null;
