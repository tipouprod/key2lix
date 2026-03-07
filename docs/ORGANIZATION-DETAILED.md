# تنظيم المشروع بأدق التفاصيل — Key2lix

وثيقة مرجعية لتنظيم الملفات، المسارات، التسميات، وخطة إعادة الهيكلة خطوة بخطوة.

---

## 1. خريطة مسارات `server.js` (مع أرقام الأسطر)

ملف `server.js` يحتوي على **أكثر من 100 مسار** موزعة على النحو التالي. الأرقام تقريبية لبداية كل كتلة.

| نطاق الأسطر (تقريبي) | القسم | المسارات الرئيسية | الملف المقترح عند التقسيم |
|----------------------|--------|-------------------|----------------------------|
| 154–184 | Webhook Stripe | `POST /api/payment/webhook` | `routes/payment-webhook.js` |
| 185–207 | طلبات سريعة (قبل الجلسة) | `/ping`, `/api/ok`, `/robots.txt`, `/favicon.ico`, `GET /` | يبقى في `server.js` أو `routes/static.js` |
| 209–270 | CORS + Session + Inactivity | — | يبقى في `server.js` |
| 272–390 | Rate limits + Health + Version + Logging + v1 + Admin security + Maintenance | `/health`, `/api/version` | يبقى في `server.js` أو `routes/health.js` |
| 422–872 | Sitemap، منتجات، إعدادات، OAuth، theme، push، track، cart، Multer، sw | `/sitemap.xml`, `/data/products.json`, `/api/config`, `/api/auth/*`, `/api/theme`, `/api/push/subscribe`, `/api/cart`, `/sw.js` | `routes/public-api.js` أو تقسيم إلى `routes/sitemap.js`, `routes/auth-oauth.js`, `routes/cart.js` |
| 950–1112 | Login rate limit + Auth | `POST /api/login`, `/api/admin/2fa/verify-login`, `POST /api/logout`, `GET /api/me`, `GET /api/admin/csrf-token` | `routes/auth-admin.js` |
| 1120–1611 | Client API (تسجيل، دخول، تحقق، كلمة مرور، طلبات، قوائم، مشاركة) | `/api/client/*`, `/api/list/:shareToken` | `routes/client-api.js` |
| 1613–1759 | تذكير مناسبات، إشعارات، متاجر، قراءة محادثة | `/api/occasion-reminders`, `/api/notifications`, `/api/featured-stores`, `/api/vendor-store/:id`, `/api/notifications/read-order-chat` | `routes/notifications-stores.js` |
| 1778–2087 | Orders (أدمن) + Admin search/notifications/stream + Vendor stream + Stats | `/api/orders`, `/api/admin/orders/*`, `/api/admin/products/bulk-*`, `/api/admin/search`, `/api/admin/notifications`, `/api/admin/stats` | `routes/admin-orders.js`, `routes/admin-notifications.js` |
| 2088–2675 | Admin: analytics، monitoring، contacts، clients، coupons، export، orders-count، pending، products approve/reject، vendor-payments، reports | `/api/admin/analytics`, `/api/admin/monitoring`, `/api/contacts`, `/api/clients`, `/api/admin/coupons/*`, `/api/admin/reports/*` | `routes/admin-reports.js`, `routes/admin-coupons.js`, `routes/admin-settings.js` (حسب التقسيم) |
| 2677–… | Integration API | `/api/integration/orders-summary`, `/api/integration/commissions-summary`, `/api/integration/orders` | `routes/integration.js` |
| …–5130+ | Order (عميل)، Contact، Vendor (دخول، تسجيل، API)، Complaints، Settings، Backup، إلخ. | `/api/order`, `/api/contact`, `/api/vendor/*`, `/api/admin/complaints`, `/api/admin/settings/*`, `/api/admin/backup/*` | `routes/order.js`, `routes/contact.js`, `routes/vendor-api.js`, `routes/admin-settings.js` |

**ملاحظة:** التقسيم أعلاه اقتراحي. التنفيذ يتطلب نقل الدوال المساعدة (مثل `normalizeClientEmail`, `getClientIP`) إلى ملفات مشتركة أو تمريرها كـ `opts` عند استدعاء `registerRoutes(app, opts)`.

