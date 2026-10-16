(() => {
  const client = window.MELATONI_SUPABASE;
  if (!client) return;
  const storage = window.MelatoniStorage;
  let sessionId = storage?.get('melatoni-analytics-session', '');
  if (!sessionId) {
    try { sessionId = crypto.randomUUID(); } catch { sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
    storage?.set('melatoni-analytics-session', sessionId);
  }
  const log = (eventName, productId = null, metadata = {}) => {
    const clean = Object.fromEntries(Object.entries(metadata).filter(([key, value]) => /^(query|category|source)$/.test(key) && typeof value === 'string').map(([key, value]) => [key, value.slice(0, 120)]));
    let safeReferrer = '';
    try { const referrer = new URL(document.referrer); safeReferrer = `${referrer.origin}${referrer.pathname}`.slice(0, 500); } catch { /* Ignore invalid or unavailable referrers. */ }
    client.from('storefront_events').insert({
      event_name: eventName, product_id: productId || null, session_id: String(sessionId).slice(0, 100),
      page: location.pathname.slice(0, 500), referrer: safeReferrer, metadata: clean
    }).then(() => {}).catch(() => {});
  };
  window.MELATONI_LOG_EVENT = log;
  log('page_view');
  const id = new URLSearchParams(location.search).get('id');
  if (id) log('product_view', id);
  let searchTimer;
  document.querySelector('#searchInput')?.addEventListener('input', event => {
    clearTimeout(searchTimer);
    const query = event.target.value.trim();
    if (query) searchTimer = setTimeout(() => log('search', null, { query }), 700);
  });
  document.addEventListener('click', event => {
    const purchase = event.target.closest('[data-add], [data-add-to-bag], #detailAdd, #detailOrder');
    if (purchase) {
      const productId = purchase.dataset.add || purchase.dataset.addToBag || id;
      const product = (window.MELATONI_PRODUCTS || []).find(item => item.id === productId);
      if (product && product.stock != null && Number(product.stock) === 0) {
        event.preventDefault(); event.stopImmediatePropagation();
        const lang = window.MelatoniStorage?.get('melatoni-language') || 'az';
        let notice = document.querySelector('.stock-notice');
        if (!notice) { notice = document.createElement('p'); notice.className = 'stock-notice'; notice.setAttribute('role','status'); notice.setAttribute('aria-live','polite'); document.body.appendChild(notice); }
        notice.textContent = ({az:'Bu məhsul hazırda anbarda yoxdur.',ru:'Сейчас этого товара нет в наличии.',en:'This item is currently out of stock.'})[lang] || 'Bu məhsul hazırda anbarda yoxdur.';
        return;
      }
    }
    const add = event.target.closest('#productGrid [data-add], [data-add-to-bag], #detailAdd');
    if (add) { log('add_to_cart', add.dataset.add || add.dataset.addToBag || id, { source: location.pathname }); return; }
    const link = event.target.closest('a[href*="product.html?id="]');
    if (link) {
      const productId = new URL(link.href).searchParams.get('id');
      if (productId) log('product_click', productId);
    }
    const favorite = event.target.closest('[data-save], [data-favorite]');
    if (favorite) log('wishlist_add', favorite.dataset.save || favorite.dataset.favorite);
  });
  document.addEventListener('melatoni:order-created', event => log('order_created', null, { source: event.detail?.source || 'checkout' }));
})();
