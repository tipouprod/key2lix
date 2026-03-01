/**
 * مصادقة الأدمن/البائع والتحقق من الصلاحيات.
 * يستخدم من routes و server.
 */
const crypto = require('crypto');
const db = require('../database');

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.redirect('/login');
}

/** For sub-admin roles: 'orders' allows order_supervisor+admin; 'products' allows content_supervisor+admin. */
function requireAdminRole(allowedRole) {
  return (req, res, next) => {
    if (!req.session || !req.session.admin) {
      if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(401).json({ error: 'Unauthorized' });
      return res.redirect('/login');
    }
    const role = req.session.adminRole || 'admin';
    if (role === 'admin') return next();
    if (allowedRole === 'orders' && role === 'order_supervisor') return next();
    if (allowedRole === 'products' && role === 'content_supervisor') return next();
    if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(403).json({ error: 'Forbidden: insufficient role' });
    return res.status(403).send('Forbidden');
  };
}

function requireVendor(req, res, next) {
  if (req.session && req.session.vendorId) {
    const v = db.getVendorById(req.session.vendorId);
    if (!v || v.status !== 'approved') {
      if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(401).json({ error: 'Unauthorized' });
      return res.redirect('/vendor-login');
    }
    if (v.logout_all_before && req.session.loggedInAt && String(req.session.loggedInAt) < String(v.logout_all_before)) {
      req.session.destroy(() => {});
      if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(401).json({ error: 'Session invalidated. Please log in again.' });
      return res.redirect('/vendor-login');
    }
    req.vendorId = req.session.vendorId;
    return next();
  }
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.redirect('/vendor-login');
}

/** يقبل جلسة بائع أو مفتاح API (X-API-Key أو Authorization: Bearer). يُستخدم لمسارات المورد التي تدعم الوصول البرمجي. */
function requireVendorOrApiKey(req, res, next) {
  if (req.session && req.session.vendorId) {
    const v = db.getVendorById(req.session.vendorId);
    if (v && v.status === 'approved') {
      if (v.logout_all_before && req.session.loggedInAt && String(req.session.loggedInAt) < String(v.logout_all_before)) {
        req.session.destroy(() => {});
        return res.status(401).json({ error: 'Session invalidated. Please log in again.' });
      }
      return next();
    }
  }
  const rawKey = req.headers['x-api-key'] || (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : '');
  if (!rawKey) {
    if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(401).json({ error: 'Unauthorized' });
    return res.redirect('/vendor-login');
  }
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const vendorId = db.getVendorIdByApiKeyHash && db.getVendorIdByApiKeyHash(keyHash);
  if (!vendorId) return res.status(401).json({ error: 'Invalid API key' });
  const v = db.getVendorById(vendorId);
  if (!v || v.status !== 'approved') return res.status(401).json({ error: 'Vendor not approved' });
  req.vendorId = vendorId;
  req.vendorIdFromApiKey = true;
  return next();
}

/** يقبل جلسة أدمن أو مفتاح تكامل (INTEGRATION_API_KEY). للاستخدام من أنظمة ERP/محاسبة. */
function requireAdminOrIntegrationKey(req, res, next) {
  if (req.session && req.session.admin) return next();
  const rawKey = req.headers['x-api-key'] || (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : '');
  const expected = process.env.INTEGRATION_API_KEY || '';
  if (!expected || !rawKey || rawKey !== expected) {
    if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(401).json({ error: 'Unauthorized' });
    return res.status(401).json({ error: 'Invalid integration API key' });
  }
  return next();
}

module.exports = { requireAdmin, requireAdminRole, requireVendor, requireVendorOrApiKey, requireAdminOrIntegrationKey };
