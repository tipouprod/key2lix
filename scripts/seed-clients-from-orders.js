/**
 * استخراج العملاء من الطلبات يدوياً (عند عدم ظهورهم في لوحة الأدمن).
 * تشغيل: node scripts/seed-clients-from-orders.js
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

if (!fs.existsSync(actualPath)) {
  console.error('ملف قاعدة البيانات غير موجود:', actualPath);
  process.exit(1);
}

const db = require('../database');
db.initDb();

const clients = db.getClients();
const vendors = db.getVendors();
console.log('عدد العملاء:', clients.length);
console.log('عدد الموردين:', vendors.length);
if (clients.length === 0) {
  const ordersWithEmail = db.getDb().prepare('SELECT COUNT(*) AS n FROM orders WHERE email IS NOT NULL AND email != ""').get().n;
  console.log('طلبات تحتوي بريداً:', ordersWithEmail);
  if (ordersWithEmail > 0) console.log('تلميح: ثبّت bcrypt (npm install bcrypt) ثم أعد تشغيل السيرفر أو هذا السكربت.');
}
console.log('');
