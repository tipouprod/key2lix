/* Key2lix PWA Service Worker - cache أولي للصفحة الرئيسية وقائمة المنتجات */
/* في التطوير (localhost أو ngrok): لا نستخدم الكاش حتى تظهر التعديلات فوراً دون مسح بيانات الموقع */
const IS_DEV = self.location && (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1' || (self.location.hostname || '').indexOf('ngrok') !== -1);
const CACHE_NAME = 'key2lix-v5';
const URLS = [
  '/',
  '/vendor',
  '/data/products.json',
  '/assets/css/style.css',
  '/assets/css/admin.css',
  '/assets/js/common.js',
  '/assets/js/lang.js',
  '/assets/js/push-subscribe.js',
  '/assets/img/logo.png',
  '/assets/img/favicon.png',
  '/partials/navbar.html',
  '/partials/footer.html',
  '/manifest.json'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(URLS).catch(function () {});
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_NAME) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* P3: Web Push — استقبال الإشعارات وعرضها */
self.addEventListener('push', function (e) {
  if (!e.data) return;
  var payload;
  try { payload = e.data.json(); } catch (err) { payload = { title: 'Key2lix', body: e.data.text() || '' }; }
  var title = payload.title || 'Key2lix';
  var opts = { body: payload.body || '', icon: '/assets/img/favicon.png', badge: '/assets/img/favicon.png', data: { link: payload.link || '/' } };
  e.waitUntil(self.registration.showNotification(title, opts));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var link = (e.notification.data && e.notification.data.link) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
    if (clientList.length) { clientList[0].focus(); clientList[0].navigate(link); }
    else self.clients.openWindow(link);
  }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  var path = url.pathname.replace(/\/$/, '') || '/';
  if (e.request.mode === 'navigate' && (path === '/admin' || path === '/admin.html' || path === '/login' || path === '/vendor-login')) return;
  if (IS_DEV) {
    e.respondWith(fetch(e.request, { redirect: 'follow' }));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      if (cached) return cached;
      return fetch(e.request, { redirect: 'follow' }).then(function (res) {
        var clone = res.clone();
        var path = url.pathname;
        var cacheable = res.status === 200 && !res.redirected && (path === '/' || path === '/vendor' || path === '/data/products.json' || path.indexOf('/assets/') === 0 || path === '/manifest.json');
        if (cacheable) caches.open(CACHE_NAME).then(function (cache) { cache.put(e.request, clone); });
        return res;
      });
    })
  );
});
