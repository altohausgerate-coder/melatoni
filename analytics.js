(() => {
  const allowedEvents = new Set(['page_view','view_item_list','view_item','add_to_cart','remove_from_cart','view_cart','begin_checkout','add_shipping_info','add_payment_info','purchase','search','sign_up','login','generate_lead','contact_form_submit','whatsapp_click','telegram_click','phone_click']);
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
  const denied = { ad_storage:'denied', analytics_storage:'denied', ad_user_data:'denied', ad_personalization:'denied', functionality_storage:'denied', personalization_storage:'denied', security_storage:'granted' };
  window.gtag('consent','default',denied);
  let loaded = false;
  let analyticsReady = false;
  let marketingReady = false;
  const cookies = ['_ga','_gid','_gat','_gcl_au'];
  const revoke = () => {
    window.gtag('consent','update',denied);
    for (const key of cookies) document.cookie=`${key}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
  };
  function loadContainer() {
    if (loaded || !/^GTM-[A-Z0-9]+$/.test(window.MELATONI_GTM_ID || '')) return;
    loaded = true;
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(window.MELATONI_GTM_ID)}`;
    document.head.append(script);
  }
  const allowed = () => Boolean(window.MelatoniConsent?.has('analytics') || window.MelatoniConsent?.has('marketing'));
  function applyConsent() {
    const analytics = Boolean(window.MelatoniConsent?.has('analytics'));
    const marketing = Boolean(window.MelatoniConsent?.has('marketing'));
    window.gtag('consent','update',{
      analytics_storage:analytics?'granted':'denied',
      ad_storage:marketing?'granted':'denied',
      ad_user_data:marketing?'granted':'denied',
      ad_personalization:marketing?'granted':'denied',
      functionality_storage:window.MelatoniConsent?.has('functional')?'granted':'denied',
      personalization_storage:window.MelatoniConsent?.has('functional')?'granted':'denied',
      security_storage:'granted'
    });
    if (allowed()) loadContainer();
    if (analytics && !analyticsReady) { analyticsReady = true; window.dataLayer.push({event:'melatoni_analytics_consent_ready'}); window.dataLayer.push({event:'page_view',page_location:`${location.origin}${location.pathname}`,page_title:document.title}); }
    if (!analytics) analyticsReady = false;
    if (marketing && !marketingReady) { marketingReady = true; window.dataLayer.push({event:'melatoni_marketing_consent_ready'}); }
    if (!marketing) marketingReady = false;
  }
  window.MelatoniConsent?.on('analytics',applyConsent,revoke);
  window.MelatoniConsent?.on('marketing',applyConsent,revoke);
  window.MelatoniConsent?.on('functional',applyConsent,revoke);
  window.addEventListener('melatoni:consent-change',applyConsent);

  const product = id => (window.MELATONI_PRODUCTS || []).find(item => item?.id === id) || null;
  const itemData = (id, qty = 1) => {
    const item=product(id); if(!item)return null;
    const rawPrice=Number(item.salePrice ?? item.sale_price ?? item.price)||0;
    const name=typeof item.name==='object'?item.name[document.documentElement.lang]||item.name.az||id:item.name||id;
    return {item_id:id,item_name:name,item_category:item.category,price:rawPrice,quantity:qty};
  };
  const ecommerce = (name, params = {}) => {
    if (!allowedEvents.has(name) || !window.MelatoniConsent?.has('analytics')) return;
    const redact=value=>{if(Array.isArray(value))return value.map(redact);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!/^(email|phone|address|user_id|customer_name|customer_email|customer_phone|contact_name|message)$/i.test(key)).map(([key,item])=>[key,redact(item)]));return value};
    const safeParams=redact(params);
    window.dataLayer.push({ecommerce:null});
    const ecommerceEvent=['view_item_list','view_item','add_to_cart','remove_from_cart','view_cart','begin_checkout','add_shipping_info','add_payment_info','purchase'].includes(name);
    window.dataLayer.push(ecommerceEvent?{event:name,ecommerce:safeParams}:{event:name,...safeParams});
  };
  const idFromPage=()=>new URL(location.href).searchParams.get('id');
  const cart=()=>{try{return JSON.parse(window.MelatoniStorage?.get('melatoni-cart')||'[]')}catch{return[]}};
  const cartItems=()=>cart().map(line=>itemData(line.id,Number(line.qty)||1)).filter(Boolean);
  const page=location.pathname.split('/').pop()||'index.html';
  if(page==='products.html'){
    const list=(window.MELATONI_PRODUCTS||[]).map(item=>itemData(item.id)).filter(Boolean).slice(0,100);
    if(list.length)ecommerce('view_item_list',{item_list_id:'melatoni_catalog',item_list_name:'Məhsullar',items:list});
  }
  if(page==='product.html'){
    const item=itemData(idFromPage()); if(item)ecommerce('view_item',{currency:'AZN',value:item.price,items:[item]});
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('a,button'); if(!target)return;
    const href=target.getAttribute('href')||'';
    if(href.startsWith('https://wa.me/'))ecommerce('whatsapp_click',{link_url:'whatsapp'});
    else if(/^tel:/i.test(href))ecommerce('phone_click',{link_url:'phone'});
    else if(/t\.me\//i.test(href))ecommerce('telegram_click',{link_url:'telegram'});
    if(target.matches('.bag-toggle,.bag-shortcut,[href*="#bag"]')){
      const items=cartItems(); if(items.length)ecommerce('view_cart',{currency:'AZN',value:items.reduce((sum,item)=>sum+item.price*item.quantity,0),items});
    }
    if(target.matches('#cartOrder')){
      const items=cartItems(); ecommerce('begin_checkout',{currency:'AZN',value:items.reduce((sum,item)=>sum+item.price*item.quantity,0),items});
      if(items.length)ecommerce('add_shipping_info',{currency:'AZN',value:items.reduce((sum,item)=>sum+item.price*item.quantity,0),shipping_tier:'standard_delivery',items});
    }
    const add=target.closest('[data-add],[data-add-to-bag],#detailAdd');
    if(add){const id=add.dataset.add||add.dataset.addToBag||idFromPage();const item=itemData(id);if(item)ecommerce('add_to_cart',{currency:'AZN',value:item.price*item.quantity,items:[item]});}
    const remove=target.closest('[data-remove],[data-cart-remove]');
    if(remove){const itemId=remove.dataset.remove||remove.dataset.cartRemove||remove.dataset.id;const item=itemData(itemId);if(item)ecommerce('remove_from_cart',{currency:'AZN',value:item.price,items:[item]});}
  });
  let searchTimer;
  document.querySelectorAll('input[type="search"],#searchInput,[name="search"]').forEach(input=>input.addEventListener('input',()=>{
    clearTimeout(searchTimer); searchTimer=setTimeout(()=>ecommerce('search',{search_term:'site_search'}),900);
  }));
  document.querySelectorAll('form').forEach(form=>form.addEventListener('submit',()=>{
    if(form.matches('#contactForm,.contact-form,[data-contact-form]')){ecommerce('contact_form_submit',{form_name:'contact'});ecommerce('generate_lead',{method:'contact_form'});}
  }));
  window.MelatoniAnalytics=Object.freeze({track:ecommerce,item:itemData});
})();