---

## 2. توحيد تسمية قاعدة البيانات (keylix vs key2lix)

الوضع الحالي: الافتراضي في الكود هو `key2lix.db` مع دعم تلقائي لـ `keylix.db` عند عدم وجود `key2lix.db` (للمرونة بعد تغيير الاسم). المراجع في المشروع:

| الملف | السطر | النص/الاستخدام |
|-------|--------|------------------|
| `database/db.js` | 10–13, 21, 33 | `DB_FILENAME` افتراضي `key2lix.db`؛ `KEYLIX_DB_PATH` للتوافق مع `keylix.db` |
| `database/db.js` | 3380 | `getDbPath()` يعيد المسار الفعلي |
| `database/index.js` | — | لا يحدد اسم ملف؛ يحمّل `db.js` أو `db-pg.js` |
| `server.js` | 90 | fallback: `path.join(__dirname, 'client', 'data', 'keylix.db')` |
| `server.js` | 2857, 2862, 2914, 2926 | إشارات لـ `getDbPath()` أو رسائل تحتوي `keylix.db` |
| `scripts/check-db.js` | 10–14, 18, 20, 26 | نفس منطق الافتراضي + `keylix.db` |
| `scripts/seed-clients-from-orders.js` | 10–14 | نفس المنطق |
| `scripts/backup.js` | 4, 12 | تعليق واسم ملف: `key2lix.db` |
| `.env.example` | 10–11 | تعليق: افتراضي `key2lix.db`، اختياري `DB_FILENAME=keylix.db` |
| `docs/DATABASE.md` | 5, 11–13, 33, 39 | وصف المسار والسلوك |
| `docs/BACKUP.md` | 3 | `client/data/key2lix.db` |
| `docs/RAILWAY-ENV-VARS.md` | 117, 278 | `DB_FILENAME=key2lix.db` أو `keylix.db` |

**توصية للتنظيم:**

1. **توثيق واحد:** في `docs/DATABASE.md` فقرة واحدة: "الاسم الافتراضي لملف SQLite هو `key2lix.db` داخل `client/data/`. لدعم البيانات القديمة، إن وُجد `keylix.db` فقط ولم يُضبط `DB_FILENAME`، يُستخدم `keylix.db` تلقائياً."
2. **Fallback في server.js:** توحيد رسائل الخطأ والـ hint لاستخدام "key2lix.db (أو keylix.db للتوافق)" بدل ذكر اسم واحد فقط حيث يسبب التباساً.
3. **لا تغيير في المنطق الحالي:** الإبقاء على دعم `keylix.db` كما هو؛ التنظيم توثيق وتوحيد العبارات فقط.

---

## 3. بنية المجلدات والملفات (مرجع كامل)

### 3.1 الجذر

