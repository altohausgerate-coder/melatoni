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
  let signedInUser = null;

  const localize = () => {
    const copy = window.MelatoniAccountCopy?.[window.MelatoniStorage?.get('melatoni-language') || 'az'];
    if (!copy) return;
    const values = { accountEyebrow:'title', accountIntro:'subtitle', accountLogin:'login', accountRegister:'register', accountName:'name', accountEmail:'email', accountPhone:'phone', accountPassword:'password', accountForgot:'forgot' };
    Object.entries(values).forEach(([selector,key]) => { const node = $(`[data-account-label="${selector}"]`); if (node) node.textContent = copy[key]; });
    setMode(accountMode, false);
    const signedLink = $('.account-initials');
    if (signedLink) signedLink.setAttribute('aria-label', copy.menuProfile);
    const trigger = $('.account-toggle'); if (trigger) trigger.setAttribute('aria-label', copy.login);
  };
  function setMode(mode, clearStatus = true) {
    accountMode = mode === 'register' ? 'register' : 'login';
    const registering = accountMode === 'register';
    const nameField = $('.account-name-field'); if (nameField) nameField.hidden = !registering;
    const phoneField = $('.account-phone-field'); if (phoneField) phoneField.hidden = !registering;
    const nameInput = $('[name="name"]'); if (nameInput) nameInput.required = registering;
    const phoneInput = $('[name="phone"]'); if (phoneInput) phoneInput.required = registering;
    const passwordInput = $('[name="password"]'); if (passwordInput) { passwordInput.autocomplete = registering ? 'new-password' : 'current-password'; passwordInput.minLength = registering ? 8 : 0; }
    const title = $('#accountTitle'); if (title) title.textContent = registering ? text('register') : text('login');
    const submit = $('.account-submit'); if (submit) submit.innerHTML = `${registering ? text('submitRegister') : text('submitLogin')} <span aria-hidden="true">↗</span>`;
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
      const link = document.createElement('a'); link.className = 'account-initials'; link.href = 'account.html'; link.textContent = initials; link.setAttribute('aria-label', text('menuProfile'));
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
  document.addEventListener('click', event => { if (event.target.closest('.account-toggle')) { if (account && !account.open) account.showModal(); $('[name="email"]')?.focus({preventScroll:true}); } });
  $('.account-close')?.addEventListener('click', () => account?.close());
  account?.addEventListener('click', event => { if (event.target === account) account.close(); });
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
  document.addEventListener('melatoni:language-change',localize);
  localize();
  if (location.hash === '#account' && account) account.showModal();
  if (client) client.auth.getSession().then(({data}) => { const user = data.session?.user || null; updateHeader(user); if (user) syncWishlist(user); }).catch(() => {});
  client?.auth.onAuthStateChange((_event,session) => { const user = session?.user || null; updateHeader(user); if (user) syncWishlist(user); });
})();
