(() => {
  const header = document.querySelector('.about-header');
  const toggle = header?.querySelector('.menu-toggle');
  const nav = header?.querySelector('.main-nav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    toggle.setAttribute('aria-label', expanded ? 'Menyunu aç' : 'Menyunu bağla');
    nav.classList.toggle('open', !expanded);
  });
  nav.addEventListener('click', event => {
    if (!event.target.closest('a')) return;
    toggle.setAttribute('aria-expanded', 'false');
    nav.classList.remove('open');
  });
})();
