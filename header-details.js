(() => {
  const $ = selector => document.querySelector(selector);
  const search = $('.header-search');
  const searchInput = $('#searchInput');
  const resetSearch = $('.search-reset');
  const account = $('#accountDialog');
  const accountForm = $('#accountForm');
  const status = $('#accountStatus');
  const whatsapp = $('.account-whatsapp');
  const notifications = $('#notificationsPanel');
  const notificationToggle = $('.notifications-toggle');
  const client = window.MELATONI_SUPABASE;
  const text = window.MelatoniAccountText || (key => key);
  let accountMode = 'login';
  let emailLoginOpen = false;
  let signedInUser = null;
  let accountGateActive = false;
  let pushPromptOpen = false;
  const pushOnboarding = $('#pushOnboarding');
  const pushStatus = $('#pushOnboardingStatus');
  const pushKey = userId => `melatoni-push-onboarding:${userId}`;
  const returnPath = () => {
    const value = new URLSearchParams(location.search).get('return');
    if (!value) return '';
    try { const url = new URL(value, location.origin); return url.origin === location.origin && url.pathname !== '/index.html' ? `${url.pathname}${url.search}${url.hash}` : ''; } catch { return ''; }
  };
  const continueToRequestedPage = () => { const destination = returnPath(); if (destination) location.replace(destination); };
  const updatePushOnboardingCopy = () => {
    const keys = { title:'pushWelcomeTitle', body:'pushWelcomeBody', enable:'pushWelcomeEnable', later:'pushWelcomeLater' };
    document.querySelectorAll('[data-push-copy]').forEach(node => { const key = keys[node.dataset.pushCopy]; if (key) node.textContent = text(key); });
  };
  const showPushOnboarding = user => {
    if (!pushOnboarding || !user || pushPromptOpen || window.MelatoniStorage?.get(pushKey(user.id))) return false;
    if ('Notification' in window && Notification.permission !== 'default') { window.MelatoniStorage?.set(pushKey(user.id), 'seen'); return false; }
    pushPromptOpen = true;
    updatePushOnboardingCopy();
    if (pushStatus) pushStatus.textContent = '';
    setTimeout(() => { if (pushOnboarding && !pushOnboarding.open) pushOnboarding.showModal(); }, 500);
    return true;
  };
  const closePushOnboarding = () => {
    if (signedInUser) window.MelatoniStorage?.set(pushKey(signedInUser.id), 'seen');
    pushPromptOpen = false;
    if (pushOnboarding?.open) pushOnboarding.close();
    continueToRequestedPage();
  };
  const showRequiredAccount = () => {
    if (!account || signedInUser || account.open) return;
    const show = () => {
      if (signedInUser || !account || account.open) return;
      accountGateActive = true;
      const closeButton = $('.account-close'); if (closeButton) closeButton.hidden = true;
      account.showModal();
      setMode('login', false);
    };
    if (window.MelatoniConsent?.get()) show();
    else document.addEventListener('melatoni:consent-change', show, { once:true });
  };
  const handleSignedIn = user => {
    signedInUser = user || null;
    updateHeader(signedInUser);
    if (signedInUser) {
      syncWishlist(signedInUser);
      accountGateActive = false;
      const closeButton = $('.account-close'); if (closeButton) closeButton.hidden = false;
      if (account?.open) account.close();
      const prompted = showPushOnboarding(signedInUser);
      if (!prompted) continueToRequestedPage();
    } else {
      showRequiredAccount();
    }
  };

  const localize = () => {
    const copy = window.MelatoniAccountCopy?.[window.MelatoniStorage?.get('melatoni-language') || 'az'];
    if (!copy) return;
    const values = { accountEyebrow:'title', accountIntro:'subtitle', accountLogin:'login', accountRegister:'register', accountName:'name', accountEmail:'email', accountPhone:'phone', accountPassword:'password', accountForgot:'forgot', accountGoogle:'google', accountGmail:'gmail' };
    Object.entries(values).forEach(([selector,key]) => { const node = $(`[data-account-label="${selector}"]`); if (node) node.textContent = copy[key]; });
    setMode(accountMode, false);
    const signedLink = $('.account-initials');
    if (signedLink) signedLink.setAttribute('aria-label', copy.menuProfile);
    const trigger = $('.account-toggle'); if (trigger) trigger.setAttribute('aria-label', copy.login);
  };
  function setMode(mode, clearStatus = true) {
    const nextMode = mode === 'register' ? 'register' : 'login';
    if (nextMode !== accountMode) emailLoginOpen = nextMode === 'register';
    accountMode = nextMode;
    const registering = accountMode === 'register';
    const nameField = $('.account-name-field'); if (nameField) nameField.hidden = !registering;
    const phoneField = $('.account-phone-field'); if (phoneField) phoneField.hidden = !registering;
    const nameInput = $('[name="name"]'); if (nameInput) nameInput.required = registering;
    const phoneInput = $('[name="phone"]'); if (phoneInput) phoneInput.required = registering;
    const passwordInput = $('[name="password"]'); if (passwordInput) { passwordInput.autocomplete = registering ? 'new-password' : 'current-password'; passwordInput.minLength = registering ? 8 : 0; }
    const googleButton = $('.account-google'); if (googleButton) googleButton.hidden = registering;
    const gmailButton = $('.account-gmail'); if (gmailButton) gmailButton.hidden = registering || emailLoginOpen;
    if (accountForm) accountForm.hidden = !registering && !emailLoginOpen;
    const forgotLink = $('.account-forgot'); if (forgotLink) forgotLink.hidden = registering || !emailLoginOpen;
    const title = $('#accountTitle'); if (title) title.textContent = registering ? text('register') : text('login');
    const submit = $('.account-submit'); if (submit) submit.innerHTML = `${registering ? text('submitRegister') : emailLoginOpen ? text('gmail') : text('submitLogin')} <span aria-hidden="true">↗</span>`;
    document.querySelectorAll('[data-account-mode]').forEach(button => { const active = button.dataset.accountMode === accountMode; button.classList.toggle('is-active', active); button.setAttribute('aria-selected', String(active)); });
    if (clearStatus && status) status.textContent = '';
    if (whatsapp) whatsapp.hidden = true;
  }
  function updateHeader(user) {
    signedInUser = user || null;
    const trigger = $('.account-toggle');
    if (!trigger) return;
    if (signedInUser) {
      const name = signedInUser.user_metadata?.full_name || signedInUser.email || '';
      const initials = name.trim().split(/[\s@.]+/).filter(Boolean).slice(0,2).map(part => part[0]).join('').toUpperCase() || 'M';
      const link = document.createElement('a'); link.className = 'account-initials'; link.href = 'account.html'; link.setAttribute('aria-label', text('menuProfile'));
      const avatarUrl = signedInUser.user_metadata?.avatar_url || signedInUser.user_metadata?.picture;
      let safeAvatarUrl = '';
      try { const parsedAvatarUrl = new URL(avatarUrl, location.href); if (parsedAvatarUrl.protocol === 'https:') safeAvatarUrl = parsedAvatarUrl.href; } catch {}
      if (safeAvatarUrl) {
        const avatar = document.createElement('img'); avatar.src = safeAvatarUrl; avatar.alt = ''; avatar.referrerPolicy = 'no-referrer';
        avatar.addEventListener('error', () => { avatar.remove(); link.textContent = initials; }, { once:true });
        link.append(avatar);
      } else link.textContent = initials;
      trigger.replaceWith(link);
    } else if (!trigger.isConnected) {
      const link = $('.account-initials');
      if (link) { const button = document.createElement('button'); button.className = 'icon-button account-toggle'; button.type = 'button'; button.setAttribute('aria-label', text('login')); button.setAttribute('aria-haspopup','dialog'); button.setAttribute('aria-controls','accountDialog'); button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>'; link.replaceWith(button); }
    }
  }
  async function syncWishlist(user) {
    if (!client || !user) return;
    try {
      let local = [];
      try { const stored = JSON.parse(window.MelatoniStorage?.get('melatoni-wishlist','[]') || '[]'); if (Array.isArray(stored)) local = stored.filter(id => typeof id === 'string'); } catch {}
      const { data, error } = await client.from('wishlist').select('product_id').eq('user_id', user.id);
      if (error) return;
      const remote = (data || []).map(row => row.product_id);
      const merged = [...new Set([...remote, ...local])];
      if (merged.length) await client.from('wishlist').upsert(merged.map(product_id => ({ user_id:user.id, product_id })), { onConflict:'user_id,product_id', ignoreDuplicates:true });
      window.MelatoniStorage?.set('melatoni-wishlist',JSON.stringify(merged));
      document.dispatchEvent(new CustomEvent('melatoni:wishlist-change',{detail:merged}));
    } catch {}
  }
  search?.addEventListener('submit', () => { /* Native GET submission to products.html?q=... is intentional. */ });
  $('.search-toggle')?.addEventListener('click', event => { if (matchMedia('(max-width: 760px)').matches) { event.preventDefault(); search?.classList.toggle('open'); searchInput?.focus(); } });
  resetSearch?.addEventListener('click', () => { resetSearch.hidden = true; searchInput?.dispatchEvent(new Event('input', { bubbles:true })); searchInput?.focus(); });
  searchInput?.addEventListener('input', () => { if (resetSearch) resetSearch.hidden = !searchInput.value; });
  document.addEventListener('click', event => { if (event.target.closest('.account-toggle')) { if (account && !account.open) account.showModal(); $('.account-google:not([hidden])')?.focus({preventScroll:true}); } });
  $('.account-close')?.addEventListener('click', () => { if (!accountGateActive) account?.close(); });
  account?.addEventListener('cancel', event => { if (accountGateActive) event.preventDefault(); });
  account?.addEventListener('close', () => { if (accountGateActive && !signedInUser) setTimeout(showRequiredAccount, 0); });
  account?.addEventListener('click', event => { if (event.target === account && !accountGateActive) account.close(); });
  pushOnboarding?.querySelectorAll('[data-push-later]').forEach(button => button.addEventListener('click', closePushOnboarding));
  pushOnboarding?.addEventListener('cancel', event => { event.preventDefault(); closePushOnboarding(); });
  pushOnboarding?.querySelector('[data-push-enable]')?.addEventListener('click', async () => {
    if (!signedInUser) return;
    const button = pushOnboarding.querySelector('[data-push-enable]'); button.disabled = true;
    try {
      if (!window.MelatoniPush) throw new Error('unavailable');
      await window.MelatoniPush.subscribe(signedInUser.id);
      if (pushStatus) pushStatus.textContent = text('pushWelcomeDone');
      window.MelatoniStorage?.set(pushKey(signedInUser.id), 'enabled');
      setTimeout(closePushOnboarding, 700);
    } catch (error) {
      const key = error?.message === 'blocked' ? 'pushBlocked' : error?.message === 'unsupported' || error?.message === 'ios-install' ? 'pushWelcomeUnavailable' : 'pushWelcomeError';
      if (pushStatus) pushStatus.textContent = text(key);
      window.MelatoniStorage?.set(pushKey(signedInUser.id), 'seen');
      button.disabled = false;
    }
  });
  document.querySelectorAll('[data-account-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.accountMode)));
  $('.account-forgot')?.addEventListener('click', async event => {
    event.preventDefault();
    const email = $('[name="email"]')?.value.trim();
    if (!email || !client) { if (status) status.textContent = !client ? text('supabaseMissing') : text('genericError'); return; }
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}${location.pathname.replace(/[^/]*$/, '')}reset-password.html` });
      if (status) status.textContent = error ? text('genericError') : text('resetSent');
    } catch { if (status) status.textContent = text('genericError'); }
  });
  $('.account-google')?.addEventListener('click', async () => {
    if (!client) { if (status) status.textContent = text('supabaseMissing'); return; }
    try {
      const redirect = new URL('./', location.href);
      redirect.hash = 'account';
      const destination = new URLSearchParams(location.search).get('return'); if (destination) redirect.searchParams.set('return', destination);
      const { error } = await client.auth.signInWithOAuth({ provider:'google', options:{ redirectTo:redirect.toString() } });
      if (error && status) status.textContent = text('genericError');
    } catch { if (status) status.textContent = text('genericError'); }
  });
  $('.account-gmail')?.addEventListener('click', () => {
    emailLoginOpen = true;
    setMode('login');
    $('[name="email"]')?.focus({ preventScroll:true });
  });
  accountForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!client) { if (status) status.textContent = text('supabaseMissing'); return; }
    const form = new FormData(accountForm), email = String(form.get('email') || '').trim(), password = String(form.get('password') || '');
    try {
    if (accountMode === 'register') {
      const phone = String(form.get('phone') || '').replace(/[\s()-]/g,'');
      if (!/^\+994\d{9}$/.test(phone)) { if (status) status.textContent = text('invalidPhone'); return; }
      if (password.length < 8) { if (status) status.textContent = text('passwordShort'); return; }
      const { data, error } = await client.auth.signUp({ email, password, options:{ data:{ full_name:String(form.get('name') || '').trim(), phone }, emailRedirectTo:new URL('index.html', location.href).toString() } });
      if (status) status.textContent = error ? text('genericError') : (data.session ? text('registerSignedIn') : text('registerOk'));
      if (!error) { accountForm.reset(); setMode('login',false); }
    } else {
      const { error } = await client.auth.signInWithPassword({ email, password });
      const loginErrorKey = error?.code === 'email_not_confirmed'
        ? 'emailNotConfirmed'
        : error?.code === 'invalid_credentials'
          ? 'invalidCredentials'
          : 'genericError';
      if (status) status.textContent = error ? text(loginErrorKey) : text('loginOk');
      const pass = $('[name="password"]'); if (pass) pass.value = '';
      if (!error) setTimeout(() => account?.close(), 650);
    }
    } catch { if (status) status.textContent = text('genericError'); }
  });
  $('.wishlist-toggle')?.addEventListener('click', () => { window.location.href = 'account.html#wishlist'; });
  const closeNotifications = () => { if (notifications) notifications.hidden = true; notificationToggle?.setAttribute('aria-expanded','false'); };
  notificationToggle?.addEventListener('click', () => { if (!notifications) return; const open = notifications.hidden; notifications.hidden = !open; notificationToggle.setAttribute('aria-expanded',String(open)); });
  $('.notifications-close')?.addEventListener('click',closeNotifications);
  document.addEventListener('click', event => { if (notifications && notificationToggle && !notifications.hidden && !notifications.contains(event.target) && !notificationToggle.contains(event.target)) closeNotifications(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { search?.classList.remove('open'); closeNotifications(); } });
  document.addEventListener('melatoni:wishlist-change', async event => { if (!client || !signedInUser || !Array.isArray(event.detail)) return; try { const ids = event.detail.filter(id => typeof id === 'string'); await client.from('wishlist').delete().eq('user_id',signedInUser.id); if (ids.length) await client.from('wishlist').upsert(ids.map(product_id => ({user_id:signedInUser.id,product_id})),{onConflict:'user_id,product_id'}); } catch {} });
  document.addEventListener('melatoni:language-change', () => { localize(); updatePushOnboardingCopy(); });
  localize();
  if (location.hash === '#account' && account && client && !signedInUser) showRequiredAccount();
  if (client) client.auth.getSession().then(({data}) => handleSignedIn(data.session?.user || null)).catch(() => {});
  client?.auth.onAuthStateChange((_event,session) => handleSignedIn(session?.user || null));
})();
