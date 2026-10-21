(() => {
  const root = document.querySelector('[data-brand-carousel]');
  if (!root) return;

  const track = root.querySelector('[data-brand-track]');
  const panels = [...root.querySelectorAll('[data-brand-panel]')];
  const dots = [...root.querySelectorAll('[data-brand-dot]')];
  const previous = document.querySelector('[data-brand-prev]');
  const next = document.querySelector('[data-brand-next]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileLayout = window.matchMedia('(max-width: 650px)');
  const translations = {
    az: {
      eyebrow: 'SEÇİLMİŞ MARKALAR',
      title: 'Yuxu üçün<br/><em>iki seçilmiş marka.</em>',
      all: 'Bütün məhsullara bax',
      lead: 'L’M MESER və MARK CROSS məhsullarını Melatoni mağazasında seçin.',
      lmMeser: 'Yorğan, yastıq və yataq tekstili seçimləri',
      markCross: 'Zərif yataq dəstləri və tekstil',
      region: 'Seçilmiş yataq tekstili markaları', previous: 'Əvvəlki marka', next: 'Növbəti marka', choose: 'Markanı seçin'
    },
    en: {
      eyebrow: 'SELECTED BRANDS',
      title: 'Two selected<br/><em>bedding brands.</em>',
      all: 'Browse all products',
      lead: 'Explore L’M MESER and MARK CROSS products in the Melatoni shop.',
      lmMeser: 'Duvets, pillows and bedding',
      markCross: 'Refined bedding sets and textiles',
      region: 'Selected bedding brands', previous: 'Previous brand', next: 'Next brand', choose: 'Choose a brand'
    },
    ru: {
      eyebrow: 'ИЗБРАННЫЕ БРЕНДЫ',
      title: 'Две избранные<br/><em>марки текстиля.</em>',
      all: 'Все товары',
      lead: 'Выберите товары L’M MESER и MARK CROSS в магазине Melatoni.',
      lmMeser: 'Одеяла, подушки и постельное бельё',
      markCross: 'Элегантные комплекты и текстиль',
      region: 'Избранные марки постельного текстиля', previous: 'Предыдущая марка', next: 'Следующая марка', choose: 'Выбрать марку'
    }
  };

  let activeIndex = 0;
  let inView = !('IntersectionObserver' in window);
  let paused = false;
  let timer = 0;
  let scrollFrame = 0;
  let pageScrollFrame = 0;
  let scrollIdleTimer = 0;
  let panelPointerActive = false;
  let panelFocusActive = false;

  function localize(language) {
    const words = translations[language] || translations.az;
    root.querySelectorAll('[data-brand-copy]').forEach(element => {
      const value = words[element.dataset.brandCopy];
      if (value) element.innerHTML = value;
    });
    root.setAttribute('aria-label', words.region);
    root.querySelector('.brand-pagination')?.setAttribute('aria-label', words.choose);
    previous?.setAttribute('aria-label', words.previous);
    next?.setAttribute('aria-label', words.next);
  }

  function setActive(index, shouldScroll = false) {
    activeIndex = (index + panels.length) % panels.length;
    panels.forEach((panel, panelIndex) => {
      const isActive = panelIndex === activeIndex;
      panel.classList.toggle('is-active', isActive);
      panel.setAttribute('aria-current', String(isActive));
    });
    dots.forEach((dot, dotIndex) => dot.setAttribute('aria-current', String(dotIndex === activeIndex)));
    if (shouldScroll && mobileLayout.matches) {
      panels[activeIndex].scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  function stopTimer() {
    window.clearInterval(timer);
    timer = 0;
  }

  function syncTimer() {
    stopTimer();
    if (!inView || paused || document.hidden || reducedMotion.matches) return;
    timer = window.setInterval(() => setActive(activeIndex + 1, true), 5400);
  }

  function syncWithPageScroll() {
    if (!inView || reducedMotion.matches || mobileLayout.matches) return;
    cancelAnimationFrame(pageScrollFrame);
    pageScrollFrame = requestAnimationFrame(() => {
      const rect = root.closest('.brand-showcase')?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.innerHeight || document.documentElement.clientHeight;
      const sectionTop = window.scrollY + rect.top;
      const start = sectionTop - viewport * 0.78;
      const travel = rect.height + viewport * 0.56;
      const progress = Math.max(0, Math.min(0.999, (window.scrollY - start) / travel));
      if (!panelPointerActive && !panelFocusActive) {
        const nextIndex = Math.floor(progress * panels.length);
        if (nextIndex !== activeIndex) setActive(nextIndex);
      }

      const parallax = Math.max(-12, Math.min(12, (rect.top + rect.height / 2 - viewport / 2) / viewport * 12));
      root.style.setProperty('--brand-scroll-y', `${parallax.toFixed(1)}px`);
    });
    window.clearTimeout(scrollIdleTimer);
    stopTimer();
    scrollIdleTimer = window.setTimeout(syncTimer, 1100);
  }

  previous?.addEventListener('click', () => { setActive(activeIndex - 1, true); syncTimer(); });
  next?.addEventListener('click', () => { setActive(activeIndex + 1, true); syncTimer(); });
  dots.forEach(dot => dot.addEventListener('click', () => { setActive(Number(dot.dataset.brandDot), true); syncTimer(); }));

  panels.forEach((panel, index) => {
    const image = panel.querySelector('img');
    // Confirm image permission with each brand before publishing externally hosted photography.
    image?.addEventListener('error', () => {
      image.hidden = true;
      panel.classList.add('brand-image-unavailable');
    }, { once: true });
    panel.addEventListener('pointerenter', () => {
      panelPointerActive = true;
      setActive(index);
      stopTimer();
    });
    panel.addEventListener('focusin', () => {
      panelFocusActive = true;
      setActive(index);
      stopTimer();
    });
  });

  root.addEventListener('pointerenter', () => { paused = true; syncTimer(); });
  root.addEventListener('pointerleave', () => { paused = false; panelPointerActive = false; syncTimer(); });
  root.addEventListener('focusin', () => { paused = true; syncTimer(); });
  root.addEventListener('focusout', event => {
    if (!root.contains(event.relatedTarget)) { paused = false; panelFocusActive = false; syncTimer(); }
  });
  root.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); setActive(activeIndex - 1, true); syncTimer(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); setActive(activeIndex + 1, true); syncTimer(); }
  });
  track.addEventListener('scroll', () => {
    if (!mobileLayout.matches) return;
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      const center = track.getBoundingClientRect().left + track.clientWidth / 2;
      const nearestIndex = panels.reduce((best, panel, index) => {
        const rect = panel.getBoundingClientRect();
        return Math.abs(rect.left + rect.width / 2 - center) < best.distance
          ? { index, distance: Math.abs(rect.left + rect.width / 2 - center) }
          : best;
      }, { index: activeIndex, distance: Infinity }).index;
      if (nearestIndex !== activeIndex) setActive(nearestIndex, false);
    });
  }, { passive: true });

  document.addEventListener('visibilitychange', syncTimer);
  window.addEventListener('scroll', syncWithPageScroll, { passive: true });
  window.addEventListener('resize', syncWithPageScroll, { passive: true });
  document.addEventListener('melatoni:language-change', event => localize(event.detail));
  reducedMotion.addEventListener?.('change', syncTimer);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      inView = entries.some(entry => entry.isIntersecting);
      root.closest('.brand-showcase')?.classList.toggle('is-inview', inView);
      if (inView) syncWithPageScroll();
      else root.style.setProperty('--brand-scroll-y', '0px');
      syncTimer();
    }, { threshold: 0.25 });
    observer.observe(root);
  } else {
    root.closest('.brand-showcase')?.classList.add('is-inview');
  }

  localize(window.MelatoniStorage?.get('melatoni-language') || document.documentElement.lang || 'az');
  root.closest('.brand-showcase')?.setAttribute('data-motion-ready', 'true');
  setActive(0);
  syncTimer();
})();
