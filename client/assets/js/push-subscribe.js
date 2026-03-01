/**
 * P3: Web Push — طلب إذن الاشتراك وإرساله للخادم
 * يُستدعى من صفحة حساب العميل أو لوحة البائع
 */
(function () {
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  window.Key2lixPushSubscribe = async function () {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return { ok: false, error: 'not_supported' };
    const res = await fetch('/api/config', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).catch(function () { return {}; });
    if (!res.pushEnabled || !res.vapidPublicKey) return { ok: false, error: 'push_not_configured' };
    let reg = await navigator.serviceWorker.ready;
    if (!reg) reg = await navigator.serviceWorker.register('/sw.js').then(function (r) { return r.ready; });
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, error: 'permission_denied' };
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(res.vapidPublicKey)
    });
    const payload = JSON.stringify(sub);
    const subObj = JSON.parse(payload);
    const apiRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ subscription: subObj })
    });
    const data = await apiRes.json().catch(function () { return {}; });
    return { ok: apiRes.ok && data.success, error: data.error };
  };
})();
