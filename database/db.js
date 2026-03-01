/**
 * SQLite: orders, contacts, vendors, products (multi-vendor).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', 'client', 'data');
const _raw = (process.env.DB_FILENAME || 'key2lix.db').trim().replace(/^["']|["']$/g, '');
const DB_FILENAME = (_raw.replace(/[<>:"/\\|?*]/g, '') || 'key2lix.db').trim() || 'key2lix.db';
const DB_PATH = path.join(DB_DIR, DB_FILENAME);
const KEYLIX_DB_PATH = path.join(DB_DIR, 'keylix.db');
const ORDERS_JSON = path.join(DB_DIR, 'orders.json');
const CONTACTS_JSON = path.join(DB_DIR, 'contacts.json');
const PRODUCTS_JSON = path.join(DB_DIR, 'products.json');
const CLIENTS_JSON = path.join(DB_DIR, 'clients.json');
const VENDORS_JSON = path.join(DB_DIR, 'vendors.json');

let db;
/** المسار الفعلي المستخدم (قد يكون keylix.db عند عدم وجود key2lix.db لاسترجاع البيانات بعد تغيير الاسم) */
let _actualDbPath = DB_PATH;

function initDb() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (path.basename(DB_PATH) === 'key2lix.db' && fs.existsSync(KEYLIX_DB_PATH)) {
    _actualDbPath = KEYLIX_DB_PATH;
  } else {
    _actualDbPath = DB_PATH;
  }
  db = new Database(_actualDbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      product TEXT,
      value TEXT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      address TEXT
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      subject TEXT,
      message TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NULL,
      category TEXT NOT NULL,
      subcat TEXT NOT NULL DEFAULT '',
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      desc TEXT,
      images_json TEXT NOT NULL DEFAULT '[]',
      prices_json TEXT NOT NULL DEFAULT '[]',
      discount TEXT,
      old_price TEXT,
      tags_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(category, subcat, slug)
    );
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  migrateOrdersAddVendorColumns();
  migrateOrdersAddClientId();
  migrateOrdersStatus();
  migrateOrdersEstimatedDelivery();
  migrateOrdersPaymentStripe();
  migrateOrderMessagesTable();
  migrateOrdersProductKey();
  migrateReviewsTable();
  migrateNotificationsTable();
  migrateFromJson();
  migrateProductsFromJson();
  migrateClientsFromJson();
  migrateVendorsFromJson();
  migrateClientsFromOrders();
  migrateProductsStatus();
  migrateProductsOfferUntil();
  migrateVendorPaymentsTable();
  migrateSettingsTable();
  migrateClientWishlistTable();
  migrateNewsletterTable();
  migrateAbandonedCartTable();
  migrateVendorsProfileColumns();
  migrateVendorsSecurityColumns();
  migrateVendorActivityLogTable();
  migrateVendorApiKeysTable();
  migrateVendorsWebhookColumns();
  migrateClientsEmailVerification();
  migrateClientsAddress();
  migrateClientsNotificationPrefs();
  migrateClientActivityLog();
  migrateProductViewsTable();
  migrateClientsPasswordReset();
  migrateClientsEmailSanitize();
  migrateAuditLogTable();
  migrateAdminSubUsersTable();
  migrateCouponsTable();
  migrateOrdersCouponCode();
  migrateProductAlertsTable();
  migratePushSubscriptionsTable();
  migratePerformanceIndexes();
  migrateSessionTable();
  migrateAdminLoginLogTable();
  ensureClientsFromOrdersIfEmpty();
  return db;
}

function migrateAdminLoginLogTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_login_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL DEFAULT (datetime('now')),
      success INTEGER NOT NULL DEFAULT 0,
      ip TEXT,
      username TEXT,
      details TEXT
    )
  `);
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_admin_login_log_at ON admin_login_log(at)'); } catch (e) {}
}

function addAdminLoginLog(success, ip, username, details) {
  try {
    const detailsStr = typeof details === 'string' ? details : JSON.stringify(details || {});
    db.prepare('INSERT INTO admin_login_log (success, ip, username, details) VALUES (?, ?, ?, ?)')
      .run(success ? 1 : 0, ip || null, username || null, detailsStr);
  } catch (e) {}
}

function getAdminLoginLog(limit) {
  const n = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const rows = db.prepare('SELECT id, at, success, ip, username, details FROM admin_login_log ORDER BY at DESC LIMIT ?').all(n);
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    success: !!r.success,
    ip: r.ip || null,
    username: r.username || null,
    details: r.details || null
  }));
}

/** فهارس إضافية لأداء الاستعلامات الأكثر استخداماً (FUTURE-REVIEW 3.2) */
function migratePerformanceIndexes() {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id)',
    'CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date)',
    'CREATE INDEX IF NOT EXISTS idx_orders_vendor_status ON orders(vendor_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_products_category_subcat_slug ON products(category, subcat, slug)',
    'CREATE INDEX IF NOT EXISTS idx_products_vendor_status ON products(vendor_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(category, subcat, slug)',
    'CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_type, user_id, is_read)'
  ];
  indexes.forEach((sql) => { try { db.exec(sql); } catch (e) {} });
}

function migrateSessionTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      session TEXT NOT NULL,
      expire TEXT NOT NULL
    )
  `);
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire)'); } catch (e) {}
}

function getSessionRow(sid) {
  const row = db.prepare('SELECT session, expire FROM sessions WHERE sid = ? AND datetime(expire) > datetime(\'now\')').get(sid);
  return row;
}

function setSessionRow(sid, session, expireMs) {
  const expire = new Date(Date.now() + expireMs).toISOString();
  db.prepare('INSERT OR REPLACE INTO sessions (sid, session, expire) VALUES (?, ?, ?)').run(sid, session, expire);
}

function destroySessionRow(sid) {
  db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
}

function migratePushSubscriptionsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_type TEXT NOT NULL CHECK(user_type IN ('client', 'vendor')),
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function savePushSubscription(endpoint, p256dh, auth, userType, userId) {
  const ep = String(endpoint || '').trim();
  const k1 = String(p256dh || '').trim();
  const k2 = String(auth || '').trim();
  if (!ep || !k1 || !k2 || !userType || !userId) return false;
  try {
    db.prepare(
      'INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth, user_type, user_id) VALUES (?, ?, ?, ?, ?)'
    ).run(ep, k1, k2, userType, userId);
    return true;
  } catch (e) {
    return false;
  }
}

function getPushSubscriptionsByUser(userType, userId) {
  return db.prepare(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_type = ? AND user_id = ?'
  ).all(userType, userId);
}

function deletePushSubscription(endpoint) {
  try {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(String(endpoint || '').trim());
    return true;
  } catch (e) {
    return false;
  }
}

function migrateProductAlertsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      client_id INTEGER,
      category TEXT NOT NULL,
      subcat TEXT NOT NULL DEFAULT '',
      slug TEXT NOT NULL,
      alert_type TEXT NOT NULL DEFAULT 'in_stock',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(email, category, subcat, slug, alert_type)
    )
  `);
}

function addProductAlert(email, clientId, category, subcat, slug, alertType) {
  const sub = (subcat || '').trim();
  const type = (alertType || 'in_stock').trim();
  try {
    db.prepare(
      'INSERT INTO product_alerts (email, client_id, category, subcat, slug, alert_type) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(email, clientId ?? null, category, sub, slug, type);
    return { ok: true };
  } catch (e) {
    if (e.message && e.message.indexOf('UNIQUE') >= 0) return { ok: true, already: true };
    throw e;
  }
}

function getProductAlertsByProduct(category, subcat, slug, alertType) {
  const sub = (subcat || '').trim();
  return db.prepare(
    'SELECT id, email, client_id FROM product_alerts WHERE category = ? AND subcat = ? AND slug = ? AND alert_type = ?'
  ).all(category, sub, slug, alertType || 'in_stock');
}

function deleteProductAlertAfterNotify(id) {
  try { db.prepare('DELETE FROM product_alerts WHERE id = ?').run(id); } catch (e) {}
}

function migrateCouponsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('percent', 'fixed')),
      value REAL NOT NULL,
      valid_from TEXT,
      valid_until TEXT,
      usage_limit INTEGER,
      usage_count INTEGER NOT NULL DEFAULT 0,
      min_order_amount REAL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  const info = db.prepare('PRAGMA table_info(coupons)').all();
  if (!info.some((c) => c.name === 'min_order_amount')) db.exec('ALTER TABLE coupons ADD COLUMN min_order_amount REAL');
  if (!info.some((c) => c.name === 'active')) db.exec('ALTER TABLE coupons ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  if (!info.some((c) => c.name === 'deleted')) db.exec('ALTER TABLE coupons ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0');
  if (!info.some((c) => c.name === 'first_order_only')) db.exec('ALTER TABLE coupons ADD COLUMN first_order_only INTEGER NOT NULL DEFAULT 0');
  if (!info.some((c) => c.name === 'allowed_emails')) db.exec('ALTER TABLE coupons ADD COLUMN allowed_emails TEXT');
  if (!info.some((c) => c.name === 'product_category')) db.exec('ALTER TABLE coupons ADD COLUMN product_category TEXT');
  if (!info.some((c) => c.name === 'product_subcat')) db.exec('ALTER TABLE coupons ADD COLUMN product_subcat TEXT');
  if (!info.some((c) => c.name === 'product_slug')) db.exec('ALTER TABLE coupons ADD COLUMN product_slug TEXT');
  if (!info.some((c) => c.name === 'free_shipping')) db.exec('ALTER TABLE coupons ADD COLUMN free_shipping INTEGER NOT NULL DEFAULT 0');
}

function migrateOrdersCouponCode() {
  const info = db.prepare('PRAGMA table_info(orders)').all();
  if (!info.some((c) => c.name === 'coupon_code')) db.exec('ALTER TABLE orders ADD COLUMN coupon_code TEXT');
  if (!info.some((c) => c.name === 'coupon_discount_amount')) db.exec('ALTER TABLE orders ADD COLUMN coupon_discount_amount REAL');
  if (!info.some((c) => c.name === 'shipping_amount')) db.exec('ALTER TABLE orders ADD COLUMN shipping_amount REAL');
  if (!info.some((c) => c.name === 'shipping_discount_amount')) db.exec('ALTER TABLE orders ADD COLUMN shipping_discount_amount REAL');
}

function getCouponByCode(code) {
  if (!code || !String(code).trim()) return null;
  const c = db.prepare('SELECT id, code, type, value, valid_from, valid_until, usage_limit, usage_count, min_order_amount, active, first_order_only, allowed_emails, product_category, product_subcat, product_slug, free_shipping FROM coupons WHERE (deleted IS NULL OR deleted = 0) AND LOWER(TRIM(code)) = LOWER(TRIM(?))').get(String(code).trim());
  return c || null;
}

function incrementCouponUsage(code) {
  if (!code || !String(code).trim()) return;
  db.prepare('UPDATE coupons SET usage_count = usage_count + 1 WHERE LOWER(TRIM(code)) = LOWER(TRIM(?))').run(String(code).trim());
}

function insertCoupon(code, type, value, validFrom, validUntil, usageLimit, minOrderAmount, active, firstOrderOnly, allowedEmails, productCategory, productSubcat, productSlug, freeShipping) {
  const info = db.prepare('PRAGMA table_info(coupons)').all();
  const hasFirst = info.some((c) => c.name === 'first_order_only');
  const hasAllowed = info.some((c) => c.name === 'allowed_emails');
  const hasProductCat = info.some((c) => c.name === 'product_category');
  const hasProductSub = info.some((c) => c.name === 'product_subcat');
  const hasProductSlug = info.some((c) => c.name === 'product_slug');
  const hasFreeShip = info.some((c) => c.name === 'free_shipping');
  const typeVal = type === 'free_shipping' ? 'fixed' : (type === 'fixed' ? 'fixed' : 'percent');
  const valNum = type === 'free_shipping' ? 0 : Number(value);
  let cols = 'code, type, value, valid_from, valid_until, usage_limit, min_order_amount, active';
  let place = '?, ?, ?, ?, ?, ?, ?, ?';
  const args = [
    String(code).trim(),
    typeVal,
    valNum,
    validFrom || null,
    validUntil || null,
    usageLimit != null ? Math.max(0, parseInt(usageLimit, 10)) : null,
    minOrderAmount != null && !isNaN(Number(minOrderAmount)) ? Number(minOrderAmount) : null,
    active !== 0 && active !== false ? 1 : 0
  ];
  if (hasFirst) { cols += ', first_order_only'; place += ', ?'; args.push(firstOrderOnly ? 1 : 0); }
  if (hasAllowed) { cols += ', allowed_emails'; place += ', ?'; args.push(allowedEmails != null && String(allowedEmails).trim() !== '' ? String(allowedEmails).trim() : null); }
  if (hasProductCat) { cols += ', product_category'; place += ', ?'; args.push(productCategory != null && String(productCategory).trim() !== '' ? String(productCategory).trim() : null); }
  if (hasProductSub) { cols += ', product_subcat'; place += ', ?'; args.push(productSubcat != null && String(productSubcat).trim() !== '' ? String(productSubcat).trim() : null); }
  if (hasProductSlug) { cols += ', product_slug'; place += ', ?'; args.push(productSlug != null && String(productSlug).trim() !== '' ? String(productSlug).trim() : null); }
  if (hasFreeShip) { cols += ', free_shipping'; place += ', ?'; args.push(freeShipping ? 1 : 0); }
  db.prepare('INSERT INTO coupons (' + cols + ') VALUES (' + place + ')').run(...args);
  return true;
}

function getCouponsList(limit, offset, search, status) {
  const limitNum = Math.min(parseInt(limit, 10) || 100, 5000);
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
  const now = new Date().toISOString().slice(0, 10);
  let sql = 'SELECT id, code, type, value, valid_from, valid_until, usage_limit, usage_count, min_order_amount, active, deleted, first_order_only, allowed_emails, product_category, product_subcat, product_slug, free_shipping, created_at FROM coupons WHERE (deleted IS NULL OR deleted = 0)';
  const params = [];
  if (search && String(search).trim()) {
    params.push('%' + String(search).trim() + '%');
    sql += ' AND code LIKE ?';
  }
  if (status === 'active') {
    sql += ' AND (active = 1) AND (valid_until IS NULL OR valid_until >= ?) AND (usage_limit IS NULL OR usage_count < usage_limit)';
    params.push(now);
  } else if (status === 'expired') {
    sql += ' AND (valid_until IS NOT NULL AND valid_until < ?)';
    params.push(now);
  } else if (status === 'exhausted') {
    sql += ' AND (usage_limit IS NOT NULL AND usage_count >= usage_limit)';
  } else if (status === 'disabled') {
    sql += ' AND (active = 0)';
  }
  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(limitNum, offsetNum);
  const rows = db.prepare(sql).all(...params);
  return rows;
}

function updateCouponActive(id, active) {
  const aid = parseInt(id, 10);
  if (isNaN(aid) || aid < 1) return false;
  db.prepare('UPDATE coupons SET active = ? WHERE id = ?').run(active ? 1 : 0, aid);
  return true;
}

function updateCoupon(id, updates) {
  const aid = parseInt(id, 10);
  if (isNaN(aid) || aid < 1) return false;
  const allowed = ['usage_limit', 'valid_from', 'valid_until', 'min_order_amount', 'active'];
  const set = [];
  const vals = [];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      if (key === 'active') { set.push('active = ?'); vals.push(updates[key] ? 1 : 0); }
      else if (key === 'usage_limit') { set.push('usage_limit = ?'); vals.push(updates[key] != null ? Math.max(0, parseInt(updates[key], 10)) : null); }
      else if (key === 'min_order_amount') { set.push('min_order_amount = ?'); vals.push(updates[key] != null && !isNaN(Number(updates[key])) ? Number(updates[key]) : null); }
      else { set.push(key + ' = ?'); vals.push(updates[key] != null && String(updates[key]).trim() !== '' ? String(updates[key]).trim() : null); }
    }
  }
  if (set.length === 0) return true;
  vals.push(aid);
  db.prepare('UPDATE coupons SET ' + set.join(', ') + ' WHERE id = ?').run(...vals);
  return true;
}

function deleteCoupon(id) {
  const aid = parseInt(id, 10);
  if (isNaN(aid) || aid < 1) return false;
  db.prepare('UPDATE coupons SET deleted = 1, active = 0 WHERE id = ?').run(aid);
  return true;
}

function getCouponStats() {
  const rows = db.prepare('SELECT code, type, value, usage_count FROM coupons WHERE (deleted IS NULL OR deleted = 0)').all();
  let totalUses = 0;
  const byCode = [];
  for (const r of rows) {
    const u = r.usage_count || 0;
    totalUses += u;
    if (u > 0) byCode.push({ code: r.code, type: r.type, value: r.value, usage_count: u });
  }
  byCode.sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
  const info = db.prepare('PRAGMA table_info(orders)').all();
  const hasDiscount = info.some((c) => c.name === 'coupon_discount_amount');
  let totalDiscount = 0;
  if (hasDiscount) {
    const row = db.prepare('SELECT COALESCE(SUM(CAST(coupon_discount_amount AS REAL)), 0) AS s FROM orders WHERE coupon_discount_amount IS NOT NULL AND coupon_discount_amount != ""').get();
    totalDiscount = row && row.s != null ? Number(row.s) : 0;
  }
  return { total_uses: totalUses, total_discount: totalDiscount, by_code: byCode.slice(0, 20) };
}

function migrateAuditLogTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL DEFAULT (datetime('now')),
      actor_type TEXT NOT NULL,
      actor_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      ip TEXT
    )
  `);
}

