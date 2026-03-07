# قائمة تنفيذ التنظيم — Key2lix

قائمة مهام مختصرة مرتبطة بـ [ORGANIZATION-DETAILED.md](ORGANIZATION-DETAILED.md). يمكن استخدامها للتتبع عند تنفيذ التنظيم خطوة بخطوة.

---

## المرحلة 1 — توثيق وتسميات

- [x] **1.1** تحديث `docs/DATABASE.md`: فقرة واحدة توحّد وصف الافتراضي `key2lix.db` وسلوك `keylix.db`.
- [x] **1.2** في `server.js`: توحيد نصوص رسائل الخطأ التي تذكر اسم ملف DB (حوالي السطور 2857، 2862).
- [x] **1.3** إنشاء أو تحديث `README.md` في الجذر مع رابط إلى `docs/` وفهرس قصير.

---

## المرحلة 2 — فصل مسارات سريعة

- [x] **2.1** إنشاء `routes/static.js`: نقل `GET /ping`, `/api/ok`, `/robots.txt`, `/favicon.ico`؛ ربطها في `server.js` قبل الجلسة.
- [x] **2.2** نقل `GET /health` و `GET /api/version` إلى `routes/health.js` (أو دمجها في `static.js`) وربطها في `server.js`.

---

## المرحلة 3 — فصل كتل API (اختياري)

- [x] **3.1** إنشاء `routes/client-api.js`: نقل كل مسارات `/api/client/*` و `/api/list/*` و occasion-reminders و notifications و featured-stores و vendor-store؛ تصدير `registerClientApi(app, opts)`.
- [ ] **3.2** إنشاء `routes/admin-api.js` (أو تقسيم إلى ملفات فرعية): نقل مسارات `/api/admin/*` ما عدا auth؛ تصدير `registerAdminRoutes(app, opts)`.
- [x] **3.3** إنشاء `routes/vendor-api.js`: نقل مسارات `/api/vendor/*`؛ تصدير `registerVendorApi(app, opts)`.
- [x] **3.4** إنشاء `routes/integration.js`: نقل مسارات `/api/integration/*`.

---

## المرحلة 4 — الواجهة الأمامية (اختياري)

- [ ] **4.1** مراجعة تحميل `navbar` و `footer` في كل الصفحات (توحيد الآلية).
- [ ] **4.2** مراجعة مفاتيح الترجمة: أي مفتاح جديد يُضاف في `ar` و `en` في `client/assets/js/lang.js`.
- [ ] **4.3** (مستقبلي) استخراج مكونات HTML/JS مشتركة لتقليل التكرار.

---

## المرحلة 5 — CI والجودة

- [ ] **5.1** في `.github/workflows/ci.yml`: إضافة خطوة `npm run build` إن كان البناء مطلوباً للنشر.
- [ ] **5.2** (اختياري) إضافة ESLint أو أداة lint أخرى وتشغيلها في CI.

---

## قبل كل إطلاق (مراجعة سريعة)

- [ ] `SESSION_SECRET` مضبوط وقوي في الإنتاج.
- [ ] `ADMIN_USER` و `ADMIN_PASS` غير الافتراضيين في الإنتاج.
- [ ] مسار/اسم ملف DB معروف ومتوافق مع النسخ الاحتياطي.
- [ ] إعدادات البريد مضبوطة إن لزم.
- [ ] على Railway: PORT، الذاكرة، ومسار volume للـ DB.
- [ ] بعد تعديل مسارات أو ملفات: `npm test` واختبارات E2E.

---

_مرتبط بـ [ORGANIZATION-DETAILED.md](ORGANIZATION-DETAILED.md)._