```
keylix/
├── .cursor/
│   └── rules/
│       └── key2lix-project.mdc    # قواعد المشروع
├── .github/
│   └── workflows/
│       └── ci.yml                 # CI: checkout, node 20, npm ci, DB init, npm test
├── client/
│   ├── assets/
│   │   ├── css/                   # style.css, home.css, admin.css, tokens.css
│   │   ├── img/                   # شعارات، أيقونات، صور افتراضية
│   │   └── js/
│   │       ├── lang.js            # ترجمة ar/en
│   │       ├── common.js          # مشترك (navbar، لغة، عملة)
│   │       ├── cart.js, product.js, wishlist.js, push-subscribe.js
│   │       ├── form.js, products-page.js, ai-chat.js, ai-recommendations.js
│   │       └── ...
│   ├── data/
│   │   ├── key2lix.db             # (أو keylix.db) — لا يُرفع على git
│   │   ├── backup/
│   │   └── news.json
│   ├── pages/                     # 40 صفحة HTML (انظر القسم 3.3)
│   ├── partials/
│   │   ├── navbar.html
│   │   └── footer.html
│   ├── robots.txt
│   ├── sitemap.xml                # قد يُولَّد ديناميكياً من السيرفر
│   └── manifest.json
├── config/
│   ├── nginx-key2lix.example.conf
│   └── Caddyfile.example
├── database/
│   ├── index.js                   # تحميل db.js أو db-pg.js حسب DB_DRIVER
│   ├── db.js                      # SQLite
│   └── db-pg.js                   # PostgreSQL
├── docs/                          # وثائق (API، نشر، أمان، تنظيم)
├── lib/
│   ├── compression-brotli.js
│   ├── session-store-db.js
│   ├── email.js
│   ├── push.js
│   ├── stripe.js
│   ├── s3-upload.js
│   ├── queue.js
│   ├── auth-social.js
│   ├── ai.js
│   └── webhook.js
├── middleware/
│   ├── auth.js                    # requireAdmin, requireVendor, requireAdminOrIntegrationKey
│   └── admin-security.js          # رؤوس، IP، ربط جلسة، CSRF
├── routes/
│   └── pages.js                   # تسجيل مسارات الصفحات HTML فقط
├── scripts/
│   ├── backup.js, backup-scheduled.js
│   ├── check-db.js, run-cluster.js
│   ├── start-server-and-tunnel.js, ngrok-tunnel.js, check-ngrok.js
│   ├── build-assets.js, abandoned-cart-reminder.js
│   ├── seed-clients-from-orders.js
│   └── generate-vapid-keys.js, test-emailjs.js
├── services/
│   └── commissionService.js
├── validators/
│   ├── order.js
│   └── contact.js
├── tests/
│   └── api.test.js
├── e2e/
│   ├── smoke.spec.js
│   └── critical-flows.spec.js
├── .env.example
├── .gitignore, .cursorignore, .dockerignore
├── Dockerfile
├── server.js                      # نقطة الدخول (5000+ سطر)
├── package.json, package-lock.json
├── jest.config.js, playwright.config.js
└── netlify.toml, ecosystem.config.cjs
```

### 3.2 مكتبات `lib/` (تفصيل)

| الملف | الوظيفة | الاعتماديات الرئيسية |
|-------|---------|------------------------|
| `compression-brotli.js` | ضغط Brotli للاستجابة؛ حماية من تعديل الهيدرات بعد الإرسال | — |
| `session-store-db.js` | تخزين جلسات express-session في DB | `database`, `express-session` |
| `email.js` | إرسال بريد (Nodemailer / EmailJS) | `nodemailer`, `db` |
| `push.js` | إشعارات Web Push | `web-push`, `db` |
| `stripe.js` | دفع Stripe و webhook | `stripe` |
| `s3-upload.js` | رفع ملفات إلى S3 | `@aws-sdk/client-s3` |
| `queue.js` | طابور (Bull + Redis إن وُجد) | `bull`, `ioredis` |
| `auth-social.js` | Google/Facebook OAuth | `db` |
| `ai.js` | تكامل OpenAI (توصيات، نصوص) | `openai` |
| `webhook.js` | معالجة webhooks خارجية إن وُجدت | — |

### 3.3 صفحات الواجهة `client/pages/` (مصنفة)

| التصنيف | الملفات |
|---------|---------|
| **دخول وإدارة حسابات** | `login.html`, `client-login.html`, `client-register.html`, `client-forgot-password.html`, `client-reset-password.html`, `client-account.html`, `vendor-login.html`, `vendor-register.html` |
| **تسوق وعرض** | `index.html`, `products.html`, `product.html`, `category.html`, `list.html`, `deals.html`, `cart.html`, `wishlist.html`, `gift.html`, `form.html` |
| **فئات منتجات** | `hardware.html`, `software.html`, `subscriptions.html` |
| **متجر مورد** | `store.html` |
| **تواصل ودعم** | `contact.html`, `support.html`, `order-chat.html`, `status.html` |
| **محتوى ثابت** | `how-to-buy.html`, `how-to-sell.html`, `news.html`, `ads.html`, `partnership.html`, `privacy.html`, `terms.html`, `api.html` |
| **أخرى** | `admin.html`, `vendor.html`, `404.html`, `maintenance.html`, `Key2lix-plus.html` |