function insertAuditLog(actorType, actorId, action, details, ip) {
  const detailsStr = typeof details === 'string' ? details : JSON.stringify(details || {});
  db.prepare(
    'INSERT INTO audit_log (actor_type, actor_id, action, details, ip) VALUES (?, ?, ?, ?, ?)'
  ).run(actorType, actorId ?? null, action, detailsStr, ip || null);
}

function migrateAdminSubUsersTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_sub_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('order_supervisor', 'content_supervisor')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function getAdminSubUserByEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const r = db.prepare('SELECT id, email, password_hash, role FROM admin_sub_users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))').get(String(email).trim());
  return r || null;
}

function createAdminSubUser(email, passwordHash, role) {
  const r = db.prepare(
    'INSERT INTO admin_sub_users (email, password_hash, role) VALUES (?, ?, ?)'
  ).run(String(email).trim().toLowerCase(), passwordHash, role || 'order_supervisor');
  return r.lastInsertRowid;
}

function getAdminSubUsers() {
  return db.prepare('SELECT id, email, role, created_at FROM admin_sub_users ORDER BY created_at DESC').all();
}

function deleteAdminSubUser(id) {
  const r = db.prepare('DELETE FROM admin_sub_users WHERE id = ?').run(parseInt(id, 10));
  return r.changes > 0;
}

function getAuditLog(limit, offset, options) {
  const lim = Math.min(Math.max(1, parseInt(limit, 10) || 50), 500);
  const off = Math.max(0, parseInt(offset, 10) || 0);
  const opts = options || {};
  let sql = 'SELECT id, at, actor_type, actor_id, action, details, ip FROM audit_log WHERE 1=1';
  const params = [];
  if (opts.action && String(opts.action).trim()) {
    sql += ' AND action = ?';
    params.push(String(opts.action).trim());
  }
  if (opts.actor_type && String(opts.actor_type).trim()) {
    sql += ' AND actor_type = ?';
    params.push(String(opts.actor_type).trim());
  }
  if (opts.date_from && String(opts.date_from).trim()) {
    sql += ' AND date(at) >= date(?)';
    params.push(String(opts.date_from).trim());
  }
  if (opts.date_to && String(opts.date_to).trim()) {
    sql += ' AND date(at) <= date(?)';
    params.push(String(opts.date_to).trim());
  }
  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(lim, off);
  return db.prepare(sql).all(...params);
}

function migrateClientsEmailVerification() {
  const info = db.prepare('PRAGMA table_info(clients)').all();
  const has = (name) => info.some((c) => c.name === name);
  if (!has('email_verified')) db.exec('ALTER TABLE clients ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
  if (!has('email_verification_token')) db.exec('ALTER TABLE clients ADD COLUMN email_verification_token TEXT');
  if (!has('email_verification_sent_at')) db.exec('ALTER TABLE clients ADD COLUMN email_verification_sent_at TEXT');
  try { db.prepare('UPDATE clients SET email_verified = 1 WHERE email_verification_token IS NULL').run(); } catch (e) {}
}

function migrateClientsAddress() {
  const info = db.prepare('PRAGMA table_info(clients)').all();
  if (!info.some((c) => c.name === 'address')) db.exec('ALTER TABLE clients ADD COLUMN address TEXT');
}

function migrateClientsNotificationPrefs() {
  const info = db.prepare('PRAGMA table_info(clients)').all();
  const has = (name) => info.some((c) => c.name === name);
  if (!has('notify_by_email')) db.exec('ALTER TABLE clients ADD COLUMN notify_by_email INTEGER NOT NULL DEFAULT 1');
  if (!has('notify_by_dashboard')) db.exec('ALTER TABLE clients ADD COLUMN notify_by_dashboard INTEGER NOT NULL DEFAULT 1');
}

function migrateClientActivityLog() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS client_activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_client_activity_client_id ON client_activity_log(client_id)'); } catch (e) {}
}

/** AI — تتبع مشاهدات المنتجات للتوصيات الذكية */
function migrateProductViewsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NULL,
      session_id TEXT NULL,
      category TEXT NOT NULL,
      subcat TEXT NOT NULL DEFAULT '',
      slug TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );
    CREATE INDEX IF NOT EXISTS idx_product_views_client ON product_views(client_id);
    CREATE INDEX IF NOT EXISTS idx_product_views_session ON product_views(session_id);
    CREATE INDEX IF NOT EXISTS idx_product_views_product ON product_views(category, subcat, slug);
    CREATE INDEX IF NOT EXISTS idx_product_views_created ON product_views(created_at);
  `);
}

function saveProductView(clientId, sessionId, category, subcat, slug) {
  if (!category || !slug) return;
  const sub = (subcat || '').trim();
  try {
    db.prepare(
      'INSERT INTO product_views (client_id, session_id, category, subcat, slug) VALUES (?, ?, ?, ?, ?)'
    ).run(clientId || null, sessionId || null, category, sub, slug);
  } catch (e) {}
}

/** توصيات ذكية: استناداً لمشاهدات العميل وطلباته و"اشتراه معاً" */
function getProductRecommendations(options = {}) {
  const { clientId, sessionId, category, subcat, slug, limit = 8 } = options;
  const limitNum = Math.min(parseInt(limit, 10) || 8, 20);
  const products = db.getProductsNested();
  const flat = [];
  if (products.hardware && typeof products.hardware === 'object') {
    Object.keys(products.hardware).forEach((sub) => {
      const subObj = products.hardware[sub];
      if (subObj && typeof subObj === 'object') {
        Object.keys(subObj).forEach((sl) => {
          const p = subObj[sl];
          if (p && p.name) flat.push({ category: 'hardware', subcat: sub, slug: sl, ...p });
        });
      }
    });
  }
  ['game_cards', 'skins', 'software', 'Software'].forEach((cat) => {
    const catObj = products[cat];
    if (catObj && typeof catObj === 'object') {
      Object.keys(catObj).forEach((sl) => {
        const p = catObj[sl];
        if (p && p.name) flat.push({ category: cat, subcat: '', slug: sl, ...p });
      });
    }
  });
  const byKey = (c, s, sl) => c + '|' + (s || '') + '|' + sl;

  let scored = new Map();
  flat.forEach((p) => {
    const key = byKey(p.category, p.subcat, p.slug);
    scored.set(key, { ...p, score: 0 });
  });

  if (clientId || sessionId) {
    const viewRows = db.prepare(`
      SELECT category, subcat, slug, created_at FROM product_views
      WHERE (client_id = ? OR session_id = ?) AND datetime(created_at) > datetime('now', '-30 days')
      ORDER BY created_at DESC LIMIT 200
    `).all(clientId || null, sessionId || null);
    const recentSlugs = new Set();
    viewRows.forEach((r) => {
      recentSlugs.add(byKey(r.category, r.subcat, r.slug));
      const entry = scored.get(byKey(r.category, r.subcat, r.slug));
      if (entry) entry.score += 3;
    });
    viewRows.forEach((r, i) => {
      flat.filter((p) => p.category === r.category && (p.subcat || '') === (r.subcat || '') && p.slug !== r.slug)
        .slice(0, 3).forEach((p) => {
          const k = byKey(p.category, p.subcat, p.slug);
          const e = scored.get(k);
          if (e) e.score += 2 - i * 0.1;
        });
    });

    const orderRows = db.prepare(`
      SELECT product_category, product_subcat, product_slug FROM orders
      WHERE client_id = ? AND status = 'completed' AND product_slug IS NOT NULL
    `).all(clientId || 0);
    orderRows.forEach((r) => {
      flat.filter((p) => p.category === r.product_category && (p.subcat || '') === (r.product_subcat || '') && p.slug !== r.product_slug)
        .slice(0, 2).forEach((p) => {
          const k = byKey(p.category, p.subcat, p.slug);
          const e = scored.get(k);
          if (e) e.score += 4;
        });
    });
  }

  if (category && slug) {
    const sameCat = flat.filter((p) => p.category === category && byKey(p.category, p.subcat, p.slug) !== byKey(category, subcat || '', slug));
    sameCat.slice(0, 5).forEach((p) => {
      const k = byKey(p.category, p.subcat, p.slug);
      const e = scored.get(k);
      if (e) e.score += 5;
    });
  }

  const result = Array.from(scored.values())
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limitNum);
  if (result.length >= limitNum) return result;

  const fallback = flat
    .filter((p) => !category || p.category !== category || p.slug !== slug)
    .sort(() => Math.random() - 0.5)
    .slice(0, limitNum - result.length);
  return [...result, ...fallback].slice(0, limitNum);
}

function migrateClientsPasswordReset() {
  const info = db.prepare('PRAGMA table_info(clients)').all();
  const has = (name) => info.some((c) => c.name === name);
  if (!has('password_reset_token')) db.exec('ALTER TABLE clients ADD COLUMN password_reset_token TEXT');
  if (!has('password_reset_sent_at')) db.exec('ALTER TABLE clients ADD COLUMN password_reset_sent_at TEXT');
}

/** تنظيف عناوين البريد المخزنة: أخذ الجزء قبل أول مسافة أو فاصلة لتجنب "user@domain.com domain.com". */
function migrateClientsEmailSanitize() {
  try {
    const rows = db.prepare('SELECT id, email FROM clients WHERE email IS NOT NULL AND email != ""').all();
    for (const r of rows) {
      const raw = String(r.email).trim();
      const first = raw.split(/[\s,;]+/)[0];
      const clean = (first && first.indexOf('@') > 0) ? first : raw;
      if (clean !== raw) {
        db.prepare('UPDATE clients SET email = ? WHERE id = ?').run(clean, r.id);
      }
    }
  } catch (e) {}
}

function migrateVendorsProfileColumns() {
  const info = db.prepare('PRAGMA table_info(vendors)').all();
  const has = (name) => info.some((c) => c.name === name);
  if (!has('logo')) db.exec('ALTER TABLE vendors ADD COLUMN logo TEXT');
  if (!has('response_time_hours')) db.exec('ALTER TABLE vendors ADD COLUMN response_time_hours INTEGER');
  if (!has('notify_by_email')) db.exec('ALTER TABLE vendors ADD COLUMN notify_by_email INTEGER NOT NULL DEFAULT 1');
  if (!has('notify_by_dashboard')) db.exec('ALTER TABLE vendors ADD COLUMN notify_by_dashboard INTEGER NOT NULL DEFAULT 1');
  if (!has('anydesk_id')) db.exec('ALTER TABLE vendors ADD COLUMN anydesk_id TEXT');
}

function migrateVendorsSecurityColumns() {
  const info = db.prepare('PRAGMA table_info(vendors)').all();
  const has = (name) => info.some((c) => c.name === name);
  if (!has('logout_all_before')) db.exec('ALTER TABLE vendors ADD COLUMN logout_all_before TEXT');
  if (!has('totp_secret')) db.exec('ALTER TABLE vendors ADD COLUMN totp_secret TEXT');
  if (!has('totp_enabled')) db.exec('ALTER TABLE vendors ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0');
}

function migrateVendorActivityLogTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    )
  `);
}

function migrateVendorApiKeysTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL,
      key_hash TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(key_hash),
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    )
  `);
}

function migrateVendorsWebhookColumns() {
  const info = db.prepare('PRAGMA table_info(vendors)').all();
  const has = (name) => info.some((c) => c.name === name);
  if (!has('webhook_url')) db.exec('ALTER TABLE vendors ADD COLUMN webhook_url TEXT');
  if (!has('webhook_secret')) db.exec('ALTER TABLE vendors ADD COLUMN webhook_secret TEXT');
}

/* N5 — السلة المهجورة: حفظ سلة زائر/عميل للتذكير لاحقاً */
function migrateAbandonedCartTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS abandoned_cart (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NULL,
      email TEXT NULL,
      items_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      reminded INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );
    CREATE INDEX IF NOT EXISTS idx_abandoned_cart_updated ON abandoned_cart(updated_at);
    CREATE INDEX IF NOT EXISTS idx_abandoned_cart_reminded ON abandoned_cart(reminded);
  `);
}

function saveAbandonedCart(clientId, email, items) {
  const itemsJson = JSON.stringify(Array.isArray(items) ? items : []);
  if (clientId != null) {
    const existing = db.prepare('SELECT id FROM abandoned_cart WHERE client_id = ?').get(clientId);
    if (existing) {
      db.prepare('UPDATE abandoned_cart SET items_json = ?, updated_at = datetime(\'now\'), reminded = 0 WHERE client_id = ?').run(itemsJson, clientId);
      return existing.id;
    }
    const r = db.prepare('INSERT INTO abandoned_cart (client_id, email, items_json) VALUES (?, ?, ?)').run(clientId, email || null, itemsJson);
    return r.lastInsertRowid;
  }
  if (email && email.trim()) {
    const existing = db.prepare('SELECT id FROM abandoned_cart WHERE email = ? AND client_id IS NULL').get(email.trim());
    if (existing) {
      db.prepare('UPDATE abandoned_cart SET items_json = ?, updated_at = datetime(\'now\'), reminded = 0 WHERE id = ?').run(itemsJson, existing.id);
      return existing.id;
    }
    const r = db.prepare('INSERT INTO abandoned_cart (client_id, email, items_json) VALUES (NULL, ?, ?)').run(email.trim(), itemsJson);
    return r.lastInsertRowid;
  }
  return null;
}

function getAbandonedCartsOlderThan(hoursAgo, limit) {
  const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
  const rows = db.prepare(`
    SELECT id, client_id, email, items_json, updated_at
    FROM abandoned_cart
    WHERE reminded = 0 AND datetime(updated_at) <= datetime('now', '-' || ? || ' hours')
    ORDER BY updated_at ASC
    LIMIT ?
  `).all(hoursAgo, limitNum);
  return rows.map((r) => ({
    id: r.id,
    client_id: r.client_id,
    email: r.email,
    items: (() => { try { return JSON.parse(r.items_json || '[]'); } catch (_) { return []; } })(),
    updated_at: r.updated_at
  }));
}

function getClientEmailById(clientId) {
  if (clientId == null) return null;
  const r = db.prepare('SELECT email FROM clients WHERE id = ?').get(clientId);
  return r ? r.email : null;
}

function markAbandonedCartReminded(id) {
  db.prepare('UPDATE abandoned_cart SET reminded = 1 WHERE id = ?').run(id);
}

function migrateClientWishlistTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS client_wishlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      subcat TEXT NOT NULL DEFAULT '',
      slug TEXT NOT NULL,
      name TEXT,
      img TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(client_id, category, subcat, slug),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `);
}

function migrateOrdersProductKey() {
  const info = db.prepare('PRAGMA table_info(orders)').all();
  const has = (name) => info.some((c) => c.name === name);
  if (!has('product_category')) db.exec('ALTER TABLE orders ADD COLUMN product_category TEXT');
  if (!has('product_subcat')) db.exec('ALTER TABLE orders ADD COLUMN product_subcat TEXT');
  if (!has('product_slug')) db.exec('ALTER TABLE orders ADD COLUMN product_slug TEXT');
}

function migrateReviewsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      subcat TEXT NOT NULL DEFAULT '',
      slug TEXT NOT NULL,
      client_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(category, subcat, slug, client_id),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `);
}

function migrateNotificationsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_type TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      link TEXT NOT NULL DEFAULT '',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function migrateSettingsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )
  `);
}

function getSetting(key) {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return r ? r.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

function migrateProductsStatus() {
  const info = db.prepare('PRAGMA table_info(products)').all();
  if (!info.some((c) => c.name === 'status')) {
    db.exec("ALTER TABLE products ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'");
  }
}

function migrateProductsOfferUntil() {
  const info = db.prepare('PRAGMA table_info(products)').all();
  if (!info.some((c) => c.name === 'offer_until')) {
    db.exec('ALTER TABLE products ADD COLUMN offer_until TEXT');
  }
}

function migrateVendorPaymentsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      note TEXT,
      paid_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    )
  `);
}

function migrateOrdersAddVendorColumns() {
  const info = db.prepare('PRAGMA table_info(orders)').all();
  const has = (name) => info.some((c) => c.name === name);
  if (!has('vendor_id')) db.exec('ALTER TABLE orders ADD COLUMN vendor_id INTEGER');
  if (!has('commission_amount')) db.exec('ALTER TABLE orders ADD COLUMN commission_amount INTEGER');
}

function migrateOrdersAddClientId() {
  const info = db.prepare('PRAGMA table_info(orders)').all();
  if (!info.some((c) => c.name === 'client_id')) db.exec('ALTER TABLE orders ADD COLUMN client_id INTEGER');
}

function migrateOrdersStatus() {
  const info = db.prepare('PRAGMA table_info(orders)').all();
  if (!info.some((c) => c.name === 'status')) db.exec("ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
  if (!info.some((c) => c.name === 'completed_at')) db.exec('ALTER TABLE orders ADD COLUMN completed_at TEXT');
}

function migrateOrdersEstimatedDelivery() {
  const info = db.prepare('PRAGMA table_info(orders)').all();
  if (!info.some((c) => c.name === 'estimated_delivery')) db.exec('ALTER TABLE orders ADD COLUMN estimated_delivery TEXT');
}

function migrateOrdersPaymentStripe() {
  const info = db.prepare('PRAGMA table_info(orders)').all();
  if (!info.some((c) => c.name === 'payment_status')) db.exec('ALTER TABLE orders ADD COLUMN payment_status TEXT');
  if (!info.some((c) => c.name === 'stripe_session_id')) db.exec('ALTER TABLE orders ADD COLUMN stripe_session_id TEXT');
}

function migrateNewsletterTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS newsletter (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      token TEXT NOT NULL,
      confirmed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function migrateOrderMessagesTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      from_role TEXT NOT NULL,
      from_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);
}

