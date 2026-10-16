(() => {
  const stage = document.querySelector('.wheel-stage');
  if (!stage) return;
  const section = stage.closest('.collections-wheel');
  const orbit = stage.querySelector('.wheel-orbit');
  const cards = [...stage.querySelectorAll('.wheel-card')];
  const label = stage.querySelector('.wheel-label');
  const activeTitle = stage.querySelector('.wheel-active-title');
  const indexButtons = [...stage.querySelectorAll('[data-wheel-index]')];
  const status = stage.querySelector('.wheel-sr-status');
  const count = cards.length;
  const last = Math.max(0, count - 1);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const radians = degrees => degrees * Math.PI / 180;
  const wheelUnits = 180;
  const dragUnits = 420;
  const settleDelay = 150;
  const step = 40;
  let turn = 0;
  let target = 0;
  let stageWidth = 0;
  let stageHeight = 0;
  let cardWidth = 0;
  let cardHeight = 0;
  let ringRadius = 0;
  let ringScale = 1;
  let drumRadius = 0;
  let bow = 0;
  let animationFrame = 0;
  let settleTimer = 0;
  let previousIndex = -1;
  let pointerStart = null;
  let entryProgress = 0;
  let bridgeFrame = 0;
  let pointerDragged = false;
  let draggedClick = false;

  function updateBridge() {
    bridgeFrame = 0;
    const viewport = window.innerHeight || document.documentElement.clientHeight;
    const sectionTop = section.getBoundingClientRect().top;
    entryProgress = clamp((viewport - sectionTop) / (viewport * .85), 0, 1);
    section.style.setProperty('--wheel-entry-alpha', String(.06 + entryProgress * .94));
    section.style.setProperty('--wheel-entry-shift', `${(1 - entryProgress) * 38}px`);
    section.style.setProperty('--wheel-entry-scale', String(.965 + entryProgress * .035));

    // On touch phones, page scrolling advances the same wheel animation that
    // desktop users control with the mouse wheel. The sticky stage stays in
    // view while the section provides enough scroll distance for every card.
    if (window.matchMedia('(max-width: 760px)').matches) {
      const travel = Math.max(1, section.offsetHeight - stage.clientHeight);
      const progress = clamp(-sectionTop / travel, 0, 1);
      const scrollTarget = progress * count;
      if (Math.abs(scrollTarget - target) > .015) setTarget(scrollTarget);
    }

    const hero = document.querySelector('.campaign-hero');
    if (hero) {
      const heroBottom = hero.getBoundingClientRect().bottom;
      const bridgeProgress = clamp((viewport - heroBottom) / (viewport * .45), 0, 1);
      hero.style.setProperty('--wheel-bridge-progress', String(bridgeProgress));
    }
  }

  function requestBridgeUpdate() {
    if (bridgeFrame) return;
    bridgeFrame = requestAnimationFrame(updateBridge);
  }

  function measure() {
    stageWidth = stage.clientWidth;
    stageHeight = stage.clientHeight;
    if (!stageWidth || !stageHeight) return;
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    const ratio = mobile ? 1.35 : 1.45;
    cardWidth = mobile
      ? Math.min(stageHeight * .32 * ratio, stageWidth * .55)
      : Math.min(stageHeight * .38 * ratio, stageWidth * .34);
    cardHeight = cardWidth / ratio;
    ringRadius = cardHeight * (mobile ? 1.05 : 1.14);
    drumRadius = cardHeight * 2.22;
    bow = cardHeight * 1.82;
    ringScale = count ? clamp((((2 * Math.PI * ringRadius) / count) * .82) / cardWidth, .16, 1) : 1;
    stage.style.perspective = `${cardHeight * 2.7}px`;
    stage.style.setProperty('--wheel-card-w', `${cardWidth}px`);
    stage.style.setProperty('--wheel-card-h', `${cardHeight}px`);
    draw(true);
  }

  function cardTransform(ringDegrees, drumDegrees, morph) {
    const bowX = -bow * (1 - Math.cos(radians(drumDegrees)));
    return `translateX(${morph * bowX}px) rotateZ(${(1 - morph) * ringDegrees}deg) translateY(${-(1 - morph) * ringRadius}px) rotateX(${morph * drumDegrees}deg) translateZ(${morph * drumRadius}px)`;
  }

  function draw(immediate = false) {
    const gap = target - turn;
    if (immediate || reduced.matches || Math.abs(gap) < .0005) turn = target;
    else turn += gap * .12;

    const morph = clamp(turn, 0, 1);
    const position = Math.max(0, turn - 1);
    orbit.style.transform = `translateZ(${-morph * drumRadius}px)`;

    cards.forEach((card, i) => {
      const distance = i - position;
      const drumDegrees = distance * step;
      card.style.transform = cardTransform(distance * (360 / count), drumDegrees, morph);
      card.style.opacity = morph > .5 && Math.abs(distance) > 1.6 ? '0' : '1';
      card.style.zIndex = String(Math.round(100 - Math.abs(distance) * 2));
      card.firstElementChild.style.transform = `scale(${lerp(ringScale, 1, morph)})`;
    });

    if (label) label.style.opacity = String(1 - morph);
    if (activeTitle) activeTitle.style.opacity = String(morph);
    const active = clamp(Math.round(position), 0, last);
    if (active !== previousIndex) {
      previousIndex = active;
      stage.setAttribute('aria-activedescendant', `collection-item-${active}`);
      cards.forEach((card, i) => card.setAttribute('aria-selected', String(i === active)));
      indexButtons.forEach((button, i) => {
        if (i === active) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      });
      const title = cards[active]?.querySelector('.wheel-card-title')?.textContent?.trim() || '';
      if (activeTitle) activeTitle.textContent = title;
      if (status) status.textContent = title;
    }

    if (Math.abs(target - turn) > .0005 && !reduced.matches) {
      animationFrame = requestAnimationFrame(() => draw(false));
    } else {
      animationFrame = 0;
      turn = target;
    }
  }

  function setTarget(value) {
    target = clamp(value, 0, count);
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(() => draw(false));
  }

  function settle() {
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => setTarget(Math.round(target)), settleDelay);
  }

  stage.addEventListener('wheel', event => {
    requestBridgeUpdate();
    if (entryProgress < .96 || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    const next = clamp(target + event.deltaY / wheelUnits, 0, count);
    if (next > 0 && next < count) event.preventDefault();
    setTarget(next);
    settle();
  }, { passive: false });

  stage.addEventListener('pointerdown', event => {
    if (entryProgress < .96) return;
    if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, pointerType: event.pointerType, axis: null };
    pointerDragged = false;
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', event => {
    if (!pointerStart || event.pointerId !== pointerStart.id) return;
    const totalX = event.clientX - pointerStart.x;
    const totalY = event.clientY - pointerStart.y;
    if (!pointerStart.axis && Math.max(Math.abs(totalX), Math.abs(totalY)) > 7) {
      if (pointerStart.pointerType === 'touch') {
        if (Math.abs(totalX) <= Math.abs(totalY)) return;
        pointerStart.axis = 'x';
      } else {
        pointerStart.axis = 'y';
      }
      pointerDragged = true;
    }
    if (!pointerStart.axis) return;
    event.preventDefault();
    const delta = pointerStart.axis === 'x'
      ? pointerStart.lastX - event.clientX
      : pointerStart.lastY - event.clientY;
    pointerStart.lastX = event.clientX;
    pointerStart.lastY = event.clientY;
    setTarget(target + delta / dragUnits);
  }, { passive: false });
  const finishPointer = event => {
    if (!pointerStart || event.pointerId !== pointerStart.id) return;
    if (pointerDragged) {
      draggedClick = true;
      window.setTimeout(() => { draggedClick = false; }, 0);
      setTarget(Math.round(target));
    }
    pointerStart = null;
  };
  stage.addEventListener('pointerup', finishPointer);
  stage.addEventListener('pointercancel', finishPointer);
  stage.addEventListener('click', event => {
    if (draggedClick) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  stage.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      setTarget(Math.round(target) + 1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      setTarget(Math.round(target) - 1);
    }
  });
  indexButtons.forEach(button => button.addEventListener('click', () => setTarget(Number(button.dataset.wheelIndex) + 1)));

  const observer = new ResizeObserver(measure);
  observer.observe(stage);
  reduced.addEventListener?.('change', () => draw(true));
  window.addEventListener('scroll', requestBridgeUpdate, { passive: true });
  window.addEventListener('resize', requestBridgeUpdate, { passive: true });
  measure();
  updateBridge();
})();
