(() => {
  const root = document.querySelector('.campaign-hero');
  if (!root) return;

  const slides = [...root.querySelectorAll('[data-campaign-slide]')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const copy = {
    az: [
      { offer: '30%-dək endirim', title: 'Yataq otağınıza<br>yeni nəfəs verin.', description: 'Seçilmiş yataq dəstlərinə 30%-dək endirim.', cta: 'Kampaniyaya bax' },
      { offer: '50% endirim', title: 'Yorğan alana<br>əlavə rahatlıq.', description: 'Yorğan alarkən seçilmiş yastıqları 50% endirimlə əldə edin.', cta: 'Təklifə bax' },
      { offer: '2+1 təklifi', title: 'Rahatlığınızı<br>tamamlayın.', description: 'İki məhsul seçin, üçüncünü 50% endirimlə əldə edin.', cta: 'Kolleksiyaya bax' },
    ],
    ru: [
      { offer: 'Скидка до 30%', title: 'Добавьте спальне<br>новое настроение.', description: 'Скидка до 30% на избранные комплекты постельного белья.', cta: 'Смотреть акцию' },
      { offer: 'Скидка 50%', title: 'Больше комфорта<br>с новым одеялом.', description: 'Скидка 50% на избранные подушки при покупке одеяла.', cta: 'Смотреть предложение' },
      { offer: 'Предложение 2+1', title: 'Соберите свой<br>комфорт.', description: 'Выберите два товара, а на третий получите скидку 50%.', cta: 'Смотреть коллекцию' },
    ],
    en: [
      { offer: 'Up to 30% off', title: 'A fresh feeling<br>for your bedroom.', description: 'Save up to 30% on selected bedding sets.', cta: 'Explore the offer' },
      { offer: '50% off', title: 'More comfort<br>with a new duvet.', description: 'Save 50% on selected pillows when you buy a duvet.', cta: 'See the offer' },
      { offer: 'Buy 2, get 1', title: 'Complete your<br>comfort.', description: 'Choose two items and get 50% off a third.', cta: 'Explore the collection' },
    ],
  };

  let active = 0;
  let timer = 0;
  let focusInside = false;
  let touchInside = false;
  let inView = true;
  let pointerOrigin = null;

  function language() {
    const currentLanguage = document.documentElement.lang;
    return copy[currentLanguage] ? currentLanguage : 'az';
  }

  function renderLanguage() {
    const lang = language();
    slides.forEach((slide, index) => {
      const text = copy[lang][index];
      for (const key of ['offer', 'description', 'cta']) {
        const element = slide.querySelector(`[data-campaign="${key}"]`);
        if (element) element.textContent = text[key];
      }
      slide.querySelector('[data-campaign="title"]').innerHTML = text.title;
    });
  }

  function show(index) {
    active = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => {
      const selected = slideIndex === active;
      slide.classList.toggle('is-active', selected);
      slide.setAttribute('aria-hidden', String(!selected));
      if (selected) slide.removeAttribute('inert');
      else slide.setAttribute('inert', '');
    });
  }

  function nextDelay() {
    return window.matchMedia('(max-width: 760px)').matches ? 6400 : 5200;
  }

  let scrollFrame = 0;
  function updateParallax() {
    scrollFrame = 0;
    if (reducedMotion.matches) { root.style.setProperty('--campaign-parallax', '0px'); return; }
    const bounds = root.getBoundingClientRect();
    const progress = Math.max(-1, Math.min(1, (bounds.top + bounds.height * .5 - innerHeight * .5) / innerHeight));
    root.style.setProperty('--campaign-parallax', `${progress * -28}px`);
  }
  window.addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateParallax);
  }, { passive: true });
  window.addEventListener('resize', updateParallax, { passive: true });
  updateParallax();

  function clearTimer() { window.clearInterval(timer); timer = 0; }
  function startTimer() {
    clearTimer();
    if (!focusInside && !touchInside && inView && !reducedMotion.matches && !document.hidden) {
      timer = window.setInterval(() => show(active + 1), nextDelay());
    }
  }

  root.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || event.isPrimary === false) return;
    pointerOrigin = { x: event.clientX, y: event.clientY };
    touchInside = true;
    clearTimer();
  }, { passive: true });
  root.addEventListener('pointerup', event => {
    if (!pointerOrigin || event.pointerType !== 'touch') return;
    const deltaX = event.clientX - pointerOrigin.x;
    const deltaY = event.clientY - pointerOrigin.y;
    pointerOrigin = null;
    touchInside = false;
    if (Math.abs(deltaX) >= 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
      show(active + (deltaX < 0 ? 1 : -1));
    }
    startTimer();
  }, { passive: true });
  root.addEventListener('pointercancel', () => {
    pointerOrigin = null;
    touchInside = false;
    startTimer();
  }, { passive: true });
  root.addEventListener('focusin', () => { focusInside = true; clearTimer(); });
  root.addEventListener('focusout', (event) => {
    if (!root.contains(event.relatedTarget)) { focusInside = false; startTimer(); }
  });
  document.addEventListener('visibilitychange', startTimer);
  reducedMotion.addEventListener?.('change', () => { updateParallax(); startTimer(); });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      inView = entries.some(entry => entry.isIntersecting);
      startTimer();
    }, { threshold: 0.15 });
    observer.observe(root);
  }
  document.addEventListener('melatoni:language-change', renderLanguage);
  renderLanguage();
  show(0);
  startTimer();
})();