function migrateProductsFromJson() {
  const jsonPath = fs.existsSync(PRODUCTS_JSON) ? PRODUCTS_JSON : (fs.existsSync(PRODUCTS_JSON + '.migrated') ? PRODUCTS_JSON + '.migrated' : null);
  if (!jsonPath) return;
  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const insert = db.prepare(
      `INSERT OR IGNORE INTO products (vendor_id, category, subcat, slug, name, desc, images_json, prices_json, discount, old_price, tags_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const run = db.transaction(() => {
      for (const category of Object.keys(data)) {
        const cat = data[category];
        if (!cat || typeof cat !== 'object') continue;
        if (category === 'hardware') {
          for (const subcat of Object.keys(cat)) {
            const sub = cat[subcat];
            if (!sub || typeof sub !== 'object') continue;
            for (const slug of Object.keys(sub)) {
              const p = sub[slug];
              if (!p || !p.name) continue;
              insert.run(
                null,
                category,
                subcat,
                slug,
                p.name,
                p.desc || '',
                JSON.stringify(p.images || []),
                JSON.stringify(p.prices || []),
                p.discount ?? null,
                p.oldPrice ?? null,
                p.tags ? JSON.stringify(p.tags) : null
              );
            }
          }
        } else {
          for (const slug of Object.keys(cat)) {
            const p = cat[slug];
            if (!p || typeof p !== 'object' || !p.name) continue;
            insert.run(
              null,
              category,
              '',
              slug,
              p.name,
              p.desc || '',
              JSON.stringify(p.images || []),
              JSON.stringify(p.prices || []),
              p.discount ?? null,
              p.oldPrice ?? null,
              p.tags ? JSON.stringify(p.tags) : null
            );
          }
        }
      }
    });
    run();
    if (jsonPath === PRODUCTS_JSON) {
      try { fs.renameSync(PRODUCTS_JSON, PRODUCTS_JSON + '.migrated'); } catch (e) {}
    }
  } catch (e) {
    console.warn('Products migration warning:', e.message);
  }
}

function migrateFromJson() {
  try {
    const ordersPath = fs.existsSync(ORDERS_JSON) ? ORDERS_JSON : (fs.existsSync(ORDERS_JSON + '.migrated') ? ORDERS_JSON + '.migrated' : null);
    if (ordersPath) {
      const orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
      if (Array.isArray(orders) && orders.length > 0) {
        const stmt = db.prepare(
          'INSERT OR IGNORE INTO orders (id, date, product, value, name, phone, email, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        const run = db.transaction((items) => {
          for (const o of items) {
            stmt.run(
              o.id || 'ORD-' + Date.now(),
              o.date || new Date().toISOString(),
              o.product || '',
              o.value || '',
              o.name || '',
              o.phone || '',
              o.email || '',
              o.address || ''
            );
          }
        });
        run(orders);
        if (ordersPath === ORDERS_JSON) {
          try { fs.renameSync(ORDERS_JSON, ORDERS_JSON + '.migrated'); } catch (e) {}
        }
      }
    }
  } catch (e) {
    console.warn('Orders migration warning:', e.message);
  }

  try {
    const contactsPath = fs.existsSync(CONTACTS_JSON) ? CONTACTS_JSON : (fs.existsSync(CONTACTS_JSON + '.migrated') ? CONTACTS_JSON + '.migrated' : null);
    if (contactsPath) {
      const contacts = JSON.parse(fs.readFileSync(contactsPath, 'utf8'));
      if (Array.isArray(contacts) && contacts.length > 0) {
        const stmt = db.prepare(
          'INSERT INTO contacts (date, name, email, subject, message) VALUES (?, ?, ?, ?, ?)'
        );
        const run = db.transaction((items) => {
          for (const c of items) {
            stmt.run(
              c.date || new Date().toISOString(),
              c.name || '',
              c.email || '',
              c.subject || '',
              c.message || ''
            );
          }
        });
        run(contacts);
        if (contactsPath === CONTACTS_JSON) {
          try { fs.renameSync(CONTACTS_JSON, CONTACTS_JSON + '.migrated'); } catch (e) {}
        }
      }
    }
  } catch (e) {
    console.warn('Contacts migration warning:', e.message);
  }
}

function migrateClientsFromJson() {
  const jsonPath = fs.existsSync(CLIENTS_JSON) ? CLIENTS_JSON : (fs.existsSync(CLIENTS_JSON + '.migrated') ? CLIENTS_JSON + '.migrated' : null);
  if (!jsonPath) return;
  try {
    const clients = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (!Array.isArray(clients) || clients.length === 0) return;
    let bcrypt;
    try { bcrypt = require('bcrypt'); } catch (e) { console.warn('clients migration needs bcrypt'); return; }
    const stmt = db.prepare('INSERT OR IGNORE INTO clients (email, password_hash, name, phone) VALUES (?, ?, ?, ?)');
    const run = db.transaction((items) => {
      for (const c of items) {
        const email = (c.email || '').trim().toLowerCase();
        if (!email) continue;
        const hash = c.password_hash || bcrypt.hashSync('migrated-' + email + '-' + Date.now(), 10);
        stmt.run(email, hash, (c.name || '').trim() || email, (c.phone || '').trim() || '');
      }
    });
    run(clients);
    if (jsonPath === CLIENTS_JSON) {
      try { fs.renameSync(CLIENTS_JSON, CLIENTS_JSON + '.migrated'); } catch (e) {}
    }
  } catch (e) {
    console.warn('Clients migration warning:', e.message);
  }
}

function migrateVendorsFromJson() {
  const jsonPath = fs.existsSync(VENDORS_JSON) ? VENDORS_JSON : (fs.existsSync(VENDORS_JSON + '.migrated') ? VENDORS_JSON + '.migrated' : null);
  if (!jsonPath) return;
  try {
    const vendors = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (!Array.isArray(vendors) || vendors.length === 0) return;
    let bcrypt;
    try { bcrypt = require('bcrypt'); } catch (e) { console.warn('vendors migration needs bcrypt'); return; }
    const stmt = db.prepare('INSERT OR IGNORE INTO vendors (email, password_hash, name, phone, status) VALUES (?, ?, ?, ?, ?)');
    const run = db.transaction((items) => {
      for (const v of items) {
        const email = (v.email || '').trim().toLowerCase();
        if (!email) continue;
        const hash = v.password_hash || bcrypt.hashSync('migrated-' + email + '-' + Date.now(), 10);
        const status = (v.status || 'pending').toLowerCase();
        const s = ['approved', 'rejected', 'pending'].includes(status) ? status : 'pending';
        stmt.run(email, hash, (v.name || '').trim() || email, (v.phone || '').trim() || '', s);
      }
    });
    run(vendors);
    if (jsonPath === VENDORS_JSON) {
      try { fs.renameSync(VENDORS_JSON, VENDORS_JSON + '.migrated'); } catch (e) {}
    }
  } catch (e) {
    console.warn('Vendors migration warning:', e.message);
  }
}

function migrateClientsFromOrders() {
  try {
    const info = db.prepare('PRAGMA table_info(orders)').all();
    const hasClientId = info.some((c) => c.name === 'client_id');
    let orders;
    if (hasClientId) {
      orders = db.prepare('SELECT id, email, name, phone FROM orders WHERE client_id IS NULL AND email IS NOT NULL AND email != ""').all();
    } else {
      orders = db.prepare('SELECT id, email, name, phone FROM orders WHERE email IS NOT NULL AND email != ""').all();
    }
    if (!orders || orders.length === 0) return;
    let bcrypt;
    try { bcrypt = require('bcrypt'); } catch (e) {
      console.warn('migrateClientsFromOrders: bcrypt غير متوفر — تثبيت: npm install bcrypt');
      return;
    }
    const seen = new Set();
    const updateByEmail = hasClientId ? db.prepare('UPDATE orders SET client_id = ? WHERE client_id IS NULL AND LOWER(TRIM(email)) = ?') : null;
    const insertClient = db.prepare('INSERT OR IGNORE INTO clients (email, password_hash, name, phone) VALUES (?, ?, ?, ?)');
    const getClient = db.prepare('SELECT id FROM clients WHERE LOWER(TRIM(email)) = ?');
    const run = db.transaction(() => {
      for (const o of orders) {
        const email = (o.email || '').trim().toLowerCase();
        if (!email || seen.has(email)) continue;
        seen.add(email);
        let row = getClient.get(email);
        if (!row) {
          const hash = bcrypt.hashSync('migrated-order-' + email, 10);
          insertClient.run(email, hash, (o.name || '').trim() || email, (o.phone || '').trim() || '');
          row = getClient.get(email);
        }
        if (row && updateByEmail) updateByEmail.run(row.id, email);
      }
    });
    run();
  } catch (e) {
    console.warn('Clients from orders migration warning:', e.message);
  }
}

/** بعد كل الترحيلات: إذا جدول العملاء فارغ والطلبات تحتوي بريداً، إنشاء عملاء من الطلبات (استدراك) */
function ensureClientsFromOrdersIfEmpty() {
  try {
    const clientCount = db.prepare('SELECT COUNT(*) AS n FROM clients').get().n;
    if (clientCount > 0) return;
    const orderCount = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE email IS NOT NULL AND email != ""').get().n;
    if (orderCount === 0) return;
    migrateClientsFromOrders();
  } catch (e) {}
}

function getOrders() {
  const info = db.prepare('PRAGMA table_info(orders)').all();
  const has = (name) => info.some((c) => c.name === name);
  const hasVendor = has('vendor_id');
  const hasClient = has('client_id');
  const hasCommission = has('commission_amount');
  const hasStatus = has('status');
  const hasCompleted = has('completed_at');
  const hasEst = has('estimated_delivery');
  const hasPayment = has('payment_status');
  let cols = 'o.id, o.date, o.product, o.value, o.name, o.phone, o.email, o.address';
  if (hasVendor) cols += ', o.vendor_id';
  if (hasCommission) cols += ', o.commission_amount';
  if (hasClient) cols += ', o.client_id';
  if (hasStatus) cols += ', o.status';
  if (hasCompleted) cols += ', o.completed_at';
  if (hasEst) cols += ', o.estimated_delivery';
  if (hasPayment) cols += ', o.payment_status';
  let subqueries = '';
  if (hasClient) subqueries += ', (SELECT c.email FROM clients c WHERE c.id = o.client_id) AS client_email';
  else subqueries += ', NULL AS client_email';
  if (hasVendor) subqueries += ', (SELECT v.name FROM vendors v WHERE v.id = o.vendor_id) AS vendor_name';
  else subqueries += ', NULL AS vendor_name';
  let rows;
  try {
    rows = db.prepare(`SELECT ${cols}${subqueries} FROM orders o ORDER BY o.date DESC`).all();
  } catch (e) {
    return [];
  }
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    product: r.product,
    value: r.value,
    name: r.name,
    phone: r.phone,
    email: r.email,
    address: r.address,
    vendor_id: hasVendor ? (r.vendor_id ?? null) : null,
    vendor_name: r.vendor_name || null,
    commission_amount: hasCommission ? (r.commission_amount ?? null) : null,
    client_id: hasClient ? (r.client_id ?? null) : null,
    client_email: r.client_email || null,
    status: hasStatus ? (r.status || 'pending') : 'pending',
    completed_at: hasCompleted ? (r.completed_at || null) : null,
    estimated_delivery: hasEst ? (r.estimated_delivery || null) : null,
    payment_status: hasPayment && r.payment_status ? r.payment_status : null
  }));
}

function addOrder(order) {
  const info = db.prepare('PRAGMA table_info(orders)').all();
  const hasCol = (name) => info.some((c) => c.name === name);
  const hasCoupon = hasCol('coupon_code');
  const hasDiscount = hasCol('coupon_discount_amount');
  const hasShipping = hasCol('shipping_amount');
  const hasShipDiscount = hasCol('shipping_discount_amount');
  const couponCol = hasCoupon ? ', coupon_code' : '';
  const discountCol = hasDiscount ? ', coupon_discount_amount' : '';
  const shipCol = hasShipping ? ', shipping_amount' : '';
  const shipDiscCol = hasShipDiscount ? ', shipping_discount_amount' : '';
  const couponPlace = hasCoupon ? ', ?' : '';
  const discountPlace = hasDiscount ? ', ?' : '';
  const shipPlace = hasShipping ? ', ?' : '';
  const shipDiscPlace = hasShipDiscount ? ', ?' : '';
  if (hasCol('product_category') && hasCol('product_subcat') && hasCol('product_slug')) {
    db.prepare(
      `INSERT INTO orders (id, date, product, value, name, phone, email, address, vendor_id, commission_amount, client_id, status, completed_at, product_category, product_subcat, product_slug${couponCol}${discountCol}${shipCol}${shipDiscCol})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${couponPlace}${discountPlace}${shipPlace}${shipDiscPlace})`
    ).run(
      order.id,
      order.date,
      order.product || '',
      order.value || '',
      order.name,
      order.phone,
      order.email || '',
      order.address || '',
      order.vendor_id ?? null,
      order.commission_amount ?? null,
      order.client_id ?? null,
      order.status || 'pending',
      order.completed_at ?? null,
      order.product_category ?? null,
      order.product_subcat ?? null,
      order.product_slug ?? null,
      ...(hasCoupon ? [order.coupon_code ?? null] : []),
      ...(hasDiscount ? [order.coupon_discount_amount ?? null] : []),
      ...(hasShipping ? [order.shipping_amount ?? null] : []),
      ...(hasShipDiscount ? [order.shipping_discount_amount ?? null] : [])
    );
    return;
  }
  db.prepare(
    `INSERT INTO orders (id, date, product, value, name, phone, email, address, vendor_id, commission_amount, client_id, status, completed_at${couponCol}${discountCol}${shipCol}${shipDiscCol})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${couponPlace}${discountPlace}${shipPlace}${shipDiscPlace})`
  ).run(
    order.id,
    order.date,
    order.product || '',
    order.value || '',
    order.name,
    order.phone,
    order.email || '',
    order.address || '',
    order.vendor_id ?? null,
    order.commission_amount ?? null,
    order.client_id ?? null,
    order.status || 'pending',
    order.completed_at ?? null,
    ...(hasCoupon ? [order.coupon_code ?? null] : []),
    ...(hasDiscount ? [order.coupon_discount_amount ?? null] : []),
    ...(hasShipping ? [order.shipping_amount ?? null] : []),
    ...(hasShipDiscount ? [order.shipping_discount_amount ?? null] : [])
  );
}

function getOrderCountByClientId(clientId) {
  if (clientId == null) return 0;
  const r = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE client_id = ?').get(clientId);
  return r && r.n != null ? r.n : 0;
}

function getOrderById(orderId) {
  const info = db.prepare('PRAGMA table_info(orders)').all();
  const hasCol = (n) => info.some((c) => c.name === n);
  let cols = hasCol('product_category') ? 'id, date, product, value, name, phone, email, address, vendor_id, commission_amount, client_id, status, completed_at, product_category, product_subcat, product_slug' : 'id, date, product, value, name, phone, email, address, vendor_id, commission_amount, client_id, status, completed_at';
  if (hasCol('estimated_delivery')) cols += ', estimated_delivery';
  if (hasCol('payment_status')) cols += ', payment_status';
  if (hasCol('stripe_session_id')) cols += ', stripe_session_id';
  if (hasCol('coupon_code')) cols += ', coupon_code';
  if (hasCol('coupon_discount_amount')) cols += ', coupon_discount_amount';
  if (hasCol('shipping_amount')) cols += ', shipping_amount';
  if (hasCol('shipping_discount_amount')) cols += ', shipping_discount_amount';
  const r = db.prepare('SELECT ' + cols + ' FROM orders WHERE id = ?').get(orderId);
  if (!r) return null;
  const out = {
    id: r.id,
    date: r.date,
    product: r.product,
    value: r.value,
    name: r.name,
    phone: r.phone,
    email: r.email,
    address: r.address,
    vendor_id: r.vendor_id ?? null,
    commission_amount: r.commission_amount ?? null,
    client_id: r.client_id ?? null,
    status: r.status || 'pending',
    completed_at: r.completed_at || null
  };
  if (r.product_category != null) out.product_category = r.product_category;
  if (r.product_subcat != null) out.product_subcat = r.product_subcat;
  if (r.product_slug != null) out.product_slug = r.product_slug;
  if (hasCol('estimated_delivery') && r.estimated_delivery != null) out.estimated_delivery = r.estimated_delivery;
  if (hasCol('payment_status') && r.payment_status != null) out.payment_status = r.payment_status;
  if (hasCol('stripe_session_id') && r.stripe_session_id != null) out.stripe_session_id = r.stripe_session_id;
  if (hasCol('coupon_code') && r.coupon_code != null) out.coupon_code = r.coupon_code;
  if (hasCol('coupon_discount_amount') && r.coupon_discount_amount != null) out.coupon_discount_amount = r.coupon_discount_amount;
  if (hasCol('shipping_amount') && r.shipping_amount != null) out.shipping_amount = r.shipping_amount;
  if (hasCol('shipping_discount_amount') && r.shipping_discount_amount != null) out.shipping_discount_amount = r.shipping_discount_amount;
  return out;
}

function updateOrderEstimatedDelivery(orderId, estimatedDelivery) {
  const info = db.prepare('PRAGMA table_info(orders)').all();
  if (!info.some((c) => c.name === 'estimated_delivery')) return;
  db.prepare('UPDATE orders SET estimated_delivery = ? WHERE id = ?').run(estimatedDelivery || null, orderId);
}

function updateOrderStatus(orderId, status, completedAt) {
  db.prepare('UPDATE orders SET status = ?, completed_at = ? WHERE id = ?').run(status, completedAt || null, orderId);
}

function bulkUpdateOrderStatus(orderIds, status) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) return { updated: 0 };
  const completedAt = (status === 'completed') ? new Date().toISOString() : null;
  const stmt = db.prepare('UPDATE orders SET status = ?, completed_at = ? WHERE id = ?');
  let updated = 0;
  const run = db.transaction(() => {
    for (const id of orderIds) {
      if (id && String(id).trim()) {
        const r = stmt.run(status, completedAt, String(id).trim());
        updated += r.changes;
      }
    }
  });
  run();
  return { updated };
}

function bulkUpdateProductStatus(items, status) {
  if (!Array.isArray(items) || items.length === 0 || !status) return { updated: 0 };
  const stmt = db.prepare('UPDATE products SET status = ? WHERE category = ? AND subcat = ? AND slug = ?');
  let updated = 0;
  const run = db.transaction(() => {
    for (const it of items) {
      const cat = it.category || it.product_category;
      const sub = (it.subcat || it.product_subcat || '').trim();
      const slug = it.slug || it.product_slug;
      if (cat && slug) {
        const r = stmt.run(status, cat, sub, slug);
        updated += r.changes;
      }
    }
  });
  run();
  return { updated };
}

function getVendorsPerformance() {
  const vendors = db.prepare('SELECT id, name, email FROM vendors WHERE status = ?').all('approved');
  const perf = [];
  for (const v of vendors) {
    const orders = db.prepare(
      'SELECT id, date, completed_at, status FROM orders WHERE vendor_id = ? ORDER BY date DESC'
    ).all(v.id);
    const totalOrders = orders.length;
    const completedOrders = orders.filter((o) => o.status === 'completed');
    let avgCompletionHours = null;
    if (completedOrders.length > 0) {
      let totalHours = 0;
      let count = 0;
      for (const o of completedOrders) {
        const d1 = o.date ? new Date(o.date).getTime() : 0;
        const d2 = o.completed_at ? new Date(o.completed_at).getTime() : 0;
        if (d1 && d2) {
          totalHours += (d2 - d1) / (1000 * 60 * 60);
          count++;
        }
      }
      avgCompletionHours = count > 0 ? Math.round((totalHours / count) * 10) / 10 : null;
    }
    const withReply = db.prepare(
      'SELECT COUNT(DISTINCT m.order_id) AS c FROM order_messages m JOIN orders o ON o.id = m.order_id WHERE m.from_role = ? AND o.vendor_id = ?'
    ).get('vendor', v.id);
    const repliedCount = withReply ? (withReply.c || 0) : 0;
    const responseRate = totalOrders > 0 ? Math.round((repliedCount / totalOrders) * 100) : 0;
    perf.push({
      vendor_id: v.id,
      vendor_name: v.name || v.email,
      vendor_email: v.email,
      order_count: totalOrders,
      response_rate: responseRate,
      avg_completion_hours: avgCompletionHours
    });
  }
  const delayed = getOrdersPendingVendorReply();
  return { vendors: perf, delayed_vendors: delayed };
}

function updateOrderPaymentStatus(orderId, stripeSessionId, paymentStatus) {
  const info = db.prepare('PRAGMA table_info(orders)').all();
  if (!info.some((c) => c.name === 'payment_status')) return;
  if (!info.some((c) => c.name === 'stripe_session_id')) return;
  db.prepare('UPDATE orders SET payment_status = ?, stripe_session_id = ? WHERE id = ?').run(paymentStatus || 'paid', stripeSessionId || null, orderId);
}

function deleteOrder(orderId) {
  if (!orderId || String(orderId).trim() === '') return false;
  const id = String(orderId).trim();
  const o = db.prepare('SELECT id FROM orders WHERE id = ?').get(id);
  if (!o) return false;
  db.transaction(() => {
    db.prepare('DELETE FROM order_messages WHERE order_id = ?').run(id);
    db.prepare('DELETE FROM orders WHERE id = ?').run(id);
  })();
  return true;
}

function getOrderMessages(orderId) {
  const rows = db.prepare(
    'SELECT id, order_id, from_role, from_id, body, created_at FROM order_messages WHERE order_id = ? ORDER BY created_at ASC'
  ).all(orderId);
  return rows.map((r) => ({
    id: r.id,
    order_id: r.order_id,
    from_role: r.from_role,
    from_id: r.from_id,
    body: r.body,
    created_at: r.created_at
  }));
}

function addOrderMessage(orderId, fromRole, fromId, body) {
  db.prepare(
    'INSERT INTO order_messages (order_id, from_role, from_id, body) VALUES (?, ?, ?, ?)'
  ).run(orderId, fromRole, fromId, String(body).trim());
  const r = db.prepare('SELECT id, created_at FROM order_messages WHERE order_id = ? ORDER BY id DESC LIMIT 1').get(orderId);
  return { id: r.id, created_at: r.created_at };
}

function getOrdersPendingVendorReply() {
  const rows = db.prepare(
    `SELECT o.id, o.date, o.product, o.value, o.name, o.phone, o.vendor_id
     FROM orders o
     WHERE o.vendor_id IS NOT NULL AND (o.status IS NULL OR o.status = 'pending')
     AND datetime(o.date) < datetime('now', '-1 hour')
     AND NOT EXISTS (SELECT 1 FROM order_messages m WHERE m.order_id = o.id AND m.from_role = 'vendor')
     ORDER BY o.date ASC`
  ).all();
  return rows.map((r) => {
    const vendor = r.vendor_id ? getVendorById(r.vendor_id) : null;
    return {
      id: r.id,
      date: r.date,
      product: r.product,
      value: r.value,
      name: r.name,
      phone: r.phone,
      vendor_id: r.vendor_id,
      vendor_name: vendor ? vendor.name : null,
      vendor_phone: vendor ? vendor.phone : null
    };
  });
}

function getContacts() {
  const rows = db.prepare('SELECT id, date, name, email, subject, message FROM contacts ORDER BY date DESC').all();
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    name: r.name,
    email: r.email,
    subject: r.subject,
    message: r.message
  }));
}

function addContact(contact) {
  db.prepare(
    'INSERT INTO contacts (date, name, email, subject, message) VALUES (?, ?, ?, ?, ?)'
  ).run(
    contact.date,
    contact.name,
    contact.email || '',
    contact.subject || '',
    contact.message
  );
}

/** توحيد مفاتيح الفئات (أحرف صغيرة) عند جلب المنتجات من JSON لضمان تطابق الواجهة */
function normalizeNestedProductKeys(data) {
  if (!data || typeof data !== 'object') return data;
  const out = {};
  for (const cat of Object.keys(data)) {
    const catNorm = (cat || '').trim().toLowerCase();
    const val = data[cat];
    if (catNorm === 'hardware' && val && typeof val === 'object' && !Array.isArray(val)) {
      out.hardware = {};
      for (const sub of Object.keys(val)) {
        const subNorm = (sub || '').trim().toLowerCase();
        if (val[sub] && typeof val[sub] === 'object') out.hardware[subNorm] = val[sub];
      }
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      out[catNorm] = val;
    }
  }
  return out;
}

function getProductsNested() {
  const info = db.prepare('PRAGMA table_info(products)').all();
  const hasStatus = info.some((c) => c.name === 'status');
  const statusWhere = hasStatus ? ' WHERE (status IS NULL OR status = \'approved\')' : '';
  let rows;
  try {
    rows = db.prepare(
      `SELECT vendor_id, category, subcat, slug, name, desc, images_json, prices_json, discount, old_price, tags_json, offer_until
       FROM products${statusWhere} ORDER BY category, subcat, slug`
    ).all();
  } catch (e) {
    rows = [];
  }
  const out = {};
  for (const r of rows) {
    const catRaw = (r.category || '').trim();
    const cat = catRaw.toLowerCase();
    const subcatRaw = (r.subcat || '').trim();
    const subcatKey = subcatRaw.toLowerCase();
    if (cat === 'hardware') {
      if (!out.hardware) out.hardware = {};
      if (!out.hardware[subcatKey]) out.hardware[subcatKey] = {};
      out.hardware[subcatKey][r.slug] = rowToProduct(r);
    } else {
      if (!out[cat]) out[cat] = {};
      out[cat][r.slug] = rowToProduct(r);
    }
  }
  if (rows.length === 0 && (fs.existsSync(PRODUCTS_JSON) || fs.existsSync(PRODUCTS_JSON + '.migrated'))) {
    const jsonPath = fs.existsSync(PRODUCTS_JSON) ? PRODUCTS_JSON : PRODUCTS_JSON + '.migrated';
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (data && typeof data === 'object') return normalizeNestedProductKeys(data);
    } catch (e) {}
  }
  if (!out.game_cards) out.game_cards = {};
  if (!out.skins) out.skins = {};
  if (!out.hardware) out.hardware = {};
  if (!out.software) out.software = {};
  return out;
}

function safeJsonParse(str, fallback) {
  if (str == null || str === '') return fallback;
  try {
    const parsed = JSON.parse(str);
    return parsed != null ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
}

function rowToProduct(r) {
  const product = {
    name: r.name,
    desc: r.desc || '',
    images: safeJsonParse(r.images_json, []),
    prices: safeJsonParse(r.prices_json, [])
  };
  if (r.vendor_id != null) product.vendor_id = r.vendor_id;
  if (r.discount != null) product.discount = r.discount;
  if (r.old_price) product.oldPrice = r.old_price;
  if (r.tags_json) product.tags = safeJsonParse(r.tags_json, []);
  if (r.offer_until) product.offer_until = r.offer_until;
  return product;
}

function getProductByKey(category, subcat, slug) {
  const cat = (category || '').trim();
  const sub = (subcat || '').trim();
  let row = db.prepare(
    'SELECT id, vendor_id, category, subcat, slug, name, desc, images_json, prices_json, discount, old_price, tags_json, offer_until, status FROM products WHERE category = ? AND subcat = ? AND slug = ?'
  ).get(cat, sub, slug);
  if (row) return row;
  row = db.prepare(
    'SELECT id, vendor_id, category, subcat, slug, name, desc, images_json, prices_json, discount, old_price, tags_json, offer_until, status FROM products WHERE LOWER(TRIM(category)) = LOWER(?) AND LOWER(TRIM(subcat)) = LOWER(?) AND slug = ?'
  ).get(cat, sub, slug);
  return row || null;
}

/** احتياطي: البحث بالـ slug فقط عند عدم التطابق (category/subcat قد يكونان خاطئين أو مختلفي الحالة) */
function getProductBySlugOnly(slug) {
  if (!slug || String(slug).trim() === '') return null;
  const row = db.prepare(
    `SELECT id, vendor_id, category, subcat, slug, name, desc, images_json, prices_json, discount, old_price, tags_json, offer_until, status
     FROM products WHERE slug = ? AND (status IS NULL OR status = 'approved')
     ORDER BY CASE WHEN vendor_id IS NOT NULL THEN 0 ELSE 1 END
     LIMIT 1`
  ).get(String(slug).trim());
  return row || null;
}

/** للصفحة العامة: جلب منتج بالـ slug مع أي حالة (بما فيها pending) لـ "أخبرني عند التوفر" */
function getProductBySlugAnyStatus(slug) {
  if (!slug || String(slug).trim() === '') return null;
  const row = db.prepare(
    'SELECT id, vendor_id, category, subcat, slug, name, desc, images_json, prices_json, discount, old_price, tags_json, offer_until, status FROM products WHERE slug = ? LIMIT 1'
  ).get(String(slug).trim());
  return row || null;
}

function addProduct(vendorId, category, subcat, slug, productData) {
  const status = vendorId != null ? 'pending' : 'approved';
  // Ensure scalar values only (no arrays) to avoid "Too many parameter values" in better-sqlite3
  const scalar = (v) => (Array.isArray(v) ? (v[0] != null ? v[0] : '') : v);
  const vals = [
    vendorId ?? null,
    scalar(category),
    String(scalar(subcat) || ''),
    scalar(slug),
    scalar(productData.name),
    String(productData.desc != null ? scalar(productData.desc) : ''),
    JSON.stringify(Array.isArray(productData.images) ? productData.images : (productData.images ? [productData.images] : [])),
    JSON.stringify(Array.isArray(productData.prices) ? productData.prices : (productData.prices ? [productData.prices] : [])),
    productData.discount != null && productData.discount !== '' ? scalar(productData.discount) : null,
    productData.oldPrice != null && productData.oldPrice !== '' ? scalar(productData.oldPrice) : null,
    productData.tags ? JSON.stringify(productData.tags) : null,
    productData.offer_until != null && productData.offer_until !== '' ? scalar(productData.offer_until) : null,
    status
  ];
  db.prepare(
    `INSERT INTO products (vendor_id, category, subcat, slug, name, desc, images_json, prices_json, discount, old_price, tags_json, offer_until, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(...vals);
}

