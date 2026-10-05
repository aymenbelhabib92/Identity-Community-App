/*
 * Push notifications of the Identity app. Loaded by the generated service worker
 * (importScripts, see vite.config.ts). The server sends { title, body, link, kind }
 * (apps/api/src/services/push.ts).
 */

self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { title: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(message.title || 'Identity', {
      body: message.body || undefined,
      icon: '/icons/icon-192.png',
      // Android status bar: a white silhouette.
      badge: '/icons/badge-96.png',
      data: { link: message.link || '/notifications' },
    }),
  );
});

// Tapping a notification opens its page: in the app if it is already open, otherwise in a new window.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/notifications';
  const url = new URL(link, self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === url.origin);
      if (open) {
        await open.focus();
        // The app navigates itself (no reload); see apps/web/src/router.tsx.
        open.postMessage({ type: 'identity:open', path: url.pathname + url.search + url.hash });
        return;
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
