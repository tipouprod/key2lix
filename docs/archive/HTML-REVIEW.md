# مراجعة ملفات HTML — Key2lix

مراجعة وتوحيد صفقات HTML لصفحات المشروع (اتجاه، لغة، إمكانية الوصول، أصول مشتركة).

## التعديلات المُنفذة

### 1. اللغة والاتجاه (lang + dir)
- **توحيد:** جميع الصفحات التي تحتوي محتوى عربي أصبحت `lang="ar" dir="rtl"`.
- **ملفات تم تحديثها:**  
  `index.html`, `product.html`, `form.html`, `404.html`, `category.html`, `products.html`,  
  `contact.html`, `support.html`, `how-to-buy.html`, `news.html`, `admin.html`,  
  `hardware.html`, `software.html`, `subscriptions.html`, `partnership.html`, `how-to-sell.html`,  
  `api.html`, `ads.html`, `Key2lix-plus.html`.
- الصفحات التي كانت بالفعل `lang="ar" dir="rtl"` أو تم توحيدها مسبقاً: `cart.html`, `client-*`, `vendor-*`, `login.html`, `privacy.html`, `terms.html`.

### 2. Font Awesome
- إضافة رابط Font Awesome في الـ `<head>` لجميع الصفحات التي تحتوي على `id="navbar"` (لضمان ظهور أيقونات الشريط بشكل صحيح).
- **ملفات تم تحديثها:**  
  `form.html`, `category.html`, `products.html`, `support.html`, `how-to-buy.html`, `news.html`,  
  `hardware.html`, `software.html`, `skins.html`.
- الصفحات التي كانت تحتوي بالفعل على Font Awesome: `index.html`, `product.html`, `404.html`, `contact.html`, `cart.html`, `privacy.html`, `terms.html`, `partnership.html`, `how-to-sell.html`.

### 3. معلم المحتوى الرئيسي (main)
- إضافة `<main id="main-content">` حول المحتوى الرئيسي في الصفحات التي كانت تفتقده.
- **ملفات تم تحديثها:**  
  `product.html`, `form.html`, `category.html`, `products.html`, `contact.html`,  
  `hardware.html`, `software.html`, `subscriptions.html`, `news.html`.
- إضافة `id="main-content"` لـ `<main>` في `cart.html` (كان يستخدم `class="cart-page"` فقط) ليتوافق مع رابط التخطي (.skip-link).
- الصفحات التي كانت تحتوي بالفعل على `<main>`: `404.html`, `support.html`, `how-to-buy.html`, `privacy.html`, `terms.html`, `partnership.html`.

## ملاحظات

- **صفحات بدون navbar (مثل api, ads, Key2lix-plus):** صفحات "قيد الإنشاء" بسيطة بدون شريط تنقل؛ لم تُضف لها Font Awesome ولا `main` لأنها لا تستخدم الـ navbar.
- **صفحات الدخول (login, vendor-login, client-login, إلخ):** تحتفظ بتصميمها الحالي مع `lang="ar" dir="rtl"` حيث تم توحيدها.
- **إمكانية الوصول:** وجود `main#main-content` يدعم روابط "تخطي إلى المحتوى" والتنقل باللوحة.

## خلاصة

- **29** ملف HTML في `client/pages/`.
- تم توحيد **lang/dir** و**Font Awesome** و**main** في الصفحات ذات الـ navbar والمحتوى العام لتحسين الاتساق وإمكانية الوصول.

---

## خطط مستقبلية (للعمل عليها)

- مراجعة أي صفحة HTML جديدة تُضاف لاحقاً (lang, dir, Font Awesome, main، ومعالم إمكانية الوصول).
- إضافة معالم ARIA لصفحات "قيد الإنشاء" (api، ads، Key2lix-plus) عند تطويرها.