function updateProduct(category, subcat, slug, productData, vendorId) {
  const sub = subcat || '';
  const r = db.prepare('SELECT id, vendor_id FROM products WHERE category = ? AND subcat = ? AND slug = ?').get(category, sub, slug);
  if (!r) return false;
  if (vendorId != null && r.vendor_id !== vendorId) return false;
  db.prepare(
    `UPDATE products SET name = ?, desc = ?, images_json = ?, prices_json = ?, discount = ?, old_price = ?, tags_json = ?, offer_until = ?
     WHERE category = ? AND subcat = ? AND slug = ?`
  ).run(
    productData.name,
    productData.desc || '',
    JSON.stringify(productData.images || []),
    JSON.stringify(productData.prices || []),
    productData.discount ?? null,
    productData.oldPrice ?? null,
    productData.tags ? JSON.stringify(productData.tags) : null,
    productData.offer_until ?? null,
    category,
    sub,
    slug
  );
  return true;
}

function deleteProduct(category, subcat, slug, vendorId) {
  const sub = (subcat || '').trim();
  const slugStr = (slug || '').trim();
  if (!slugStr) return false;
  let r = db.prepare('SELECT id, vendor_id, category, subcat, slug FROM products WHERE category = ? AND subcat = ? AND slug = ?').get(category, sub, slugStr);
  if (!r && vendorId === null) {
    r = db.prepare('SELECT id, vendor_id, category, subcat, slug FROM products WHERE slug = ? LIMIT 1').get(slugStr);
  }
  if (!r) return false;
  if (vendorId != null && r.vendor_id !== vendorId) return false;
  db.prepare('DELETE FROM products WHERE id = ?').run(r.id);
  return true;
}