**مكونات مشتركة:** يتم تحميل `partials/navbar.html` و `partials/footer.html` من صفحات عديدة؛ أي تغيير في الهيكل المشترك (مثلاً هيدر/فوتر موحد) يمكن تطبيقه عبر هذه الجزئيات أو قالب بسيط لاحقاً.

---

## 4. مسارات الصفحات (من `routes/pages.js`)

| المسار | الملف | ملاحظة |
|--------|--------|--------|
| `/` | (معالجة في server.js ثم pages) | رئيسية؛ ngrok معالجة خاصة |
| `/login` | `login.html` | إن وجدت جلسة أدمن → redirect `/admin` |
| `/client-login`, `/client-register`, `/client-account` | كما في الجدول | — |
| `/client-forgot-password`, `/client-reset-password` | — | — |
| `/order-chat`, `/gift`, `/products`, `/deals`, `/wishlist` | — | — |
| `/list/:shareToken` | `list.html` | — |
| `/cart`, `/contact`, `/support`, `/news`, `/status` | — | — |
| `/key2lix-plus`, `/keylix-plus` | الأخير → redirect 301 إلى `/key2lix-plus` | — |
| `/how-to-sell`, `/api`, `/ads`, `/partnerships`, `/privacy`, `/terms` | — | — |
| `/category`, `/store/:id` | `category.html`, `store.html` | — |
| `/vendor-login`, `/vendor-register` | — | — |
| `/pages/admin.html`, `/pages/login.html`, `/pages/vendor.html` | مع تحقق جلسة و no-cache | — |
| `/docs/openapi.yaml`, `/docs/api` | ملفات من `docs/` | — |

---

## 5. خطة تنفيذ التنظيم (ترتيب مقترح)

### المرحلة 1 — توثيق وتسميات (لا كسر للمنطق)

| # | المهمة | الملفات | التفاصيل |
|---|--------|----------|----------|
| 1.1 | توحيد وصف اسم DB في الوثائق | `docs/DATABASE.md` | فقرة واحدة: افتراضي `key2lix.db`، سلوك `keylix.db` عند الغياب. |
| 1.2 | توحيد رسائل الخطأ التي تذكر اسم الملف | `server.js` (حوالي 2857، 2862) | استخدام عبارة "key2lix.db (أو keylix.db للتوافق)". |
| 1.3 | إضافة README في الجذر إن لم يكن موجوداً | `README.md` | رابط إلى `docs/` وفهرس قصير (كما في مستودع GitHub). |

### المرحلة 2 — فصل مسارات الاختبار السريع ✅ منفذة

| # | المهمة | الملفات | التفاصيل |
|---|--------|----------|----------|
| 2.1 | استخراج مسارات ثابتة وسريعة | `routes/static.js` | `GET /ping`, `/api/ok`, `/robots.txt`, `/favicon.ico`؛ `registerStatic(app)` من `server.js` قبل الجلسة. |
| 2.2 | استخراج Health و Version | `routes/health.js` | `GET /health`, `GET /api/version`؛ `registerHealth(app, { db, appVersion })`. |

### المرحلة 3 — فصل كتل API كبيرة (على مراحل)

| # | المهمة | الملفات | الحالة |
|---|--------|----------|--------|
| 3.1 | مسارات العميل `/api/client/*`, `/api/list/*`, إشعارات، قوائم، متاجر | `routes/client-api.js` | ✅ منفذ — `registerClientApi(app, opts)`؛ opts: db, logger, express, getBcrypt, emailService, queue, normalizeClientEmail, clientLoginAttempts, CLIENT_LOGIN_MAX, CLIENT_LOCK_MS. |
| 3.2 | مسارات الأدمن `/api/admin/*` (ما عدا auth) | `routes/admin-api.js` | ✅ منفذ — `registerAdminApi(app, opts)`؛ يشمل csrf-token، طلبات، كوبونات، تقارير، إعدادات، نسخ احتياطي، موضوع، حذف مورد/عميل/طلب، شكاوى. |
| 3.3 | مسارات المورد `/api/vendor/*` | `routes/vendor-api.js` | ✅ منفذ — `registerVendorApi(app, opts)`؛ opts: db, logger, express, getBcrypt, getSpeakeasy, getQRCode, getUpload, requireVendor, requireVendorOrApiKey, processImageToWebP, maybeUploadImagesToS3, invalidateProductsCache, getPDFDocument, commissionService, auditLog, pushService, emailService, queue, normalizeClientEmail, body, validationResult, sentry. |
| 3.4 | Integration API | `routes/integration.js` | ✅ منفذ — `registerIntegration(app, { db, requireAdminOrIntegrationKey })`. |

