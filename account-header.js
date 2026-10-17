(() => {
  const entries = [...document.querySelectorAll('[data-account-entry]')];
  const client = window.MELATONI_SUPABASE;
  const update = user => entries.forEach(entry => {
    if (user) {
      const label = user.user_metadata?.full_name || user.email || 'Melatoni';
      entry.href = 'account.html';
      entry.textContent = label.trim().split(/[\s@.]+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase() || 'M';
      entry.setAttribute('aria-label',window.MelatoniAccountText?.('menuProfile') || 'Profile');
    } else {
      entry.href = 'index.html#account';
      entry.textContent = window.MelatoniAccountText?.('login') || 'Daxil ol';
      entry.setAttribute('aria-label',window.MelatoniAccountText?.('login') || 'Sign in');
    }
  });
  if (entries.length) update(null);
  const page = location.pathname.split('/').filter(Boolean).pop() || 'index.html';
  const protectedPages = new Set(['products.html', 'product.html', 'about.html', 'contact.html']);
  const redirectToLogin = () => {
    const index = new URL('index.html', location.href);
    index.searchParams.set('return', `${location.pathname}${location.search}${location.hash}`);
    index.hash = 'account';
    location.replace(index.toString());
  };
  if (client) {
    client.auth.getSession().then(({data})=>{
      const user = data.session?.user || null;
      if (entries.length) update(user);
      if (!user && protectedPages.has(page)) redirectToLogin();
    }).catch(()=>{});
    client.auth.onAuthStateChange((_event,session)=>{
      const user = session?.user || null;
      if (entries.length) update(user);
      if (!user && protectedPages.has(page)) redirectToLogin();
    });
  }
})();
