process.env.DOTENV_CONFIG_QUIET = '1';
require('dotenv').config({ quiet: true });

const Sentry = process.env.SENTRY_DSN ? (() => {
  require('@sentry/node').init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1
  });
  const sentry = require('@sentry/node');
  const recentErrors = [];
  const origCapture = sentry.captureException.bind(sentry);
  sentry.captureException = function (err) {
    try {
      recentErrors.push({ message: (err && err.message) || String(err), at: new Date().toISOString() });
      if (recentErrors.length > 10) recentErrors.shift();
    } catch (_) { }
    return origCapture(err);
  };
  sentry.recentErrors = recentErrors;
  return sentry;
})() : { captureException: () => { }, recentErrors: [] };

const express = require('express');
const fs = require('fs');
const path = require('path');
let _multer;
function getMulter() { if (!_multer) _multer = require('multer'); return _multer; }
const session = require('express-session');
let _sharp;
function getSharp() { if (_sharp === undefined) { try { _sharp = require('sharp'); } catch (_) { _sharp = null; } } return _sharp; }
const helmet = require('helmet');
const compression = require('compression');
const { brotliMiddleware, brotliCompressMiddleware } = require('./lib/compression-brotli');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
let _bcrypt;
function getBcrypt() { if (!_bcrypt) _bcrypt = require('bcrypt'); return _bcrypt; }
const { body, validationResult } = require('express-validator');
const { requireAdmin, requireAdminRole, requireVendor, requireVendorOrApiKey, requireAdminOrIntegrationKey } = require('./middleware/auth');
const adminSecurity = require('./middleware/admin-security');
const commissionService = require('./services/commissionService');
const { orderValidators } = require('./validators/order');
const { contactValidators } = require('./validators/contact');
const registerPages = require('./routes/pages');
const pino = require('pino');
/* تحميل عند أول استخدام لتقليل الذاكرة عند التشغيل (Out of memory على Railway) */
let _pdfKit;
function getPDFDocument() { if (!_pdfKit) _pdfKit = require('pdfkit'); return _pdfKit; }
let _exceljs;
function getExcelJS() { if (!_exceljs) _exceljs = require('exceljs'); return _exceljs; }
let _speakeasy;
function getSpeakeasy() { if (!_speakeasy) _speakeasy = require('speakeasy'); return _speakeasy; }
let _QRCode;
function getQRCode() { if (!_QRCode) _QRCode = require('qrcode'); return _QRCode; }
const crypto = require('crypto');
const os = require('os');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

let emailService;
try {
  emailService = require('./lib/email');
} catch (e) {
  emailService = { isConfigured: () => false, notifyVendorNewOrder: () => Promise.resolve(), notifyVendorProductApproved: () => Promise.resolve(), notifyClientOrderStatusChanged: () => Promise.resolve(), notifyClientNewReply: () => Promise.resolve(), notifyAbandonedCart: () => Promise.resolve(), sendEmailVerification: () => Promise.resolve(), sendPasswordResetEmail: () => Promise.resolve() };
}
let pushService;
try {
  pushService = require('./lib/push');
} catch (e) {
  pushService = { isConfigured: () => false, getPublicKey: () => '', sendNotification: () => Promise.resolve(false) };
}
let queue;
try {
  queue = require('./lib/queue');
} catch (e) {
  queue = null;
}
let authSocial;
try {
  authSocial = require('./lib/auth-social');
} catch (e) {
  authSocial = null;
}

let db;
try {
  db = require('./database');
  db.initDb();
  if (emailService && emailService.initFromDb) emailService.initFromDb(db);
  const dbPath = db.getDbPath ? db.getDbPath() : path.join(__dirname, 'client', 'data', 'key2lix.db');
  logger.info({ dbPath }, 'Database ready');
} catch (err) {
  logger.error({ err: err.message, code: err.code }, 'Database error');
  if (err.code === 'MODULE_NOT_FOUND') logger.error('Run: npm install');
  process.exit(1);
}

const app = express();
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const CLIENT_ROOT = (process.env.USE_BUILD === '1' && fs.existsSync(path.join(__dirname, 'dist'))) ? 'dist' : 'client';
/** عنوان بريد واحد فقط (قبل أول مسافة/فاصلة) لتجنب أخطاء التسليم. */
function normalizeClientEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const s = String(email).trim();
  const first = s.split(/[\s,;]+/)[0];
  return (first && first.includes('@')) ? first : s;
}
try { commissionService.refreshConfig(); } catch (e) { }

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';

/* ===== Middleware ===== */
const isProduction = process.env.NODE_ENV === 'production';
var cspConnectSrc = ["'self'", 'https://*.ingest.sentry.io', 'https://cdn.jsdelivr.net'];
if (!isProduction) {
  cspConnectSrc.push('http://localhost:' + PORT, 'http://127.0.0.1:' + PORT, 'ws://localhost:' + PORT, 'ws://127.0.0.1:' + PORT);
}
/* S1: Security headers — HSTS (production only), CSP, X-Frame-Options (frameAncestors). See docs/SECURITY-HEADERS.md */
/* COOP/CORP: تعطيل في التطوير لتجنب تحذيرات المنشأ غير الموثوق (مثل 192.168.x.x) وعدم تناسق Origin-Agent-Cluster */
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.jsdelivr.net', 'https://browser.sentry-cdn.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'https://api.qrserver.com'],
      connectSrc: cspConnectSrc,
      fontSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com'],
      frameSrc: ["'self'", 'https://www.google.com', 'https://maps.google.com', 'https://google.com'],
      frameAncestors: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  },
  hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  crossOriginOpenerPolicy: isProduction,
  crossOriginResourcePolicy: isProduction
}));
if (!isProduction) {
  app.use((req, res, next) => {
    res.setHeader('Origin-Agent-Cluster', '?0');
    next();
  });
}
app.use(brotliMiddleware);
app.use(compression({ filter: (req, res) => !res.useBrotli }));
app.use(brotliCompressMiddleware);
/* Stripe webhook needs raw body for signature verification — must be before express.json */
app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  let stripeLib;
  try { stripeLib = require('./lib/stripe'); } catch (_) { stripeLib = null; }
  if (!stripeLib || !stripeLib.isConfigured()) return res.status(503).send('Stripe not configured');
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing Stripe-Signature');
  let event;
  try {
    event = stripeLib.constructWebhookEvent(req.body, sig);
  } catch (err) {
    logger.warn({ err: err.message }, 'Stripe webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata && session.metadata.orderId;
    if (orderId && db.updateOrderPaymentStatus) {
      try {
        db.updateOrderPaymentStatus(orderId, session.id, 'paid');
        logger.info({ orderId, sessionId: session.id }, 'Order marked paid via Stripe');
      } catch (e) {
        logger.error({ err: e.message, orderId }, 'updateOrderPaymentStatus failed');
      }
    }
  }
  res.json({ received: true });
});
app.use(express.json({ limit: process.env.BODY_LIMIT || '500kb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.BODY_LIMIT || '500kb' }));

const { registerStatic } = require('./routes/static');
registerStatic(app);

/* GET / قبل الجلسة — الصفحة الرئيسية لا تحتاج جلسة للوثائق الأولية، الـ API يستخدم الكوكي */
app.get('/', (req, res, next) => {
  const host = (req.get('host') || '').toLowerCase();
  if (host.indexOf('ngrok') !== -1) return next();
  res.sendFile(path.join(__dirname, CLIENT_ROOT, 'pages', 'index.html'));
});

/* إرجاع 404 فوراً لمسارات بوتات معروفة (WordPress، PHP) لتوفير الموارد */
app.use((req, res, next) => {
  const p = (req.path || req.url || '').split('?')[0] || '';
  if (p === '/index.php' || p.indexOf('/wp-admin') === 0 || p.indexOf('/wordpress/') === 0 ||
      p === '/xmlrpc.php' || p === '/wp-login.php' || p === '/.env' || p === '/sitemap.xml/sitemap.xml') {
    return res.status(404).end();
  }
  next();
});

/* ===== CORS (N3): قائمة نطاقات مسموحة للإنتاج عند استدعاء API من نطاق آخر ===== */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
if (allowedOrigins.length > 0) {
  app.use((req, res, next) => {
    const origin = req.get('Origin');
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

const sessionSecret = process.env.SESSION_SECRET || 'key2lix-admin-secret-change-in-production';
if (isProduction && (!process.env.SESSION_SECRET || sessionSecret.length < 32)) {
  logger.warn('SESSION_SECRET يجب أن يكون معرّفاً وقوياً (32+ حرفاً) في الإنتاج. راجع .env.example');
}
const sessionStore = process.env.SESSION_STORE === 'db' ? new (require('./lib/session-store-db'))() : undefined;
if (sessionStore) logger.info('Sessions stored in database (SESSION_STORE=db)');
app.use(session({
  secret: sessionSecret,
  name: 'key2lix.sid',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

/* S3: تسجيل خروج تلقائي بعد عدم النشاط — انتهاء الجلسة بعد X دقيقة من عدم النشاط مع تمديد عند النشاط */
const sessionInactivityMinutes = parseInt(process.env.SESSION_INACTIVITY_MINUTES || '0', 10) || (isProduction ? 60 : 0);
const SESSION_INACTIVITY_MS = sessionInactivityMinutes > 0 ? sessionInactivityMinutes * 60 * 1000 : 0;
app.use((req, res, next) => {
  if (SESSION_INACTIVITY_MS <= 0 || !req.session) return next();
  const hasUser = !!(req.session.clientId || req.session.vendorId || req.session.admin);
  if (!hasUser) return next();
  const now = Date.now();
  if (req.session.lastActivity != null && (now - req.session.lastActivity) > SESSION_INACTIVITY_MS) {
    const wasAdmin = !!req.session.admin;
    const wasVendor = !!req.session.vendorId;
    const returnUrl = encodeURIComponent(req.originalUrl || '/');
    req.session.destroy((err) => {
      if (err) logger.warn({ err: err.message }, 'Session destroy on inactivity failed');
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
        return res.status(401).json({ error: 'Session expired due to inactivity. Please log in again.' });
      }
      if (wasAdmin) return res.redirect('/login?returnUrl=' + returnUrl);
      if (wasVendor) return res.redirect('/vendor-login?returnUrl=' + returnUrl);
      return res.redirect('/client-login?returnUrl=' + returnUrl);
    });
    return;
  }
  req.session.lastActivity = now;
  next();
});

/* ===== Rate limits (S2): عام لـ /api؛ أقسى للطلب والاتصال؛ أدمن أوسع ===== */
const apiStrictLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many requests. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});
const apiOrderViewLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  message: { error: 'Too many requests. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});
const apiOrderPostLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_ORDER_POST_MAX || '15', 10) || 15,
  message: { error: 'Too many order attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});
const apiLoginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});
const forgotPasswordLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many password reset requests. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});
function getRateLimitAdminMax() {
  return parseInt(db.getSetting('RATE_LIMIT_ADMIN_MAX') || process.env.RATE_LIMIT_ADMIN_MAX || '2000', 10) || 2000;
}
function getRateLimitApiMax() {
  return parseInt(db.getSetting('RATE_LIMIT_API_MAX') || process.env.RATE_LIMIT_API_MAX || '500', 10) || 500;
}
app.use('/api/admin', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req, res) => getRateLimitAdminMax(),
  message: { error: 'Too many requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false
}));
app.use('/api/order', apiOrderViewLimit);
app.use('/api/contact', apiStrictLimit);
app.use('/api/login', apiLoginLimit);
app.use('/api/client/login', apiLoginLimit);
app.use('/api/vendor/login', apiLoginLimit);
app.use('/api/client/forgot-password', forgotPasswordLimit);
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req, res) => getRateLimitApiMax(),
  message: { error: 'Too many requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/api/admin')
}));
const vendorApiKeyLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Too many requests for this API key. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const auth = req.get('Authorization') || '';
    return !req.get('X-API-Key') && !/^Bearer\s+/i.test(auth);
  },
  keyGenerator: (req) => {
    const bearer = (req.get('Authorization') || '').trim().match(/^Bearer\s+(.+)$/i);
    const k = req.get('X-API-Key') || (bearer ? bearer[1] : '');
    return k ? 'ak:' + crypto.createHash('sha256').update(k).digest('hex') : ipKeyGenerator(req.ip);
  }
});
app.use('/api/vendor', vendorApiKeyLimit);

/* ===== Health & version (routes/health.js) ===== */
const APP_VERSION = process.env.BUILD_VERSION || process.env.APP_VERSION || ('b' + Date.now().toString(36));
const { registerHealth } = require('./routes/health');
registerHealth(app, { db, appVersion: APP_VERSION });

/* ===== Request logging ===== */
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    logger.info({ method: req.method, url: req.originalUrl || req.url, statusCode: res.statusCode, ms }, 'request');
  });
  next();
});

/* ===== API versioning: /api/v1/* → /api/* (نفس السلوك؛ إمكانية v2 لاحقاً) ===== */
app.use((req, res, next) => {
  const u = req.url || '';
  const o = req.originalUrl || u;
  if (u.startsWith('/api/v1/') || u === '/api/v1') {
    req.url = '/api' + u.slice(7);
    if (o.startsWith('/api/v1/') || o === '/api/v1') req.originalUrl = '/api' + o.slice(7);
  }
  next();
});

