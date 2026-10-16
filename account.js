(() => {
  const client = window.MELATONI_SUPABASE;
  const text = window.MelatoniAccountText || (key => key);
  const content = document.querySelector('#accountContent');
  const status = document.querySelector('#accountPageStatus');
  if (!content) return;
  let user = null;
  let currentTab = location.hash === '#wishlist' ? 'wishlist' : 'profile';
  let profile = { full_name: '', phone: '' };
  let addresses = [];
  let orders = [];
  let wishlist = [];
  const language = () => ['az','ru','en'].includes(window.MelatoniStorage?.get('melatoni-language')) ? window.MelatoniStorage.get('melatoni-language') : 'az';
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const message = (value, error = false) => { if (!status) return; status.textContent = value; status.classList.toggle('is-error', error); };
  const empty = key => `<p class="account-empty">${safe(text(key))}</p>`;
  const getProductName = id => { const p = (window.MELATONI_PRODUCTS || []).find(item => item.id === id); return p?.name?.[language()] || p?.name?.az || id; };
  async function loadData() {
    if (!client || !user) return;
    const uid = user.id;
    try {
    const [p, a, o, w] = await Promise.all([
      client.from('profiles').select('full_name,phone').eq('id', uid).maybeSingle(),
      client.from('addresses').select('*').eq('user_id', uid).order('is_default', { ascending: false }),
      client.from('orders').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      client.from('wishlist').select('product_id').eq('user_id', uid)
    ]);
    if ([p,a,o,w].some(result => result.error)) message(text('genericError'), true);
    if (!p.error && p.data) profile = p.data;
    addresses = a.error ? [] : (a.data || []);
    orders = o.error ? [] : (o.data || []);
    wishlist = w.error ? [] : (w.data || []).map(row => row.product_id);
    window.MelatoniStorage?.set('melatoni-wishlist', JSON.stringify(wishlist));
    } catch { message(text('genericError'), true); }
  }
  function setActiveTab(tab) {
    currentTab = tab;
    document.querySelectorAll('[data-account-tab]').forEach(button => button.setAttribute('aria-current', String(button.dataset.accountTab === tab)));
    render();
  }
  function render() {
    if (!user) { content.innerHTML = `<h2>${safe(text('needLogin'))}</h2><a class="button button-dark" href="index.html#account">${safe(text('login'))}</a>`; return; }
    if (currentTab === 'profile') content.innerHTML = `<h2>${safe(text('menuProfile'))}</h2><form id="profileForm" class="account-form"><label class="wide"><span>${safe(text('name'))}</span><input name="full_name" autocomplete="name" value="${safe(profile.full_name)}" required/></label><label class="wide"><span>${safe(text('email'))}</span><input type="email" value="${safe(user.email)}" disabled/></label><label class="wide"><span>${safe(text('phone'))}</span><input name="phone" type="tel" autocomplete="tel" value="${safe(profile.phone)}"/></label><button class="button button-dark" type="submit">${safe(text('save'))}</button></form>`;
    if (currentTab === 'addresses') content.innerHTML = `<h2>${safe(text('menuAddresses'))}</h2><div class="account-address-list">${addresses.length ? addresses.map(a => `<article class="account-address"><strong>${safe(a.label)}${a.is_default ? ` · ${safe(text('defaultAddress'))}` : ''}</strong><span>${safe([a.street,a.district,a.city].filter(Boolean).join(', '))}</span>${a.note ? `<span>${safe(a.note)}</span>` : ''}<button class="button button-dark" type="button" data-address-remove="${safe(a.id)}">${safe(text('remove'))}</button></article>`).join('') : empty('noAddresses')}</div><h2>${safe(text('addAddress'))}</h2><form id="addressForm" class="account-form"><label><span>${safe(text('label'))}</span><input name="label" value="${safe(text('menuAddresses'))}" required/></label><label><span>${safe(text('city'))}</span><input name="city" value="Bakı" required/></label><label><span>${safe(text('district'))}</span><input name="district" required/></label><label><span>${safe(text('street'))}</span><input name="street" required/></label><label class="wide"><span>${safe(text('note'))}</span><textarea name="note"></textarea></label><label class="wide"><span><input style="width:auto" name="is_default" type="checkbox"/> ${safe(text('defaultAddress'))}</span></label><button class="button button-dark" type="submit">${safe(text('addAddress'))}</button></form>`;
    if (currentTab === 'orders') content.innerHTML = `<h2>${safe(text('menuOrders'))}</h2>${orders.length ? orders.map(order => { const statusKey = `status${String(order.status || 'pending').replace(/^./, c => c.toUpperCase())}`; const lines = Array.isArray(order.items) ? order.items.map(item => `${getProductName(item.id)} × ${Number(item.qty) || 1}`).join(' · ') : ''; return `<article class="account-order"><strong>${new Date(order.created_at).toLocaleDateString(language()==='az'?'az-AZ':language()==='ru'?'ru-RU':'en-US')} · ${safe(text(statusKey))}</strong><p>${safe(lines)}</p><span>${safe(Number(order.total).toLocaleString(language()==='az'?'az-AZ':language()==='ru'?'ru-RU':'en-US'))} AZN</span></article>`; }).join('') : empty('noOrders')}`;
    if (currentTab === 'wishlist') content.innerHTML = `<h2>${safe(text('menuWishlist'))}</h2>${wishlist.length ? `<div class="account-wishlist">${wishlist.map(id => `<article class="account-address"><a href="product.html?id=${encodeURIComponent(id)}">${safe(getProductName(id))}</a><button type="button" class="button button-dark" data-wishlist-remove="${safe(id)}">${safe(text('remove'))}</button></article>`).join('')}</div>` : empty('noWishlist')}`;
    content.querySelector('#profileForm')?.addEventListener('submit', async event => { event.preventDefault(); try { const form = new FormData(event.currentTarget); const result = await client.from('profiles').upsert({ id: user.id, full_name: form.get('full_name'), phone: form.get('phone') || '' }); message(result.error ? text('genericError') : text('saved'), !!result.error); if (!result.error) profile = { full_name: form.get('full_name'), phone: form.get('phone') || '' }; } catch { message(text('genericError'),true); } });
    content.querySelector('#addressForm')?.addEventListener('submit', async event => { event.preventDefault(); try { const form = new FormData(event.currentTarget); const makeDefault = form.get('is_default') === 'on' || !addresses.length; if (makeDefault) await client.from('addresses').update({ is_default: false }).eq('user_id', user.id); const result = await client.from('addresses').insert({ user_id:user.id, label:form.get('label'), city:form.get('city') || 'Bakı', district:form.get('district'), street:form.get('street'), note:form.get('note') || '', is_default:makeDefault }); if (result.error) message(text('genericError'), true); else { await loadData(); message(text('saved')); render(); } } catch { message(text('genericError'),true); } });
    content.querySelectorAll('[data-address-remove]').forEach(button => button.addEventListener('click', async () => { try { const result = await client.from('addresses').delete().eq('id', button.dataset.addressRemove).eq('user_id', user.id); if (result.error) message(text('genericError'), true); else { await loadData(); render(); } } catch { message(text('genericError'),true); } }));
    content.querySelectorAll('[data-wishlist-remove]').forEach(button => button.addEventListener('click', async () => { try { const id = button.dataset.wishlistRemove; const result = await client.from('wishlist').delete().eq('user_id', user.id).eq('product_id', id); if (result.error) message(text('genericError'), true); else { wishlist = wishlist.filter(value => value !== id); window.MelatoniStorage?.set('melatoni-wishlist', JSON.stringify(wishlist)); document.dispatchEvent(new CustomEvent('melatoni:wishlist-change',{detail:wishlist})); render(); } } catch { message(text('genericError'),true); } }));
  }
  function localizePage() {
    const language = window.MelatoniStorage?.get('melatoni-language') || 'az';
    const copy = window.MelatoniAccountCopy?.[language] || window.MelatoniAccountCopy?.az;
    if (!copy) return;
    document.documentElement.lang = language;
    const current = document.querySelector('#langCurrent'); if (current) current.textContent = language.toUpperCase();
    const title = document.querySelector('[data-account-title]'); if (title) title.textContent = copy.title;
    const subtitle = document.querySelector('[data-account-subtitle]'); if (subtitle) subtitle.textContent = copy.subtitle;
    const keys = {profile:'menuProfile',addresses:'menuAddresses',orders:'menuOrders',wishlist:'menuWishlist',logout:'logout'};
    document.querySelectorAll('[data-account-tab]').forEach(button => { button.textContent = copy[keys[button.dataset.accountTab]]; });
    document.querySelectorAll('.main-nav a').forEach((link,index) => { const labels = language === 'ru' ? ['Товары','Коллекции','О нас'] : language === 'en' ? ['Products','Collections','About us'] : ['Məhsullar','Kolleksiyalar','Haqqımızda']; if (labels[index]) link.textContent = labels[index]; });
  }
  document.querySelectorAll('[data-account-tab]').forEach(button => button.addEventListener('click', async () => { const tab = button.dataset.accountTab; if (tab === 'logout') { try { if (client) await client.auth.signOut(); } catch {} window.location.href = 'index.html'; return; } setActiveTab(tab); }));
  document.addEventListener('melatoni:language-change', () => { localizePage(); if (user) render(); });
  document.querySelectorAll('.lang-picker [data-lang]').forEach(button => button.addEventListener('click', () => { const next = button.dataset.lang; if (!['az','ru','en'].includes(next)) return; window.MelatoniStorage?.set('melatoni-language',next); localizePage(); if (user) render(); document.querySelector('.lang-picker')?.removeAttribute('open'); }));
  localizePage();
  if (!client) { render(); message(text('supabaseMissing'), true); return; }
  client.auth.getSession().then(async ({ data, error }) => { if (error) { message(text('genericError'), true); render(); return; } user = data.session?.user || null; if (user) await loadData(); render(); });
  client.auth.onAuthStateChange((_event, session) => { user = session?.user || null; if (user) loadData().then(render); else render(); });
})();
