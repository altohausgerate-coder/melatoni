(() => {
  const client = window.MELATONI_SUPABASE;
  const panelCopy = {
    az:{title:'Bildirişlər',message:'Yeni kampaniyalar və səbət xatırlatmaları üçün bildirişləri hesabınızdan aktiv edin.',link:'Bildirişləri idarə et ↗'},
    ru:{title:'Уведомления',message:'Включите уведомления в аккаунте, чтобы получать акции и напоминания о корзине.',link:'Настроить уведомления ↗'},
    en:{title:'Notifications',message:'Enable notifications in your account for campaign updates and bag reminders.',link:'Manage notifications ↗'}
  };
  const updatePanel = () => {
    const lang = window.MelatoniStorage?.get('melatoni-language') || 'az';
    const copy = panelCopy[lang] || panelCopy.az;
    const title = document.querySelector('[data-push-panel-title]');
    const message = document.querySelector('[data-push-panel-message]');
    const link = document.querySelector('[data-push-panel-link]');
    if (title) title.textContent = copy.title;
    if (message) message.textContent = copy.message;
    if (link) link.textContent = copy.link;
  };
  updatePanel();
  document.addEventListener('melatoni:language-change', updatePanel);
  const decodeKey = value => {
    const padded = `${value}${'='.repeat((4 - value.length % 4) % 4)}`;
    const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  };
  const register = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('unsupported');
    return navigator.serviceWorker.register('service-worker.js', { scope: './' });
  };
  window.MelatoniPush = Object.freeze({
    async subscribe(userId) {
      if (!client || !userId || !window.MELATONI_PUSH_VAPID_PUBLIC_KEY) throw new Error('unavailable');
      const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (ios && !navigator.standalone) throw new Error('ios-install');
      if (!('Notification' in window) || !('PushManager' in window)) throw new Error(ios ? 'ios-install' : 'unsupported');
      let permission = Notification.permission;
      if (permission === 'default') permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error(permission === 'denied' ? 'blocked' : 'permission');
      const registration = await register();
      const applicationServerKey = decodeKey(window.MELATONI_PUSH_VAPID_PUBLIC_KEY);
      let subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const currentKey = subscription.options?.applicationServerKey;
        const currentBytes = currentKey ? new Uint8Array(currentKey) : null;
        const sameKey = currentBytes?.length === applicationServerKey.length
          && applicationServerKey.every((byte, index) => byte === currentBytes[index]);
        if (!sameKey) {
          const removed = await client.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', subscription.endpoint);
          if (removed.error) throw new Error('save');
          await subscription.unsubscribe();
          subscription = null;
        }
      }
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      const result = await client.from('push_subscriptions').upsert({ user_id: userId, endpoint: subscription.endpoint, subscription: subscription.toJSON(), updated_at: new Date().toISOString() }, { onConflict: 'endpoint' });
      if (result.error) { await subscription.unsubscribe(); throw new Error('save'); }
      return true;
    },
    async unsubscribe(userId) {
      const registration = await register();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const result = await client.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', subscription.endpoint);
        if (result.error) throw new Error('save');
        await subscription.unsubscribe();
      }
      return true;
    }
  });
})();
