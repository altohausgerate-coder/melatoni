(() => {
  const root = document.querySelector('.popular-section');
  const grid = document.querySelector('#popularGrid');
  const sourceProducts = Array.isArray(window.MELATONI_PRODUCTS) ? window.MELATONI_PRODUCTS : [];
  if (!root || !grid || !sourceProducts.length) return;

  const curatedOrder = ['linen-calm','pillow-cloud','duvet-dream','sheet-cloud','throw-knit','robe-soft','linen-percale','pillow-balance','duvet-airy','towel-spa','linen-satin','pillow-down','duvet-winter','mattress-rest','mask-silk','candle-night','gift-rest','protector-pure','diffuser-calm','slippers-cloud'];
  const rank = new Map(curatedOrder.map((id, index) => [id, index]));
  const featureMatches = {
    warmth: { cool: ['linen-percale','duvet-airy','linen-calm'], balanced: ['duvet-dream','linen-calm'], warm: ['duvet-winter'] },
    fabric: { crisp: ['linen-percale'], smooth: ['linen-satin'], breathable: ['linen-calm','duvet-airy'] },
    pillow: { soft: ['pillow-cloud'], neck: ['pillow-balance'], light: ['pillow-down'] },
  };
  const products = [...sourceProducts].filter(item => item && typeof item === 'object').sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
  const labels = {
    az: { heading: 'Bu həftə populyar', headingPersonalized: 'Sizin üçün seçildi', all: 'Hamısı', linen: 'Yataq dəstləri', sleepSet: 'Yastıq və yorğan', bedcare: 'Döşək və çarşaf', homeTextile: 'Ev tekstili', accessory: 'Aksesuarlar', previous: 'Əvvəlki məhsullar', next: 'Növbəti məhsullar', product: 'Məhsula bax', wishlistAdd: 'İstək siyahısına əlavə et', wishlistRemove: 'İstək siyahısından çıxar', region: 'Bu həftə seçilmiş məhsullar', personalizedRegion: 'Sizə uyğun seçilmiş məhsullar' },
    ru: { heading: 'Популярное на этой неделе', headingPersonalized: 'Подобрано для вас', all: 'Все', linen: 'Постельное бельё', sleepSet: 'Подушки и одеяла', bedcare: 'Матрасы и простыни', homeTextile: 'Домашний текстиль', accessory: 'Аксессуары', previous: 'Предыдущие товары', next: 'Следующие товары', product: 'О товаре', wishlistAdd: 'Добавить в избранное', wishlistRemove: 'Убрать из избранного', region: 'Подборка недели', personalizedRegion: 'Товары, подобранные для вас' },
    en: { heading: 'Popular this week', headingPersonalized: 'Picked for you', all: 'All', linen: 'Bed linen', sleepSet: 'Pillows & duvets', bedcare: 'Mattresses & sheets', homeTextile: 'Home textiles', accessory: 'Accessories', previous: 'Previous products', next: 'Next products', product: 'View product', wishlistAdd: 'Add to wishlist', wishlistRemove: 'Remove from wishlist', region: 'This week’s selected products', personalizedRegion: 'Products picked for you' },
  };
  const filters = {
    all: product => true,
    linen: product => product.category === 'linen',
    'sleep-set': product => ['pillow', 'duvet'].includes(product.category),
    bedcare: product => product.category === 'bedcare',
    'home-textile': product => ['sleepwear', 'bath'].includes(product.category),
    accessory: product => ['accessory', 'gift'].includes(product.category),
  };
  const langFromStore = () => ['az', 'ru', 'en'].includes(localStorage.getItem('melatoni-language')) ? localStorage.getItem('melatoni-language') : 'az';
  let lang = langFromStore();
  let activeFilter = 'all';
  let startIndex = 0;
  let timer = 0;
  let focusInside = false;
  let visible = false;
  let preferredCategories = [];
  let preferences = {};
  let personalized = false;
  let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const savedIds = new Set();

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  const textFor = value => typeof value === 'string' ? value : (value?.[lang] || value?.az || '');
  const formatPrice = value => `${new Intl.NumberFormat(lang === 'az' ? 'az-AZ' : lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 0 }).format(Number(value) || 0)} AZN`;
  const imageFor = value => /^assets\/products\/[\w-]+\.(?:jpe?g|png|webp|avif)$/i.test(String(value || '')) ? value : '';
  const list = () => {
    const maxBudget = preferences.budget && preferences.budget !== 'all' ? Number(preferences.budget) : Infinity;
    const matching = products.filter(product => (filters[activeFilter] || filters.all)(product) && Number(product.price) <= maxBudget);
    const priority = new Map(preferredCategories.map((category, index) => [category, index]));
    const score = product => Object.entries(preferences).reduce((total, [key, value]) => {
      const ids = featureMatches[key]?.[value] || [];
      return total + (ids.includes(product.id) ? 1 : 0);
    }, 0);
    return matching.sort((a, b) => {
      const relevance = score(b) - score(a);
      if (relevance) return relevance;
      return (priority.get(a.category) ?? Infinity) - (priority.get(b.category) ?? Infinity) || (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999);
    });
  };

  function renderLabels() {
    const copy = labels[lang] || labels.az;
    root.querySelector('[data-popular-heading]').textContent = personalized ? copy.headingPersonalized : copy.heading;
    root.querySelector('[data-popular-filter="all"]').textContent = copy.all;
    root.querySelector('[data-popular-filter="linen"]').textContent = copy.linen;
    root.querySelector('[data-popular-filter="sleep-set"]').textContent = copy.sleepSet;
    root.querySelector('[data-popular-filter="bedcare"]').textContent = copy.bedcare;
    root.querySelector('[data-popular-filter="home-textile"]').textContent = copy.homeTextile;
    root.querySelector('[data-popular-filter="accessory"]').textContent = copy.accessory;
    root.querySelector('[data-popular-prev]').setAttribute('aria-label', copy.previous);
    root.querySelector('[data-popular-next]').setAttribute('aria-label', copy.next);
    grid.setAttribute('aria-label', personalized ? copy.personalizedRegion : copy.region);
    render();
  }

  function render() {
    const copy = labels[lang] || labels.az;
    const matching = list();
    const count = Math.min(personalized ? 6 : 3, matching.length);
    grid.classList.toggle('is-personalized', personalized);
    if (personalized) grid.classList.remove('is-compact');
    else grid.classList.toggle('is-compact', count === 2);
    if (!count) {
      grid.innerHTML = `<p class="popular-empty">${lang === 'ru' ? 'По этим фильтрам товары не найдены. Попробуйте изменить категорию или бюджет.' : lang === 'en' ? 'No products match these filters. Try changing the category or budget.' : 'Bu seçimlərə uyğun məhsul tapılmadı. Kateqoriyanı və ya büdcəni dəyişərək yenidən baxın.'}</p>`;
      return;
    }
    const cards = Array.from({ length: count }, (_, offset) => matching[(startIndex + offset) % matching.length]);
    grid.innerHTML = cards.map((product, index) => {
      const id = escape(product.id);
      const name = escape(textFor(product.name));
      const description = escape(textFor(product.desc));
      const image = escape(imageFor(product.image));
      const saved = savedIds.has(product.id);
      return `<article class="popular-card" style="--popular-order:${index}" data-popular-card>
        <div class="popular-image-wrap">
          <a class="popular-image-link" href="product.html?id=${encodeURIComponent(product.id)}" aria-label="${escape(copy.product)}: ${name}">
            ${image ? `<img src="${image}" alt="${name}" loading="lazy"/>` : '<span class="popular-image-empty">MELATONI</span>'}
          </a>
          <button class="popular-save${saved ? ' is-saved' : ''}" type="button" data-save="${id}" aria-label="${saved ? escape(copy.wishlistRemove) : escape(copy.wishlistAdd)}" aria-pressed="${saved}">${saved ? '♥' : '♡'}</button>
        </div>
        <div class="popular-details">
          <a class="popular-name" href="product.html?id=${encodeURIComponent(product.id)}">${name}</a>
          <p class="popular-description">${description}</p>
          <div class="popular-bottom"><span class="popular-price">${formatPrice(product.price)}</span><a class="popular-open" href="product.html?id=${encodeURIComponent(product.id)}" aria-label="${escape(copy.product)}">↗</a></div>
        </div>
      </article>`;
    }).join('');
  }

  function stop() { window.clearInterval(timer); timer = 0; }
  function start() {
    stop();
    if (visible && !focusInside && !reducedMotion && !document.hidden && list().length > 2) {
      timer = window.setInterval(() => { startIndex = (startIndex + 1) % list().length; render(); }, 5200);
    }
  }
  function step(direction) {
    const length = list().length;
    if (length < 2) return;
    startIndex = (startIndex + direction + length) % length;
    render();
    start();
  }

  root.querySelectorAll('[data-popular-filter]').forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.popularFilter;
    startIndex = 0;
    root.querySelectorAll('[data-popular-filter]').forEach(item => {
      const selected = item === button;
      item.classList.toggle('is-active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    render();
    start();
  }));
  root.querySelector('[data-popular-prev]').addEventListener('click', () => step(-1));
  root.querySelector('[data-popular-next]').addEventListener('click', () => step(1));
  root.addEventListener('focusin', () => { focusInside = true; stop(); });
  root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget)) { focusInside = false; start(); } });
  document.addEventListener('visibilitychange', start);
  document.addEventListener('melatoni:language-change', event => { lang = event.detail || langFromStore(); renderLabels(); });
  document.addEventListener('melatoni:wishlist-change', event => {
    savedIds.clear();
    (event.detail || []).forEach(id => savedIds.add(id));
    render();
  });
  document.addEventListener('melatoni:profile-ready', event => {
    const profile = event.detail || {};
    preferredCategories = Array.isArray(profile.interests) ? profile.interests.filter(category =>
      ['linen', 'pillow', 'duvet', 'bedcare', 'sleepwear', 'bath', 'accessory'].includes(category)
    ) : [];
    preferences = profile.preferences && typeof profile.preferences === 'object' ? profile.preferences : {};
    personalized = true;
    startIndex = 0;
    renderLabels();
    start();
  });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      start();
    }, { threshold: 0.18 });
    observer.observe(root);
  } else { visible = true; start(); }
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  motionPreference.addEventListener?.('change', event => { reducedMotion = event.matches; start(); });
  renderLabels();
})();