function getProductsByVendor(vendorId) {
  const info = db.prepare('PRAGMA table_info(products)').all();
  const hasOfferUntil = info.some((c) => c.name === 'offer_until');
  const hasStatus = info.some((c) => c.name === 'status');
  let cols = 'id, category, subcat, slug, name, desc, images_json, prices_json, discount, old_price, tags_json, created_at';
  if (hasOfferUntil) cols += ', offer_until';
  if (hasStatus) cols += ', status';
  let rows;
  try {
    rows = db.prepare('SELECT ' + cols + ' FROM products WHERE vendor_id = ? ORDER BY created_at DESC').all(vendorId);
  } catch (e) {
    return [];
  }
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    subcat: r.subcat,
    slug: r.slug,
    name: r.name,
    desc: r.desc,
    images: safeJsonParse(r.images_json, []),
    prices: safeJsonParse(r.prices_json, []),
    discount: r.discount,
    oldPrice: r.old_price,
    tags: safeJsonParse(r.tags_json, null),
    offer_until: hasOfferUntil ? (r.offer_until || null) : null,
    created_at: r.created_at,
    status: hasStatus ? (r.status || 'approved') : 'approved'
  }));
}

function getProductsPendingApproval() {
  const info = db.prepare('PRAGMA table_info(products)').all();
  if (!info.some((c) => c.name === 'status')) return [];
  try {
    return db.prepare(
      `SELECT p.id, p.vendor_id, p.category, p.subcat, p.slug, p.name, p.desc, p.images_json, p.prices_json, p.discount, p.old_price, p.created_at, v.name AS vendor_name, v.email AS vendor_email
       FROM products p LEFT JOIN vendors v ON p.vendor_id = v.id WHERE p.status = 'pending' ORDER BY p.created_at DESC`
    ).all();
  } catch (e) {
    return [];
  }
}

function updateProductStatus(category, subcat, slug, status) {
  const sub = subcat || '';
  const r = db.prepare('UPDATE products SET status = ? WHERE category = ? AND subcat = ? AND slug = ?').run(status, category, sub, slug);
  return r.changes > 0;
}

/** Check if (category, subcat, slug) is taken. If exclude* are set, ignore that exact key (for edit). Returns { taken, byVendorId } where byVendorId is the owner id if taken. */
function productSlugTaken(category, subcat, slug, excludeCategory, excludeSubcat, excludeSlug) {
  const sub = subcat || '';
  const row = db.prepare('SELECT id, vendor_id FROM products WHERE category = ? AND subcat = ? AND slug = ?').get(category, sub, slug);
  if (!row) return { taken: false };
  if (excludeCategory != null && excludeSubcat != null && excludeSlug != null &&
      String(excludeCategory) === String(category) && String(excludeSubcat || '') === String(sub) && String(excludeSlug) === String(slug)) {
    return { taken: false };
  }
  return { taken: true, byVendorId: row.vendor_id };
}

/** Vendor can set own product status to 'archived' or 'approved' only. */
function updateProductStatusByVendor(category, subcat, slug, vendorId, status) {
  if (status !== 'archived' && status !== 'approved') return false;
  const sub = subcat || '';
  const r = db.prepare('SELECT id, vendor_id FROM products WHERE category = ? AND subcat = ? AND slug = ?').get(category, sub, slug);
  if (!r || r.vendor_id !== vendorId) return false;
  db.prepare('UPDATE products SET status = ? WHERE category = ? AND subcat = ? AND slug = ?').run(status, category, sub, slug);
  return true;
}

function addVendorPayment(vendorId, amount, note) {
  db.prepare(
    'INSERT INTO vendor_payments (vendor_id, amount, note) VALUES (?, ?, ?)'
  ).run(vendorId, amount, note || '');
}

function getVendorPayments(vendorId) {
  return db.prepare(
    'SELECT id, amount, note, paid_at FROM vendor_payments WHERE vendor_id = ? ORDER BY paid_at DESC'
  ).all(vendorId);
}

function getAllVendorPaymentsSummary() {
  const rows = db.prepare(
    `SELECT vendor_id, SUM(amount) AS total FROM vendor_payments GROUP BY vendor_id`
  ).all();
  return rows;
}

/** عمولة مستحقة من المورد (طلبات مكتملة فقط) */
function getVendorCommissionOwed(vendorId) {
  const r = db.prepare(
    `SELECT COALESCE(SUM(commission_amount), 0) AS total FROM orders WHERE vendor_id = ? AND status = 'completed'`
  ).get(vendorId);
  return Number(r && r.total) || 0;
}

/** مستحقات المنصة من كل الموردين: عمولة مستحقة، ما سدده المورد، المتبقي */
function getVendorsReceivables() {
  const vendors = db.prepare('SELECT id, name, email FROM vendors WHERE status = ?').all('approved');
  const paidRows = db.prepare('SELECT vendor_id, SUM(amount) AS total FROM vendor_payments GROUP BY vendor_id').all();
  const paidByVendor = {};
  paidRows.forEach((row) => { paidByVendor[row.vendor_id] = Number(row.total) || 0; });
  const result = [];
  for (const v of vendors) {
    const total_owed = getVendorCommissionOwed(v.id);
    const total_paid = paidByVendor[v.id] || 0;
    result.push({
      vendor_id: v.id,
      vendor_name: v.name || v.email,
      total_owed,
      total_paid,
      balance: Math.max(0, total_owed - total_paid)
    });
  }
  return result;
}

function getVendorByEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const normalized = String(email).trim().toLowerCase();
  const info = db.prepare('PRAGMA table_info(vendors)').all();
  const has = (name) => info.some((c) => c.name === name);
  const cols = has('totp_enabled') ? 'id, email, password_hash, name, phone, status, created_at, totp_enabled, totp_secret' : 'id, email, password_hash, name, phone, status, created_at';
  return db.prepare('SELECT ' + cols + ' FROM vendors WHERE LOWER(TRIM(email)) = ?').get(normalized) || null;
}

function getVendorById(id) {
  const info = db.prepare('PRAGMA table_info(vendors)').all();
  const has = (name) => info.some((c) => c.name === name);
  let cols = 'id, email, name, phone, status, created_at, logo, response_time_hours';
  if (has('anydesk_id')) cols += ', anydesk_id';
  if (has('logout_all_before')) cols += ', logout_all_before';
  if (has('totp_enabled')) cols += ', totp_enabled';
  if (has('notify_by_email')) cols += ', notify_by_email';
  if (has('notify_by_dashboard')) cols += ', notify_by_dashboard';
  if (has('webhook_url')) cols += ', webhook_url';
  const r = db.prepare('SELECT ' + cols + ' FROM vendors WHERE id = ?').get(id);
  if (!r) return null;
  const out = {
    id: r.id,
    email: r.email,
    name: r.name,
    phone: r.phone || null,
    status: r.status,
    created_at: r.created_at,
    logo: r.logo || null,
    response_time_hours: r.response_time_hours != null ? r.response_time_hours : null,
    anydesk_id: r.anydesk_id ? String(r.anydesk_id).trim() : null
  };
  if (r.logout_all_before != null) out.logout_all_before = r.logout_all_before;
  if (r.totp_enabled != null) out.totp_enabled = !!r.totp_enabled;
  out.notify_by_email = r.notify_by_email != null ? !!r.notify_by_email : true;
  out.notify_by_dashboard = r.notify_by_dashboard != null ? !!r.notify_by_dashboard : true;
  if (r.webhook_url != null) out.webhook_url = String(r.webhook_url).trim() || null;
  return out;
}

function getVendorByIdWithPassword(id) {
  const info = db.prepare('PRAGMA table_info(vendors)').all();
  const has = (name) => info.some((c) => c.name === name);
  const cols = has('totp_secret') && has('totp_enabled')
    ? 'id, email, password_hash, name, phone, status, created_at, totp_secret, totp_enabled'
    : 'id, email, password_hash, name, phone, status, created_at';
  return db.prepare('SELECT ' + cols + ' FROM vendors WHERE id = ?').get(id) || null;
}

function setVendorLogoutAllBefore(vendorId) {
  const info = db.prepare('PRAGMA table_info(vendors)').all();
  if (!info.some((c) => c.name === 'logout_all_before')) return;
  db.prepare('UPDATE vendors SET logout_all_before = datetime(\'now\') WHERE id = ?').run(vendorId);
}

function addVendorActivityLog(vendorId, eventType, details) {
  try {
    db.prepare('INSERT INTO vendor_activity_log (vendor_id, event_type, details) VALUES (?, ?, ?)').run(vendorId, eventType, details || null);
  } catch (e) {}
}

function getVendorActivityLog(vendorId, limit) {
  const rows = db.prepare(
    'SELECT id, event_type, details, created_at FROM vendor_activity_log WHERE vendor_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(vendorId, limit || 50);
  return rows;
}

function setVendorTotp(vendorId, secret, enabled) {
  db.prepare('UPDATE vendors SET totp_secret = ?, totp_enabled = ? WHERE id = ?').run(secret, enabled ? 1 : 0, vendorId);
}

function updateVendorProfile(id, data) {
  const allowed = ['name', 'phone', 'logo', 'response_time_hours', 'anydesk_id', 'notify_by_email', 'notify_by_dashboard'];
  const updates = [];
  const values = [];
  for (const k of allowed) {
    if (data[k] === undefined) continue;
    updates.push(`${k} = ?`);
    if (k === 'response_time_hours') values.push(data[k] === '' || data[k] == null ? null : parseInt(data[k], 10));
    else if (k === 'notify_by_email' || k === 'notify_by_dashboard') values.push(data[k] ? 1 : 0);
    else values.push(data[k]);
  }
  if (updates.length === 0) return;
  values.push(id);
  db.prepare('UPDATE vendors SET ' + updates.join(', ') + ' WHERE id = ?').run(...values);
}

function updateVendorPassword(id, passwordHash) {
  db.prepare('UPDATE vendors SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

function createVendorApiKey(vendorId, keyHash, name) {
  const r = db.prepare('INSERT INTO vendor_api_keys (vendor_id, key_hash, name) VALUES (?, ?, ?)').run(vendorId, keyHash, name || '');
  return r.lastInsertRowid;
}

function getVendorIdByApiKeyHash(keyHash) {
  const r = db.prepare('SELECT vendor_id FROM vendor_api_keys WHERE key_hash = ?').get(keyHash);
  return r ? r.vendor_id : null;
}

function listVendorApiKeys(vendorId) {
  return db.prepare('SELECT id, name, created_at FROM vendor_api_keys WHERE vendor_id = ? ORDER BY created_at DESC').all(vendorId);
}

function deleteVendorApiKey(id, vendorId) {
  const r = db.prepare('DELETE FROM vendor_api_keys WHERE id = ? AND vendor_id = ?').run(id, vendorId);
  return r.changes > 0;
}

function getVendorWebhookSecret(vendorId) {
  const info = db.prepare('PRAGMA table_info(vendors)').all();
  if (!info.some((c) => c.name === 'webhook_secret')) return null;
  const r = db.prepare('SELECT webhook_secret FROM vendors WHERE id = ?').get(vendorId);
  return (r && r.webhook_secret) ? r.webhook_secret : null;
}

function updateVendorWebhook(vendorId, webhookUrl, webhookSecret) {
  const info = db.prepare('PRAGMA table_info(vendors)').all();
  if (!info.some((c) => c.name === 'webhook_url')) return;
  db.prepare('UPDATE vendors SET webhook_url = ?, webhook_secret = ? WHERE id = ?').run(webhookUrl || null, webhookSecret || null, vendorId);
}

function createVendor({ email, password_hash, name, phone }) {
  const emailNorm = (email != null && String(email).trim()) ? String(email).trim().toLowerCase() : '';
  if (!emailNorm) throw new Error('createVendor: email required');
  const r = db.prepare(
    'INSERT INTO vendors (email, password_hash, name, phone) VALUES (?, ?, ?, ?)'
  ).run(emailNorm, password_hash, name || '', phone || '');
  return r.lastInsertRowid;
}

function updateVendorStatus(id, status) {
  db.prepare('UPDATE vendors SET status = ? WHERE id = ?').run(status, id);
}

function getVendors() {
  return db.prepare('SELECT id, email, name, phone, status, created_at FROM vendors ORDER BY created_at DESC').all();
}

function deleteVendor(vendorId) {
  const id = parseInt(vendorId, 10);
  if (isNaN(id)) return false;
  const v = db.prepare('SELECT id FROM vendors WHERE id = ?').get(id);
  if (!v) return false;
  db.transaction(() => {
    db.prepare('DELETE FROM vendor_payments WHERE vendor_id = ?').run(id);
    db.prepare('UPDATE products SET vendor_id = NULL WHERE vendor_id = ?').run(id);
    db.prepare('UPDATE orders SET vendor_id = NULL WHERE vendor_id = ?').run(id);
    try { db.prepare('DELETE FROM vendor_activity_log WHERE vendor_id = ?').run(id); } catch (e) {}
    try { db.prepare("DELETE FROM notifications WHERE user_type = 'vendor' AND user_id = ?").run(id); } catch (e) {}
    db.prepare('DELETE FROM vendors WHERE id = ?').run(id);
  })();
  return true;
}

function getOrdersByVendorId(vendorId) {
  const info = db.prepare('PRAGMA table_info(orders)').all();
  const hasEst = info.some((c) => c.name === 'estimated_delivery');
  const cols = 'id, date, product, value, name, phone, email, address, commission_amount, status, completed_at' + (hasEst ? ', estimated_delivery' : '');
  const rows = db.prepare('SELECT ' + cols + ' FROM orders WHERE vendor_id = ? ORDER BY date DESC').all(vendorId);
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    product: r.product,
    value: r.value,
    name: r.name,
    phone: r.phone,
    email: r.email,
    address: r.address,
    commission_amount: r.commission_amount,
    status: r.status || 'pending',
    completed_at: r.completed_at || null,
    estimated_delivery: hasEst ? (r.estimated_delivery || null) : null
  }));
}

function getClientByEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const normalized = String(email).trim().toLowerCase();
  const r = db.prepare('SELECT id, email, password_hash, name, phone, created_at, email_verified FROM clients WHERE LOWER(TRIM(email)) = ?').get(normalized);
  if (!r) return null;
  return { ...r, email_verified: r.email_verified !== 0 };
}

function getClientById(id) {
  const info = db.prepare('PRAGMA table_info(clients)').all();
  const hasAddr = info.some((c) => c.name === 'address');
  const hasNotif = info.some((c) => c.name === 'notify_by_email');
  let cols = hasAddr ? 'id, email, name, phone, address, created_at, email_verified' : 'id, email, name, phone, created_at, email_verified';
  if (hasNotif) cols += ', notify_by_email, notify_by_dashboard';
  const r = db.prepare('SELECT ' + cols + ' FROM clients WHERE id = ?').get(id);
  if (!r) return null;
  const out = { ...r, email_verified: r.email_verified !== 0 };
  out.address = (hasAddr && r.address != null) ? r.address : '';
  out.notify_by_email = hasNotif ? (r.notify_by_email !== 0) : true;
  out.notify_by_dashboard = hasNotif ? (r.notify_by_dashboard !== 0) : true;
  return out;
}

function getClients() {
  const rows = db.prepare('SELECT id, email, name, phone, created_at FROM clients ORDER BY created_at DESC').all();
  return rows;
}

function deleteClient(clientId) {
  const id = parseInt(clientId, 10);
  if (isNaN(id)) return false;
  const c = db.prepare('SELECT id FROM clients WHERE id = ?').get(id);
  if (!c) return false;
  db.transaction(() => {
    db.prepare('DELETE FROM client_wishlist WHERE client_id = ?').run(id);
    db.prepare('DELETE FROM reviews WHERE client_id = ?').run(id);
    db.prepare('DELETE FROM abandoned_cart WHERE client_id = ?').run(id);
    try { db.prepare('DELETE FROM client_activity_log WHERE client_id = ?').run(id); } catch (e) {}
    try { db.prepare("DELETE FROM notifications WHERE user_type = 'client' AND user_id = ?").run(id); } catch (e) {}
    db.prepare('UPDATE orders SET client_id = NULL WHERE client_id = ?').run(id);
    db.prepare('DELETE FROM clients WHERE id = ?').run(id);
  })();
  return true;
}

function createClient(email, passwordHash, name, phone, address) {
  const emailNorm = (email != null && String(email).trim()) ? String(email).trim().toLowerCase() : '';
  if (!emailNorm) throw new Error('createClient: email required');
  const info = db.prepare('PRAGMA table_info(clients)').all();
  const hasAddr = info.some((c) => c.name === 'address');
  const nameVal = name == null ? '' : String(name).trim();
  const phoneVal = phone == null ? '' : String(phone).trim();
  const addrVal = address == null ? '' : String(address).trim();
  if (hasAddr) {
    db.prepare(
      'INSERT INTO clients (email, password_hash, name, phone, address) VALUES (?, ?, ?, ?, ?)'
    ).run(emailNorm, passwordHash, nameVal, phoneVal, addrVal);
  } else {
    db.prepare(
      'INSERT INTO clients (email, password_hash, name, phone) VALUES (?, ?, ?, ?)'
    ).run(emailNorm, passwordHash, nameVal, phoneVal);
  }
  return db.prepare('SELECT last_insert_rowid() as id').get().id;
}

function getClientByIdWithPassword(id) {
  const info = db.prepare('PRAGMA table_info(clients)').all();
  const hasAddr = info.some((c) => c.name === 'address');
  const hasNotif = info.some((c) => c.name === 'notify_by_email');
  let cols = hasAddr ? 'id, email, password_hash, name, phone, address, created_at, email_verified' : 'id, email, password_hash, name, phone, created_at, email_verified';
  if (hasNotif) cols += ', notify_by_email, notify_by_dashboard';
  const r = db.prepare('SELECT ' + cols + ' FROM clients WHERE id = ?').get(id);
  if (!r) return null;
  const out = { ...r, email_verified: r.email_verified !== 0 };
  out.address = (hasAddr && r.address != null) ? r.address : '';
  out.notify_by_email = hasNotif ? (r.notify_by_email !== 0) : true;
  out.notify_by_dashboard = hasNotif ? (r.notify_by_dashboard !== 0) : true;
  return out;
}

function setClientEmailVerificationToken(clientId, token) {
  db.prepare('UPDATE clients SET email_verification_token = ?, email_verification_sent_at = datetime(\'now\') WHERE id = ?').run(token, clientId);
}

function getClientByEmailVerificationToken(token) {
  if (!token || typeof token !== 'string') return null;
  const r = db.prepare('SELECT id, email, name, phone, created_at, email_verified FROM clients WHERE email_verification_token = ?').get(token.trim());
  if (!r) return null;
  return { ...r, email_verified: r.email_verified !== 0 };
}

function markClientEmailVerified(clientId) {
  db.prepare('UPDATE clients SET email_verified = 1, email_verification_token = NULL, email_verification_sent_at = NULL WHERE id = ?').run(clientId);
}

/** التحقق بالرمز السري (OTP): العميل مسجّل، الرمز يطابق وضمن مدة الصلاحية (15 دقيقة) */
function verifyClientEmailByCode(clientId, code) {
  if (!clientId || !code || typeof code !== 'string') return false;
  const c = db.prepare('SELECT id, email_verification_token, email_verification_sent_at FROM clients WHERE id = ?').get(clientId);
  if (!c || !c.email_verification_token) return false;
  const trimmed = String(code).trim();
  if (trimmed.length < 4 || c.email_verification_token !== trimmed) return false;
  // SQLite datetime('now') is UTC; parse as UTC so expiry is correct in any timezone
  const sentAt = c.email_verification_sent_at ? new Date(c.email_verification_sent_at.replace(' ', 'T') + 'Z').getTime() : 0;
  const now = Date.now();
  if (isNaN(sentAt) || now - sentAt > 15 * 60 * 1000) return false;
  db.prepare('UPDATE clients SET email_verified = 1, email_verification_token = NULL, email_verification_sent_at = NULL WHERE id = ?').run(clientId);
  return true;
}

