(() => {
  'use strict';

  const layer = document.querySelector('#personalizeLayer');
  if (!layer) return;

  const dialog = layer.querySelector('.personalize-dialog');
  const interestStep = layer.querySelector('[data-personalize-step="interests"]');
  const detailsStep = layer.querySelector('[data-personalize-step="details"]');
  const interests = [...layer.querySelectorAll('[data-interest]')];
  const interestTitle = layer.querySelector('#personalizeTitle');
  const interestDescription = layer.querySelector('#personalizeInterestDescription');
  const PROFILE_KEY = 'melatoni-shop-profile';
  const SHOWN_KEY = 'melatoni-profile-prompt-shown-v2';
  const consentApi = window.MelatoniConsent;
  const language = () => ['az', 'ru', 'en'].includes(window.MelatoniStorage?.get('melatoni-language'))
    ? window.MelatoniStorage?.get('melatoni-language')
    : document.documentElement.lang?.slice(0, 2) || 'az';

  const copy = {
    az: {
      eyebrow: 'MELATONI · SİZƏ ÖZƏL',
      back: 'Geri', interestTitle: 'Ən çox nə ilə maraqlanırsınız?', interestIntro: 'Bir və ya bir neçə seçim edin. Tövsiyələriniz buna uyğun sıralanacaq.',
      all: 'Hamısı', linen: 'Yataq dəstləri', pillow: 'Yastıqlar', duvet: 'Yorğanlar', bedcare: 'Döşək və qoruyucular', sleepwear: 'Ev geyimi', bath: 'Hamam tekstili', accessory: 'Aksesuarlar',
      submit: 'Mənə uyğun məhsulları göstər', privacy: 'Seçimləriniz bu brauzerdə saxlanılır. İstənilən vaxt yeniləyə bilərsiniz.', close: 'Pəncərəni bağla',
      preferences: 'Şəxsi seçimlərim',
      headingPersonal: 'Sizin üçün seçildi', headingPopular: 'Bu həftə populyar',
      nextDetails: 'Məhsul seçimlərini dəqiqləşdir', detailsTitle: 'Rahatlığınızı bir az da dəqiqləşdirin.', detailsIntro: 'Cavablarınız uyğun məhsulları seçməyə və sıralamağa kömək edəcək.',
      warmthTitle: 'Yuxuda hansı temperatur sizə rahatdır?', fabricTitle: 'Yataq dəstində hansı toxunuşu sevirsiniz?', pillowTitle: 'Yastıqda hansı xüsusiyyət sizə uyğundur?', budgetTitle: 'Bir məhsul üçün büdcəniz',
      cool: 'Sərin', balanced: 'Balanslı', warm: 'İsti', crisp: 'Sərin və xırtıldayan', smooth: 'İpək kimi hamar', breathable: 'Nəfəs alan pambıq', soft: 'Yumşaq dəstək', neck: 'Boyun dəstəyi', light: 'Yüngül dolğu', under100: '100 AZN-dək', under200: '200 AZN-dək', noLimit: 'Məhdudiyyət yoxdur',
    },
    ru: {
      eyebrow: 'MELATONI · ДЛЯ ВАС',
      back: 'Назад', interestTitle: 'Что вас интересует?', interestIntro: 'Выберите одну или несколько категорий — рекомендации будут отсортированы по ним.',
      all: 'Все товары', linen: 'Постельное бельё', pillow: 'Подушки', duvet: 'Одеяла', bedcare: 'Матрасы и защита', sleepwear: 'Домашняя одежда', bath: 'Текстиль для ванной', accessory: 'Аксессуары',
      submit: 'Показать товары для меня', privacy: 'Настройки хранятся в этом браузере. Их можно изменить в любое время.', close: 'Закрыть окно',
      preferences: 'Мои предпочтения',
      headingPersonal: 'Подобрано для вас', headingPopular: 'Популярное на этой неделе',
      nextDetails: 'Уточнить подбор', detailsTitle: 'Уточним ваши предпочтения.', detailsIntro: 'Ваши ответы помогут выбрать и расставить подходящие товары.',
      warmthTitle: 'Какая температура комфортна во сне?', fabricTitle: 'Какую фактуру постельного белья вы предпочитаете?', pillowTitle: 'Что важно в подушке?', budgetTitle: 'Бюджет на один товар',
      cool: 'Прохладно', balanced: 'Умеренно', warm: 'Тепло', crisp: 'Прохладная и хрустящая', smooth: 'Шёлковистая и гладкая', breathable: 'Дышащий хлопок', soft: 'Мягкая поддержка', neck: 'Поддержка шеи', light: 'Лёгкий наполнитель', under100: 'До 100 AZN', under200: 'До 200 AZN', noLimit: 'Без ограничений',
    },
    en: {
      eyebrow: 'MELATONI · JUST FOR YOU',
      back: 'Back', interestTitle: 'What are you looking for?', interestIntro: 'Choose one or more categories to sort your recommendations.',
      all: 'Everything', linen: 'Bed linen', pillow: 'Pillows', duvet: 'Duvets', bedcare: 'Mattresses & protectors', sleepwear: 'Loungewear', bath: 'Bath textiles', accessory: 'Accessories',
      submit: 'Show my recommendations', privacy: 'Your choices stay in this browser. You can update them any time.', close: 'Close window',
      preferences: 'My preferences',
      headingPersonal: 'Picked for you', headingPopular: 'Popular this week',
      nextDetails: 'Refine my preferences', detailsTitle: 'Let’s fine-tune your comfort.', detailsIntro: 'Your answers help us choose and rank relevant products.',
      warmthTitle: 'What temperature feels comfortable while you sleep?', fabricTitle: 'Which bedding feel do you prefer?', pillowTitle: 'What matters most in a pillow?', budgetTitle: 'Budget for one item',
      cool: 'Cool', balanced: 'Balanced', warm: 'Warm', crisp: 'Cool and crisp', smooth: 'Silky and smooth', breathable: 'Breathable cotton', soft: 'Soft support', neck: 'Neck support', light: 'Light filling', under100: 'Up to 100 AZN', under200: 'Up to 200 AZN', noLimit: 'No limit',
    },
  };

  let lastFocus = null;
  let modalOpen = false;
  let waitingForConsent = !consentApi?.get();
  let selectedInterests = new Set(['all']);
  let selectedPreferences = {};

  function text(key) {
    return (copy[language()] || copy.az)[key] || copy.az[key] || '';
  }

  function localize() {
    layer.querySelector('.personalize-eyebrow').textContent = text('eyebrow');
    interestTitle.textContent = text('interestTitle');
    interestDescription.textContent = text('interestIntro');
    layer.querySelector('[data-interest="all"]').textContent = text('all');
    layer.querySelector('[data-interest="linen"]').textContent = text('linen');
    layer.querySelector('[data-interest="pillow"]').textContent = text('pillow');
    layer.querySelector('[data-interest="duvet"]').textContent = text('duvet');
    layer.querySelector('[data-interest="bedcare"]').textContent = text('bedcare');
    layer.querySelector('[data-interest="sleepwear"]').textContent = text('sleepwear');
    layer.querySelector('[data-interest="bath"]').textContent = text('bath');
    layer.querySelector('[data-interest="accessory"]').textContent = text('accessory');
    layer.querySelector('[data-personalize-submit]').firstChild.textContent = `${text('submit')} `;
    layer.querySelector('.personalize-privacy').textContent = text('privacy');
    layer.querySelector('[data-personalize-next]').firstChild.textContent = `${text('nextDetails')} `;
    layer.querySelector('#personalizeDetailsTitle').textContent = text('detailsTitle');
    layer.querySelector('#personalizeDetailsDescription').textContent = text('detailsIntro');
    layer.querySelector('[data-pref-title="warmth"]').textContent = text('warmthTitle');
    layer.querySelector('[data-pref-title="fabric"]').textContent = text('fabricTitle');
    layer.querySelector('[data-pref-title="pillow"]').textContent = text('pillowTitle');
    layer.querySelector('[data-pref-title="budget"]').textContent = text('budgetTitle');
    const preferenceLabels = { 'warmth:cool':'cool', 'warmth:balanced':'balanced', 'warmth:warm':'warm', 'fabric:crisp':'crisp', 'fabric:smooth':'smooth', 'fabric:breathable':'breathable', 'pillow:soft':'soft', 'pillow:neck':'neck', 'pillow:light':'light', 'budget:100':'under100', 'budget:200':'under200', 'budget:all':'noLimit' };
    layer.querySelectorAll('[data-pref][data-value]').forEach(button => { button.textContent = text(preferenceLabels[`${button.dataset.pref}:${button.dataset.value}`]); });
    layer.querySelector('[data-personalize-close]').setAttribute('aria-label', text('close'));
    const preferencesLink = document.querySelector('[data-personalize-open]');
    if (preferencesLink) preferencesLink.textContent = text('preferences');
  }

  function storedProfile() {
    try {
      const functionalAllowed = Boolean(consentApi?.has('functional'));
      const raw = functionalAllowed
        ? window.MelatoniStorage?.get(PROFILE_KEY)
        : window.MelatoniStorage?.get(PROFILE_KEY,null,'session');
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (!value || !Array.isArray(value.interests)) return null;
      return { interests: value.interests, preferences: value.preferences && typeof value.preferences === 'object' ? value.preferences : {} };
    } catch (_) { return null; }
  }

  function publishProfile(profile) {
    document.dispatchEvent(new CustomEvent('melatoni:profile-ready', { detail: profile }));
  }

  function closePrompt() {
    if (!modalOpen) return;
    modalOpen = false;
    layer.classList.remove('is-open');
    layer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    window.setTimeout(() => { layer.hidden = true; }, 260);
    if (lastFocus?.isConnected && !lastFocus.closest('[hidden]')) lastFocus.focus();
  }

  function openPrompt(force = false) {
    if (modalOpen || (!force && window.MelatoniStorage?.get(SHOWN_KEY,null,'session'))) return;
    const existing = storedProfile();
    if (existing && !force) {
      publishProfile(existing);
    }
    selectedInterests = new Set(existing?.interests?.length ? existing.interests : ['all']);
    selectedPreferences = { ...(existing?.preferences || {}) };
    interests.forEach(button => button.setAttribute('aria-pressed', String(selectedInterests.has(button.dataset.interest))));
    layer.querySelectorAll('[data-pref]').forEach(button => button.setAttribute('aria-pressed', String(selectedPreferences[button.dataset.pref] === button.dataset.value)));
    lastFocus = document.activeElement;
    modalOpen = true;
    layer.hidden = false;
    layer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    interestStep.hidden = false;
    detailsStep.hidden = true;
    dialog.setAttribute('aria-labelledby', interestTitle.id);
    dialog.setAttribute('aria-describedby', interestDescription.id);
    localize();
    requestAnimationFrame(() => {
      layer.classList.add('is-open');
      dialog.focus();
    });
  }

  function showAfterConsent() {
    if (consentApi?.get()) {
      waitingForConsent = false;
      window.setTimeout(openPrompt, 220);
    }
  }

  function moveToDetailsStep() {
    interestStep.hidden = true;
    detailsStep.hidden = false;
    const chosen = selectedInterests.has('all') ? [] : [...selectedInterests];
    layer.querySelector('[data-preference-group="fabric"]').hidden = chosen.length > 0 && !chosen.includes('linen');
    layer.querySelector('[data-preference-group="pillow"]').hidden = chosen.length > 0 && !chosen.includes('pillow');
    layer.querySelector('[data-preference-group="warmth"]').hidden = chosen.length > 0 && !chosen.some(item => ['linen', 'duvet'].includes(item));
    dialog.setAttribute('aria-labelledby', 'personalizeDetailsTitle');
    dialog.setAttribute('aria-describedby', 'personalizeDetailsDescription');
    detailsStep.querySelector('[data-pref]:not([hidden])')?.focus();
  }

  function togglePreference(button) {
    const key = button.dataset.pref;
    const value = button.dataset.value;
    selectedPreferences[key] = selectedPreferences[key] === value ? '' : value;
    layer.querySelectorAll(`[data-pref="${key}"]`).forEach(item => item.setAttribute('aria-pressed', String(selectedPreferences[key] === item.dataset.value)));
  }

  function toggleInterest(button) {
    const value = button.dataset.interest;
    if (value === 'all') {
      selectedInterests = new Set(['all']);
    } else {
      selectedInterests.delete('all');
      if (selectedInterests.has(value)) selectedInterests.delete(value);
      else selectedInterests.add(value);
      if (!selectedInterests.size) selectedInterests.add('all');
    }
    interests.forEach(item => item.setAttribute('aria-pressed', String(selectedInterests.has(item.dataset.interest))));
  }

  function saveProfile() {
    const profile = {
      interests: selectedInterests.has('all') ? [] : [...selectedInterests],
      preferences: Object.fromEntries(Object.entries(selectedPreferences).filter(([, value]) => value)),
      updatedAt: new Date().toISOString(),
    };
    try {
      const target = consentApi?.has('functional') ? 'local' : 'session';
      window.MelatoniStorage?.set(PROFILE_KEY, JSON.stringify(profile), target);
      window.MelatoniStorage?.set(SHOWN_KEY, '1','session');
    } catch (_) { /* Recommendations still work for this page view. */ }
    publishProfile(profile);
    closePrompt();
    window.setTimeout(() => {
      const heading = document.querySelector('#popularTitle');
      heading?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      heading?.focus({ preventScroll: true });
    }, 120);
  }

  layer.addEventListener('click', event => {
    const interestButton = event.target.closest('[data-interest]');
    const preferenceButton = event.target.closest('[data-pref]');
    if (interestButton) toggleInterest(interestButton);
    else if (preferenceButton) togglePreference(preferenceButton);
    else if (event.target.closest('[data-personalize-next]')) moveToDetailsStep();
    else if (event.target.closest('[data-personalize-back-details]')) {
      detailsStep.hidden = true;
      interestStep.hidden = false;
      dialog.setAttribute('aria-labelledby', interestTitle.id);
      dialog.setAttribute('aria-describedby', interestDescription.id);
      layer.querySelector('[data-interest="all"]').focus();
    }
    else if (event.target.closest('[data-personalize-submit]')) saveProfile();
    else if (event.target.closest('[data-personalize-close]') || event.target === layer) {
      window.MelatoniStorage?.set(SHOWN_KEY, '1','session');
      closePrompt();
    }
  });

  document.querySelector('[data-personalize-open]')?.addEventListener('click', () => openPrompt(true));

  document.addEventListener('keydown', event => {
    if (!modalOpen) return;
    if (event.key === 'Escape') {
      window.MelatoniStorage?.set(SHOWN_KEY, '1','session');
      closePrompt();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]):not([hidden])')]
      .filter(button => button.getClientRects().length);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });

  document.addEventListener('melatoni:language-change', localize);
  window.addEventListener('melatoni:consent-change', () => {
    if (waitingForConsent) showAfterConsent();
  });
  consentApi?.on('functional', () => {}, () => {
    try { window.MelatoniStorage?.remove(PROFILE_KEY); } catch (_) { /* Storage may be unavailable. */ }
  });

  localize();
  if (consentApi?.get()) {
    window.setTimeout(openPrompt, 650);
  } else {
    showAfterConsent();
  }
})();
