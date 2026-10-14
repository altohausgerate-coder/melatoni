(() => {
  'use strict';
  const VERSION = '1.0.0';
  const STORAGE_KEY = 'melatoni-cookie-consent';
  const defaults = { necessary: true, functional: false, analytics: false, marketing: false };
  const callbacks = { functional: new Set(), analytics: new Set(), marketing: new Set() };
  const cleanup = { functional: new Set(), analytics: new Set(), marketing: new Set() };
  const readConsent = () => {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
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
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(consent)); } catch (error) { console.warn('Razılıq yadda saxlanmadı:', error); }
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
      <div class="mc-banner-head"><span class="mc-moon" aria-hidden="true">☾</span><div><p class="mc-banner-kicker">MELATONI · RAHAT ALIŞ-VERİŞ</p><h2 id="mc-banner-title">Rahatlığınız üçün çərəz seçimi</h2></div></div>
      <p>Seçimlərinizi və səbətinizi yadda saxlamaq, saytın daha rahat işləməsinə kömək etmək üçün çərəzlərdən istifadə edirik. Hansı çərəzlərə icazə verəcəyiniz sizə bağlıdır. <a href="#" data-policy="cookies">Çərəz siyasəti</a> · <a href="#" data-policy="privacy">Məxfilik</a></p>
      <div class="mc-banner-actions"><button class="mc-button mc-quiet" type="button" data-action="manage">Seçimləri seç</button><button class="mc-button mc-outline" type="button" data-action="reject">Yalnız zəruri</button><button class="mc-button mc-primary" type="button" data-action="accept">Hamısını qəbul et</button></div>
    </section>`;
  const layer = document.createElement('div');
  layer.className = 'mc-modal-layer';
  layer.hidden = true;
  layer.innerHTML = `<section class="mc-dialog" role="dialog" aria-modal="true" aria-labelledby="mc-dialog-title" tabindex="-1">
    <div class="mc-dialog-head"><h2 id="mc-dialog-title">Çərəz seçimləriniz</h2><button class="mc-close" type="button" aria-label="Bağla" data-action="close">×</button></div>
    <p class="mc-dialog-intro">Sayt təcrübənizi idarə etmək üçün çərəz kateqoriyalarını seçin. Zəruri çərəzlər həmişə aktiv qalır.</p>
    <div class="mc-categories">
      <div class="mc-category"><div class="mc-category-copy"><strong>Zəruri çərəzlər</strong><p>Saytın təhlükəsiz işləməsi, səbətin, dil seçiminin və əsas funksiyaların qorunması üçün tələb olunur.</p></div><span class="mc-required-label">Həmişə aktiv</span></div>
      <div class="mc-category"><div class="mc-category-copy"><strong>Funksional çərəzlər</strong><p>Dil, region, baxılan məhsullar və digər şəxsi seçimlərinizin yadda saxlanılmasına kömək edir.</p></div><button class="mc-switch" type="button" role="switch" aria-label="Funksional çərəzlər" aria-checked="false" data-category="functional"></button></div>
      <div class="mc-category"><div class="mc-category-copy"><strong>Analitik çərəzlər</strong><p>İstifadəçilərin saytla necə qarşılıqlı əlaqə qurduğunu anonim statistik məlumatlar vasitəsilə anlamağımıza kömək edir.</p></div><button class="mc-switch" type="button" role="switch" aria-label="Analitik çərəzlər" aria-checked="false" data-category="analytics"></button></div>
      <div class="mc-category"><div class="mc-category-copy"><strong>Marketinq çərəzləri</strong><p>Maraqlarınıza uyğun reklam və kampaniyaların göstərilməsi, həmçinin reklam nəticələrinin ölçülməsi üçün istifadə olunur.</p></div><button class="mc-switch" type="button" role="switch" aria-label="Marketinq çərəzləri" aria-checked="false" data-category="marketing"></button></div>
    </div>
    <div class="mc-modal-actions"><button class="mc-button mc-outline" type="button" data-action="reject">Bütününü rədd et</button><button class="mc-button mc-outline" type="button" data-action="save">Seçimləri yadda saxla</button><button class="mc-button mc-primary" type="button" data-action="accept">Hamısını qəbul et</button></div>
  </section>`;
  const policyLayer = document.createElement('div');
  policyLayer.className = 'mc-modal-layer'; policyLayer.hidden = true;
  policyLayer.innerHTML = `<section class="mc-dialog" role="dialog" aria-modal="true" aria-labelledby="mc-policy-title" tabindex="-1"><div class="mc-dialog-head"><h2 id="mc-policy-title"></h2><button class="mc-close" type="button" aria-label="Bağla" data-action="policy-close">×</button></div><div class="mc-policy-content" data-policy-content></div><div class="mc-modal-actions"><button class="mc-button mc-primary" type="button" data-action="policy-close">Bağla</button></div></section>`;
  document.body.append(shell, layer, policyLayer);
  const banner = shell.querySelector('.mc-banner');
  const dialog = layer.querySelector('.mc-dialog');
  let returnFocus = null;
  const setToggles = categories => layer.querySelectorAll('[data-category]').forEach(toggle => toggle.setAttribute('aria-checked', String(Boolean(categories[toggle.dataset.category]))));
  const focusable = root => [...root.querySelectorAll('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')];
  function openModal(opener) { returnFocus = opener || document.activeElement; setToggles(consent ? consent.categories : defaults); layer.hidden = false; dialog.focus(); }
  function closeModal(restore = true) { if (layer.hidden) return; layer.hidden = true; if (restore && returnFocus && returnFocus.isConnected) returnFocus.focus(); }
  const policyCopy = {
    cookies: { title: 'Çərəz Siyasəti', html: `<p>Bu mətn Melatoni saytında istifadə olunan çərəz kateqoriyalarını izah edir. Zəruri çərəzlər səbət və dil seçimi kimi əsas funksiyaları təmin edir. Funksional, analitik və marketinq çərəzləri yalnız seçiminiz aktiv olduqda işə salınır.</p><h3>Seçimlərin idarə olunması</h3><p>Seçiminizi bu səhifənin aşağı hissəsindəki “Çərəz seçimləri” keçidindən istənilən vaxt dəyişə bilərsiniz. Seçim və yenilənmə vaxtı bu brauzerdə saxlanılır.</p><h3>Əlaqə və siyasət sahibi</h3><p>Bu səhifədə operatorun rəsmi hüquqi adı və əlaqə məlumatları layihə sahibi tərəfindən əlavə edilməlidir.</p>` },
    privacy: { title: 'Məxfilik Siyasəti', html: `<p>Melatoni saytı sifariş sorğularını və saytın əsas funksiyalarını təmin etmək üçün istifadəçi tərəfindən daxil edilən məlumatları emal edə bilər. Bu demo sayt sifarişləri WhatsApp-a yönləndirir; formaya yazdığınız məlumatlar göndərilmədən əvvəl sizin cihazınızda hazırlanır.</p><h3>Çərəz seçimləri</h3><p>Analitika və marketinq kateqoriyaları ilkin olaraq bağlıdır və razılıq olmadan aktivləşdirilmir. Razılığınızı “Çərəz seçimləri” keçidindən dəyişə bilərsiniz.</p><h3>Əlaqə və siyasət sahibi</h3><p>Rəsmi operator adı, məlumatların saxlanma müddəti və məxfilik sorğuları üçün əlaqə kanalı layihə sahibi tərəfindən təsdiqlənərək əlavə edilməlidir.</p>` }
  };
  function openPolicy(kind, opener) { const item = policyCopy[kind]; if (!item) return; returnFocus = opener; policyLayer.querySelector('#mc-policy-title').textContent = item.title; policyLayer.querySelector('[data-policy-content]').innerHTML = item.html; policyLayer.hidden = false; policyLayer.querySelector('.mc-dialog').focus(); }
  function closePolicy() { policyLayer.hidden = true; if (returnFocus && returnFocus.isConnected) returnFocus.focus(); }
  function addFooterLink() {
    let footer = document.querySelector('footer');
    if (!footer) { footer = document.createElement('footer'); footer.className = 'mc-product-footer'; const main = document.querySelector('main'); if (main) main.after(footer); else document.body.append(footer); }
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