function updateClientPassword(id, passwordHash) {
  db.prepare('UPDATE clients SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

function setClientPasswordResetToken(clientId, token) {
  const info = db.prepare('PRAGMA table_info(clients)').all();
  if (!info.some((c) => c.name === 'password_reset_token')) return;
  db.prepare('UPDATE clients SET password_reset_token = ?, password_reset_sent_at = datetime(\'now\') WHERE id = ?').run(token, clientId);
}

function getClientByPasswordResetToken(token) {
  if (!token || typeof token !== 'string') return null;
  const info = db.prepare('PRAGMA table_info(clients)').all();
  if (!info.some((c) => c.name === 'password_reset_token')) return null;
  const r = db.prepare('SELECT id, email, password_reset_sent_at FROM clients WHERE password_reset_token = ?').get(token.trim());
  return r || null;
}

function clearClientPasswordResetToken(clientId) {
  const info = db.prepare('PRAGMA table_info(clients)').all();
  if (!info.some((c) => c.name === 'password_reset_token')) return;
  db.prepare('UPDATE clients SET password_reset_token = NULL, password_reset_sent_at = NULL WHERE id = ?').run(clientId);
}

function updateClientProfile(id, updates) {
  const info = db.prepare('PRAGMA table_info(clients)').all();
  const hasAddr = info.some((c) => c.name === 'address');
  const hasNotif = info.some((c) => c.name === 'notify_by_email');
  let allowed = hasAddr ? ['name', 'phone', 'address'] : ['name', 'phone'];
  if (hasNotif) allowed = allowed.concat(['notify_by_email', 'notify_by_dashboard']);
  const set = [];
  const vals = [];
  allowed.forEach((k) => {
    if (updates[k] === undefined) return;
    if (k === 'notify_by_email' || k === 'notify_by_dashboard') {
      set.push(k + ' = ?');
      vals.push(updates[k] ? 1 : 0);
    } else {
      set.push(k + ' = ?');
      vals.push(updates[k] == null ? '' : String(updates[k]).trim());
    }
  });
  if (set.length === 0) return;
  vals.push(id);
  db.prepare('UPDATE clients SET ' + set.join(', ') + ' WHERE id = ?').run(...vals);
}

function getClientWishlist(clientId) {
  const rows = db.prepare(
    'SELECT category, subcat, slug, name, img FROM client_wishlist WHERE client_id = ? ORDER BY created_at DESC'
  ).all(clientId);
  return rows.map((r) => ({ key: r.slug, category: r.category, subcat: r.subcat || '', name: r.name || '', img: r.img || '' }));
}

function insertClientActivity(clientId, eventType) {
  if (!clientId || !eventType) return;
  try {
    db.prepare('INSERT INTO client_activity_log (client_id, event_type) VALUES (?, ?)').run(clientId, String(eventType));
  } catch (e) {}
}

function getClientActivity(clientId, limit = 20) {
  const rows = db.prepare(
    'SELECT id, event_type, created_at FROM client_activity_log WHERE client_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(clientId, limit);
  return rows.map((r) => ({ id: r.id, event_type: r.event_type, created_at: r.created_at }));
}

function addClientWishlist(clientId, item) {
  if (!item || !item.key || !item.category) return false;
  db.prepare(
    'INSERT OR IGNORE INTO client_wishlist (client_id, category, subcat, slug, name, img) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(clientId, item.category, item.subcat || '', item.key, item.name || '', item.img || '');
  return true;
}

function removeClientWishlist(clientId, category, subcat, slug) {
  const sub = subcat || '';
  const r = db.prepare(
    'DELETE FROM client_wishlist WHERE client_id = ? AND category = ? AND subcat = ? AND slug = ?'
  ).run(clientId, category, sub, slug);
  return r.changes > 0;
}

function hasClientWishlistItem(clientId, category, subcat, slug) {
  const sub = subcat || '';
  const r = db.prepare(
    'SELECT 1 FROM client_wishlist WHERE client_id = ? AND category = ? AND subcat = ? AND slug = ?'
  ).get(clientId, category, sub, slug);
  return !!r;
}

function getOrdersFiltered(filters) {
  const opts = filters || {};
  const info = db.prepare('PRAGMA table_info(orders)').all();
  const hasProd = info.some((c) => c.name === 'product_category');
  const hasCoupon = info.some((c) => c.name === 'coupon_code');
  const hasPayment = info.some((c) => c.name === 'payment_status');
  let cols = 'o.id, o.date, o.product, o.value, o.name, o.phone, o.email, o.address, o.vendor_id, o.commission_amount, o.client_id, o.status, o.completed_at';
  if (hasProd) cols += ', o.product_category';
  if (hasCoupon) cols += ', o.coupon_code';
  if (hasPayment) cols += ', o.payment_status';
  let sql = `SELECT ${cols},
     (SELECT c.email FROM clients c WHERE c.id = o.client_id) AS client_email,
     (SELECT v.name FROM vendors v WHERE v.id = o.vendor_id) AS vendor_name
     FROM orders o WHERE 1=1`;
  const params = [];
  if (opts.date_from) { sql += ' AND date(o.date) >= date(?)'; params.push(opts.date_from); }
  if (opts.date_to) { sql += ' AND date(o.date) <= date(?)'; params.push(opts.date_to); }
  if (opts.vendor_id != null && opts.vendor_id !== '') { sql += ' AND o.vendor_id = ?'; params.push(opts.vendor_id); }
  if (opts.status && String(opts.status).trim()) { sql += ' AND o.status = ?'; params.push(String(opts.status).trim()); }
  if (hasProd && opts.product_category && String(opts.product_category).trim()) {
    sql += ' AND o.product_category = ?'; params.push(String(opts.product_category).trim());
  }
  if (opts.coupon_used === true || opts.coupon_used === 1 || opts.coupon_used === '1') {
    sql += ' AND o.coupon_code IS NOT NULL AND o.coupon_code != \'\'';
  } else if (opts.coupon_used === false || opts.coupon_used === 0 || opts.coupon_used === '0') {
    sql += ' AND (o.coupon_code IS NULL OR o.coupon_code = \'\')';
  }
  sql += ' ORDER BY o.date DESC';
  const rows = db.prepare(sql).all(...params);
  let out = rows.map((r) => ({
    id: r.id,
    date: r.date,
    product: r.product,
    value: r.value,
    name: r.name,
    phone: r.phone,
    email: r.email,
    address: r.address,
    vendor_id: r.vendor_id ?? null,
    vendor_name: r.vendor_name || null,
    commission_amount: r.commission_amount ?? null,
    client_id: r.client_id ?? null,
    client_email: r.client_email || null,
    status: r.status || 'pending',
    completed_at: r.completed_at || null,
    coupon_code: hasCoupon ? (r.coupon_code || null) : null,
    product_category: hasProd ? (r.product_category || null) : null,
    payment_status: hasPayment && r.payment_status ? r.payment_status : null
  }));
  const priceMin = opts.price_min != null && !isNaN(Number(opts.price_min)) ? Number(opts.price_min) : null;
  const priceMax = opts.price_max != null && !isNaN(Number(opts.price_max)) ? Number(opts.price_max) : null;
  if (priceMin != null || priceMax != null) {
    out = out.filter((o) => {
      const val = orderValueToAmountHelper(o.value);
      if (priceMin != null && val < priceMin) return false;
      if (priceMax != null && val > priceMax) return false;
      return true;
    });
  }
  return out;
}

function orderValueToAmountHelper(val) {
  if (val == null || String(val).trim() === '') return 0;
  const s = String(val).trim();
  const sep = s.match(/\s*-\s*/);
  const numStr = sep ? s.substring(s.indexOf(sep[0]) + sep[0].length).trim() : s;
  const n = parseFloat(numStr.replace(/\s/g, '').replace(/,/g, '.').replace(/[^\d.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function getOrdersForReport(dateFrom, dateTo, vendorId) {
  return getOrdersFiltered({ date_from: dateFrom, date_to: dateTo, vendor_id: vendorId });
}

function getOrdersByClientId(clientId) {
  const info = db.prepare('PRAGMA table_info(orders)').all();
  const hasCol = (n) => info.some((c) => c.name === n);
  const extra = (hasCol('product_category') && hasCol('product_subcat') && hasCol('product_slug')) ? ', product_category, product_subcat, product_slug' : '';
  const extraEst = hasCol('estimated_delivery') ? ', estimated_delivery' : '';
  const rows = db.prepare(
    'SELECT id, date, product, value, name, phone, email, address, status, completed_at' + extra + extraEst + ' FROM orders WHERE client_id = ? ORDER BY date DESC'
  ).all(clientId);
  return rows.map((r) => {
    const o = {
      id: r.id,
      date: r.date,
      product: r.product,
      value: r.value,
      name: r.name,
      phone: r.phone,
      email: r.email,
      address: r.address,
      status: r.status || 'pending',
      completed_at: r.completed_at || null
    };
    if (r.product_category != null) o.product_category = r.product_category;
    if (r.product_subcat != null) o.product_subcat = r.product_subcat;
    if (r.product_slug != null) o.product_slug = r.product_slug;
    if (r.estimated_delivery != null) o.estimated_delivery = r.estimated_delivery;
    return o;
  });
}

function getProductRatingStats(category, subcat, slug) {
  const sub = subcat || '';
  const r = db.prepare(
    'SELECT COUNT(*) AS count, AVG(rating) AS average FROM reviews WHERE category = ? AND subcat = ? AND slug = ?'
  ).get(category, sub, slug);
  return {
    count: r && r.count ? Number(r.count) : 0,
    average: r && r.average != null ? Math.round(Number(r.average) * 10) / 10 : 0
  };
}

/** P7: خريطة تقييمات كل المنتجات (للعرض في البطاقات) — مفتاح: category|subcat|slug */
function getAllProductRatingStats() {
  const rows = db.prepare(
    'SELECT category, subcat, slug, COUNT(*) AS count, AVG(rating) AS average FROM reviews GROUP BY category, subcat, slug'
  ).all();
  const out = {};
  for (const r of rows) {
    const sub = r.subcat || '';
    const key = r.category + '|' + sub + '|' + (r.slug || '');
    out[key] = { count: Number(r.count), average: r.average != null ? Math.round(Number(r.average) * 10) / 10 : 0 };
  }
  return out;
}

function getReviewsForProduct(category, subcat, slug, limit) {
  const sub = subcat || '';
  const rows = db.prepare(
    `SELECT r.id, r.rating, r.comment, r.created_at, c.name AS client_name
     FROM reviews r LEFT JOIN clients c ON c.id = r.client_id
     WHERE r.category = ? AND r.subcat = ? AND r.slug = ?
     ORDER BY r.created_at DESC LIMIT ?`
  ).all(category, sub, slug, limit || 50);
  return rows.map((row) => ({
    id: row.id,
    rating: row.rating,
    comment: row.comment || '',
    created_at: row.created_at,
    client_name: row.client_name ? row.client_name.trim().replace(/^(.{1}).*(.)$/, '$1***$2') : null
  }));
}

function addReview(category, subcat, slug, clientId, rating, comment) {
  const sub = subcat || '';
  db.prepare(
    'INSERT INTO reviews (category, subcat, slug, client_id, rating, comment) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(category, sub, slug, clientId, Math.min(5, Math.max(1, Math.floor(Number(rating) || 0))), (comment || '').trim().slice(0, 2000));
}

function hasClientReviewed(clientId, category, subcat, slug) {
  const sub = subcat || '';
  const r = db.prepare(
    'SELECT 1 FROM reviews WHERE category = ? AND subcat = ? AND slug = ? AND client_id = ?'
  ).get(category, sub, slug, clientId);
  return !!r;
}

function hasClientCompletedOrderForProduct(clientId, category, subcat, slug) {
  const sub = subcat || '';
  const info = db.prepare('PRAGMA table_info(orders)').all();
  if (!info.some((c) => c.name === 'product_slug')) return true;
  const r = db.prepare(
    'SELECT 1 FROM orders WHERE client_id = ? AND status = ? AND product_category = ? AND product_subcat = ? AND product_slug = ?'
  ).get(clientId, 'completed', category, sub, slug);
  return !!r;
}

function addNotification(userType, userId, type, title, link) {
  db.prepare(
    'INSERT INTO notifications (user_type, user_id, type, title, link) VALUES (?, ?, ?, ?, ?)'
  ).run(userType, userId, type, title || '', link || '');
}

function getNotifications(userType, userId, limit) {
  const rows = db.prepare(
    'SELECT id, type, title, link, is_read, created_at FROM notifications WHERE user_type = ? AND user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(userType, userId, limit || 50);
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    link: r.link || '',
    is_read: !!r.is_read,
    created_at: r.created_at
  }));
}

function markNotificationRead(id, userType, userId) {
  return db.prepare(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_type = ? AND user_id = ?'
  ).run(id, userType, userId);
}

function markNotificationsReadByLink(userType, userId, link) {
  if (!link || typeof link !== 'string') return;
  return db.prepare(
    'UPDATE notifications SET is_read = 1 WHERE user_type = ? AND user_id = ? AND is_read = 0 AND link = ?'
  ).run(userType, userId, link.trim());
}

function markAllNotificationsRead(userType, userId) {
  return db.prepare(
    'UPDATE notifications SET is_read = 1 WHERE user_type = ? AND user_id = ? AND is_read = 0'
  ).run(userType, userId);
}

function getUnreadNotificationsCount(userType, userId) {
  const r = db.prepare(
    'SELECT COUNT(*) AS c FROM notifications WHERE user_type = ? AND user_id = ? AND is_read = 0'
  ).get(userType, userId);
  return (r && r.c) || 0;
}

function addNewsletterSubscriber(email, token) {
  const normalized = String(email).trim().toLowerCase();
  try {
    db.prepare('INSERT INTO newsletter (email, token) VALUES (?, ?)').run(normalized, token);
    return { ok: true };
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return { ok: false, already: true };
    throw e;
  }
}

function getNewsletterByToken(token) {
  return db.prepare('SELECT id, email, confirmed_at FROM newsletter WHERE token = ?').get(token);
}

function confirmNewsletterByToken(token) {
  const r = db.prepare('UPDATE newsletter SET confirmed_at = datetime(\'now\') WHERE token = ? AND confirmed_at IS NULL').run(token);
  return r.changes > 0;
}

module.exports = {
  initDb,
  getOrders,
  addOrder,
  getOrderById,
  deleteOrder,
  updateOrderStatus,
  bulkUpdateOrderStatus,
  bulkUpdateProductStatus,
  updateOrderEstimatedDelivery,
  updateOrderPaymentStatus,
  getOrderMessages,
  addOrderMessage,
  getOrdersPendingVendorReply,
  getContacts,
  addContact,
  getProductsNested,
  getProductByKey,
  getProductBySlugOnly,
  getProductBySlugAnyStatus,
  addProduct,
  updateProduct,
  deleteProduct,
  getProductsByVendor,
  getProductsPendingApproval,
  updateProductStatus,
  productSlugTaken,
  updateProductStatusByVendor,
  addVendorPayment,
  getVendorPayments,
  getAllVendorPaymentsSummary,
  getVendorCommissionOwed,
  getVendorsReceivables,
  getVendorByEmail,
  getVendorById,
  getVendorByIdWithPassword,
  createVendor,
  updateVendorStatus,
  updateVendorProfile,
  updateVendorPassword,
  createVendorApiKey,
  getVendorIdByApiKeyHash,
  listVendorApiKeys,
  deleteVendorApiKey,
  getVendorWebhookSecret,
  updateVendorWebhook,
  setVendorLogoutAllBefore,
  addVendorActivityLog,
  getVendorActivityLog,
  setVendorTotp,
  getVendors,
  deleteVendor,
  getOrdersByVendorId,
  getOrdersForReport,
  getOrdersFiltered,
  getVendorsPerformance,
  getAdminSubUserByEmail,
  createAdminSubUser,
  getAdminSubUsers,
  deleteAdminSubUser,
  addAdminLoginLog,
  getAdminLoginLog,
  getClientByEmail,
  getClientById,
  getClientByIdWithPassword,
  getClients,
  deleteClient,
  createClient,
  updateClientPassword,
  setClientPasswordResetToken,
  getClientByPasswordResetToken,
  clearClientPasswordResetToken,
  updateClientProfile,
  setClientEmailVerificationToken,
  getClientByEmailVerificationToken,
  markClientEmailVerified,
  verifyClientEmailByCode,
  getClientWishlist,
  addClientWishlist,
  removeClientWishlist,
  hasClientWishlistItem,
  insertClientActivity,
  getClientActivity,
  getOrdersByClientId,
  getProductRatingStats,
  getAllProductRatingStats,
  getReviewsForProduct,
  addReview,
  hasClientReviewed,
  hasClientCompletedOrderForProduct,
  addNotification,
  getNotifications,
  markNotificationRead,
  markNotificationsReadByLink,
  markAllNotificationsRead,
  getUnreadNotificationsCount,
  getDb: () => db,
  getDbPath: () => _actualDbPath,
  getSessionRow,
  setSessionRow,
  destroySessionRow,
  getSetting,
  setSetting,
  addNewsletterSubscriber,
  getNewsletterByToken,
  confirmNewsletterByToken,
  saveAbandonedCart,
  getAbandonedCartsOlderThan,
  getClientEmailById,
  markAbandonedCartReminded,
  saveProductView,
  getProductRecommendations,
  insertAuditLog,
  getAuditLog,
  getCouponByCode,
  incrementCouponUsage,
  insertCoupon,
  getCouponsList,
  updateCouponActive,
  updateCoupon,
  deleteCoupon,
  getCouponStats,
  getOrderCountByClientId,
  addProductAlert,
  getProductAlertsByProduct,
  savePushSubscription,
  getPushSubscriptionsByUser,
  deletePushSubscription,
  deleteProductAlertAfterNotify
};
