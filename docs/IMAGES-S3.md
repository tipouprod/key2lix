# رفع صور المنتجات إلى S3 / Backblaze B2 — Key2lix

عند ضبط المتغيرات التالية في `.env`، تُرفع صور المنتجات (بعد تحويلها إلى WebP وأحجام متعددة) إلى S3 أو Backblaze B2، ويُحذف النسخ المحلية.

---

## المتغيرات المطلوبة

| المتغير | الوصف |
|---------|--------|
| `IMAGES_S3_BUCKET` | اسم الـ bucket |
| `IMAGES_S3_PUBLIC_URL_BASE` أو `IMAGES_S3_CDN_URL` | أساس الرابط العام لتحميل الصور (مثال: `https://cdn.key2lix.com` أو `https://bucket.s3.eu-west-1.amazonaws.com`) — **بدون** شرطة نهائية |

## المتغيرات الاختيارية

| المتغير | الوصف |
|---------|--------|
| `IMAGES_S3_REGION` | المنطقة (افتراضي `us-east-1`) |
| `IMAGES_S3_ACCESS_KEY` | مفتاح الوصول (أو استخدام `AWS_ACCESS_KEY_ID`) |
| `IMAGES_S3_SECRET_KEY` | المفتاح السري (أو استخدام `AWS_SECRET_ACCESS_KEY`) |
| `IMAGES_S3_ENDPOINT` | لـ Backblaze B2: عنوان S3-compatible (مثال: `https://s3.us-west-002.backblazeb2.com`) |

---

## السلوك

- بعد معالجة الصورة (WebP + thumbnail + medium)، إن كان S3 مفعّلاً تُرفع الملفات إلى المسار `products/YYYY-MM/` داخل الـ bucket.
- تُخزَّن في قاعدة البيانات **روابط عامة** (URLs) بدل المسارات المحلية؛ الواجهة تعرض الصور من السحابة.
- يُحذف الملف المحلي بعد الرفع الناجح.

---

## ملاحظات

- تأكد من أن الـ bucket يسمح بالقراءة العامة للصور، أو استخدم CDN (مثل CloudFront) وضَع `IMAGES_S3_PUBLIC_URL_BASE` لرابط الـ CDN.
- للـ Backblaze B2، اضبط سياسة الـ bucket أو استخدم دومين/رابط عام كما في وثائقهم.

*راجع أيضاً [FUTURE-REVIEW.md](FUTURE-REVIEW.md) (قسم التخزين والملفات).*
