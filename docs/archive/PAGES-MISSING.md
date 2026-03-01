# الصفحات الناقصة — مراجعة

مراجعة مسارات السيرفر (`server.js`) مقابل ملفات `client/pages/*.html`.

## المسارات المعرّفة في السيرفر

| المسار | الملف المطلوب | الحالة |
|--------|----------------|--------|
| `/` | index.html | ✅ موجود |
| `/login` | login.html | ✅ موجود |
| `/client-login` | client-login.html | ✅ موجود |
| `/client-register` | client-register.html | ✅ موجود |
| `/client-account` | client-account.html | ✅ موجود |
| `/order-chat` | order-chat.html | ✅ موجود |
| `/products` | products.html | ✅ موجود |
| `/deals` | deals.html | ✅ موجود |
| `/wishlist` | wishlist.html | ✅ موجود |
| `/product.html` | product.html | ✅ موجود |
| `/form.html` | form.html | ✅ موجود |
| `/hardware` | hardware.html | ✅ موجود |
| `/software` | software.html | ✅ موجود |
| `/subscriptions` | subscriptions.html | ✅ موجود |
| `/cart` | cart.html | ✅ موجود |
| `/contact` | contact.html | ✅ موجود |
| `/how-to-buy` | how-to-buy.html | ✅ موجود |
| `/support` | support.html | ✅ موجود |
| `/news` | news.html | ✅ موجود |
| `/key2lix-plus` | Key2lix-plus.html | ✅ موجود |
| `/how-to-sell` | how-to-sell.html | ✅ موجود |
| `/api` | api.html | ✅ موجود |
| `/ads` | ads.html | ✅ موجود |
| `/partnerships` | partnership.html | ✅ موجود |
| `/privacy` | privacy.html | ✅ موجود |
| `/terms` | terms.html | ✅ موجود |
| `/category` | category.html | ✅ موجود |
| `/vendor` | vendor.html | ✅ موجود |
| `/vendor-login` | vendor-login.html | ✅ موجود |
| `/vendor-register` | vendor-register.html | ✅ موجود |
| `/admin` | admin.html | ✅ موجود |

## تم إنشاء الصفحات (11 صفحة) — 2025-02-11

1. **login.html** — تسجيل دخول الأدمن (POST /api/login → /admin)
2. **client-register.html** — تسجيل عميل (POST /api/client/register)
3. **client-account.html** — حساب العميل (طلباتي، /api/client/me و /api/client/orders)
4. **order-chat.html** — محادثة الطلب (placeholder مع ?orderId=)
5. **deals.html** — العروض (من /data/products.json)
6. **wishlist.html** — قائمة الأمنيات (localStorage key2lix_wishlist)
7. **privacy.html** — سياسة الخصوصية (نص ثابت)
8. **terms.html** — الشروط والأحكام (نص ثابت)
9. **vendor.html** — لوحة البائع (/api/vendor/me، /api/vendor/products)
10. **vendor-login.html** — تسجيل دخول البائع (POST /api/vendor/login)
11. **vendor-register.html** — تسجيل بائع (POST /api/vendor/register)

جميع المسارات أعلاه تعيد الآن الصفحة المطلوبة ولا تعود 404.
