(() => {
  const client = window.MELATONI_SUPABASE;
  if (!client) return;
  const storage = window.MelatoniStorage;
  let analyticsAllowed = Boolean(window.MelatoniConsent?.has('analytics'));
  let sessionId = '';
  const getSessionId = () => {
    if (sessionId) return sessionId;
    sessionId = storage?.get('melatoni-analytics-session', '') || '';
    if (!sessionId) {
      try { sessionId = crypto.randomUUID(); } catch { sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
      storage?.set('melatoni-analytics-session', sessionId);
    }
    return sessionId;
  };
  let visitorId = storage?.get('melatoni-visitor-id', '') || '';
  if (!visitorId) {
    try { visitorId = crypto.randomUUID(); } catch { visitorId = `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
    storage?.set('melatoni-visitor-id', visitorId);
  }
  let activeSeconds = Number(storage?.get('melatoni-active-seconds', '0', 'session')) || 0;
  let presenceTimer = null;
  const deviceType = () => {
    const ua = navigator.userAgent || '';
    if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
    if (/iPhone|iPod|Android.*Mobile|Mobile/i.test(ua) || matchMedia('(max-width: 700px)').matches) return 'phone';
    return 'desktop';
  };
  const currentProduct = () => {
    const productId = new URLSearchParams(location.search).get('id');
    const product = (window.MELATONI_PRODUCTS || []).find(item => item.id === productId);
    const productName = typeof product?.name === 'object' ? product.name.az || product.name.en || product.name.ru : product?.name;
    return { productId, productName: productName || '' };
  };
  const referrerHost = () => {
    try { const url = new URL(document.referrer); return url.host === location.host ? 'melatoni.com' : url.host; }
    catch { return ''; }
  };
  const updatePresence = () => {
    if (!analyticsAllowed || document.visibilityState === 'hidden') return;
    const { productId, productName } = currentProduct();
    client.rpc('track_visitor_presence', {
      p_session_id: String(getSessionId()).slice(0,100),
      p_visitor_id: String(visitorId).slice(0,100),
      p_current_page: `${location.pathname}${location.search}`.slice(0,500),
      p_page_title: document.title.slice(0,180),
      p_product_id: productId,
      p_product_name: productName,
      p_device_type: deviceType(),
      p_referrer_host: referrerHost(),
      p_active_seconds: Math.min(86400,Math.max(0,Math.round(activeSeconds)))
    }).then(() => {}).catch(() => {});
  };
  const startPresence = () => {
    if (!analyticsAllowed || presenceTimer) return;
    updatePresence();
    presenceTimer = setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        activeSeconds += 15;
        storage?.set('melatoni-active-seconds', String(activeSeconds), 'session');
        updatePresence();
      }
    },15000);
  };
  const log = (eventName, productId = null, metadata = {}) => {
    if (!analyticsAllowed) return;
    const clean = Object.fromEntries(Object.entries(metadata).filter(([key, value]) => /^(category|source)$/.test(key) && typeof value === 'string').map(([key, value]) => [key, value.slice(0, 120)]));
    let safeReferrer = '';
    try { const referrer = new URL(document.referrer); safeReferrer = `${referrer.origin}${referrer.pathname}`.slice(0, 500); } catch { /* Ignore invalid or unavailable referrers. */ }
    client.from('storefront_events').insert({
      event_name: eventName, product_id: productId || null, session_id: String(getSessionId()).slice(0, 100),
      page: location.pathname.slice(0, 500), referrer: safeReferrer, metadata: clean
    }).then(() => {}).catch(() => {});
  };
  window.MELATONI_LOG_EVENT = log;
  window.addEventListener('melatoni:consent-change', event => {
    analyticsAllowed = event.detail?.categories?.analytics === true;
    if (!analyticsAllowed) {
      sessionId = '';
      storage?.remove('melatoni-analytics-session');
      if (presenceTimer) clearInterval(presenceTimer);
      presenceTimer = null;
    }
    if (analyticsAllowed) window.requestAnimationFrame(() => { scanVisibleProducts(); startPresence(); });
  });
  let recommendationUserId = null;
  let recommendationConsent = false;
  const pendingInteractions = [];
  const seenViews = new Set();
  const trackCustomerInteraction = (productId, eventName) => {
    if (!productId || !['view','add_to_cart'].includes(eventName)) return;
    if (recommendationUserId && recommendationConsent) {
      client.from('customer_interactions').insert({ user_id: recommendationUserId, product_id: productId, event_name: eventName }).then(() => {}).catch(() => {});
    } else if (recommendationUserId === null && pendingInteractions.length < 20) pendingInteractions.push({ productId, eventName });
  };
  client.auth.getUser().then(async ({data}) => {
    const user = data?.user;
    if (!user) { recommendationUserId = ''; pendingInteractions.length = 0; return; }
    recommendationUserId = user.id;
    const {data: preferences, error} = await client.from('customer_preferences').select('recommendations_consent').eq('user_id',user.id).maybeSingle();
    recommendationConsent = !error && preferences?.recommendations_consent === true;
    if (recommendationConsent) pendingInteractions.splice(0).forEach(item => trackCustomerInteraction(item.productId,item.eventName));
    else pendingInteractions.length = 0;
  }).catch(() => { recommendationUserId = ''; pendingInteractions.length = 0; });
  log('page_view');
  startPresence();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { updatePresence(); startPresence(); } });
  window.addEventListener('pagehide', updatePresence);
  const id = new URLSearchParams(location.search).get('id');
  if (id) { log('product_view', id); if (!seenViews.has(id)) { seenViews.add(id); trackCustomerInteraction(id,'view'); } }
  const categoriesForSearch = query => {
    const normalized = query.toLocaleLowerCase();
    const result = new Set();
    (window.MELATONI_PRODUCTS || []).forEach(product => {
      const values = [product.name, product.desc].flatMap(value => typeof value === 'string' ? [value] : Object.values(value || {}));
      if (values.some(value => String(value).toLocaleLowerCase().includes(normalized)) && typeof product.category === 'string') result.add(product.category);
    });
    return [...result].filter(category => ['linen','pillow','duvet','bedcare','accessory','sleepwear','bath','gift'].includes(category));
  };
  const rememberSearchInterests = async categories => {
    if (!recommendationUserId || !recommendationConsent || !categories.length) return;
    try {
      const { data, error } = await client.from('customer_preferences').select('interests').eq('user_id', recommendationUserId).maybeSingle();
      if (error) return;
      const interests = [...new Set([...(data?.interests || []), ...categories])];
      await client.from('customer_preferences').upsert({ user_id: recommendationUserId, recommendations_consent: true, interests, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    } catch { /* Search-based category preferences are optional. */ }
  };
  let searchTimer;
  document.querySelector('#searchInput')?.addEventListener('input', event => {
    clearTimeout(searchTimer);
    const query = event.target.value.trim();
    if (query.length >= 2) searchTimer = setTimeout(() => {
      const categories = categoriesForSearch(query);
      categories.forEach(category => log('search', null, { category }));
      rememberSearchInterests(categories);
    }, 700);
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
    if (add) { const productId = add.dataset.add || add.dataset.addToBag || id; log('add_to_cart', productId, { source: location.pathname }); trackCustomerInteraction(productId,'add_to_cart'); return; }
    const link = event.target.closest('a[href*="product.html?id="]');
    if (link) {
      const productId = new URL(link.href).searchParams.get('id');
      if (productId) log('product_click', productId, { source: placementFor(link) });
    }
    const favorite = event.target.closest('[data-save], [data-favorite]');
    if (favorite) log('wishlist_add', favorite.dataset.save || favorite.dataset.favorite);
    const cartRemove = event.target.closest('#cartItems [data-remove], #cartItems [data-qty][data-delta="-1"]');
    if (cartRemove) {
      const currentQuantity = Number(cartRemove.parentElement?.querySelector('span')?.textContent?.replace(/[^0-9]/g,''));
      if (cartRemove.hasAttribute('data-remove') || currentQuantity <= 1) {
        let productId = null;
        try { productId = JSON.parse(decodeURIComponent(cartRemove.dataset.key || ''))?.[0] || null; } catch { /* Ignore malformed cart row keys. */ }
        log('cart_removed', productId, { source: location.pathname });
      }
    }
  });
  document.addEventListener('melatoni:order-created', event => log('order_created', null, { source: event.detail?.source || 'checkout' }));
  document.querySelector('#cartOrder')?.addEventListener('click', () => log('checkout_started', null, { source: 'cart' }));

  const impressionSelector = '#productGrid .product-card, #popularGrid [data-popular-card], .collection-products .collection-product-card, .account-product-links a';
  const observedCards = new WeakSet();
  const seenImpressions = new Set();
  function placementFor(node) {
    if (node.closest('#popularGrid')) return 'popular_products';
    if (node.closest('.collection-products')) return 'home_collection';
    if (node.closest('.account-product-links')) return 'personal_recommendations';
    if (node.closest('#productGrid')) return 'catalog';
    return 'product_list';
  }
  function productIdFor(node) {
    const link = node.matches?.('a[href*="product.html?id="]') ? node : node.querySelector?.('a[href*="product.html?id="]');
    try { return link ? new URL(link.href, location.href).searchParams.get('id') : null; } catch { return null; }
  }
  function recordImpression(card) {
    if (!analyticsAllowed) return;
    const productId = productIdFor(card), source = placementFor(card);
    if (!productId) return;
    const key = `${source}:${productId}`;
    if (seenImpressions.has(key)) return;
    seenImpressions.add(key);
    const product = (window.MELATONI_PRODUCTS || []).find(item => item.id === productId);
    log('product_impression', productId, { source, category: product?.category || '' });
    document.dispatchEvent(new CustomEvent('melatoni:product-impression', { detail: { productId, source } }));
  }
  const impressionObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting && entry.intersectionRatio >= .5) recordImpression(entry.target); });
  }, { threshold: [.5] }) : null;
  function observeProducts(root = document) {
    root.querySelectorAll?.(impressionSelector).forEach(card => {
      if (observedCards.has(card)) return;
      observedCards.add(card);
      if (impressionObserver) impressionObserver.observe(card); else recordImpression(card);
    });
  }
  function scanVisibleProducts() {
    observeProducts();
    document.querySelectorAll(impressionSelector).forEach(card => {
      const rect = card.getBoundingClientRect();
      const visibleHeight = Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0);
      if (visibleHeight > 0 && visibleHeight >= Math.min(rect.height * .5, innerHeight * .5)) recordImpression(card);
    });
  }
  observeProducts();
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node.nodeType !== 1) return;
    if (node.matches?.(impressionSelector)) observeProducts(node.parentElement || document);
    else observeProducts(node);
  }))).observe(document.body, { childList: true, subtree: true });
})();
