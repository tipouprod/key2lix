/**
 * تأمين صفحة الأدمن: رؤوس أمان، قائمة IP، ربط الجلسة، CSRF، انتهاء الصلاحية وتسجيل خروج من كل الأجهزة.
 * يُستخدم بعد express-session.
 */
const crypto = require('crypto');
const db = require('../database');

const ADMIN_SESSION_MAX_AGE_MS = parseInt(process.env.ADMIN_SESSION_MAX_AGE_HOURS || '8', 10) * 60 * 60 * 1000;
const CSRF_TOKEN_BYTES = 32;

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

function hashUA(ua) {
  if (!ua || typeof ua !== 'string') return '';
  return crypto.createHash('sha256').update(ua.slice(0, 512)).digest('hex');
}

/** رؤوس أمان إضافية لمسارات الأدمن فقط */
function adminSecurityHeaders(req, res, next) {
  const path = (req.path || req.url || '').split('?')[0];
  const isAdminPath = path === '/admin' || path === '/admin.html' || path === '/login' || path === '/pages/admin.html' || path === '/pages/login.html' || path.startsWith('/api/admin') || path === '/api/login';
  if (!isAdminPath) return next();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}

/** قائمة عناوين IP مسموحة (اختياري): ADMIN_IP_ALLOWLIST=1.2.3.4,10.0.0.0/8 */
function adminIpAllowlist(req, res, next) {
  const list = process.env.ADMIN_IP_ALLOWLIST || '';
  if (!list.trim()) return next();
  const path = (req.path || req.url || '').split('?')[0];
  const isAdminPath = path === '/admin' || path === '/admin.html' || path === '/login' || path === '/pages/admin.html' || path === '/pages/login.html' || path.startsWith('/api/admin') || path === '/api/login';
  if (!isAdminPath) return next();
  const ip = getClientIP(req);
  const allowed = list.split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.some((entry) => {
    if (entry === ip) return true;
    if (entry.includes('/')) {
      const [subnet, prefixStr] = entry.split('/');
      const prefix = parseInt(prefixStr, 10);
      if (isNaN(prefix)) return false;
      return isIPInSubnet(ip, subnet, prefix);
    }
    return false;
  });
  if (!ok) {
    if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(403).json({ error: 'Access denied from this network.' });
    return res.status(403).send('Access denied.');
  }
  next();
}

function isIPInSubnet(ip, subnet, prefixLen) {
  try {
    const ipBuf = ipToBuf(ip);
    const subBuf = ipToBuf(subnet);
    if (!ipBuf || !subBuf || ipBuf.length !== subBuf.length) return false;
    const byteLen = Math.ceil(prefixLen / 8);
    for (let i = 0; i < byteLen; i++) {
      const bits = i < byteLen - 1 ? 8 : (prefixLen % 8) || 8;
      const mask = bits === 8 ? 0xff : (0xff << (8 - bits)) & 0xff;
      if ((ipBuf[i] & mask) !== (subBuf[i] & mask)) return false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

function ipToBuf(ip) {
  if (!ip || typeof ip !== 'string') return null;
  if (ip.includes(':')) return null;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) return null;
  return Buffer.from(parts);
}

/** ربط الجلسة بعنوان IP و User-Agent؛ التحقق من admin_sessions_invalid_before وانتهاء الصلاحية */
function requireAdminSessionBinding(req, res, next) {
  if (!req.session || !req.session.admin) return next();
  const ip = getClientIP(req);
  const uaHash = hashUA(req.headers['user-agent']);

  const invalidBefore = db.getSetting && db.getSetting('admin_sessions_invalid_before');
  if (invalidBefore && req.session.adminLoggedInAt != null && String(req.session.adminLoggedInAt) < String(invalidBefore)) {
    req.session.destroy(() => {});
    if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(401).json({ error: 'Session invalidated. Please log in again.' });
    return res.redirect('/login');
  }

  if (ADMIN_SESSION_MAX_AGE_MS > 0 && req.session.adminLoggedInAt != null) {
    if (Date.now() - Number(req.session.adminLoggedInAt) > ADMIN_SESSION_MAX_AGE_MS) {
      req.session.destroy(() => {});
      if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(401).json({ error: 'Session expired. Please log in again.' });
      return res.redirect('/login');
    }
  }

  const bindIp = process.env.ADMIN_SESSION_BIND_IP !== '0';
  const bindUA = process.env.ADMIN_SESSION_BIND_UA !== '0';
  if (bindIp && req.session.adminIp && req.session.adminIp !== ip) {
    req.session.destroy(() => {});
    if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(401).json({ error: 'Session invalidated (IP changed). Please log in again.' });
    return res.redirect('/login');
  }
  if (bindUA && req.session.adminUserAgentHash && req.session.adminUserAgentHash !== uaHash) {
    req.session.destroy(() => {});
    if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(401).json({ error: 'Session invalidated (browser changed). Please log in again.' });
    return res.redirect('/login');
  }
  next();
}

/** توليد توكن CSRF وتخزينه في الجلسة */
function generateCsrfToken(req) {
  if (!req.session) return null;
  const token = crypto.randomBytes(CSRF_TOKEN_BYTES).toString('hex');
  req.session.adminCsrfSecret = token;
  return token;
}

/** التحقق من توكن CSRF للطلبات التي تغيّر الحالة (POST/PUT/PATCH/DELETE) */
function requireAdminCsrf(req, res, next) {
  if (!req.session || !req.session.admin) return next();
  const method = (req.method || '').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next();
  const path = (req.path || req.url || '').split('?')[0];
  if (path === '/api/login' || path === '/api/admin/2fa/verify-login' || path === '/api/admin/2fa/verify-setup') return next();
  const provided = (req.headers['x-csrf-token'] || (req.body && req.body._csrf) || '').trim();
  const expected = req.session.adminCsrfSecret;
  if (!expected || provided !== expected) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token. Please refresh the page and try again.' });
  }
  next();
}

/** إرجاع توكن CSRF للجلسة الحالية (يُستدعى بعد requireAdmin) */
function getCsrfToken(req) {
  if (!req.session) return null;
  if (req.session.adminCsrfSecret) return req.session.adminCsrfSecret;
  return generateCsrfToken(req);
}

/** تثبيت بيانات الجلسة عند نجاح دخول الأدمن (يُستدعى من server بعد تعيين req.session.admin) */
function setAdminSessionBinding(req) {
  if (!req.session) return;
  req.session.adminIp = getClientIP(req);
  req.session.adminUserAgentHash = hashUA(req.headers['user-agent']);
  req.session.adminLoggedInAt = Date.now();
  req.session.adminCsrfSecret = crypto.randomBytes(CSRF_TOKEN_BYTES).toString('hex');
}

module.exports = {
  getClientIP: getClientIP,
  adminSecurityHeaders,
  adminIpAllowlist,
  requireAdminSessionBinding,
  requireAdminCsrf,
  generateCsrfToken,
  getCsrfToken,
  setAdminSessionBinding,
  ADMIN_SESSION_MAX_AGE_MS
};
