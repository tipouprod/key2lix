/**
 * مسارات API الأدمن: طلبات، تقارير، إعدادات، كوبونات، نسخ احتياطي، موضوع، عملات، منتجات، عملاء، تواصل.
 * تحتاج جلسة أدمن (ما عدا /api/admin/2fa/verify-login الذي يبقى في server.js للمصادقة).
 */
const crypto = require('crypto');

/* ===== Local helpers ===== */
function orderValueToAmount(val) {
  if (val == null || String(val).trim() === '') return 0;
  const s = String(val).trim();
  const sep = s.match(/\s*-\s*/);
  const numStr = sep ? s.substring(s.indexOf(sep[0]) + sep[0].length).trim() : s;
  const n = parseFloat(numStr.replace(/\s/g, '').replace(/,/g, '.').replace(/[^\d.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function generateCouponCode(prefix) {
  const p = (prefix || 'KEY2LIX').trim().replace(/[^A-Za-z0-9]/g, '') || 'KEY2LIX';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let part = '';
  for (let i = 0; i < 16; i++) part += chars.charAt(crypto.randomInt(0, chars.length));
  return p + '-' + part;
}

function requireMainAdmin(req, res, next) {
  if (!req.session || !req.session.admin) return res.status(401).json({ error: 'Unauthorized' });
  if (req.session.adminSubUserId) return res.status(403).json({ error: 'Main admin only' });
  next();
}

function getCurrencyRateUsd(db) {
  return parseFloat(db.getSetting('currency_rate_usd') || process.env.CURRENCY_RATE_USD || '270') || 270;
}
function getCurrencyRateEur(db) {
  return parseFloat(db.getSetting('currency_rate_eur') || process.env.CURRENCY_RATE_EUR || '300') || 300;
}
function getRateToDzd(db, currency) {
  if (currency === 'USD') return getCurrencyRateUsd(db);
  if (currency === 'EUR') return getCurrencyRateEur(db);
  return 1;
}

/* ===== Theme constants (used by admin theme routes) ===== */
const THEME_KEYS = {
  primary: 'THEME_PRIMARY',
  secondary: 'THEME_SECONDARY',
  heroType: 'HERO_TYPE',
  heroImageUrl: 'HERO_IMAGE_URL',
  heroGradient: 'HERO_GRADIENT',
  heroColor: 'HERO_COLOR',
  heroTitle: 'HERO_TITLE',
  heroTagline: 'HERO_TAGLINE',
  heroCtaText: 'HERO_CTA_TEXT',
  heroCtaUrl: 'HERO_CTA_URL',
  heroVideoUrl: 'HERO_VIDEO_URL',
  categoryProducts: 'CATEGORY_ICON_PRODUCTS',
  categorySubscriptions: 'CATEGORY_ICON_SUBSCRIPTIONS',
  categoryHardware: 'CATEGORY_ICON_HARDWARE',
  categorySoftware: 'CATEGORY_ICON_SOFTWARE'
};
const HOME_SECTIONS_KEY_ORDER = 'HOME_SECTIONS_ORDER';
const HOME_SECTIONS_KEY_ENABLED = 'HOME_SECTIONS_ENABLED';
const EMAIL_TEMPLATE_KEYS = ['vendor_new_order', 'vendor_product_approved', 'client_order_status', 'client_new_reply', 'abandoned_cart', 'email_verification', 'password_reset'];

function registerAdminApi(app, opts) {
  const db = opts.db;
  const logger = opts.logger || { info: () => {}, warn: () => {}, error: () => {} };
  const express = opts.express;
  const path = opts.path;
  const fs = opts.fs;
  const requireAdmin = opts.requireAdmin;
  const requireAdminRole = opts.requireAdminRole;
  const getUpload = opts.getUpload;
  const getExcelJS = opts.getExcelJS;
  const getPDFDocument = opts.getPDFDocument;
  const getBcrypt = opts.getBcrypt;
  const getSpeakeasy = opts.getSpeakeasy;
  const processImageToWebP = opts.processImageToWebP;
  const maybeUploadImagesToS3 = opts.maybeUploadImagesToS3;
  const invalidateProductsCache = opts.invalidateProductsCache;
  const auditLog = opts.auditLog;
  const commissionService = opts.commissionService;
  const emailService = opts.emailService || {};
  const queue = opts.queue || null;
  const rootDir = opts.rootDir || process.cwd();
  const imgDir = opts.imgDir || path.join(rootDir, 'client', 'assets', 'img');
  const ADMIN_PASS = opts.ADMIN_PASS || '';
  const isAdminTotpEnabled = opts.isAdminTotpEnabled || (() => false);
  const isProduction = opts.isProduction !== false;
  const DEFAULT_PRIMARY = opts.DEFAULT_PRIMARY || '#7c3aed';
  const DEFAULT_SECONDARY = opts.DEFAULT_SECONDARY || '#5b21b6';
  const getHomeSectionsOrder = opts.getHomeSectionsOrder || (() => []);
  const getHomeSectionsEnabled = opts.getHomeSectionsEnabled || (() => ({}));
  const adminSecurity = opts.adminSecurity || { getCsrfToken: () => '' };
  const Sentry = opts.Sentry || { captureException: () => {}, recentErrors: [] };

  if (!db || !express || !requireAdmin || !getUpload || !getExcelJS || !getPDFDocument || !getBcrypt || !getSpeakeasy) {
    throw new Error('routes/admin-api: db, express, requireAdmin, getUpload, getExcelJS, getPDFDocument, getBcrypt, getSpeakeasy are required');
  }
  if (!processImageToWebP || !maybeUploadImagesToS3 || typeof invalidateProductsCache !== 'function') {
    throw new Error('routes/admin-api: processImageToWebP, maybeUploadImagesToS3, invalidateProductsCache are required');
  }

  /* ===== CSRF Token ===== */
  app.get('/api/admin/csrf-token', requireAdmin, (req, res) => {
    const token = adminSecurity.getCsrfToken(req);
    res.json({ csrfToken: token || '' });
  });

  /* ===== Orders export + list ===== */
  app.get('/api/orders/export.xlsx', requireAdmin, async (req, res) => {
    try {
      const orders = db.getOrders() || [];
      const workbook = new getExcelJS().Workbook();
      const sheet = workbook.addWorksheet('Orders');
      sheet.columns = [
        { header: 'ID', key: 'id', width: 18 },
        { header: 'Date', key: 'date', width: 22 },
        { header: 'Product', key: 'product', width: 30 },
        { header: 'Value', key: 'value', width: 12 },
        { header: 'Name', key: 'name', width: 20 },
        { header: 'Phone', key: 'phone', width: 16 },
        { header: 'Email', key: 'email', width: 24 },
        { header: 'Address', key: 'address', width: 28 },
        { header: 'Commission', key: 'commission_amount', width: 12 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Completed at', key: 'completed_at', width: 22 },
        { header: 'Client email', key: 'client_email', width: 24 }
      ];
      sheet.addRows(orders.map((o) => ({
        id: o.id || '',
        date: o.date || '',
        product: o.product || '',
        value: o.value != null ? o.value : '',
        name: o.name || '',
        phone: o.phone || '',
        email: o.email || '',
        address: o.address || '',
        commission_amount: o.commission_amount != null ? o.commission_amount : '',
        status: o.status || '',
        completed_at: o.completed_at || '',
        client_email: o.client_email || ''
      })));
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="key2lix-orders-' + (new Date().toISOString().slice(0, 10)) + '.xlsx"');
      const buffer = await workbook.xlsx.writeBuffer();
      res.send(buffer);
    } catch (err) {
      logger.error({ err: err.message }, 'Orders Excel export failed');
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/orders', requireAdmin, (req, res) => {
    try {
      const filters = {
        date_from: (req.query.dateFrom || req.query.date_from || '').trim() || null,
        date_to: (req.query.dateTo || req.query.date_to || '').trim() || null,
        vendor_id: req.query.vendor_id != null && req.query.vendor_id !== '' ? parseInt(req.query.vendor_id, 10) : null,
        status: (req.query.status || '').trim() || null,
        product_category: (req.query.product_category || '').trim() || null,
        price_min: req.query.price_min != null && req.query.price_min !== '' ? parseFloat(req.query.price_min) : null,
        price_max: req.query.price_max != null && req.query.price_max !== '' ? parseFloat(req.query.price_max) : null,
        coupon_used: req.query.coupon_used === '1' || req.query.coupon_used === 'true' ? true : (req.query.coupon_used === '0' || req.query.coupon_used === 'false' ? false : null)
      };
      const hasFilters = Object.keys(filters).some((k) => filters[k] != null && filters[k] !== '');
      const orders = hasFilters ? db.getOrdersFiltered(filters) : db.getOrders();
      res.json(orders);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Admin bulk orders ===== */
  app.post('/api/admin/orders/bulk-status', requireAdmin, express.json(), (req, res) => {
    try {
      const { order_ids, status } = req.body || {};
      if (!Array.isArray(order_ids) || !status) return res.status(400).json({ error: 'order_ids (array) and status required' });
      const role = req.session && req.session.adminRole;
      if (role === 'content_supervisor') return res.status(403).json({ error: 'No permission for orders' });
      const result = db.bulkUpdateOrderStatus(order_ids, status);
      auditLog('admin', req.session.adminSubUserId || null, 'bulk_order_status', { count: result.updated, status }, req);
      res.json({ success: true, updated: result.updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/orders/bulk-export', requireAdmin, express.json(), (req, res) => {
    try {
      const { order_ids } = req.body || {};
      if (!Array.isArray(order_ids) || order_ids.length === 0) return res.status(400).json({ error: 'order_ids required' });
      const allOrders = db.getOrders();
      const ids = new Set(order_ids.map((id) => String(id).trim()).filter(Boolean));
      const orders = allOrders.filter((o) => ids.has(o.id));
      const headers = ['id', 'date', 'product', 'value', 'name', 'phone', 'email', 'address', 'commission_amount', 'status', 'completed_at', 'client_email', 'vendor_name'];
      let csv = headers.join(',') + '\n';
      orders.forEach((o) => {
        const row = headers.map((h) => '"' + String(o[h] || '').replace(/"/g, '""') + '"');
        csv += row.join(',') + '\n';
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="key2lix-orders-selected-' + new Date().toISOString().slice(0, 10) + '.csv"');
      res.send('\ufeff' + csv);
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/orders/bulk-email-vendor', requireAdmin, express.json(), async (req, res) => {
    try {
      const { order_ids, subject, body } = req.body || {};
      if (!Array.isArray(order_ids) || order_ids.length === 0) return res.status(400).json({ error: 'order_ids required' });
      const role = req.session && req.session.adminRole;
      if (role === 'content_supervisor') return res.status(403).json({ error: 'No permission for orders' });
      const allOrders = db.getOrders();
      const ids = new Set(order_ids.map((id) => String(id).trim()).filter(Boolean));
      const orders = allOrders.filter((o) => ids.has(o.id) && o.vendor_id);
      const vendorIds = new Set(orders.map((o) => o.vendor_id));
      let sent = 0;
      if (emailService.isConfigured && emailService.isConfigured()) {
        for (const vid of vendorIds) {
          const vendor = db.getVendorById(vid);
          if (vendor && vendor.email && vendor.notify_by_email !== false) {
            const subj = (subject || 'تنبيه بخصوص الطلبات').trim();
            const txt = (body || 'لديك طلبات تحتاج متابعة.').trim();
            try {
              if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) {
                await queue.addEmailJob({ type: 'sendMail', to: vendor.email, subject: subj, text: txt });
              } else {
                await emailService.sendMail(vendor.email, subj, txt);
              }
              sent++;
            } catch (e) { }
          }
        }
      }
      res.json({ success: true, sent });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/products/bulk-approve', requireAdmin, express.json(), async (req, res) => {
    try {
      const { items } = req.body || {};
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items (array of {category, subcat, slug}) required' });
      const role = req.session && req.session.adminRole;
      if (role === 'order_supervisor') return res.status(403).json({ error: 'No permission for products' });
      const result = db.bulkUpdateProductStatus(items, 'approved');
      for (const it of items.slice(0, 5)) {
        const product = db.getProductByKey(it.category, it.subcat || '', it.slug);
        if (product && product.vendor_id && emailService.isConfigured && emailService.isConfigured()) {
          const vendor = db.getVendorById(product.vendor_id);
          if (vendor && vendor.email && vendor.notify_by_email !== false) {
            try {
              if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) queue.addEmailJob({ type: 'notifyVendorProductApproved', to: vendor.email, productName: product.name }).catch(() => { });
              else emailService.notifyVendorProductApproved(vendor.email, product.name).catch(() => { });
            } catch (e) { }
          }
        }
      }
      auditLog('admin', req.session.adminSubUserId || null, 'bulk_product_approve', { count: result.updated }, req);
      res.json({ success: true, updated: result.updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/products/bulk-reject', requireAdmin, express.json(), (req, res) => {
    try {
      const { items } = req.body || {};
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items (array of {category, subcat, slug}) required' });
      const role = req.session && req.session.adminRole;
      if (role === 'order_supervisor') return res.status(403).json({ error: 'No permission for products' });
      const result = db.bulkUpdateProductStatus(items, 'rejected');
      auditLog('admin', req.session.adminSubUserId || null, 'bulk_product_reject', { count: result.updated }, req);
      res.json({ success: true, updated: result.updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/search', requireAdmin, (req, res) => {
    try {
      const q = (req.query.q || '').trim().toLowerCase();
      if (!q || q.length < 2) return res.json({ orders: [], vendors: [], coupons: [] });
      const orders = (db.getOrders() || []).filter((o) =>
        (o.id || '').toLowerCase().includes(q) || (o.product || '').toLowerCase().includes(q) || (o.name || '').toLowerCase().includes(q)
      ).slice(0, 8).map((o) => ({ id: o.id, product: o.product, date: o.date, link: '/order-chat?order=' + encodeURIComponent(o.id) }));
      const vendors = (db.getVendors() || []).filter((v) =>
        (v.name || '').toLowerCase().includes(q) || (v.email || '').toLowerCase().includes(q)
      ).slice(0, 8).map((v) => ({ id: v.id, name: v.name, email: v.email, status: v.status }));
      const coupons = (db.getCouponsList && db.getCouponsList(50, 0, q, null) || []).slice(0, 8).map((c) => ({
        id: c.id, code: c.code, type: c.type, value: c.value, active: c.active, link: '/admin#coupons'
      }));
      res.json({ orders, vendors, coupons });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/notifications', requireAdmin, (req, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const orders = db.getOrders() || [];
      const ordersToday = orders.filter((o) => o.date && o.date.slice(0, 10) === today);
      const pendingReply = db.getOrdersPendingVendorReply ? db.getOrdersPendingVendorReply() : [];
      const productsPending = db.getProductsPendingApproval ? db.getProductsPendingApproval() : [];
      const contacts = (db.getContacts() || []).slice(0, 10);
      const maintenance = db.getSetting ? (db.getSetting('maintenance_mode') || db.getSetting('MAINTENANCE_MODE') || '0') : '0';
      const notifications = [];
      if (ordersToday.length > 0) {
        notifications.push({ id: 'notif-orders-today', type: 'new_orders', title: ordersToday.length === 1 ? 'طلب جديد اليوم' : 'طلبات جديدة اليوم: ' + ordersToday.length, link: '/order-chat?order=' + encodeURIComponent(ordersToday[0].id), tab: 'orders', count: ordersToday.length, date: today });
      }
      if (pendingReply.length > 0) {
        notifications.push({ id: 'notif-pending-reply', type: 'pending_vendor', title: pendingReply.length === 1 ? 'طلب بلا رد من البائع' : 'طلبات بلا رد: ' + pendingReply.length, link: '/order-chat?order=' + encodeURIComponent(pendingReply[0].id), tab: 'orders', count: pendingReply.length });
      }
      if (productsPending.length > 0) {
        notifications.push({ id: 'notif-products-pending', type: 'products_review', title: productsPending.length === 1 ? 'منتج قيد المراجعة' : 'منتجات قيد المراجعة: ' + productsPending.length, link: '#', tab: 'products', count: productsPending.length });
      }
      contacts.slice(0, 3).forEach((c) => {
        notifications.push({ id: 'notif-contact-' + c.id, type: 'contact', title: 'رسالة تواصل: ' + (c.subject || c.name || 'بدون موضوع'), link: '#', tab: 'messages', date: c.date });
      });
      if (maintenance === '1' || maintenance === 'true') {
        notifications.push({ id: 'notif-maintenance', type: 'system', title: 'وضع الصيانة مفعّل', link: '#', tab: 'settings' });
      }
      res.json({ notifications, unread: notifications.length });
    } catch (err) {
      res.status(500).json({ error: err.message, notifications: [], unread: 0 });
    }
  });

  app.get('/api/admin/notifications/stream', requireAdmin, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    let lastCount = -1;
    const send = (data) => {
      res.write('data: ' + JSON.stringify(data) + '\n\n');
      try { res.flush && res.flush(); } catch (_) { }
    };
    const tick = () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const orders = db.getOrders() || [];
        const ordersToday = orders.filter((o) => o.date && o.date.slice(0, 10) === today).length;
        const pendingReply = (db.getOrdersPendingVendorReply ? db.getOrdersPendingVendorReply() : []).length;
        const productsPending = (db.getProductsPendingApproval ? db.getProductsPendingApproval() : []).length;
        const contacts = (db.getContacts() || []).length;
        const maintenance = (db.getSetting && (db.getSetting('maintenance_mode') === '1' || db.getSetting('MAINTENANCE_MODE') === '1')) ? 1 : 0;
        const count = ordersToday + pendingReply + productsPending + Math.min(contacts, 3) + maintenance;
        if (count !== lastCount) { lastCount = count; send({ type: 'notifications', count }); }
      } catch (_) { }
    };
    tick();
    const iv = setInterval(tick, 8000);
    req.on('close', () => clearInterval(iv));
  });

  app.get('/api/admin/stats', requireAdmin, (req, res) => {
    try {
      const orders = db.getOrders() || [];
      const vendors = db.getVendors() || [];
      const clients = db.getClients() || [];
      const completedOrders = orders.filter((o) => o.status === 'completed');
      const totalCommission = completedOrders.reduce((sum, o) => sum + (Number(o.commission_amount) || 0), 0);
      const today = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const ordersToday = orders.filter((o) => o.date && o.date.slice(0, 10) === today).length;
      const ordersThisWeek = orders.filter((o) => o.date && o.date.slice(0, 10) >= weekAgo).length;
      const pendingVendorReply = db.getOrdersPendingVendorReply ? db.getOrdersPendingVendorReply() : [];
      let lastBackup = null;
      try {
        if (fs.existsSync(backupDir)) {
          const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db'));
          if (files.length) {
            const stats = fs.statSync(path.join(backupDir, files.sort().reverse()[0]));
            lastBackup = stats.mtime.toISOString();
          }
        }
      } catch (e) { }
      res.json({
        ordersCount: orders.length,
        vendorsCount: vendors.length,
        clientsCount: clients.length,
        totalCommission,
        ordersToday,
        ordersThisWeek,
        pendingVendorReplyCount: pendingVendorReply.length,
        lastBackup
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/analytics', requireAdmin, (req, res) => {
    try {
      const period = Math.min(365, Math.max(7, parseInt(req.query.period, 10) || 30));
      const toDate = new Date();
      const fromDate = new Date(toDate.getTime() - period * 24 * 60 * 60 * 1000);
      const fromStr = fromDate.toISOString().slice(0, 10);
      const toStr = toDate.toISOString().slice(0, 10);
      const orders = (db.getOrdersForReport ? db.getOrdersForReport(fromStr, toStr, null) : []).filter((o) => o.date);
      const byDay = {};
      for (let d = 0; d < period; d++) {
        const dte = new Date(fromDate.getTime() + d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        byDay[dte] = { date: dte, count: 0, totalValue: 0 };
      }
      const byProduct = {};
      const byVendor = {};
      let totalSales = 0;
      orders.forEach((o) => {
        const day = (o.date || '').slice(0, 10);
        if (byDay[day]) {
          byDay[day].count += 1;
          const amt = orderValueToAmount(o.value);
          byDay[day].totalValue += amt;
          totalSales += amt;
        }
        const prod = (o.product || '').trim() || '—';
        if (!byProduct[prod]) byProduct[prod] = { product: prod, count: 0, totalValue: 0 };
        byProduct[prod].count += 1;
        byProduct[prod].totalValue += orderValueToAmount(o.value);
        const vid = o.vendor_id != null ? o.vendor_id : 0;
        const vname = o.vendor_name || (vid === 0 ? '—' : '#' + vid);
        if (!byVendor[vid]) byVendor[vid] = { vendor_id: vid, vendor_name: vname, count: 0, totalValue: 0 };
        byVendor[vid].count += 1;
        byVendor[vid].totalValue += orderValueToAmount(o.value);
      });
      const ordersByDay = Object.keys(byDay).sort().map((d) => byDay[d]);
      const topProducts = Object.values(byProduct).sort((a, b) => b.count - a.count).slice(0, 15);
      const topVendors = Object.values(byVendor).sort((a, b) => b.totalValue - a.totalValue).slice(0, 10);
      res.json({ summary: { totalOrders: orders.length, totalSales, period }, ordersByDay, topProducts, topVendors });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/monitoring', requireAdmin, (req, res) => {
    try {
      let dbStatus = 'connected';
      try {
        if (db.getDb) db.getDb().prepare('SELECT 1').get();
        else db.getOrders();
      } catch (e) {
        dbStatus = 'error';
      }
      let backupCount = 0, backupSizeBytes = 0, lastBackup = null;
      if (fs.existsSync(backupDir)) {
        const files = fs.readdirSync(backupDir);
        backupCount = files.length;
        for (const f of files) {
          try {
            const st = fs.statSync(path.join(backupDir, f));
            backupSizeBytes += st.size;
            if (st.mtime && (!lastBackup || st.mtime > lastBackup)) lastBackup = st.mtime;
          } catch (_) { }
        }
      }
      res.json({
        db: dbStatus,
        dbStatus: dbStatus === 'connected' ? 'ok' : 'error',
        uptime_seconds: Math.floor(process.uptime()),
        uptimeSeconds: Math.floor(process.uptime()),
        backup: { count: backupCount, size_bytes: backupSizeBytes },
        backupSize: backupSizeBytes,
        lastBackup: lastBackup ? lastBackup.toISOString() : null,
        sentry_configured: !!(process.env.SENTRY_DSN && process.env.SENTRY_DSN.trim()),
        recent_errors: (Sentry.recentErrors || []).slice(-10),
        lastErrors: (Sentry.recentErrors || []).map((e) => ({ msg: e.message, ts: e.at }))
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/contacts', requireAdmin, (req, res) => {
    try {
      res.json(db.getContacts());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/clients', requireAdmin, (req, res) => {
    try {
      res.json(db.getClients());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Coupons ===== */
  app.post('/api/admin/coupons/generate', requireAdmin, express.json(), (req, res) => {
    try {
      const { type, value, count, prefix, valid_from, valid_until, min_order_amount, usage_limit, first_order_only, allowed_emails } = req.body || {};
      const couponType = type === 'fixed' ? 'fixed' : 'percent';
      const val = type === 'fixed' ? parseFloat(value) : Math.min(100, Math.max(0, parseFloat(value)));
      if (isNaN(val) || val < 0) return res.status(400).json({ error: 'قيمة الخصم غير صالحة' });
      if (couponType === 'percent' && val > 100) return res.status(400).json({ error: 'نسبة الخصم يجب أن تكون بين 0 و 100' });
      const num = Math.min(5000, Math.max(1, parseInt(count, 10) || 1000));
      const pre = (prefix && String(prefix).trim()) ? String(prefix).trim().replace(/[^A-Za-z0-9]/g, '') : 'KEY2LIX';
      const validFrom = (valid_from && String(valid_from).trim()) || new Date().toISOString().slice(0, 10);
      const validUntil = (valid_until && String(valid_until).trim()) || null;
      const minOrder = (min_order_amount != null && !isNaN(Number(min_order_amount))) ? Math.max(0, Number(min_order_amount)) : null;
      const usageLimit = (usage_limit != null && !isNaN(parseInt(usage_limit, 10))) ? Math.min(10000, Math.max(1, parseInt(usage_limit, 10))) : 1;
      const firstOrderOnly = !!(first_order_only === true || first_order_only === 1 || first_order_only === '1');
      const allowedEmails = (allowed_emails != null && String(allowed_emails).trim()) ? String(allowed_emails).trim() : null;
      const codes = [];
      const used = new Set();
      for (let i = 0; i < num; i++) {
        let code;
        do { code = generateCouponCode(pre); } while (used.has(code));
        if (db.getCouponByCode(code)) {
          i--;
          if (num - codes.length > 5000) return res.status(500).json({ error: 'تعذر إنشاء أكواد فريدة. غيّر البادئة أو قلّل العدد.' });
          continue;
        }
        used.add(code);
        try {
          db.insertCoupon(code, couponType, val, validFrom, validUntil, usageLimit, minOrder, 1, firstOrderOnly, allowedEmails, null, null, null, false);
          codes.push(code);
        } catch (err) {
          if (err.message && (err.message.indexOf('UNIQUE') >= 0 || err.message.indexOf('unique') >= 0)) {
            used.delete(code);
            i--;
            if (num - codes.length > 5000) return res.status(500).json({ error: 'تعذر إنشاء أكواد فريدة. غيّر البادئة أو قلّل العدد.' });
          } else throw err;
        }
      }
      res.json({ success: true, count: codes.length, codes, message: 'تم إنشاء ' + codes.length + ' كوبون. كل كوبون صالح لاستخدام واحد.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/coupons', requireAdmin, (req, res) => {
    try {
      const limit = req.query.limit || 100;
      const offset = req.query.offset || 0;
      const search = req.query.search || '';
      const status = req.query.status || '';
      const list = db.getCouponsList(limit, offset, search, status);
      res.json({ coupons: list });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/coupons/add', requireAdmin, express.json(), (req, res) => {
    try {
      const { code, type, value, valid_from, valid_until, usage_limit, min_order_amount, first_order_only, allowed_emails, product_category, product_subcat, product_slug, free_shipping } = req.body || {};
      const rawCode = (code && String(code).trim()) || '';
      if (!rawCode) return res.status(400).json({ error: 'أدخل كود الكوبون.' });
      if (db.getCouponByCode(rawCode)) return res.status(400).json({ error: 'هذا الكود موجود مسبقاً. استخدم كوداً فريداً.' });
      const isFreeShip = !!(free_shipping === true || free_shipping === 1 || free_shipping === '1');
      const couponType = type === 'fixed' ? 'fixed' : 'percent';
      const val = (type === 'fixed' || isFreeShip) ? parseFloat(value) : Math.min(100, Math.max(0, parseFloat(value)));
      if (isNaN(val) && !isFreeShip) return res.status(400).json({ error: 'قيمة الخصم غير صالحة.' });
      if (couponType === 'percent' && val > 100) return res.status(400).json({ error: 'نسبة الخصم يجب أن تكون بين 0 و 100.' });
      const usageLimit = usage_limit != null ? Math.min(10000, Math.max(1, parseInt(usage_limit, 10))) : 1;
      const validFrom = (valid_from && String(valid_from).trim()) || new Date().toISOString().slice(0, 10);
      const validUntil = (valid_until && String(valid_until).trim()) || null;
      const minOrder = (min_order_amount != null && !isNaN(Number(min_order_amount))) ? Math.max(0, Number(min_order_amount)) : null;
      const firstOrderOnly = !!(first_order_only === true || first_order_only === 1 || first_order_only === '1');
      const allowedEmails = (allowed_emails != null && String(allowed_emails).trim()) ? String(allowed_emails).trim() : null;
      const productCategory = (product_category != null && String(product_category).trim()) ? String(product_category).trim() : null;
      const productSubcat = (product_subcat != null && String(product_subcat).trim()) ? String(product_subcat).trim() : null;
      const productSlug = (product_slug != null && String(product_slug).trim()) ? String(product_slug).trim() : null;
      db.insertCoupon(rawCode, couponType, isFreeShip ? 0 : val, validFrom, validUntil, usageLimit, minOrder, 1, firstOrderOnly, allowedEmails, productCategory, productSubcat, productSlug, isFreeShip);
      res.json({ success: true, message: 'تمت إضافة الكوبون.', code: rawCode });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/admin/coupons/:id/active', requireAdmin, express.json(), (req, res) => {
    try {
      const id = req.params.id;
      const active = req.body && (req.body.active === true || req.body.active === 1);
      db.updateCouponActive(id, active);
      res.json({ success: true, active: !!active });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/admin/coupons/:id', requireAdmin, express.json(), (req, res) => {
    try {
      const id = req.params.id;
      const { usage_limit, valid_from, valid_until, min_order_amount, active } = req.body || {};
      const updates = {};
      if (usage_limit !== undefined) updates.usage_limit = usage_limit;
      if (valid_from !== undefined) updates.valid_from = valid_from;
      if (valid_until !== undefined) updates.valid_until = valid_until;
      if (min_order_amount !== undefined) updates.min_order_amount = min_order_amount;
      if (active !== undefined) updates.active = active;
      db.updateCoupon(id, updates);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/admin/coupons/:id', requireAdmin, (req, res) => {
    try {
      const id = req.params.id;
      db.deleteCoupon(id);
      res.json({ success: true, message: 'تم حذف الكوبون.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/coupons/stats', requireAdmin, (req, res) => {
    try {
      const stats = db.getCouponStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/clients/export.csv', requireAdmin, (req, res) => {
    try {
      const clients = db.getClients() || [];
      const headers = ['id', 'email', 'name', 'phone', 'created_at'];
      const csv = [headers.join(',')].concat(
        clients.map((c) => headers.map((h) => '"' + String(c[h] ?? '').replace(/"/g, '""') + '"').join(','))
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="key2lix-clients-' + new Date().toISOString().slice(0, 10) + '.csv"');
      res.send('\ufeff' + csv);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/orders-count', requireAdmin, (req, res) => {
    try {
      const orders = db.getOrders() || [];
      res.json({ count: orders.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/orders-pending-vendor-reply', requireAdmin, (req, res) => {
    try {
      res.json(db.getOrdersPendingVendorReply());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/products-pending', requireAdmin, (req, res) => {
    try {
      res.json(db.getProductsPendingApproval());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Admin search ===== */
  app.get('/api/admin/search', requireAdmin, (req, res) => {
    try {
      const q = (req.query.q || '').trim().toLowerCase();
      if (!q || q.length < 2) return res.json({ orders: [], vendors: [], coupons: [] });
      const orders = (db.getOrders() || []).filter((o) =>
        (o.id || '').toLowerCase().includes(q) || (o.product || '').toLowerCase().includes(q) || (o.name || '').toLowerCase().includes(q)
      ).slice(0, 8).map((o) => ({ id: o.id, product: o.product, date: o.date, link: '/order-chat?order=' + encodeURIComponent(o.id) }));
      const vendors = (db.getVendors() || []).filter((v) =>
        (v.name || '').toLowerCase().includes(q) || (v.email || '').toLowerCase().includes(q)
      ).slice(0, 8).map((v) => ({ id: v.id, name: v.name, email: v.email, status: v.status }));
      const coupons = (db.getCouponsList && db.getCouponsList(50, 0, q, null) || []).slice(0, 8).map((c) => ({
        id: c.id, code: c.code, type: c.type, value: c.value, active: c.active, link: '/admin#coupons'
      }));
      res.json({ orders, vendors, coupons });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Admin notifications ===== */
  app.get('/api/admin/notifications', requireAdmin, (req, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const orders = db.getOrders() || [];
      const ordersToday = orders.filter((o) => o.date && o.date.slice(0, 10) === today);
      const pendingReply = db.getOrdersPendingVendorReply() || [];
      const productsPending = db.getProductsPendingApproval() || [];
      const contacts = (db.getContacts() || []).slice(0, 10);
      const maintenance = db.getSetting ? (db.getSetting('maintenance_mode') || '0') : '0';
      const notifications = [];
      if (ordersToday.length > 0) {
        notifications.push({
          id: 'notif-orders-today',
          type: 'new_orders',
          title: ordersToday.length === 1 ? 'طلب جديد اليوم' : 'طلبات جديدة اليوم: ' + ordersToday.length,
          link: '/order-chat?order=' + encodeURIComponent(ordersToday[0].id),
          tab: 'orders',
          count: ordersToday.length,
          date: today
        });
      }
      if (pendingReply.length > 0) {
        notifications.push({
          id: 'notif-pending-reply',
          type: 'pending_vendor',
          title: pendingReply.length === 1 ? 'طلب بلا رد من البائع' : 'طلبات بلا رد: ' + pendingReply.length,
          link: '/order-chat?order=' + encodeURIComponent(pendingReply[0].id),
          tab: 'orders',
          count: pendingReply.length
        });
      }
      if (productsPending.length > 0) {
        notifications.push({
          id: 'notif-products-pending',
          type: 'products_review',
          title: productsPending.length === 1 ? 'منتج قيد المراجعة' : 'منتجات قيد المراجعة: ' + productsPending.length,
          link: '#',
          tab: 'products',
          count: productsPending.length
        });
      }
      contacts.slice(0, 3).forEach((c) => {
        notifications.push({
          id: 'notif-contact-' + c.id,
          type: 'contact',
          title: 'رسالة تواصل: ' + (c.subject || c.name || 'بدون موضوع'),
          link: '#',
          tab: 'messages',
          date: c.date
        });
      });
      if (maintenance === '1') {
        notifications.push({ id: 'notif-maintenance', type: 'system', title: 'وضع الصيانة مفعّل', link: '#', tab: 'settings' });
      }
      const unread = notifications.length;
      res.json({ notifications, unread });
    } catch (err) {
      res.status(500).json({ error: err.message, notifications: [], unread: 0 });
    }
  });

  app.get('/api/admin/notifications/stream', requireAdmin, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    let lastCount = -1;
    const send = (data) => {
      res.write('data: ' + JSON.stringify(data) + '\n\n');
      try { res.flush && res.flush(); } catch (_) { }
    };
    const tick = () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const orders = db.getOrders() || [];
        const ordersToday = orders.filter((o) => o.date && o.date.slice(0, 10) === today).length;
        const pendingReply = (db.getOrdersPendingVendorReply() || []).length;
        const productsPending = (db.getProductsPendingApproval() || []).length;
        const contacts = (db.getContacts() || []).length;
        const maintenance = (db.getSetting && db.getSetting('maintenance_mode') === '1') ? 1 : 0;
        const count = ordersToday + pendingReply + productsPending + Math.min(contacts, 3) + maintenance;
        if (count !== lastCount) { lastCount = count; send({ type: 'notifications', count }); }
      } catch (_) { }
    };
    tick();
    const iv = setInterval(tick, 8000);
    req.on('close', () => clearInterval(iv));
  });

  /* ===== Admin stats ===== */
  app.get('/api/admin/stats', requireAdmin, (req, res) => {
    try {
      const orders = db.getOrders() || [];
      const vendors = db.getVendors() || [];
      const clients = db.getClients() || [];
      const completedOrders = orders.filter((o) => o.status === 'completed');
      const totalCommission = completedOrders.reduce((sum, o) => sum + (Number(o.commission_amount) || 0), 0);
      const today = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const ordersToday = orders.filter((o) => o.date && o.date.slice(0, 10) === today).length;
      const ordersThisWeek = orders.filter((o) => o.date && o.date.slice(0, 10) >= weekAgo).length;
      const pendingVendorReply = db.getOrdersPendingVendorReply() || [];
      let lastBackup = null;
      try {
        const backupDir = path.join(rootDir, 'client', 'data', 'backup');
        if (fs.existsSync(backupDir)) {
          const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db'));
          if (files.length) {
            const stats = fs.statSync(path.join(backupDir, files.sort().reverse()[0]));
            lastBackup = stats.mtime.toISOString();
          }
        }
      } catch (e) { }
      res.json({
        ordersCount: orders.length,
        vendorsCount: vendors.length,
        clientsCount: clients.length,
        totalCommission,
        ordersToday,
        ordersThisWeek,
        pendingVendorReplyCount: pendingVendorReply.length,
        lastBackup
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Admin analytics ===== */
  app.get('/api/admin/analytics', requireAdmin, (req, res) => {
    try {
      const period = Math.min(365, Math.max(7, parseInt(req.query.period, 10) || 30));
      const toDate = new Date();
      const fromDate = new Date(toDate.getTime() - period * 24 * 60 * 60 * 1000);
      const fromStr = fromDate.toISOString().slice(0, 10);
      const toStr = toDate.toISOString().slice(0, 10);
      const orders = (db.getOrdersForReport(fromStr, toStr, null) || []).filter((o) => o.date);
      const byDay = {};
      for (let d = 0; d < period; d++) {
        const dte = new Date(fromDate.getTime() + d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        byDay[dte] = { date: dte, count: 0, totalValue: 0 };
      }
      const byProduct = {};
      const byVendor = {};
      let totalSales = 0;
      orders.forEach((o) => {
        const day = (o.date || '').slice(0, 10);
        if (byDay[day]) {
          byDay[day].count += 1;
          const amt = orderValueToAmount(o.value);
          byDay[day].totalValue += amt;
          totalSales += amt;
        }
        const prod = (o.product || '').trim() || '—';
        if (!byProduct[prod]) byProduct[prod] = { product: prod, count: 0, totalValue: 0 };
        byProduct[prod].count += 1;
        byProduct[prod].totalValue += orderValueToAmount(o.value);
        const vid = o.vendor_id != null ? o.vendor_id : 0;
        const vname = o.vendor_name || (vid === 0 ? '—' : '#' + vid);
        if (!byVendor[vid]) byVendor[vid] = { vendor_id: vid, vendor_name: vname, count: 0, totalValue: 0 };
        byVendor[vid].count += 1;
        byVendor[vid].totalValue += orderValueToAmount(o.value);
      });
      const ordersByDay = Object.keys(byDay).sort().map((d) => byDay[d]);
      const topProducts = Object.values(byProduct).sort((a, b) => b.count - a.count).slice(0, 15);
      const topVendors = Object.values(byVendor).sort((a, b) => b.totalValue - a.totalValue).slice(0, 10);
      res.json({
        summary: { totalOrders: orders.length, totalSales, period },
        ordersByDay,
        topProducts,
        topVendors
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Admin monitoring ===== */
  app.get('/api/admin/monitoring', requireAdmin, (req, res) => {
    try {
      let dbStatus = 'connected';
      try {
        db.getDb().prepare('SELECT 1').get();
      } catch (e) {
        dbStatus = 'error';
      }
      const backupDir = path.join(rootDir, 'client', 'data', 'backup');
      let backupCount = 0;
      let backupSizeBytes = 0;
      let lastBackup = null;
      if (fs.existsSync(backupDir)) {
        const files = fs.readdirSync(backupDir);
        backupCount = files.length;
        for (const f of files) {
          try {
            const st = fs.statSync(path.join(backupDir, f));
            backupSizeBytes += st.size;
            if (st.mtime && (!lastBackup || st.mtime > lastBackup)) lastBackup = st.mtime;
          } catch (_) { }
        }
      }
      res.json({
        db: dbStatus,
        dbStatus: dbStatus === 'connected' ? 'ok' : 'error',
        uptime_seconds: Math.floor(process.uptime()),
        uptimeSeconds: Math.floor(process.uptime()),
        backup: { count: backupCount, size_bytes: backupSizeBytes },
        backupSize: backupSizeBytes,
        lastBackup: lastBackup ? lastBackup.toISOString() : null,
        sentry_configured: !!process.env.SENTRY_DSN,
        recent_errors: (Sentry.recentErrors || []).slice(-10),
        lastErrors: (Sentry.recentErrors || []).map((e) => ({ msg: e.message, ts: e.at }))
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/products/approve', requireAdmin, (req, res) => {
    try {
      const { category, subcat, slug } = req.body || {};
      if (!category || !slug) return res.status(400).json({ error: 'category and slug required' });
      const product = db.getProductByKey(category, subcat || '', slug);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      const ok = db.updateProductStatus(category, subcat || '', slug, 'approved');
      if (ok) invalidateProductsCache && invalidateProductsCache();
      if (!ok) return res.status(404).json({ error: 'Product not found' });
      auditLog('admin', req.session.adminSubUserId || null, 'product_approve', { category, subcat: subcat || '', slug }, req);
      if (product.vendor_id && emailService.isConfigured && emailService.isConfigured()) {
        const vendor = db.getVendorById(product.vendor_id);
        if (vendor && vendor.email && vendor.notify_by_email !== false) {
          if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) queue.addEmailJob({ type: 'notifyVendorProductApproved', to: vendor.email, productName: product.name }).catch(() => { });
          else emailService.notifyVendorProductApproved(vendor.email, product.name).catch(() => { });
        }
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/products/reject', requireAdmin, (req, res) => {
    try {
      const { category, subcat, slug } = req.body || {};
      if (!category || !slug) return res.status(400).json({ error: 'category and slug required' });
      const ok = db.updateProductStatus(category, subcat || '', slug, 'rejected');
      if (ok) invalidateProductsCache && invalidateProductsCache();
      if (!ok) return res.status(404).json({ error: 'Product not found' });
      auditLog('admin', req.session.adminSubUserId || null, 'product_reject', { category, subcat: subcat || '', slug }, req);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/vendors/performance', requireAdmin, (req, res) => {
    try {
      res.json(db.getVendorsPerformance ? db.getVendorsPerformance() : []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/vendor-payments', requireAdmin, (req, res) => {
    try {
      const vendorId = req.query.vendor_id ? parseInt(req.query.vendor_id, 10) : null;
      if (vendorId) {
        const list = db.getVendorPayments ? db.getVendorPayments(vendorId) : [];
        const total_paid = list.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const total_owed = db.getVendorCommissionOwed ? db.getVendorCommissionOwed(vendorId) : 0;
        res.json({ payments: list, total_owed, total_paid, balance: Math.max(0, total_owed - total_paid) });
      } else {
        res.json({ receivables: db.getVendorsReceivables ? db.getVendorsReceivables() : [] });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/vendor-payments', requireAdmin, (req, res) => {
    try {
      const { vendor_id, amount, note } = req.body || {};
      if (!vendor_id || amount == null) return res.status(400).json({ error: 'vendor_id and amount required' });
      const amt = parseFloat(amount);
      if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
      db.addVendorPayment(parseInt(vendor_id, 10), amt, (note || '').trim());
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Admin reports ===== */
  app.get('/api/admin/reports/profit.pdf', requireAdmin, (req, res) => {
    try {
      const dateFrom = (req.query.date_from || '').trim() || null;
      const dateTo = (req.query.date_to || '').trim() || null;
      const orders = db.getOrdersFiltered ? db.getOrdersFiltered({ date_from: dateFrom, date_to: dateTo }) : db.getOrders();
      const completedOrders = orders.filter((o) => o.status === 'completed');
      const totalCommission = completedOrders.reduce((s, o) => s + (Number(o.commission_amount) || 0), 0);
      const totalSales = orders.reduce((s, o) => s + orderValueToAmount(o.value), 0);
      const byVendor = {};
      const byDay = {};
      const fromDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const toDate = dateTo ? new Date(dateTo) : new Date();
      const days = Math.max(1, Math.ceil((toDate - fromDate) / (24 * 60 * 60 * 1000)));
      for (let d = 0; d < days; d++) {
        const dte = new Date(fromDate.getTime() + d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        byDay[dte] = { date: dte, sales: 0, commission: 0 };
      }
      orders.forEach((o) => {
        const vid = o.vendor_id != null ? o.vendor_id : 0;
        const vname = o.vendor_name || (vid === 0 ? '—' : '#' + vid);
        if (!byVendor[vid]) byVendor[vid] = { vendor_name: vname, total: 0 };
        if (o.status === 'completed') byVendor[vid].total += Number(o.commission_amount) || 0;
        const day = (o.date || '').slice(0, 10);
        if (byDay[day]) {
          byDay[day].sales += orderValueToAmount(o.value);
          if (o.status === 'completed') byDay[day].commission += Number(o.commission_amount) || 0;
        }
      });
      const vendorRows = Object.values(byVendor).sort((a, b) => b.total - a.total);
      const dayRows = Object.keys(byDay).sort().map((d) => byDay[d]);
      const PDFDoc = getPDFDocument ? getPDFDocument() : require('pdfkit');
      const doc = new PDFDoc({ margin: 50, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="key2lix-profit-' + (dateFrom || 'all') + '-' + (dateTo || 'all') + '.pdf"');
      doc.pipe(res);
      doc.fontSize(20).fillColor('#7c3aed').text('Key2lix', { align: 'center' });
      doc.fontSize(12).fillColor('#000').text('Profit Report', { align: 'center' });
      doc.fontSize(10).text('Total Sales: ' + totalSales.toLocaleString('en', { maximumFractionDigits: 0 }) + ' DZD');
      doc.text('Total Profit (commission): ' + totalCommission.toLocaleString('en', { maximumFractionDigits: 0 }) + ' DZD');
      doc.text('Completed Orders: ' + completedOrders.length + ' / Total: ' + orders.length);
      doc.fontSize(12).text('By Vendor', 50);
      vendorRows.slice(0, 12).forEach((r) => {
        doc.fontSize(9).text(r.vendor_name || '—', 50);
        doc.text(r.total.toFixed(0), 350);
      });
      doc.end();
    } catch (err) {
      logger.error({ err: err.message }, 'Profit PDF failed');
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/reports', requireAdmin, (req, res) => {
    try {
      const dateFrom = (req.query.date_from || '').trim() || null;
      const dateTo = (req.query.date_to || '').trim() || null;
      const vendorId = req.query.vendor_id != null && req.query.vendor_id !== '' ? parseInt(req.query.vendor_id, 10) : null;
      const orders = db.getOrdersForReport ? db.getOrdersForReport(dateFrom, dateTo, isNaN(vendorId) ? null : vendorId) : db.getOrders();
      const completedOrders = orders.filter((o) => o.status === 'completed');
      const totalCommission = completedOrders.reduce((s, o) => s + (Number(o.commission_amount) || 0), 0);
      const totalSales = orders.reduce((s, o) => s + orderValueToAmount(o.value), 0);
      const byVendor = {};
      const byDay = {};
      const fromDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const toDate = dateTo ? new Date(dateTo) : new Date();
      const days = Math.max(1, Math.ceil((toDate - fromDate) / (24 * 60 * 60 * 1000)));
      for (let d = 0; d < days; d++) {
        const dte = new Date(fromDate.getTime() + d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        byDay[dte] = { date: dte, count: 0, totalSales: 0, totalCommission: 0 };
      }
      orders.forEach((o) => {
        const vid = o.vendor_id != null ? o.vendor_id : 0;
        const vname = o.vendor_name || (vid === 0 ? '—' : '#' + vid);
        if (!byVendor[vid]) byVendor[vid] = { vendor_id: vid, vendor_name: vname, totalCommission: 0, orderCount: 0 };
        if (o.status === 'completed') byVendor[vid].totalCommission += Number(o.commission_amount) || 0;
        byVendor[vid].orderCount += 1;
        const day = (o.date || '').slice(0, 10);
        if (byDay[day]) {
          byDay[day].count += 1;
          byDay[day].totalSales += orderValueToAmount(o.value);
          if (o.status === 'completed') byDay[day].totalCommission += Number(o.commission_amount) || 0;
        }
      });
      const ordersByDay = Object.keys(byDay).sort().map((d) => byDay[d]);
      res.json({
        summary: { totalCommission, totalSales, orderCount: orders.length, completedOrderCount: completedOrders.length, byVendor: Object.values(byVendor).sort((a, b) => b.totalCommission - a.totalCommission) },
        ordersByDay,
        orders
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Admin settings ===== */
  app.get('/api/admin/settings/support', requireAdmin, (req, res) => {
    try {
      res.json({ anydesk_id: String(db.getSetting('ANYDESK_ID') || '').trim() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/settings/support', requireAdmin, express.json(), (req, res) => {
    try {
      const id = (req.body && req.body.anydesk_id != null) ? String(req.body.anydesk_id).trim() : '';
      db.setSetting('ANYDESK_ID', id);
      res.json({ success: true, anydesk_id: id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/settings/maintenance', requireAdmin, (req, res) => {
    try {
      const mode = db.getSetting('MAINTENANCE_MODE') || process.env.MAINTENANCE_MODE || '';
      res.json({ enabled: mode === '1' || mode === 'true' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/admin/settings/maintenance', requireAdmin, express.json(), (req, res) => {
    try {
      const enabled = !!(req.body && req.body.enabled);
      db.setSetting('MAINTENANCE_MODE', enabled ? '1' : '0');
      res.json({ success: true, enabled });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Admin backup ===== */
  app.get('/api/admin/backup/list', requireAdmin, (req, res) => {
    try {
      const backupDir = path.join(rootDir, 'client', 'data', 'backup');
      if (!fs.existsSync(backupDir)) return res.json({ backups: [] });
      const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db'));
      const backups = files.map((f) => {
        const full = path.join(backupDir, f);
        const stat = fs.statSync(full);
        return { name: f, size: stat.size, date: stat.mtime.toISOString() };
      });
      backups.sort((a, b) => new Date(b.date) - new Date(a.date));
      res.json({ backups });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/backup/run', requireAdmin, async (req, res) => {
    try {
      const backupDir = path.join(rootDir, 'client', 'data', 'backup');
      const dbPath = db.getDbPath ? db.getDbPath() : path.join(rootDir, 'client', 'data', 'key2lix.db');
      if (!fs.existsSync(dbPath)) return res.status(404).json({ error: 'قاعدة البيانات غير موجودة' });
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const ts = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + '_' + pad(now.getHours()) + '-' + pad(now.getMinutes()) + '-' + pad(now.getSeconds());
      const dest = path.join(backupDir, 'key2lix-' + ts + '.db');
      fs.copyFileSync(dbPath, dest);
      auditLog('admin', req.session.adminSubUserId || null, 'backup_run', { file: path.basename(dest) }, req);
      res.json({ success: true, file: path.basename(dest) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/backup/download/:filename', requireAdmin, (req, res) => {
    try {
      const backupDir = path.join(rootDir, 'client', 'data', 'backup');
      const name = (req.params.filename || '').replace(/\.\./g, '').replace(/[^a-zA-Z0-9\-_.]/g, '');
      if (!name.endsWith('.db')) return res.status(400).json({ error: 'ملف غير صالح' });
      const full = path.join(backupDir, name);
      if (!fs.existsSync(full)) return res.status(404).json({ error: 'النسخة غير موجودة' });
      res.download(full, name);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/backup/restore', requireAdmin, express.json(), (req, res) => {
    try {
      const backupDir = path.join(rootDir, 'client', 'data', 'backup');
      if (!db.getDbPath || !db.closeDb || !db.initDb) return res.status(501).json({ error: 'استعادة النسخة الاحتياطية متاحة فقط مع SQLite.' });
      const filename = (req.body && req.body.filename) ? String(req.body.filename).trim() : '';
      if (!filename || !filename.endsWith('.db') || filename.includes('..') || /[^a-zA-Z0-9\-_.]/.test(filename)) return res.status(400).json({ error: 'اسم الملف غير صالح.' });
      const backupPath = path.join(backupDir, filename);
      if (!fs.existsSync(backupPath)) return res.status(404).json({ error: 'النسخة الاحتياطية غير موجودة.' });
      const dbPath = db.getDbPath();
      if (db.closeDb) db.closeDb();
      fs.copyFileSync(backupPath, dbPath);
      if (db.initDb) db.initDb();
      auditLog('admin', req.session.adminSubUserId || null, 'backup_restore', { filename }, req);
      res.json({ success: true, message: 'تم استعادة قاعدة البيانات بنجاح.' });
    } catch (err) {
      if (db && db.initDb) try { db.initDb(); } catch (e) { }
      res.status(500).json({ error: err.message || 'فشل استعادة النسخة الاحتياطية.' });
    }
  });

  /* ===== Admin audit-log ===== */
  app.get('/api/admin/audit-log', requireAdmin, (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const offset = parseInt(req.query.offset, 10) || 0;
      const options = { action: (req.query.action || '').trim() || undefined, actor_type: (req.query.actor_type || '').trim() || undefined, date_from: (req.query.date_from || '').trim() || undefined, date_to: (req.query.date_to || '').trim() || undefined };
      Object.keys(options).forEach((k) => { if (!options[k]) delete options[k]; });
      const rows = db.getAuditLog ? db.getAuditLog(limit, offset, options) : [];
      res.json({ entries: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/audit-log/export.csv', requireAdmin, (req, res) => {
    try {
      const options = { action: (req.query.action || '').trim() || undefined, actor_type: (req.query.actor_type || '').trim() || undefined, date_from: (req.query.date_from || '').trim() || undefined, date_to: (req.query.date_to || '').trim() || undefined };
      Object.keys(options).forEach((k) => { if (!options[k]) delete options[k]; });
      const rows = db.getAuditLog ? db.getAuditLog(5000, 0, options) : [];
      const headers = ['id', 'at', 'actor_type', 'actor_id', 'action', 'details', 'ip'];
      let csv = headers.join(',') + '\n' + rows.map((r) => headers.map((h) => '"' + String(r[h] || '').replace(/"/g, '""') + '"').join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="key2lix-audit-log-' + new Date().toISOString().slice(0, 10) + '.csv"');
      res.send('\ufeff' + csv);
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  });

  /* ===== Admin rate-limit settings ===== */
  app.get('/api/admin/settings/rate-limit', requireAdmin, (req, res) => {
    try {
      const apiMax = parseInt(db.getSetting('RATE_LIMIT_API_MAX') || process.env.RATE_LIMIT_API_MAX || '500', 10) || 500;
      const adminMax = parseInt(db.getSetting('RATE_LIMIT_ADMIN_MAX') || process.env.RATE_LIMIT_ADMIN_MAX || '2000', 10) || 2000;
      res.json({ api_max: apiMax, admin_max: adminMax });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/settings/rate-limit', requireAdmin, express.json(), (req, res) => {
    try {
      const { api_max, admin_max } = req.body || {};
      if (api_max != null) db.setSetting('RATE_LIMIT_API_MAX', Math.max(10, Math.min(10000, parseInt(api_max, 10) || 500)));
      if (admin_max != null) db.setSetting('RATE_LIMIT_ADMIN_MAX', Math.max(50, Math.min(20000, parseInt(admin_max, 10) || 2000)));
      const apiMax = parseInt(db.getSetting('RATE_LIMIT_API_MAX') || '500', 10) || 500;
      const adminMax = parseInt(db.getSetting('RATE_LIMIT_ADMIN_MAX') || '2000', 10) || 2000;
      res.json({ success: true, api_max: apiMax, admin_max: adminMax });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Admin sub-users (main admin only) ===== */
  app.get('/api/admin/sub-users', requireAdmin, requireMainAdmin, (req, res) => {
    try {
      res.json({ users: db.getAdminSubUsers ? db.getAdminSubUsers() : [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/sub-users', requireAdmin, requireMainAdmin, express.json(), (req, res) => {
    try {
      const { email, password, role } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'email and password required' });
      const r = (role || '').trim().toLowerCase();
      const validRole = r === 'content_supervisor' ? 'content_supervisor' : 'order_supervisor';
      if (db.getAdminSubUserByEmail && db.getAdminSubUserByEmail(String(email).trim())) return res.status(400).json({ error: 'Email already used' });
      const hash = (getBcrypt ? getBcrypt() : require('bcrypt')).hashSync(password, 10);
      db.createAdminSubUser(email, hash, validRole);
      auditLog('admin', null, 'sub_admin_create', { email: String(email).trim(), role: validRole }, req);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/admin/sub-users/:id', requireAdmin, requireMainAdmin, (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const ok = db.deleteAdminSubUser ? db.deleteAdminSubUser(id) : false;
      if (!ok) return res.status(404).json({ error: 'Not found' });
      auditLog('admin', null, 'sub_admin_delete', { id }, req);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/logout-all', requireAdmin, requireMainAdmin, express.json(), (req, res) => {
    try {
      db.setSetting('admin_sessions_invalid_before', String(Date.now()));
      auditLog('admin', null, 'logout_all', {}, req);
      res.json({ success: true, message: 'All admin sessions have been invalidated.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Admin 2FA ===== */
  app.get('/api/admin/2fa/status', requireAdmin, (req, res) => {
    try {
      res.json({ enabled: typeof isAdminTotpEnabled === 'function' ? isAdminTotpEnabled() : !!isAdminTotpEnabled });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/2fa/setup', requireAdmin, (req, res) => {
    try {
      if (req.session.adminRole !== 'admin') return res.status(403).json({ error: 'Only main admin can setup 2FA' });
      const secret = (getSpeakeasy ? getSpeakeasy() : require('speakeasy')).generateSecret({ length: 20, name: 'Key2lix (Admin)' });
      req.session.totpSetupSecret = secret.base32;
      res.json({ secret: secret.base32, qrUrl: secret.otpauth_url });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/2fa/verify-setup', requireAdmin, express.json(), (req, res) => {
    try {
      if (req.session.adminRole !== 'admin') return res.status(403).json({ error: 'Only main admin can setup 2FA' });
      const { code } = req.body || {};
      const secret = req.session.totpSetupSecret;
      if (!secret) return res.status(400).json({ error: '2FA setup not started.' });
      const valid = (getSpeakeasy ? getSpeakeasy() : require('speakeasy')).totp.verify({ secret, encoding: 'base32', token: String(code).trim(), window: 1 });
      if (!valid) return res.status(401).json({ error: 'Invalid code' });
      db.setSetting('admin_totp_secret', secret);
      db.setSetting('admin_totp_enabled', '1');
      req.session.totpSetupSecret = null;
      auditLog('admin', null, '2fa_enabled', {}, req);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/2fa/disable', requireAdmin, express.json(), (req, res) => {
    try {
      if (req.session.adminRole !== 'admin') return res.status(403).json({ error: 'Only main admin can disable 2FA' });
      const { password } = req.body || {};
      if (!password || password !== ADMIN_PASS) return res.status(401).json({ error: 'Invalid password' });
      db.setSetting('admin_totp_secret', '');
      db.setSetting('admin_totp_enabled', '0');
      auditLog('admin', null, '2fa_disabled', {}, req);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/session-inactivity', requireAdmin, (req, res) => {
    try {
      const minutes = parseInt(process.env.SESSION_INACTIVITY_MINUTES || '0', 10) || (isProduction ? 60 : 0);
      res.json({ enabled: minutes > 0, minutes });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/login-log', requireAdmin, (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const entries = db.getAdminLoginLog ? db.getAdminLoginLog(limit) : [];
      res.json({ entries });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Admin commission ===== */
  app.get('/api/admin/settings/commission', requireAdmin, (req, res) => {
    try {
      const cfg = commissionService.getConfig ? commissionService.getConfig() : {};
      res.json({ threshold: cfg.threshold, rate_below: cfg.rateBelow, rate_above: cfg.rateAbove });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/settings/commission', requireAdmin, express.json(), (req, res) => {
    try {
      const { threshold, rate_below, rate_above } = req.body || {};
      if (threshold != null && !isNaN(parseInt(threshold, 10))) db.setSetting('COMMISSION_THRESHOLD', parseInt(threshold, 10));
      if (rate_below != null && !isNaN(parseFloat(rate_below))) db.setSetting('COMMISSION_RATE_BELOW', parseFloat(rate_below));
      if (rate_above != null && !isNaN(parseFloat(rate_above))) db.setSetting('COMMISSION_RATE_ABOVE', parseFloat(rate_above));
      if (commissionService.refreshConfig) commissionService.refreshConfig();
      const cfg = commissionService.getConfig ? commissionService.getConfig() : {};
      auditLog('admin', null, 'commission_change', {}, req);
      res.json({ success: true, threshold: cfg.threshold, rate_below: cfg.rateBelow, rate_above: cfg.rateAbove });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Admin currency ===== */
  app.get('/api/admin/settings/currency', requireAdmin, (req, res) => {
    try {
      const rateUsd = getCurrencyRateUsd(db);
      const rateEur = getCurrencyRateEur(db);
      res.json({ dzd_per_10_usd: Math.round(rateUsd * 10), dzd_per_10_eur: Math.round(rateEur * 10) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/settings/currency', requireAdmin, express.json(), (req, res) => {
    try {
      const { dzd_per_10_usd, dzd_per_10_eur } = req.body || {};
      if (dzd_per_10_usd != null && !isNaN(parseFloat(dzd_per_10_usd)) && parseFloat(dzd_per_10_usd) > 0) db.setSetting('currency_rate_usd', String(parseFloat(dzd_per_10_usd) / 10));
      if (dzd_per_10_eur != null && !isNaN(parseFloat(dzd_per_10_eur)) && parseFloat(dzd_per_10_eur) > 0) db.setSetting('currency_rate_eur', String(parseFloat(dzd_per_10_eur) / 10));
      const rateUsd = getCurrencyRateUsd(db);
      const rateEur = getCurrencyRateEur(db);
      auditLog('admin', null, 'currency_rates_change', { rate_usd: rateUsd, rate_eur: rateEur }, req);
      res.json({ success: true, dzd_per_10_usd: Math.round(rateUsd * 10), dzd_per_10_eur: Math.round(rateEur * 10) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Admin theme ===== */
  app.get('/api/admin/settings/theme', requireAdmin, (req, res) => {
    try {
      const primary = (db.getSetting(THEME_KEYS.primary) || '').trim() || DEFAULT_PRIMARY;
      const secondary = (db.getSetting(THEME_KEYS.secondary) || '').trim() || DEFAULT_SECONDARY;
      const heroType = (db.getSetting(THEME_KEYS.heroType) || 'image').toLowerCase();
      const hero = {
        imageUrl: (db.getSetting(THEME_KEYS.heroImageUrl) || '').trim(),
        gradient: (db.getSetting(THEME_KEYS.heroGradient) || '').trim(),
        color: (db.getSetting(THEME_KEYS.heroColor) || '').trim(),
        title: (db.getSetting(THEME_KEYS.heroTitle) || '').trim(),
        tagline: (db.getSetting(THEME_KEYS.heroTagline) || '').trim(),
        ctaText: (db.getSetting(THEME_KEYS.heroCtaText) || '').trim(),
        ctaUrl: (db.getSetting(THEME_KEYS.heroCtaUrl) || '').trim(),
        videoUrl: (db.getSetting(THEME_KEYS.heroVideoUrl) || '').trim()
      };
      const categoryIcons = {
        products: (db.getSetting(THEME_KEYS.categoryProducts) || '').trim(),
        subscriptions: (db.getSetting(THEME_KEYS.categorySubscriptions) || '').trim(),
        hardware: (db.getSetting(THEME_KEYS.categoryHardware) || '').trim(),
        software: (db.getSetting(THEME_KEYS.categorySoftware) || '').trim()
      };
      res.json({ primary, secondary, hero: { type: heroType, ...hero }, categoryIcons, homeSections: { order: getHomeSectionsOrder(), enabled: getHomeSectionsEnabled() } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/settings/theme', requireAdmin, express.json(), (req, res) => {
    try {
      const body = req.body || {};
      if (body.primary != null) db.setSetting(THEME_KEYS.primary, String(body.primary).trim() || DEFAULT_PRIMARY);
      if (body.secondary != null) db.setSetting(THEME_KEYS.secondary, String(body.secondary).trim() || DEFAULT_SECONDARY);
      const hero = body.hero;
      if (hero && typeof hero === 'object') {
        db.setSetting(THEME_KEYS.heroType, hero.type === 'gradient' || hero.type === 'solid' ? hero.type : 'image');
        if (hero.imageUrl != null) db.setSetting(THEME_KEYS.heroImageUrl, String(hero.imageUrl || '').trim());
        if (hero.gradient != null) db.setSetting(THEME_KEYS.heroGradient, String(hero.gradient || '').trim());
        if (hero.color != null) db.setSetting(THEME_KEYS.heroColor, String(hero.color || '').trim());
        if (hero.title != null) db.setSetting(THEME_KEYS.heroTitle, String(hero.title || '').trim());
        if (hero.tagline != null) db.setSetting(THEME_KEYS.heroTagline, String(hero.tagline || '').trim());
        if (hero.ctaText != null) db.setSetting(THEME_KEYS.heroCtaText, String(hero.ctaText || '').trim());
        if (hero.ctaUrl != null) db.setSetting(THEME_KEYS.heroCtaUrl, String(hero.ctaUrl || '').trim());
        if (hero.videoUrl != null) db.setSetting(THEME_KEYS.heroVideoUrl, String(hero.videoUrl || '').trim());
      }
      const homeSections = body.homeSections;
      if (homeSections && typeof homeSections === 'object') {
        if (Array.isArray(homeSections.order)) db.setSetting(HOME_SECTIONS_KEY_ORDER, JSON.stringify(homeSections.order));
        if (homeSections.enabled && typeof homeSections.enabled === 'object') db.setSetting(HOME_SECTIONS_KEY_ENABLED, JSON.stringify(homeSections.enabled));
      }
      const cat = body.categoryIcons;
      if (cat && typeof cat === 'object') {
        if (cat.products != null) db.setSetting(THEME_KEYS.categoryProducts, String(cat.products || '').trim());
        if (cat.subscriptions != null) db.setSetting(THEME_KEYS.categorySubscriptions, String(cat.subscriptions || '').trim());
        if (cat.hardware != null) db.setSetting(THEME_KEYS.categoryHardware, String(cat.hardware || '').trim());
        if (cat.software != null) db.setSetting(THEME_KEYS.categorySoftware, String(cat.software || '').trim());
      }
      auditLog('admin', null, 'theme_change', {}, req);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/settings/upload', requireAdmin, getUpload && getUpload().single('file'), (req, res) => {
    try {
      if (!req.file || !req.file.path) return res.status(400).json({ error: 'No file uploaded' });
      const ext = path.extname(req.file.originalname).toLowerCase() || '.webp';
      const safeName = 'theme-' + (req.body && req.body.prefix ? String(req.body.prefix).replace(/[^a-z0-9-_]/gi, '') + '-' : '') + Date.now() + ext;
      const destPath = path.join(imgDir, safeName);
      if (req.file.path !== destPath) fs.renameSync(req.file.path, destPath);
      res.json({ success: true, url: '/assets/img/' + encodeURIComponent(safeName) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Admin email settings ===== */
  app.get('/api/admin/settings/email', requireAdmin, (req, res) => {
    try {
      res.json(emailService.getConfigForAdmin ? emailService.getConfigForAdmin() : { provider: 'none' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/settings/email', requireAdmin, express.json(), (req, res) => {
    try {
      const b = req.body || {};
      const map = { smtp_host: 'SMTP_HOST', smtp_port: 'SMTP_PORT', smtp_secure: 'SMTP_SECURE', smtp_user: 'SMTP_USER', smtp_pass: 'SMTP_PASS', notify_from: 'NOTIFY_FROM', emailjs_service_id: 'EMAILJS_SERVICE_ID', emailjs_template_id: 'EMAILJS_TEMPLATE_ID', emailjs_public_key: 'EMAILJS_PUBLIC_KEY', emailjs_private_key: 'EMAILJS_PRIVATE_KEY' };
      Object.keys(map).forEach((fk) => {
        const v = b[fk];
        if (v !== undefined && v !== null) db.setSetting(map[fk], (fk === 'smtp_pass' || fk === 'emailjs_private_key') ? String(v) : String(v).trim());
      });
      if (b.smtp_port != null) db.setSetting('SMTP_PORT', String(parseInt(b.smtp_port, 10) || 587));
      if (b.smtp_secure != null) db.setSetting('SMTP_SECURE', b.smtp_secure ? '1' : '0');
      if (emailService.initFromDb) emailService.initFromDb(db);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/settings/email/test', requireAdmin, express.json(), (req, res) => {
    try {
      const to = (req.body && req.body.to) ? String(req.body.to).trim() : '';
      if (!to || !to.includes('@')) return res.status(400).json({ error: 'أدخل بريداً إلكترونياً صحيحاً' });
      if (!emailService.isConfigured || !emailService.isConfigured()) return res.status(400).json({ error: 'لم تُضبط إعدادات البريد بعد.' });
      const sendTest = emailService.sendMailWithDiagnostic ? emailService.sendMailWithDiagnostic(to, '[Key2lix] Test', 'Test email') : emailService.sendMail(to, '[Key2lix] Test', 'Test email').then((ok) => ok ? { success: true } : { success: false });
      sendTest.then((r) => res.json(r && r.success ? { success: true, message: 'تم إرسال الرسالة.' } : { success: false, error: (r && r.error) || 'فشل الإرسال' })).catch((e) => res.status(500).json({ error: e.message }));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/settings/email-templates', requireAdmin, (req, res) => {
    try {
      const out = {};
      EMAIL_TEMPLATE_KEYS.forEach((key) => {
        const k = 'EMAIL_TEMPLATE_' + key.toUpperCase();
        out[key] = { subject: db.getSetting(k + '_SUBJECT') || '', body: db.getSetting(k + '_BODY') || '' };
      });
      res.json({ templates: out });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/admin/settings/email-templates', requireAdmin, express.json(), (req, res) => {
    try {
      const b = req.body && req.body.templates ? req.body.templates : req.body;
      if (!b || typeof b !== 'object') return res.status(400).json({ error: 'بيانات غير صالحة' });
      Object.keys(b).forEach((key) => {
        if (!EMAIL_TEMPLATE_KEYS.includes(key)) return;
        const t = b[key];
        const k = 'EMAIL_TEMPLATE_' + key.toUpperCase();
        if (t && typeof t === 'object') {
          if (t.subject != null) db.setSetting(k + '_SUBJECT', String(t.subject || ''));
          if (t.body != null) db.setSetting(k + '_BODY', String(t.body || ''));
        }
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/settings/scheduled-reports', requireAdmin, (req, res) => {
    try {
      res.json({ report_schedule: (db.getSetting('report_schedule') || '').trim() || 'weekly', report_email: (db.getSetting('report_email') || '').trim(), report_next_run: (db.getSetting('report_next_run') || '').trim() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/settings/scheduled-reports', requireAdmin, express.json(), (req, res) => {
    try {
      const { report_schedule, report_email } = req.body || {};
      if (report_schedule !== undefined) db.setSetting('report_schedule', report_schedule === 'monthly' ? 'monthly' : 'weekly');
      if (report_email !== undefined) db.setSetting('report_email', String(report_email || '').trim());
      res.json({ success: true, report_schedule: db.getSetting('report_schedule'), report_email: db.getSetting('report_email') });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Add/Update/Delete product (admin) ===== */
  app.post('/api/add-product', requireAdmin, getUpload && getUpload().single('image'), async (req, res) => {
    try {
      const { category, subcat, key, name, desc, prices } = req.body;
      let imagePath = 'assets/img/default.png';
      let images = [imagePath];
      if (req.file && processImageToWebP && maybeUploadImagesToS3) {
        let rel = await processImageToWebP(req.file.path);
        rel = await maybeUploadImagesToS3(rel);
        if (rel && typeof rel === 'object') { imagePath = rel.main; images = [rel.main]; }
        else { imagePath = rel || 'assets/img/' + req.file.filename; images = [imagePath]; }
      }
      const productData = { name, desc: desc || '', images, prices: prices ? JSON.parse(prices) : [] };
      db.addProduct(null, category, subcat || (category === 'hardware' ? 'storage' : ''), key, productData);
      if (invalidateProductsCache) invalidateProductsCache();
      res.json({ success: true, message: 'Product added' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/update-product', requireAdmin, getUpload && getUpload().single('image'), async (req, res) => {
    try {
      const { category, subcat, key, name, desc, prices } = req.body;
      const sub = (subcat === 'all' || !subcat) ? '' : subcat;
      const prod = db.getProductByKey(category, sub, key);
      if (!prod) return res.status(404).json({ error: 'Product not found' });
      const productData = { name: name || prod.name, desc: desc != null ? desc : prod.desc, images: JSON.parse(prod.images_json || '[]'), prices: prices ? JSON.parse(prices) : JSON.parse(prod.prices_json || '[]') };
      if (req.file && processImageToWebP && maybeUploadImagesToS3) {
        let rel = await processImageToWebP(req.file.path);
        rel = await maybeUploadImagesToS3(rel);
        productData.images.unshift(rel && typeof rel === 'object' ? rel.main : (rel || 'assets/img/' + req.file.filename));
      }
      db.updateProduct(category, sub, key, productData, null);
      if (invalidateProductsCache) invalidateProductsCache();
      res.json({ success: true, message: 'Product updated' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/delete-product', requireAdmin, (req, res) => {
    try {
      const body = req.body || {};
      const category = body.category != null ? String(body.category).trim() : '';
      const subcat = body.subcat != null ? String(body.subcat).trim() : '';
      const key = (body.key != null ? body.key : body.slug) != null ? String(body.key || body.slug).trim() : '';
      if (!category || !key) return res.status(400).json({ error: 'category and key (or slug) required' });
      const sub = (subcat === 'all' || subcat === '') ? '' : subcat;
      const ok = db.deleteProduct(category, sub, key, null);
      if (ok && invalidateProductsCache) invalidateProductsCache();
      if (!ok) return res.status(404).json({ error: 'Product not found' });
      res.json({ success: true, message: 'Product deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Admin: delete vendor / client / order ===== */
  app.post('/api/admin/vendors/:id/delete', requireAdmin, (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid vendor id' });
      const ok = db.deleteVendor(id);
      if (!ok) return res.status(404).json({ error: 'Vendor not found' });
      if (auditLog) auditLog('admin', null, 'vendor_delete', { vendor_id: id }, req);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/clients/:id/delete', requireAdmin, (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid client id' });
      const ok = db.deleteClient(id);
      if (!ok) return res.status(404).json({ error: 'Client not found' });
      if (auditLog) auditLog('admin', null, 'client_delete', { client_id: id }, req);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/orders/:id/delete', requireAdmin, (req, res) => {
    try {
      const id = (req.params.id && String(req.params.id).trim()) || '';
      if (!id) return res.status(400).json({ error: 'Invalid order id' });
      const ok = db.deleteOrder(id);
      if (!ok) return res.status(404).json({ error: 'Order not found' });
      if (auditLog) auditLog('admin', null, 'order_delete', { order_id: id }, req);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Admin: complaints list + update ===== */
  app.get('/api/admin/complaints', requireAdmin, (req, res) => {
    try {
      const status = (req.query && req.query.status) ? String(req.query.status).trim() : '';
      const type = (req.query && req.query.type) ? String(req.query.type).trim() : '';
      const list = db.getComplaints({ status: status || undefined, type: type || undefined, limit: 200, offset: 0 });
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/admin/complaint/:id', requireAdmin, express.json(), (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: 'Invalid complaint ID' });
      const updates = {};
      if (req.body && req.body.status !== undefined) updates.status = String(req.body.status).trim();
      if (req.body && req.body.admin_notes !== undefined) updates.admin_notes = String(req.body.admin_notes).trim();
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No updates provided' });
      const validStatus = ['pending', 'in_progress', 'resolved'];
      if (updates.status && !validStatus.includes(updates.status)) return res.status(400).json({ error: 'Invalid status' });
      db.updateComplaint(id, updates);
      const c = db.getComplaintById(id);
      res.json(c || { id, ...updates });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerAdminApi };
