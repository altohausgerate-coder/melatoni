const CACHE_NAME = 'melatoni-shell-v1';
self.addEventListener('install', event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || '' }; }
  const title = String(payload.title || 'Melatoni').slice(0, 120);
  const body = String(payload.body || 'Melatoni-də sizin üçün yenilik var.').slice(0, 300);
  const target = typeof payload.url === 'string' && !/^(?:[a-z]+:|\/\/|\/)/i.test(payload.url) ? payload.url : 'products.html';
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: 'favicon.svg', badge: 'favicon.svg', tag: payload.tag || 'melatoni-update',
    data: { url: target }, renotify: false
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || 'products.html', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => new URL(client.url).origin === self.location.origin);
    return existing ? existing.navigate(target).then(() => existing.focus()) : self.clients.openWindow(target);
  }));
});
