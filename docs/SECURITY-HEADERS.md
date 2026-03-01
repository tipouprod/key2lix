# رؤوس الأمان (Security Headers) — Key2lix

يتم تطبيق الرؤوس التالية عبر **Helmet** في `server.js` (مع تعطيل HSTS في غير الإنتاج).

## HSTS (HTTP Strict Transport Security)

- **في الإنتاج فقط:** `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- يمنع الهجوم من نوع downgrade (إجبار الاتصال عبر HTTP).
- `max-age=31536000` = سنة واحدة.
- `includeSubDomains`: يشمل كل النطاقات الفرعية.
- `preload`: يسمح بإدراج النطاق في قائمة HSTS preload للمتصفحات.

## Content Security Policy (CSP)

- **default-src:** `'self'`
- **script-src:** `'self'`, `'unsafe-inline'`, `'unsafe-eval'`, `https://cdn.jsdelivr.net`, `https://browser.sentry-cdn.com`
- **style-src:** `'self'`, `'unsafe-inline'`, `https://cdnjs.cloudflare.com`, `https://fonts.googleapis.com`
- **img-src:** `'self'`, `data:`
- **connect-src:** `'self'`, `https://*.ingest.sentry.io` (وفي التطوير: localhost)
- **font-src:** `'self'`, `https://cdnjs.cloudflare.com`, `https://fonts.gstatic.com`
- **frame-src / frame-ancestors:** تقييد الإطارات لمنع clickjacking (مثلاً `'self'` و Google إن وُجد).
- **object-src:** `'none'`
- **upgrade-insecure-requests:** في الإنتاج فقط (ترقية طلبات HTTP إلى HTTPS).

## X-Frame-Options

يتم التعامل معها عبر Helmet؛ **frame-ancestors** في CSP يقي من عرض الصفحة داخل iframe من نطاق غير مسموح (حماية من clickjacking).

## ملاحظات

- في **التطوير** (غير الإنتاج) لا يُفعَّل HSTS ولا `upgrade-insecure-requests` لتسهيل العمل على localhost.
- لتخصيص CSP أو HSTS راجع إعداد `helmet()` في `server.js`.
