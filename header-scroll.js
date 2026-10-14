(() => {
  const header = document.querySelector('.site-header, .product-header');
  if (!header) return;

  let previousY = window.scrollY;
  let framePending = false;
  const threshold = 6;

  const shouldStayVisible = () => {
    const active = document.activeElement;
    return Boolean(
      header.querySelector('.main-nav.open, .header-search.open, .lang-picker[open]') ||
      header.contains(active) ||
      document.querySelector('#accountDialog.open, .cart-drawer.open, #notificationsPanel.open')
    );
  };

  const update = () => {
    const currentY = Math.max(0, window.scrollY);
    const delta = currentY - previousY;

    if (currentY <= 72 || shouldStayVisible()) {
      header.classList.remove('header-hidden');
    } else if (delta > threshold) {
      header.classList.add('header-hidden');
    } else if (delta < -threshold) {
      header.classList.remove('header-hidden');
    }

    previousY = currentY;
    framePending = false;
  };

  window.addEventListener('scroll', () => {
    if (framePending) return;
    framePending = true;
    window.requestAnimationFrame(update);
  }, { passive: true });
})();
