import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../analytics.js', import.meta.url), 'utf8');
function harness(initial = false) {
  let allowed = initial;
  const callbacks = new Map();
  const scripts = [];
  const listeners = new Map();
  const window = {
    dataLayer: [],
    MELATONI_GTM_ID: 'GTM-TEST123',
    MelatoniConsent: {
      has: category => category === 'necessary' || (category === 'analytics' && allowed),
      on(category, callback) { callbacks.set(category, callback); if (allowed && category === 'analytics') callback(); }
    },
    addEventListener(type, callback) { const list = listeners.get(type) || []; list.push(callback); listeners.set(type, list); },
    dispatchEvent(event) { (listeners.get(event.type) || []).forEach(callback => callback(event)); }
  };
  const document = {
    title: 'Melatoni test',
    createElement: () => ({}),
    head: { append: script => scripts.push(script) },
    querySelectorAll: () => [],
    addEventListener(type, callback) { const list = listeners.get(type) || []; list.push(callback); listeners.set(type, list); },
    cookie: ''
  };
  const context = { window, document, location: { origin:'https://melatoni.com', pathname:'/products' }, URL, encodeURIComponent, CustomEvent: class { constructor(type, init) { this.type=type; this.detail=init?.detail; } }, setTimeout, clearTimeout };
  vm.runInNewContext(source, context, { filename:'analytics.js' });
  return { window, scripts, enable() { allowed = true; callbacks.get('analytics')?.(); window.dispatchEvent({ type:'melatoni:consent-change' }); } };
}

test('analytics does not load GTM or emit events before analytics consent', () => {
  const {window,scripts}=harness(false);
  window.MelatoniAnalytics.track('purchase',{transaction_id:'ML-123',value:50,currency:'AZN'});
  assert.equal(scripts.length,0);
  assert.equal(window.dataLayer.some(entry=>entry?.event==='page_view'||entry?.event==='purchase'),false);
});

test('analytics emits consent-gated ecommerce and removes customer PII', () => {
  const {window,scripts,enable}=harness(false);
  enable();
  assert.equal(scripts.length,1);
  window.MelatoniAnalytics.track('purchase',{transaction_id:'ML-123',value:50,currency:'AZN',coupon:'SLEEP10',customer_name:'Test Person',customer_phone:'+994501234567',items:[{item_id:'pillow-a',item_name:'Cloud Pillow',price:50,quantity:1}]});
  const event=window.dataLayer.find(entry=>entry?.event==='purchase');
  assert.ok(event);
  assert.equal(event.ecommerce.customer_name,undefined);
  assert.equal(event.ecommerce.customer_phone,undefined);
  assert.equal(event.ecommerce.items[0].item_name,'Cloud Pillow');
  assert.equal(event.ecommerce.transaction_id,'ML-123');
  assert.equal(event.ecommerce.coupon,'SLEEP10');
});
