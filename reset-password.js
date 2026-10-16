(() => {
  const t = window.MelatoniAccountText || (key => key);
  const form = document.querySelector('#resetForm');
  const status = document.querySelector('#resetStatus');
  const client = window.MELATONI_SUPABASE;
  const language = window.MelatoniStorage?.get('melatoni-language') || 'az';
  document.documentElement.lang = language;
  document.querySelector('#resetTitle')?.replaceChildren(document.createTextNode(t('resetTitle')));
  document.querySelector('#newPasswordLabel')?.replaceChildren(document.createTextNode(t('newPassword')));
  document.querySelector('#resetSubmit')?.replaceChildren(document.createTextNode(t('updatePassword')));
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const password = String(new FormData(form).get('password') || '');
    if (password.length < 8) { if (status) status.textContent = t('passwordShort'); return; }
    if (!client) { if (status) status.textContent = t('supabaseMissing'); return; }
    try {
      const { error } = await client.auth.updateUser({ password });
      if (status) status.textContent = error ? t('genericError') : t('passwordUpdated');
      if (!error) form.reset();
    } catch { if (status) status.textContent = t('genericError'); }
  });
})();
