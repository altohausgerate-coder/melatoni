(() => {
  const catalog = window.MELATONI_PRODUCTS || [];
  const id = new URLSearchParams(location.search).get('id');
  const product = catalog.find(item => item.id === id);
  const section = document.querySelector('#productCompanions');
  const grid = document.querySelector('#companionsGrid');
  if (!product || !section || !grid) return;
  const langValue = window.MelatoniStorage?.get('melatoni-language') || 'az';
  const lang = ['az','ru','en'].includes(langValue) ? langValue : 'az';
  const translations = {
    az:{title:'Bu rahatlığı tamamlayın',add:'Səbətə əlavə et'},
    ru:{title:'Дополните комфорт',add:'Добавить в корзину'},
    en:{title:'Complete the comfort',add:'Add to bag'}
  }[lang];
  const complementary = {
    linen:['pillow','duvet','accessory'], pillow:['linen','duvet','sleepwear'], duvet:['pillow','linen','bedcare'],
    bedcare:['linen','pillow','duvet'], sleepwear:['accessory','bath','pillow'], bath:['sleepwear','accessory','linen'],
    accessory:['linen','pillow','sleepwear'], gift:['linen','pillow','duvet']
  }[product.category] || ['linen','pillow','duvet'];
  const items = catalog.filter(item => item.id !== product.id && complementary.includes(item.category)).slice(0,4);
  if (!items.length) return;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  document.querySelector('#companionsTitle').textContent = translations.title;
  grid.innerHTML = items.map(item => {
    const name = typeof item.name === 'object' ? item.name[lang] || item.name.az : item.name;
    const amount = Number(item.salePrice) > 0 ? Number(item.salePrice) : Number(item.price) || 0;
    const price = new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-US' : 'az-AZ', { maximumFractionDigits: 2 }).format(amount);
    return `<article class="product-companion"><a href="product.html?id=${encodeURIComponent(item.id)}"><img src="${escape(item.image)}" alt="${escape(name)}" loading="lazy"/><h3>${escape(name)}</h3></a><p>${price} AZN</p><button class="button button-light" type="button" data-companion-add="${escape(item.id)}">${escape(translations.add)}</button></article>`;
  }).join('');
  grid.addEventListener('click', event => {
    const button = event.target.closest('[data-companion-add]');
    if (!button) return;
    let bag = [];
    try { bag = JSON.parse(window.MelatoniStorage?.get('melatoni-cart') || '[]'); } catch { /* Start with an empty bag when saved data is invalid. */ }
    const row = bag.find(item => item.id === button.dataset.companionAdd && !item.color && !item.size);
    if (row) row.qty = (Number(row.qty) || 1) + 1;
    else bag.push({ id: button.dataset.companionAdd, qty: 1 });
    window.MelatoniStorage?.set('melatoni-cart', JSON.stringify(bag));
    document.dispatchEvent(new Event('melatoni:cart-change'));
    button.textContent = translations.add;
    button.disabled = true;
    setTimeout(() => { button.disabled = false; }, 900);
  });
  section.hidden = false;
})();
