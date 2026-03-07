# مسارات Key2lix (routes)

هذا المجلد يجمّع تسجيل المسارات المنقولة من `server.js` لتحسين القراءة والصيانة.

## الملفات الحالية

| الملف | الوظيفة | الاستدعاء من server.js |
|-------|----------|-------------------------|
| **pages.js** | مسارات الصفحات HTML (login، client-account، products، إلخ) وخدمة index مع ngrok | `registerPages(app, opts)` بعد تعريف sendPage و CLIENT_ROOT |
| **static.js** | مسارات سريعة بدون جلسة: `/ping`, `/api/ok`, `/robots.txt`, `/favicon.ico` | `registerStatic(app)` بعد express.json وقبل الجلسة |
| **health.js** | `/health`, `/api/version` — للموازنات والمراقبة | `registerHealth(app, { db, appVersion })` بعد rate limits |
| **integration.js** | `/api/integration/*` — تكامل ERP/محاسبة (مفتاح API أو جلسة أدمن) | `registerIntegration(app, { db, requireAdminOrIntegrationKey })` |
| **client-api.js** | `/api/client/*`, `/api/list/*`, occasion-reminders، notifications، featured-stores، vendor-store، read-order-chat | `registerClientApi(app, { db, logger, express, getBcrypt, emailService, queue, normalizeClientEmail, clientLoginAttempts, CLIENT_LOGIN_MAX, CLIENT_LOCK_MS })` |
| **vendor-api.js** | `/api/vendor/*` — تسجيل، دخول، 2FA، ملف شخصي، مفاتيح API، webhook، منتجات، طلبات، تقارير، استيراد كتالوج، تسوية PDF | `registerVendorApi(app, { db, logger, express, getBcrypt, getSpeakeasy, getQRCode, getUpload, requireVendor, requireVendorOrApiKey, processImageToWebP, maybeUploadImagesToS3, invalidateProductsCache, getPDFDocument, commissionService, auditLog, pushService, emailService, queue, normalizeClientEmail, body, validationResult, sentry })` |
| **admin-api.js** | `/api/admin/*` (ما عدا auth): csrf-token، طلبات، تصدير، إشعارات، إحصائيات، بحث، كوبونات، تقارير، إعدادات، نسخ احتياطي، موضوع، عملات، منتجات، عملاء، تواصل، حذف مورد/عميل/طلب، شكاوى | `registerAdminApi(app, { db, logger, express, path, fs, requireAdmin, requireAdminRole, getUpload, getExcelJS, getPDFDocument, getBcrypt, getSpeakeasy, processImageToWebP, maybeUploadImagesToS3, invalidateProductsCache, auditLog, commissionService, emailService, queue, rootDir, imgDir, ADMIN_PASS, isAdminTotpEnabled, isProduction, DEFAULT_PRIMARY, DEFAULT_SECONDARY, getHomeSectionsOrder, getHomeSectionsEnabled, adminSecurity, Sentry })` |

## نمط التوسع

عند نقل المزيد من المسارات من `server.js`:

1. **إنشاء ملف جديد** مثل `routes/admin-api.js` أو `routes/client-api.js`.
2. **تصدير دالة واحدة** باسم `registerXxx(app, opts)`.
3. **تمرير التبعيات عبر `opts`** بدل استخدام متغيرات عامة:
   - `db` — وحدة قاعدة البيانات
   - `logger` — السجل
   - دوال المصادقة: `requireAdmin`, `requireVendor`, إلخ.
   - دوال مساعدة إن لزم: `auditLog`, `getClientIP`, `orderValueToAmount`, إلخ.
4. **في server.js:** استدعاء `registerXxx(app, opts)` في المكان المناسب (بعد الـ middleware المطلوب).
5. **توثيق الـ opts** في تعليق أعلى الملف أو في هذا README.

## ترتيب التسجيل في server.js (مختصر)

1. express.json, express.urlencoded  
2. **registerStatic(app)**  
3. GET / (استثناء ngrok)، 404 للبوتات، CORS، session، inactivity  
4. Rate limits  
5. **registerHealth(app, { db, appVersion })**  
6. Request logging، API versioning، admin security، maintenance  
7. Sitemap، منتجات، config، OAuth، theme، push، cart، …  
8. **registerPages(app, opts)**  
9. Auth (login، 2FA، logout)، client API، admin API، vendor API، …  
10. **registerIntegration(app, { db, requireAdminOrIntegrationKey })**  
11. بقية المسارات، ثم 404، ثم بدء الخادم  

راجع [docs/ORGANIZATION-DETAILED.md](../docs/ORGANIZATION-DETAILED.md) لخريطة كاملة ونطاقات الأسطر.
