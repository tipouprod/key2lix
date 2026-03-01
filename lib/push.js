/**
 * P3: Web Push notifications — إرسال إشعارات عند تحديث طلب أو رد جديد
 * يتطلب: VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY في .env
 * توليد المفاتيح: npx web-push generate-vapid-keys
 */
const webPush = require('web-push');

const VAPID_PUBLIC = (process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || '').trim();
const CONTACT_MAILTO = process.env.VAPID_MAILTO || 'noreply@key2lix.local';

let configured = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webPush.setVapidDetails(CONTACT_MAILTO, VAPID_PUBLIC, VAPID_PRIVATE);
    configured = true;
  } catch (e) {
    console.warn('Push: VAPID setup failed', e.message);
  }
}

function isConfigured() {
  return configured;
}

function getPublicKey() {
  return VAPID_PUBLIC;
}

async function sendNotification(subscription, payload) {
  if (!configured || !subscription || !subscription.endpoint) return false;
  try {
    const sub = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys && subscription.keys.p256dh,
        auth: subscription.keys && subscription.keys.auth
      }
    };
    await webPush.sendNotification(sub, JSON.stringify(payload), {
      TTL: 86400,
      urgency: 'high'
    });
    return true;
  } catch (e) {
    if (e.statusCode === 410 || e.statusCode === 404) return false; // subscription expired
    throw e;
  }
}

module.exports = {
  isConfigured,
  getPublicKey,
  sendNotification
};
