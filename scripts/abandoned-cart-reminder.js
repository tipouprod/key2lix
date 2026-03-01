/**
 * N5 — إرسال تذكيرات بالسلة المهجورة.
 * الاستخدام: node scripts/abandoned-cart-reminder.js   أو  npm run abandoned-cart-reminder
 * يبحث عن سلات لم تُحدّث منذ X ساعة (افتراضي 24) ويرسل بريد تذكير ثم يعلّمها كمُذكَّر بها.
 * يتطلب ضبط SMTP في .env. للجدولة: cron يومي مثل: 0 10 * * * node /path/to/scripts/abandoned-cart-reminder.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');

const projectRoot = path.join(__dirname, '..');
process.chdir(projectRoot);

const db = require('../database/db');
db.initDb();

let emailService;
try {
  emailService = require('../lib/email');
} catch (e) {
  emailService = { notifyAbandonedCart: () => Promise.resolve(), isConfigured: () => false };
}

const SITE_URL = process.env.SITE_URL || process.env.BASE_URL || 'http://localhost:3000';
const HOURS = parseInt(process.env.ABANDONED_CART_HOURS || '24', 10) || 24;
const LIMIT = parseInt(process.env.ABANDONED_CART_LIMIT || '50', 10) || 50;

function buildItemsSummary(items) {
  if (!Array.isArray(items) || items.length === 0) return '- (no items)';
  return items.map((i) => `- ${i.name || i.slug || 'Product'} (${i.price != null ? i.price : ''})`).join('\n');
}

(async () => {
  const list = db.getAbandonedCartsOlderThan(HOURS, LIMIT);
  let sent = 0;
  for (const row of list) {
    const email = row.email || (row.client_id ? db.getClientEmailById(row.client_id) : null);
    if (!email) {
      db.markAbandonedCartReminded(row.id);
      continue;
    }
    const itemsSummary = buildItemsSummary(row.items);
    const cartUrl = SITE_URL + (SITE_URL.endsWith('/') ? '' : '/') + 'cart';
    await emailService.notifyAbandonedCart(email, itemsSummary, cartUrl);
    db.markAbandonedCartReminded(row.id);
    sent++;
  }
  console.log('Abandoned cart reminders: ' + sent + ' sent (checked ' + list.length + ' carts older than ' + HOURS + 'h).');
})();
