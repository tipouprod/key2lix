/**
 * التحقق من ملف قاعدة البيانات وعدد المنتجات.
 * تشغيل: node scripts/check-db.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'client', 'data');
const raw = (process.env.DB_FILENAME || 'key2lix.db').trim().replace(/^["']|["']$/g, '');
const DB_FILENAME = (raw.replace(/[<>:"/\\|?*]/g, '') || 'key2lix.db').trim() || 'key2lix.db';
const DB_PATH = path.join(DB_DIR, DB_FILENAME);
const KEYLIX_DB_PATH = path.join(DB_DIR, 'keylix.db');
const actualPath = (path.basename(DB_PATH) === 'key2lix.db' && fs.existsSync(KEYLIX_DB_PATH)) ? KEYLIX_DB_PATH : DB_PATH;

console.log('');
console.log('--- فحص قاعدة البيانات ---');
console.log('  DB_FILENAME من .env:', process.env.DB_FILENAME || '(غير معرّف، افتراضي: key2lix.db)');
console.log('  الملف المستخدم:', actualPath);
if (actualPath !== DB_PATH) console.log('  (استخدام keylix.db تلقائياً بعد التبديل إلى key2lix)');
console.log('  الملف موجود:', fs.existsSync(actualPath));
console.log('');

if (!fs.existsSync(actualPath)) {
  if (fs.existsSync(KEYLIX_DB_PATH)) {
    console.log('  تلميح: السيرفر يفضّل keylix.db تلقائياً عند عدم تعيين DB_FILENAME.');
  }
  process.exit(1);
}

const db = require('better-sqlite3')(actualPath);
let count = 0;
try {
  const rows = db.prepare('SELECT COUNT(*) AS n FROM products').get();
  count = rows ? rows.n : 0;
} catch (e) {
  console.log('  تحذير: جدول products غير موجود أو خطأ:', e.message);
}
db.close();

console.log('  عدد المنتجات في جدول products:', count);
console.log('');
if (count === 0) {
  const productsJson = path.join(DB_DIR, 'products.json');
  const productsMigrated = path.join(DB_DIR, 'products.json.migrated');
  if (fs.existsSync(productsJson)) console.log('  تلميح: يوجد products.json — سيُستخدم كاحتياطي أو انسخه ثم أعد تشغيل السيرفر.');
  if (fs.existsSync(productsMigrated)) console.log('  تلميح: يوجد products.json.migrated — التطبيق يقرأ منه عند فراغ الجدول.');
}
console.log('');