### المرحلة 4 — الواجهة الأمامية (اختياري)

| # | المهمة | التفاصيل |
|---|--------|----------|
| 4.1 | توحيد تحميل الجزئيات | التأكد أن كل صفحة تستخدم نفس آلية تحميل `navbar` و `footer` (مثلاً من common.js). |
| 4.2 | مراجعة ترجمات lang.js | عند إضافة مفتاح جديد إضافته في `ar` و `en`؛ استخدام نصوص احتياطية في الصفحات الحساسة (مثل login). |
| 4.3 | (مستقبلي) قوالب أو مكونات مشتركة | استخراج هيكل مشترك للبطاقات أو النماذج إن رغبت بتقليل التكرار. |

### المرحلة 5 — CI والجودة

| # | المهمة | الملفات | التفاصيل |
|---|--------|----------|----------|
| 5.1 | خطوة بناء في CI إن وُجدت | `.github/workflows/ci.yml` | تشغيل `npm run build` إن كان مطلوباً للنشر. |
| 5.2 | Lint (اختياري) | إضافة eslint أو غيره | تشغيله في CI بعد `npm ci`. |

---

## 6. فحص سريع قبل أي إطلاق

- [ ] `SESSION_SECRET` مضبوط وقوي (32+ حرفاً) في الإنتاج.
- [ ] `ADMIN_USER` و `ADMIN_PASS` غير الافتراضيين في الإنتاج.
- [ ] `DB_FILENAME` أو المسار الفعلي للـ DB معروف ومتوافق مع النسخ الاحتياطي.
- [ ] متغيرات البريد (SMTP أو EmailJS) مضبوطة إن كان إرسال البريد مطلوباً.
- [ ] في Railway: مراجعة `PORT`، حجم الذاكرة، ومسار volume للـ DB إن استخدمت SQLite.
- [ ] بعد تعديل مسارات أو تقسيم ملفات: تشغيل `npm test` واختبارات E2E إن وُجدت.

---

---

## 7. تنفيذ مرحلة 3 (ملخص)

- **تم:** `routes/static.js`, `routes/health.js`, `routes/integration.js`, `routes/client-api.js`, `routes/vendor-api.js`. مسارات العميل نُقلت إلى `client-api.js`. مسارات المورد (تسجيل، دخول، 2FA، ملف شخصي، مفاتيح API، webhook، منتجات، طلبات، تقارير، استيراد كتالوج، تسوية PDF، تحديث حالة الطلبات) نُقلت بالكامل إلى `routes/vendor-api.js` مع تمرير التبعيات عبر `opts`.
- **منفذ:** مسارات الأدمن (`/api/admin/*` ما عدا auth) في `routes/admin-api.js` عبر `registerAdminApi(app, opts)` مع تمرير `auditLog`, `getPDFDocument`, `getExcelJS` وغيرها.

### تنفيذ مرحلة 4 و 5

- **4.1 (تم):** تحميل الـ navbar والـ footer موحّد في كل الصفحات: وجود `<div id="navbar"></div>` و `<div id="footer"></div>` مع تحميل الجزئيات من `common.js` عبر `loadPartial('navbar'|'footer', '/partials/...')` ثم `afterPartialsLoaded`.
- **5.1 (تم):** في `.github/workflows/ci.yml` أُضيفت خطوة `npm run build` بعد `npm ci` لضمان نجاح بناء الـ assets (نسخ client→dist وتصغير JS/CSS).

_آخر تحديث: آذار 2026 — مرتبط بمراجعة بنية مشروع Key2lix._
