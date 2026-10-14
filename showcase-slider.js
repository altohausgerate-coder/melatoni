(() => {
  const gallery = document.querySelector('.showcase-gallery');
  if (!gallery) return;

  const slides = [...gallery.querySelectorAll('[data-showcase-slide]')];
  const dots = [...document.querySelectorAll('.showcase-pagination button')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const words = {
    az: { previous: 'Əvvəlki şəkillər', next: 'Növbəti şəkillər', gallery: 'Melatoni yataq otağı kolleksiyaları', dots: 'Şəkil dəstini seçin', set: (number) => `${number}-ci şəkil dəsti` },
    ru: { previous: 'Предыдущие изображения', next: 'Следующие изображения', gallery: 'Коллекции для спальни Melatoni', dots: 'Выберите набор изображений', set: (number) => `Набор изображений ${number}` },
    en: { previous: 'Previous images', next: 'Next images', gallery: 'Melatoni bedroom collections', dots: 'Choose an image set', set: (number) => `Image set ${number}` },
  };
  let active = 0;
  let timer = 0;
  let pausedByPointer = false;
  let pausedByFocus = false;

  function language() {
    const selected = document.documentElement.lang;
    return words[selected] ? selected : 'az';
  }
  function setLanguageLabels() {
    const labels = words[language()];
    gallery.querySelector('.showcase-prev').setAttribute('aria-label', labels.previous);
    gallery.querySelector('.showcase-next').setAttribute('aria-label', labels.next);
    gallery.setAttribute('aria-label', labels.gallery);
    document.querySelector('.showcase-pagination').setAttribute('aria-label', labels.dots);
    dots.forEach((dot, index) => dot.setAttribute('aria-label', labels.set(index + 1)));
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
    dots.forEach((dot, dotIndex) => {
      const selected = dotIndex === active;
      dot.classList.toggle('is-active', selected);
      if (selected) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    gallery.dispatchEvent(new CustomEvent('showcase:change', { detail: active }));
  }
  function clearTimer() { window.clearInterval(timer); timer = 0; }
  function startTimer() {
    clearTimer();
    if (!pausedByPointer && !pausedByFocus && !reducedMotion.matches && !document.hidden) {
      timer = window.setInterval(() => show(active + 1), 6500);
    }
  }

  gallery.querySelector('.showcase-prev').addEventListener('click', () => { show(active - 1); startTimer(); });
  gallery.querySelector('.showcase-next').addEventListener('click', () => { show(active + 1); startTimer(); });
  dots.forEach((dot, index) => dot.addEventListener('click', () => { show(index); startTimer(); }));
  gallery.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); show(active + 1); startTimer(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(active - 1); startTimer(); }
  });
  gallery.addEventListener('pointerenter', () => { pausedByPointer = true; clearTimer(); });
  gallery.addEventListener('pointerleave', () => { pausedByPointer = false; startTimer(); });
  gallery.addEventListener('focusin', () => { pausedByFocus = true; clearTimer(); });
  gallery.addEventListener('focusout', (event) => {
    if (!gallery.contains(event.relatedTarget)) { pausedByFocus = false; startTimer(); }
  });
  document.addEventListener('visibilitychange', startTimer);
  document.addEventListener('melatoni:language-change', setLanguageLabels);
  reducedMotion.addEventListener?.('change', startTimer);
  setLanguageLabels();
  show(0);
  startTimer();
})();
