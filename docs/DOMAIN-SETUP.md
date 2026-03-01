# إعداد الدومين (Domain) لـ Key2lix

بعد شراء الدومين، اتبع الخطوات التالية لربطه بالمشروع.

---

## 1. ملف `.env` (الأهم)

انسخ `.env.example` إلى `.env` إن لم يكن موجوداً، ثم عيّن:

```env
# عنوان الموقع الكامل (بدون / في النهاية)
BASE_URL=https://key2lix.com
SITE_URL=https://key2lix.com
```

هذان المتغيران يُستخدمان في:
- روابط البريد (تأكيد الحساب، إعادة كلمة المرور، إشعارات الطلبات)
- خريطة الموقع (sitemap)
- روابط المنتجات في الإشعارات
- OAuth (Google/Facebook) إن فعّلته

---

## 2. إن كان لديك نطاقات فرعية (www أو غيره)

```env
BASE_URL=https://key2lix.com
SITE_URL=https://key2lix.com
ALLOWED_ORIGINS=https://key2lix.com,https://www.key2lix.com
```

---

## 3. إعداد Nginx أو Caddy

- **Nginx:** انسخ `config/nginx-key2lix.example.conf` — القيمة الافتراضية `server_name key2lix.com www.key2lix.com` جاهزة؛ عدّل فقط `alias /path/to/key2lix/...` إلى المسار الفعلي على السيرفر.
- **Caddy:** انسخ `config/Caddyfile.example` — القيمة الافتراضية `key2lix.com www.key2lix.com` جاهزة.

راجع [REVERSE-PROXY.md](REVERSE-PROXY.md) للتفاصيل.

---

## 4. بريد الدعم — الاستقبال والإرسال

الموقع يعرض **support@key2lix.com** في الفوتر وصفحة الدعم والاتصال. للإرسال من هذا العنوان (تأكيد البريد، إشعارات الطلبات، إعادة كلمة المرور، إلخ):

في **`.env`** ضع إعدادات SMTP لصندوق support@key2lix.com ثم:

```env
NOTIFY_FROM=support@key2lix.com
```

إن تركت `NOTIFY_FROM` دون تعيين، التطبيق يستخدم **support@key2lix.com** تلقائياً كعنوان مرسل افتراضي.

---

## 5. شهادة SSL (HTTPS)

للإنتاج يُفضّل تشغيل الموقع عبر **HTTPS**:

- مع **Nginx:** استخدم Let's Encrypt (مثلاً `certbot`).
- مع **Caddy:** يتولى الحصول على الشهادات تلقائياً.

بعد تفعيل HTTPS، تأكد أن `BASE_URL` و `SITE_URL` في `.env` يبدآن بـ `https://`.

---

## ملخص سريع

| الخطوة | الملف / المكان |
|--------|-----------------|
| عنوان الموقع | `.env` → `BASE_URL` و `SITE_URL` |
| اسم السيرفر (Nginx/Caddy) | `config/nginx-key2lix.example.conf` أو `Caddyfile.example` → `server_name` |
| بريد الدعم | **support@key2lix.com** — مُفعّل في الواجهة والإرسال (NOTIFY_FROM في `.env`) |
| إرسال البريد | `.env` → SMTP_* + `NOTIFY_FROM=support@key2lix.com` |
| OAuth (اختياري) | في Google/Facebook ضع: `https://key2lix.com/api/auth/.../callback` |
