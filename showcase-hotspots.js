(() => {
  const gallery = document.querySelector('.showcase-gallery');
  const catalog = Array.isArray(window.MELATONI_PRODUCTS) ? window.MELATONI_PRODUCTS : [];
  if (!gallery || !catalog.length) return;

  const copy = {
    az: { view: 'Məhsula bax', all: 'Məhsulları gör', missing: 'Məhsul məlumatı tapılmadı' },
    ru: { view: 'Смотреть товар', all: 'Смотреть товары', missing: 'Информация о товаре не найдена' },
    en: { view: 'View product', all: 'View products', missing: 'Product information not found' },
  };
  const moneyFormatters = {
    az: new Intl.NumberFormat('az-AZ', { maximumFractionDigits: 2 }),
    ru: new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }),
    en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }),
  };
  const pins = [...gallery.querySelectorAll('[data-product-hotspot]')];
  const productMap = new Map(catalog.filter(item => item && typeof item.id === 'string').map(item => [item.id, item]));
  let activePin = null;

  const language = () => ['az', 'ru', 'en'].includes(document.documentElement.lang) ? document.documentElement.lang : 'az';
  const textFor = value => value && typeof value === 'object' ? (value[language()] || value.en || value.az || '') : String(value || '');
  const formattedPrice = value => {
    const price = Number(value);
    return Number.isFinite(price) && price >= 0 ? `${moneyFormatters[language()].format(price)} AZN` : '';
  };

  function fillCard(pin) {
    const hotspot = pin.closest('.scene-hotspot');
    const card = hotspot?.querySelector('.scene-product');
    const product = productMap.get(pin.dataset.productHotspot);
    if (!card || !product) return;

    card.replaceChildren();
    card.setAttribute('aria-hidden', 'false');
    const image = document.createElement('img');
    image.className = 'scene-product-image';
    image.src = /^assets\/products\/[\w-]+\.(?:jpe?g|png|webp|avif)$/i.test(product.image || '') ? product.image : '';
    image.alt = textFor(product.name);
    image.loading = 'lazy';

    const row = document.createElement('div');
    row.className = 'scene-product-row';
    const content = document.createElement('div');
    content.className = 'scene-product-copy';
    const name = document.createElement('span');
    name.className = 'scene-product-name';
    name.textContent = textFor(product.name);
    const price = document.createElement('span');
    price.className = 'scene-product-price';
    price.textContent = formattedPrice(product.price);
    content.append(name, price);
    row.append(image, content);

    const link = document.createElement('a');
    link.className = 'scene-product-link';
    link.href = `product.html?id=${encodeURIComponent(product.id)}`;
    link.innerHTML = `<span>${copy[language()].view}</span><span aria-hidden="true">↗</span>`;
    card.append(row, link);
  }

  function open(pin) {
    const hotspot = pin.closest('.scene-hotspot');
    if (!hotspot) return;
    if (activePin && activePin !== pin) close(activePin);
    activePin = pin;
    fillCard(pin);
    hotspot.classList.add('is-open');
    pin.setAttribute('aria-expanded', 'true');
  }

  function close(pin) {
    const hotspot = pin.closest('.scene-hotspot');
    if (!hotspot) return;
    hotspot.classList.remove('is-open');
    pin.setAttribute('aria-expanded', 'false');
    hotspot.querySelector('.scene-product')?.setAttribute('aria-hidden', 'true');
    if (activePin === pin) activePin = null;
  }

  pins.forEach(pin => {
    const hotspot = pin.closest('.scene-hotspot');
    pin.addEventListener('pointerenter', () => open(pin));
    pin.addEventListener('focus', () => open(pin));
    pin.addEventListener('click', () => open(pin));
    hotspot?.addEventListener('pointerleave', () => {
      if (!hotspot.contains(document.activeElement)) close(pin);
    });
    pin.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        close(pin);
        pin.focus();
      }
    });
    pin.setAttribute('aria-label', `${textFor(productMap.get(pin.dataset.productHotspot)?.name) || copy[language()].missing} · ${copy[language()].view}`);
  });

  gallery.addEventListener('showcase:change', () => pins.forEach(pin => close(pin)));
  gallery.addEventListener('pointerdown', event => {
    if (!event.target.closest('.scene-hotspot')) pins.forEach(pin => close(pin));
  });
  document.addEventListener('melatoni:language-change', () => {
    gallery.querySelectorAll('.scene-all-products').forEach(link => { link.firstChild.textContent = `${copy[language()].all} `; });
    pins.forEach(pin => {
      const product = productMap.get(pin.dataset.productHotspot);
      if (product) pin.setAttribute('aria-label', `${textFor(product.name)} · ${copy[language()].view}`);
      if (pin === activePin) fillCard(pin);
    });
  });
  gallery.querySelectorAll('.scene-all-products').forEach(link => { link.firstChild.textContent = `${copy[language()].all} `; });
})();
