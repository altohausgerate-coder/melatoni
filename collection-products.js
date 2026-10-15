(() => {
  const root = document.querySelector('.collection-products');
  const track = root?.querySelector('[data-collection-track]');
  if (!root || !track || !Array.isArray(window.MELATONI_PRODUCTS)) return;

  const ids = ['linen-calm', 'pillow-cloud', 'duvet-dream', 'throw-knit', 'robe-soft', 'linen-satin', 'pillow-balance', 'duvet-airy', 'mask-silk', 'candle-night', 'towel-spa', 'gift-rest'];
  const rank = new Map(ids.map((id, index) => [id, index]));
  const products = window.MELATONI_PRODUCTS.filter(product => rank.has(product.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
  const filters = {
    all: () => true,
    linen: product => product.category === 'linen',
    'sleep-set': product => ['pillow', 'duvet'].includes(product.category),
    comfort: product => product.category === 'sleepwear' || product.id === 'throw-knit',
    accessory: product => ['accessory', 'gift'].includes(product.category),
    bath: product => product.category === 'bath',
  };
  const copy = {
    az: { eyebrow: 'MELATONI KOLLEKSİYALARI', heading: 'Zərif seçimlər, rahat yuxu.', intro: 'Yataq otağınıza rahatlıq və gözəllik qatan seçilmiş Melatoni məhsulları.', allProducts: 'Bütün məhsullar', all: 'Hamısı', linen: 'Yataq dəstləri', sleepSet: 'Yastıq və yorğan', comfort: 'Ev rahatlığı', accessory: 'Yuxu aksesuarları', bath: 'Hamam tekstili', product: 'Məhsula bax', offer: 'Xüsusi qiymət' },
    ru: { eyebrow: 'КОЛЛЕКЦИИ MELATONI', heading: 'Изысканный выбор для спокойного сна.', intro: 'Подборка Melatoni, которая добавит спальне уюта и красоты.', allProducts: 'Все товары', all: 'Все', linen: 'Постельное бельё', sleepSet: 'Подушки и одеяла', comfort: 'Домашний комфорт', accessory: 'Аксессуары для сна', bath: 'Текстиль для ванной', product: 'Подробнее', offer: 'Специальная цена' },
    en: { eyebrow: 'MELATONI COLLECTIONS', heading: 'Thoughtful details, softer sleep.', intro: 'A considered edit of Melatoni pieces for a more comfortable, beautiful bedroom.', allProducts: 'All products', all: 'All', linen: 'Bed linen', sleepSet: 'Pillows & duvets', comfort: 'Home comfort', accessory: 'Sleep accessories', bath: 'Bath textiles', product: 'View product', offer: 'Special price' },
  };
  const text = value => typeof value === 'string' ? value : (value?.[lang] || value?.az || '');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  const money = value => `${new Intl.NumberFormat(lang === 'az' ? 'az-AZ' : lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 0 }).format(Number(value) || 0)} AZN`;
  let lang = ['az', 'ru', 'en'].includes(localStorage.getItem('melatoni-language')) ? localStorage.getItem('melatoni-language') : 'az';
  let active = 'all';
  const dots = [...root.querySelectorAll('.collection-products-pagination span')];

  function render() {
    const labels = copy[lang] || copy.az;
    root.querySelector('.collection-products-eyebrow').textContent = labels.eyebrow;
    root.querySelector('#collectionProductsTitle').textContent = labels.heading;
    root.querySelector('.collection-products-intro').textContent = labels.intro;
    root.querySelector('.collection-products-all').innerHTML = `${labels.allProducts} <span aria-hidden="true">↗</span>`;
    const tabLabels = { all: labels.all, linen: labels.linen, 'sleep-set': labels.sleepSet, comfort: labels.comfort, accessory: labels.accessory, bath: labels.bath };
    root.querySelectorAll('[data-collection-filter]').forEach(button => {
      button.textContent = tabLabels[button.dataset.collectionFilter];
      const selected = button.dataset.collectionFilter === active;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const selected = products.filter(product => filters[active](product));
    track.innerHTML = selected.map((product, index) => {
      const name = escape(text(product.name));
      const sale = Number(product.salePrice) > 0 && Number(product.salePrice) < Number(product.price);
      const image = /^assets\/products\/[\w-]+\.(?:jpe?g|png|webp|avif)$/i.test(product.image || '') ? product.image : '';
      return `<article class="collection-product-card" style="--collection-order:${index}"><a class="collection-product-image" href="product.html?id=${encodeURIComponent(product.id)}" aria-label="${escape(labels.product)}: ${name}">${image ? `<img src="${escape(image)}" alt="${name}" loading="lazy">` : ''}${sale ? `<span class="collection-product-sale">${escape(labels.offer)}</span>` : ''}</a><div class="collection-product-info"><a class="collection-product-name" href="product.html?id=${encodeURIComponent(product.id)}">${name}</a><p class="collection-product-description">${escape(text(product.desc))}</p><div class="collection-product-prices">${sale ? `<del>${money(product.price)}</del>` : ''}<strong>${money(sale ? product.salePrice : product.price)}</strong></div></div></article>`;
    }).join('');
    track.scrollTo({ left: 0, behavior: 'auto' });
    updateDots();
  }
  function updateDots() {
    const max = Math.max(0, track.scrollWidth - track.clientWidth);
    const position = max ? track.scrollLeft / max : 0;
    const activeDot = Math.min(dots.length - 1, Math.round(position * (dots.length - 1)));
    dots.forEach((dot, index) => dot.classList.toggle('is-active', index === activeDot));
  }
  root.querySelector('.collection-products-filters').addEventListener('click', event => {
    const button = event.target.closest('[data-collection-filter]');
    if (!button) return;
    active = button.dataset.collectionFilter;
    render();
  });
  track.addEventListener('scroll', updateDots, { passive: true });
  document.addEventListener('melatoni:language-change', event => { lang = event.detail || lang; render(); });
  render();
})();
