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
  const supportList = document.querySelector('#adminSupportList');
  const alertList = document.querySelector('#adminAlertsList');
  const orderPushButton = document.querySelector('#enableOrderPush');
  const orderPushStatus = document.querySelector('#orderPushStatus');
  const orderRefreshButton = document.querySelector('#refreshOrders');
  let orderPushUserId = null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[char]);
  const say = (message, error = false) => { if (!status) return; status.textContent = message; status.classList.toggle('is-error', error); };
  const value = (name, item) => { const input = form.elements.namedItem(name); if (input) input.value = item || ''; };
  const languageValue = (item, lang) => typeof item === 'object' && item ? item[lang] || '' : '';
  const money = amount => `${new Intl.NumberFormat('az-AZ',{maximumFractionDigits:2}).format(Number(amount)||0)} AZN`;
  const orderStatus = { pending:'Gözləyir', confirmed:'Təsdiqlənib', shipping:'Çatdırılır', delivered:'Çatdırılıb', cancelled:'Ləğv edilib' };
  const orderStatuses = Object.keys(orderStatus);
  const adminLang = () => window.MelatoniStorage?.get('melatoni-language') || 'az';
  const adminCopy = {
    az:{views:'Baxış',sold:'Satılan məhsul',revenue:'Təsdiqli dövriyyə',abandoned:'Sifarişsiz səbət sessiyası · təxmini',cartAdds:'Səbətə əlavə',cartRemoves:'Səbətdən çıxarılan',recommendations:'Razılıqlı maraq siqnalları',supportEmpty:'Dəstək müraciəti yoxdur.',alertEmpty:'Məhsul bildirişi yoxdur.',subject:'Mövzu',reply:'Cavab',save:'Yadda saxla',open:'Açıq',progress:'Baxılır',answered:'Cavablandırılıb',closed:'Bağlanıb',price:'Qiymət düşəndə',stock:'Stoka qayıdanda',recent:'Son bildiriş',mailUnavailable:'Məhsul yadda saxlandı, amma e-poçt bildirişi göndərilmədi. Poçt xidməti qurulmayıb.',tabSupport:'Dəstək müraciətləri',tabAlerts:'Məhsul bildirişləri',supportEyebrow:'MÜŞTƏRİ XİDMƏTİ',supportTitle:'Dəstək müraciətləri',alertsEyebrow:'MƏHSUL ABUNƏLİKLƏRİ',alertsTitle:'Qiymət və stok bildirişləri',refresh:'Yenilə ↻',emailNote:'E-poçt çatdırılması üçün Supabase Edge Function və poçt xidməti qoşulmalıdır.',orders30:'Sifariş sayı · 30 gün',confirmed:'Təsdiqlənmiş sifariş',pageView:'Səhifə baxışı',productView:'Məhsul baxışı',productClick:'Məhsula klik',checkout:'Sifarişə keçid',search:'Axtarış',wishlist:'İstək siyahısı',orderEvent:'Sifariş',topViewed:'Ən çox baxılan',topSold:'Ən çox satılan',salesDynamics:'Satış dinamikası · 7 gün',topAdded:'Ən çox səbətə əlavə edilən',topRemoved:'Ən çox səbətdən çıxarılan',noSales:'Hələ satış məlumatı yoxdur.',supportLoadError:'Dəstək müraciətləri yüklənmədi. Miqrasiyanı yoxlayın.',alertsLoadError:'Məhsul bildirişləri yüklənmədi. Miqrasiyanı yoxlayın.',ticketSaved:'Cavab və status yadda saxlandı.',ticketError:'Dəstək cavabı yadda saxlanmadı.',orderLabel:'Sifariş'},
    ru:{views:'Просмотры',sold:'Продано товаров',revenue:'Подтверждённый оборот',abandoned:'Сессии с корзиной без заказа · оценка',cartAdds:'Добавлено в корзину',cartRemoves:'Удалено из корзины',recommendations:'Сигналы интереса с согласием',supportEmpty:'Обращений нет.',alertEmpty:'Уведомлений о товарах нет.',subject:'Тема',reply:'Ответ',save:'Сохранить',open:'Открыто',progress:'В работе',answered:'Ответ отправлен',closed:'Закрыто',price:'Снижение цены',stock:'Поступление',recent:'Последнее уведомление',mailUnavailable:'Товар сохранён, но письмо не отправлено. Почтовый сервис не настроен.',tabSupport:'Обращения в поддержку',tabAlerts:'Уведомления о товарах',supportEyebrow:'ПОДДЕРЖКА КЛИЕНТОВ',supportTitle:'Обращения в поддержку',alertsEyebrow:'ПОДПИСКИ НА ТОВАРЫ',alertsTitle:'Уведомления о цене и наличии',refresh:'Обновить ↻',emailNote:'Для отправки писем подключите Supabase Edge Function и почтовый сервис.',orders30:'Заказов · 30 дней',confirmed:'Подтверждённые заказы',pageView:'Просмотры страниц',productView:'Просмотры товаров',productClick:'Переходы к товару',checkout:'Переход к заказу',search:'Поиск',wishlist:'Избранное',orderEvent:'Заказы',topViewed:'Чаще просматривают',topSold:'Чаще покупают',salesDynamics:'Продажи · 7 дней',topAdded:'Чаще добавляют в корзину',topRemoved:'Чаще удаляют из корзины',noSales:'Данных о продажах пока нет.',supportLoadError:'Не удалось загрузить обращения. Проверьте миграцию.',alertsLoadError:'Не удалось загрузить уведомления. Проверьте миграцию.',ticketSaved:'Ответ и статус сохранены.',ticketError:'Не удалось сохранить ответ.',orderLabel:'Заказ'},
    en:{views:'Views',sold:'Units sold',revenue:'Confirmed revenue',abandoned:'Cart sessions without an order · estimated',cartAdds:'Added to cart',cartRemoves:'Removed from cart',recommendations:'Consented interest signals',supportEmpty:'No support requests.',alertEmpty:'No product alerts.',subject:'Subject',reply:'Reply',save:'Save',open:'Open',progress:'In progress',answered:'Answered',closed:'Closed',price:'Price drop',stock:'Back in stock',recent:'Last notification',mailUnavailable:'Product saved, but the email was not sent. Email delivery is not configured.',tabSupport:'Support requests',tabAlerts:'Product alerts',supportEyebrow:'CUSTOMER CARE',supportTitle:'Support requests',alertsEyebrow:'PRODUCT SUBSCRIPTIONS',alertsTitle:'Price and stock alerts',refresh:'Refresh ↻',emailNote:'Connect the Supabase Edge Function and an email provider to deliver emails.',orders30:'Orders · 30 days',confirmed:'Confirmed orders',pageView:'Page views',productView:'Product views',productClick:'Product clicks',checkout:'Checkout starts',search:'Searches',wishlist:'Wishlist additions',orderEvent:'Orders',topViewed:'Most viewed',topSold:'Best sellers',salesDynamics:'Sales · 7 days',topAdded:'Most added to cart',topRemoved:'Most removed from cart',noSales:'No sales data yet.',supportLoadError:'Could not load support requests. Check the migration.',alertsLoadError:'Could not load product alerts. Check the migration.',ticketSaved:'Reply and status saved.',ticketError:'Could not save the support reply.',orderLabel:'Order'}
  };
  Object.assign(adminCopy.az, {tabCampaigns:'Kampaniya bildirişləri',campaignEyebrow:'MÜŞTƏRİ BİLDİRİŞLƏRİ',campaignTitle:'Kampaniya push bildirişi',campaignIntro:'Bildiriş yalnız bu cihazda push almağa özü razılıq vermiş müştərilərə gedəcək.',campaignName:'Başlıq',campaignMessage:'Qısa mesaj',campaignLink:'Sayt daxili keçid',campaignSend:'Bildirişi göndər',campaignSetup:'Çatdırılma üçün push xidməti qurulmalıdır.',campaignSent:'Bildiriş razılıq vermiş müştərilərə göndərildi.',campaignFailed:'Bildirişi göndərmək alınmadı. Push xidməti qurulub-qurulmadığını yoxlayın.'});
  Object.assign(adminCopy.ru, {tabCampaigns:'Уведомления об акциях',campaignEyebrow:'УВЕДОМЛЕНИЯ КЛИЕНТАМ',campaignTitle:'Push-уведомление об акции',campaignIntro:'Уведомление получат только клиенты, которые сами включили push на этом устройстве.',campaignName:'Заголовок',campaignMessage:'Короткое сообщение',campaignLink:'Внутренняя ссылка сайта',campaignSend:'Отправить уведомление',campaignSetup:'Для доставки нужно настроить push-сервис.',campaignSent:'Уведомление отправлено подписавшимся клиентам.',campaignFailed:'Не удалось отправить уведомление. Проверьте настройки push-сервиса.'});
  Object.assign(adminCopy.en, {tabCampaigns:'Campaign notices',campaignEyebrow:'CUSTOMER NOTICES',campaignTitle:'Campaign push notification',campaignIntro:'Only customers who opted in to push on this device will receive the notice.',campaignName:'Title',campaignMessage:'Short message',campaignLink:'Internal site link',campaignSend:'Send notification',campaignSetup:'Push delivery must be configured first.',campaignSent:'Notification sent to opted-in customers.',campaignFailed:'Could not send the notification. Check push setup.'});
  const at = key => adminCopy[adminLang()]?.[key] || adminCopy.az[key] || key;
  function localizeAdmin() {
    document.documentElement.lang = adminLang();
    document.querySelectorAll('[data-admin-copy]').forEach(node=>{node.textContent=at(node.dataset.adminCopy)});
    const summary=document.querySelector('#adminLanguageSummary');if(summary)summary.textContent=adminLang().toUpperCase();
  }
  const orderItems = items => Array.isArray(items) ? items.map(item => {
    const name=languageValue(item.name,adminLang())||item.name||item.id||'Məhsul';
    const options=[item.color?`Rəng: ${item.color}`:'',item.size?`Ölçü: ${item.size}`:'',item.unit_price!=null?money(item.unit_price):''].filter(Boolean);
    return `<li><span>${escape(name)} × ${Math.max(1,Number(item.qty)||1)}</span>${options.length?`<small>${options.map(escape).join(' · ')}</small>`:''}</li>`;
  }).join('') : '';
  let products = [];
  let newOrders = 0;
  let channel = null;

  function showLogin(message = 'Admin hesabı ilə daxil olun.') {
    workspace.hidden = true;
    logout.hidden = true;
    login.hidden = false;
    say(message);
  }
  async function refreshOrderPushState() {
    if (!orderPushButton || !orderPushStatus) return;
    const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isInstalled = navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (isIos && !isInstalled) {
      orderPushButton.disabled = true;
      orderPushButton.textContent = 'Ana ekrana əlavə edin';
      orderPushStatus.textContent = 'iPhone-da sifariş bildirişləri üçün Safari-də Paylaş düyməsinə basın, “Ana ekrana əlavə et” seçin və admin panelini həmin ikonadan açın.';
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      orderPushButton.disabled = true;
      orderPushButton.textContent = 'Bildiriş dəstəklənmir';
      orderPushStatus.textContent = 'Bu brauzer push bildirişlərini dəstəkləmir. Saytı dəstəklənən brauzerdə açın.';
      return;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration(new URL('./', location.href).href);
      const subscription = await registration?.pushManager.getSubscription();
      orderPushButton.disabled = Boolean(subscription);
      orderPushButton.textContent = subscription ? 'Bu cihaz aktivdir' : 'Bu cihazda bildirişləri aktiv et';
      orderPushStatus.textContent = subscription
        ? 'Bu cihaz yeni sifarişlər üçün bildiriş alacaq.'
        : 'Yeni sifariş bildirişlərini almaq üçün bu cihazda icazə verin.';
    } catch {
      orderPushButton.disabled = false;
      orderPushButton.textContent = 'Bildirişləri yenidən yoxla';
      orderPushStatus.textContent = 'Bildiriş statusu yoxlanmadı. Səhifəni yeniləyib bir daha yoxlayın.';
    }
  }
  function activateAdminTab(name) {
    const button = document.querySelector(`[data-admin-tab="${CSS.escape(name)}"]`);
    if (!button) return;
    document.querySelectorAll('[data-admin-tab]').forEach(item => {
      item.classList.toggle('is-active', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    });
    document.querySelectorAll('[data-admin-panel]').forEach(panel => { panel.hidden = panel.dataset.adminPanel !== name; });
    if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
    button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    if (name === 'orders') { loadOrders(); refreshOrderPushState(); }
    if (name === 'analytics') loadAnalytics();
    if (name === 'support') loadSupportTickets();
    if (name === 'alerts') loadProductAlerts();
  }
  orderPushButton?.addEventListener('click', async () => {
    if (!orderPushUserId || !window.MelatoniPush) return say('Bildiriş xidməti hazır deyil.', true);
    orderPushButton.disabled = true;
    try {
      await window.MelatoniPush.subscribe(orderPushUserId);
      if (orderPushStatus) orderPushStatus.textContent = 'Bu cihaz yeni sifarişlər üçün aktiv edildi.';
      orderPushButton.textContent = 'Bu cihaz aktivdir';
      say('Sifariş bildirişləri bu cihazda aktiv edildi.');
    } catch (error) {
      const message = error?.message === 'ios-install'
        ? 'iPhone-da əvvəlcə Paylaş → Ana ekrana əlavə et seçin, sonra saytı həmin ikonadan açıb yenidən aktiv edin.'
        : error?.message === 'blocked'
          ? 'Bildiriş icazəsi bloklanıb. Brauzer ayarlarından Melatoni bildirişlərini aktiv edin.'
          : error?.message === 'unsupported'
            ? 'Bu brauzer push bildirişlərini dəstəkləmir.'
            : error?.message === 'permission'
              ? 'Bildiriş icazəsi verilmədi. Brauzer ayarlarından Melatoni bildirişlərini aktiv edin.'
              : error?.message === 'unavailable'
                ? 'Bildiriş xidməti hazır deyil. Saytı yeniləyin və bir daha cəhd edin.'
                : error?.message === 'save'
                  ? 'Bildiriş icazəsi verildi, amma cihaz qeydə alınmadı. İnterneti yoxlayıb yenidən cəhd edin.'
                  : 'Bildiriş aktiv olmadı. İnterneti yoxlayıb yenidən cəhd edin.';
      if (orderPushStatus) orderPushStatus.textContent = message;
      orderPushButton.disabled = false;
      say(message, true);
    }
  });
  async function authorize(user) {
    if (!user) return showLogin('Admin hesabı ilə daxil olun.');
    try {
      const { data, error } = await client.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
      if (error) return showLogin('İdarəetmə sxemi tətbiq edilməyib. Supabase miqrasiyasını işə salın.');
      if (!data?.is_admin) return showLogin('Bu hesab üçün admin icazəsi yoxdur.');
      orderPushUserId = user.id;
      login.hidden = true;
      workspace.hidden = false;
      logout.hidden = false;
      say('Admin panelinə xoş gəlmisiniz.');
      await loadProducts();
      await Promise.all([loadOrders(), loadAnalytics(), loadSupportTickets(), loadProductAlerts()]);
      subscribeOrders();
      const requestedTab = location.hash.slice(1);
      if (requestedTab && document.querySelector(`[data-admin-tab="${CSS.escape(requestedTab)}"]`)) activateAdminTab(requestedTab);
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
      const previousProduct = products.find(product => product.id === previousId) || null;
      let imageUrl = previousProduct?.image_url || '';
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
      let notificationPending = false;
      if (previousProduct && previousId === id) {
        const oldPrice = Number(previousProduct.sale_price ?? previousProduct.price);
        const newPrice = Number(row.sale_price ?? row.price);
        const oldStock = previousProduct.stock_quantity;
        const newStock = row.stock_quantity;
        const priceDropped = Number.isFinite(oldPrice) && newPrice < oldPrice;
        const restocked = oldStock !== null && oldStock !== undefined && Number(oldStock) === 0 && Number(newStock) > 0;
        if (priceDropped || restocked) {
          try {
            const result = await client.functions.invoke('product-alerts',{body:{product_id:id,previous_price:oldPrice,previous_stock:oldStock}});
            notificationPending = !!result.error || result.data?.configured === false || Number(result.data?.failed) > 0;
          } catch { notificationPending = true; }
        }
      }
      say(notificationPending ? at('mailUnavailable') : 'Məhsul yadda saxlandı.'); form.reset(); fillProduct(null); await loadProducts();
    } catch { say('Məhsul yadda saxlanmadı. Yenidən cəhd edin.',true); }
    finally { button.disabled = false; }
  }
  async function loadOrders() {
    if (!client || !orderList) return false;
    orderList.innerHTML = '<p class="admin-empty">Sifarişlər yüklənir…</p>';
    try {
      const { data, error } = await client.from('orders').select('id,user_id,items,total,language,status,created_at').order('created_at',{ascending:false}).limit(100);
      if (error) throw error;
      const rows = data || [];
      const userIds=[...new Set(rows.map(order=>order.user_id).filter(Boolean))];
      let customers=new Map();
      let profileError=false;
      if(userIds.length){
        const profileResult=await client.from('profiles').select('id,full_name,phone').in('id',userIds);
        if(!profileResult.error)customers=new Map((profileResult.data||[]).map(profile=>[profile.id,profile]));
        else profileError=true;
      }
      document.querySelector('#metricOrders').textContent = rows.length;
      orderList.innerHTML = rows.length ? rows.map(order => {
        const customer=customers.get(order.user_id)||{};
        const phone=String(customer.phone||'').trim();
        const phoneLink=phone.replace(/[^\d+]/g,'');
        const orderNumber=`ML-${String(order.id).replace(/-/g,'').slice(0,8).toUpperCase()}`;
        const items=orderItems(order.items);
        return `<article class="admin-order"><div class="admin-order-info"><header class="admin-order-heading"><strong>${orderNumber}</strong><time datetime="${escape(order.created_at)}">${escape(new Date(order.created_at).toLocaleString('az-AZ'))}</time><b>${money(order.total)}</b></header><div class="admin-order-customer"><strong>${escape(customer.full_name||'Ad qeyd edilməyib')}</strong>${phoneLink?`<a href="tel:${escape(phoneLink)}">${escape(phone)}</a>`:`<span>${profileError?'Müştəri məlumatı yüklənmədi':'Telefon nömrəsi profildə yoxdur'}</span>`}</div><ul class="admin-order-items">${items||'<li>Məhsul məlumatı yoxdur</li>'}</ul></div><div class="admin-order-controls"><select aria-label="${orderNumber} sifarişinin statusu" data-order-status="${escape(order.id)}">${orderStatuses.map(value => `<option value="${value}" ${value===order.status?'selected':''}>${orderStatus[value]}</option>`).join('')}</select><button class="admin-order-action" data-save-order="${escape(order.id)}" type="button">Yadda saxla</button></div></article>`;
      }).join('') : '<p class="admin-empty">Hələ sifariş yoxdur.</p>';
      newOrders = 0; const badge = document.querySelector('#newOrderCount'); badge.hidden = true; badge.textContent = '';
      return true;
    } catch {
      orderList.innerHTML = '<p class="admin-empty is-error">Sifarişlər yüklənmədi. İnterneti və admin icazəsini yoxlayın.</p>';
      return false;
    }
  }
  async function loadAnalytics() {
    const since = new Date(Date.now()-30*24*60*60*1000).toISOString();
    const [eventResult,orderResult,interactionResult] = await Promise.all([
      client.from('storefront_events').select('event_name,product_id,session_id,created_at').gte('created_at',since).order('created_at',{ascending:false}).limit(10000),
      client.from('orders').select('items,total,status,created_at').gte('created_at',since).order('created_at',{ascending:false}).limit(5000),
      client.from('customer_interactions').select('product_id,event_name').gte('created_at',since).limit(10000)
    ]);
    if (eventResult.error || orderResult.error) { analytics.innerHTML = `<p class="admin-empty">${escape(adminLang()==='ru'?'Не удалось загрузить аналитику. Проверьте миграцию.':adminLang()==='en'?'Could not load analytics. Check the migration.':'Analitika yüklənmədi. Miqrasiyanın tətbiq olunduğunu yoxlayın.')}</p>`; return; }
    const rows=eventResult.data||[], orderRows=orderResult.data||[], interactionRows=interactionResult.error?[]:(interactionResult.data||[]);
    const counts=new Map(), views=new Map(), adds=new Map(), removed=new Map(), sold=new Map(), revenueByDay=new Map(), addSessions=new Set(), orderSessions=new Set();
    const productsById=new Map(products.map(item=>[item.id,item]));
    rows.forEach(row=>{counts.set(row.event_name,(counts.get(row.event_name)||0)+1);if(row.product_id&&row.event_name==='product_view')views.set(row.product_id,(views.get(row.product_id)||0)+1);if(row.product_id&&row.event_name==='add_to_cart')adds.set(row.product_id,(adds.get(row.product_id)||0)+1);if(row.product_id&&row.event_name==='cart_removed')removed.set(row.product_id,(removed.get(row.product_id)||0)+1);if(row.session_id&&row.event_name==='add_to_cart')addSessions.add(row.session_id);if(row.session_id&&['order_created','checkout_started'].includes(row.event_name))orderSessions.add(row.session_id)});
    let revenue=0,confirmedOrders=0,units=0;
    orderRows.forEach(order=>{
      const date=new Date(order.created_at).toLocaleDateString('az-AZ',{day:'2-digit',month:'2-digit'});
      if(['confirmed','shipping','delivered'].includes(order.status)){revenue+=Number(order.total)||0;confirmedOrders+=1;revenueByDay.set(date,(revenueByDay.get(date)||0)+(Number(order.total)||0));(Array.isArray(order.items)?order.items:[]).forEach(item=>{const qty=Math.max(0,Number(item.qty)||0);if(!item.id)return;sold.set(item.id,(sold.get(item.id)||0)+qty);units+=qty})}
    });
    const topView=[...views.entries()].sort((a,b)=>b[1]-a[1])[0], topSold=[...sold.entries()].sort((a,b)=>b[1]-a[1])[0];
    const viewsTotal=(counts.get('page_view')||0)+(counts.get('product_view')||0);
    document.querySelector('#metricViews').textContent=viewsTotal;
    document.querySelector('#metricTopProduct').textContent=topView?languageValue(productsById.get(topView[0])?.name,'az')||topView[0]:'—';
    const labels={page_view:at('pageView'),product_view:at('productView'),product_click:at('productClick'),add_to_cart:at('cartAdds'),cart_removed:at('cartRemoves'),checkout_started:at('checkout'),search:at('search'),wishlist_add:at('wishlist'),order_created:at('orderEvent')};
    const topList=entries=>entries.slice(0,8).map(([id,count])=>`<li>${escape(languageValue(productsById.get(id)?.name,'az')||id)} · ${count}</li>`).join('')||'<li>—</li>';
    const maxRevenue=Math.max(1,...revenueByDay.values());
    const chart=[...revenueByDay.entries()].reverse().slice(-7).map(([day,total])=>`<div class="admin-sales-day"><span>${escape(day)}</span><div class="admin-sales-bar"><i style="width:${Math.max(2,Math.round(total/maxRevenue*100))}%"></i></div><span>${money(total)}</span></div>`).join('')||`<p class="admin-empty">${at('noSales')}</p>`;
    const personalized=interactionRows.reduce((sum,row)=>sum+(row.event_name==='view'?1:0),0);
    const abandoned=[...addSessions].filter(session=>!orderSessions.has(session)).length;
    analytics.innerHTML=Object.keys(labels).map(key=>`<article class="analytics-event"><strong>${counts.get(key)||0}</strong><span>${labels[key]}</span></article>`).join('')+
      `<div class="admin-report-grid"><article><strong>${orderRows.length}</strong><span>${at('orders30')}</span></article><article><strong>${confirmedOrders}</strong><span>${at('confirmed')}</span></article><article><strong>${money(revenue)}</strong><span>${at('revenue')}</span></article><article><strong>${units}</strong><span>${at('sold')}</span></article><article><strong>${counts.get('add_to_cart')||0}</strong><span>${at('cartAdds')}</span></article><article><strong>${counts.get('cart_removed')||0}</strong><span>${at('cartRemoves')}</span></article><article><strong>${abandoned}</strong><span>${at('abandoned')}</span></article><article><strong>${personalized}</strong><span>${at('recommendations')}</span></article></div>`+
      `<div class="admin-report-columns"><section><h3>${at('topViewed')}</h3><ol>${topList([...views.entries()].sort((a,b)=>b[1]-a[1]))}</ol></section><section><h3>${at('topSold')}</h3><ol>${topList([...sold.entries()].sort((a,b)=>b[1]-a[1]))}</ol></section><section><h3>${at('salesDynamics')}</h3><div class="admin-sales-chart">${chart}</div></section><section><h3>${at('topAdded')}</h3><ol>${topList([...adds.entries()].sort((a,b)=>b[1]-a[1]))}</ol></section><section><h3>${at('topRemoved')}</h3><ol>${topList([...removed.entries()].sort((a,b)=>b[1]-a[1]))}</ol></section></div>`;
  }

  async function loadSupportTickets() {
    if (!supportList) return;
    const {data,error}=await client.from('support_tickets').select('id,user_id,order_id,subject,message,status,admin_reply,created_at').order('created_at',{ascending:false}).limit(200);
    if(error){supportList.innerHTML=`<p class="admin-empty">${at('supportLoadError')}</p>`;return}
    const statuses={open:at('open'),in_progress:at('progress'),answered:at('answered'),closed:at('closed')};
    supportList.innerHTML=(data||[]).length?(data||[]).map(ticket=>`<article class="admin-support-card" data-ticket="${escape(ticket.id)}"><header><strong>${escape(ticket.subject)}</strong><small>${escape(new Date(ticket.created_at).toLocaleString('az-AZ'))} · ${escape(ticket.user_id)}</small></header><p>${escape(ticket.message)}</p>${ticket.order_id?`<small>Sifariş: ${escape(ticket.order_id)}</small>`:''}<label>${at('reply')}<textarea data-ticket-reply>${escape(ticket.admin_reply||'')}</textarea></label><div class="admin-support-actions"><select data-ticket-status aria-label="Müraciətin statusu">${Object.entries(statuses).map(([key,label])=>`<option value="${key}" ${ticket.status===key?'selected':''}>${escape(label)}</option>`).join('')}</select><button type="button" class="admin-order-action" data-save-ticket="${escape(ticket.id)}">${at('save')}</button></div></article>`).join(''):`<p class="admin-empty">${at('supportEmpty')}</p>`;
  }

  async function loadProductAlerts() {
    if (!alertList) return;
    const {data,error}=await client.from('product_alerts').select('user_id,product_id,email,target_price,notify_price_drop,notify_restock,last_notified_at,created_at').order('created_at',{ascending:false}).limit(300);
    if(error){alertList.innerHTML=`<p class="admin-empty">${at('alertsLoadError')}</p>`;return}
    alertList.innerHTML=(data||[]).length?(data||[]).map(item=>`<article class="admin-alert-card"><strong>${escape(languageValue(products.find(product=>product.id===item.product_id)?.name,adminLang())||item.product_id)}</strong><p>${escape(item.email)} · ${item.notify_price_drop?at('price'):''}${item.notify_price_drop&&item.notify_restock?' · ':''}${item.notify_restock?at('stock'):''}${item.target_price!=null?` · ≤ ${money(item.target_price)}`:''}</p><small>${at('recent')}: ${item.last_notified_at?escape(new Date(item.last_notified_at).toLocaleString('az-AZ')):'—'}</small></article>`).join(''):`<p class="admin-empty">${at('alertEmpty')}</p>`;
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
  orderRefreshButton?.addEventListener('click',async()=>{if(orderRefreshButton.disabled)return;const label=orderRefreshButton.textContent;orderRefreshButton.disabled=true;orderRefreshButton.textContent='Yenilənir…';const loaded=await loadOrders();orderRefreshButton.disabled=false;orderRefreshButton.textContent=label;say(loaded?'Sifarişlər yeniləndi.':'Sifarişlər yenilənmədi.',!loaded)});
  document.querySelector('#refreshAnalytics')?.addEventListener('click',loadAnalytics);
  document.querySelector('#refreshSupport')?.addEventListener('click',loadSupportTickets);
  document.querySelector('#refreshAlerts')?.addEventListener('click',loadProductAlerts);
  document.querySelector('#campaignPushForm')?.addEventListener('submit',async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button[type="submit"]');button.disabled=true;try{const data=new FormData(event.currentTarget);const result=await client.functions.invoke('send-campaign-push',{body:{title:String(data.get('title')||'').trim(),body:String(data.get('body')||'').trim(),url:String(data.get('url')||'products.html').trim()}});if(result.error||result.data?.error)say(at('campaignFailed'),true);else say(`${at('campaignSent')} (${result.data?.sent||0})`)}catch{say(at('campaignFailed'),true)}finally{button.disabled=false}});
  supportList?.addEventListener('click',async event=>{const button=event.target.closest('[data-save-ticket]');if(!button)return;const card=button.closest('[data-ticket]'),reply=card.querySelector('[data-ticket-reply]'),statusSelect=card.querySelector('[data-ticket-status]');button.disabled=true;try{const replyText=String(reply.value||'').trim();const result=await client.from('support_tickets').update({admin_reply:replyText,status:statusSelect.value,replied_at:replyText?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',button.dataset.saveTicket);say(result.error?'Dəstək cavabı yadda saxlanmadı.':'Cavab və status yadda saxlandı.',!!result.error);if(!result.error)await loadSupportTickets()}catch{say('Dəstək cavabı yadda saxlanmadı.',true)}finally{button.disabled=false}});
  document.querySelector('.admin-tabs')?.addEventListener('click',event=>{const button=event.target.closest('[data-admin-tab]');if(button)activateAdminTab(button.dataset.adminTab)});
  window.addEventListener('hashchange',()=>{const name=location.hash.slice(1);if(document.querySelector(`[data-admin-tab="${CSS.escape(name)}"]`)&&!workspace.hidden)activateAdminTab(name)});
  document.querySelectorAll('.admin-language-options [data-lang]').forEach(button=>button.addEventListener('click',()=>{const next=button.dataset.lang;if(!['az','ru','en'].includes(next))return;window.MelatoniStorage?.set('melatoni-language',next);localizeAdmin();document.querySelector('.admin-language-picker')?.removeAttribute('open');loadAnalytics();loadSupportTickets();loadProductAlerts()}));
  localizeAdmin();
  document.addEventListener('melatoni:catalog-updated',event=>{if(!Array.isArray(event.detail))return;products=event.detail;loadProducts()});
  if (client) client.auth.onAuthStateChange((_event,session)=>{if(!session?.user)showLogin('Admin hesabı ilə daxil olun.')});
  currentUser();
})();
