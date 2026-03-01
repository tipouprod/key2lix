# مراجعة المشروع — النقائص (Key2lix)

تمت مراجعة المشروع مقابل الوثائق (VENDOR-PAGE-PLAN، IMPLEMENTATION-ROADMAP، MULTI-VENDOR-MARKETPLACE، API.md، SUGGESTIONS-PRO) والكود الفعلي. هذا الملف يلخص **ما ناقص أو غير مكتمل**.

---

## 1. صفحة الموردين `/how-to-sell` (حسب VENDOR-PAGE-PLAN)

| النقص | التفاصيل |
|--------|----------|
| **صفحة كيفية البيع** | ✅ مكتمل — إزالة "قيد الإنشاء"، هيرو (vendorPageTitle، vendorHeroSubtitle)، قسم "كيف يعمل" (5 خطوات)، جدول العمولة (أقل من 4000 د.ج → 10%، من 4000 فما فوق → 5%)، CTA، ومفاتيح الترجمة في lang.js. |

---

## 2. الترجمة والمحتوى (lang.js + صفحات)

| النقص | التفاصيل |
|--------|----------|
| **ترجمة FAQ (P19)** | ✅ منفذ — نقل كل أسئلة وأجوبة FAQ في `support.html` إلى مفاتيح في `lang.js` (عربي + إنجليزي) مع `data-i18n`؛ البحث يعتمد على النص المعروض فيعمل باللغتين. |
| **صفحة "كيفية الشراء" (P20)** | المحتوى موجود جزئياً؛ التحسين والترجمة الكاملة اختيارية حسب الطريق. |
| **سياسة الخصوصية وشروط الاستخدام (P22)** | الصفحتان تستخدمان `data-i18n` ومفاتيح موجودة — المحتوى عام. إذا المطلوب "صيغ واضحة وقانونية مخصصة" فهي قد تحتاج مراجعة محتوى. |

---

## 3. واجهة برمجة التطبيقات (API) والتوثيق

| النقص | التفاصيل |
|--------|----------|
| **توثيق API.md** | ✅ منفذ — إضافة `GET/POST /api/notifications` و `GET/POST /api/reviews` و `PATCH /api/vendor/orders/:id/estimated-delivery` في docs/API.md. |
| **إصدار API (N9)** | لم يُنفّذ: قبول رأس أو مسار مثل `/api/v1/...` للسماح بتطور الـ API دون كسر الواجهات. |

---

## 4. أمان وتشغيل

| النقص | التفاصيل |
|--------|----------|
| **CORS صريح للإنتاج (N3)** | ✅ منفذ — عند تعيين `ALLOWED_ORIGINS` (قائمة نطاقات مفصولة بفاصلة) يُضاف middleware يسمح بـ Origin وMethods وHeaders؛ موثّق في `.env.example`. |

---

## 5. ميزات من SUGGESTIONS-PRO / الطريق — حالة بعد التنفيذ

| المرجع | الحالة | الملاحظة |
|--------|--------|----------|
| **P3** | ✅ منفذ | تعبئة من localStorage، عدم توجيه فوري للدخول، حفظ عند blur. |
| **P6** | ✅ منفذ | فلتر وسوم + فئة فرعية + "عرض التخفيضات فقط" في صفحة المنتجات. |
| **P7** | ✅ منفذ | إظهار التقييم في البطاقة، API `/api/products/rating-stats`. |
| **P8** | ✅ منفذ | جدول `client_wishlist`، API GET/POST/DELETE، مزامنة من الواجهة مع localStorage. |
| **P9** | موجود | إشعارات و API و navbar — تحسين اختياري. |
| **P10** | ✅ منفذ | واجهة تقارير المورد (أفضل منتجات، مبيعات يومية) في لوحة البائع. |
| **P14** | موثّق | Brotli يُفضّل تفعيله عند الـ reverse proxy (مثل nginx). |
| **P15** | ✅ منفذ | `sizes` على صور المنتجات وصفحة المنتج. |
| **P17** | ✅ منفذ | توثيق في [docs/POSTGRES-MIGRATION.md](POSTGRES-MIGRATION.md). |
| **P19** | ✅ منفذ | ترجمة FAQ كاملة: support.html → lang.js + data-i18n (عربي/إنجليزي)، بحث يعمل باللغتين. |
| **P23** | ✅ منفذ | تحليلات أحداث: `Key2lixTrack(eventName, data)` في common.js، POST /api/track (استقبال اختياري)، موثّق في API.md. |
| **P24** | ✅ منفذ | JSON-LD لمنتج في صفحة المنتج. |
| **P25** | ✅ منفذ | جدول `newsletter`، POST /api/newsletter، GET /api/newsletter/confirm، تأكيد بالبريد. |
| **P26** | ✅ منفذ | روابط السوشيال من `/api/config` و env (SOCIAL_*_URL)، الفوتر يحدّث الروابط. |
| **P27** | ✅ منفذ | اختبارات في tests/api.test.js (health، config، rating-stats، newsletter). |
| **P29** | موثّق | سكربت backup موجود؛ النسخ الخارجي يُجدول عبر cron ثم رفع. |
| **P30** | موجود | N4 Health في نظرة عامة الأدمن. |
| **N3** | ✅ منفذ | CORS: قائمة `ALLOWED_ORIGINS` في server.js و`.env.example`. |
| **N5** | ✅ منفذ | تذكير بالسلة المهجورة: جدول abandoned_cart، POST /api/cart، سكربت scripts/abandoned-cart-reminder.js وثيقة docs/ABANDONED-CART.md؛ الواجهة (استدعاء POST /api/cart عند تغيير السلة) اختيارية. |
| **N7** | ✅ منفذ | عمود `estimated_delivery`، PATCH /api/vendor/orders/:id/estimated-delivery، عرض في طلبات العميل. |
| **N10** | ✅ منفذ | إنشاء thumbnail (300px) عند رفع صورة المنتج، تخزين [thumb, main] في images. |

---

## 6. تحقق سريع من المسارات والصفحات

| العنصر | الحالة |
|--------|--------|
| مسار `/vendor` | محمي بـ `requireVendor` ويخدم `vendor.html` — سليم. |
| مسار `/vendor-login`, `/vendor-register` | موجودان. |
| صفحة 404 | ✅ موجود — `pages/404.html` مع رسالة وزر العودة للرئيسية والمنتجات، وdata-i18n. |
| Sitemap | يتضمن `/how-to-sell`, `/vendor-register`؛ لا يتضمن `/vendor` (محمي) — متوقع. |
| لوحة البائع — اقتراحات | وثيقة [VENDOR-DASHBOARD-SUGGESTIONS.md](VENDOR-DASHBOARD-SUGGESTIONS.md) لاقتراحات مستقبلية ومطوّرة (منتجات، طلبات، تقارير، API، إشعارات، إلخ). |

---

## 7. أولوية معالجة مقترحة

1. **قصيرة (فوراً):** ✅ تم — صفحة `/how-to-sell`، ترجمة FAQ، CORS.
2. **متوسطة:** ✅ تم — توثيق API (notifications, reviews، estimated-delivery).
3. **أطول:** ✅ تم — P23 تحليلات أحداث، N5 تذكير بالسلة المهجورة (Backend + سكربت؛ ربط الواجهة بـ POST /api/cart اختياري).

---

*تمت المراجعة مقابل الكود والوثائق في المشروع — شباط 2026.*
