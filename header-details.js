(() => {
  const search = document.querySelector('.header-search');
  const searchInput = document.querySelector('#searchInput');
  const resetSearch = document.querySelector('.search-reset');
  const account = document.querySelector('#accountDialog');
  const accountForm = document.querySelector('#accountForm');
  const status = document.querySelector('#accountStatus');
  const whatsapp = document.querySelector('.account-whatsapp');
  const notifications = document.querySelector('#notificationsPanel');
  const notificationToggle = document.querySelector('.notifications-toggle');
  let accountMode = 'login';
  if (!search || !searchInput || !account || !accountForm) return;

  document.querySelector('.search-toggle').addEventListener('click', () => {
    if (matchMedia('(max-width: 760px)').matches) search.classList.toggle('open');
    searchInput.focus();
  });
  resetSearch.addEventListener('click', () => {
    searchInput.value = '';
    resetSearch.hidden = true;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.focus();
  });
  searchInput.addEventListener('input', () => { resetSearch.hidden = !searchInput.value; });
  search.addEventListener('submit', event => {
    event.preventDefault();
    document.querySelector('#products').scrollIntoView({ behavior: 'smooth' });
  });

  const setMode = mode => {
    accountMode = mode;
    const registering = mode === 'register';
    document.querySelector('.account-name-field').hidden = !registering;
    document.querySelector('.account-phone-field').hidden = !registering;
    document.querySelector('[name="name"]').required = registering;
    document.querySelector('[name="phone"]').required = registering;
    document.querySelector('[name="password"]').autocomplete = registering ? 'new-password' : 'current-password';
    document.querySelector('#accountTitle').textContent = registering ? 'Yeni hesab yaradın' : 'Hesabınıza daxil olun';
    document.querySelector('.account-submit').innerHTML = `${registering ? 'Hesab yarat' : 'Daxil ol'} <span aria-hidden="true">↗</span>`;
    document.querySelectorAll('[data-account-mode]').forEach(button => {
      const active = button.dataset.accountMode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    status.textContent = '';
    whatsapp.hidden = true;
  };
  document.querySelector('.account-toggle').addEventListener('click', () => {
    if (!account.open) account.showModal();
    document.querySelector('[name="email"]').focus({ preventScroll: true });
  });
  document.querySelector('.account-close').addEventListener('click', () => account.close());
  account.addEventListener('click', event => { if (event.target === account) account.close(); });
  document.querySelectorAll('[data-account-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.accountMode)));
  accountForm.addEventListener('submit', event => {
    event.preventDefault();
    status.textContent = 'Hesab xidmətimiz hazırda aktiv deyil. Məlumatlarınız saxlanmadı. Sifariş və hesab dəstəyi üçün WhatsApp-la əlaqə saxlayın.';
    whatsapp.hidden = false;
    accountForm.querySelector('[name="password"]').value = '';
  });

  const closeNotifications = () => {
    notifications.hidden = true;
    notificationToggle.setAttribute('aria-expanded', 'false');
  };
  notificationToggle.addEventListener('click', () => {
    const willOpen = notifications.hidden;
    notifications.hidden = !willOpen;
    notificationToggle.setAttribute('aria-expanded', String(willOpen));
  });
  document.querySelector('.notifications-close').addEventListener('click', closeNotifications);
  document.addEventListener('click', event => {
    if (!notifications.hidden && !notifications.contains(event.target) && !notificationToggle.contains(event.target)) closeNotifications();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      search.classList.remove('open');
      closeNotifications();
    }
  });
})();
