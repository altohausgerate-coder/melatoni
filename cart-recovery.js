(() => {
  const client = window.MELATONI_SUPABASE;
  if (!client) return;
  let timer;
  const saveOptedInCart = async () => {
    try {
      const { data: { user } } = await client.auth.getUser();
      if (!user) return;
      const { data: push } = await client.from('push_subscriptions').select('id').eq('user_id', user.id).limit(1);
      if (!push?.length) return;
      const bag = JSON.parse(window.MelatoniStorage?.get('melatoni-cart') || '[]');
      const products = window.MELATONI_PRODUCTS || [];
      const items = Array.isArray(bag) ? bag.filter(item => item && products.some(product => product.id === item.id) && Number(item.qty) > 0)
        .map(item => ({ id: item.id, qty: Math.max(1, Math.min(99, Math.floor(Number(item.qty)))), color: String(item.color || '').slice(0, 60), size: String(item.size || '').slice(0, 60) })) : [];
      if (!items.length) { await client.from('abandoned_carts').delete().eq('user_id', user.id); return; }
      const total = items.reduce((sum, item) => {
        const product = products.find(entry => entry.id === item.id);
        return sum + (Number(product?.salePrice) > 0 ? Number(product.salePrice) : Number(product?.price) || 0) * item.qty;
      }, 0);
      const language = window.MelatoniStorage?.get('melatoni-language') || 'az';
      await client.from('abandoned_carts').upsert({ user_id: user.id, items, total, language: ['az','ru','en'].includes(language) ? language : 'az', updated_at: new Date().toISOString(), recovery_sent_at: null }, { onConflict: 'user_id' });
    } catch { /* Guest checkout and local cart must keep working if recovery storage is unavailable. */ }
  };
  document.addEventListener('melatoni:cart-change', () => { clearTimeout(timer); timer = setTimeout(saveOptedInCart, 1200); });
  document.addEventListener('click', event => {
    if (!event.target.closest('.bag-toggle')) return;
    setTimeout(() => { if (document.querySelector('#cartDrawer')?.classList.contains('open')) document.dispatchEvent(new Event('melatoni:cart-change')); }, 50);
  });
  document.addEventListener('DOMContentLoaded', () => document.dispatchEvent(new Event('melatoni:cart-change')));
})();
