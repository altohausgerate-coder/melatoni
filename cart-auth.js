(() => {
  const client = window.MELATONI_SUPABASE;
  if (!client) return;

  let user = null;
  let ready = false;
  const sessionReady = client.auth.getSession().then(({ data }) => {
    user = data.session?.user || null;
    ready = true;
    return user;
  }).catch(() => { ready = true; return null; });

  client.auth.onAuthStateChange((_event, session) => {
    user = session?.user || null;
    ready = true;
  });

  const appRoot = () => new URL('./', location.href);
  const actionFrom = element => {
    if (element.matches('.bag-toggle, .bag-shortcut, a[href*="#bag"]')) return { type: 'open' };
    const add = element.matches('[data-add], [data-add-to-bag], #detailAdd') ? element : null;
    if (!add) return null;
    const productId = add.dataset.add || add.dataset.addToBag || new URLSearchParams(location.search).get('id');
    if (!productId) return null;
    return {
      type: 'add',
      id: productId,
      color: document.querySelector('[data-color][aria-pressed="true"]')?.dataset.color || '',
      size: document.querySelector('[data-size][aria-pressed="true"]')?.dataset.size || ''
    };
  };

  const loginFor = intent => {
    const destination = new URL('products.html', appRoot());
    destination.searchParams.set('cartAction', intent.type);
    if (intent.type === 'add') {
      destination.searchParams.set('id', intent.id);
      if (intent.color) destination.searchParams.set('color', intent.color);
      if (intent.size) destination.searchParams.set('size', intent.size);
    }
    const login = new URL('index.html', appRoot());
    login.searchParams.set('auth', 'account');
    login.searchParams.set('return', `${destination.pathname}${destination.search}${destination.hash}`);
    location.assign(login.href);
  };

  const resumeAction = async intent => {
    const currentUser = ready ? user : await sessionReady;
    if (!currentUser) { loginFor(intent); return; }
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.delete('cartAction');
    cleanUrl.searchParams.delete('id');
    cleanUrl.searchParams.delete('color');
    cleanUrl.searchParams.delete('size');
    history.replaceState(history.state, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    window.MelatoniAuthorizedCartIntent = intent;
    document.dispatchEvent(new CustomEvent('melatoni:authorized-cart-intent', { detail: intent }));
  };

  document.addEventListener('click', event => {
    const element = event.target.closest('.bag-toggle, .bag-shortcut, a[href*="#bag"], [data-add], [data-add-to-bag], #detailAdd');
    if (!element) return;
    const intent = actionFrom(element);
    if (!intent) return;
    if (ready && user) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    (ready ? Promise.resolve(user) : sessionReady).then(currentUser => {
      if (currentUser) { user = currentUser; ready = true; element.click(); }
      else loginFor(intent);
    });
  }, true);

  const params = new URLSearchParams(location.search);
  const requested = params.get('cartAction');
  if (requested === 'open' || requested === 'add' || requested === 'confirm') {
    resumeAction({ type: requested, id: params.get('id') || '', color: params.get('color') || '', size: params.get('size') || '' });
  } else if (location.hash === '#bag') {
    resumeAction({ type: 'open' });
  }
})();