/* ===== تأمين الأدمن: رؤوس أمان + قائمة IP (اختياري) ===== */
app.use(adminSecurity.adminSecurityHeaders);
app.use(adminSecurity.adminIpAllowlist);

/* ===== Maintenance mode — عرض صفحة صيانة للزوار مع السماح للأدمن ===== */
app.use((req, res, next) => {
  try {
    const mode = db.getSetting('MAINTENANCE_MODE') || process.env.MAINTENANCE_MODE || '';
    if (mode !== '1' && mode !== 'true') return next();
    if (req.session && req.session.admin) return next();
    const reqPath = (req.path || req.url || '').split('?')[0];
    if (reqPath === '/admin' || reqPath === '/admin.html' || reqPath === '/login' || reqPath.startsWith('/api/admin') || reqPath === '/api/login' || reqPath === '/health' || reqPath === '/pages/admin.html' || reqPath === '/pages/login.html') return next();
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') !== -1)) {
      return res.status(503).json({ error: 'الموقع قيد الصيانة. نعود قريباً.', maintenance: true });
    }
    res.status(503).sendFile(path.join(__dirname, CLIENT_ROOT, 'pages', 'maintenance.html'), { cacheControl: false });
  } catch (e) {
    next();
  }
});

/* ===== ربط جلسة الأدمن (IP/UA) + CSRF لـ /api/admin ===== */
app.use('/api/admin', (req, res, next) => {
  if (!req.session || !req.session.admin) return next();
  adminSecurity.requireAdminSessionBinding(req, res, next);
});
app.use('/api/admin', (req, res, next) => {
  if (!req.session || !req.session.admin) return next();
  adminSecurity.requireAdminCsrf(req, res, next);
});

