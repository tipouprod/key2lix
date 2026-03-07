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
  const dbPath = db.getDbPath ? db.getDbPath() : path.join(__dirname, 'client', 'data', 'keylix.db');
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

/* استجابة فورية للموازن والـ health check (قبل الجلسة وقاعدة البيانات) — استخدمها في Railway/Render كـ Health Check Path */
app.get('/ping', (req, res) => { res.status(200).set('Content-Type', 'text/plain').send('ok'); });
/* تشخيص: هل الـ API يرد بـ JSON؟ افتح هذا الرابط في المتصفح. */
app.get('/api/ok', (req, res) => { res.json({ ok: true, ts: Date.now() }); });

/* طلبات سريعة قبل الجلسة — لتقليل 499 و timeout على Railway */
app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nAllow: /\n'));
app.get('/favicon.ico', (req, res) => res.redirect(301, '/assets/img/favicon.png'));
/* GET / قبل الجلسة — الصفحة الرئيسية لا تحتاج جلسة للوثائق الأولية، الـ API يستخدم الكوكي */
app.get('/', (req, res, next) => {
  const host = (req.get('host') || '').toLowerCase();
  if (host.indexOf('ngrok') !== -1) return next();
  res.sendFile(path.join(__dirname, CLIENT_ROOT, 'pages', 'index.html'));
});

