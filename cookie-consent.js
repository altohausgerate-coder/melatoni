(() => {
  'use strict';
  const VERSION = '1.0.0';
  const STORAGE_KEY = 'melatoni-cookie-consent';
  const defaults = { necessary: true, functional: false, analytics: false, marketing: false };
  const callbacks = { functional: new Set(), analytics: new Set(), marketing: new Set() };
  const cleanup = { functional: new Set(), analytics: new Set(), marketing: new Set() };
  const copy = {
    az:{kicker:'MELATONI · RAHAT ALIŞ-VERİŞ',title:'Rahatlığınız üçün çərəz seçimi',intro:'Seçimlərinizi və səbətinizi yadda saxlamaq, saytın daha rahat işləməsinə kömək etmək üçün çərəzlərdən istifadə edirik. Hansı çərəzlərə icazə verəcəyiniz sizə bağlıdır.',cookies:'Çərəz siyasəti',privacy:'Məxfilik',manage:'Seçimləri seç',necessaryOnly:'Yalnız zəruri',accept:'Hamısını qəbul et',dialogTitle:'Çərəz seçimləriniz',close:'Bağla',dialogIntro:'Sayt təcrübənizi idarə etmək üçün çərəz kateqoriyalarını seçin. Zəruri çərəzlər həmişə aktiv qalır.',necessary:'Zəruri çərəzlər',required:'Həmişə aktiv',necessaryDesc:'Saytın təhlükəsiz işləməsi, səbətin, dil seçiminin və əsas funksiyaların qorunması üçün tələb olunur.',functional:'Funksional çərəzlər',functionalDesc:'Dil, region, baxılan məhsullar və digər şəxsi seçimlərinizin yadda saxlanılmasına kömək edir.',analytics:'Analitik çərəzlər',analyticsDesc:'İstifadəçilərin saytla necə qarşılıqlı əlaqə qurduğunu anonim statistika ilə anlamağa kömək edir.',marketing:'Marketinq çərəzləri',marketingDesc:'Maraqlarınıza uyğun reklam və kampaniyaların göstərilməsi üçün istifadə olunur.',reject:'Hamısını rədd et',save:'Seçimləri yadda saxla',preferences:'Çərəz seçimləri'},
    ru:{kicker:'MELATONI · ПРИЯТНЫЕ ПОКУПКИ',title:'Настройки файлов cookie',intro:'Мы используем cookie, чтобы сохранять ваши настройки и корзину и делать сайт удобнее. Вы сами решаете, какие категории разрешить.',cookies:'Политика cookie',privacy:'Конфиденциальность',manage:'Настроить',necessaryOnly:'Только необходимые',accept:'Принять все',dialogTitle:'Ваши настройки cookie',close:'Закрыть',dialogIntro:'Выберите категории cookie. Необходимые файлы всегда активны.',necessary:'Необходимые cookie',required:'Всегда активны',necessaryDesc:'Нужны для безопасной работы сайта, корзины, выбора языка и основных функций.',functional:'Функциональные cookie',functionalDesc:'Помогают сохранять язык, регион, просмотренные товары и другие настройки.',analytics:'Аналитические cookie',analyticsDesc:'Помогают понимать взаимодействие с сайтом с помощью анонимной статистики.',marketing:'Маркетинговые cookie',marketingDesc:'Используются для показа рекламы и предложений с учётом интересов.',reject:'Отклонить все',save:'Сохранить настройки',preferences:'Настройки cookie'},
    en:{kicker:'MELATONI · A COMFORTABLE WAY TO SHOP',title:'Choose your cookie preferences',intro:'We use cookies to remember your preferences and bag and to make the site easier to use. You choose which categories to allow.',cookies:'Cookie policy',privacy:'Privacy',manage:'Manage choices',necessaryOnly:'Necessary only',accept:'Accept all',dialogTitle:'Your cookie preferences',close:'Close',dialogIntro:'Choose cookie categories. Necessary cookies are always on.',necessary:'Necessary cookies',required:'Always active',necessaryDesc:'Required for site security, your bag, language choice, and core features.',functional:'Functional cookies',functionalDesc:'Help remember your language, region, viewed products, and other preferences.',analytics:'Analytics cookies',analyticsDesc:'Help us understand site use through anonymous statistics.',marketing:'Marketing cookies',marketingDesc:'Used to show relevant advertising and offers.',reject:'Reject all',save:'Save choices',preferences:'Cookie preferences'}
  };
  const readConsent = () => {
    try {
      const value = JSON.parse(window.MelatoniStorage?.get(STORAGE_KEY) || 'null');
      return value && value.version === VERSION && value.categories ? value : null;
    } catch (_) { return null; }
  };
  let consent = readConsent();
  const allowed = category => category === 'necessary' || Boolean(consent && consent.categories[category]);
  const notify = () => {
    Object.keys(callbacks).forEach(category => callbacks[category].forEach(fn => {
      if (allowed(category)) { try { fn(); } catch (error) { console.error('Melatoni consent callback:', error); } }
    }));
    window.dispatchEvent(new CustomEvent('melatoni:consent-change', { detail: consent }));
  };
  const save = categories => {
    const previous = consent && consent.categories;
    consent = { version: VERSION, categories: { ...defaults, ...categories, necessary: true }, updatedAt: new Date().toISOString() };
    try { window.MelatoniStorage?.set(STORAGE_KEY, JSON.stringify(consent)); } catch (error) { console.warn('Razılıq yadda saxlanmadı:', error); }
    Object.keys(cleanup).forEach(category => {
      if (previous && previous[category] && !consent.categories[category]) cleanup[category].forEach(fn => { try { fn(); } catch (error) { console.error('Melatoni consent cleanup:', error); } });
    });
    notify();
    banner.hidden = true;
    closeModal(false);
  };
  const shell = document.createElement('div');
  shell.className = 'mc-consent';
  shell.innerHTML = `
    <section class="mc-banner" role="region" aria-labelledby="mc-banner-title" hidden>
      <div class="mc-banner-head"><span class="mc-moon" aria-hidden="true">☾</span><div><p class="mc-banner-kicker" data-consent-copy="kicker"></p><h2 id="mc-banner-title" data-consent-copy="title"></h2></div></div>
      <p><span data-consent-copy="intro"></span> <a href="about.html" data-policy="cookies" data-consent-copy="cookies"></a> · <a href="about.html" data-policy="privacy" data-consent-copy="privacy"></a></p>
      <div class="mc-banner-actions"><button class="mc-button mc-quiet" type="button" data-action="manage" data-consent-copy="manage"></button><button class="mc-button mc-outline" type="button" data-action="reject" data-consent-copy="necessaryOnly"></button><button class="mc-button mc-primary" type="button" data-action="accept" data-consent-copy="accept"></button></div>
    </section>`;
  const layer = document.createElement('div');
  layer.className = 'mc-modal-layer';
  layer.hidden = true;
  layer.innerHTML = `<section class="mc-dialog" role="dialog" aria-modal="true" aria-labelledby="mc-dialog-title" tabindex="-1">
    <div class="mc-dialog-head"><h2 id="mc-dialog-title" data-consent-copy="dialogTitle"></h2><button class="mc-close" type="button" aria-label="Bağla" data-action="close" data-consent-aria="close">×</button></div>
    <p class="mc-dialog-intro" data-consent-copy="dialogIntro"></p>
    <div class="mc-categories">
      <div class="mc-category"><div class="mc-category-copy"><strong data-consent-copy="necessary"></strong><p data-consent-copy="necessaryDesc"></p></div><span class="mc-required-label" data-consent-copy="required"></span></div>
      <div class="mc-category"><div class="mc-category-copy"><strong data-consent-copy="functional"></strong><p data-consent-copy="functionalDesc"></p></div><button class="mc-switch" type="button" role="switch" data-consent-aria="functional" aria-checked="false" data-category="functional"></button></div>
      <div class="mc-category"><div class="mc-category-copy"><strong data-consent-copy="analytics"></strong><p data-consent-copy="analyticsDesc"></p></div><button class="mc-switch" type="button" role="switch" data-consent-aria="analytics" aria-checked="false" data-category="analytics"></button></div>
      <div class="mc-category"><div class="mc-category-copy"><strong data-consent-copy="marketing"></strong><p data-consent-copy="marketingDesc"></p></div><button class="mc-switch" type="button" role="switch" data-consent-aria="marketing" aria-checked="false" data-category="marketing"></button></div>
    </div>
    <div class="mc-modal-actions"><button class="mc-button mc-outline" type="button" data-action="reject" data-consent-copy="reject"></button><button class="mc-button mc-outline" type="button" data-action="save" data-consent-copy="save"></button><button class="mc-button mc-primary" type="button" data-action="accept" data-consent-copy="accept"></button></div>
  </section>`;
  const policyLayer = document.createElement('div');
  policyLayer.className = 'mc-modal-layer'; policyLayer.hidden = true;
  policyLayer.innerHTML = `<section class="mc-dialog" role="dialog" aria-modal="true" aria-labelledby="mc-policy-title" tabindex="-1"><div class="mc-dialog-head"><h2 id="mc-policy-title"></h2><button class="mc-close" type="button" aria-label="Bağla" data-action="policy-close">×</button></div><div class="mc-policy-content" data-policy-content></div><div class="mc-modal-actions"><button class="mc-button mc-primary" type="button" data-action="policy-close">Bağla</button></div></section>`;
  document.body.append(shell, layer, policyLayer);
  const banner = shell.querySelector('.mc-banner');
  const dialog = layer.querySelector('.mc-dialog');
  function renderLanguage(language) { const words=copy[language]||copy.az;document.documentElement.lang=language;document.querySelectorAll('[data-consent-copy]').forEach(node=>{node.textContent=words[node.dataset.consentCopy]||words[ node.dataset.consentCopy ]||''});document.querySelectorAll('[data-consent-aria]').forEach(node=>{const key=node.dataset.consentAria;node.setAttribute('aria-label',key==='close'?words.close:words[key]||'')}); }
  renderLanguage(window.MelatoniStorage?.get('melatoni-language')||document.documentElement.lang||'az');
  document.addEventListener('melatoni:language-change',event=>renderLanguage(event.detail));
  window.addEventListener('storage',event=>{if(event.key==='melatoni-language')renderLanguage(event.newValue||'az')});
  let returnFocus = null;
  const setToggles = categories => layer.querySelectorAll('[data-category]').forEach(toggle => toggle.setAttribute('aria-checked', String(Boolean(categories[toggle.dataset.category]))));
  const focusable = root => [...root.querySelectorAll('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')];
  function openModal(opener) { returnFocus = opener || document.activeElement; setToggles(consent ? consent.categories : defaults); layer.hidden = false; dialog.focus(); }
  function closeModal(restore = true) { if (layer.hidden) return; layer.hidden = true; if (restore && returnFocus && returnFocus.isConnected) returnFocus.focus(); }
  const policyCopy = {
    az:{cookies:{title:'Çərəz siyasəti',html:'<p>Bu siyasət Melatoni saytında istifadə olunan çərəz kateqoriyalarını izah edir. Zəruri çərəzlər səbət və dil seçimi kimi əsas funksiyaları təmin edir. Digər kateqoriyalar yalnız seçiminiz aktiv olduqda işləyir.</p><h3>Seçimlərin idarə olunması</h3><p>Seçiminizi səhifənin aşağı hissəsindəki “Çərəz seçimləri” keçidindən istənilən vaxt dəyişə bilərsiniz.</p>'},privacy:{title:'Məxfilik siyasəti',html:'<p>Sayt sifariş sorğularını və əsas funksiyaları təmin etmək üçün daxil etdiyiniz məlumatları emal edə bilər. Bu demo sifarişləri WhatsApp-a yönləndirir; məlumatlarınız göndərilməzdən əvvəl cihazınızda hazırlanır.</p><h3>Çərəz seçimləri</h3><p>Analitika və marketinq kateqoriyaları ilkin olaraq bağlıdır. Razılığınızı çərəz seçimlərindən dəyişə bilərsiniz.</p>'}},
    ru:{cookies:{title:'Политика cookie',html:'<p>Здесь описаны категории cookie на сайте Melatoni. Необходимые cookie обеспечивают основные функции, например корзину и выбор языка. Остальные категории работают, только если вы их разрешили.</p><h3>Управление настройками</h3><p>Вы можете в любое время изменить выбор через ссылку «Настройки cookie» внизу страницы.</p>'},privacy:{title:'Политика конфиденциальности',html:'<p>Сайт может обрабатывать данные, которые вы вводите для запроса заказа и основных функций. Демо-сайт направляет заказ в WhatsApp; сообщение готовится на вашем устройстве до отправки.</p><h3>Настройки cookie</h3><p>Аналитические и маркетинговые категории выключены по умолчанию. Вы можете изменить настройки cookie в любое время.</p>'}},
    en:{cookies:{title:'Cookie policy',html:'<p>This policy explains the cookie categories used on Melatoni. Necessary cookies provide core features such as your bag and language choice. Other categories run only when you allow them.</p><h3>Managing your choices</h3><p>You can change your choice at any time using the “Cookie preferences” link at the bottom of the page.</p>'},privacy:{title:'Privacy policy',html:'<p>The site may process information you enter to support order enquiries and core features. This demo sends orders to WhatsApp; your message is prepared on your device before you send it.</p><h3>Cookie preferences</h3><p>Analytics and marketing categories are off by default. You can change your cookie choices at any time.</p>'}}
  };
  function openPolicy(kind, opener) { const item = (policyCopy[document.documentElement.lang]||policyCopy.az)[kind]; if (!item) return; returnFocus = opener; policyLayer.querySelector('#mc-policy-title').textContent = item.title; policyLayer.querySelector('[data-policy-content]').innerHTML = item.html; policyLayer.hidden = false; policyLayer.querySelector('.mc-dialog').focus(); }
  function closePolicy() { policyLayer.hidden = true; if (returnFocus && returnFocus.isConnected) returnFocus.focus(); }
  function addFooterLink() {
    let footer = document.querySelector('footer');
    if (!footer) { footer = document.createElement('footer'); footer.className = 'mc-product-footer'; const main = document.querySelector('main'); if (main) main.after(footer); else document.body.append(footer); footer.innerHTML='<span>© <span data-current-year></span> MELATONI — THE ART OF SLEEP</span>'; }
    const target = footer.querySelector('.footer-bottom') || footer.querySelector('.contact-footer-brand')?.parentElement || footer;
    const slot = document.createElement('span'); slot.className = 'mc-footer-slot';
    slot.innerHTML = '<button class="mc-footer-link" type="button" data-action="preferences">Çərəz seçimləri</button>';
    target.append(slot);
  }
  addFooterLink();
  if (!consent) banner.hidden = false;
  else notify();
  document.addEventListener('click', event => {
    const policy = event.target.closest('[data-policy]');
    if (policy) { event.preventDefault(); openPolicy(policy.dataset.policy, policy); return; }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'manage') openModal(event.target);
    if (action === 'accept') save({ necessary: true, functional: true, analytics: true, marketing: true });
    if (action === 'reject') save(defaults);
    if (action === 'save') {
      const categories = { ...defaults };
      layer.querySelectorAll('[data-category]').forEach(toggle => { categories[toggle.dataset.category] = toggle.getAttribute('aria-checked') === 'true'; });
      save(categories);
    }
    if (action === 'close') closeModal();
    if (action === 'policy-close') closePolicy();
    if (action === 'preferences') { banner.hidden = true; openModal(event.target); }
  });
  layer.addEventListener('click', event => { const toggle = event.target.closest('[data-category]'); if (toggle) toggle.setAttribute('aria-checked', String(toggle.getAttribute('aria-checked') !== 'true')); if (event.target === layer) closeModal(); });
  policyLayer.addEventListener('click', event => { if (event.target === policyLayer) closePolicy(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { if (!policyLayer.hidden) closePolicy(); else closeModal(); }
    if (event.key !== 'Tab') return;
    const activeLayer = !policyLayer.hidden ? policyLayer.querySelector('.mc-dialog') : (!layer.hidden ? dialog : null);
    if (!activeLayer) return;
    const controls = focusable(activeLayer); if (!controls.length) return;
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === activeLayer)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.MelatoniConsent = Object.freeze({
    version: VERSION,
    has: allowed,
    get: () => consent ? JSON.parse(JSON.stringify(consent)) : null,
    on(category, callback, onRevoke) { if (!callbacks[category] || typeof callback !== 'function') return () => {}; callbacks[category].add(callback); if (typeof onRevoke === 'function') cleanup[category].add(onRevoke); if (allowed(category)) callback(); return () => { callbacks[category].delete(callback); if (onRevoke) cleanup[category].delete(onRevoke); }; }
  });
})();