/* ===== Sitemap (ديناميكي مع روابط المنتجات و BASE_URL) ===== */
app.get('/sitemap.xml', (req, res) => {
  try {
    const base = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const urls = [
      { loc: '/', priority: '1', changefreq: 'weekly' },
      { loc: '/products', priority: '0.9', changefreq: 'weekly' },
      { loc: '/contact', priority: '0.7', changefreq: 'monthly' },
      { loc: '/subscriptions', priority: '0.6', changefreq: 'weekly' },
      { loc: '/hardware', priority: '0.6', changefreq: 'weekly' },
      { loc: '/software', priority: '0.6', changefreq: 'weekly' },
      { loc: '/how-to-buy', priority: '0.5', changefreq: 'monthly' },
      { loc: '/support', priority: '0.5', changefreq: 'monthly' },
      { loc: '/news', priority: '0.5', changefreq: 'weekly' },
      { loc: '/how-to-sell', priority: '0.5', changefreq: 'monthly' },
      { loc: '/partnerships', priority: '0.5', changefreq: 'monthly' },
      { loc: '/key2lix-plus', priority: '0.5', changefreq: 'monthly' },
      { loc: '/vendor-register', priority: '0.4', changefreq: 'monthly' },
      { loc: '/category', priority: '0.6', changefreq: 'weekly' },
      { loc: '/privacy', priority: '0.4', changefreq: 'yearly' },
      { loc: '/terms', priority: '0.4', changefreq: 'yearly' },
      { loc: '/cart', priority: '0.6', changefreq: 'weekly' },
      { loc: '/client-login', priority: '0.3', changefreq: 'monthly' },
      { loc: '/client-register', priority: '0.3', changefreq: 'monthly' }
    ];
    const products = db.getProductsNested();
    if (products && typeof products === 'object') {
      ['game_cards', 'skins', 'software'].forEach(cat => {
        if (products[cat] && typeof products[cat] === 'object') {
          Object.keys(products[cat]).forEach(key => {
            urls.push({ loc: `/product.html?product=${encodeURIComponent(key)}&category=${encodeURIComponent(cat)}`, priority: '0.8', changefreq: 'weekly' });
          });
        }
      });
      if (products.hardware && typeof products.hardware === 'object') {
        Object.keys(products.hardware).forEach(sub => {
          if (products.hardware[sub] && typeof products.hardware[sub] === 'object') {
            Object.keys(products.hardware[sub]).forEach(key => {
              urls.push({ loc: `/product.html?product=${encodeURIComponent(key)}&category=hardware&subcat=${encodeURIComponent(sub)}`, priority: '0.8', changefreq: 'weekly' });
            });
          }
        });
      }
    }
    const xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      urls.map(u => `<url><loc>${base}${u.loc}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('') + '</urlset>';
    res.type('application/xml').send(xml);
  } catch (err) {
    logger.error({ err: err.message }, 'sitemap error');
    res.status(500).send('<?xml version="1.0"?><error/>');
  }
});

/* S21: تخزين مؤقت لـ products.json (60 ثانية) لتقليل الذاكرة و CPU عند الطلبات المتكررة */
let _productsJsonCache = null;
let _productsJsonCacheAt = 0;
const PRODUCTS_CACHE_TTL_MS = 60 * 1000; // 60 ثانية
function invalidateProductsCache() { _productsJsonCache = null; }

const _vendorTrustCache = {};
function enrichVendorTrustData(data) {
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    if (obj.prices && Array.isArray(obj.prices) && obj.vendor_id != null) {
      const vid = obj.vendor_id;
      if (!_vendorTrustCache[vid]) {
        const badges = db.getVendorTrustBadges(vid);
        const vendor = db.getVendorById(vid);
        _vendorTrustCache[vid] = {
          badges: badges.badges,
          rating_avg: badges.rating_avg,
          rating_count: badges.rating_count,
          return_policy: vendor && vendor.return_policy ? vendor.return_policy : null
        };
      }
      const v = _vendorTrustCache[vid];
      obj.vendor_badges = v.badges;
      obj.vendor_rating_avg = v.rating_avg;
      obj.vendor_rating_count = v.rating_count;
      if (v.return_policy) obj.return_policy = v.return_policy;
    }
    Object.keys(obj).forEach((k) => walk(obj[k]));
  };
  walk(data);
  Object.keys(_vendorTrustCache).forEach((k) => delete _vendorTrustCache[k]);
}

function applyFinalPricesToVendorProducts(data) {
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    if (obj.prices && Array.isArray(obj.prices) && obj.vendor_id != null) {
      obj.prices.forEach((p) => {
        if (p && p.value != null) {
          const base = commissionService.parsePriceFromValue(p.value);
          if (!isNaN(base) && base >= 0) {
            const finalP = commissionService.computeFinalPrice(base);
            p.value = String(Math.round(finalP)) + ' DZD';
          }
        }
      });
    }
    Object.keys(obj).forEach((k) => walk(obj[k]));
  };
  walk(data);
}

app.get('/data/products.json', (req, res) => {
  try {
    const now = Date.now();
    if (_productsJsonCache && (now - _productsJsonCacheAt) < PRODUCTS_CACHE_TTL_MS) {
      res.setHeader('Cache-Control', 'public, max-age=30');
      return res.type('application/json').send(_productsJsonCache);
    }
    const data = db.getProductsNested();
    enrichVendorTrustData(data);
    applyFinalPricesToVendorProducts(data);
    const json = JSON.stringify(data);
    _productsJsonCache = json;
    _productsJsonCacheAt = now;
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.type('application/json').send(json);
  } catch (err) {
    _productsJsonCache = null;
    Sentry.captureException(err);
    logger.error({ err: err.message }, 'GET /data/products.json error');
    res.status(500).json({ error: 'Failed to load products' });
  }
});

/* P7: خريطة تقييمات المنتجات للعرض في البطاقات */
app.get('/api/products/rating-stats', (req, res) => {
  try {
    res.json(db.getAllProductRatingStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* أسعار الصرف — للعرض العام (استخدام من api/config و api/currency-rates) */
function getCurrencyRateUsd() {
  return parseFloat(db.getSetting('currency_rate_usd') || process.env.CURRENCY_RATE_USD || '270') || 270;
}
function getCurrencyRateEur() {
  return parseFloat(db.getSetting('currency_rate_eur') || process.env.CURRENCY_RATE_EUR || '300') || 300;
}

/* P26: إعدادات عامة للواجهة (روابط السوشيال من env) */
app.get('/api/config', (req, res) => {
  const openaiKey = process.env.OPENAI_API_KEY || '';
  const rateUsd = getCurrencyRateUsd();
  const rateEur = getCurrencyRateEur();
  res.json({
    sentryDsn: process.env.SENTRY_DSN || null,
    env: process.env.NODE_ENV || 'development',
    aiEnabled: !!(openaiKey && openaiKey.startsWith('sk-')),
    pushEnabled: pushService.isConfigured(),
    vapidPublicKey: pushService.getPublicKey() || null,
    currencyRates: { USD: rateUsd, EUR: rateEur },
    social: {
      facebook: process.env.SOCIAL_FACEBOOK_URL || '',
      twitter: process.env.SOCIAL_TWITTER_URL || '',
      instagram: process.env.SOCIAL_INSTAGRAM_URL || '',
      youtube: process.env.SOCIAL_YOUTUBE_URL || ''
    },
    whatsappUrl: process.env.WHATSAPP_URL || process.env.SOCIAL_WHATSAPP_URL || '',
    socialLogin: authSocial ? { google: authSocial.isGoogleConfigured(), facebook: authSocial.isFacebookConfigured() } : { google: false, facebook: false },
    deliveryGuaranteeHours: parseInt(process.env.DELIVERY_GUARANTEE_HOURS || '24', 10) || 24,
    firstOrderCouponCode: (process.env.FIRST_ORDER_COUPON_CODE || '').trim() || null
  });
});

/* Public: أسعار الصرف (د.ج لكل 1 وحدة أجنبية) للعرض في الواجهة */
app.get('/api/currency-rates', (req, res) => {
  try {
    res.json({ USD: getCurrencyRateUsd(), EUR: getCurrencyRateEur() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== Social login (Google / Facebook OAuth2) ===== */
function getBaseUrl(req) {
  return (process.env.BASE_URL || process.env.SITE_URL || '').trim() || (req.protocol + '://' + (req.get('host') || ''));
}

app.get('/api/auth/google', (req, res) => {
  if (!authSocial || !authSocial.isGoogleConfigured()) return res.redirect(302, '/client-login?error=social_unavailable');
  const base = getBaseUrl(req).replace(/\/$/, '');
  const redirectUri = base + '/api/auth/google/callback';
  const state = (req.query && req.query.returnUrl) ? String(req.query.returnUrl) : '';
  const url = authSocial.getGoogleLoginUrl(redirectUri, state);
  if (!url) return res.redirect(302, '/client-login?error=social_unavailable');
  res.redirect(302, url);
});

app.get('/api/auth/google/callback', async (req, res) => {
  if (!authSocial || !authSocial.isGoogleConfigured()) return res.redirect(302, '/client-login?error=social_unavailable');
  const code = req.query && req.query.code;
  const state = (req.query && req.query.state) ? String(req.query.state) : '';
  if (!code) return res.redirect(302, '/client-login?error=social_denied');
  const base = getBaseUrl(req).replace(/\/$/, '');
  const redirectUri = base + '/api/auth/google/callback';
  try {
    const profile = await authSocial.exchangeGoogleCode(code, redirectUri);
    if (!profile || !profile.email) return res.redirect(302, '/client-login?error=social_no_email');
    let client = db.getClientByEmail(profile.email);
    if (!client) {
      const socialPasswordHash = getBcrypt().hashSync(crypto.randomBytes(32).toString('hex'), 10);
      const id = db.createClient(profile.email, socialPasswordHash, profile.name || profile.email, '', '');
      client = db.getClientByEmail(profile.email);
      if (!client) client = { id, email: profile.email, name: profile.name || profile.email };
    }
    req.session.clientId = client.id;
    req.session.clientEmail = client.email;
    const returnUrl = (state && state.startsWith('/')) ? state : '/';
    res.redirect(302, returnUrl);
  } catch (err) {
    Sentry.captureException(err);
    res.redirect(302, '/client-login?error=social_failed');
  }
});

app.get('/api/auth/facebook', (req, res) => {
  if (!authSocial || !authSocial.isFacebookConfigured()) return res.redirect(302, '/client-login?error=social_unavailable');
  const base = getBaseUrl(req).replace(/\/$/, '');
  const redirectUri = base + '/api/auth/facebook/callback';
  const state = (req.query && req.query.returnUrl) ? String(req.query.returnUrl) : '';
  const url = authSocial.getFacebookLoginUrl(redirectUri, state);
  if (!url) return res.redirect(302, '/client-login?error=social_unavailable');
  res.redirect(302, url);
});

app.get('/api/auth/facebook/callback', async (req, res) => {
  if (!authSocial || !authSocial.isFacebookConfigured()) return res.redirect(302, '/client-login?error=social_unavailable');
  const code = req.query && req.query.code;
  const state = (req.query && req.query.state) ? String(req.query.state) : '';
  if (!code) return res.redirect(302, '/client-login?error=social_denied');
  const base = getBaseUrl(req).replace(/\/$/, '');
  const redirectUri = base + '/api/auth/facebook/callback';
  try {
    const profile = await authSocial.exchangeFacebookCode(code, redirectUri);
    if (!profile || !profile.email) return res.redirect(302, '/client-login?error=social_no_email');
    let client = db.getClientByEmail(profile.email);
    if (!client) {
      const socialPasswordHash = getBcrypt().hashSync(crypto.randomBytes(32).toString('hex'), 10);
      db.createClient(profile.email, socialPasswordHash, profile.name || profile.email, '', '');
      client = db.getClientByEmail(profile.email);
    }
    if (!client) return res.redirect(302, '/client-login?error=social_failed');
    req.session.clientId = client.id;
    req.session.clientEmail = client.email;
    const returnUrl = (state && state.startsWith('/')) ? state : '/';
    res.redirect(302, returnUrl);
  } catch (err) {
    Sentry.captureException(err);
    res.redirect(302, '/client-login?error=social_failed');
  }
});

/* Theme & Branding — ألوان، هيرو، أيقونات فئات (عام للواجهة) */
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
const HOME_SECTIONS_DEFAULT_ORDER = ['banner', 'hero', 'payment_strip', 'trust_bar', 'stats', 'last_order', 'categories', 'offers', 'how', 'most_selling', 'promo', 'testimonials', 'why', 'faq'];
const HOME_SECTIONS_KEY_ORDER = 'HOME_SECTIONS_ORDER';
const HOME_SECTIONS_KEY_ENABLED = 'HOME_SECTIONS_ENABLED';
const DEFAULT_PRIMARY = '#7c3aed';
const DEFAULT_SECONDARY = '#5b21b6';

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const m = hex.replace(/^#/, '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function getHomeSectionsOrder() {
  try {
    const raw = (db.getSetting(HOME_SECTIONS_KEY_ORDER) || '').trim();
    if (!raw) return HOME_SECTIONS_DEFAULT_ORDER.slice();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : HOME_SECTIONS_DEFAULT_ORDER.slice();
  } catch (_) {
    return HOME_SECTIONS_DEFAULT_ORDER.slice();
  }
}
function getHomeSectionsEnabled() {
  try {
    const raw = (db.getSetting(HOME_SECTIONS_KEY_ENABLED) || '').trim();
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch (_) {
    return {};
  }
}

app.get('/api/theme', (req, res) => {
  try {
    const primary = (db.getSetting(THEME_KEYS.primary) || '').trim() || DEFAULT_PRIMARY;
    const secondary = (db.getSetting(THEME_KEYS.secondary) || '').trim() || DEFAULT_SECONDARY;
    const heroType = (db.getSetting(THEME_KEYS.heroType) || 'image').toLowerCase();
    const heroImageUrl = (db.getSetting(THEME_KEYS.heroImageUrl) || '').trim();
    const heroGradient = (db.getSetting(THEME_KEYS.heroGradient) || '').trim();
    const heroColor = (db.getSetting(THEME_KEYS.heroColor) || '').trim();
    const heroTitle = (db.getSetting(THEME_KEYS.heroTitle) || '').trim();
    const heroTagline = (db.getSetting(THEME_KEYS.heroTagline) || '').trim();
    const heroCtaText = (db.getSetting(THEME_KEYS.heroCtaText) || '').trim();
    const heroCtaUrl = (db.getSetting(THEME_KEYS.heroCtaUrl) || '').trim();
    const heroVideoUrl = (db.getSetting(THEME_KEYS.heroVideoUrl) || '').trim();
    const categoryProducts = (db.getSetting(THEME_KEYS.categoryProducts) || '').trim();
    const categorySubscriptions = (db.getSetting(THEME_KEYS.categorySubscriptions) || '').trim();
    const categoryHardware = (db.getSetting(THEME_KEYS.categoryHardware) || '').trim();
    const categorySoftware = (db.getSetting(THEME_KEYS.categorySoftware) || '').trim();
    const homeOrder = getHomeSectionsOrder();
    const homeEnabled = getHomeSectionsEnabled();
    res.json({
      primary,
      secondary,
      hero: {
        type: heroType === 'gradient' || heroType === 'solid' ? heroType : 'image',
        imageUrl: heroImageUrl || null,
        gradient: heroGradient || null,
        color: heroColor || null,
        title: heroTitle || null,
        tagline: heroTagline || null,
        ctaText: heroCtaText || null,
        ctaUrl: heroCtaUrl || null,
        videoUrl: heroVideoUrl || null
      },
      categoryIcons: {
        products: categoryProducts || null,
        subscriptions: categorySubscriptions || null,
        hardware: categoryHardware || null,
        software: categorySoftware || null
      },
      homeSections: { order: homeOrder, enabled: homeEnabled }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* P3: Web Push — اشتراك للعميل أو البائع */
app.post('/api/push/subscribe', express.json(), (req, res) => {
  const body = req.body || {};
  const subscription = body.subscription;
  if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }
  let userType = null;
  let userId = null;
  if (req.session && req.session.clientId) {
    userType = 'client';
    userId = req.session.clientId;
  } else if (req.session && req.session.vendorId) {
    userType = 'vendor';
    userId = req.session.vendorId;
  }
  if (!userType || !userId) return res.status(401).json({ error: 'Login required' });
  const ok = db.savePushSubscription(
    subscription.endpoint,
    subscription.keys.p256dh,
    subscription.keys.auth,
    userType,
    userId
  );
  res.json({ success: !!ok });
});

/* P23 — استقبال أحداث التحليلات (اختياري؛ للتخزين أو التكامل لاحقاً) */
app.post('/api/track', express.json(), (req, res) => {
  const body = req.body || {};
  const event = body.event || 'unknown';
  const data = body.data || {};
  if (process.env.LOG_LEVEL === 'debug') {
    logger.debug({ event, data }, 'track');
  }
  res.status(204).end();
});

/* N5 — حفظ سلة للتذكير لاحقاً (عميل مسجّل أو زائر مع بريد) */
app.post('/api/cart', express.json(), (req, res) => {
  const clientId = req.session && req.session.clientId ? req.session.clientId : null;
  const body = req.body || {};
  const email = (body.email && String(body.email).trim()) || null;
  const items = Array.isArray(body.items) ? body.items : [];
  if (clientId) {
    try {
      db.saveAbandonedCart(clientId, null, items);
      return res.json({ success: true });
    } catch (err) {
      logger.error({ err: err.message }, 'saveAbandonedCart (client)');
      return res.status(500).json({ error: 'Failed to save cart' });
    }
  }
  if (email) {
    try {
      db.saveAbandonedCart(null, email, items);
      return res.json({ success: true });
    } catch (err) {
      logger.error({ err: err.message }, 'saveAbandonedCart (guest)');
      return res.status(500).json({ error: 'Failed to save cart' });
    }
  }
  return res.status(400).json({ error: 'Email required for guests, or log in' });
});

/* ===== Page routes (routes/pages.js) ===== */
function sendPage(filename) {
  return (req, res) => {
    const p = path.join(__dirname, CLIENT_ROOT, 'pages', filename);
    res.sendFile(p, (err) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.status(404).sendFile(path.join(__dirname, CLIENT_ROOT, 'pages/404.html'));
        } else {
          logger.error({ err: err.message, path: p }, 'sendFile error');
          res.status(500).send('Error loading page');
        }
      }
    });
  };
}
function sendPageNoCache(filename) {
  return (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    return sendPage(filename)(req, res, () => { });
  };
}
registerPages(app, { sendPage, sendPageNoCache, CLIENT_ROOT, logger });

/* S20: Cache-Control أطول للأصول الثابتة في الإنتاج */
function staticCacheControl(res, path) {
  if (process.env.NODE_ENV !== 'production') return;
  const p = (path || '').replace(/\\/g, '/');
  if (p.indexOf('/assets/img') !== -1 || p.indexOf('/assets/css') !== -1 || p.indexOf('/assets/js') !== -1) {
    res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 days
  }
}
/* Service Worker يُخدم بدون كاش حتى يتحقق المتصفح من التحديثات بعد كل رفع */
app.get('/sw.js', (req, res) => {
  const swPath = path.join(__dirname, CLIENT_ROOT, 'sw.js');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.type('application/javascript');
  res.sendFile(swPath);
});
app.use(express.static(path.join(__dirname, CLIENT_ROOT), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : '30s',
  etag: true,
  lastModified: true,
  setHeaders: staticCacheControl
}));

/* ===== Multer (Upload Images) + WebP conversion (A3) — تحميل عند أول رفع ===== */
const IMG_DIR = path.join(__dirname, 'client/assets/img');
let _upload;
function getUpload() {
  if (!_upload) {
    const m = getMulter();
    const storage = m.diskStorage({
      destination: (req, file, cb) => { cb(null, IMG_DIR); },
      filename: (req, file, cb) => {
        const key = (req.body.key || 'img').replace(/\s+/g, '_');
        cb(null, key + '-' + Date.now() + path.extname(file.originalname));
      }
    });
    _upload = m({ storage });
  }
  return _upload;
}

/** N10: Convert uploaded image to WebP (quality 85, max width 1920). Returns { main } or single path string on error. */
async function processImageToWebP(filePath) {
  const sharpLib = getSharp(); if (!sharpLib || !filePath || !fs.existsSync(filePath)) return null;
  const ext = path.extname(filePath).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return null;
  const outPath = filePath.replace(/\.[a-z]+$/i, '.webp');
  if (outPath === filePath) return null;
  const toRel = (p) => path.relative(path.join(__dirname, CLIENT_ROOT), p).replace(/\\/g, '/');
  try {
    await sharpLib(filePath)
      .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(outPath);
    fs.unlinkSync(filePath);
    return { main: toRel(outPath) };
  } catch (err) {
    logger.warn({ err: err.message, filePath }, 'WebP conversion failed, keeping original');
    const single = toRel(fs.existsSync(outPath) ? outPath : filePath);
    return single;
  }
}

/** إذا كان رفع الصور إلى S3 مفعّلاً، يرفع الملف ويرجع object بمسار S3 ويحذف الملف المحلي. */
async function maybeUploadImagesToS3(rel) {
  if (!rel || typeof rel !== 'object') return rel;
  try {
    const s3 = require('./lib/s3-upload');
    if (!s3.isS3Enabled()) return rel;
    const serverDir = path.join(__dirname);
    const result = await s3.uploadProductImagesToS3(rel, CLIENT_ROOT, serverDir);
    if (!result) return rel;
    const wasLocal = (p) => p && typeof p === 'string' && !p.startsWith('http');
    [rel.main].filter(wasLocal).forEach((p) => {
      const full = path.join(serverDir, CLIENT_ROOT, p.replace(/^\//, '').replace(/\\/g, path.sep));
      try { if (fs.existsSync(full)) fs.unlinkSync(full); } catch (_) { }
    });
    return result;
  } catch (e) {
    logger.warn({ err: e.message }, 'S3 image upload failed, keeping local');
    return rel;
  }
}

// Products & orders: SQLite (database/db.js). GET /data/products.json served from DB above.

/* ===== Login rate limit (in-memory) ===== */
const loginAttempts = new Map();
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000; // 15 min

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

function auditLog(actorType, actorId, action, details, req) {
  try {
    db.insertAuditLog(actorType, actorId, action, details, req ? getClientIP(req) : null);
  } catch (e) { }
}

function pruneLoginAttempts(map, maxSize) {
  if (map.size <= maxSize) return;
  const now = Date.now();
  for (const [k, v] of map.entries()) {
    if (v && v.resetAt && v.resetAt < now) map.delete(k);
  }
  if (map.size > maxSize) {
    const keys = [...map.keys()].slice(0, Math.floor(map.size / 2));
    keys.forEach((k) => map.delete(k));
  }
}

function checkLoginRateLimit(req) {
  pruneLoginAttempts(loginAttempts, 1000);
  const ip = getClientIP(req);
  const now = Date.now();
  let rec = loginAttempts.get(ip);
  if (!rec) { rec = { count: 0, resetAt: now + LOGIN_LOCK_MS }; loginAttempts.set(ip, rec); }
  if (rec.resetAt < now) { rec.count = 0; rec.resetAt = now + LOGIN_LOCK_MS; }
  if (rec.count >= LOGIN_MAX_ATTEMPTS) {
    const waitMin = Math.ceil((rec.resetAt - now) / 60000);
    return { ok: false, message: 'Too many attempts. Try again in ' + waitMin + ' minutes.' };
  }
  return { ok: true, rec };
}

/* ===== Auth APIs ===== */
function isAdminTotpEnabled() {
  return db.getSetting && db.getSetting('admin_totp_enabled') === '1';
}

function getAdminTotpSecret() {
  return db.getSetting && db.getSetting('admin_totp_secret');
}

app.post('/api/login', (req, res) => {
  const rate = checkLoginRateLimit(req);
  if (!rate.ok) {
    setImmediate(() => { try { db.addAdminLoginLog && db.addAdminLoginLog(false, getClientIP(req), (req.body && req.body.username) ? '[provided]' : null, { reason: 'rate_limit' }); } catch (e) { } });
    return res.status(429).json({ error: rate.message });
  }

  const { username, password } = req.body || {};
  const ip = getClientIP(req);

  if (username == null || password == null || String(username).trim() === '' || String(password).trim() === '') {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    if (isAdminTotpEnabled() && getAdminTotpSecret()) {
      const tempToken = crypto.randomBytes(32).toString('hex');
      if (!global.adminTempTokens) global.adminTempTokens = new Map();
      global.adminTempTokens.set(tempToken, { username: ADMIN_USER, createdAt: Date.now() });
      setTimeout(() => { if (global.adminTempTokens) global.adminTempTokens.delete(tempToken); }, 5 * 60 * 1000);
      setImmediate(() => { try { db.addAdminLoginLog && db.addAdminLoginLog(true, ip, username, { step: '2fa_pending' }); } catch (e) { } });
      return res.json({ requires2FA: true, tempToken });
    }
    loginAttempts.delete(ip);
    req.session.admin = true;
    req.session.adminRole = 'admin';
    adminSecurity.setAdminSessionBinding(req);
    res.json({ success: true, role: 'admin' });
    setImmediate(() => {
      try {
        const recent = (db.getAdminLoginLog && db.getAdminLoginLog(20)) || [];
        const knownIps = recent.filter((e) => e.success && e.ip).map((e) => e.ip);
        db.addAdminLoginLog && db.addAdminLoginLog(true, ip, username, {});
        if (knownIps.indexOf(ip) === -1) auditLog('admin', null, 'admin_login_new_device', { ip, username }, req);
      } catch (e) { }
    });
    return;
  }
  const subAdmin = db.getAdminSubUserByEmail && db.getAdminSubUserByEmail(username);
  if (subAdmin && getBcrypt().compareSync(password, subAdmin.password_hash)) {
    loginAttempts.delete(ip);
    req.session.admin = true;
    req.session.adminRole = subAdmin.role || 'order_supervisor';
    req.session.adminSubUserId = subAdmin.id;
    adminSecurity.setAdminSessionBinding(req);
    res.json({ success: true, role: subAdmin.role });
    setImmediate(() => {
      try {
        const recent = (db.getAdminLoginLog && db.getAdminLoginLog(20)) || [];
        const knownIps = recent.filter((e) => e.success && e.ip).map((e) => e.ip);
        db.addAdminLoginLog && db.addAdminLoginLog(true, ip, username, { role: subAdmin.role });
        if (knownIps.indexOf(ip) === -1) auditLog('admin', req.session.adminSubUserId, 'admin_login_new_device', { ip, username }, req);
      } catch (e) { }
    });
    return;
  }
  rate.rec.count++;
  const attemptsLeft = LOGIN_MAX_ATTEMPTS - rate.rec.count;
  setImmediate(() => { try { db.addAdminLoginLog && db.addAdminLoginLog(false, ip, username ? '[provided]' : null, { attempts_left: attemptsLeft }); } catch (e) { } });
  logger.warn({ type: 'admin_login_failed', ip, username: username ? '[provided]' : '[missing]' }, 'Failed admin login attempt');
  if (rate.rec.count >= LOGIN_MAX_ATTEMPTS) {
    rate.rec.resetAt = Date.now() + LOGIN_LOCK_MS;
    return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
  }
  res.status(401).json({ error: 'Invalid credentials. ' + attemptsLeft + ' attempts left.' });
});

app.post('/api/admin/2fa/verify-login', express.json(), (req, res) => {
  try {
    const { tempToken, code } = req.body || {};
    if (!tempToken || !code) return res.status(400).json({ error: 'tempToken and code required' });
    const entry = global.adminTempTokens && global.adminTempTokens.get(tempToken);
    if (!entry || Date.now() - entry.createdAt > 5 * 60 * 1000) {
      return res.status(400).json({ error: 'Session expired. Please log in again.' });
    }
    const secret = getAdminTotpSecret();
    if (!secret) return res.status(400).json({ error: '2FA not configured' });
    const valid = getSpeakeasy().totp.verify({ secret, encoding: 'base32', token: String(code).trim(), window: 1 });
    if (!valid) {
      try { db.addAdminLoginLog && db.addAdminLoginLog(false, getClientIP(req), entry.username, { step: '2fa_failed' }); } catch (e) { }
      return res.status(401).json({ error: 'Invalid verification code' });
    }
    global.adminTempTokens.delete(tempToken);
    req.session.admin = true;
    req.session.adminRole = 'admin';
    adminSecurity.setAdminSessionBinding(req);
    try {
      const ip2 = getClientIP(req);
      const recent = (db.getAdminLoginLog && db.getAdminLoginLog(20)) || [];
      const knownIps = recent.filter((e) => e.success && e.ip).map((e) => e.ip);
      db.addAdminLoginLog && db.addAdminLoginLog(true, ip2, entry.username, { step: '2fa_success' });
      if (knownIps.indexOf(ip2) === -1) auditLog('admin', null, 'admin_login_new_device', { ip: ip2, username: entry.username }, req);
    } catch (e) { }
    res.json({ success: true, role: 'admin' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.admin) return res.json({ admin: true, role: req.session.adminRole || 'admin' });
  res.status(401).json({ error: 'Not logged in' });
});

/* ===== API: Client (عميل) — routes/client-api.js ===== */
const clientLoginAttempts = new Map();
const CLIENT_LOGIN_MAX = 5;
const CLIENT_LOCK_MS = 15 * 60 * 1000;
const { registerClientApi } = require('./routes/client-api');
registerClientApi(app, {
  db,
  logger,
  express,
  getBcrypt,
  emailService,
  queue,
  normalizeClientEmail,
  clientLoginAttempts,
  CLIENT_LOGIN_MAX,
  CLIENT_LOCK_MS
});

/* ===== API: Integration (ERP/محاسبة) — routes/integration.js ===== */
const { registerIntegration } = require('./routes/integration');
registerIntegration(app, { db, requireAdminOrIntegrationKey });

/* ===== API: Admin — routes/admin-api.js ===== */
const { registerAdminApi } = require('./routes/admin-api');
registerAdminApi(app, {
  db,
  logger,
  express,
  path,
  fs,
  requireAdmin,
  requireAdminRole,
  getUpload,
  getExcelJS,
  getPDFDocument,
  getBcrypt,
  getSpeakeasy,
  processImageToWebP,
  maybeUploadImagesToS3,
  invalidateProductsCache,
  auditLog,
  commissionService,
  emailService,
  queue,
  rootDir: __dirname,
  imgDir: IMG_DIR,
  ADMIN_PASS,
  isAdminTotpEnabled,
  isProduction,
  DEFAULT_PRIMARY: '#7c3aed',
  DEFAULT_SECONDARY: '#5b21b6',
  getHomeSectionsOrder,
  getHomeSectionsEnabled,
  adminSecurity,
  Sentry
});

/* ===== API: Commission settings (قراءة عامة للمورد والعميل) ===== */
app.get('/api/config', (req, res) => {
  let stripeConfigured = false;
  try { const s = require('./lib/stripe'); stripeConfigured = s.isConfigured && s.isConfigured(); } catch (_) { }
  res.json({
    sentryDsn: process.env.SENTRY_DSN || '',
    env: process.env.NODE_ENV || 'development',
    stripeConfigured
  });
});

/* ===== API: Public stats for index page ===== */
app.get('/api/stats', (req, res) => {
  try {
    const orders = db.getOrders() || [];
    const clients = db.getClients() || [];
    const completedCount = orders.filter((o) => o.status === 'completed').length;
    res.json({
      ordersCompleted: Math.max(completedCount, 500),
      clientsCount: Math.max(clients.length, 1200)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Last order for social proof ===== */
app.get('/api/last-order', (req, res) => {
  try {
    const orders = db.getOrders() || [];
    const completed = orders.filter((o) => o.status === 'completed');
    const last = completed[0];
    if (!last) {
      return res.json({ product: 'Steam Gift Card 20 USD', region: 'الجزائر', minutesAgo: 15 });
    }
    const date = last.completed_at || last.date || '';
    const minutesAgo = date ? Math.max(5, Math.min(120, Math.floor((Date.now() - new Date(date).getTime()) / 60000))) : 15;
    res.json({
      product: last.product || 'Steam Gift Card',
      region: 'الجزائر',
      minutesAgo
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings/commission', (req, res) => {
  try {
    res.json({
      threshold: commissionService.getConfig().threshold,
      rate_below: commissionService.getConfig().rateBelow,
      rate_above: commissionService.getConfig().rateAbove
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Support settings (عام — رقم AnyDesk) ===== */
app.get('/api/settings/support', (req, res) => {
  try {
    const anydeskId = db.getSetting('ANYDESK_ID') || '';
    res.json({ anydesk_id: String(anydeskId).trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== Vendor: Register ===== */
app.post('/api/vendor/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const existing = db.getVendorByEmail(email.trim());
    if (existing) return res.status(400).json({ error: 'Email already registered' });
    const password_hash = await getBcrypt().hash(String(password), 10);
    db.createVendor({ email: email.trim(), password_hash, name: (name || '').trim(), phone: (phone || '').trim() });
    res.json({ success: true, message: 'Registration successful. Wait for admin approval.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== Vendor: Login ===== */
app.post('/api/vendor/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const vendor = db.getVendorByEmail(email.trim());
    if (!vendor) {
      logger.warn({ type: 'vendor_login_failed', ip: req.ip || req.connection?.remoteAddress, email: String(email).trim().substring(0, 3) + '***' }, 'Failed vendor login: vendor not found');
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (vendor.status !== 'approved') {
      logger.warn({ type: 'vendor_login_failed', ip: req.ip || req.connection?.remoteAddress, reason: 'not_approved', vendorId: vendor.id }, 'Failed vendor login: account not approved');
      return res.status(403).json({ error: 'Account pending approval' });
    }
    const match = await getBcrypt().compare(String(password), vendor.password_hash);
    if (!match) {
      logger.warn({ type: 'vendor_login_failed', ip: req.ip || req.connection?.remoteAddress, email: String(email).trim().substring(0, 3) + '***' }, 'Failed vendor login: wrong password');
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (vendor.totp_enabled && vendor.totp_secret) {
      const tempToken = crypto.randomBytes(32).toString('hex');
      if (!global.vendorTempTokens) global.vendorTempTokens = new Map();
      global.vendorTempTokens.set(tempToken, { vendorId: vendor.id, createdAt: Date.now() });
      setTimeout(() => { if (global.vendorTempTokens) global.vendorTempTokens.delete(tempToken); }, 5 * 60 * 1000);
      try { db.addVendorActivityLog(vendor.id, 'login_2fa_pending', null); } catch (e) { }
      return res.json({ requires2FA: true, tempToken });
    }
    req.session.vendorId = vendor.id;
    req.session.loggedInAt = new Date().toISOString();
    try { db.addVendorActivityLog(vendor.id, 'login', null); } catch (e) { }
    res.json({ success: true, vendor: { id: vendor.id, name: vendor.name, email: vendor.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vendor/logout', (req, res) => {
  if (req.session && req.session.vendorId) {
    try { db.addVendorActivityLog(req.session.vendorId, 'logout', null); } catch (e) { }
  }
  req.session.vendorId = null;
  req.session.loggedInAt = null;
  res.json({ success: true });
});

app.post('/api/vendor/logout-all', requireVendor, (req, res) => {
  const vendorId = req.session.vendorId;
  try {
    db.setVendorLogoutAllBefore(vendorId);
    db.addVendorActivityLog(vendorId, 'logout_all', null);
  } catch (e) { }
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.post('/api/vendor/2fa/verify-login', async (req, res) => {
  try {
    const { tempToken, code } = req.body || {};
    if (!tempToken || !code) return res.status(400).json({ error: 'tempToken and code required' });
    const pending = global.vendorTempTokens && global.vendorTempTokens.get(tempToken);
    if (!pending || Date.now() - pending.createdAt > 5 * 60 * 1000) {
      if (pending && global.vendorTempTokens) global.vendorTempTokens.delete(tempToken);
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    const vendor = db.getVendorByIdWithPassword(pending.vendorId);
    if (!vendor || !vendor.totp_secret) {
      if (global.vendorTempTokens) global.vendorTempTokens.delete(tempToken);
      return res.status(401).json({ error: 'Invalid session' });
    }
    const valid = getSpeakeasy().totp.verify({ secret: vendor.totp_secret, encoding: 'base32', token: String(code).trim(), window: 1 });
    if (!valid) {
      return res.status(401).json({ error: 'Invalid code' });
    }
    if (global.vendorTempTokens) global.vendorTempTokens.delete(tempToken);
    req.session.vendorId = vendor.id;
    req.session.loggedInAt = new Date().toISOString();
    try { db.addVendorActivityLog(vendor.id, 'login', '2FA'); } catch (e) { }
    res.json({ success: true, vendor: { id: vendor.id, name: vendor.name, email: vendor.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vendor/activity-log', requireVendor, (req, res) => {
  try {
    const list = db.getVendorActivityLog(req.session.vendorId, 100);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vendor/2fa/setup', requireVendor, async (req, res) => {
  try {
    const v = db.getVendorById(req.session.vendorId);
    const label = (v && v.email) ? 'Key2lix (' + v.email + ')' : 'Key2lix (Vendor)';
    const secret = getSpeakeasy().generateSecret({ name: label, length: 20 });
    req.session.totpSetupSecret = secret.base32;
    const otpauth = secret.otpauth_url || ('otpauth://totp/Key2lix:vendor?secret=' + secret.base32 + '&issuer=Key2lix');
    const qrUrl = await getQRCode().toDataURL(otpauth);
    res.json({ secret: secret.base32, qrUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vendor/2fa/verify-setup', requireVendor, (req, res) => {
  try {
    const { code } = req.body || {};
    const secret = req.session.totpSetupSecret;
    if (!secret) return res.status(400).json({ error: 'Start 2FA setup first' });
    if (!code) return res.status(400).json({ error: 'Code required' });
    const valid = getSpeakeasy().totp.verify({ secret, encoding: 'base32', token: String(code).trim(), window: 1 });
    if (!valid) return res.status(400).json({ error: 'Invalid code' });
    db.setVendorTotp(req.session.vendorId, secret, true);
    req.session.totpSetupSecret = null;
    try { db.addVendorActivityLog(req.session.vendorId, '2fa_enabled', null); } catch (e) { }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vendor/2fa/disable', requireVendor, (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Password required' });
    const v = db.getVendorByIdWithPassword(req.session.vendorId);
    if (!v) return res.status(404).json({ error: 'Vendor not found' });
    const match = getBcrypt().compareSync(password, v.password_hash);
    if (!match) return res.status(400).json({ error: 'Incorrect password' });
    db.setVendorTotp(req.session.vendorId, null, false);
    try { db.addVendorActivityLog(req.session.vendorId, '2fa_disabled', null); } catch (e) { }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vendor/me', requireVendor, (req, res) => {
  const v = db.getVendorById(req.session.vendorId);
  if (!v) return res.status(404).json({ error: 'Vendor not found' });
  res.json({
    id: v.id,
    email: v.email,
    name: v.name,
    phone: v.phone || '',
    store_name: v.store_name || null,
    logo: v.logo || null,
    banner: v.banner || null,
    store_description: v.store_description || null,
    response_time_hours: v.response_time_hours != null ? v.response_time_hours : null,
    anydesk_id: v.anydesk_id || null,
    return_policy: v.return_policy || null,
    facebook_url: v.facebook_url || null,
    instagram_url: v.instagram_url || null,
    whatsapp_url: v.whatsapp_url || null,
    website_url: v.website_url || null,
    totp_enabled: !!v.totp_enabled,
    notify_by_email: v.notify_by_email !== false,
    notify_by_dashboard: v.notify_by_dashboard !== false
  });
});

/* ===== Vendor API keys (session only) ===== */
app.post('/api/vendor/api-keys', requireVendor, express.json(), (req, res) => {
  try {
    const name = (req.body && req.body.name) ? String(req.body.name).trim() : 'API Key';
    const key = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    const id = db.createVendorApiKey(req.vendorId, keyHash, name);
    res.status(201).json({ id, name, key });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/vendor/api-keys', requireVendor, (req, res) => {
  try {
    res.json(db.listVendorApiKeys(req.vendorId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete('/api/vendor/api-keys/:id', requireVendor, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const ok = db.deleteVendorApiKey(id, req.vendorId);
    if (!ok) return res.status(404).json({ error: 'API key not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== Vendor webhook (session only) ===== */
app.patch('/api/vendor/webhook', requireVendor, express.json(), (req, res) => {
  try {
    const webhookUrl = (req.body && req.body.webhook_url != null) ? String(req.body.webhook_url).trim() : '';
    const webhookSecret = crypto.randomBytes(24).toString('hex');
    db.updateVendorWebhook(req.vendorId, webhookUrl || null, webhookSecret);
    res.json({ webhook_url: webhookUrl || null, webhook_secret: webhookSecret });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/vendor/me', requireVendor, getUpload().fields([{ name: 'logo', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), async (req, res) => {
  try {
    const vendorId = req.session.vendorId;
    const updates = {};
    if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
    if (req.body.phone !== undefined) updates.phone = String(req.body.phone).trim();
    if (req.body.store_name !== undefined) {
      const raw = String(req.body.store_name || '').trim();
      updates.store_name = raw ? raw.slice(0, 100) : null;
    }
    if (req.body.store_description !== undefined) {
      const raw = String(req.body.store_description || '').trim();
      updates.store_description = raw ? raw.slice(0, 2000) : null;
    }
    if (req.body.response_time_hours !== undefined) {
      const v = req.body.response_time_hours;
      updates.response_time_hours = (v === '' || v === null || v === undefined) ? null : parseInt(v, 10);
    }
    if (req.body.anydesk_id !== undefined) {
      const aid = String(req.body.anydesk_id || '').trim();
      updates.anydesk_id = aid || null;
    }
    if (req.body.return_policy !== undefined) {
      const raw = String(req.body.return_policy || '').trim();
      updates.return_policy = raw ? raw.slice(0, 2000) : null;
    }
    if (req.body.facebook_url !== undefined) updates.facebook_url = (String(req.body.facebook_url || '').trim() || null).slice(0, 500) || null;
    if (req.body.instagram_url !== undefined) updates.instagram_url = (String(req.body.instagram_url || '').trim() || null).slice(0, 500) || null;
    if (req.body.whatsapp_url !== undefined) updates.whatsapp_url = (String(req.body.whatsapp_url || '').trim() || null).slice(0, 500) || null;
    if (req.body.website_url !== undefined) updates.website_url = (String(req.body.website_url || '').trim() || null).slice(0, 500) || null;
    const files = req.files || {};
    const logoFile = Array.isArray(files.logo) ? files.logo[0] : files.logo;
    const bannerFile = Array.isArray(files.banner) ? files.banner[0] : files.banner;
    if (logoFile && logoFile.path) {
      const rel = await processImageToWebP(logoFile.path);
      if (rel && typeof rel === 'object') updates.logo = rel.main;
      else if (rel) updates.logo = rel;
    }
    if (bannerFile && bannerFile.path) {
      const rel = await processImageToWebP(bannerFile.path);
      if (rel && typeof rel === 'object') updates.banner = rel.main;
      else if (rel) updates.banner = rel;
    }
    if (req.body.notify_by_email !== undefined) updates.notify_by_email = (req.body.notify_by_email === true || req.body.notify_by_email === '1');
    if (req.body.notify_by_dashboard !== undefined) updates.notify_by_dashboard = (req.body.notify_by_dashboard === true || req.body.notify_by_dashboard === '1');
    if (Object.keys(updates).length) {
      db.updateVendorProfile(vendorId, updates);
      try { db.addVendorActivityLog(vendorId, 'profile_updated', null); } catch (e) { }
    }
    const vUpdated = db.getVendorById(vendorId);
    res.json({
      id: vUpdated.id,
      email: vUpdated.email,
      name: vUpdated.name,
      phone: vUpdated.phone || '',
      store_name: vUpdated.store_name || null,
      logo: vUpdated.logo || null,
      response_time_hours: vUpdated.response_time_hours != null ? vUpdated.response_time_hours : null,
      anydesk_id: vUpdated.anydesk_id || null,
      notify_by_email: vUpdated.notify_by_email !== false,
      notify_by_dashboard: vUpdated.notify_by_dashboard !== false,
      return_policy: vUpdated.return_policy || null,
      banner: vUpdated.banner || null,
      store_description: vUpdated.store_description || null,
      facebook_url: vUpdated.facebook_url || null,
      instagram_url: vUpdated.instagram_url || null,
      whatsapp_url: vUpdated.whatsapp_url || null,
      website_url: vUpdated.website_url || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vendor/change-password', requireVendor, [
  body('current_password').notEmpty().withMessage('Current password required'),
  body('new_password').isLength({ min: 6 }).withMessage('New password at least 6 characters')
], (req, res) => {
  try {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ error: errs.array().map(e => e.msg).join(' ') });
    const vendorId = req.session.vendorId;
    const v = db.getVendorByIdWithPassword(vendorId);
    if (!v) return res.status(404).json({ error: 'Vendor not found' });
    const match = getBcrypt().compareSync(req.body.current_password, v.password_hash);
    if (!match) return res.status(400).json({ error: 'Current password is incorrect' });
    const hash = getBcrypt().hashSync(req.body.new_password, 10);
    db.updateVendorPassword(vendorId, hash);
    try { db.addVendorActivityLog(vendorId, 'password_changed', null); } catch (e) { }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== Admin: Vendors list & approve/reject ===== */
app.get('/api/vendors', requireAdmin, (req, res) => {
  try {
    res.json(db.getVendors());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vendors/:id/approve', requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    db.updateVendorStatus(id, 'approved');
    auditLog('admin', null, 'vendor_approve', { vendor_id: id }, req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vendors/:id/reject', requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    db.updateVendorStatus(id, 'rejected');
    auditLog('admin', null, 'vendor_reject', { vendor_id: id }, req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== Vendor: My products ===== */
app.get('/api/vendor/products', requireVendorOrApiKey, (req, res) => {
  try {
    res.json(db.getProductsByVendor(req.vendorId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vendor/products', requireVendor, getUpload().array('images', 10), async (req, res) => {
  try {
    const scalar = (v) => (Array.isArray(v) ? (v[0] != null ? v[0] : '') : v);
    const raw = req.body || {};
    const category = scalar(raw.category);
    const subcat = scalar(raw.subcat);
    const key = scalar(raw.key);
    const name = scalar(raw.name);
    const desc = raw.desc;
    const prices = raw.prices;
    const tags = raw.tags;
    const discount = raw.discount;
    const old_price = raw.old_price;
    const offer_until = raw.offer_until;
    if (!category || !key || !name) return res.status(400).json({ error: 'Category, key and name required' });
    let imagePath = 'assets/img/default.png';
    const images = [];
    const files = req.files && Array.isArray(req.files) ? req.files : [];
    for (const file of files) {
      let rel = await processImageToWebP(file.path);
      rel = await maybeUploadImagesToS3(rel);
      if (rel && typeof rel === 'object') {
        images.push(rel.main);
        if (!imagePath || imagePath === 'assets/img/default.png') imagePath = rel.main;
      } else if (rel) {
        images.push(rel);
        if (!imagePath || imagePath === 'assets/img/default.png') imagePath = rel;
      }
    }
    if (images.length === 0) images.push(imagePath);
    let tagsArr = [];
    if (tags != null && tags !== '') {
      if (Array.isArray(tags)) tagsArr = tags;
      else if (typeof tags === 'string') tagsArr = tags.split(/[\s,،]+/).map((t) => t.trim()).filter(Boolean);
    }
    const productData = {
      name,
      desc: desc || '',
      images,
      prices: prices ? JSON.parse(prices) : [],
      tags: tagsArr.length ? tagsArr : null,
      discount: discount != null && discount !== '' ? discount : null,
      oldPrice: old_price != null && old_price !== '' ? old_price : null,
      offer_until: offer_until != null && offer_until !== '' ? offer_until : null
    };
    db.addProduct(req.session.vendorId, category, subcat || '', key, productData);
    invalidateProductsCache();
    try { db.addVendorActivityLog(req.session.vendorId, 'product_added', key + (name ? ':' + name : '')); } catch (e) { }
    res.json({ success: true, message: 'Product added' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vendor/products/update', requireVendor, getUpload().single('image'), async (req, res) => {
  try {
    const { category, subcat, key, name, desc, prices, tags, discount, old_price, offer_until } = req.body;
    const prod = db.getProductByKey(category, subcat || '', key);
    if (!prod) return res.status(404).json({ error: 'Product not found' });
    let tagsArr = null;
    if (tags != null && tags !== '') {
      if (Array.isArray(tags)) tagsArr = tags;
      else if (typeof tags === 'string') tagsArr = tags.split(/[\s,،]+/).map((t) => t.trim()).filter(Boolean);
    }
    if (tagsArr && !tagsArr.length) tagsArr = null;
    const productData = {
      name: name || prod.name,
      desc: desc != null ? desc : prod.desc,
      images: JSON.parse(prod.images_json || '[]'),
      prices: prices ? JSON.parse(prices) : JSON.parse(prod.prices_json || '[]'),
      tags: tagsArr != null ? tagsArr : (prod.tags_json ? JSON.parse(prod.tags_json) : null),
      discount: discount !== undefined && discount !== '' ? discount : (prod.discount ?? null),
      oldPrice: old_price !== undefined && old_price !== '' ? old_price : (prod.old_price ?? null),
      offer_until: offer_until !== undefined && offer_until !== '' ? offer_until : (prod.offer_until ?? null)
    };
    if (req.file) {
      let rel = await processImageToWebP(req.file.path);
      rel = await maybeUploadImagesToS3(rel);
      if (rel && typeof rel === 'object') {
        productData.images.unshift(rel.main);
      } else productData.images.unshift(rel || `assets/img/${req.file.filename}`);
    }
    const ok = db.updateProduct(category, subcat || '', key, productData, req.session.vendorId);
    if (ok) invalidateProductsCache();
    if (!ok) return res.status(403).json({ error: 'Not your product' });
    try { db.addVendorActivityLog(req.session.vendorId, 'product_updated', key); } catch (e) { }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vendor/products/delete', requireVendor, (req, res) => {
  try {
    const { category, subcat, key } = req.body;
    const ok = db.deleteProduct(category, subcat || '', key, req.session.vendorId);
    if (ok) invalidateProductsCache();
    if (!ok) return res.status(403).json({ error: 'Product not found or not yours' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vendor/products/check-slug', requireVendor, (req, res) => {
  try {
    const { category, subcat, slug, exclude_category, exclude_subcat, exclude_slug } = req.query;
    if (!category || !slug) return res.status(400).json({ error: 'category and slug required' });
    const result = db.productSlugTaken(
      category,
      subcat || '',
      slug,
      exclude_category !== undefined ? exclude_category : null,
      exclude_subcat !== undefined ? exclude_subcat : null,
      exclude_slug !== undefined ? exclude_slug : null
    );
    if (!result.taken) return res.json({ taken: false });
    res.json({ taken: true, by_you: result.byVendorId === req.session.vendorId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/vendor/products/status', requireVendor, (req, res) => {
  try {
    const { category, subcat, key, status } = req.body;
    if (!category || !key || (status !== 'archived' && status !== 'approved')) {
      return res.status(400).json({ error: 'category, key and status (archived|approved) required' });
    }
    const ok = db.updateProductStatusByVendor(category, subcat || '', key, req.session.vendorId, status);
    if (ok) invalidateProductsCache();
    if (!ok) return res.status(403).json({ error: 'Product not found or not yours' });
    try { db.addVendorActivityLog(req.session.vendorId, status === 'archived' ? 'product_archived' : 'product_restored', key); } catch (e) { }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== Vendor: My orders ===== */
app.get('/api/vendor/orders', requireVendorOrApiKey, (req, res) => {
  try {
    res.json(db.getOrdersByVendorId(req.vendorId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vendor/reports', requireVendor, (req, res) => {
  try {
    const orders = db.getOrdersByVendorId(req.session.vendorId);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const byDay = {};
    const byProduct = {};
    orders.forEach((o) => {
      const d = o.date ? o.date.slice(0, 10) : null;
      if (!d || new Date(d) < thirtyDaysAgo) return;
      const day = d;
      if (!byDay[day]) byDay[day] = { count: 0, total: 0 };
      byDay[day].count += 1;
      const price = commissionService.parsePriceFromValue(o.value);
      if (!isNaN(price)) byDay[day].total += price;
      const name = (o.product || '').trim() || '—';
      byProduct[name] = (byProduct[name] || 0) + 1;
    });
    const salesByDay = Object.keys(byDay).sort().map((date) => ({ date, count: byDay[date].count, total: Math.round(byDay[date].total) }));
    const topProducts = Object.keys(byProduct).map((product) => ({ product, count: byProduct[product] })).sort((a, b) => b.count - a.count).slice(0, 10);
    res.json({ salesByDay, topProducts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vendor/repeat-customers', requireVendor, (req, res) => {
  try {
    const list = db.getRepeatCustomers(req.session.vendorId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vendor/payments', requireVendor, (req, res) => {
  try {
    const list = db.getVendorPayments(req.session.vendorId);
    const total_paid = list.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const total_owed = db.getVendorCommissionOwed(req.session.vendorId);
    res.json({ payments: list, total_owed, total_paid, balance: Math.max(0, total_owed - total_paid) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* لوحة أداء البائع (Vendor score) */
app.get('/api/vendor/score', requireVendor, (req, res) => {
  try {
    res.json(db.getVendorScore(req.session.vendorId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* اقتراح سعر لمنتج جديد حسب الفئة */
app.get('/api/vendor/price-suggestion', requireVendor, (req, res) => {
  try {
    const category = (req.query.category || '').trim();
    const subcat = (req.query.subcat || '').trim();
    if (!category) return res.status(400).json({ error: 'category required' });
    res.json(db.getPriceSuggestion(category, subcat));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* تقارير تنبؤية: أكثر مشاهدة بدون طلب، فئات يطلبها العملاء ولا توجد عند البائع */
app.get('/api/vendor/insights', requireVendor, (req, res) => {
  try {
    res.json({
      mostViewedNoOrder: db.getVendorMostViewedNoOrder(req.session.vendorId),
      categoriesToAdd: db.getCategoriesOrderedNotVendor(req.session.vendorId)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* استيراد كتالوج من CSV — إنشاء منتجات بحالة pending للمراجعة */
function parseCSVLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if ((c === ',' || c === ';') && !inQuotes) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}
app.post('/api/vendor/import-catalog', requireVendor, getUpload().single('file'), (req, res) => {
  try {
    if (!req.file || !req.file.path) return res.status(400).json({ error: 'No file uploaded' });
    const fs = require('fs');
    const raw = fs.readFileSync(req.file.path, 'utf8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: 'CSV must have header and at least one row' });
    const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/\s/g, '_'));
    const nameIdx = header.indexOf('name') >= 0 ? header.indexOf('name') : 0;
    const descIdx = header.indexOf('desc') >= 0 ? header.indexOf('desc') : header.indexOf('description') >= 0 ? header.indexOf('description') : -1;
    const catIdx = header.indexOf('category') >= 0 ? header.indexOf('category') : -1;
    const subcatIdx = header.indexOf('subcat') >= 0 ? header.indexOf('subcat') : -1;
    const slugIdx = header.indexOf('slug') >= 0 ? header.indexOf('slug') : header.indexOf('key') >= 0 ? header.indexOf('key') : 1;
    const priceIdx = header.indexOf('price') >= 0 ? header.indexOf('price') : -1;
    const labelIdx = header.indexOf('label') >= 0 ? header.indexOf('label') : -1;
    const valueIdx = header.indexOf('value') >= 0 ? header.indexOf('value') : -1;
    const imported = [];
    const vendorId = req.session.vendorId;
    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      const name = (row[nameIdx] || '').trim();
      if (!name) continue;
      const category = (catIdx >= 0 && row[catIdx]) ? String(row[catIdx]).trim() : 'game_cards';
      const subcat = (subcatIdx >= 0 && row[subcatIdx]) ? String(row[subcatIdx]).trim() : '';
      let slug = (slugIdx >= 0 && row[slugIdx]) ? String(row[slugIdx]).trim() : name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\u0600-\u06FF\-_]/g, '').slice(0, 80);
      if (!slug) slug = 'product-' + i;
      const desc = descIdx >= 0 ? (row[descIdx] || '').trim() : '';
      let priceVal = (priceIdx >= 0 && row[priceIdx]) ? String(row[priceIdx]).trim() : (valueIdx >= 0 && row[valueIdx]) ? String(row[valueIdx]).trim() : '';
      const label = (labelIdx >= 0 && row[labelIdx]) ? String(row[labelIdx]).trim() : 'Default';
      const priceNum = parseFloat((priceVal || '').replace(/[^\d.]/g, ''));
      const prices = priceNum > 0 ? [{ label: label || 'Default', value: Math.round(priceNum) + ' DZD' }] : [];
      try {
        let s = slug;
        while (db.productSlugTaken(category, subcat, s).taken) s = slug + '-' + Date.now() + '-' + i;
        db.addProduct(vendorId, category, subcat, s, { name, desc, images: ['/assets/img/default.png'], prices, tags: null, discount: null, oldPrice: null, offer_until: null });
        imported.push({ name, category, subcat, slug: s });
      } catch (e) {
        if (e.message && e.message.indexOf('UNIQUE') >= 0) continue;
        throw e;
      }
    }
    try { db.addVendorActivityLog(vendorId, 'catalog_imported', String(imported.length)); } catch (e) { }
    if (imported.length > 0) invalidateProductsCache();
    res.json({ success: true, imported: imported.length, products: imported });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({ error: err.message });
  }
});

/* تقرير تسوية PDF (فترة أسبوع/شهر) */
app.get('/api/vendor/settlement-report.pdf', requireVendor, (req, res) => {
  try {
    const from = (req.query.from || '').trim().slice(0, 10);
    const to = (req.query.to || '').trim().slice(0, 10);
    const report = db.getVendorSettlementReport(req.session.vendorId, from || null, to || null);
    const doc = new getPDFDocument()({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="key2lix-settlement-' + (from || '') + '-' + (to || '') + '.pdf"');
    doc.pipe(res);
    doc.fontSize(20).fillColor('#7c3aed').text('Key2lix', { align: 'center' });
    doc.fontSize(12).fillColor('#000').text('Settlement Report / تقرير التسوية', { align: 'center' });
    doc.fontSize(10).fillColor('#666').text('Period: ' + (from || '—') + ' to ' + (to || '—'), { align: 'center' });
    doc.moveDown(1.5);
    doc.fontSize(14).fillColor('#000').text('Summary', 50);
    doc.fontSize(10).text('Total sales (completed): ' + report.total_sales + ' DZD');
    doc.text('Commission: ' + report.total_commission + ' DZD');
    doc.text('Net: ' + report.net + ' DZD');
    doc.moveDown(1);
    doc.fontSize(12).fillColor('#000').text('Orders (' + report.orders.length + ')', 50);
    doc.fontSize(9);
    report.orders.slice(0, 50).forEach((o) => {
      doc.fillColor('#333').text((o.date || '').slice(0, 10) + ' — ' + (o.product || '').slice(0, 30) + ' — ' + (o.value || '') + ' — Commission: ' + (o.commission_amount || 0));
    });
    if (report.orders.length > 50) doc.text('... and ' + (report.orders.length - 50) + ' more');
    doc.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

/* ===== API: Orders (save order) — validators from validators/order.js ===== */
function handleOrder(req, res) {
  try {
    if (!req.session || !req.session.clientId) {
      return res.status(401).json({ error: 'Login required to place order' });
    }
    const client = db.getClientById(req.session.clientId);
    if (client && !client.email_verified) {
      return res.status(403).json({ error: 'يجب تأكيد البريد الإلكتروني قبل تقديم الطلب. راجع صناديق البريد ومجلد الرسائل وأدخل رمز التأكيد في صفحة «إعدادات».', code: 'email_verification_required' });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const msg = errors.array().map(e => e.msg).join(' ');
      return res.status(400).json({ error: msg });
    }
    const body = req.body || {};
    const scalar = (v) => (Array.isArray(v) ? (v[0] != null ? String(v[0]).trim() : '') : (v != null ? String(v).trim() : ''));
    const product = scalar(body.product);
    const value = scalar(body.value);
    const name = scalar(body.name);
    const phone = scalar(body.phone);
    const email = scalar(body.email);
    const address = scalar(body.address);
    const orderId = body.orderId != null ? (Array.isArray(body.orderId) ? body.orderId[0] : body.orderId) : null;
    const product_key = scalar(body.product_key);
    const category = scalar(body.category);
    const subcat = scalar(body.subcat) || '';
    const couponCode = scalar(body.coupon_code);
    const shippingAmountRaw = body.shipping_amount != null ? (Array.isArray(body.shipping_amount) ? body.shipping_amount[0] : body.shipping_amount) : null;
    const shippingAmount = (typeof shippingAmountRaw === 'number' && !isNaN(shippingAmountRaw)) ? shippingAmountRaw : (parseFloat(shippingAmountRaw) || 0);
    const giftMode = !!(body.gift_mode === true || body.gift_mode === '1' || (typeof body.gift_mode === 'string' && body.gift_mode.trim().toLowerCase() === 'true'));
    const giftRecipientName = giftMode ? scalar(body.gift_recipient_name) : '';
    const giftMessage = giftMode ? scalar(body.gift_message) : '';
    const giftHidePrice = !!(body.gift_hide_price === true || body.gift_hide_price === '1' || (typeof body.gift_hide_price === 'string' && body.gift_hide_price.trim().toLowerCase() === 'true'));
    let vendor_id = null;
    let commission_amount = null;
    const slug = (product_key || product || '').trim();
    let prod = null;
    if (slug && category) {
      prod = db.getProductByKey(category, subcat, slug);
    }
    if (!prod && slug) {
      prod = db.getProductBySlugOnly(slug);
    }
    let finalValue = (value || '').trim();
    let orderCouponCode = null;
    let orderCouponDiscountAmount = null;
    let orderShippingDiscountAmount = null;
    if (couponCode) {
      const coupon = db.getCouponByCode(couponCode);
      if (!coupon) return res.status(400).json({ error: 'كود القسيمة غير صالح أو منتهي.' });
      if (coupon.active === 0 || coupon.active === false) return res.status(400).json({ error: 'كود القسيمة غير مفعّل.' });
      const now = new Date().toISOString().slice(0, 10);
      if (coupon.valid_from && coupon.valid_from > now) return res.status(400).json({ error: 'كود القسيمة غير نشط بعد.' });
      if (coupon.valid_until && coupon.valid_until < now) return res.status(400).json({ error: 'كود القسيمة منتهي الصلاحية.' });
      if (coupon.usage_limit != null && (coupon.usage_count || 0) >= coupon.usage_limit) return res.status(400).json({ error: 'تم استهلاك عدد استخدامات هذا الكود.' });
      const amount = commissionService.parsePriceFromValue(value);
      if (coupon.min_order_amount != null && !isNaN(Number(coupon.min_order_amount)) && amount < Number(coupon.min_order_amount)) return res.status(400).json({ error: 'المبلغ الأدنى للطلب لتفعيل هذا الكود هو ' + Math.round(Number(coupon.min_order_amount)) + ' د.ج.' });
      if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'المبلغ غير صالح لتفعيل القسيمة.' });
      if (coupon.first_order_only) {
        const clientId = req.session && req.session.clientId ? req.session.clientId : null;
        const orderCount = db.getOrderCountByClientId(clientId);
        if (orderCount > 0) return res.status(400).json({ error: 'هذا الكود صالح للطلبات الأولى فقط.' });
      }
      if (coupon.allowed_emails && String(coupon.allowed_emails).trim()) {
        const emails = String(coupon.allowed_emails).split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
        const orderEmail = (email || '').trim().toLowerCase();
        if (!orderEmail || !emails.includes(orderEmail)) return res.status(400).json({ error: 'هذا الكود غير صالح لهذا البريد.' });
      }
      if (coupon.product_category != null && String(coupon.product_category).trim() !== '') {
        if ((category || '').trim() !== String(coupon.product_category).trim()) return res.status(400).json({ error: 'هذا الكود غير صالح لهذا المنتج أو الفئة.' });
      }
      if (coupon.product_subcat != null && String(coupon.product_subcat).trim() !== '') {
        if ((subcat || '').trim() !== String(coupon.product_subcat).trim()) return res.status(400).json({ error: 'هذا الكود غير صالح لهذا المنتج أو الفئة.' });
      }
      if (coupon.product_slug != null && String(coupon.product_slug).trim() !== '') {
        if ((slug || '').trim() !== String(coupon.product_slug).trim()) return res.status(400).json({ error: 'هذا الكود غير صالح لهذا المنتج أو الفئة.' });
      }
      const isFreeShipping = coupon.free_shipping === 1 || coupon.free_shipping === true;
      if (isFreeShipping) {
        orderCouponCode = coupon.code;
        orderCouponDiscountAmount = 0;
        orderShippingDiscountAmount = Math.max(0, shippingAmount);
        db.incrementCouponUsage(coupon.code);
      } else {
        const discount = coupon.type === 'percent'
          ? Math.round(amount * Math.min(100, Math.max(0, Number(coupon.value))) / 100)
          : Math.min(amount, Math.max(0, Number(coupon.value)));
        const finalAmount = Math.max(0, amount - discount);
        finalValue = String(Math.round(finalAmount)) + (String(value || '').indexOf('DZD') >= 0 ? ' DZD' : '');
        orderCouponCode = coupon.code;
        orderCouponDiscountAmount = discount;
        db.incrementCouponUsage(coupon.code);
      }
    }
    if (prod) {
      if (prod.status === 'pending') return res.status(400).json({ error: 'Product not available for order yet' });
      vendor_id = prod.vendor_id != null ? prod.vendor_id : null;
      const finalPriceNum = commissionService.parsePriceFromValue(finalValue);
      commission_amount = (!isNaN(finalPriceNum) && finalPriceNum > 0) ? commissionService.computeCommissionFromFinal(finalPriceNum) : 0;
    }
    let giftToken = null;
    if (giftMode) {
      giftToken = crypto.randomBytes(20).toString('hex');
    }
    const order = {
      id: orderId || 'ORD-' + Date.now(),
      date: new Date().toISOString(),
      product: (product || '').trim(),
      value: finalValue,
      coupon_code: orderCouponCode,
      coupon_discount_amount: orderCouponDiscountAmount,
      shipping_amount: shippingAmount > 0 ? shippingAmount : null,
      shipping_discount_amount: orderShippingDiscountAmount,
      name: String(name).trim(),
      phone: String(phone).trim(),
      email: (email || '').trim(),
      address: (address || '').trim(),
      vendor_id,
      commission_amount,
      client_id: req.session && req.session.clientId ? req.session.clientId : null,
      product_category: category || null,
      product_subcat: subcat || null,
      product_slug: (slug || '').trim() || null,
      gift_mode: giftMode ? 1 : 0,
      gift_recipient_name: giftRecipientName || null,
      gift_message: giftMessage || null,
      gift_hide_price: giftHidePrice ? 1 : 0,
      gift_token: giftToken
    };
    db.addOrder(order);
    if (order.vendor_id != null) {
      try {
        db.addNotification('vendor', order.vendor_id, 'new_order', 'طلب جديد #' + order.id, '/vendor');
      } catch (notifErr) {
        console.error('[order] addNotification vendor failed:', notifErr.message);
      }
      if (pushService.isConfigured()) {
        try {
          const subs = db.getPushSubscriptionsByUser('vendor', order.vendor_id);
          const payload = { title: 'طلب جديد', body: 'طلب #' + order.id + ' — ' + (order.product || '').slice(0, 40), link: '/vendor' };
          subs.forEach((s) => pushService.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload).catch(() => { }));
        } catch (e) { }
      }
      if (emailService.isConfigured()) {
        const vendor = db.getVendorById(order.vendor_id);
        if (vendor && vendor.email && vendor.notify_by_email) {
          if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) {
            queue.addEmailJob({ type: 'notifyVendorNewOrder', to: vendor.email, order }).catch((e) => console.error('[order] queue notifyVendorNewOrder failed:', e && e.message));
          } else {
            emailService.notifyVendorNewOrder(vendor.email, order).catch((mailErr) => console.error('[order] notifyVendorNewOrder failed:', mailErr && mailErr.message));
          }
        }
      }
      try {
        const vendor = db.getVendorById(order.vendor_id);
        if (vendor && vendor.webhook_url) {
          const webhook = require('./lib/webhook');
          const secret = db.getVendorWebhookSecret && db.getVendorWebhookSecret(order.vendor_id);
          webhook.sendOrderWebhook(vendor.webhook_url, secret, { event: 'order.created', order_id: order.id, status: order.status || 'pending', order, created_at: order.date });
        }
      } catch (e) { }
    }
    const baseUrl = (process.env.BASE_URL || process.env.SITE_URL || (req.protocol + '://' + (req.get('host') || ''))).replace(/\/$/, '');
    const response = { success: true, orderId: order.id };
    if (giftMode && giftToken) response.gift_redemption_url = baseUrl + '/gift?token=' + encodeURIComponent(giftToken);
    res.json(response);
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({ error: err.message });
  }
}
app.post('/api/order', apiOrderPostLimit, orderValidators, handleOrder);
app.post('/api/v1/order', apiOrderPostLimit, orderValidators, handleOrder);

/* ===== API: Contact (save message) — validators from validators/contact.js ===== */
function handleContact(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const msg = errors.array().map(e => e.msg).join(' ');
      return res.status(400).json({ error: msg });
    }
    const { name, email, subject, message } = req.body || {};
    db.addContact({
      date: new Date().toISOString(),
      name: String(name).trim(),
      email: (email || '').trim(),
      subject: (subject || '').trim(),
      message: String(message).trim()
    });
    res.json({ success: true });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({ error: err.message });
  }
}
app.post('/api/contact', contactValidators, handleContact);
app.post('/api/v1/contact', contactValidators, handleContact);

/* P25: النشرة البريدية — اشتراك وتأكيد مزود */
app.post('/api/newsletter', (req, res) => {
  try {
    const email = (req.body && req.body.email) ? String(req.body.email).trim().toLowerCase() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
    const token = crypto.randomBytes(32).toString('hex');
    const result = db.addNewsletterSubscriber(email, token);
    if (result.already) return res.json({ success: true, message: 'Already subscribed' });
    const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '') || (req.protocol + '://' + req.get('host'));
    const confirmUrl = baseUrl + '/api/newsletter/confirm?token=' + encodeURIComponent(token);
    if (emailService.isConfigured() && typeof emailService.sendMail === 'function') {
      const subject = '[Key2lix] Confirm your subscription';
      const text = 'Click to confirm: ' + confirmUrl;
      const html = '<p>Click to confirm your subscription: <a href="' + confirmUrl + '">Confirm</a></p>';
      if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) queue.addEmailJob({ type: 'sendMail', to: email, subject, text, html }).catch(() => { });
      else emailService.sendMail(email, subject, text, html).catch(() => { });
    }
    res.json({ success: true, message: 'Check your email to confirm' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/newsletter/confirm', (req, res) => {
  try {
    const token = (req.query && req.query.token) ? String(req.query.token).trim() : '';
    if (!token) return res.redirect('/');
    const ok = db.confirmNewsletterByToken(token);
    if (req.headers.accept && req.headers.accept.includes('application/json')) return res.json({ success: !!ok });
    return res.redirect(ok ? '/?newsletter=confirmed' : '/');
  } catch (err) {
    res.redirect('/');
  }
});

/* ===== Order: participant only (client or vendor for this order) ===== */
function canAccessOrder(req, order) {
  if (!order) return false;
  if (req.session && req.session.clientId && order.client_id === req.session.clientId) return true;
  if (req.session && req.session.vendorId && order.vendor_id === req.session.vendorId) return true;
  return false;
}
function canAccessOrderOrAdmin(req, order) {
  if (!order) return false;
  if (req.session && req.session.admin) return true;
  return canAccessOrder(req, order);
}

/* Public: استلام الهدية — عرض الطلب بواسطة رمز الهدية (بدون تسجيل دخول) */
app.get('/api/gift/:token', (req, res) => {
  try {
    const order = db.getOrderByGiftToken(req.params.token);
    if (!order) return res.status(404).json({ error: 'Gift not found or link expired' });
    res.json({ order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/order/:orderId', (req, res) => {
  try {
    const order = db.getOrderById(req.params.orderId);
    if (!order || !canAccessOrderOrAdmin(req, order)) return res.status(403).json({ error: 'Forbidden' });
    const out = { ...order };
    if (req.session && req.session.admin) {
      out.my_role = 'admin';
    } else if (req.session && req.session.clientId && order.client_id === req.session.clientId) {
      out.my_role = 'client';
    } else if (req.session && req.session.vendorId && order.vendor_id === req.session.vendorId) {
      out.my_role = 'vendor';
    }
    if (order.vendor_id) {
      const vendor = db.getVendorById(order.vendor_id);
      if (vendor) {
        const displayName = (vendor.store_name && String(vendor.store_name).trim()) ? String(vendor.store_name).trim() : (vendor.name || '');
        out.vendor_info = {
          name: displayName,
          logo: vendor.logo || null,
          response_time_hours: vendor.response_time_hours != null ? vendor.response_time_hours : null
        };
        if (out.my_role === 'vendor' && vendor.anydesk_id) {
          out.vendor_info.anydesk_id = vendor.anydesk_id;
        }
      }
    }
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/order/:orderId/invoice.pdf', (req, res) => {
  try {
    const order = db.getOrderById(req.params.orderId);
    if (!order || !canAccessOrderOrAdmin(req, order)) return res.status(403).json({ error: 'Forbidden' });
    const vendor = order.vendor_id ? db.getVendorById(order.vendor_id) : null;
    const vendorName = vendor ? ((vendor.store_name && String(vendor.store_name).trim()) ? String(vendor.store_name).trim() : vendor.name) : 'Key2lix';
    const doc = new getPDFDocument()({ size: 'A4', margin: 50 });
    res.setHeader('Content-Disposition', 'attachment; filename="invoice-' + (order.id || 'order') + '.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);
    doc.fontSize(20).text('Key2lix – Invoice / إيصال', { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).text('Order ID: ' + (order.id || '—'));
    doc.text('Date: ' + (order.date || '—'));
    doc.text('Product: ' + (order.product || '—'));
    doc.text('Value: ' + (order.value || '—'));
    doc.moveDown();
    doc.text('Client: ' + (order.name || '—') + ', ' + (order.phone || '') + (order.email ? ', ' + order.email : ''));
    doc.text('Vendor: ' + vendorName);
    doc.end();
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/order/:orderId/messages', (req, res) => {
  try {
    const order = db.getOrderById(req.params.orderId);
    if (!order || !canAccessOrderOrAdmin(req, order)) return res.status(403).json({ error: 'Forbidden' });
    const list = db.getOrderMessages(req.params.orderId);
    const withNames = list.map((m) => {
      if (m.from_role === 'admin') return { ...m, from_name: 'Support' };
      const name = m.from_role === 'client' ? (db.getClientById(m.from_id) || {}).name : (db.getVendorById(m.from_id) || {}).name;
      return { ...m, from_name: name || (m.from_role === 'vendor' ? 'البائع' : 'المشتري') };
    });
    res.json(withNames);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/order/:orderId/messages', (req, res) => {
  try {
    const order = db.getOrderById(req.params.orderId);
    if (!order || !canAccessOrderOrAdmin(req, order)) return res.status(403).json({ error: 'Forbidden' });
    const message = (req.body && req.body.message) ? String(req.body.message).trim() : '';
    if (!message) return res.status(400).json({ error: 'Message required' });
    if (message.length > 2000) return res.status(400).json({ error: 'Message too long' });
    let fromRole, fromId;
    if (req.session && req.session.admin) {
      fromRole = 'admin';
      fromId = 0;
    } else if (req.session && req.session.clientId && order.client_id === req.session.clientId) {
      fromRole = 'client';
      fromId = req.session.clientId;
    } else if (req.session && req.session.vendorId && order.vendor_id === req.session.vendorId) {
      fromRole = 'vendor';
      fromId = req.session.vendorId;
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const created = db.addOrderMessage(req.params.orderId, fromRole, fromId, message);
    const chatLink = '/order-chat?order=' + encodeURIComponent(req.params.orderId);
    if (fromRole === 'vendor' && order.client_id) {
      const client = db.getClientById(order.client_id);
      if (client && client.notify_by_dashboard !== false) {
        try { db.addNotification('client', order.client_id, 'new_reply', 'رد جديد على طلب #' + order.id, chatLink); } catch (e) { }
        if (pushService.isConfigured()) {
          const subs = db.getPushSubscriptionsByUser('client', order.client_id);
          const payload = { title: 'رد جديد', body: 'رد على طلب #' + order.id, link: chatLink };
          subs.forEach((s) => pushService.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload).catch(() => { }));
        }
      }
      if (emailService.isConfigured() && client && client.email && client.notify_by_email) {
        const vendor = db.getVendorById(fromId);
        const senderLabel = vendor ? ((vendor.store_name && String(vendor.store_name).trim()) ? String(vendor.store_name).trim() : (vendor.name || vendor.email || 'البائع')) : 'البائع';
        const to = normalizeClientEmail(client.email);
        if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) queue.addEmailJob({ type: 'notifyClientNewReply', to, orderId: order.id, productName: order.product, senderLabel }).catch(() => { });
        else emailService.notifyClientNewReply(to, order.id, order.product, senderLabel).catch(() => { });
      }
    }
    if (fromRole === 'client' && order.vendor_id) {
      try { db.addNotification('vendor', order.vendor_id, 'new_reply', 'رد جديد على طلب #' + order.id, chatLink); } catch (e) { }
      if (pushService.isConfigured()) {
        try {
          const subs = db.getPushSubscriptionsByUser('vendor', order.vendor_id);
          const payload = { title: 'رد جديد على الطلب', body: 'طلب #' + order.id, link: chatLink };
          subs.forEach((s) => pushService.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload).catch(() => { }));
        } catch (e) { }
      }
    }
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/order/:orderId/complaint', express.json(), (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً.' });
    const order = db.getOrderById(req.params.orderId);
    if (!order || order.client_id !== req.session.clientId) return res.status(403).json({ error: 'لا يمكنك التبليغ عن هذا الطلب.' });
    const type = (req.body && req.body.type) ? String(req.body.type).trim().toLowerCase() : 'paid_no_delivery';
    const message = (req.body && req.body.message) ? String(req.body.message).trim() : '';
    if (!message || message.length < 10) return res.status(400).json({ error: 'يرجى إدخال تفاصيل المشكلة (10 أحرف على الأقل).' });
    const complaint = db.addOrderComplaint(req.params.orderId, req.session.clientId, type, message);
    if (!complaint) return res.status(400).json({ error: 'فشل تسجيل الشكوى.' });
    const typeLabels = { paid_no_delivery: 'دفعت ولم أستلم المنتج', wrong_product: 'منتج خاطئ', quality_issue: 'جودة المنتج', delay: 'تأخر في التوصيل', other: 'أخرى' };
    const chatMsg = '[شكوى / تبليغ] ' + (typeLabels[type] || type) + ': ' + message;
    db.addOrderMessage(req.params.orderId, 'client', req.session.clientId, chatMsg);
    const chatLink = '/order-chat?order=' + encodeURIComponent(req.params.orderId);
    if (order.vendor_id) {
      try { db.addNotification('vendor', order.vendor_id, 'complaint', 'شكوى جديدة على طلب #' + order.id, chatLink); } catch (e) { }
      if (pushService.isConfigured()) {
        try {
          const subs = db.getPushSubscriptionsByUser('vendor', order.vendor_id);
          const payload = { title: 'شكوى جديدة', body: 'شكوى على طلب #' + order.id, link: chatLink };
          subs.forEach((s) => pushService.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload).catch(() => { }));
        } catch (e) { }
      }
    }
    res.status(201).json(complaint);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/client/complaints', (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً.' });
    const list = db.getClientComplaints(req.session.clientId);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/vendor/orders/:orderId/estimated-delivery', requireVendor, (req, res) => {
  try {
    const order = db.getOrderById(req.params.orderId);
    if (!order || order.vendor_id !== req.session.vendorId) return res.status(403).json({ error: 'Forbidden' });
    const estimated_delivery = (req.body && req.body.estimated_delivery != null) ? String(req.body.estimated_delivery).trim() || null : null;
    db.updateOrderEstimatedDelivery(req.params.orderId, estimated_delivery);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/vendor/orders/:orderId/status', requireVendor, (req, res) => {
  try {
    const order = db.getOrderById(req.params.orderId);
    if (!order || order.vendor_id !== req.session.vendorId) return res.status(403).json({ error: 'Forbidden' });
    const status = (req.body && req.body.status) ? String(req.body.status).toLowerCase() : '';
    if (status === 'preparing') {
      db.updateOrderStatus(req.params.orderId, 'preparing', null);
      auditLog('vendor', req.session.vendorId, 'order_status_change', { order_id: req.params.orderId, status: 'preparing' }, req);
      try {
        const v = db.getVendorById(order.vendor_id);
        if (v && v.webhook_url) {
          const webhook = require('./lib/webhook');
          const secret = db.getVendorWebhookSecret && db.getVendorWebhookSecret(order.vendor_id);
          webhook.sendOrderWebhook(v.webhook_url, secret, { event: 'order.status_changed', order_id: req.params.orderId, status: 'preparing', created_at: new Date().toISOString() });
        }
      } catch (e) { }
      return res.json({ success: true });
    }
    if (status === 'completed') {
      if (order.status === 'completed') return res.json({ success: true, already: true });
      db.updateOrderStatus(req.params.orderId, 'completed', new Date().toISOString());
      auditLog('vendor', req.session.vendorId, 'order_status_change', { order_id: req.params.orderId, status: 'completed' }, req);
      try {
        const v = db.getVendorById(order.vendor_id);
        if (v && v.webhook_url) {
          const webhook = require('./lib/webhook');
          const secret = db.getVendorWebhookSecret && db.getVendorWebhookSecret(order.vendor_id);
          webhook.sendOrderWebhook(v.webhook_url, secret, { event: 'order.status_changed', order_id: req.params.orderId, status: 'completed', created_at: new Date().toISOString() });
        }
      } catch (e) { }
      if (order.client_id) {
        const client = db.getClientById(order.client_id);
        if (client && client.notify_by_dashboard !== false) {
          try { db.addNotification('client', order.client_id, 'order_status', 'تم إكمال طلبك #' + order.id, '/client-account'); } catch (e) { }
          if (pushService.isConfigured()) {
            const subs = db.getPushSubscriptionsByUser('client', order.client_id);
            const payload = { title: 'تم إكمال طلبك', body: 'طلب #' + order.id + ' مكتمل', link: '/client-account' };
            subs.forEach((s) => pushService.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload).catch(() => { }));
          }
        }
        if (emailService.isConfigured() && client && client.email && client.notify_by_email) {
          const to = normalizeClientEmail(client.email);
          if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) queue.addEmailJob({ type: 'notifyClientOrderStatusChanged', to, orderId: order.id, status: 'completed', productName: order.product }).catch(() => { });
          else emailService.notifyClientOrderStatusChanged(to, order.id, 'completed', order.product).catch(() => { });
        }
      }
      return res.json({ success: true });
    }
    return res.status(400).json({ error: 'Invalid status. Use preparing or completed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/vendor/orders/:orderId/complete', requireVendor, (req, res) => {
  try {
    const order = db.getOrderById(req.params.orderId);
    if (!order || order.vendor_id !== req.session.vendorId) return res.status(403).json({ error: 'Forbidden' });
    if (order.status === 'completed') return res.json({ success: true, already: true });
    db.updateOrderStatus(req.params.orderId, 'completed', new Date().toISOString());
    auditLog('vendor', req.session.vendorId, 'order_status_change', { order_id: req.params.orderId, status: 'completed' }, req);
    try {
      const v = db.getVendorById(order.vendor_id);
      if (v && v.webhook_url) {
        const webhook = require('./lib/webhook');
        const secret = db.getVendorWebhookSecret && db.getVendorWebhookSecret(order.vendor_id);
        webhook.sendOrderWebhook(v.webhook_url, secret, { event: 'order.status_changed', order_id: req.params.orderId, status: 'completed', created_at: new Date().toISOString() });
      }
    } catch (e) { }
    if (order.client_id) {
      const client = db.getClientById(order.client_id);
      if (client && client.notify_by_dashboard !== false) {
        try { db.addNotification('client', order.client_id, 'order_status', 'تم إكمال طلبك #' + order.id, '/client-account'); } catch (e) { }
        if (pushService.isConfigured()) {
          const subs = db.getPushSubscriptionsByUser('client', order.client_id);
          const payload = { title: 'تم إكمال طلبك', body: 'طلب #' + order.id + ' مكتمل', link: '/client-account' };
          subs.forEach((s) => pushService.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload).catch(() => { }));
        }
      }
      if (emailService.isConfigured() && client && client.email && client.notify_by_email) {
        const to = normalizeClientEmail(client.email);
        if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) queue.addEmailJob({ type: 'notifyClientOrderStatusChanged', to, orderId: order.id, status: 'completed', productName: order.product }).catch(() => { });
        else emailService.notifyClientOrderStatusChanged(to, order.id, 'completed', order.product).catch(() => { });
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== Protected page routes (after static; use middleware + no-cache) ===== */
app.get('/vendor', requireVendor, sendPageNoCache('vendor.html'));
app.get('/admin', requireAdmin, sendPageNoCache('admin.html'));
app.get('/admin.html', requireAdmin, sendPageNoCache('admin.html'));

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, CLIENT_ROOT, 'pages/404.html'));
});

/* ===== Scheduled reports (node-cron) ===== */
function runScheduledReport() {
  try {
    const schedule = (db.getSetting('report_schedule') || 'weekly').trim();
    const email = (db.getSetting('report_email') || '').trim() || process.env.ADMIN_EMAIL;
    if (!email || !email.includes('@')) return;
    if (!emailService || !emailService.isConfigured || !emailService.isConfigured()) return;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const from = schedule === 'monthly' ? monthAgo.toISOString().slice(0, 10) : weekAgo.toISOString().slice(0, 10);
    const to = now.toISOString().slice(0, 10);
    const orders = db.getOrdersFiltered({ date_from: from, date_to: to });
    const completed = orders.filter((o) => o.status === 'completed');
    const totalCommission = completed.reduce((s, o) => s + (Number(o.commission_amount) || 0), 0);
    const subject = '[Key2lix] تقرير دوري — ' + (schedule === 'monthly' ? 'شهري' : 'أسبوعي');
    const text = 'تقرير Key2lix\n\nالفترة: ' + from + ' إلى ' + to + '\nعدد الطلبات: ' + orders.length + '\nطلبات مكتملة: ' + completed.length + '\nإجمالي العمولة: ' + totalCommission.toFixed(0) + ' DZD\n\n— Key2lix Admin';
    emailService.sendMail(email, subject, text).catch((e) => logger.warn({ err: e.message }, 'Scheduled report email failed'));
    const next = new Date(now);
    if (schedule === 'monthly') {
      next.setMonth(next.getMonth() + 1);
      next.setDate(1);
      next.setHours(9, 0, 0, 0);
    } else {
      next.setDate(next.getDate() + 7);
      next.setHours(9, 0, 0, 0);
    }
    db.setSetting('report_next_run', next.toISOString());
  } catch (e) {
    logger.warn({ err: e.message }, 'Scheduled report error');
  }
}

let scheduledReportInterval = null;
function startScheduledReports() {
  if (scheduledReportInterval) return;
  try {
    const cron = require('node-cron');
    cron.schedule('0 9 * * 0', () => { if ((db.getSetting('report_schedule') || '').trim() === 'weekly') runScheduledReport(); }, { timezone: 'Africa/Algiers' });
    cron.schedule('0 9 1 * *', () => { if ((db.getSetting('report_schedule') || '').trim() === 'monthly') runScheduledReport(); }, { timezone: 'Africa/Algiers' });
    logger.info('Scheduled reports cron started');
  } catch (e) {
    scheduledReportInterval = setInterval(() => {
      const nextRun = db.getSetting('report_next_run');
      if (!nextRun) return;
      if (new Date(nextRun).getTime() <= Date.now()) runScheduledReport();
    }, 60 * 60 * 1000);
    logger.info('Scheduled reports using setInterval fallback');
  }
}

/* ===== Start Server (أو تصدير app للاختبارات) ===== */
if (require.main === module) {
  const HOST = process.env.HOST || '0.0.0.0';
  const server = app.listen(PORT, HOST, () => {
    logger.info({ port: PORT, host: HOST }, 'Server running');
    startScheduledReports();
    if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) {
      try { queue.startWorkers(); } catch (e) { logger.warn({ err: e.message }, 'Queue workers failed to start'); }
    }
    if (!isProduction && HOST === '0.0.0.0') {
      let localIp = '';
      try {
        const ifaces = os.networkInterfaces();
        for (const n of Object.values(ifaces)) {
          for (const i of n || []) {
            if (i.family === 'IPv4' && !i.internal) { localIp = i.address; break; }
          }
          if (localIp) break;
        }
      } catch (_) { }
      console.log('افتح في المتصفح: http://localhost:' + PORT + ' أو http://127.0.0.1:' + PORT);
      if (localIp) console.log('من الهاتف (نفس الشبكة): http://' + localIp + ':' + PORT);
    }
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error({ port: PORT }, 'Port already in use. Stop the other process using this port, or set PORT to another value (e.g. 3002) in .env');
      console.error('\nالمنفذ ' + PORT + ' مستخدم بالفعل. أوقف العملية التي تستخدمه أو غيّر PORT في .env (مثلاً 3002).\n');
    } else {
      logger.error({ err: err.message }, 'Server error');
    }
    process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    logger.error({ err: err.message }, 'Uncaught exception');
  });
  process.on('unhandledRejection', (reason, p) => {
    logger.error({ reason }, 'Unhandled rejection');
  });
}
module.exports = app;