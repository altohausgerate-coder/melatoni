(() => {
  const entries = [...document.querySelectorAll('[data-account-entry]')];
  if (!entries.length) return;
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
  update(null);
  if (client) {
    client.auth.getSession().then(({data})=>update(data.session?.user || null)).catch(()=>{});
    client.auth.onAuthStateChange((_event,session)=>update(session?.user || null));
  }
})();
