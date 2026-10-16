(() => {
  const client = window.MELATONI_SUPABASE;
  const status = document.querySelector('#adminStatus');
  const login = document.querySelector('#adminLogin');
  const workspace = document.querySelector('#adminWorkspace');
  const logout = document.querySelector('#adminLogout');
  const list = document.querySelector('#adminProductList');
  const form = document.querySelector('#adminProductForm');
  const orderList = document.querySelector('#adminOrdersList');
  const analytics = document.querySelector('#analyticsBreakdown');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[char]);
  const say = (message, error = false) => { if (!status) return; status.textContent = message; status.classList.toggle('is-error', error); };
  const value = (name, item) => { const input = form.elements.namedItem(name); if (input) input.value = item || ''; };
  const languageValue = (item, lang) => typeof item === 'object' && item ? item[lang] || '' : '';
  const money = amount => `${new Intl.NumberFormat('az-AZ',{maximumFractionDigits:2}).format(Number(amount)||0)} AZN`;
  const orderStatus = { pending:'Gözləyir', confirmed:'Təsdiqlənib', shipping:'Çatdırılır', delivered:'Çatdırılıb', cancelled:'Ləğv edilib' };
  const orderStatuses = Object.keys(orderStatus);
  const orderItems = items => Array.isArray(items) ? items.map(item => `${escape(item.name || item.id || 'Məhsul')} × ${Math.max(1,Number(item.qty)||1)}${item.size ? ` · ${escape(item.size)}` : ''}`).join(' · ') : '';
  let products = [];
  let newOrders = 0;
  let channel = null;

  function showLogin(message = 'Admin hesabı ilə daxil olun.') {
    workspace.hidden = true;
    logout.hidden = true;
    login.hidden = false;
    say(message);
  }
  async function authorize(user) {
    if (!user) return showLogin('Admin hesabı ilə daxil olun.');
    try {
      const { data, error } = await client.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
      if (error) return showLogin('İdarəetmə sxemi tətbiq edilməyib. Supabase miqrasiyasını işə salın.');
      if (!data?.is_admin) return showLogin('Bu hesab üçün admin icazəsi yoxdur.');
      login.hidden = true;
      workspace.hidden = false;
      logout.hidden = false;
      say('Admin panelinə xoş gəlmisiniz.');
      await Promise.all([loadProducts(), loadOrders(), loadAnalytics()]);
      subscribeOrders();
    } catch { showLogin('Supabase ilə əlaqə qurulmadı. İnterneti yoxlayıb yenidən cəhd edin.'); }
  }
  async function currentUser() {
    if (!client) return showLogin('Supabase bağlantısı hazır deyil. Konfiqurasiyanı yoxlayın.');
    try {
      const { data, error } = await client.auth.getUser();
      if (data?.user) return await authorize(data.user);
      if (error?.name === 'AuthSessionMissingError' || !error) return showLogin('Admin hesabı ilə daxil olun.');
      return showLogin('Hesab yoxlanmadı. Yenidən daxil olun.');
    }
    catch { showLogin('Supabase ilə əlaqə qurulmadı.'); }
  }
  async function loadProducts() {
    const { data, error } = await client.from('products').select('*').order('category').order('id');
    if (error) { say('Məhsul siyahısı yüklənmədi. Admin icazəsini və sxemi yoxlayın.', true); return; }
    products = data || [];
    document.querySelector('#metricProducts').textContent = products.length;
    list.innerHTML = products.length ? products.map(product => `<article class="admin-product-row"><img src="${escape(product.image_url)}" alt="" loading="lazy"><div><strong>${escape(languageValue(product.name,'az') || product.id)}</strong><small>${escape(product.category)} · ${money(product.price)} · Anbar: ${product.stock_quantity ?? '—'}${product.is_active ? '' : ' · Gizli'}</small></div><button type="button" data-edit-product="${escape(product.id)}">Dəyiş</button></article>`).join('') : '<p class="admin-empty">Kataloqda məhsul yoxdur.</p>';
  }
  function fillProduct(product) {
    form.reset();
    form.elements.namedItem('original_id').value = product?.id || '';
    value('id',product?.id); value('category',product?.category || 'linen');
    ['az','ru','en'].forEach(lang => { value(`name_${lang}`,languageValue(product?.name,lang)); value(`desc_${lang}`,languageValue(product?.description,lang)); value(`material_${lang}`,languageValue(product?.material,lang)); });
    value('price',product?.price); value('sale_price',product?.sale_price); value('stock',product?.stock_quantity);
    form.elements.namedItem('is_active').checked = product?.is_active !== false;
    document.querySelector('#productFormTitle').textContent = product ? `Dəyiş: ${languageValue(product.name,'az') || product.id}` : 'Yeni məhsul';
    document.querySelector('#imageCurrent').textContent = product?.image_url || 'JPG, PNG, WEBP və ya AVIF · 5 MB-a qədər';
  }
  async function saveProduct(event) {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]'); button.disabled = true;
    try {
      const data = new FormData(form);
      const id = String(data.get('id') || '').trim().toLowerCase();
      if (!/^[a-z0-9-]+$/.test(id)) { say('ID yalnız kiçik hərf, rəqəm və defisdən ibarət olsun.', true); return; }
      const previousId = String(data.get('original_id') || '');
      let imageUrl = products.find(product => product.id === previousId)?.image_url || '';
      const file = data.get('image_file');
      if (file instanceof File && file.size) {
        if (file.size > 5 * 1024 * 1024) { say('Şəkil 5 MB-dan kiçik olmalıdır.', true); return; }
        const extension = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'') || 'jpg';
        const path = `${id}/${Date.now()}.${extension}`;
        const { error: uploadError } = await client.storage.from('melatoni-products').upload(path,file,{upsert:true,contentType:file.type,cacheControl:'3600'});
        if (uploadError) { say('Şəkil yüklənmədi. Storage bucket və admin icazəsini yoxlayın.', true); return; }
        imageUrl = client.storage.from('melatoni-products').getPublicUrl(path).data.publicUrl;
      }
      const multilingual = key => Object.fromEntries(['az','ru','en'].map(lang => [lang,String(data.get(`${key}_${lang}`)||'').trim()]));
      const price = Number(data.get('price'));
      const saleValue = String(data.get('sale_price')||'').trim();
      const salePrice = saleValue ? Number(saleValue) : null;
      if (!Number.isFinite(price) || price < 0 || (salePrice !== null && (!Number.isFinite(salePrice)||salePrice<0||salePrice>=price))) { say('Qiymət və endirimli qiyməti yoxlayın.',true); return; }
      const stockRaw = String(data.get('stock') || '').trim();
      const row = { id, category:data.get('category'), name:multilingual('name'), description:multilingual('desc'), material:multilingual('material'), price, sale_price:salePrice, image_url:imageUrl, stock_quantity:stockRaw ? Math.max(0,Math.floor(Number(stockRaw))) : null, is_active:data.get('is_active')==='on', updated_at:new Date().toISOString() };
      const { error } = await client.from('products').upsert(row,{onConflict:'id'});
      if (error) { say('Məhsul yadda saxlanmadı. Məlumatları və admin icazəsini yoxlayın.',true); return; }
      if (previousId && previousId !== id) await client.from('products').delete().eq('id',previousId);
      say('Məhsul yadda saxlandı.'); form.reset(); fillProduct(null); await loadProducts();
    } catch { say('Məhsul yadda saxlanmadı. Yenidən cəhd edin.',true); }
    finally { button.disabled = false; }
  }
  async function loadOrders() {
    const { data, error } = await client.from('orders').select('id,user_id,items,total,language,status,created_at').order('created_at',{ascending:false}).limit(100);
    if (error) { orderList.innerHTML = '<p class="admin-empty">Sifarişlər yüklənmədi. Admin icazəsini yoxlayın.</p>'; return; }
    const rows = data || [];
    document.querySelector('#metricOrders').textContent = rows.length;
    orderList.innerHTML = rows.length ? rows.map(order => `<article class="admin-order"><div><strong>${new Date(order.created_at).toLocaleString('az-AZ')} · ${money(order.total)}</strong><p>${orderItems(order.items)}</p><small>${escape(order.user_id)}</small></div><div class="admin-order-controls"><select aria-label="Sifariş statusu" data-order-status="${order.id}">${orderStatuses.map(value => `<option value="${value}" ${value===order.status?'selected':''}>${orderStatus[value]}</option>`).join('')}</select><button class="admin-order-action" data-save-order="${order.id}" type="button">Yadda saxla</button></div></article>`).join('') : '<p class="admin-empty">Hələ sifariş yoxdur.</p>';
    newOrders = 0; const badge = document.querySelector('#newOrderCount'); badge.hidden = true; badge.textContent = '';
  }
  async function loadAnalytics() {
    const since = new Date(Date.now()-30*24*60*60*1000).toISOString();
    const { data, error } = await client.from('storefront_events').select('event_name,product_id,created_at').gte('created_at',since).order('created_at',{ascending:false}).limit(5000);
    if (error) { analytics.innerHTML = '<p class="admin-empty">Analitika yüklənmədi. Miqrasiyanın tətbiq olunduğunu yoxlayın.</p>'; return; }
    const rows = data || [], counts = new Map(), productsById = new Map(products.map(item => [item.id,item]));
    rows.forEach(row => { counts.set(row.event_name,(counts.get(row.event_name)||0)+1); if (row.product_id && ['product_view','product_click'].includes(row.event_name)) counts.set(`product:${row.product_id}`,(counts.get(`product:${row.product_id}`)||0)+1); });
    document.querySelector('#metricViews').textContent = (counts.get('page_view')||0)+(counts.get('product_view')||0);
    const top = [...counts.entries()].filter(([key])=>key.startsWith('product:')).sort((a,b)=>b[1]-a[1])[0];
    document.querySelector('#metricTopProduct').textContent = top ? languageValue(productsById.get(top[0].slice(8))?.name,'az') || top[0].slice(8) : '—';
    const labels = { page_view:'Səhifə baxışı', product_view:'Məhsul baxışı', product_click:'Məhsula klik', add_to_cart:'Səbətə əlavə', search:'Axtarış', wishlist_add:'İstək siyahısı', order_created:'Sifariş' };
    analytics.innerHTML = Object.keys(labels).map(key=>`<article class="analytics-event"><strong>${counts.get(key)||0}</strong><span>${labels[key]}</span></article>`).join('') + (top ? `<div class="analytics-top"><h3>Ən çox baxılan məhsullar</h3><ol>${[...counts.entries()].filter(([key])=>key.startsWith('product:')).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([key,count])=>`<li>${escape(languageValue(productsById.get(key.slice(8))?.name,'az')||key.slice(8))} · ${count}</li>`).join('')}</ol></div>` : '');
  }
  function subscribeOrders() {
    if (channel) client.removeChannel(channel);
    channel = client.channel('melatoni-admin-order-notices').on('postgres_changes',{event:'INSERT',schema:'public',table:'orders'},()=>{
      newOrders += 1; const badge = document.querySelector('#newOrderCount'); badge.hidden = false; badge.textContent = newOrders;
      say('Yeni sifariş daxil oldu.'); if (!document.querySelector('[data-admin-panel="orders"]').hidden) loadOrders();
    }).subscribe();
  }
  document.querySelector('#adminLoginForm')?.addEventListener('submit',async event=>{
    event.preventDefault(); if (!client) return say('Supabase bağlantısı hazır deyil.',true);
    const data = new FormData(event.currentTarget); const button = event.currentTarget.querySelector('button'); button.disabled = true;
    try { const {data:session,error}=await client.auth.signInWithPassword({email:String(data.get('email')||'').trim(),password:String(data.get('password')||'')}); if(error) say('E-poçt və ya şifrə yanlışdır.',true); else await authorize(session.user); }
    catch { say('Daxil olmaq mümkün olmadı. Yenidən cəhd edin.',true); } finally { button.disabled = false; event.currentTarget.reset(); }
  });
  logout?.addEventListener('click',async()=>{try{await client?.auth.signOut()}catch{} showLogin('Hesabdan təhlükəsiz çıxış edildi.');});
  form?.addEventListener('submit',saveProduct);
  document.querySelector('#newProduct')?.addEventListener('click',()=>fillProduct(null));
  document.querySelector('#cancelProductEdit')?.addEventListener('click',()=>fillProduct(null));
  list?.addEventListener('click',event=>{const button=event.target.closest('[data-edit-product]');if(button)fillProduct(products.find(product=>product.id===button.dataset.editProduct));});
  orderList?.addEventListener('click',async event=>{const button=event.target.closest('[data-save-order]');if(!button)return;const select=orderList.querySelector(`[data-order-status="${CSS.escape(button.dataset.saveOrder)}"]`);button.disabled=true;try{const {error}=await client.from('orders').update({status:select.value}).eq('id',button.dataset.saveOrder);say(error?'Sifariş statusu dəyişmədi.':'Sifariş statusu yadda saxlandı.',!!error);if(!error)await loadOrders()}catch{say('Sifariş statusu dəyişmədi.',true)}finally{button.disabled=false}});
  document.querySelector('#refreshOrders')?.addEventListener('click',loadOrders);
  document.querySelector('#refreshAnalytics')?.addEventListener('click',loadAnalytics);
  document.querySelector('.admin-tabs')?.addEventListener('click',event=>{const button=event.target.closest('[data-admin-tab]');if(!button)return;document.querySelectorAll('[data-admin-tab]').forEach(item=>item.classList.toggle('is-active',item===button));document.querySelectorAll('[data-admin-panel]').forEach(panel=>panel.hidden=panel.dataset.adminPanel!==button.dataset.adminTab);if(button.dataset.adminTab==='orders')loadOrders();if(button.dataset.adminTab==='analytics')loadAnalytics()});
  document.addEventListener('melatoni:catalog-updated',event=>{if(!Array.isArray(event.detail))return;products=event.detail;loadProducts()});
  if (client) client.auth.onAuthStateChange((_event,session)=>{if(!session?.user)showLogin('Admin hesabı ilə daxil olun.')});
  currentUser();
})();