/* إرجاع 404 فوراً لمسارات بوتات معروفة (WordPress، PHP) لتوفير الموارد */
app.use((req, res, next) => {
  const p = (req.path || req.url || '').split('?')[0] || '';
  if (p === '/index.php' || p.indexOf('/wp-admin') === 0 || p.indexOf('/wordpress/') === 0) {
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

/* ===== Health check (للموازن والمراقبة — بدون rate limit) ===== */
app.get('/health', (req, res) => {
  try {
    db.getDb().prepare('SELECT 1').get();
    res.json({ status: 'ok', db: 'connected', uptime: Math.floor(process.uptime()) });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

/* نسخة التطبيق — عند تغييرها يُعاد تحميل الصفحة تلقائياً لتفعيل التحديثات بعد إعادة الرفع (بدون حذف cookies يدوياً) */
const APP_VERSION = process.env.BUILD_VERSION || process.env.APP_VERSION || ('b' + Date.now().toString(36));
app.get('/api/version', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json({ version: APP_VERSION });
});

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
    try { db.addAdminLoginLog && db.addAdminLoginLog(false, getClientIP(req), (req.body && req.body.username) ? '[provided]' : null, { reason: 'rate_limit' }); } catch (e) { }
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
      try { db.addAdminLoginLog && db.addAdminLoginLog(true, ip, username, { step: '2fa_pending' }); } catch (e) { }
      return res.json({ requires2FA: true, tempToken });
    }
    loginAttempts.delete(ip);
    req.session.admin = true;
    req.session.adminRole = 'admin';
    adminSecurity.setAdminSessionBinding(req);
    try {
      const recent = (db.getAdminLoginLog && db.getAdminLoginLog(20)) || [];
      const knownIps = recent.filter((e) => e.success && e.ip).map((e) => e.ip);
      db.addAdminLoginLog && db.addAdminLoginLog(true, ip, username, {});
      if (knownIps.indexOf(ip) === -1) auditLog('admin', null, 'admin_login_new_device', { ip, username }, req);
    } catch (e) { }
    return res.json({ success: true, role: 'admin' });
  }
  const subAdmin = db.getAdminSubUserByEmail && db.getAdminSubUserByEmail(username);
  if (subAdmin && getBcrypt().compareSync(password, subAdmin.password_hash)) {
    loginAttempts.delete(ip);
    req.session.admin = true;
    req.session.adminRole = subAdmin.role || 'order_supervisor';
    req.session.adminSubUserId = subAdmin.id;
    adminSecurity.setAdminSessionBinding(req);
    try {
      const recent = (db.getAdminLoginLog && db.getAdminLoginLog(20)) || [];
      const knownIps = recent.filter((e) => e.success && e.ip).map((e) => e.ip);
      db.addAdminLoginLog && db.addAdminLoginLog(true, ip, username, { role: subAdmin.role });
      if (knownIps.indexOf(ip) === -1) auditLog('admin', req.session.adminSubUserId, 'admin_login_new_device', { ip, username }, req);
    } catch (e) { }
    return res.json({ success: true, role: subAdmin.role });
  }
  rate.rec.count++;
  try { db.addAdminLoginLog && db.addAdminLoginLog(false, ip, username ? '[provided]' : null, { attempts_left: LOGIN_MAX_ATTEMPTS - rate.rec.count }); } catch (e) { }
  logger.warn({ type: 'admin_login_failed', ip, username: username ? '[provided]' : '[missing]' }, 'Failed admin login attempt');
  if (rate.rec.count >= LOGIN_MAX_ATTEMPTS) {
    rate.rec.resetAt = Date.now() + LOGIN_LOCK_MS;
    return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
  }
  const left = LOGIN_MAX_ATTEMPTS - rate.rec.count;
  res.status(401).json({ error: 'Invalid credentials. ' + left + ' attempts left.' });
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

app.get('/api/admin/csrf-token', requireAdmin, (req, res) => {
  const token = adminSecurity.getCsrfToken(req);
  res.json({ csrfToken: token || '' });
});

/* ===== API: Client (عميل) — تسجيل، دخول، خروج ===== */
const clientLoginAttempts = new Map();
const CLIENT_LOGIN_MAX = 5;
const CLIENT_LOCK_MS = 15 * 60 * 1000;

const PENDING_VERIFY_EXPIRY_MS = 15 * 60 * 1000;

app.post('/api/client/register', async (req, res) => {
  try {
    const { email, password, name, phone, address, code } = req.body || {};
    if (code != null && String(code).trim() !== '') {
      const pending = req.session && req.session.pendingClient;
      if (!pending) return res.status(400).json({ error: 'انتهت الجلسة. يرجى إعادة تعبئة النموذج وإرسال رمز التحقق من جديد.' });
      const sentAt = pending.sentAt ? new Date(pending.sentAt).getTime() : 0;
      if (Date.now() - sentAt > PENDING_VERIFY_EXPIRY_MS) {
        delete req.session.pendingClient;
        return res.status(400).json({ error: 'انتهت صلاحية الرمز (15 دقيقة). يرجى طلب رمز جديد.' });
      }
      const trimmed = String(code).trim();
      if (trimmed.length < 4 || trimmed !== pending.verifyCode) {
        return res.status(400).json({ error: 'رمز التحقق غير صحيح. تحقق من الرمز وأعد المحاولة.' });
      }
      const clientId = pending.clientId;
      if (!clientId) {
        delete req.session.pendingClient;
        return res.status(400).json({ error: 'جلسة تسجيل غير صالحة. يرجى إعادة التسجيل من البداية.' });
      }
      if (db.markClientEmailVerified) db.markClientEmailVerified(clientId);
      else if (db.getDb && db.getDb().prepare) db.getDb().prepare('UPDATE clients SET email_verified = 1 WHERE id = ?').run(clientId);
      try { db.insertClientActivity(clientId, 'registered'); } catch (e) { }
      try { db.insertClientActivity(clientId, 'email_verified'); } catch (e) { }
      delete req.session.pendingClient;
      res.json({ success: true, message: 'تم إنشاء حسابك بنجاح. يمكنك تسجيل الدخول الآن.' });
      return;
    }
    if (!email || !password) return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور.' });
    const phoneTrim = (phone != null && typeof phone === 'string') ? phone.trim() : '';
    const addressTrim = (address != null && typeof address === 'string') ? address.trim() : '';
    if (!phoneTrim) return res.status(400).json({ error: 'يرجى إدخال رقم الهاتف.' });
    if (!addressTrim) return res.status(400).json({ error: 'يرجى إدخال العنوان.' });
    const normalized = String(email).trim().toLowerCase();
    const nameTrim = (name != null && typeof name === 'string') ? String(name).trim() : '';
    const hash = getBcrypt().hashSync(password, 10);
    let clientId;
    const existing = db.getClientByEmail(normalized);
    if (existing) {
      if (existing.email_verified) return res.status(400).json({ error: 'هذا البريد الإلكتروني مسجّل مسبقاً. جرّب تسجيل الدخول أو استعادة كلمة المرور.' });
      clientId = existing.id;
      if (db.updateClientPassword) db.updateClientPassword(clientId, hash);
      if (db.updateClientProfile) db.updateClientProfile(clientId, { name: nameTrim, phone: phoneTrim, address: addressTrim });
    } else {
      clientId = db.createClient(normalized, hash, nameTrim, phoneTrim, addressTrim);
    }
    const verifyCode = String(crypto.randomInt(100000, 999999));
    req.session.pendingClient = {
      clientId,
      email: normalized,
      password_hash: hash,
      name: nameTrim,
      phone: phoneTrim,
      address: addressTrim,
      verifyCode,
      sentAt: new Date().toISOString()
    };
    let emailSent = false;
    if (emailService.sendEmailVerification) {
      try {
        logger.info({ to: normalized.substring(0, 3) + '***', type: 'verification_email' }, 'Sending verification code');
        if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) {
          await queue.addEmailJob({ type: 'sendEmailVerification', to: normalized, code: verifyCode });
          emailSent = true;
        } else {
          emailSent = await emailService.sendEmailVerification(normalized, verifyCode);
        }
        if (emailSent) logger.info({ to: normalized.substring(0, 3) + '***' }, 'Verification email sent');
        else logger.warn({ to: normalized.substring(0, 3) + '***' }, 'Verification email not sent');
      } catch (e) {
        logger.warn({ err: e.message, to: normalized.substring(0, 3) + '***' }, 'Verification email error');
      }
    }
    const message = emailSent
      ? 'تم إرسال رمز التحقق إلى بريدك. أدخل الرمز أدناه لإكمال إنشاء الحساب.'
      : 'تعذّر إرسال رمز التحقق حاليًا. يرجى المحاولة لاحقاً أو التواصل مع الدعم.';
    res.json({ step: 'verify', message, email_sent: emailSent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/client/register-resend-code', async (req, res) => {
  try {
    const pending = req.session && req.session.pendingClient;
    if (!pending) return res.status(400).json({ error: 'لا توجد جلسة تسجيل. يرجى إعادة تعبئة النموذج.' });
    const verifyCode = String(crypto.randomInt(100000, 999999));
    pending.verifyCode = verifyCode;
    pending.sentAt = new Date().toISOString();
    let emailSent = false;
    if (emailService.sendEmailVerification) {
      try {
        if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) {
          await queue.addEmailJob({ type: 'sendEmailVerification', to: pending.email, code: verifyCode });
          emailSent = true;
        } else {
          emailSent = await emailService.sendEmailVerification(pending.email, verifyCode);
        }
      } catch (e) { }
    }
    res.json({ success: true, email_sent: emailSent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function pruneClientLoginAttempts() {
  if (clientLoginAttempts.size <= 1000) return;
  const now = Date.now();
  for (const [k, v] of clientLoginAttempts.entries()) {
    if (!v || v.lockedUntil < now) clientLoginAttempts.delete(k);
  }
  if (clientLoginAttempts.size > 1000) {
    const keys = [...clientLoginAttempts.keys()].slice(0, Math.floor(clientLoginAttempts.size / 2));
    keys.forEach((k) => clientLoginAttempts.delete(k));
  }
}

app.post('/api/client/login', (req, res) => {
  try {
    pruneClientLoginAttempts();
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    let record = clientLoginAttempts.get(ip);
    if (record && record.lockedUntil > now) return res.status(429).json({ error: 'تم تجاوز عدد المحاولات المسموح بها. يرجى المحاولة مرة أخرى بعد 15 دقيقة.' });
    if (!record || record.lockedUntil < now) { record = { count: 0, lockedUntil: 0 }; clientLoginAttempts.set(ip, record); }
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور.' });
    const client = db.getClientByEmail(String(email).trim().toLowerCase());
    if (!client || !getBcrypt().compareSync(password, client.password_hash)) {
      record.count++;
      logger.warn({ type: 'client_login_failed', ip, email: email ? String(email).trim().substring(0, 3) + '***' : '[missing]' }, 'Failed client login attempt');
      if (record.count >= CLIENT_LOGIN_MAX) record.lockedUntil = now + CLIENT_LOCK_MS;
      return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التحقق والمحاولة مرة أخرى.' });
    }
    clientLoginAttempts.set(ip, { count: 0, lockedUntil: 0 });
    req.session.clientId = client.id;
    req.session.clientEmail = client.email;
    const returnUrl = (req.body && req.body.returnUrl) ? String(req.body.returnUrl).trim() : '';
    const redirect = (returnUrl && returnUrl.startsWith('/')) ? returnUrl : '/';
    res.json({ success: true, redirect, client: { id: client.id, email: client.email, name: client.name, phone: client.phone, email_verified: !!client.email_verified } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/client/logout', (req, res) => {
  req.session.clientId = null;
  req.session.clientEmail = null;
  res.json({ success: true });
});

app.post('/api/client/verify-email', (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً.' });
    const code = (req.body && req.body.code) ? String(req.body.code).trim() : '';
    if (!code) return res.status(400).json({ error: 'يرجى إدخال رمز التأكيد المرسل إلى بريدك.' });
    const ok = db.verifyClientEmailByCode(req.session.clientId, code);
    if (!ok) return res.status(400).json({ error: 'رمز التأكيد غير صحيح أو انتهت صلاحيته. الرمز صالح لمدة 15 دقيقة من وقت الإرسال.' });
    try { db.insertClientActivity(req.session.clientId, 'email_verified'); } catch (e) { }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const RESEND_VERIFY_COOLDOWN_MS = 60 * 1000;
app.post('/api/client/resend-verify-email', (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً.' });
    const client = db.getClientById(req.session.clientId);
    if (!client || !client.email) return res.status(400).json({ error: 'لا يوجد بريد إلكتروني مرتبط بهذا الحساب.' });
    if (client.email_verified) return res.status(400).json({ error: 'تم تأكيد بريدك الإلكتروني مسبقاً.' });
    const row = db.getDb().prepare('SELECT email_verification_sent_at FROM clients WHERE id = ?').get(req.session.clientId);
    if (row && row.email_verification_sent_at) {
      const sentAt = new Date(row.email_verification_sent_at.replace(' ', 'T') + 'Z').getTime();
      if (Date.now() - sentAt < RESEND_VERIFY_COOLDOWN_MS) {
        const retryAfter = Math.ceil((RESEND_VERIFY_COOLDOWN_MS - (Date.now() - sentAt)) / 1000);
        return res.status(429).json({ error: 'يرجى الانتظار قليلاً قبل طلب إرسال رمز جديد.', retryAfter });
      }
    }
    const verifyCode = String(crypto.randomInt(100000, 999999));
    db.setClientEmailVerificationToken(req.session.clientId, verifyCode);
    if (emailService.sendEmailVerification) {
      const toEmail = normalizeClientEmail(client.email);
      if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) queue.addEmailJob({ type: 'sendEmailVerification', to: toEmail, code: verifyCode }).catch(() => { });
      else emailService.sendEmailVerification(toEmail, verifyCode).catch(() => { });
    }
    res.json({ success: true, retryAfter: 60 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;
app.post('/api/client/forgot-password', express.json(), (req, res) => {
  try {
    const email = (req.body && req.body.email) ? String(req.body.email).trim().toLowerCase() : '';
    if (!email) return res.status(400).json({ error: 'يرجى إدخال بريدك الإلكتروني.' });
    const client = db.getClientByEmail(email);
    const baseUrl = (process.env.SITE_URL || '').trim() || (req.protocol + '://' + (req.get('host') || ''));
    if (client && client.email && emailService.sendPasswordResetEmail) {
      const token = crypto.randomBytes(32).toString('hex');
      db.setClientPasswordResetToken(client.id, token);
      const resetLink = (baseUrl.replace(/\/$/, '') + '/client-reset-password?token=' + encodeURIComponent(token));
      const toEmail = normalizeClientEmail(client.email);
      if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) queue.addEmailJob({ type: 'sendPasswordResetEmail', to: toEmail, resetLink }).catch(() => { });
      else emailService.sendPasswordResetEmail(toEmail, resetLink).catch(() => { });
    }
    res.json({ success: true, message: 'إذا كان هذا البريد مسجّلاً لدينا، ستتلقى خلال دقائق رسالة تحتوي على رابط إعادة تعيين كلمة المرور. يرجى التحقق من صندوق الوارد ومجلد الرسائل غير المرغوب فيها.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/client/reset-password', express.json(), (req, res) => {
  try {
    const token = (req.body && req.body.token) ? String(req.body.token).trim() : '';
    const newPassword = (req.body && req.body.newPassword) ? String(req.body.newPassword) : '';
    if (!token) return res.status(400).json({ error: 'رابط إعادة التعيين غير صالح. يرجى طلب رابط جديد من صفحة "نسيت كلمة المرور".' });
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.' });
    const client = db.getClientByPasswordResetToken(token);
    if (!client) return res.status(400).json({ error: 'رابط إعادة التعيين غير صالح أو مستخدم مسبقاً. يرجى طلب رابط جديد.' });
    const sentAt = client.password_reset_sent_at ? new Date(client.password_reset_sent_at.replace(' ', 'T') + 'Z').getTime() : 0;
    if (Date.now() - sentAt > PASSWORD_RESET_EXPIRY_MS) {
      db.clearClientPasswordResetToken(client.id);
      return res.status(400).json({ error: 'انتهت صلاحية هذا الرابط (ساعة من الإرسال). يرجى طلب إعادة تعيين كلمة المرور مرة أخرى.' });
    }
    const hash = getBcrypt().hashSync(newPassword, 10);
    db.updateClientPassword(client.id, hash);
    db.clearClientPasswordResetToken(client.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/client/change-password', (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Unauthorized' });
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
    if (String(newPassword).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    const client = db.getClientByIdWithPassword(req.session.clientId);
    if (!client || !getBcrypt().compareSync(String(currentPassword), client.password_hash)) return res.status(401).json({ error: 'Wrong current password' });
    const hash = getBcrypt().hashSync(String(newPassword), 10);
    db.updateClientPassword(req.session.clientId, hash);
    try { db.insertClientActivity(req.session.clientId, 'password_changed'); } catch (e) { }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/client/activity', (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
    res.json(db.getClientActivity(req.session.clientId, 30));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/client/me', (req, res) => {
  if (req.session && req.session.clientId) {
    const c = db.getClientById(req.session.clientId);
    if (c) {
      const orderCount = db.getOrderCountByClientId(req.session.clientId);
      return res.json({ loggedIn: true, id: c.id, email: c.email, name: c.name, phone: c.phone || '', address: c.address || '', email_verified: !!c.email_verified, notify_by_email: !!c.notify_by_email, notify_by_dashboard: !!c.notify_by_dashboard, order_count: orderCount });
    }
  }
  res.json({ loggedIn: false });
});

app.patch('/api/client/me', (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
    const { name, phone, address, notify_by_email, notify_by_dashboard } = req.body || {};
    const updates = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (phone !== undefined) updates.phone = String(phone).trim();
    if (address !== undefined) updates.address = String(address).trim();
    if (notify_by_email !== undefined) updates.notify_by_email = !!notify_by_email;
    if (notify_by_dashboard !== undefined) updates.notify_by_dashboard = !!notify_by_dashboard;
    if (Object.keys(updates).length) db.updateClientProfile(req.session.clientId, updates);
    const c = db.getClientById(req.session.clientId);
    return res.json({ id: c.id, email: c.email, name: c.name, phone: c.phone || '', address: c.address || '', email_verified: !!c.email_verified, notify_by_email: !!c.notify_by_email, notify_by_dashboard: !!c.notify_by_dashboard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/client/orders', (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
    res.json(db.getOrdersByClientId(req.session.clientId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* تصدير بيانات العميل (حق الوصول — T4) */
app.get('/api/client/me/export', (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
    const client = db.getClientById(req.session.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const orders = db.getOrdersByClientId(req.session.clientId);
    const exportData = {
      exported_at: new Date().toISOString(),
      profile: {
        id: client.id,
        email: client.email,
        name: client.name,
        phone: client.phone || '',
        address: client.address || '',
        created_at: client.created_at
      },
      orders: (orders || []).map(function (o) {
        return { id: o.id, date: o.date, product: o.product, value: o.value, status: o.status, product_category: o.product_category, product_subcat: o.product_subcat };
      })
    };
    const filename = 'key2lix-my-data-' + (client.id || 'user') + '-' + Date.now() + '.json';
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.send(JSON.stringify(exportData, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* P8: قائمة أمنيات العميل (مرتبطة بحسابه في DB) */
app.get('/api/client/wishlist', (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
    res.json(db.getClientWishlist(req.session.clientId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/client/wishlist', (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
    const item = req.body && typeof req.body === 'object' ? req.body : {};
    db.addClientWishlist(req.session.clientId, { key: item.key, category: item.category, subcat: item.subcat || '', name: item.name, img: item.img });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/client/wishlist', (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
    const { category, subcat, slug } = req.query || req.body || {};
    if (!category || !slug) return res.status(400).json({ error: 'category and slug required' });
    db.removeClientWishlist(req.session.clientId, category, subcat || '', slug);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: الصفحة الرئيسية الشخصية + قد يعجبك ===== */
app.get('/api/client/home-personalized', (req, res) => {
  try {
    const clientId = req.session && req.session.clientId ? req.session.clientId : null;
    const sessionId = (req.query.session_id && String(req.query.session_id).trim()) || (req.cookies && req.cookies.key2lix_guest_session) || null;
    const categoriesOfInterest = db.getCategoriesOfInterest(clientId, sessionId, 8);
    const recommendedProducts = db.getProductRecommendations({ clientId, sessionId, limit: 12 });
    res.json({ categoriesOfInterest, recommendedProducts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: قوائم العميل المحفوظة (Lists) ===== */
app.get('/api/client/lists', (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
    res.json(db.getClientLists(req.session.clientId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/client/lists', express.json(), (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
    const name = (req.body && req.body.name && String(req.body.name).trim()) || 'قائمة جديدة';
    const isPublic = !!(req.body && req.body.is_public);
    const list = db.addClientList(req.session.clientId, name, isPublic);
    res.status(201).json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/client/lists/:id', (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
    const id = parseInt(req.params.id, 10);
    const list = db.getClientListById(id, req.session.clientId);
    if (!list) return res.status(404).json({ error: 'List not found' });
    const items = db.getClientListItems(id, req.session.clientId);
    res.json({ ...list, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/client/lists/:id', express.json(), (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
    const id = parseInt(req.params.id, 10);
    const list = db.updateClientList(id, req.session.clientId, req.body || {});
    if (!list) return res.status(404).json({ error: 'List not found' });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/client/lists/:id', (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
    const id = parseInt(req.params.id, 10);
    const ok = db.deleteClientList(id, req.session.clientId);
    if (!ok) return res.status(404).json({ error: 'List not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/client/lists/:id/items', express.json(), (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
    const listId = parseInt(req.params.id, 10);
    const { category, subcat, slug } = req.body || {};
    if (!category || !slug) return res.status(400).json({ error: 'category and slug required' });
    const item = db.addClientListItem(listId, req.session.clientId, category, subcat || '', slug);
    if (!item) return res.status(404).json({ error: 'List not found' });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/client/lists/:id/items', (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
    const listId = parseInt(req.params.id, 10);
    const { category, subcat, slug } = req.query || {};
    if (!category || !slug) return res.status(400).json({ error: 'category and slug required' });
    const ok = db.removeClientListItem(listId, req.session.clientId, category, subcat || '', slug);
    if (!ok) return res.status(404).json({ error: 'Item or list not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* قائمة عامة بمشاركة الرابط (بدون تسجيل دخول) */
app.get('/api/list/:shareToken', (req, res) => {
  try {
    const token = (req.params.shareToken || '').trim();
    const list = db.getListByShareToken(token);
    if (!list) return res.status(404).json({ error: 'List not found' });
    const items = db.getClientListItems(list.id, true);
    const baseUrl = (process.env.BASE_URL || process.env.SITE_URL || (req.protocol + '://' + (req.get('host') || ''))).replace(/\/$/, '');
    res.json({ name: list.name, share_token: list.share_token, share_url: baseUrl + '/list/' + encodeURIComponent(list.share_token), items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* إضافة عنصر إلى قائمة مشتركة بالرمز (للمدعوين — بدون تسجيل دخول) */
app.post('/api/list/:shareToken/items', express.json(), (req, res) => {
  try {
    const token = (req.params.shareToken || '').trim();
    const { category, subcat, slug } = req.body || {};
    if (!category || !slug) return res.status(400).json({ error: 'category and slug required' });
    const item = db.addClientListItemByShareToken(token, category, subcat || '', slug);
    if (!item) return res.status(404).json({ error: 'List not found' });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: تذكير بالمناسبات (ربط تنبيه السعر بتذكير قبل مناسبة) ===== */
app.post('/api/occasion-reminders', express.json(), (req, res) => {
  try {
    const { email, occasion_type, occasion_date, reminder_days_before } = req.body || {};
    const orderEmail = (email && String(email).trim()) || (req.session && req.session.clientId && db.getClientById(req.session.clientId) && db.getClientById(req.session.clientId).email) || '';
    if (!orderEmail) return res.status(400).json({ error: 'Email required' });
    const occasionDate = (occasion_date && String(occasion_date).trim().slice(0, 10)) || '';
    if (!occasionDate) return res.status(400).json({ error: 'occasion_date required (YYYY-MM-DD)' });
    const reminder = db.addOccasionReminder(orderEmail, req.session && req.session.clientId ? req.session.clientId : null, occasion_type || 'custom', occasionDate, reminder_days_before);
    res.status(201).json(reminder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/occasion-reminders', (req, res) => {
  try {
    if (req.session && req.session.clientId) {
      return res.json(db.getOccasionRemindersByClient(req.session.clientId));
    }
    const email = (req.query.email && String(req.query.email).trim()) || '';
    if (!email) return res.json([]);
    res.json(db.getOccasionRemindersByEmail(email));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/occasion-reminders/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (req.session && req.session.clientId) {
      const ok = db.deleteOccasionReminder(id, req.session.clientId);
      return ok ? res.status(204).end() : res.status(404).json({ error: 'Not found' });
    }
    const email = (req.query.email && String(req.query.email).trim()) || '';
    if (!email) return res.status(400).json({ error: 'Email required' });
    const ok = db.deleteOccasionReminder(id, email);
    return ok ? res.status(204).end() : res.status(404).json({ error: 'Not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Notifications (client or vendor) ===== */
app.get('/api/notifications', (req, res) => {
  try {
    if (req.session && req.session.clientId) {
      const list = db.getNotifications('client', req.session.clientId);
      const unread = db.getUnreadNotificationsCount('client', req.session.clientId);
      return res.json({ notifications: list, unread });
    }
    if (req.session && req.session.vendorId) {
      const list = db.getNotifications('vendor', req.session.vendorId);
      const unread = db.getUnreadNotificationsCount('vendor', req.session.vendorId);
      return res.json({ notifications: list, unread });
    }
    res.json({ notifications: [], unread: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/read/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (req.session && req.session.clientId) {
      db.markNotificationRead(id, 'client', req.session.clientId);
      return res.json({ success: true });
    }
    if (req.session && req.session.vendorId) {
      db.markNotificationRead(id, 'vendor', req.session.vendorId);
      return res.json({ success: true });
    }
    res.status(401).json({ error: 'Not logged in' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/read-all', (req, res) => {
  try {
    if (req.session && req.session.clientId) {
      db.markAllNotificationsRead('client', req.session.clientId);
      return res.json({ success: true });
    }
    if (req.session && req.session.vendorId) {
      db.markAllNotificationsRead('vendor', req.session.vendorId);
      return res.json({ success: true });
    }
    res.status(401).json({ error: 'Not logged in' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Featured stores (homepage) ===== */
app.get('/api/featured-stores', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 8;
    res.json(db.getFeaturedStores(limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Vendor store (public page) ===== */
app.get('/api/vendor-store/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid vendor id' });
    const vendor = db.getVendorById(id);
    if (!vendor || vendor.status !== 'approved') return res.status(404).json({ error: 'Vendor not found' });
    const products = db.getProductsByVendor(id).filter((p) => p.status === 'approved' || p.status == null);
    const displayName = (vendor.store_name && String(vendor.store_name).trim()) ? String(vendor.store_name).trim() : (vendor.name || vendor.email);
    res.json({
      vendor: {
        id: vendor.id,
        name: displayName,
        logo: vendor.logo || null,
        banner: vendor.banner || null,
        description: vendor.store_description || null,
        facebook_url: vendor.facebook_url || null,
        instagram_url: vendor.instagram_url || null,
        whatsapp_url: vendor.whatsapp_url || null,
        website_url: vendor.website_url || null
      },
      products: products.map((p) => ({
        key: p.slug,
        category: p.category,
        subcat: p.subcat,
        name: p.name,
        desc: p.desc,
        images: p.images,
        prices: p.prices,
        discount: p.discount,
        oldPrice: p.oldPrice,
        tags: p.tags
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark all notifications for this order-chat as read (so they don't show in bell when user views the chat)
app.post('/api/notifications/read-order-chat', (req, res) => {
  try {
    const orderId = (req.body && req.body.orderId) || (req.query && req.query.order);
    if (!orderId || typeof orderId !== 'string') return res.status(400).json({ error: 'orderId required' });
    const link = '/order-chat?order=' + encodeURIComponent(orderId.trim());
    if (req.session && req.session.clientId) {
      db.markNotificationsReadByLink('client', req.session.clientId, link);
      return res.json({ success: true });
    }
    if (req.session && req.session.vendorId) {
      db.markNotificationsReadByLink('vendor', req.session.vendorId, link);
      return res.json({ success: true });
    }
    res.status(401).json({ error: 'Not logged in' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Orders list (admin only) ===== */
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
    if (emailService.isConfigured()) {
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
      if (product && product.vendor_id && emailService.isConfigured()) {
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

/* ===== API: Admin unified search (Command Palette) ===== */
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
    const coupons = (db.getCouponsList(50, 0, q, null) || []).slice(0, 8).map((c) => ({
      id: c.id, code: c.code, type: c.type, value: c.value, active: c.active, link: '/admin#coupons'
    }));
    res.json({ orders, vendors, coupons });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Admin notifications center ===== */
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
      const p = productsPending[0];
      notifications.push({
        id: 'notif-products-pending',
        type: 'products_review',
        title: productsPending.length === 1 ? 'منتج قيد المراجعة' : 'منتجات قيد المراجعة: ' + productsPending.length,
        link: '#',
        tab: 'products',
        count: productsPending.length
      });
    }
    contacts.slice(0, 3).forEach((c, i) => {
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

/* ===== API: Admin notifications SSE (إشعارات فورية) ===== */
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

/* ===== API: Vendor notifications SSE (إشعارات فورية للبائع) ===== */
app.get('/api/vendor/notifications/stream', requireVendor, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const vendorId = req.session.vendorId;
  let lastCount = -1;
  const send = (data) => {
    res.write('data: ' + JSON.stringify(data) + '\n\n');
    try { res.flush && res.flush(); } catch (_) { }
  };
  const tick = () => {
    try {
      const count = db.getUnreadNotificationsCount('vendor', vendorId);
      if (count !== lastCount) { lastCount = count; send({ type: 'notifications', count }); }
    } catch (_) { }
  };
  tick();
  const iv = setInterval(tick, 8000);
  req.on('close', () => clearInterval(iv));
});

/* ===== API: Admin dashboard stats (overview) — P30 لوحة مراقبة ===== */
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
      const backupDir = path.join(__dirname, 'client', 'data', 'backup');
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

/* استخراج المبلغ الرقمي من order.value (مثلاً "تسمية - 3000" أو "3000") */
function orderValueToAmount(val) {
  if (val == null || String(val).trim() === '') return 0;
  const s = String(val).trim();
  const sep = s.match(/\s*-\s*/);
  const numStr = sep ? s.substring(s.indexOf(sep[0]) + sep[0].length).trim() : s;
  const n = parseFloat(numStr.replace(/\s/g, '').replace(/,/g, '.').replace(/[^\d.]/g, ''));
  return isNaN(n) ? 0 : n;
}

/* ===== API: Admin analytics (A1) ===== */
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
    const ordersByDay = Object.keys(byDay)
      .sort()
      .map((d) => byDay[d]);
    const topProducts = Object.values(byProduct)
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
    const topVendors = Object.values(byVendor)
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 10);
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

/* ===== API: Admin monitoring (A4) ===== */
const monitoringErrors = [];
const MAX_MONITORING_ERRORS = 50;
function pushMonitoringError(msg, stack) {
  monitoringErrors.push({ msg: String(msg).slice(0, 500), ts: new Date().toISOString() });
  if (monitoringErrors.length > MAX_MONITORING_ERRORS) monitoringErrors.shift();
}
app.get('/api/admin/monitoring', requireAdmin, (req, res) => {
  try {
    let dbStatus = 'ok';
    try {
      const orders = db.getOrders();
      if (!Array.isArray(orders)) dbStatus = 'error';
    } catch (e) {
      dbStatus = 'error';
    }
    let lastBackup = null;
    let backupSize = null;
    try {
      const backupDir = path.join(__dirname, 'client', 'data', 'backup');
      if (fs.existsSync(backupDir)) {
        const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db')).sort().reverse();
        if (files.length) {
          const p = path.join(backupDir, files[0]);
          const st = fs.statSync(p);
          lastBackup = st.mtime.toISOString();
          backupSize = st.size;
        }
      }
    } catch (e) { }
    const uptimeSeconds = process.uptime();
    res.json({
      dbStatus,
      lastErrors: monitoringErrors.slice().reverse().slice(0, 20),
      lastBackup,
      backupSize,
      uptimeSeconds,
      sentryConfigured: !!(process.env.SENTRY_DSN && process.env.SENTRY_DSN.trim())
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Contacts list (admin only) ===== */
app.get('/api/contacts', requireAdmin, (req, res) => {
  try {
    res.json(db.getContacts());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Clients list (admin only) ===== */
app.get('/api/clients', requireAdmin, (req, res) => {
  try {
    res.json(db.getClients());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Coupons (admin: generate bulk + list) ===== */
function generateCouponCode(prefix) {
  const p = (prefix || 'KEY2LIX').trim().replace(/[^A-Za-z0-9]/g, '') || 'KEY2LIX';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let part = '';
  // 16 chars: 36^16 ≈ 7.9e24 combinations — cryptographically hard to guess
  for (let i = 0; i < 16; i++) part += chars.charAt(crypto.randomInt(0, chars.length));
  return p + '-' + part;
}

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
      // لا ندرج كوداً موجوداً مسبقاً في القاعدة (ضمان عدم التكرار)
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

/* ===== API: Export clients CSV (admin only – safe fields only) ===== */
app.get('/api/admin/clients/export.csv', requireAdmin, (req, res) => {
  try {
    const clients = db.getClients() || [];
    const headers = ['id', 'email', 'name', 'phone', 'created_at'];
    const csv = [headers.join(',')].concat(
      clients.map((c) => headers.map((h) => '"' + String(c[h] ?? '').replace(/"/g, '""') + '"').join(','))
    ).join('\n');
    const bom = '\ufeff';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="key2lix-clients-' + new Date().toISOString().slice(0, 10) + '.csv"');
    res.send(bom + csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Orders count (admin only – for new-order notification polling) ===== */
app.get('/api/admin/orders-count', requireAdmin, (req, res) => {
  try {
    const orders = db.getOrders() || [];
    res.json({ count: orders.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Orders pending vendor reply (admin only – للاتصال بالبائع) ===== */
app.get('/api/admin/orders-pending-vendor-reply', requireAdmin, (req, res) => {
  try {
    res.json(db.getOrdersPendingVendorReply());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Products pending approval (admin only) ===== */
app.get('/api/admin/products-pending', requireAdmin, (req, res) => {
  try {
    res.json(db.getProductsPendingApproval());
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
    if (ok) invalidateProductsCache();
    if (!ok) return res.status(404).json({ error: 'Product not found' });
    auditLog('admin', req.session.adminSubUserId || null, 'product_approve', { category, subcat: subcat || '', slug }, req);
    if (product.vendor_id) {
      try { db.addNotification('vendor', product.vendor_id, 'product_approved', 'تم اعتماد المنتج: ' + (product.name || slug), '/vendor'); } catch (e) { }
      if (emailService.isConfigured()) {
        const vendor = db.getVendorById(product.vendor_id);
        if (vendor && vendor.email && vendor.notify_by_email !== false) {
          if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) queue.addEmailJob({ type: 'notifyVendorProductApproved', to: vendor.email, productName: product.name }).catch(() => { });
          else emailService.notifyVendorProductApproved(vendor.email, product.name).catch(() => { });
        }
      }
    }
    if (emailService.isConfigured() && typeof emailService.sendMail === 'function' && db.getProductAlertsByProduct) {
      const alerts = db.getProductAlertsByProduct(category, subcat || '', slug, 'in_stock') || [];
      const productName = product.name || slug;
      const productUrl = (process.env.SITE_URL || '').replace(/\/$/, '') || (req.protocol + '://' + (req.get('host') || ''));
      const link = productUrl + '/product.html?product=' + encodeURIComponent((category || '') + (subcat ? '/' + subcat : '') + '/' + slug);
      alerts.forEach((a) => {
        const to = (a.email || '').trim();
        if (!to) return;
        const subject = '[Key2lix] المنتج متوفر الآن — ' + productName;
        const text = 'المنتج «' + productName + '» متوفر الآن للطلب. الرابط: ' + link;
        if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) queue.addEmailJob({ type: 'sendMail', to, subject, text, html: '<p>المنتج «' + productName + '» متوفر الآن للطلب.</p><p><a href="' + link + '">اطلب الآن</a></p>' }).catch(() => { });
        else emailService.sendMail(to, subject, text, '<p>المنتج «' + productName + '» متوفر الآن للطلب.</p><p><a href="' + link + '">اطلب الآن</a></p>').catch(() => { });
        db.deleteProductAlertAfterNotify(a.id);
      });
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
    if (ok) invalidateProductsCache();
    if (!ok) return res.status(404).json({ error: 'Product not found' });
    auditLog('admin', null, 'product_reject', { category, subcat: subcat || '', slug }, req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Vendor payments (admin + vendor) ===== */
/* مستحقات المنصة من الموردين: عند إكمال الطلب المورد يدين بالعمولة؛ نُسجّل استلام المبلغ عند الدفع */
app.get('/api/admin/vendors/performance', requireAdmin, (req, res) => {
  try {
    const data = db.getVendorsPerformance();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/vendor-payments', requireAdmin, (req, res) => {
  try {
    const vendorId = req.query.vendor_id ? parseInt(req.query.vendor_id, 10) : null;
    if (vendorId) {
      const list = db.getVendorPayments(vendorId);
      const total_paid = list.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const total_owed = db.getVendorCommissionOwed(vendorId);
      res.json({ payments: list, total_owed, total_paid, balance: Math.max(0, total_owed - total_paid) });
    } else {
      const receivables = db.getVendorsReceivables();
      res.json({ receivables });
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

/* ===== API: Admin reports (أرباح حسب فترة / مورد) ===== */
app.get('/api/admin/reports/profit.pdf', requireAdmin, (req, res) => {
  try {
    const dateFrom = (req.query.date_from || '').trim() || null;
    const dateTo = (req.query.date_to || '').trim() || null;
    const orders = db.getOrdersFiltered({ date_from: dateFrom, date_to: dateTo });
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
    const doc = new getPDFDocument()({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="key2lix-profit-' + (dateFrom || 'all') + '-' + (dateTo || 'all') + '.pdf"');
    doc.pipe(res);
    doc.fontSize(20).fillColor('#7c3aed').text('Key2lix', { align: 'center' });
    doc.fontSize(12).fillColor('#000').text('Profit Report', { align: 'center' });
    doc.fontSize(10).fillColor('#666').text('Report Date: ' + new Date().toISOString().slice(0, 10), { align: 'center' });
    if (dateFrom || dateTo) doc.fontSize(9).fillColor('#666').text('Period: ' + (dateFrom || '…') + ' to ' + (dateTo || '…'), { align: 'center' });
    doc.moveDown(1.5);
    doc.fontSize(14).fillColor('#000').text('Summary', 50);
    doc.moveDown(0.5);
    doc.fontSize(10).text('Total Sales: ' + totalSales.toLocaleString('en', { maximumFractionDigits: 0 }) + ' DZD');
    doc.text('Total Profit (commission): ' + totalCommission.toLocaleString('en', { maximumFractionDigits: 0 }) + ' DZD');
    doc.text('Completed Orders: ' + completedOrders.length + ' / Total Orders: ' + orders.length);
    doc.moveDown(1);
    if (dayRows.length > 0) {
      doc.fontSize(12).text('Sales & Commissions by Day', 50);
      doc.moveDown(0.5);
      const chartTop = doc.y;
      const maxSales = Math.max(...dayRows.map((r) => r.sales), 1);
      const barWidth = 180;
      dayRows.slice(-14).forEach((r, i) => {
        const w = (r.sales / maxSales) * barWidth;
        doc.rect(50, chartTop + i * 12, w, 8).fill('#7c3aed');
        doc.fillColor('#000').fontSize(7).text(r.date.slice(5) + ' ' + r.sales.toFixed(0), 50 + w + 6, chartTop + i * 12);
      });
      doc.moveDown(0.5 + dayRows.slice(-14).length * 0.18);
    }
    doc.fontSize(12).text('By Vendor', 50);
    doc.moveDown(0.5);
    const tableTop = doc.y;
    doc.fontSize(9);
    doc.text('Vendor', 50, tableTop);
    doc.text('Commission (DZD)', 350, tableTop);
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.2);
    vendorRows.slice(0, 12).forEach((r) => {
      doc.text(r.vendor_name || '—', 50);
      doc.text(r.total.toFixed(0), 350);
      doc.moveDown(0.2);
    });
    doc.moveDown(1);
    const chartTop2 = doc.y;
    if (vendorRows.length > 0) {
      const maxVal = Math.max(...vendorRows.map((r) => r.total), 1);
      const barWidth = 200;
      vendorRows.slice(0, 6).forEach((r, i) => {
        const w = (r.total / maxVal) * barWidth;
        doc.rect(50, chartTop2 + i * 18, w, 12).fill('#0d7d4d');
        doc.fillColor('#000').fontSize(8).text(r.vendor_name + ': ' + r.total.toFixed(0) + ' DZD', 50 + w + 10, chartTop2 + i * 18 + 2);
      });
    }
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
    const orders = db.getOrdersForReport(dateFrom, dateTo, isNaN(vendorId) ? null : vendorId);
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
      if (o.status === 'completed') {
        byVendor[vid].totalCommission += Number(o.commission_amount) || 0;
      }
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
      summary: {
        totalCommission,
        totalSales,
        orderCount: orders.length,
        completedOrderCount: completedOrders.length,
        byVendor: Object.values(byVendor).sort((a, b) => b.totalCommission - a.totalCommission)
      },
      ordersByDay,
      orders
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Integration (ERP/محاسبة) — X-API-Key أو Bearer ===== */
app.get('/api/integration/orders-summary', requireAdminOrIntegrationKey, (req, res) => {
  try {
    const dateFrom = (req.query.date_from || '').trim() || null;
    const dateTo = (req.query.date_to || '').trim() || null;
    const orders = db.getOrdersFiltered ? db.getOrdersFiltered({ date_from: dateFrom, date_to: dateTo }) : (db.getOrders() || []).filter((o) => {
      if (dateFrom && (o.date || '').slice(0, 10) < dateFrom) return false;
      if (dateTo && (o.date || '').slice(0, 10) > dateTo) return false;
      return true;
    });
    const completed = orders.filter((o) => o.status === 'completed');
    const totalCommission = completed.reduce((s, o) => s + (Number(o.commission_amount) || 0), 0);
    const totalSales = orders.reduce((s, o) => s + orderValueToAmount(o.value), 0);
    res.json({ totalOrders: orders.length, completedOrders: completed.length, totalSales, totalCommission, period: { from: dateFrom, to: dateTo } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/integration/commissions-summary', requireAdminOrIntegrationKey, (req, res) => {
  try {
    const dateFrom = (req.query.date_from || '').trim() || null;
    const dateTo = (req.query.date_to || '').trim() || null;
    const orders = db.getOrdersForReport(dateFrom, dateTo, null) || [];
    const completed = orders.filter((o) => o.status === 'completed');
    const byVendor = {};
    completed.forEach((o) => {
      const vid = o.vendor_id != null ? o.vendor_id : 0;
      const vname = o.vendor_name || (vid === 0 ? '—' : '#' + vid);
      if (!byVendor[vid]) byVendor[vid] = { vendor_id: vid, vendor_name: vname, totalCommission: 0, orderCount: 0 };
      byVendor[vid].totalCommission += Number(o.commission_amount) || 0;
      byVendor[vid].orderCount += 1;
    });
    const totalCommission = completed.reduce((s, o) => s + (Number(o.commission_amount) || 0), 0);
    res.json({ totalCommission, byVendor: Object.values(byVendor).sort((a, b) => b.totalCommission - a.totalCommission), period: { from: dateFrom, to: dateTo } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/integration/orders', requireAdminOrIntegrationKey, (req, res) => {
  try {
    const dateFrom = (req.query.date_from || '').trim() || null;
    const dateTo = (req.query.date_to || '').trim() || null;
    const vendorId = req.query.vendor_id != null ? parseInt(req.query.vendor_id, 10) : null;
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const orders = db.getOrdersForReport(dateFrom, dateTo, isNaN(vendorId) ? null : vendorId) || [];
    const slice = orders.slice(offset, offset + limit);
    res.json({ orders: slice, total: orders.length, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

app.get('/api/admin/settings/support', requireAdmin, (req, res) => {
  try {
    const anydeskId = db.getSetting('ANYDESK_ID') || '';
    res.json({ anydesk_id: String(anydeskId).trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/settings/support', requireAdmin, (req, res) => {
  try {
    const id = (req.body && req.body.anydesk_id != null) ? String(req.body.anydesk_id).trim() : '';
    db.setSetting('ANYDESK_ID', id);
    res.json({ success: true, anydesk_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Maintenance mode ===== */
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

/* ===== API: Backup (نسخ احتياطي من الواجهة) ===== */
app.get('/api/admin/backup/list', requireAdmin, (req, res) => {
  try {
    const backupDir = path.join(__dirname, 'client', 'data', 'backup');
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
    const dbPath = db.getDbPath ? db.getDbPath() : path.join(__dirname, 'client', 'data', 'keylix.db');
    const backupDir = path.join(__dirname, 'client', 'data', 'backup');
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({
        error: 'قاعدة البيانات غير موجودة',
        hint: 'شغّل السيرفر مرة واحدة (npm start) لإنشاء الملف تلقائياً، أو ضبط DB_FILENAME في .env إذا كنت تستخدم ملفاً قديماً (مثلاً keylix.db)'
      });
    }
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + '_' + pad(now.getHours()) + '-' + pad(now.getMinutes()) + '-' + pad(now.getSeconds());
    const dest = path.join(backupDir, 'keylix-' + ts + '.db');
    fs.copyFileSync(dbPath, dest);
    let uploaded = false;
    const uploadEnabled = process.env.BACKUP_UPLOAD_ENABLED === '1' || process.env.BACKUP_UPLOAD_ENABLED === 'true';
    const bucket = process.env.BACKUP_S3_BUCKET;
    const accessKey = process.env.BACKUP_S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
    const secretKey = process.env.BACKUP_S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
    if (uploadEnabled && bucket && accessKey && secretKey) {
      try {
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
        const client = new S3Client({
          region: process.env.BACKUP_S3_REGION || 'us-east-1',
          credentials: { accessKeyId: accessKey.trim(), secretAccessKey: secretKey.trim() },
          endpoint: process.env.BACKUP_S3_ENDPOINT || undefined
        });
        await client.send(new PutObjectCommand({
          Bucket: bucket.trim(),
          Key: 'backups/' + path.basename(dest),
          Body: fs.createReadStream(dest)
        }));
        uploaded = true;
      } catch (e) {
        logger.warn({ err: e.message }, 'Backup S3 upload failed');
      }
    }
    auditLog('admin', req.session.adminSubUserId || null, 'backup_run', { file: path.basename(dest), uploaded }, req);
    res.json({ success: true, file: path.basename(dest), uploaded });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/admin/backup/download/:filename', requireAdmin, (req, res) => {
  try {
    const name = (req.params.filename || '').replace(/\.\./g, '').replace(/[^a-zA-Z0-9\-_.]/g, '');
    if (!name.endsWith('.db')) return res.status(400).json({ error: 'ملف غير صالح' });
    const full = path.join(__dirname, 'client', 'data', 'backup', name);
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'النسخة غير موجودة' });
    res.download(full, name);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/backup/restore', requireAdmin, express.json(), (req, res) => {
  try {
    if (!db.getDbPath || !db.closeDb || !db.initDb) {
      return res.status(501).json({ error: 'استعادة النسخة الاحتياطية متاحة فقط مع قاعدة SQLite وليس مع PostgreSQL.' });
    }
    const filename = (req.body && req.body.filename) ? String(req.body.filename).trim() : '';
    if (!filename || !filename.endsWith('.db') || filename.includes('..') || /[^a-zA-Z0-9\-_.]/.test(filename)) {
      return res.status(400).json({ error: 'اسم الملف غير صالح. اختر نسخة من القائمة.' });
    }
    const backupDir = path.join(__dirname, 'client', 'data', 'backup');
    const backupPath = path.join(backupDir, filename);
    if (!fs.existsSync(backupDir) || !fs.existsSync(backupPath)) {
      return res.status(404).json({ error: 'النسخة الاحتياطية غير موجودة.' });
    }
    const dbPath = db.getDbPath();
    if (db.closeDb) db.closeDb();
    fs.copyFileSync(backupPath, dbPath);
    if (db.initDb) db.initDb();
    auditLog('admin', req.session.adminSubUserId || null, 'backup_restore', { filename }, req);
    logger.info({ filename }, 'Database restored from backup');
    res.json({ success: true, message: 'تم استعادة قاعدة البيانات بنجاح. تم تحميل النسخة المُستعادة.' });
  } catch (err) {
    if (db && db.initDb) try { db.initDb(); } catch (e) { }
    logger.warn({ err: err.message }, 'Backup restore failed');
    res.status(500).json({ error: err.message || 'فشل استعادة النسخة الاحتياطية.' });
  }
});

/* ===== API: Email settings (إعدادات البريد من لوحة التحكم) ===== */
app.get('/api/admin/settings/email', requireAdmin, (req, res) => {
  try {
    if (!emailService || !emailService.getConfigForAdmin) {
      return res.json({ provider: 'none', smtp_host: null, smtp_port: 587, smtp_secure: false, smtp_user: null, smtp_pass_masked: null, notify_from: null, emailjs_service_id: null, emailjs_template_id: null, emailjs_public_key: null, emailjs_private_key_masked: null });
    }
    res.json(emailService.getConfigForAdmin());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/admin/settings/email', requireAdmin, express.json(), (req, res) => {
  try {
    const b = req.body || {};
    const map = {
      smtp_host: 'SMTP_HOST', smtp_port: 'SMTP_PORT', smtp_secure: 'SMTP_SECURE',
      smtp_user: 'SMTP_USER', smtp_pass: 'SMTP_PASS', notify_from: 'NOTIFY_FROM',
      emailjs_service_id: 'EMAILJS_SERVICE_ID', emailjs_template_id: 'EMAILJS_TEMPLATE_ID',
      emailjs_public_key: 'EMAILJS_PUBLIC_KEY', emailjs_private_key: 'EMAILJS_PRIVATE_KEY'
    };
    Object.keys(map).forEach((fk) => {
      const v = b[fk];
      if (v !== undefined && v !== null) {
        const val = (fk === 'smtp_pass' || fk === 'emailjs_private_key') ? String(v) : String(v).trim();
        if (val || fk === 'smtp_pass' || fk === 'emailjs_private_key') db.setSetting(map[fk], val);
      }
    });
    if (b.smtp_port != null) db.setSetting('SMTP_PORT', String(parseInt(b.smtp_port, 10) || 587));
    if (b.smtp_secure != null) db.setSetting('SMTP_SECURE', b.smtp_secure ? '1' : '0');
    if (emailService && emailService.initFromDb) emailService.initFromDb(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/admin/settings/email/test', requireAdmin, express.json(), (req, res) => {
  try {
    const to = (req.body && req.body.to) ? String(req.body.to).trim() : '';
    if (!to || !to.includes('@')) return res.status(400).json({ error: 'أدخل بريداً إلكترونياً صحيحاً', hint: '' });
    if (!emailService || !emailService.isConfigured || !emailService.isConfigured()) {
      return res.status(400).json({ error: 'لم تُضبط إعدادات البريد بعد. قم بحفظ SMTP أو EmailJS أولاً.', hint: 'من هذا القسم املأ إما حقول SMTP أو الحقول الأربعة لـ EmailJS ثم اضغط «حفظ الإعدادات».' });
    }
    const subject = '[Key2lix] رسالة تجريبية / Test email';
    const text = 'هذه رسالة تجريبية من لوحة الأدمن. البريد يعمل بشكل صحيح.\n\nThis is a test email from the admin panel. Email is working correctly.';
    const sendTest = emailService.sendMailWithDiagnostic
      ? emailService.sendMailWithDiagnostic(to, subject, text)
      : emailService.sendMail(to, subject, text).then((ok) => ok ? { success: true } : { success: false, error: 'فشل الإرسال', hint: 'راجع السجلات (Logs) للتفاصيل.' });
    sendTest.then((result) => {
      if (result && result.success) {
        return res.json({ success: true, message: 'تم إرسال الرسالة التجريبية عبر SMTP إلى ' + to + '. تحقق من صندوق الوارد والسبام.' });
      }
      res.json({
        success: false,
        error: (result && result.error) || 'فشل الإرسال',
        hint: (result && result.hint) || 'راجع إعدادات SMTP أو استخدم EmailJS. راجع docs/DEPLOY-RAILWAY.md.'
      });
    }).catch((e) => res.status(500).json({ error: e.message, hint: '' }));
  } catch (err) {
    res.status(500).json({ error: err.message, hint: '' });
  }
});

/* ===== API: Email templates (قوالب البريد القابلة للتعديل) ===== */
const EMAIL_TEMPLATE_KEYS = ['vendor_new_order', 'vendor_product_approved', 'client_order_status', 'client_new_reply', 'abandoned_cart', 'email_verification', 'password_reset'];
app.get('/api/admin/settings/email-templates', requireAdmin, (req, res) => {
  try {
    const out = {};
    EMAIL_TEMPLATE_KEYS.forEach((key) => {
      const subj = db.getSetting('EMAIL_TEMPLATE_' + key.toUpperCase() + '_SUBJECT');
      const body = db.getSetting('EMAIL_TEMPLATE_' + key.toUpperCase() + '_BODY');
      out[key] = { subject: subj || '', body: body || '' };
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

/* ===== API: Admin monitoring (لوحة مراقبة — حالة DB، نسخ احتياطي، وقت التشغيل، آخر أخطاء) ===== */
app.get('/api/admin/monitoring', requireAdmin, (req, res) => {
  try {
    let dbStatus = 'connected';
    try {
      db.getDb().prepare('SELECT 1').get();
    } catch (e) {
      dbStatus = 'error';
    }
    const backupDir = path.join(__dirname, 'client', 'data', 'backup');
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

/* ===== API: Admin audit log (سجل التدقيق) ===== */
app.get('/api/admin/audit-log', requireAdmin, (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;
    const options = {
      action: (req.query.action || '').trim() || undefined,
      actor_type: (req.query.actor_type || '').trim() || undefined,
      date_from: (req.query.date_from || '').trim() || undefined,
      date_to: (req.query.date_to || '').trim() || undefined
    };
    Object.keys(options).forEach((k) => { if (!options[k]) delete options[k]; });
    const rows = db.getAuditLog ? db.getAuditLog(limit, offset, options) : [];
    res.json({ entries: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/audit-log/export.csv', requireAdmin, (req, res) => {
  try {
    const options = {
      action: (req.query.action || '').trim() || undefined,
      actor_type: (req.query.actor_type || '').trim() || undefined,
      date_from: (req.query.date_from || '').trim() || undefined,
      date_to: (req.query.date_to || '').trim() || undefined
    };
    Object.keys(options).forEach((k) => { if (!options[k]) delete options[k]; });
    const rows = db.getAuditLog ? db.getAuditLog(5000, 0, options) : [];
    const headers = ['id', 'at', 'actor_type', 'actor_id', 'action', 'details', 'ip'];
    let csv = headers.join(',') + '\n';
    rows.forEach((r) => {
      const row = headers.map((h) => '"' + String(r[h] || '').replace(/"/g, '""') + '"');
      csv += row.join(',') + '\n';
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="key2lix-audit-log-' + new Date().toISOString().slice(0, 10) + '.csv"');
    res.send('\ufeff' + csv);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

/* ===== API: Admin rate limit settings (ديناميكي دون إعادة تشغيل) ===== */
app.get('/api/admin/settings/rate-limit', requireAdmin, (req, res) => {
  try {
    const apiMax = parseInt(db.getSetting('RATE_LIMIT_API_MAX') || process.env.RATE_LIMIT_API_MAX || '500', 10) || 500;
    const adminMax = parseInt(db.getSetting('RATE_LIMIT_ADMIN_MAX') || process.env.RATE_LIMIT_ADMIN_MAX || '2000', 10) || 2000;
    res.json({ api_max: apiMax, admin_max: adminMax });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Admin sub-users (أدمن فرعي) — main admin only ===== */
function requireMainAdmin(req, res, next) {
  if (!req.session || !req.session.admin) return res.status(401).json({ error: 'Unauthorized' });
  if (req.session.adminSubUserId) return res.status(403).json({ error: 'Main admin only' });
  next();
}

app.get('/api/admin/sub-users', requireAdmin, requireMainAdmin, (req, res) => {
  try {
    const list = db.getAdminSubUsers ? db.getAdminSubUsers() : [];
    res.json({ users: list });
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
    if (db.getAdminSubUserByEmail(String(email).trim())) return res.status(400).json({ error: 'Email already used' });
    const hash = getBcrypt().hashSync(password, 10);
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
    const now = String(Date.now());
    db.setSetting('admin_sessions_invalid_before', now);
    auditLog('admin', null, 'logout_all', { at: now }, req);
    res.json({ success: true, message: 'All admin sessions have been invalidated. Please log in again.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/settings/scheduled-reports', requireAdmin, (req, res) => {
  try {
    const schedule = (db.getSetting('report_schedule') || '').trim() || 'weekly';
    const email = (db.getSetting('report_email') || '').trim() || process.env.ADMIN_EMAIL || process.env.ADMIN_USER || '';
    const nextRun = (db.getSetting('report_next_run') || '').trim() || null;
    res.json({ report_schedule: schedule, report_email: email, report_next_run: nextRun });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/settings/scheduled-reports', requireAdmin, express.json(), (req, res) => {
  try {
    const { report_schedule, report_email } = req.body || {};
    if (report_schedule !== undefined) {
      const s = String(report_schedule).toLowerCase();
      db.setSetting('report_schedule', (s === 'monthly' ? 'monthly' : 'weekly'));
    }
    if (report_email !== undefined) db.setSetting('report_email', String(report_email || '').trim());
    const schedule = (db.getSetting('report_schedule') || 'weekly').trim();
    const now = new Date();
    let next = new Date(now);
    if (schedule === 'monthly') {
      next.setMonth(next.getMonth() + 1);
      next.setDate(1);
      next.setHours(9, 0, 0, 0);
    } else {
      next.setDate(next.getDate() + (7 - next.getDay()) % 7 || 7);
      next.setHours(9, 0, 0, 0);
    }
    db.setSetting('report_next_run', next.toISOString());
    res.json({
      success: true,
      report_schedule: db.getSetting('report_schedule'),
      report_email: db.getSetting('report_email'),
      report_next_run: db.getSetting('report_next_run')
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/settings/rate-limit', requireAdmin, express.json(), (req, res) => {
  try {
    const { api_max, admin_max } = req.body || {};
    if (api_max != null) {
      const v = Math.max(10, Math.min(10000, parseInt(api_max, 10) || 500));
      db.setSetting('RATE_LIMIT_API_MAX', v);
    }
    if (admin_max != null) {
      const v = Math.max(50, Math.min(20000, parseInt(admin_max, 10) || 2000));
      db.setSetting('RATE_LIMIT_ADMIN_MAX', v);
    }
    const apiMax = parseInt(db.getSetting('RATE_LIMIT_API_MAX') || process.env.RATE_LIMIT_API_MAX || '500', 10) || 500;
    const adminMax = parseInt(db.getSetting('RATE_LIMIT_ADMIN_MAX') || process.env.RATE_LIMIT_ADMIN_MAX || '2000', 10) || 2000;
    res.json({ success: true, api_max: apiMax, admin_max: adminMax });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Admin 2FA (P21) ===== */
app.get('/api/admin/2fa/status', requireAdmin, (req, res) => {
  try {
    const enabled = isAdminTotpEnabled();
    res.json({ enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/2fa/setup', requireAdmin, (req, res) => {
  try {
    if (req.session.adminRole !== 'admin') return res.status(403).json({ error: 'Only main admin can setup 2FA' });
    const secret = getSpeakeasy().generateSecret({ length: 20, name: 'Key2lix (Admin)' });
    req.session.totpSetupSecret = secret.base32;
    const qrUrl = secret.otpauth_url;
    res.json({ secret: secret.base32, qrUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/2fa/verify-setup', requireAdmin, express.json(), (req, res) => {
  try {
    if (req.session.adminRole !== 'admin') return res.status(403).json({ error: 'Only main admin can setup 2FA' });
    const { code } = req.body || {};
    const secret = req.session.totpSetupSecret;
    if (!secret) return res.status(400).json({ error: '2FA setup not started. Refresh and try again.' });
    const valid = getSpeakeasy().totp.verify({ secret, encoding: 'base32', token: String(code).trim(), window: 1 });
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

/* ===== API: Admin session inactivity (P20) ===== */
app.get('/api/admin/session-inactivity', requireAdmin, (req, res) => {
  try {
    const minutes = parseInt(process.env.SESSION_INACTIVITY_MINUTES || '0', 10) || (isProduction ? 60 : 0);
    res.json({ enabled: minutes > 0, minutes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Admin login log (P22) ===== */
app.get('/api/admin/login-log', requireAdmin, (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const entries = db.getAdminLoginLog && db.getAdminLoginLog(limit);
    res.json({ entries: entries || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Admin commission settings (تعديل) ===== */
app.get('/api/admin/settings/commission', requireAdmin, (req, res) => {
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

app.post('/api/admin/settings/commission', requireAdmin, (req, res) => {
  try {
    const { threshold, rate_below, rate_above } = req.body || {};
    const t = threshold != null ? parseInt(threshold, 10) : null;
    const b = rate_below != null ? parseFloat(rate_below) : null;
    const a = rate_above != null ? parseFloat(rate_above) : null;
    if (t != null && !isNaN(t) && t >= 0) {
      db.setSetting('COMMISSION_THRESHOLD', t);
    }
    if (b != null && !isNaN(b) && b >= 0 && b <= 1) {
      db.setSetting('COMMISSION_RATE_BELOW', b);
    }
    if (a != null && !isNaN(a) && a >= 0 && a <= 1) {
      db.setSetting('COMMISSION_RATE_ABOVE', a);
    }
    commissionService.refreshConfig();
    auditLog('admin', null, 'commission_change', { threshold: t, rate_below: b, rate_above: a }, req);
    const cfg = commissionService.getConfig();
    res.json({ success: true, threshold: cfg.threshold, rate_below: cfg.rateBelow, rate_above: cfg.rateAbove });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* أسعار الصرف — للعرض فقط (1 وحدة أجنبية = X DZD). الأدمن يضبط "10 USD = X DZD" */
function getCurrencyRateUsd() {
  return parseFloat(db.getSetting('currency_rate_usd') || process.env.CURRENCY_RATE_USD || '270') || 270;
}
function getCurrencyRateEur() {
  return parseFloat(db.getSetting('currency_rate_eur') || process.env.CURRENCY_RATE_EUR || '300') || 300;
}
/** عدد الدنانير مقابل 1 وحدة من العملة (لـ DZD يُرجع 1). */
function getRateToDzd(currency) {
  if (currency === 'USD') return getCurrencyRateUsd();
  if (currency === 'EUR') return getCurrencyRateEur();
  return 1;
}

app.get('/api/admin/settings/currency', requireAdmin, (req, res) => {
  try {
    const rateUsd = getCurrencyRateUsd();
    const rateEur = getCurrencyRateEur();
    res.json({
      dzd_per_10_usd: Math.round(rateUsd * 10),
      dzd_per_10_eur: Math.round(rateEur * 10)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/settings/currency', requireAdmin, express.json(), (req, res) => {
  try {
    const { dzd_per_10_usd, dzd_per_10_eur } = req.body || {};
    if (dzd_per_10_usd != null) {
      const v = parseFloat(dzd_per_10_usd);
      if (!isNaN(v) && v > 0) {
        db.setSetting('currency_rate_usd', String(v / 10));
      }
    }
    if (dzd_per_10_eur != null) {
      const v = parseFloat(dzd_per_10_eur);
      if (!isNaN(v) && v > 0) {
        db.setSetting('currency_rate_eur', String(v / 10));
      }
    }
    const rateUsd = getCurrencyRateUsd();
    const rateEur = getCurrencyRateEur();
    auditLog('admin', null, 'currency_rates_change', { rate_usd: rateUsd, rate_eur: rateEur }, req);
    res.json({
      success: true,
      dzd_per_10_usd: Math.round(rateUsd * 10),
      dzd_per_10_eur: Math.round(rateEur * 10)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Theme & Branding — إعدادات الأدمن (ألوان، هيرو، أيقونات فئات) */
app.get('/api/admin/settings/theme', requireAdmin, (req, res) => {
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
    res.json({
      primary,
      secondary,
      hero: {
        type: heroType === 'gradient' || heroType === 'solid' ? heroType : 'image',
        imageUrl: heroImageUrl || '',
        gradient: heroGradient || '',
        color: heroColor || '',
        title: heroTitle || '',
        tagline: heroTagline || '',
        ctaText: heroCtaText || '',
        ctaUrl: heroCtaUrl || '',
        videoUrl: heroVideoUrl || ''
      },
      categoryIcons: {
        products: (db.getSetting(THEME_KEYS.categoryProducts) || '').trim() || '',
        subscriptions: (db.getSetting(THEME_KEYS.categorySubscriptions) || '').trim() || '',
        hardware: (db.getSetting(THEME_KEYS.categoryHardware) || '').trim() || '',
        software: (db.getSetting(THEME_KEYS.categorySoftware) || '').trim() || ''
      },
      homeSections: { order: getHomeSectionsOrder(), enabled: getHomeSectionsEnabled() }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/settings/theme', requireAdmin, express.json(), (req, res) => {
  try {
    const body = req.body || {};
    const primary = (body.primary != null ? String(body.primary).trim() : null);
    const secondary = (body.secondary != null ? String(body.secondary).trim() : null);
    const hero = body.hero;
    const cat = body.categoryIcons;
    if (primary != null) db.setSetting(THEME_KEYS.primary, primary || DEFAULT_PRIMARY);
    if (secondary != null) db.setSetting(THEME_KEYS.secondary, secondary || DEFAULT_SECONDARY);
    if (hero != null && typeof hero === 'object') {
      const heroType = (hero.type === 'gradient' || hero.type === 'solid') ? hero.type : 'image';
      db.setSetting(THEME_KEYS.heroType, heroType);
      db.setSetting(THEME_KEYS.heroImageUrl, (hero.imageUrl != null ? String(hero.imageUrl).trim() : '') || '');
      db.setSetting(THEME_KEYS.heroGradient, (hero.gradient != null ? String(hero.gradient).trim() : '') || '');
      db.setSetting(THEME_KEYS.heroColor, (hero.color != null ? String(hero.color).trim() : '') || '');
      db.setSetting(THEME_KEYS.heroTitle, (hero.title != null ? String(hero.title).trim() : '') || '');
      db.setSetting(THEME_KEYS.heroTagline, (hero.tagline != null ? String(hero.tagline).trim() : '') || '');
      db.setSetting(THEME_KEYS.heroCtaText, (hero.ctaText != null ? String(hero.ctaText).trim() : '') || '');
      db.setSetting(THEME_KEYS.heroCtaUrl, (hero.ctaUrl != null ? String(hero.ctaUrl).trim() : '') || '');
      db.setSetting(THEME_KEYS.heroVideoUrl, (hero.videoUrl != null ? String(hero.videoUrl).trim() : '') || '');
    }
    const homeSections = body.homeSections;
    if (homeSections != null && typeof homeSections === 'object') {
      if (Array.isArray(homeSections.order)) db.setSetting(HOME_SECTIONS_KEY_ORDER, JSON.stringify(homeSections.order));
      if (homeSections.enabled && typeof homeSections.enabled === 'object') db.setSetting(HOME_SECTIONS_KEY_ENABLED, JSON.stringify(homeSections.enabled));
    }
    if (cat != null && typeof cat === 'object') {
      db.setSetting(THEME_KEYS.categoryProducts, (cat.products != null ? String(cat.products).trim() : '') || '');
      db.setSetting(THEME_KEYS.categorySubscriptions, (cat.subscriptions != null ? String(cat.subscriptions).trim() : '') || '');
      db.setSetting(THEME_KEYS.categoryHardware, (cat.hardware != null ? String(cat.hardware).trim() : '') || '');
      db.setSetting(THEME_KEYS.categorySoftware, (cat.software != null ? String(cat.software).trim() : '') || '');
    }
    auditLog('admin', null, 'theme_change', {}, req);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** رفع صورة للمظهر (هيرو أو أيقونة فئة) — يحفظ في client/assets/img ويرجع مساراً عاماً */
app.post('/api/admin/settings/upload', requireAdmin, getUpload().single('file'), (req, res) => {
  try {
    if (!req.file || !req.file.path) return res.status(400).json({ error: 'No file uploaded' });
    const ext = path.extname(req.file.originalname).toLowerCase() || '.webp';
    const safeName = 'theme-' + (req.body && req.body.prefix ? String(req.body.prefix).replace(/[^a-z0-9-_]/gi, '') + '-' : '') + Date.now() + ext;
    const destPath = path.join(IMG_DIR, safeName);
    if (req.file.path !== destPath) {
      fs.renameSync(req.file.path, destPath);
    }
    const url = '/assets/img/' + encodeURIComponent(safeName);
    res.json({ success: true, url });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
      return res.status(403).json({ error: 'يجب تأكيد البريد الإلكتروني قبل تقديم الطلب. راجع صندوق الوارد أو مجلد السبام وأدخل رمز التحقق في صفحة «حسابي».', code: 'email_verification_required' });
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
      if (!coupon) return res.status(400).json({ error: 'كود الخصم غير صالح أو منتهي.' });
      if (coupon.active === 0 || coupon.active === false) return res.status(400).json({ error: 'كود الخصم غير مفعّل.' });
      const now = new Date().toISOString().slice(0, 10);
      if (coupon.valid_from && coupon.valid_from > now) return res.status(400).json({ error: 'كود الخصم غير نشط بعد.' });
      if (coupon.valid_until && coupon.valid_until < now) return res.status(400).json({ error: 'كود الخصم منتهي الصلاحية.' });
      if (coupon.usage_limit != null && (coupon.usage_count || 0) >= coupon.usage_limit) return res.status(400).json({ error: 'تم استهلاك عدد استخدامات هذا الكود.' });
      const amount = commissionService.parsePriceFromValue(value);
      if (coupon.min_order_amount != null && !isNaN(Number(coupon.min_order_amount)) && amount < Number(coupon.min_order_amount)) return res.status(400).json({ error: 'الحد الأدنى للطلب لتطبيق هذا الكود هو ' + Math.round(Number(coupon.min_order_amount)) + ' د.ج.' });
      if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'المبلغ غير صالح لتطبيق الخصم.' });
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
      const crypto = require('crypto');
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

/* ===== API: Payment gateway (Stripe) ===== */
app.post('/api/payment/create-session', express.json(), (req, res) => {
  let stripeLib;
  try { stripeLib = require('./lib/stripe'); } catch (_) { stripeLib = null; }
  if (!stripeLib || !stripeLib.isConfigured()) return res.status(503).json({ error: 'Payment gateway not configured' });
  if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Login required' });
  const orderId = (req.body && req.body.orderId) ? String(req.body.orderId).trim() : '';
  if (!orderId) return res.status(400).json({ error: 'orderId required' });
  const order = db.getOrderById(orderId);
  if (!order || order.client_id !== req.session.clientId) return res.status(403).json({ error: 'Forbidden' });
  const amountDzd = commissionService.parsePriceFromValue(order.value);
  if (isNaN(amountDzd) || amountDzd < 100) return res.status(400).json({ error: 'Invalid order amount' });
  const baseUrl = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  stripeLib.createCheckoutSession({
    orderId,
    amountDzd,
    productName: order.product || `Order ${orderId}`,
    successUrl: baseUrl + '/client-account?payment=success&order=' + encodeURIComponent(orderId),
    cancelUrl: baseUrl + '/client-account?payment=cancelled'
  }).then(({ url }) => res.json({ url })).catch((err) => {
    logger.error({ err: err.message, orderId }, 'Stripe createCheckoutSession failed');
    res.status(500).json({ error: err.message || 'Payment session failed' });
  });
});

/* P25: النشرة البريدية — اشتراك وتأكيد مزدوج */
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

/* ===== API: اقتراحات البحث الذكي ===== */
app.get('/api/search/suggest', (req, res) => {
  try {
    const q = (req.query.q && String(req.query.q).trim()) || '';
    const limit = parseInt(req.query.limit, 10) || 15;
    const suggestions = db.getSearchSuggestions(q, limit);
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Get product by slug (any status, for "notify when available" page) ===== */
app.get('/api/product-by-key', (req, res) => {
  try {
    const slug = (req.query.product || req.query.slug || '').trim();
    if (!slug) return res.status(400).json({ error: 'product or slug required' });
    const product = db.getProductBySlugAnyStatus && db.getProductBySlugAnyStatus(slug);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({
      category: product.category,
      subcat: product.subcat || '',
      slug: product.slug,
      name: product.name,
      status: product.status || 'approved'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: تسجيل مشاهدة منتج (للتوصيات والصفحة الرئيسية الشخصية) ===== */
app.post('/api/product-view', express.json(), (req, res) => {
  try {
    const { category, subcat, slug, session_id: bodySessionId } = req.body || {};
    if (!category || !slug) return res.status(400).json({ error: 'category and slug required' });
    const clientId = req.session && req.session.clientId ? req.session.clientId : null;
    const sessionId = (bodySessionId && String(bodySessionId).trim()) || (req.session && req.session.guestSessionId) || null;
    db.saveProductView(clientId, sessionId, category, subcat || '', slug);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Product alert (notify when in stock / price drop) ===== */
app.post('/api/product-alert', express.json(), (req, res) => {
  try {
    const { category, subcat, slug, alert_type, email: bodyEmail, target_price: bodyTargetPrice } = req.body || {};
    if (!category || !slug) return res.status(400).json({ error: 'category and slug required' });
    let email = (bodyEmail && String(bodyEmail).trim()) || '';
    if (!email && req.session && req.session.clientId) {
      const client = db.getClientById(req.session.clientId);
      if (client && client.email) email = client.email.trim();
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Valid email required' });
    const type = (alert_type === 'price_drop') ? 'price_drop' : 'in_stock';
    const targetPrice = type === 'price_drop' && bodyTargetPrice != null && bodyTargetPrice !== '' ? parseFloat(bodyTargetPrice) : undefined;
    db.addProductAlert(email, req.session && req.session.clientId ? req.session.clientId : null, category, subcat || '', slug, type, targetPrice);
    res.json({ success: true, message: type === 'in_stock' ? 'سيتم إشعارك عند توفر المنتج.' : (targetPrice ? 'سيتم إشعارك عند وصول السعر إلى ' + targetPrice + ' أو أقل.' : 'سيتم إشعارك عند انخفاض السعر.') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Can client review (after order completed) ===== */
app.get('/api/reviews/can-review', (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.json({ canReview: false });
    const { category, subcat, slug } = req.query || {};
    if (!category || !slug) return res.json({ canReview: false });
    const canReview = db.hasClientCompletedOrderForProduct(req.session.clientId, category, subcat || '', slug);
    res.json({ canReview: !!canReview });
  } catch (err) {
    res.json({ canReview: false });
  }
});

/* ===== API: Reviews (product ratings) ===== */
app.get('/api/reviews', (req, res) => {
  try {
    const { category, subcat, slug } = req.query || {};
    if (!category || !slug) return res.status(400).json({ error: 'category and slug required' });
    const stats = db.getProductRatingStats(category, subcat || '', slug);
    const reviews = db.getReviewsForProduct(category, subcat || '', slug);
    res.json({ stats: { average: stats.average, count: stats.count }, reviews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Vendor review (after order completed) ===== */
app.post('/api/reviews/vendor', (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Login required' });
    const { order_id, rating, comment } = req.body || {};
    if (!order_id) return res.status(400).json({ error: 'order_id required' });
    const order = db.getOrderById(String(order_id).trim());
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.client_id !== req.session.clientId) return res.status(403).json({ error: 'Not your order' });
    if (order.status !== 'completed') return res.status(400).json({ error: 'Can only review completed orders' });
    const vendorId = order.vendor_id;
    if (!vendorId) return res.status(400).json({ error: 'Order has no vendor' });
    const ratingNum = Math.min(5, Math.max(1, Math.floor(Number(rating) || 0)));
    db.addVendorReview(order.id, vendorId, req.session.clientId, ratingNum, comment || '');
    const stats = db.getVendorRatingStats(vendorId);
    res.json({ success: true, stats: { average: stats.average, count: stats.count } });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reviews/vendor/can-review', (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.json({ canReview: false });
    const orderId = (req.query.order_id || '').trim();
    if (!orderId) return res.json({ canReview: false });
    const order = db.getOrderById(orderId);
    if (!order || order.client_id !== req.session.clientId || order.status !== 'completed' || !order.vendor_id) {
      return res.json({ canReview: false });
    }
    const already = db.hasClientReviewedVendorForOrder(req.session.clientId, orderId, order.vendor_id);
    res.json({ canReview: !already });
  } catch (err) {
    res.json({ canReview: false });
  }
});

app.post('/api/reviews', (req, res) => {
  try {
    if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Login required to submit review' });
    const { category, subcat, slug, rating, comment } = req.body || {};
    if (!category || !slug) return res.status(400).json({ error: 'category and slug required' });
    const ratingNum = Math.min(5, Math.max(1, Math.floor(Number(rating) || 0)));
    if (ratingNum < 1 || ratingNum > 5) return res.status(400).json({ error: 'rating must be 1-5' });
    if (db.hasClientReviewed(req.session.clientId, category, subcat || '', slug)) {
      return res.status(400).json({ error: 'You already reviewed this product' });
    }
    db.addReview(category, subcat || '', slug, req.session.clientId, ratingNum, comment || '');
    const stats = db.getProductRatingStats(category, subcat || '', slug);
    res.json({ success: true, stats: { average: stats.average, count: stats.count } });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Add Product (admin) ===== */
app.post('/api/add-product', requireAdmin, getUpload().single('image'), async (req, res) => {
  try {
    const { category, subcat, key, name, desc, prices } = req.body;
    let imagePath = 'assets/img/default.png';
    let images = [imagePath];
    if (req.file) {
      let rel = await processImageToWebP(req.file.path);
      rel = await maybeUploadImagesToS3(rel);
      if (rel && typeof rel === 'object') {
        imagePath = rel.main;
        images = [rel.main];
      } else {
        imagePath = rel || `assets/img/${req.file.filename}`;
        images = [imagePath];
      }
    }
    const productData = {
      name,
      desc: desc || '',
      images,
      prices: prices ? JSON.parse(prices) : []
    };
    db.addProduct(null, category, subcat || (category === 'hardware' ? 'storage' : ''), key, productData);
    invalidateProductsCache();
    res.json({ success: true, message: 'Product added' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Update Product (admin) ===== */
app.post('/api/update-product', requireAdmin, getUpload().single('image'), async (req, res) => {
  try {
    const { category, subcat, key, name, desc, prices } = req.body;
    const sub = (subcat === 'all' || !subcat) ? '' : subcat;
    const prod = db.getProductByKey(category, sub, key);
    if (!prod) return res.status(404).json({ error: 'Product not found' });
    const productData = {
      name: name || prod.name,
      desc: desc != null ? desc : prod.desc,
      images: JSON.parse(prod.images_json || '[]'),
      prices: prices ? JSON.parse(prices) : JSON.parse(prod.prices_json || '[]')
    };
    if (req.file) {
      let rel = await processImageToWebP(req.file.path);
      rel = await maybeUploadImagesToS3(rel);
      if (rel && typeof rel === 'object') {
        productData.images.unshift(rel.main);
      } else productData.images.unshift(rel || `assets/img/${req.file.filename}`);
    }
    db.updateProduct(category, sub, key, productData, null);
    invalidateProductsCache();
    res.json({ success: true, message: 'Product updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== API: Delete Product (admin) ===== */
app.post('/api/delete-product', requireAdmin, (req, res) => {
  try {
    const body = req.body || {};
    const category = body.category != null ? String(body.category).trim() : '';
    const subcat = body.subcat != null ? String(body.subcat).trim() : '';
    const slug = (body.key != null ? body.key : body.slug);
    const key = slug != null ? String(slug).trim() : '';
    if (!category || !key) {
      return res.status(400).json({ error: 'category and key (or slug) required' });
    }
    const sub = (subcat === 'all' || subcat === '') ? '' : String(subcat).trim();
    const ok = db.deleteProduct(category, sub, key, null);
    if (ok) invalidateProductsCache();
    if (!ok) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true, message: 'Product deleted' });
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

app.post('/api/admin/vendors/:id/delete', requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid vendor id' });
    const ok = db.deleteVendor(id);
    if (!ok) return res.status(404).json({ error: 'Vendor not found' });
    auditLog('admin', null, 'vendor_delete', { vendor_id: id }, req);
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
    auditLog('admin', null, 'client_delete', { client_id: id }, req);
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
    auditLog('admin', null, 'order_delete', { order_id: id }, req);
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