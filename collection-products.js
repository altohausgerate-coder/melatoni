(() => {
  const root = document.querySelector('.collection-products');
  const track = root?.querySelector('[data-collection-track]');
  if (!root || !track || !Array.isArray(window.MELATONI_PRODUCTS)) return;

  const ids = ['linen-calm', 'pillow-cloud', 'duvet-dream', 'pajama-cotton', 'mask-silk', 'throw-knit', 'robe-soft', 'slippers-cloud', 'linen-satin', 'pillow-balance', 'duvet-airy', 'sheet-cloud', 'protector-pure', 'candle-night', 'diffuser-calm', 'towel-spa', 'gift-rest', 'mattress-rest'];
  const collectionImages = {
    'linen-calm': 'assets/products/collection-linen.jpg',
    'pillow-cloud': 'assets/products/collection-pillows.jpg',
    'pillow-balance': 'assets/products/collection-pillows.jpg',
    'duvet-dream': 'assets/products/collection-duvet.jpg',
    'duvet-airy': 'assets/products/collection-duvet.jpg',
    'throw-knit': 'assets/products/collection-throw.jpg',
    'robe-soft': 'assets/products/collection-robe.jpg',
    'pajama-cotton': 'assets/products/pajama-cotton.png',
  };
  const rank = new Map(ids.map((id, index) => [id, index]));
  const products = window.MELATONI_PRODUCTS.filter(product => rank.has(product.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
  const filters = {
    all: () => true,
    linen: product => ['linen', 'bedcare'].includes(product.category),
    'sleep-set': product => ['pillow', 'duvet'].includes(product.category),
    comfort: product => product.category === 'sleepwear' || product.id === 'throw-knit',
    accessory: product => product.category === 'accessory' || product.category === 'gift',
    bath: product => product.category === 'bath',
  };
  const copy = {
    az: { eyebrow: 'MELATONI KOLLEKSİYALARI', heading: 'Rahat yuxu üçün hər detal.', intro: 'Yataq dəstindən pijamaya, yuxu maskasından axşam rahatlığına qədər.', allProducts: 'Bütün məhsullar', all: 'Hamısı', linen: 'Yataq tekstili', sleepSet: 'Yastıq və yorğan', comfort: 'Pijama və ev geyimi', accessory: 'Yuxu aksesuarları', bath: 'Hamam və qulluq', product: 'Məhsula bax', offer: 'Xüsusi qiymət' },
    ru: { eyebrow: 'КОЛЛЕКЦИИ MELATONI', heading: 'Каждая деталь для спокойного сна.', intro: 'От постельного белья и пижам до масок для сна и вечерних аксессуаров.', allProducts: 'Все товары', all: 'Все', linen: 'Текстиль для спальни', sleepSet: 'Подушки и одеяла', comfort: 'Пижамы и домашняя одежда', accessory: 'Аксессуары для сна', bath: 'Ванная и уход', product: 'Подробнее', offer: 'Специальная цена' },
    en: { eyebrow: 'MELATONI COLLECTIONS', heading: 'Every detail for better rest.', intro: 'From bed linen and pajamas to sleep masks and calming evening essentials.', allProducts: 'All products', all: 'All', linen: 'Bedroom textiles', sleepSet: 'Pillows & duvets', comfort: 'Pajamas & loungewear', accessory: 'Sleep accessories', bath: 'Bath & care', product: 'View product', offer: 'Special price' },
  };
  const text = value => typeof value === 'string' ? value : (value?.[lang] || value?.az || '');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  const money = value => `${new Intl.NumberFormat(lang === 'az' ? 'az-AZ' : lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 0 }).format(Number(value) || 0)} AZN`;
  let lang = ['az', 'ru', 'en'].includes(localStorage.getItem('melatoni-language')) ? localStorage.getItem('melatoni-language') : 'az';
  let active = 'all';
  const pagination = root.querySelector('.collection-products-pagination');
  let pages = [];
  let activePage = 0;

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
    pages = [];
    for (let start = 0; start < selected.length; start += 5) pages.push(selected.slice(start, start + 5));
    activePage = 0;
    track.innerHTML = pages.map((page, pageIndex) => `<div class="collection-products-page${page.length < 5 ? ' is-compact' : ''}" data-collection-page="${pageIndex}">${page.map((product, index) => {
      const name = escape(text(product.name));
      const sale = Number(product.salePrice) > 0 && Number(product.salePrice) < Number(product.price);
      const selectedImage = collectionImages[product.id] || product.image;
      const image = /^assets\/products\/[\w-]+\.(?:jpe?g|png|webp|avif)$/i.test(selectedImage || '') ? selectedImage : '';
      return `<article class="collection-product-card" style="--collection-order:${index}"><a class="collection-product-image" href="product.html?id=${encodeURIComponent(product.id)}" aria-label="${escape(labels.product)}: ${name}">${image ? `<img src="${escape(image)}" alt="${name}" loading="lazy">` : ''}${sale ? `<span class="collection-product-sale">${escape(labels.offer)}</span>` : ''}<span class="collection-product-image-arrow" aria-hidden="true">↗</span></a><div class="collection-product-info"><a class="collection-product-name" href="product.html?id=${encodeURIComponent(product.id)}">${name}</a><p class="collection-product-description">${escape(text(product.desc))}</p><div class="collection-product-prices">${sale ? `<del>${money(product.price)}</del>` : ''}<strong>${money(sale ? product.salePrice : product.price)}</strong></div></div></article>`;
    }).join('')}</div>`).join('');
    pagination.innerHTML = pages.map((_, index) => `<button type="button" data-collection-page-dot="${index}" aria-label="${lang === 'en' ? 'Page' : lang === 'ru' ? 'Страница' : 'Səhifə'} ${index + 1}" aria-current="${index === 0}"></button>`).join('');
    track.scrollTo({ left: 0, behavior: 'auto' });
    updateDots();
  }
  function updateDots() {
    const max = Math.max(0, track.scrollWidth - track.clientWidth);
    activePage = Math.min(pages.length - 1, Math.max(0, Math.round((max ? track.scrollLeft / max : 0) * (pages.length - 1))));
    pagination.querySelectorAll('[data-collection-page-dot]').forEach((dot, index) => {
      const selected = index === activePage;
      dot.classList.toggle('is-active', selected);
      dot.setAttribute('aria-current', String(selected));
    });
  }
  root.querySelector('.collection-products-filters').addEventListener('click', event => {
    const button = event.target.closest('[data-collection-filter]');
    if (!button) return;
    active = button.dataset.collectionFilter;
    render();
  });
  track.addEventListener('scroll', updateDots, { passive: true });
  pagination.addEventListener('click', event => {
    const button = event.target.closest('[data-collection-page-dot]');
    if (!button) return;
    const max = Math.max(0, track.scrollWidth - track.clientWidth);
    const destination = pages.length > 1 ? max * Number(button.dataset.collectionPageDot) / (pages.length - 1) : 0;
    track.scrollTo({ left: destination, behavior: 'smooth' });
  });
  document.addEventListener('melatoni:language-change', event => { lang = event.detail || lang; render(); });
  render();
})();
