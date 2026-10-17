(() => {
  const entries = [...document.querySelectorAll('[data-account-entry]')];
  const client = window.MELATONI_SUPABASE;
  const update = user => entries.forEach(entry => {
    if (user) {
      const label = user.user_metadata?.full_name || user.email || 'Melatoni';
      const initials = label.trim().split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'M';
      const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;
      let safeAvatarUrl = '';
      try { const parsed = new URL(avatarUrl, location.href); if (parsed.protocol === 'https:') safeAvatarUrl = parsed.href; } catch {}
      entry.href = 'account.html';
      entry.replaceChildren();
      entry.classList.remove('account-login-icon');
      entry.classList.add('account-initials');
      entry.classList.add('account-avatar');
      if (safeAvatarUrl) {
        const avatar = document.createElement('img');
        avatar.className = 'account-entry-avatar';
        avatar.src = safeAvatarUrl;
        avatar.alt = '';
        avatar.referrerPolicy = 'no-referrer';
        avatar.addEventListener('error', () => { avatar.remove(); entry.textContent = initials; }, { once: true });
        entry.append(avatar);
      } else entry.textContent = initials;
      entry.setAttribute('aria-label', window.MelatoniAccountText?.('menuProfile') || 'Profile');
    } else {
      const loginLabel = window.MelatoniAccountText?.('login') || 'Daxil ol';
      entry.href = 'index.html#account';
      entry.innerHTML = '<svg class="account-entry-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>';
      entry.classList.remove('account-avatar', 'account-initials', 'product-about-link');
      entry.classList.add('account-login-icon');
      entry.setAttribute('aria-label', loginLabel);
    }
  });
  if (entries.length) update(null);
  if (client) {
    client.auth.getSession().then(({data})=>{
      const user = data.session?.user || null;
      if (entries.length) update(user);
    }).catch(()=>{});
    client.auth.onAuthStateChange((_event,session)=>{
      const user = session?.user || null;
      if (entries.length) update(user);
    });
  }
})();
