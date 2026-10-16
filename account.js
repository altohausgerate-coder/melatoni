(() => {
  const client = window.MELATONI_SUPABASE;
  const text = window.MelatoniAccountText || (key => key);
  const content = document.querySelector('#accountContent');
  const status = document.querySelector('#accountPageStatus');
  if (!content) return;

  const categories = ['linen','pillow','duvet','bedcare','sleepwear','bath','accessory','gift'];
  const categoryLabel = key => text(`cat${key[0].toUpperCase()}${key.slice(1)}`);
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const language = () => ['az','ru','en'].includes(window.MelatoniStorage?.get('melatoni-language')) ? window.MelatoniStorage.get('melatoni-language') : 'az';
  const locale = () => language() === 'ru' ? 'ru-RU' : language() === 'en' ? 'en-US' : 'az-AZ';
  const message = (value, error = false) => { if (!status) return; status.textContent = value; status.classList.toggle('is-error', error); };
  const empty = key => `<p class="account-empty">${safe(text(key))}</p>`;
  const products = () => Array.isArray(window.MELATONI_PRODUCTS) ? window.MELATONI_PRODUCTS.filter(item => item && item.id) : [];
  const getProduct = id => products().find(item => item.id === id);
  const getProductName = id => { const p = getProduct(id); return p?.name?.[language()] || p?.name?.az || id; };
  let user = null;
  let currentTab = location.hash === '#wishlist' ? 'wishlist' : 'profile';
  let profile = { full_name: '', phone: '' };
  let addresses = [], orders = [], wishlist = [], preferences = null, interactions = [], alerts = [], tickets = [];
  let featureSchemaReady = true;

  async function loadData() {
    if (!client || !user) return;
    const uid = user.id;
    try {
      const [p,a,o,w,pref,views,alertRows,ticketRows] = await Promise.all([
        client.from('profiles').select('full_name,phone').eq('id',uid).maybeSingle(),
        client.from('addresses').select('*').eq('user_id',uid).order('is_default',{ascending:false}),
        client.from('orders').select('*').eq('user_id',uid).order('created_at',{ascending:false}),
        client.from('wishlist').select('product_id').eq('user_id',uid),
        client.from('customer_preferences').select('recommendations_consent,interests').eq('user_id',uid).maybeSingle(),
        client.from('customer_interactions').select('product_id,event_name,created_at').eq('user_id',uid).gte('created_at',new Date(Date.now()-90*86400000).toISOString()).order('created_at',{ascending:false}).limit(150),
        client.from('product_alerts').select('product_id,target_price,notify_price_drop,notify_restock,last_notified_at').eq('user_id',uid),
        client.from('support_tickets').select('id,order_id,subject,message,status,admin_reply,replied_at,created_at,updated_at').eq('user_id',uid).order('created_at',{ascending:false})
      ]);
      if ([p,a,o,w].some(result => result.error)) message(text('genericError'),true);
      if (!p.error && p.data) profile = p.data;
      addresses = a.error ? [] : (a.data || []);
      orders = o.error ? [] : (o.data || []);
      wishlist = w.error ? [] : (w.data || []).map(row => row.product_id);
      preferences = pref.error ? null : pref.data;
      interactions = views.error ? [] : (views.data || []);
      alerts = alertRows.error ? [] : (alertRows.data || []);
      tickets = ticketRows.error ? [] : (ticketRows.data || []);
      featureSchemaReady = ![pref,views,alertRows,ticketRows].some(result => result.error);
      window.MelatoniStorage?.set('melatoni-wishlist',JSON.stringify(wishlist));
    } catch { message(text('genericError'),true); }
  }

  function setActiveTab(tab) {
    currentTab = tab;
    document.querySelectorAll('[data-account-tab]').forEach(button => button.setAttribute('aria-current',String(button.dataset.accountTab === tab)));
    render();
  }

  function renderRecommendations() {
    const selected = new Set(preferences?.interests || []);
    const recentIds = [...new Set(interactions.filter(row => row.event_name === 'view').map(row => row.product_id))];
    const viewedCategories = new Set(recentIds.map(id => getProduct(id)?.category).filter(Boolean));
    const ranked = products().map(product => ({ product, score: (selected.has(product.category) ? 5 : 0) + (viewedCategories.has(product.category) ? 3 : 0) + (recentIds.includes(product.id) ? 1 : 0) }))
      .filter(item => item.score > 0).sort((a,b) => b.score - a.score).slice(0,8).map(item => item.product);
    if (!featureSchemaReady) return `<h2>${safe(text('recTitle'))}</h2>${empty('featuresUnavailable')}`;
    const categoryFields = categories.map(key => `<label class="account-choice"><input type="checkbox" name="interest" value="${key}" ${selected.has(key)?'checked':''}/><span>${safe(categoryLabel(key))}</span></label>`).join('');
    const recent = recentIds.slice(0,5);
    return `<h2>${safe(text('recTitle'))}</h2><p class="account-feature-intro">${safe(text('recIntro'))}</p><form id="recommendationForm" class="account-feature-form"><fieldset><legend>${safe(text('recTitle'))}</legend><div class="account-choice-grid">${categoryFields}</div></fieldset><label class="account-consent"><input type="checkbox" name="consent" ${preferences?.recommendations_consent?'checked':''}/><span>${safe(text('recConsent'))}</span></label><button class="button button-dark" type="submit">${safe(text('recSave'))}</button></form><p class="account-privacy-note">${safe(text('recOptOut'))}</p>${ranked.length?`<h3>${safe(text('recTitle'))}</h3><div class="account-product-links">${ranked.map(product => `<a href="product.html?id=${encodeURIComponent(product.id)}"><img src="${safe(product.image||'')}" alt="" loading="lazy"/><span>${safe(product.name?.[language()]||product.name?.az||product.id)}</span></a>`).join('')}</div>`:empty('recEmpty')}${recent.length?`<h3>${safe(text('recentProducts'))}</h3><div class="account-recent-list">${recent.map(id=>`<a href="product.html?id=${encodeURIComponent(id)}">${safe(getProductName(id))}</a>`).join('')}</div>`:''}`;
  }

  function renderAlerts() {
    if (!featureSchemaReady) return `<h2>${safe(text('alertsTitle'))}</h2>${empty('featuresUnavailable')}`;
    const options = products().map(product => `<option value="${safe(product.id)}">${safe(product.name?.[language()]||product.name?.az||product.id)}</option>`).join('');
    const list = alerts.length ? `<div class="account-alert-list">${alerts.map(alert => `<article class="account-address"><strong>${safe(getProductName(alert.product_id))}</strong><span>${[alert.notify_price_drop?text('alertPrice'):'',alert.notify_restock?text('alertStock'):''].filter(Boolean).map(safe).join(' · ')}${alert.target_price != null?` · ≤ ${safe(alert.target_price)} AZN`:''}</span><button class="button button-light" type="button" data-alert-remove="${safe(alert.product_id)}">${safe(text('alertRemove'))}</button></article>`).join('')}</div>` : empty('alertEmpty');
    return `<h2>${safe(text('alertsTitle'))}</h2><p class="account-feature-intro">${safe(text('alertsIntro'))}</p>${list}<form id="productAlertForm" class="account-form account-feature-form"><label class="wide"><span>${safe(text('alertProduct'))}</span><select name="product_id" required>${options}</select></label><label class="wide"><span>${safe(text('alertTarget'))}</span><input name="target_price" type="number" min="0" step="0.01"/></label><label class="account-check"><input name="notify_price_drop" type="checkbox"/><span>${safe(text('alertPrice'))}</span></label><label class="account-check"><input name="notify_restock" type="checkbox" checked/><span>${safe(text('alertStock'))}</span></label><label class="account-consent wide"><input name="consent" type="checkbox" required/><span>${safe(text('alertConsent'))} <strong>${safe(user.email||'')}</strong></span></label><button class="button button-dark" type="submit">${safe(text('alertSave'))}</button></form>`;
  }

  const ticketStatusText = value => text(({open:'supportOpen',in_progress:'supportProgress',answered:'supportAnswered',closed:'supportClosed'})[value] || 'supportOpen');
  function renderSupport() {
    if (!featureSchemaReady) return `<h2>${safe(text('supportTitle'))}</h2>${empty('featuresUnavailable')}`;
    const list = tickets.length ? tickets.map(ticket => `<article class="account-ticket"><header><strong>${safe(ticket.subject)}</strong><span>${safe(ticketStatusText(ticket.status))}</span></header><small>${safe(new Date(ticket.created_at).toLocaleDateString(locale()))}${ticket.order_id?` · ${safe(text('orderReference'))}: ${safe(ticket.order_id)}`:''}</small><p>${safe(ticket.message)}</p>${ticket.admin_reply?`<div class="account-ticket-reply"><strong>${safe(text('supportReply'))}</strong><p>${safe(ticket.admin_reply)}</p></div>`:''}</article>`).join('') : empty('supportEmpty');
    const orderOptions = orders.map(order => `<option value="${safe(order.id)}">${safe(new Date(order.created_at).toLocaleDateString(locale()))} · ${safe(String(order.id).slice(0,8))}</option>`).join('');
    return `<h2>${safe(text('supportTitle'))}</h2><p class="account-feature-intro">${safe(text('supportIntro'))}</p>${list}<form id="supportForm" class="account-form account-feature-form"><label class="wide"><span>${safe(text('supportOrder'))}</span><select name="order_id"><option value="">${safe(text('supportNoOrder'))}</option>${orderOptions}</select></label><label class="wide"><span>${safe(text('supportSubject'))}</span><input name="subject" maxlength="120" required minlength="3"/></label><label class="wide"><span>${safe(text('supportMessage'))}</span><textarea name="message" maxlength="4000" minlength="10" required></textarea></label><button class="button button-dark" type="submit">${safe(text('supportSend'))}</button></form>`;
  }

  function render() {
    if (!user) { content.innerHTML = `<h2>${safe(text('needLogin'))}</h2><a class="button button-dark" href="index.html#account">${safe(text('login'))}</a>`; return; }
    if (currentTab === 'profile') content.innerHTML = `<h2>${safe(text('menuProfile'))}</h2><form id="profileForm" class="account-form"><label class="wide"><span>${safe(text('name'))}</span><input name="full_name" autocomplete="name" value="${safe(profile.full_name)}" required/></label><label class="wide"><span>${safe(text('email'))}</span><input type="email" value="${safe(user.email)}" disabled/></label><label class="wide"><span>${safe(text('phone'))}</span><input name="phone" type="tel" autocomplete="tel" value="${safe(profile.phone)}"/></label><button class="button button-dark" type="submit">${safe(text('save'))}</button></form>`;
    if (currentTab === 'addresses') content.innerHTML = `<h2>${safe(text('menuAddresses'))}</h2><div class="account-address-list">${addresses.length ? addresses.map(a => `<article class="account-address"><strong>${safe(a.label)}${a.is_default ? ` · ${safe(text('defaultAddress'))}` : ''}</strong><span>${safe([a.street,a.district,a.city].filter(Boolean).join(', '))}</span>${a.note ? `<span>${safe(a.note)}</span>` : ''}<button class="button button-dark" type="button" data-address-remove="${safe(a.id)}">${safe(text('remove'))}</button></article>`).join('') : empty('noAddresses')}</div><h2>${safe(text('addAddress'))}</h2><form id="addressForm" class="account-form"><label><span>${safe(text('label'))}</span><input name="label" value="${safe(text('menuAddresses'))}" required/></label><label><span>${safe(text('city'))}</span><input name="city" value="Bakı" required/></label><label><span>${safe(text('district'))}</span><input name="district" required/></label><label><span>${safe(text('street'))}</span><input name="street" required/></label><label class="wide"><span>${safe(text('note'))}</span><textarea name="note"></textarea></label><label class="wide account-check"><input name="is_default" type="checkbox"/> <span>${safe(text('defaultAddress'))}</span></label><button class="button button-dark" type="submit">${safe(text('addAddress'))}</button></form>`;
    if (currentTab === 'orders') content.innerHTML = `<h2>${safe(text('menuOrders'))}</h2>${orders.length ? orders.map(order => { const statusKey = `status${String(order.status || 'pending').replace(/^./,c=>c.toUpperCase())}`; const lines = Array.isArray(order.items) ? order.items.map(item => `${getProductName(item.id)} × ${Number(item.qty)||1}`).join(' · ') : ''; return `<article class="account-order"><strong>${safe(new Date(order.created_at).toLocaleDateString(locale()))} · ${safe(text(statusKey))}</strong><p>${safe(lines)}</p><span>${safe(Number(order.total).toLocaleString(locale()))} AZN</span></article>`; }).join('') : empty('noOrders')}`;
    if (currentTab === 'wishlist') content.innerHTML = `<h2>${safe(text('menuWishlist'))}</h2>${wishlist.length ? `<div class="account-wishlist">${wishlist.map(id => `<article class="account-address"><a href="product.html?id=${encodeURIComponent(id)}">${safe(getProductName(id))}</a><button type="button" class="button button-dark" data-wishlist-remove="${safe(id)}">${safe(text('remove'))}</button></article>`).join('')}</div>` : empty('noWishlist')}`;
    if (currentTab === 'recommendations') content.innerHTML = renderRecommendations();
    if (currentTab === 'alerts') content.innerHTML = renderAlerts();
    if (currentTab === 'support') content.innerHTML = renderSupport();

    content.querySelector('#profileForm')?.addEventListener('submit',async event=>{event.preventDefault();try{const data=new FormData(event.currentTarget);const result=await client.from('profiles').upsert({id:user.id,full_name:data.get('full_name'),phone:data.get('phone')||''});message(result.error?text('genericError'):text('saved'),!!result.error);if(!result.error)profile={full_name:data.get('full_name'),phone:data.get('phone')||''}}catch{message(text('genericError'),true)}});
    content.querySelector('#addressForm')?.addEventListener('submit',async event=>{event.preventDefault();try{const data=new FormData(event.currentTarget);const makeDefault=data.get('is_default')==='on'||!addresses.length;if(makeDefault)await client.from('addresses').update({is_default:false}).eq('user_id',user.id);const result=await client.from('addresses').insert({user_id:user.id,label:data.get('label'),city:data.get('city')||'Bakı',district:data.get('district'),street:data.get('street'),note:data.get('note')||'',is_default:makeDefault});if(result.error)message(text('genericError'),true);else{await loadData();message(text('saved'));render()}}catch{message(text('genericError'),true)}});
    content.querySelectorAll('[data-address-remove]').forEach(button=>button.addEventListener('click',async()=>{try{const result=await client.from('addresses').delete().eq('id',button.dataset.addressRemove).eq('user_id',user.id);if(result.error)message(text('genericError'),true);else{await loadData();render()}}catch{message(text('genericError'),true)}}));
    content.querySelectorAll('[data-wishlist-remove]').forEach(button=>button.addEventListener('click',async()=>{try{const id=button.dataset.wishlistRemove;const result=await client.from('wishlist').delete().eq('user_id',user.id).eq('product_id',id);if(result.error)message(text('genericError'),true);else{wishlist=wishlist.filter(value=>value!==id);window.MelatoniStorage?.set('melatoni-wishlist',JSON.stringify(wishlist));document.dispatchEvent(new CustomEvent('melatoni:wishlist-change',{detail:wishlist}));render()}}catch{message(text('genericError'),true)}}));
    content.querySelector('#recommendationForm')?.addEventListener('submit',async event=>{event.preventDefault();if(!featureSchemaReady)return;const data=new FormData(event.currentTarget),consent=data.get('consent')==='on',interests=consent?data.getAll('interest'):[];try{const result=await client.from('customer_preferences').upsert({user_id:user.id,recommendations_consent:consent,interests,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(result.error){message(text('genericError'),true);return}if(!consent){const cleared=await client.from('customer_interactions').delete().eq('user_id',user.id);if(cleared.error){message(text('genericError'),true);return}}await loadData();message(text('recSaved'));render()}catch{message(text('genericError'),true)}});
    content.querySelector('#productAlertForm')?.addEventListener('submit',async event=>{event.preventDefault();const data=new FormData(event.currentTarget);const priceText=String(data.get('target_price')||'').trim();const notifyPrice=data.get('notify_price_drop')==='on',notifyStock=data.get('notify_restock')==='on';if(!data.get('consent')){message(text('alertConsentRequired'),true);return}if(!notifyPrice&&!notifyStock){message(text('alertTypeRequired'),true);return}try{const result=await client.from('product_alerts').upsert({user_id:user.id,product_id:data.get('product_id'),email:user.email,language:language(),target_price:priceText?Number(priceText):null,notify_price_drop:notifyPrice,notify_restock:notifyStock},{onConflict:'user_id,product_id'});if(result.error){message(text('genericError'),true);return}await loadData();message(text('alertSaved'));render()}catch{message(text('genericError'),true)}});
    content.querySelectorAll('[data-alert-remove]').forEach(button=>button.addEventListener('click',async()=>{try{const result=await client.from('product_alerts').delete().eq('user_id',user.id).eq('product_id',button.dataset.alertRemove);if(result.error)message(text('genericError'),true);else{await loadData();render()}}catch{message(text('genericError'),true)}}));
    content.querySelector('#supportForm')?.addEventListener('submit',async event=>{event.preventDefault();const data=new FormData(event.currentTarget);try{const result=await client.from('support_tickets').insert({user_id:user.id,order_id:data.get('order_id')||null,subject:String(data.get('subject')||'').trim(),message:String(data.get('message')||'').trim()});if(result.error){message(text('genericError'),true);return}await loadData();message(text('supportSent'));render()}catch{message(text('genericError'),true)}});
  }

  function localizePage() {
    const lang = language(), copy = window.MelatoniAccountCopy?.[lang] || window.MelatoniAccountCopy?.az;
    if (!copy) return;
    document.documentElement.lang = lang;
    const current = document.querySelector('#langCurrent'); if (current) current.textContent = lang.toUpperCase();
    const title = document.querySelector('[data-account-title]'); if (title) title.textContent = copy.title;
    const subtitle = document.querySelector('[data-account-subtitle]'); if (subtitle) subtitle.textContent = copy.subtitle;
    const keys = {profile:'menuProfile',addresses:'menuAddresses',orders:'menuOrders',wishlist:'menuWishlist',recommendations:'menuRecommendations',alerts:'menuAlerts',support:'menuSupport',logout:'logout'};
    document.querySelectorAll('[data-account-tab]').forEach(button => { button.textContent = copy[keys[button.dataset.accountTab]]; });
    document.querySelectorAll('.main-nav a').forEach((link,index)=>{const labels=lang==='ru'?['Товары','Коллекции','О нас']:lang==='en'?['Products','Collections','About us']:['Məhsullar','Kolleksiyalar','Haqqımızda'];if(labels[index])link.textContent=labels[index]});
  }

  document.querySelectorAll('[data-account-tab]').forEach(button=>button.addEventListener('click',async()=>{const tab=button.dataset.accountTab;if(tab==='logout'){try{if(client)await client.auth.signOut()}catch{}window.location.href='index.html';return}setActiveTab(tab)}));
  document.addEventListener('melatoni:language-change',()=>{localizePage();if(user)render()});
  document.querySelectorAll('.lang-picker [data-lang]').forEach(button=>button.addEventListener('click',()=>{const next=button.dataset.lang;if(!['az','ru','en'].includes(next))return;window.MelatoniStorage?.set('melatoni-language',next);localizePage();if(user)render();document.querySelector('.lang-picker')?.removeAttribute('open')}));
  localizePage();
  if(!client){render();message(text('supabaseMissing'),true);return}
  client.auth.getSession().then(async({data,error})=>{if(error){message(text('genericError'),true);render();return}user=data.session?.user||null;if(user)await loadData();render()});
  client.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;if(user)loadData().then(render);else render()});
})();
