/**
 * PostgreSQL driver for Key2lix — same API as db.js, sync via deasync.
 * Use when DB_DRIVER=postgres and DATABASE_URL is set.
 */
const { Pool } = require('pg');
const deasync = require('deasync');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required when DB_DRIVER=postgres');
}

const pool = new Pool({ connectionString: DATABASE_URL });

/** Run async pg query synchronously */
function querySync(text, params) {
  const fn = deasync(function () {
    return pool.query(text, params || []);
  });
  return fn();
}

/** Convert SQLite ? placeholders to PostgreSQL $1, $2... */
function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/** getDb compatibility: return object mimicking better-sqlite3 for server.js raw queries */
function getDb() {
  return {
    prepare: (sql) => {
      const pgSql = toPgPlaceholders(sql);
      return {
        get: (...params) => {
          const r = querySync(pgSql, params);
          return r.rows[0] || undefined;
        },
        run: (...params) => {
          querySync(pgSql, params);
          return { changes: 0 };
        },
        all: (...params) => querySync(pgSql, params).rows
      };
    }
  };
}

/** initDb: create all tables (sync via deasync) */
function initDb() {
  const run = deasync(function (cb) {
    (async function () {
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            product TEXT,
            value TEXT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT,
            address TEXT,
            vendor_id INTEGER,
            commission_amount INTEGER,
            client_id INTEGER,
            status TEXT NOT NULL DEFAULT 'pending',
            completed_at TEXT,
            product_category TEXT,
            product_subcat TEXT,
            product_slug TEXT,
            estimated_delivery TEXT
          );
          CREATE TABLE IF NOT EXISTS contacts (
            id SERIAL PRIMARY KEY,
            date TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT,
            subject TEXT,
            message TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS vendors (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            phone TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            logo TEXT,
            response_time_hours INTEGER,
            notify_by_email INTEGER NOT NULL DEFAULT 1,
            notify_by_dashboard INTEGER NOT NULL DEFAULT 1,
            anydesk_id TEXT,
            logout_all_before TEXT,
            totp_secret TEXT,
            totp_enabled INTEGER NOT NULL DEFAULT 0
          );
          CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            vendor_id INTEGER,
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
            status TEXT NOT NULL DEFAULT 'approved',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            offer_until TEXT,
            UNIQUE(category, subcat, slug)
          );
          CREATE TABLE IF NOT EXISTS clients (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            phone TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            email_verified INTEGER NOT NULL DEFAULT 0,
            email_verification_token TEXT,
            email_verification_sent_at TEXT,
            address TEXT,
            notify_by_email INTEGER NOT NULL DEFAULT 1,
            notify_by_dashboard INTEGER NOT NULL DEFAULT 1,
            password_reset_token TEXT,
            password_reset_sent_at TEXT
          );
          CREATE TABLE IF NOT EXISTS reviews (
            id SERIAL PRIMARY KEY,
            category TEXT NOT NULL,
            subcat TEXT NOT NULL DEFAULT '',
            slug TEXT NOT NULL,
            client_id INTEGER NOT NULL REFERENCES clients(id),
            rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
            comment TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(category, subcat, slug, client_id)
          );
          CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            user_type TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            link TEXT NOT NULL DEFAULT '',
            is_read INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS order_messages (
            id SERIAL PRIMARY KEY,
            order_id TEXT NOT NULL REFERENCES orders(id),
            from_role TEXT NOT NULL,
            from_id INTEGER NOT NULL,
            body TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS vendor_payments (
            id SERIAL PRIMARY KEY,
            vendor_id INTEGER NOT NULL REFERENCES vendors(id),
            amount REAL NOT NULL,
            note TEXT,
            paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT ''
          );
          CREATE TABLE IF NOT EXISTS client_wishlist (
            id SERIAL PRIMARY KEY,
            client_id INTEGER NOT NULL REFERENCES clients(id),
            category TEXT NOT NULL,
            subcat TEXT NOT NULL DEFAULT '',
            slug TEXT NOT NULL,
            name TEXT,
            img TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(client_id, category, subcat, slug)
          );
          CREATE TABLE IF NOT EXISTS newsletter (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            token TEXT NOT NULL,
            confirmed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS abandoned_cart (
            id SERIAL PRIMARY KEY,
            client_id INTEGER REFERENCES clients(id),
            email TEXT,
            items_json TEXT NOT NULL DEFAULT '[]',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            reminded INTEGER NOT NULL DEFAULT 0
          );
          CREATE TABLE IF NOT EXISTS vendor_activity_log (
            id SERIAL PRIMARY KEY,
            vendor_id INTEGER NOT NULL REFERENCES vendors(id),
            event_type TEXT NOT NULL,
            details TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS vendor_api_keys (
            id SERIAL PRIMARY KEY,
            vendor_id INTEGER NOT NULL REFERENCES vendors(id),
            key_hash TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS client_activity_log (
            id SERIAL PRIMARY KEY,
            client_id INTEGER NOT NULL REFERENCES clients(id),
            event_type TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS product_views (
            id SERIAL PRIMARY KEY,
            client_id INTEGER REFERENCES clients(id),
            session_id TEXT,
            category TEXT NOT NULL,
            subcat TEXT NOT NULL DEFAULT '',
            slug TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS audit_log (
            id SERIAL PRIMARY KEY,
            at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            actor_type TEXT NOT NULL,
            actor_id INTEGER,
            action TEXT NOT NULL,
            details TEXT,
            ip TEXT
          );
          CREATE TABLE IF NOT EXISTS admin_login_log (
            id SERIAL PRIMARY KEY,
            at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            success INTEGER NOT NULL DEFAULT 0,
            ip TEXT,
            username TEXT,
            details TEXT
          );
          CREATE TABLE IF NOT EXISTS coupons (
            id SERIAL PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('percent', 'fixed')),
            value REAL NOT NULL,
            valid_from TEXT,
            valid_until TEXT,
            usage_limit INTEGER,
            usage_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS product_alerts (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            client_id INTEGER,
            category TEXT NOT NULL,
            subcat TEXT NOT NULL DEFAULT '',
            slug TEXT NOT NULL,
            alert_type TEXT NOT NULL DEFAULT 'in_stock',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(email, category, subcat, slug, alert_type)
          );
          CREATE TABLE IF NOT EXISTS push_subscriptions (
            id SERIAL PRIMARY KEY,
            endpoint TEXT UNIQUE NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            user_type TEXT NOT NULL CHECK(user_type IN ('client', 'vendor')),
            user_id INTEGER NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS sessions (
            sid TEXT PRIMARY KEY,
            session TEXT NOT NULL,
            expire TIMESTAMPTZ NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_client_activity_client_id ON client_activity_log(client_id);
          CREATE INDEX IF NOT EXISTS idx_product_views_client ON product_views(client_id);
          CREATE INDEX IF NOT EXISTS idx_product_views_session ON product_views(session_id);
          CREATE INDEX IF NOT EXISTS idx_product_views_product ON product_views(category, subcat, slug);
          CREATE INDEX IF NOT EXISTS idx_product_views_created ON product_views(created_at);
          CREATE INDEX IF NOT EXISTS idx_abandoned_cart_updated ON abandoned_cart(updated_at);
          CREATE INDEX IF NOT EXISTS idx_abandoned_cart_reminded ON abandoned_cart(reminded);
          CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);
          CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);
          CREATE INDEX IF NOT EXISTS idx_orders_vendor_status ON orders(vendor_id, status);
          CREATE INDEX IF NOT EXISTS idx_products_category_subcat_slug ON products(category, subcat, slug);
          CREATE INDEX IF NOT EXISTS idx_products_vendor_status ON products(vendor_id, status);
          CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(category, subcat, slug);
          CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_type, user_id, is_read);
        `).catch(() => {});
        await client.query(`
          ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT;
          ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
          ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
          ALTER TABLE coupons ADD COLUMN IF NOT EXISTS min_order_amount REAL;
          ALTER TABLE coupons ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
          ALTER TABLE coupons ADD COLUMN IF NOT EXISTS deleted INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE coupons ADD COLUMN IF NOT EXISTS first_order_only INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE coupons ADD COLUMN IF NOT EXISTS allowed_emails TEXT;
          ALTER TABLE coupons ADD COLUMN IF NOT EXISTS product_category TEXT;
          ALTER TABLE coupons ADD COLUMN IF NOT EXISTS product_subcat TEXT;
          ALTER TABLE coupons ADD COLUMN IF NOT EXISTS product_slug TEXT;
          ALTER TABLE coupons ADD COLUMN IF NOT EXISTS free_shipping BOOLEAN NOT NULL DEFAULT false;
          ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_discount_amount REAL;
          ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_amount REAL;
          ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_discount_amount REAL;
          ALTER TABLE vendors ADD COLUMN IF NOT EXISTS webhook_url TEXT;
          ALTER TABLE vendors ADD COLUMN IF NOT EXISTS webhook_secret TEXT;
        `).catch(() => {});
        await client.query("UPDATE clients SET email_verified = 1 WHERE email_verification_token IS NULL").catch(() => {});
      } finally {
        client.release();
      }
    })().then(() => cb(null, pool)).catch((e) => cb(e));
  });
  return run();
}

function getOrders() {
  const rows = querySync(
    `SELECT o.id, o.date, o.product, o.value, o.name, o.phone, o.email, o.address, o.vendor_id, o.commission_amount, o.client_id, o.status, o.completed_at, o.estimated_delivery,
     (SELECT c.email FROM clients c WHERE c.id = o.client_id) AS client_email,
     (SELECT v.name FROM vendors v WHERE v.id = o.vendor_id) AS vendor_name
     FROM orders o ORDER BY o.date DESC`
  ).rows;
  return rows.map((r) => ({
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
    estimated_delivery: r.estimated_delivery || null
  }));
}

function getCouponByCode(code) {
  if (!code || !String(code).trim()) return null;
  const r = querySync(
    'SELECT id, code, type, value, valid_from, valid_until, usage_limit, usage_count, min_order_amount, active, first_order_only, allowed_emails, product_category, product_subcat, product_slug, free_shipping FROM coupons WHERE (deleted IS NULL OR deleted = 0) AND LOWER(TRIM(code)) = LOWER(TRIM($1))',
    [String(code).trim()]
  ).rows[0];
  if (r && r.active === false) r.active = 0;
  if (r && r.active === true) r.active = 1;
  if (r && r.free_shipping === true) r.free_shipping = 1;
  if (r && r.free_shipping === false) r.free_shipping = 0;
  return r || null;
}

function incrementCouponUsage(code) {
  if (!code || !String(code).trim()) return;
  querySync('UPDATE coupons SET usage_count = usage_count + 1 WHERE LOWER(TRIM(code)) = LOWER(TRIM($1))', [String(code).trim()]);
}

function insertCoupon(code, type, value, validFrom, validUntil, usageLimit, minOrderAmount, active, firstOrderOnly, allowedEmails, productCategory, productSubcat, productSlug, freeShipping) {
  const typeVal = type === 'free_shipping' ? 'fixed' : (type === 'fixed' ? 'fixed' : 'percent');
  const valNum = type === 'free_shipping' ? 0 : Number(value);
  querySync(
    'INSERT INTO coupons (code, type, value, valid_from, valid_until, usage_limit, min_order_amount, active, first_order_only, allowed_emails, product_category, product_subcat, product_slug, free_shipping) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
    [
      String(code).trim(),
      typeVal,
      valNum,
      validFrom || null,
      validUntil || null,
      usageLimit != null ? Math.max(0, parseInt(usageLimit, 10)) : null,
      minOrderAmount != null && !isNaN(Number(minOrderAmount)) ? Number(minOrderAmount) : null,
      active !== 0 && active !== false ? true : false,
      firstOrderOnly ? 1 : 0,
      allowedEmails != null && String(allowedEmails).trim() !== '' ? String(allowedEmails).trim() : null,
      productCategory != null && String(productCategory).trim() !== '' ? String(productCategory).trim() : null,
      productSubcat != null && String(productSubcat).trim() !== '' ? String(productSubcat).trim() : null,
      productSlug != null && String(productSlug).trim() !== '' ? String(productSlug).trim() : null,
      freeShipping ? true : false
    ]
  );
  return true;
}

function getCouponsList(limit, offset, search, status) {
  const limitNum = Math.min(parseInt(limit, 10) || 100, 5000);
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
  const now = new Date().toISOString().slice(0, 10);
  const params = [];
  let idx = 0;
  let sql = 'SELECT id, code, type, value, valid_from, valid_until, usage_limit, usage_count, min_order_amount, active, deleted, first_order_only, allowed_emails, product_category, product_subcat, product_slug, free_shipping, created_at FROM coupons WHERE (deleted IS NULL OR deleted = 0)';
  if (search && String(search).trim()) {
    idx++; params.push('%' + String(search).trim() + '%');
    sql += ' AND code ILIKE $' + idx;
  }
  if (status === 'active') {
    idx++; params.push(now);
    sql += ' AND (active IS NOT NULL AND active = true) AND (valid_until IS NULL OR valid_until >= $' + idx + ') AND (usage_limit IS NULL OR usage_count < usage_limit)';
  } else if (status === 'expired') {
    idx++; params.push(now);
    sql += ' AND (valid_until IS NOT NULL AND valid_until < $' + idx + ')';
  } else if (status === 'exhausted') {
    sql += ' AND (usage_limit IS NOT NULL AND usage_count >= usage_limit)';
  } else if (status === 'disabled') {
    sql += ' AND (active = false)';
  }
  idx++; params.push(limitNum);
  idx++; params.push(offsetNum);
  sql += ' ORDER BY id DESC LIMIT $' + (idx - 1) + ' OFFSET $' + idx;
  const rows = querySync(sql, params).rows;
  rows.forEach((r) => { r.active = r.active === true || r.active === 1 ? 1 : 0; });
  return rows;
}

function updateCouponActive(id, active) {
  const aid = parseInt(id, 10);
  if (isNaN(aid) || aid < 1) return false;
  querySync('UPDATE coupons SET active = $1 WHERE id = $2', [!!active, aid]);
  return true;
}

function updateCoupon(id, updates) {
  const aid = parseInt(id, 10);
  if (isNaN(aid) || aid < 1) return false;
  const allowed = ['usage_limit', 'valid_from', 'valid_until', 'min_order_amount', 'active'];
  const set = [];
  const vals = [];
  let i = 1;
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      set.push(key + ' = $' + i);
      if (key === 'active') vals.push(!!updates[key]);
      else if (key === 'usage_limit') vals.push(updates[key] != null ? Math.max(0, parseInt(updates[key], 10)) : null);
      else if (key === 'min_order_amount') vals.push(updates[key] != null && !isNaN(Number(updates[key])) ? Number(updates[key]) : null);
      else vals.push(updates[key] != null && String(updates[key]).trim() !== '' ? String(updates[key]).trim() : null);
      i++;
    }
  }
  if (vals.length === 0) return true;
  vals.push(aid);
  querySync('UPDATE coupons SET ' + set.join(', ') + ' WHERE id = $' + i, vals);
  return true;
}

function deleteCoupon(id) {
  const aid = parseInt(id, 10);
  if (isNaN(aid) || aid < 1) return false;
  querySync('UPDATE coupons SET deleted = 1, active = false WHERE id = $1', [aid]);
  return true;
}

function getCouponStats() {
  const rows = querySync('SELECT code, type, value, usage_count FROM coupons WHERE (deleted IS NULL OR deleted = 0)').rows;
  let totalUses = 0;
  const byCode = [];
  for (const r of rows) {
    const u = r.usage_count || 0;
    totalUses += u;
    if (u > 0) byCode.push({ code: r.code, type: r.type, value: r.value, usage_count: u });
  }
  byCode.sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
  const r = querySync("SELECT COALESCE(SUM(CAST(coupon_discount_amount AS REAL)), 0) AS s FROM orders WHERE coupon_discount_amount IS NOT NULL AND coupon_discount_amount::text != ''").rows[0];
  const totalDiscount = r && r.s != null ? Number(r.s) : 0;
  return { total_uses: totalUses, total_discount: totalDiscount, by_code: byCode.slice(0, 20) };
}

function getOrderCountByClientId(clientId) {
  if (clientId == null) return 0;
  const r = querySync('SELECT COUNT(*) AS n FROM orders WHERE client_id = $1', [clientId]).rows[0];
  return r && r.n != null ? parseInt(r.n, 10) : 0;
}

function addProductAlert(email, clientId, category, subcat, slug, alertType) {
  const sub = (subcat || '').trim();
  const type = (alertType || 'in_stock').trim();
  try {
    querySync(
      'INSERT INTO product_alerts (email, client_id, category, subcat, slug, alert_type) VALUES ($1, $2, $3, $4, $5, $6)',
      [email, clientId ?? null, category, sub, slug, type]
    );
    return { ok: true };
  } catch (e) {
    if (e.message && e.message.indexOf('unique') >= 0) return { ok: true, already: true };
    throw e;
  }
}

function getProductAlertsByProduct(category, subcat, slug, alertType) {
  const sub = (subcat || '').trim();
  return querySync(
    'SELECT id, email, client_id FROM product_alerts WHERE category = $1 AND subcat = $2 AND slug = $3 AND alert_type = $4',
    [category, sub, slug, alertType || 'in_stock']
  ).rows;
}

function deleteProductAlertAfterNotify(id) {
  try { querySync('DELETE FROM product_alerts WHERE id = $1', [id]); } catch (e) {}
}

function savePushSubscription(endpoint, p256dh, auth, userType, userId) {
  const ep = String(endpoint || '').trim();
  const k1 = String(p256dh || '').trim();
  const k2 = String(auth || '').trim();
  if (!ep || !k1 || !k2 || !userType || !userId) return false;
  try {
    querySync(
      'INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_type, user_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (endpoint) DO UPDATE SET p256dh = $2, auth = $3, user_type = $4, user_id = $5',
      [ep, k1, k2, userType, userId]
    );
    return true;
  } catch (e) {
    return false;
  }
}

function getPushSubscriptionsByUser(userType, userId) {
  return querySync(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_type = $1 AND user_id = $2',
    [userType, userId]
  ).rows;
}

function deletePushSubscription(endpoint) {
  try {
    querySync('DELETE FROM push_subscriptions WHERE endpoint = $1', [String(endpoint || '').trim()]);
    return true;
  } catch (e) {
    return false;
  }
}

function addOrder(order) {
  querySync(
    `INSERT INTO orders (id, date, product, value, name, phone, email, address, vendor_id, commission_amount, client_id, status, completed_at, product_category, product_subcat, product_slug, coupon_code, coupon_discount_amount, shipping_amount, shipping_discount_amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
    [
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
      order.coupon_code ?? null,
      order.coupon_discount_amount ?? null,
      order.shipping_amount ?? null,
      order.shipping_discount_amount ?? null
    ]
  );
}

function getOrderById(orderId) {
  const r = querySync(
    'SELECT id, date, product, value, name, phone, email, address, vendor_id, commission_amount, client_id, status, completed_at, product_category, product_subcat, product_slug, estimated_delivery, payment_status, stripe_session_id, coupon_code, coupon_discount_amount, shipping_amount, shipping_discount_amount FROM orders WHERE id = $1',
    [orderId]
  ).rows[0];
  if (!r) return null;
  return {
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
    completed_at: r.completed_at || null,
    product_category: r.product_category ?? null,
    product_subcat: r.product_subcat ?? null,
    product_slug: r.product_slug ?? null,
    estimated_delivery: r.estimated_delivery ?? null,
    payment_status: r.payment_status ?? null,
    stripe_session_id: r.stripe_session_id ?? null,
    coupon_code: r.coupon_code ?? null,
    coupon_discount_amount: r.coupon_discount_amount ?? null,
    shipping_amount: r.shipping_amount ?? null,
    shipping_discount_amount: r.shipping_discount_amount ?? null
  };
}

function updateOrderStatus(orderId, status, completedAt) {
  querySync('UPDATE orders SET status = $1, completed_at = $2 WHERE id = $3', [status, completedAt || null, orderId]);
}

function updateOrderEstimatedDelivery(orderId, estimatedDelivery) {
  querySync('UPDATE orders SET estimated_delivery = $1 WHERE id = $2', [estimatedDelivery || null, orderId]);
}

function updateOrderPaymentStatus(orderId, stripeSessionId, paymentStatus) {
  querySync('UPDATE orders SET payment_status = $1, stripe_session_id = $2 WHERE id = $3', [paymentStatus || 'paid', stripeSessionId || null, orderId]);
}

function deleteOrder(orderId) {
  if (!orderId || String(orderId).trim() === '') return false;
  const id = String(orderId).trim();
  const o = querySync('SELECT id FROM orders WHERE id = $1', [id]).rows[0];
  if (!o) return false;
  querySync('DELETE FROM order_messages WHERE order_id = $1', [id]);
  querySync('DELETE FROM orders WHERE id = $1', [id]);
  return true;
}

function getOrderMessages(orderId) {
  const rows = querySync(
    'SELECT id, order_id, from_role, from_id, body, created_at FROM order_messages WHERE order_id = $1 ORDER BY created_at ASC',
    [orderId]
  ).rows;
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
  querySync(
    'INSERT INTO order_messages (order_id, from_role, from_id, body) VALUES ($1, $2, $3, $4)',
    [orderId, fromRole, fromId, String(body).trim()]
  );
  const r = querySync(
    'SELECT id, created_at FROM order_messages WHERE order_id = $1 ORDER BY id DESC LIMIT 1',
    [orderId]
  ).rows[0];
  return { id: r.id, created_at: r.created_at };
}

function getOrdersPendingVendorReply() {
  const rows = querySync(
    `SELECT o.id, o.date, o.product, o.value, o.name, o.phone, o.vendor_id
     FROM orders o
     WHERE o.vendor_id IS NOT NULL AND (o.status IS NULL OR o.status = 'pending')
     AND o.date::timestamptz < NOW() - INTERVAL '1 hour'
     AND NOT EXISTS (SELECT 1 FROM order_messages m WHERE m.order_id = o.id AND m.from_role = 'vendor')
     ORDER BY o.date ASC`
  ).rows;
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
  const rows = querySync('SELECT id, date, name, email, subject, message FROM contacts ORDER BY date DESC').rows;
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
  querySync(
    'INSERT INTO contacts (date, name, email, subject, message) VALUES ($1, $2, $3, $4, $5)',
    [contact.date, contact.name, contact.email || '', contact.subject || '', contact.message]
  );
}

function rowToProduct(r) {
  const product = {
    name: r.name,
    desc: r.desc || '',
    images: JSON.parse(r.images_json || '[]'),
    prices: JSON.parse(r.prices_json || '[]')
  };
  if (r.vendor_id != null) product.vendor_id = r.vendor_id;
  if (r.discount != null) product.discount = r.discount;
  if (r.old_price) product.oldPrice = r.old_price;
  if (r.tags_json) product.tags = JSON.parse(r.tags_json);
  if (r.offer_until) product.offer_until = r.offer_until;
  return product;
}

function getProductsNested() {
  const rows = querySync(
    `SELECT vendor_id, category, subcat, slug, name, desc, images_json, prices_json, discount, old_price, tags_json, offer_until
     FROM products WHERE (status IS NULL OR status = 'approved') ORDER BY category, subcat, slug`
  ).rows;
  const out = {};
  for (const r of rows) {
    const cat = r.category;
    if (r.category === 'hardware') {
      if (!out.hardware) out.hardware = {};
      if (!out.hardware[r.subcat]) out.hardware[r.subcat] = {};
      out.hardware[r.subcat][r.slug] = rowToProduct(r);
    } else {
      if (!out[cat]) out[cat] = {};
      out[cat][r.slug] = rowToProduct(r);
    }
  }
  if (!out.game_cards) out.game_cards = {};
  if (!out.skins) out.skins = {};
  if (!out.hardware) out.hardware = {};
  if (!out.software) out.software = {};
  if (!out.Software) out.Software = {};
  return out;
}

function getProductByKey(category, subcat, slug) {
  const sub = (subcat || '').trim();
  let row = querySync(
    'SELECT id, vendor_id, category, subcat, slug, name, desc, images_json, prices_json, discount, old_price, tags_json, offer_until, status FROM products WHERE category = $1 AND subcat = $2 AND slug = $3',
    [category, sub, slug]
  ).rows[0];
  if (row) return row;
  if (sub !== '' && sub !== sub.toLowerCase()) {
    row = querySync(
      'SELECT id, vendor_id, category, subcat, slug, name, desc, images_json, prices_json, discount, old_price, tags_json, offer_until, status FROM products WHERE category = $1 AND LOWER(TRIM(subcat)) = LOWER($2) AND slug = $3',
      [category, sub, slug]
    ).rows[0];
  }
  return row || null;
}

function getProductBySlugOnly(slug) {
  if (!slug || String(slug).trim() === '') return null;
  const row = querySync(
    `SELECT id, vendor_id, category, subcat, slug, name, desc, images_json, prices_json, discount, old_price, tags_json, offer_until, status
     FROM products WHERE slug = $1 AND (status IS NULL OR status = 'approved')
     ORDER BY CASE WHEN vendor_id IS NOT NULL THEN 0 ELSE 1 END
     LIMIT 1`,
    [String(slug).trim()]
  ).rows[0];
  return row || null;
}

function getProductBySlugAnyStatus(slug) {
  if (!slug || String(slug).trim() === '') return null;
  const row = querySync(
    'SELECT id, vendor_id, category, subcat, slug, name, desc, images_json, prices_json, discount, old_price, tags_json, offer_until, status FROM products WHERE slug = $1 LIMIT 1',
    [String(slug).trim()]
  ).rows[0];
  return row || null;
}

function addProduct(vendorId, category, subcat, slug, productData) {
  const status = vendorId != null ? 'pending' : 'approved';
  const scalar = (v) => (Array.isArray(v) ? (v[0] != null ? v[0] : '') : v);
  querySync(
    `INSERT INTO products (vendor_id, category, subcat, slug, name, desc, images_json, prices_json, discount, old_price, tags_json, offer_until, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      vendorId ?? null,
      scalar(category),
      String(scalar(subcat) || ''),
      scalar(slug),
      scalar(productData.name),
      String(productData.desc != null ? scalar(productData.desc) : ''),
      JSON.stringify(Array.isArray(productData.images) ? productData.images : productData.images ? [productData.images] : []),
      JSON.stringify(Array.isArray(productData.prices) ? productData.prices : productData.prices ? [productData.prices] : []),
      productData.discount != null && productData.discount !== '' ? scalar(productData.discount) : null,
      productData.oldPrice != null && productData.oldPrice !== '' ? scalar(productData.oldPrice) : null,
      productData.tags ? JSON.stringify(productData.tags) : null,
      productData.offer_until != null && productData.offer_until !== '' ? scalar(productData.offer_until) : null,
      status
    ]
  );
}

function updateProduct(category, subcat, slug, productData, vendorId) {
  const sub = subcat || '';
  const r = querySync('SELECT id, vendor_id FROM products WHERE category = $1 AND subcat = $2 AND slug = $3', [category, sub, slug]).rows[0];
  if (!r) return false;
  if (vendorId != null && r.vendor_id !== vendorId) return false;
  querySync(
    `UPDATE products SET name = $1, desc = $2, images_json = $3, prices_json = $4, discount = $5, old_price = $6, tags_json = $7, offer_until = $8
     WHERE category = $9 AND subcat = $10 AND slug = $11`,
    [
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
    ]
  );
  return true;
}

function deleteProduct(category, subcat, slug, vendorId) {
  const sub = (subcat || '').trim();
  const slugStr = (slug || '').trim();
  if (!slugStr) return false;
  let r = querySync('SELECT id, vendor_id, category, subcat, slug FROM products WHERE category = $1 AND subcat = $2 AND slug = $3', [category, sub, slugStr]).rows[0];
  if (!r && vendorId === null) {
    r = querySync('SELECT id, vendor_id, category, subcat, slug FROM products WHERE slug = $1 LIMIT 1', [slugStr]).rows[0];
  }
  if (!r) return false;
  if (vendorId != null && r.vendor_id !== vendorId) return false;
  querySync('DELETE FROM products WHERE id = $1', [r.id]);
  return true;
}

function getProductsByVendor(vendorId) {
  const rows = querySync(
    'SELECT id, category, subcat, slug, name, desc, images_json, prices_json, discount, old_price, tags_json, offer_until, created_at, status FROM products WHERE vendor_id = $1 ORDER BY created_at DESC',
    [vendorId]
  ).rows;
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    subcat: r.subcat,
    slug: r.slug,
    name: r.name,
    desc: r.desc,
    images: JSON.parse(r.images_json || '[]'),
    prices: JSON.parse(r.prices_json || '[]'),
    discount: r.discount,
    oldPrice: r.old_price,
    tags: r.tags_json ? JSON.parse(r.tags_json) : null,
    offer_until: r.offer_until || null,
    created_at: r.created_at,
    status: r.status || 'approved'
  }));
}

function getProductsPendingApproval() {
  return querySync(
    `SELECT p.id, p.vendor_id, p.category, p.subcat, p.slug, p.name, p.desc, p.images_json, p.prices_json, p.discount, p.old_price, p.created_at, v.name AS vendor_name, v.email AS vendor_email
     FROM products p LEFT JOIN vendors v ON p.vendor_id = v.id WHERE p.status = 'pending' ORDER BY p.created_at DESC`
  ).rows;
}

function updateProductStatus(category, subcat, slug, status) {
  const sub = subcat || '';
  const r = querySync('UPDATE products SET status = $1 WHERE category = $2 AND subcat = $3 AND slug = $4', [status, category, sub, slug]);
  return (r.rowCount || 0) > 0;
}

function productSlugTaken(category, subcat, slug, excludeCategory, excludeSubcat, excludeSlug) {
  const sub = subcat || '';
  const row = querySync('SELECT id, vendor_id FROM products WHERE category = $1 AND subcat = $2 AND slug = $3', [category, sub, slug]).rows[0];
  if (!row) return { taken: false };
  if (excludeCategory != null && excludeSubcat != null && excludeSlug != null &&
      String(excludeCategory) === String(category) && String(excludeSubcat || '') === String(sub) && String(excludeSlug) === String(slug)) {
    return { taken: false };
  }
  return { taken: true, byVendorId: row.vendor_id };
}

function updateProductStatusByVendor(category, subcat, slug, vendorId, status) {
  if (status !== 'archived' && status !== 'approved') return false;
  const sub = subcat || '';
  const r = querySync('SELECT id, vendor_id FROM products WHERE category = $1 AND subcat = $2 AND slug = $3', [category, sub, slug]).rows[0];
  if (!r || r.vendor_id !== vendorId) return false;
  querySync('UPDATE products SET status = $1 WHERE category = $2 AND subcat = $3 AND slug = $4', [status, category, sub, slug]);
  return true;
}

function addVendorPayment(vendorId, amount, note) {
  querySync('INSERT INTO vendor_payments (vendor_id, amount, note) VALUES ($1, $2, $3)', [vendorId, amount, note || '']);
}

function getVendorPayments(vendorId) {
  return querySync('SELECT id, amount, note, paid_at FROM vendor_payments WHERE vendor_id = $1 ORDER BY paid_at DESC', [vendorId]).rows;
}

function getAllVendorPaymentsSummary() {
  return querySync('SELECT vendor_id, SUM(amount)::float AS total FROM vendor_payments GROUP BY vendor_id').rows;
}

function getVendorCommissionOwed(vendorId) {
  const r = querySync('SELECT COALESCE(SUM(commission_amount), 0) AS total FROM orders WHERE vendor_id = $1 AND status = $2', [vendorId, 'completed']).rows[0];
  return Number(r && r.total) || 0;
}

function getVendorsReceivables() {
  const vendors = querySync('SELECT id, name, email FROM vendors WHERE status = $1', ['approved']).rows;
  const paidRows = querySync('SELECT vendor_id, SUM(amount)::float AS total FROM vendor_payments GROUP BY vendor_id').rows;
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
  return querySync(
    'SELECT id, email, password_hash, name, phone, status, created_at, totp_enabled, totp_secret FROM vendors WHERE email = $1',
    [email]
  ).rows[0] || null;
}

function getVendorById(id) {
  const r = querySync(
    'SELECT id, email, name, phone, status, created_at, logo, response_time_hours, anydesk_id, logout_all_before, totp_enabled, notify_by_email, notify_by_dashboard, webhook_url FROM vendors WHERE id = $1',
    [id]
  ).rows[0];
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
    anydesk_id: r.anydesk_id ? String(r.anydesk_id).trim() : null,
    logout_all_before: r.logout_all_before ?? null,
    totp_enabled: !!r.totp_enabled,
    notify_by_email: r.notify_by_email != null ? !!r.notify_by_email : true,
    notify_by_dashboard: r.notify_by_dashboard != null ? !!r.notify_by_dashboard : true
  };
  if (r.webhook_url != null) out.webhook_url = String(r.webhook_url).trim() || null;
  return out;
}

function getVendorByIdWithPassword(id) {
  return querySync(
    'SELECT id, email, password_hash, name, phone, status, created_at, totp_secret, totp_enabled FROM vendors WHERE id = $1',
    [id]
  ).rows[0] || null;
}

function setVendorLogoutAllBefore(vendorId) {
  querySync('UPDATE vendors SET logout_all_before = NOW()::text WHERE id = $1', [vendorId]);
}

function addVendorActivityLog(vendorId, eventType, details) {
  try {
    querySync('INSERT INTO vendor_activity_log (vendor_id, event_type, details) VALUES ($1, $2, $3)', [vendorId, eventType, details || null]);
  } catch (e) {}
}

function getVendorActivityLog(vendorId, limit) {
  return querySync(
    'SELECT id, event_type, details, created_at FROM vendor_activity_log WHERE vendor_id = $1 ORDER BY created_at DESC LIMIT $2',
    [vendorId, limit || 50]
  ).rows;
}

function insertAuditLog(actorType, actorId, action, details, ip) {
  const detailsStr = typeof details === 'string' ? details : JSON.stringify(details || {});
  try {
    querySync(
      'INSERT INTO audit_log (actor_type, actor_id, action, details, ip) VALUES ($1, $2, $3, $4, $5)',
      [actorType, actorId ?? null, action, detailsStr, ip || null]
    );
  } catch (e) {}
}

function addAdminLoginLog(success, ip, username, details) {
  try {
    const detailsStr = typeof details === 'string' ? details : JSON.stringify(details || {});
    querySync(
      'INSERT INTO admin_login_log (success, ip, username, details) VALUES ($1, $2, $3, $4)',
      [success ? 1 : 0, ip || null, username || null, detailsStr]
    );
  } catch (e) {}
}

function getAdminLoginLog(limit) {
  const n = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const rows = querySync(
    'SELECT id, at, success, ip, username, details FROM admin_login_log ORDER BY at DESC LIMIT $1',
    [n]
  ).rows;
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    success: !!r.success,
    ip: r.ip || null,
    username: r.username || null,
    details: r.details || null
  }));
}

function getAuditLog(limit, offset) {
  const lim = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200);
  const off = Math.max(0, parseInt(offset, 10) || 0);
  return querySync(
    'SELECT id, at, actor_type, actor_id, action, details, ip FROM audit_log ORDER BY id DESC LIMIT $1 OFFSET $2',
    [lim, off]
  ).rows;
}

function setVendorTotp(vendorId, secret, enabled) {
  querySync('UPDATE vendors SET totp_secret = $1, totp_enabled = $2 WHERE id = $3', [secret, enabled ? 1 : 0, vendorId]);
}

function updateVendorProfile(id, data) {
  const allowed = ['name', 'phone', 'logo', 'response_time_hours', 'anydesk_id', 'notify_by_email', 'notify_by_dashboard'];
  const updates = [];
  const values = [];
  let i = 1;
  for (const k of allowed) {
    if (data[k] === undefined) continue;
    updates.push(`${k} = $${i}`);
    if (k === 'response_time_hours') values.push(data[k] === '' || data[k] == null ? null : parseInt(data[k], 10));
    else if (k === 'notify_by_email' || k === 'notify_by_dashboard') values.push(data[k] ? 1 : 0);
    else values.push(data[k]);
    i++;
  }
  if (updates.length === 0) return;
  values.push(id);
  querySync('UPDATE vendors SET ' + updates.join(', ') + ' WHERE id = $' + i, values);
}

function updateVendorPassword(id, passwordHash) {
  querySync('UPDATE vendors SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
}

function createVendorApiKey(vendorId, keyHash, name) {
  const r = querySync('INSERT INTO vendor_api_keys (vendor_id, key_hash, name) VALUES ($1, $2, $3) RETURNING id', [vendorId, keyHash, name || '']).rows[0];
  return r.id;
}

function getVendorIdByApiKeyHash(keyHash) {
  const r = querySync('SELECT vendor_id FROM vendor_api_keys WHERE key_hash = $1', [keyHash]).rows[0];
  return r ? r.vendor_id : null;
}

function listVendorApiKeys(vendorId) {
  return querySync('SELECT id, name, created_at FROM vendor_api_keys WHERE vendor_id = $1 ORDER BY created_at DESC', [vendorId]).rows;
}

function deleteVendorApiKey(id, vendorId) {
  const r = querySync('DELETE FROM vendor_api_keys WHERE id = $1 AND vendor_id = $2', [id, vendorId]);
  return r.rowCount > 0;
}

function getVendorWebhookSecret(vendorId) {
  const r = querySync('SELECT webhook_secret FROM vendors WHERE id = $1', [vendorId]).rows[0];
  return (r && r.webhook_secret) ? r.webhook_secret : null;
}

function updateVendorWebhook(vendorId, webhookUrl, webhookSecret) {
  querySync('UPDATE vendors SET webhook_url = $1, webhook_secret = $2 WHERE id = $3', [webhookUrl || null, webhookSecret || null, vendorId]);
}

function createVendor({ email, password_hash, name, phone }) {
  const r = querySync(
    'INSERT INTO vendors (email, password_hash, name, phone) VALUES ($1, $2, $3, $4) RETURNING id',
    [email, password_hash, name || '', phone || '']
  ).rows[0];
  return r.id;
}

function updateVendorStatus(id, status) {
  querySync('UPDATE vendors SET status = $1 WHERE id = $2', [status, id]);
}

function getVendors() {
  return querySync('SELECT id, email, name, phone, status, created_at FROM vendors ORDER BY created_at DESC').rows;
}

function deleteVendor(vendorId) {
  const id = parseInt(vendorId, 10);
  if (isNaN(id)) return false;
  const v = querySync('SELECT id FROM vendors WHERE id = $1', [id]).rows[0];
  if (!v) return false;
  querySync('DELETE FROM vendor_payments WHERE vendor_id = $1', [id]);
  querySync('UPDATE products SET vendor_id = NULL WHERE vendor_id = $1', [id]);
  querySync('UPDATE orders SET vendor_id = NULL WHERE vendor_id = $1', [id]);
  try { querySync("DELETE FROM vendor_activity_log WHERE vendor_id = $1", [id]); } catch (e) {}
  try { querySync("DELETE FROM vendor_api_keys WHERE vendor_id = $1", [id]); } catch (e) {}
  try { querySync("DELETE FROM notifications WHERE user_type = 'vendor' AND user_id = $1", [id]); } catch (e) {}
  querySync('DELETE FROM vendors WHERE id = $1', [id]);
  return true;
}

function getOrdersByVendorId(vendorId) {
  const rows = querySync(
    'SELECT id, date, product, value, name, phone, email, address, commission_amount, status, completed_at, estimated_delivery FROM orders WHERE vendor_id = $1 ORDER BY date DESC',
    [vendorId]
  ).rows;
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
    estimated_delivery: r.estimated_delivery || null
  }));
}

function getOrdersForReport(dateFrom, dateTo, vendorId) {
  let sql = `SELECT o.id, o.date, o.product, o.value, o.name, o.phone, o.email, o.address, o.vendor_id, o.commission_amount, o.client_id, o.status, o.completed_at,
     (SELECT c.email FROM clients c WHERE c.id = o.client_id) AS client_email,
     (SELECT v.name FROM vendors v WHERE v.id = o.vendor_id) AS vendor_name
     FROM orders o WHERE 1=1`;
  const params = [];
  let i = 1;
  if (dateFrom) { sql += ` AND (o.date::date) >= $${i}`; params.push(dateFrom); i++; }
  if (dateTo) { sql += ` AND (o.date::date) <= $${i}`; params.push(dateTo); i++; }
  if (vendorId != null && vendorId !== '') { sql += ` AND o.vendor_id = $${i}`; params.push(vendorId); i++; }
  sql += ' ORDER BY o.date DESC';
  const rows = querySync(sql, params).rows;
  return rows.map((r) => ({
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
    completed_at: r.completed_at || null
  }));
}

function getClientByEmail(email) {
  const r = querySync('SELECT id, email, password_hash, name, phone, created_at, email_verified FROM clients WHERE email = $1', [email]).rows[0];
  if (!r) return null;
  return { ...r, email_verified: r.email_verified !== 0 };
}

function getClientById(id) {
  const r = querySync(
    'SELECT id, email, name, phone, address, created_at, email_verified, notify_by_email, notify_by_dashboard FROM clients WHERE id = $1',
    [id]
  ).rows[0];
  if (!r) return null;
  const out = { ...r, email_verified: r.email_verified !== 0 };
  out.address = r.address != null ? r.address : '';
  out.notify_by_email = r.notify_by_email != null ? r.notify_by_email !== 0 : true;
  out.notify_by_dashboard = r.notify_by_dashboard != null ? r.notify_by_dashboard !== 0 : true;
  return out;
}

function getClients() {
  const rows = querySync('SELECT id, email, name, phone, created_at, email_verified FROM clients ORDER BY created_at DESC').rows;
  return rows.map((r) => ({ ...r, email_verified: r.email_verified != null && r.email_verified !== 0 }));
}

function deleteClient(clientId) {
  const id = parseInt(clientId, 10);
  if (isNaN(id)) return false;
  const c = querySync('SELECT id FROM clients WHERE id = $1', [id]).rows[0];
  if (!c) return false;
  querySync('DELETE FROM client_wishlist WHERE client_id = $1', [id]);
  querySync('DELETE FROM reviews WHERE client_id = $1', [id]);
  querySync('DELETE FROM abandoned_cart WHERE client_id = $1', [id]);
  try { querySync('DELETE FROM client_activity_log WHERE client_id = $1', [id]); } catch (e) {}
  try { querySync("DELETE FROM notifications WHERE user_type = 'client' AND user_id = $1", [id]); } catch (e) {}
  querySync('UPDATE orders SET client_id = NULL WHERE client_id = $1', [id]);
  querySync('DELETE FROM clients WHERE id = $1', [id]);
  return true;
}

function createClient(email, passwordHash, name, phone, address) {
  const r = querySync(
    'INSERT INTO clients (email, password_hash, name, phone, address) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [email, passwordHash, name == null ? '' : String(name).trim(), phone == null ? '' : String(phone).trim(), address == null ? '' : String(address).trim()]
  ).rows[0];
  return r.id;
}

function getClientByIdWithPassword(id) {
  const r = querySync(
    'SELECT id, email, password_hash, name, phone, address, created_at, email_verified, notify_by_email, notify_by_dashboard FROM clients WHERE id = $1',
    [id]
  ).rows[0];
  if (!r) return null;
  const out = { ...r, email_verified: r.email_verified !== 0 };
  out.address = r.address != null ? r.address : '';
  out.notify_by_email = r.notify_by_email != null ? r.notify_by_email !== 0 : true;
  out.notify_by_dashboard = r.notify_by_dashboard != null ? r.notify_by_dashboard !== 0 : true;
  return out;
}

function updateClientPassword(id, passwordHash) {
  querySync('UPDATE clients SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
}

function setClientPasswordResetToken(clientId, token) {
  querySync('UPDATE clients SET password_reset_token = $1, password_reset_sent_at = NOW()::text WHERE id = $2', [token, clientId]);
}

function getClientByPasswordResetToken(token) {
  if (!token || typeof token !== 'string') return null;
  const r = querySync('SELECT id, email, password_reset_sent_at FROM clients WHERE password_reset_token = $1', [token.trim()]).rows[0];
  return r || null;
}

function clearClientPasswordResetToken(clientId) {
  querySync('UPDATE clients SET password_reset_token = NULL, password_reset_sent_at = NULL WHERE id = $1', [clientId]);
}

function updateClientProfile(id, updates) {
  const allowed = ['name', 'phone', 'address', 'notify_by_email', 'notify_by_dashboard'];
  const set = [];
  const vals = [];
  let i = 1;
  allowed.forEach((k) => {
    if (updates[k] === undefined) return;
    set.push(k + ' = $' + i);
    if (k === 'notify_by_email' || k === 'notify_by_dashboard') vals.push(updates[k] ? 1 : 0);
    else vals.push(updates[k] == null ? '' : String(updates[k]).trim());
    i++;
  });
  if (set.length === 0) return;
  vals.push(id);
  querySync('UPDATE clients SET ' + set.join(', ') + ' WHERE id = $' + i, vals);
}

function setClientEmailVerificationToken(clientId, token) {
  querySync('UPDATE clients SET email_verification_token = $1, email_verification_sent_at = NOW()::text WHERE id = $2', [token, clientId]);
}

function getClientByEmailVerificationToken(token) {
  if (!token || typeof token !== 'string') return null;
  const r = querySync('SELECT id, email, name, phone, created_at, email_verified FROM clients WHERE email_verification_token = $1', [token.trim()]).rows[0];
  if (!r) return null;
  return { ...r, email_verified: r.email_verified !== 0 };
}

function markClientEmailVerified(clientId) {
  querySync('UPDATE clients SET email_verified = 1, email_verification_token = NULL, email_verification_sent_at = NULL WHERE id = $1', [clientId]);
}

function verifyClientEmailByCode(clientId, code) {
  if (!clientId || !code || typeof code !== 'string') return false;
  const c = querySync('SELECT id, email_verification_token, email_verification_sent_at FROM clients WHERE id = $1', [clientId]).rows[0];
  if (!c || !c.email_verification_token) return false;
  const trimmed = String(code).trim();
  if (trimmed.length < 4 || c.email_verification_token !== trimmed) return false;
  const sentAt = c.email_verification_sent_at ? new Date(c.email_verification_sent_at.replace(' ', 'T') + 'Z').getTime() : 0;
  const now = Date.now();
  if (isNaN(sentAt) || now - sentAt > 15 * 60 * 1000) return false;
  querySync('UPDATE clients SET email_verified = 1, email_verification_token = NULL, email_verification_sent_at = NULL WHERE id = $1', [clientId]);
  return true;
}

function getClientWishlist(clientId) {
  const rows = querySync(
    'SELECT category, subcat, slug, name, img FROM client_wishlist WHERE client_id = $1 ORDER BY created_at DESC',
    [clientId]
  ).rows;
  return rows.map((r) => ({ key: r.slug, category: r.category, subcat: r.subcat || '', name: r.name || '', img: r.img || '' }));
}

function addClientWishlist(clientId, item) {
  if (!item || !item.key || !item.category) return false;
  try {
    querySync(
      'INSERT INTO client_wishlist (client_id, category, subcat, slug, name, img) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (client_id, category, subcat, slug) DO NOTHING',
      [clientId, item.category, item.subcat || '', item.key, item.name || '', item.img || '']
    );
  } catch (e) {}
  return true;
}

function removeClientWishlist(clientId, category, subcat, slug) {
  const sub = subcat || '';
  const r = querySync(
    'DELETE FROM client_wishlist WHERE client_id = $1 AND category = $2 AND subcat = $3 AND slug = $4',
    [clientId, category, sub, slug]
  );
  return (r.rowCount || 0) > 0;
}

function hasClientWishlistItem(clientId, category, subcat, slug) {
  const sub = subcat || '';
  const r = querySync(
    'SELECT 1 FROM client_wishlist WHERE client_id = $1 AND category = $2 AND subcat = $3 AND slug = $4',
    [clientId, category, sub, slug]
  ).rows[0];
  return !!r;
}

function insertClientActivity(clientId, eventType) {
  if (!clientId || !eventType) return;
  try {
    querySync('INSERT INTO client_activity_log (client_id, event_type) VALUES ($1, $2)', [clientId, String(eventType)]);
  } catch (e) {}
}

function getClientActivity(clientId, limit = 20) {
  const rows = querySync(
    'SELECT id, event_type, created_at FROM client_activity_log WHERE client_id = $1 ORDER BY created_at DESC LIMIT $2',
    [clientId, limit]
  ).rows;
  return rows.map((r) => ({ id: r.id, event_type: r.event_type, created_at: r.created_at }));
}

function getOrdersByClientId(clientId) {
  const rows = querySync(
    'SELECT id, date, product, value, name, phone, email, address, status, completed_at, product_category, product_subcat, product_slug, estimated_delivery FROM orders WHERE client_id = $1 ORDER BY date DESC',
    [clientId]
  ).rows;
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
  const r = querySync(
    'SELECT COUNT(*)::int AS count, AVG(rating)::float AS average FROM reviews WHERE category = $1 AND subcat = $2 AND slug = $3',
    [category, sub, slug]
  ).rows[0];
  return {
    count: r && r.count ? Number(r.count) : 0,
    average: r && r.average != null ? Math.round(Number(r.average) * 10) / 10 : 0
  };
}

function getAllProductRatingStats() {
  const rows = querySync(
    'SELECT category, subcat, slug, COUNT(*)::int AS count, AVG(rating)::float AS average FROM reviews GROUP BY category, subcat, slug'
  ).rows;
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
  const rows = querySync(
    `SELECT r.id, r.rating, r.comment, r.created_at, c.name AS client_name
     FROM reviews r LEFT JOIN clients c ON c.id = r.client_id
     WHERE r.category = $1 AND r.subcat = $2 AND r.slug = $3
     ORDER BY r.created_at DESC LIMIT $4`,
    [category, sub, slug, limit || 50]
  ).rows;
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
  querySync(
    'INSERT INTO reviews (category, subcat, slug, client_id, rating, comment) VALUES ($1, $2, $3, $4, $5, $6)',
    [category, sub, slug, clientId, Math.min(5, Math.max(1, Math.floor(Number(rating) || 0))), (comment || '').trim().slice(0, 2000)]
  );
}

function hasClientReviewed(clientId, category, subcat, slug) {
  const sub = subcat || '';
  const r = querySync(
    'SELECT 1 FROM reviews WHERE category = $1 AND subcat = $2 AND slug = $3 AND client_id = $4',
    [category, sub, slug, clientId]
  ).rows[0];
  return !!r;
}

function hasClientCompletedOrderForProduct(clientId, category, subcat, slug) {
  const sub = subcat || '';
  const r = querySync(
    'SELECT 1 FROM orders WHERE client_id = $1 AND status = $2 AND product_category = $3 AND product_subcat = $4 AND product_slug = $5',
    [clientId, 'completed', category, sub, slug]
  ).rows[0];
  return !!r;
}

function addNotification(userType, userId, type, title, link) {
  querySync(
    'INSERT INTO notifications (user_type, user_id, type, title, link) VALUES ($1, $2, $3, $4, $5)',
    [userType, userId, type, title || '', link || '']
  );
}

function getNotifications(userType, userId, limit) {
  const rows = querySync(
    'SELECT id, type, title, link, is_read, created_at FROM notifications WHERE user_type = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT $3',
    [userType, userId, limit || 50]
  ).rows;
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
  return querySync('UPDATE notifications SET is_read = 1 WHERE id = $1 AND user_type = $2 AND user_id = $3', [id, userType, userId]);
}

function markNotificationsReadByLink(userType, userId, link) {
  if (!link || typeof link !== 'string') return;
  return querySync(
    'UPDATE notifications SET is_read = 1 WHERE user_type = $1 AND user_id = $2 AND is_read = 0 AND link = $3',
    [userType, userId, link.trim()]
  );
}

function markAllNotificationsRead(userType, userId) {
  return querySync(
    'UPDATE notifications SET is_read = 1 WHERE user_type = $1 AND user_id = $2 AND is_read = 0',
    [userType, userId]
  );
}

function getUnreadNotificationsCount(userType, userId) {
  const r = querySync(
    'SELECT COUNT(*)::int AS c FROM notifications WHERE user_type = $1 AND user_id = $2 AND is_read = 0',
    [userType, userId]
  ).rows[0];
  return (r && r.c) || 0;
}

function getSetting(key) {
  const r = querySync('SELECT value FROM settings WHERE key = $1', [key]).rows[0];
  return r ? r.value : null;
}

function setSetting(key, value) {
  querySync(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value',
    [key, String(value)]
  );
}

function addNewsletterSubscriber(email, token) {
  const normalized = String(email).trim().toLowerCase();
  try {
    querySync('INSERT INTO newsletter (email, token) VALUES ($1, $2)', [normalized, token]);
    return { ok: true };
  } catch (e) {
    if (e.code === '23505') return { ok: false, already: true };
    throw e;
  }
}

function getNewsletterByToken(token) {
  return querySync('SELECT id, email, confirmed_at FROM newsletter WHERE token = $1', [token]).rows[0];
}

function confirmNewsletterByToken(token) {
  const r = querySync('UPDATE newsletter SET confirmed_at = NOW() WHERE token = $1 AND confirmed_at IS NULL', [token]);
  return (r.rowCount || 0) > 0;
}

function saveAbandonedCart(clientId, email, items) {
  const itemsJson = JSON.stringify(Array.isArray(items) ? items : []);
  if (clientId != null) {
    const existing = querySync('SELECT id FROM abandoned_cart WHERE client_id = $1', [clientId]).rows[0];
    if (existing) {
      querySync('UPDATE abandoned_cart SET items_json = $1, updated_at = NOW(), reminded = 0 WHERE client_id = $2', [itemsJson, clientId]);
      return existing.id;
    }
    const r = querySync(
      'INSERT INTO abandoned_cart (client_id, email, items_json) VALUES ($1, $2, $3) RETURNING id',
      [clientId, email || null, itemsJson]
    ).rows[0];
    return r.id;
  }
  if (email && email.trim()) {
    const existing = querySync('SELECT id FROM abandoned_cart WHERE email = $1 AND client_id IS NULL', [email.trim()]).rows[0];
    if (existing) {
      querySync('UPDATE abandoned_cart SET items_json = $1, updated_at = NOW(), reminded = 0 WHERE id = $2', [itemsJson, existing.id]);
      return existing.id;
    }
    const r = querySync(
      'INSERT INTO abandoned_cart (client_id, email, items_json) VALUES (NULL, $1, $2) RETURNING id',
      [email.trim(), itemsJson]
    ).rows[0];
    return r.id;
  }
  return null;
}

function getAbandonedCartsOlderThan(hoursAgo, limit) {
  const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
  const rows = querySync(
    `SELECT id, client_id, email, items_json, updated_at
     FROM abandoned_cart
     WHERE reminded = 0 AND updated_at <= NOW() - ($1 || ' hours')::interval
     ORDER BY updated_at ASC
     LIMIT $2`,
    [String(hoursAgo), limitNum]
  ).rows;
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
  const r = querySync('SELECT email FROM clients WHERE id = $1', [clientId]).rows[0];
  return r ? r.email : null;
}

function markAbandonedCartReminded(id) {
  querySync('UPDATE abandoned_cart SET reminded = 1 WHERE id = $1', [id]);
}

function saveProductView(clientId, sessionId, category, subcat, slug) {
  if (!category || !slug) return;
  const sub = (subcat || '').trim();
  try {
    querySync(
      'INSERT INTO product_views (client_id, session_id, category, subcat, slug) VALUES ($1, $2, $3, $4, $5)',
      [clientId || null, sessionId || null, category, sub, slug]
    );
  } catch (e) {}
}

function getProductRecommendations(options = {}) {
  const { clientId, sessionId, category, subcat, slug, limit = 8 } = options;
  const limitNum = Math.min(parseInt(limit, 10) || 8, 20);
  const products = getProductsNested();
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

  const scored = new Map();
  flat.forEach((p) => {
    const key = byKey(p.category, p.subcat, p.slug);
    scored.set(key, { ...p, score: 0 });
  });

  if (clientId || sessionId) {
    const viewRows = querySync(
      `SELECT category, subcat, slug, created_at FROM product_views
       WHERE (client_id = $1 OR session_id = $2) AND created_at > NOW() - INTERVAL '30 days'
       ORDER BY created_at DESC LIMIT 200`,
      [clientId || null, sessionId || null]
    ).rows;
    viewRows.forEach((r) => {
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

    const orderRows = querySync(
      `SELECT product_category, product_subcat, product_slug FROM orders
       WHERE client_id = $1 AND status = 'completed' AND product_slug IS NOT NULL`,
      [clientId || 0]
    ).rows;
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

function getSessionRow(sid) {
  const r = querySync('SELECT session, expire FROM sessions WHERE sid = $1 AND expire > NOW()', [sid]);
  return r.rows[0] || null;
}

function setSessionRow(sid, session, expireMs) {
  const expire = new Date(Date.now() + expireMs).toISOString();
  querySync(
    'INSERT INTO sessions (sid, session, expire) VALUES ($1, $2, $3::timestamptz) ON CONFLICT (sid) DO UPDATE SET session = $2, expire = $3::timestamptz',
    [sid, session, expire]
  );
}

function destroySessionRow(sid) {
  querySync('DELETE FROM sessions WHERE sid = $1', [sid]);
}

module.exports = {
  initDb,
  getOrders,
  addOrder,
  getOrderById,
  deleteOrder,
  updateOrderStatus,
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
  getDb,
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
  addAdminLoginLog,
  getAdminLoginLog,
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
  deleteProductAlertAfterNotify,
  savePushSubscription,
  getPushSubscriptionsByUser,
  deletePushSubscription
};
