# متغيرات البيئة للنشر على Railway — Key2lix

قائمة **جميع** المتغيرات التي يمكن ضبطها في Railway (أو أي منصة).  
ضع قيمك مكان `*******` أو القيم الافتراضية.

---

## ✅ التي لديك حالياً (أكمل القيم الناقصة إن لزم)

| المتغير | وصف مختصر |
|---------|-----------|
| `ADMIN_USER` | اسم مستخدم لوحة الأدمن |
| `ADMIN_PASS` | كلمة مرور لوحة الأدمن |
| `AWS_ACCESS_KEY_ID` | مفتاح AWS (يُستخدم للنسخ الاحتياطي أو الصور إن لم تُضبط مفاتيح مخصّصة) |
| `BACKUP_S3_ACCESS_KEY` | مفتاح S3/B2 للنسخ الاحتياطي (أو نفس AWS_ACCESS_KEY_ID) |
| `COMMISSION_RATE_ABOVE` | نسبة العمولة للمبلغ ≥ العتبة (مثلاً 0.05 = 5%) |
| `EMAILJS_SERVICE_ID` | EmailJS — يُستخدم فقط إن لم يُضبط SMTP |
| `EMAILJS_TEMPLATE_ID` | قالب EmailJS |
| `EMAILJS_PUBLIC_KEY` | المفتاح العام EmailJS |
| `EMAILJS_PRIVATE_KEY` | المفتاح الخاص EmailJS |
| `IMAGES_S3_ACCESS_KEY` | مفتاح رفع الصور (S3/B2) |
| `IMAGES_S3_SECRET_KEY` | السر لرفع الصور |
| `NOTIFY_FROM` | عنوان المرسل في البريد (مثل support@key2lix.com) |
| `SESSION_STORE` | `db` = تخزين الجلسات في قاعدة البيانات (موصى به على Railway) |
| `SITE_URL` | رابط الموقع الكامل (مثل https://your-app.railway.app) |
| `SMTP_HOST` | خادم SMTP (مثل smtp.gmail.com) |
| `SMTP_PASS` | كلمة مرور SMTP (أو كلمة مرور التطبيق) |
| `SMTP_PORT` | منفذ SMTP (عادة 587) |
| `SMTP_SECURE` | true أو false |
| `SMTP_USER` | مستخدم SMTP (البريد) |
| `STRIPE_SECRET_KEY` | مفتاح Stripe السري (sk_live_ أو sk_test_) |

---

## 🔴 مطلوبة في الإنتاج (يُفضّل إضافتها إن لم تكن عندك)

| المتغير | وصف | مثال |
|---------|-----|------|
| `NODE_ENV` | بيئة التشغيل | `production` |
| `PORT` | **لا تضبطه في Railway.** Railway يحقن `PORT` تلقائياً؛ إن ضبطته يدوياً (مثلاً 3000) قد يسبب "Application failed to respond" لأن الوكيل يتصل بمنفذ آخر. | اتركه غير معرّف في Variables |
| `SESSION_SECRET` | سري قوي (32+ حرفاً) لتوقيع الجلسات | سلسلة عشوائية طويلة |
| `BASE_URL` | رابط الموقع الكامل (للروابط في البريد والسايت ماب) | نفس `SITE_URL` |

---

## 💰 العمولة (إن لم تُضبط من لوحة الأدمن)

| المتغير | وصف | افتراضي |
|---------|-----|---------|
| `COMMISSION_THRESHOLD` | عتبة السعر (د.ج): أقل منها تُطبَّق النسبة الأولى | `4000` |
| `COMMISSION_RATE_BELOW` | نسبة العمولة لأقل من العتبة (مثلاً 0.10 = 10%) | `0.10` |
| `COMMISSION_RATE_ABOVE` | نسبة العمولة من العتبة فما فوق | `0.05` |

---

## 📧 البريد (SMTP كافٍ عادةً؛ EmailJS احتياطي)

لديك: `SMTP_*`, `NOTIFY_FROM`, `EMAILJS_*`.  
لا حاجة لمتغير إضافي إن كان SMTP يعمل.

---

## 📦 النسخ الاحتياطي إلى S3/B2

| المتغير | وصف |
|---------|-----|
| `BACKUP_UPLOAD_ENABLED` | `1` لتفعيل رفع النسخ إلى السحابة |
| `BACKUP_S3_BUCKET` | اسم الـ bucket |
| `BACKUP_S3_REGION` | المنطقة (مثل us-east-1) |
| `BACKUP_S3_ACCESS_KEY` | لديك |
| `BACKUP_S3_SECRET_KEY` | إن لم تُضبط يُستخدم `AWS_SECRET_ACCESS_KEY` |
| `BACKUP_S3_ENDPOINT` | لـ B2 مثلاً: `https://s3.us-west-002.backblazeb2.com` |
| `BACKUP_CLOUD_KEEP_COUNT` | عدد النسخ المحفوظة في السحابة (افتراضي 4) |

---

## 🖼 رفع الصور (S3/B2)

| المتغير | وصف |
|---------|-----|
| `IMAGES_S3_ACCESS_KEY` | لديك |
| `IMAGES_S3_SECRET_KEY` | لديك |
| `IMAGES_S3_BUCKET` | اسم الـ bucket للصور |
| `IMAGES_S3_REGION` | المنطقة (افتراضي us-east-1) |
| `IMAGES_S3_ENDPOINT` | لـ B2 أو S3 متوافق |
| `IMAGES_S3_PUBLIC_URL_BASE` أو `IMAGES_S3_CDN_URL` | رابط أساس لعرض الصور (إن لم يكن نفس الـ bucket) |

---

## 🔒 تأمين الأدمن (اختياري)

| المتغير | وصف | افتراضي |
|---------|-----|---------|
| `ADMIN_IP_ALLOWLIST` | قائمة IP مسموحة (مفصولة بفاصلة)، مثال: `1.2.3.4,10.0.0.0/8` | فارغ = الكل |
| `ADMIN_SESSION_BIND_IP` | `1` ربط الجلسة بالـ IP، `0` تعطيل | مفعّل |
| `ADMIN_SESSION_BIND_UA` | `1` ربط الجلسة بالمتصفح، `0` تعطيل | مفعّل |
| `ADMIN_SESSION_MAX_AGE_HOURS` | أقصى عمر لجلسة الأدمن (ساعات) | `8` |

---

## 🌐 الجلسات والنظام

| المتغير | وصف | افتراضي |
|---------|-----|---------|
| `SESSION_INACTIVITY_MINUTES` | تسجيل خروج تلقائي بعد عدم النشاط (دقائق)، 0 = تعطيل | في الإنتاج 60 |
| `BODY_LIMIT` | حد حجم body الطلب | `500kb` |
| `RATE_LIMIT_API_MAX` | حد طلبات API عامة (كل 15 دقيقة) | `500` |
| `RATE_LIMIT_ORDER_POST_MAX` | حد طلبات POST الطلب | `15` |
| `RATE_LIMIT_ADMIN_MAX` | حد طلبات لوحة الأدمن | `2000` |

---

## 🗄 قاعدة البيانات (Railway)

على Railway غالباً تستخدم **SQLite** (ملف داخل الحاوية) أو **PostgreSQL**.

- **SQLite (افتراضي):** لا تحتاج متغيرات. اختياري: `DB_FILENAME=key2lix.db`
- **PostgreSQL:**  
  `DB_DRIVER=postgres`  
  `DATABASE_URL=postgresql://user:password@host:5432/dbname`

---

## 💳 Stripe

| المتغير | وصف |
|---------|-----|
| `STRIPE_SECRET_KEY` | لديك |
| `STRIPE_PUBLISHABLE_KEY` | للواجهة (إن وُجد دفع من الويب) |
| `STRIPE_WEBHOOK_SECRET` | سر Webhook من لوحة Stripe (لـ /api/payment/webhook) |

---

## 🤖 التكامل والـ API

| المتغير | وصف |
|---------|-----|
| `INTEGRATION_API_KEY` | مفتاح للوصول إلى /api/integration/* بدون جلسة أدمن (ERP/محاسبة) |

---

## 🌍 الموقع والعملات والخصومات

| المتغير | وصف |
|---------|-----|
| `DELIVERY_GUARANTEE_HOURS` | ساعات ضمان التسليم (عرض في الموقع) |
| `FIRST_ORDER_COUPON_CODE` | كود خصم «أول طلب» (عرض في الرئيسية) |
| `CURRENCY_RATE_USD` | 1 USD = X د.ج (للعرض؛ يمكن ضبطه من لوحة الأدمن) |
| `CURRENCY_RATE_EUR` | 1 EUR = X د.ج |
| `WHATSAPP_URL` أو `SOCIAL_WHATSAPP_URL` | رابط واتساب (للفوتر والصفحات) |
| `ALLOWED_ORIGINS` | نطاقات CORS مسموحة (مفصولة بفاصلة) |

---

## 🔐 تسجيل الدخول الاجتماعي (اختياري)

| المتغير | وصف |
|---------|-----|
| `GOOGLE_CLIENT_ID` | معرف عميل Google OAuth |
| `GOOGLE_CLIENT_SECRET` | سر عميل Google |
| `FACEBOOK_APP_ID` | معرف تطبيق Facebook |
| `FACEBOOK_APP_SECRET` | سر تطبيق Facebook |

---

## 📊 مراقبة الأخطاء و AI (اختياري)

| المتغير | وصف |
|---------|-----|
| `SENTRY_DSN` | DSN من Sentry لمراقبة الأخطاء |
| `OPENAI_API_KEY` | مفتاح OpenAI (تشات بوت، توصيات، إلخ) |
| `AI_MODEL` | نموذج OpenAI (مثل gpt-4o-mini) |

---

## 📱 الإشعارات (PWA) (اختياري)

| المتغير | وصف |
|---------|-----|
| `VAPID_PUBLIC_KEY` | مفتاح VAPID عام للإشعارات |
| `VAPID_PRIVATE_KEY` | مفتاح VAPID خاص |
| `VAPID_MAILTO` | بريد جهة الاتصال (للمتطلبات) |

---

## 📬 قوائم الانتظار (Redis) (اختياري)

| المتغير | وصف |
|---------|-----|
| `QUEUE_ENABLED` | `1` لتفعيل قوائم الانتظار (بريد، إلخ) |
| `REDIS_URL` | رابط Redis الكامل أو |
| `REDIS_HOST` + `REDIS_PORT` | مضيف ومنفذ Redis |

---

## ❓ لا أعرف القيم (صور S3 / نسخ احتياطي / Stripe / AWS)

هذه المجموعات **اختيارية**. إن لم تستخدم الميزة، **لا تضف المتغيرات** أو اترك القيم فارغة.

| المجموعة | ماذا يحدث إن لم تضبطها؟ | من أين أحصل على القيم إن أردت استخدامها؟ |
|----------|--------------------------|-------------------------------------------|
| **IMAGES_S3_*** | الصور تُخزَّن على الخادم (مجلد محلي). الموقع يعمل بشكل طبيعي. | **AWS:** من [AWS Console](https://console.aws.amazon.com/iam/) → IAM → مستخدم → مفاتيح وصول. ثم أنشئ S3 bucket واسمه يصبح `IMAGES_S3_BUCKET`. **Backblaze B2:** من [B2 Console](https://secure.backblaze.com/b2_buckets.htm) → Application Key + إنشاء bucket. |
| **BACKUP_S3_*** و **BACKUP_UPLOAD_ENABLED** | النسخ الاحتياطي يبقى محلياً فقط (داخل الحاوية). لا رفع إلى السحابة. | نفس AWS أو B2: bucket آخر للنسخ. اضبط `BACKUP_UPLOAD_ENABLED=1` فقط عندما تكون المفاتيح والـ bucket جاهزة. |
| **AWS_ACCESS_KEY_ID** و **AWS_SECRET_ACCESS_KEY** | تُستخدم فقط كبديل إن لم تضبط `IMAGES_S3_ACCESS_KEY` أو `BACKUP_S3_ACCESS_KEY`. يمكنك الاعتماد على `IMAGES_S3_*` و `BACKUP_S3_*` فقط وترك AWS فارغاً. | من لوحة AWS IAM (مستخدم له صلاحية S3). |
| **STRIPE_*** | الدفع عبر Stripe يكون معطّلاً. الطلبات تعمل بدون دفع إلكتروني (دفع عند الاستلام مثلاً). | إن أردت الدفع بـ Stripe: [Stripe Dashboard](https://dashboard.stripe.com/) → Developers → API keys (`sk_live_...` و `pk_live_...`). Webhooks → إضافة endpoint `https://key2lix.com/api/payment/webhook` ثم انسخ `STRIPE_WEBHOOK_SECRET` (`whsec_...`). |

**خلاصة:** يمكنك تشغيل الموقع على Railway **بدون** أي من هذه القيم. أضفها لاحقاً عندما تنشئ حساب S3/B2 أو Stripe.

---

## 📋 جميع المتغيرات مع القيم (للنسخ إلى Railway)

انسخ الكتلة التالية ثم **استبدل** القيم التي تحمل `ضع_قيمتك` أو `xxx` بقيمك الحقيقية. القيم الأخرى هي افتراضيات جاهزة.

```
NODE_ENV=production
PORT=3000
BASE_URL=https://your-app.railway.app
SITE_URL=https://your-app.railway.app
SESSION_SECRET=2abd9131d367e272dfb3d51d561c57b1e049729f31c2055704651727badd9a41

ADMIN_USER=admin
ADMIN_PASS=ضع_كلمة_مرور_الأدمن

COMMISSION_THRESHOLD=4000
COMMISSION_RATE_BELOW=0.10
COMMISSION_RATE_ABOVE=0.05

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=support@yourdomain.com
SMTP_PASS=ضع_كلمة_مرور_التطبيق
NOTIFY_FROM=support@yourdomain.com

SESSION_STORE=db
SESSION_INACTIVITY_MINUTES=60
-----
IMAGES_S3_ACCESS_KEY=ضع_قيمتك
IMAGES_S3_SECRET_KEY=ضع_قيمتك
IMAGES_S3_BUCKET=اسم-bucket-الصور
IMAGES_S3_REGION=us-east-1
IMAGES_S3_ENDPOINT=
IMAGES_S3_PUBLIC_URL_BASE=

BACKUP_UPLOAD_ENABLED=1
BACKUP_S3_ACCESS_KEY=ضع_قيمتك
BACKUP_S3_SECRET_KEY=ضع_قيمتك
BACKUP_S3_BUCKET=اسم-bucket-النسخ
BACKUP_S3_REGION=us-east-1
BACKUP_S3_ENDPOINT=
BACKUP_CLOUD_KEEP_COUNT=4

AWS_ACCESS_KEY_ID=ضع_قيمتك
AWS_SECRET_ACCESS_KEY=ضع_قيمتك

STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

EMAILJS_SERVICE_ID=service_xxxxx
EMAILJS_TEMPLATE_ID=template_xxxxx
EMAILJS_PUBLIC_KEY=ضع_قيمتك
EMAILJS_PRIVATE_KEY=ضع_قيمتك

ADMIN_SESSION_MAX_AGE_HOURS=8
ADMIN_SESSION_BIND_IP=1
ADMIN_SESSION_BIND_UA=1
ADMIN_IP_ALLOWLIST=

LOG_LEVEL=info
BODY_LIMIT=500kb
RATE_LIMIT_API_MAX=500
RATE_LIMIT_ORDER_POST_MAX=15
RATE_LIMIT_ADMIN_MAX=2000

DB_DRIVER=sqlite
DB_FILENAME=key2lix.db

DELIVERY_GUARANTEE_HOURS=24
FIRST_ORDER_COUPON_CODE=FIRST10
CURRENCY_RATE_USD=270
CURRENCY_RATE_EUR=300

ALLOWED_ORIGINS=
WHATSAPP_URL=https://wa.me/213XXXXXXXXX
SOCIAL_FACEBOOK_URL=
SOCIAL_TWITTER_URL=
SOCIAL_INSTAGRAM_URL=
SOCIAL_YOUTUBE_URL=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=

INTEGRATION_API_KEY=
SENTRY_DSN=
OPENAI_API_KEY=
AI_MODEL=gpt-4o-mini

VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_MAILTO=noreply@yourdomain.com

QUEUE_ENABLED=0
REDIS_URL=
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

**ما معنى QUEUE و Redis؟**  
طابور مهام اختياري (Bull + Redis): بدلاً من إرسال البريد فوراً أثناء الطلب، يُضاف الإرسال إلى طابور ويعالجه «عامل» في الخلفية. النتيجة: استجابة أسرع للمستخدم وتجربة إعادة محاولة عند فشل الإرسال.  
- `QUEUE_ENABLED=0`: الطابور معطّل؛ الإيميلات تُرسل مباشرة (الوضع الافتراضي، لا حاجة لـ Redis).  
- `QUEUE_ENABLED=1`: تحتاج خادم Redis (مثلاً من [Redis Cloud](https://redis.com/try-free/) أو Railway Redis)، ثم ضبط `REDIS_URL` (مثل `redis://default:password@host:port`) أو `REDIS_HOST` + `REDIS_PORT`.

**ملاحظات:**
- `SESSION_SECRET`: ولّد سرياً عشوائياً (مثلاً: `openssl rand -hex 32`).
- `BASE_URL` و `SITE_URL`: ضع رابط موقعك الفعلي من Railway.
- الأسطر الفارغة في القيمة (مثل `ADMIN_IP_ALLOWLIST=`) تعني «بدون قيمة»؛ يمكن حذف المتغير إن لم تحتجه.

### صياغة صحيحة في Railway

لا تضع **مسافة قبل أو بعد** علامة `=`.

| ❌ خاطئ | ✅ صحيح |
|---------|--------|
| `SMTP_HOST ="mail.example.com"` | `SMTP_HOST=mail.example.com` |
| `SMTP_PORT ="465"` | `SMTP_PORT=465` |
| `SMTP_SECURE\t="true"` (تبويب) | `SMTP_SECURE=true` |

في Railway يمكن لصق القيمة مع أو بدون علامات اقتباس؛ يفضّل بدونها إن لم تكن فيها مسافات.

---

### Health Check و PORT على Railway

إذا ظهر "Application failed to respond" أو **الموقع لا يفتح** أو طلبات 499:

1. **احذف متغير PORT من Variables.**  
   Railway يحقن منفذاً تلقائياً (مثلاً 8080). إذا عيّنت `PORT=3000` يدوياً، التطبيق يستمع على 3000 بينما الوكيل يتصل بمنفذ آخر فتبدو الخدمة «لا تستجيب» أو الموقع لا يفتح.
2. في **Settings** للخدمة → **Health Check**:
   - **Path:** `/ping`
   - **Timeout:** مثلاً 10 ثوانٍ.
3. أعد النشر (Redeploy). بعد التشغيل تأكد من فتح **https://key2lix.com** (أو رابط المشروع على Railway)، وليس عنواناً قديماً أو http.

**ملاحظة:** طلبات مثل `POST /` أو `POST /admin` التي تظهر في السجلات كـ 404 عادةً من بوتات؛ التطبيق يرد على **GET /** للصفحة الرئيسية. إن ظهر في السجلات `GET / → 200` فالموقع كان يرد بشكل صحيح في تلك اللحظة.

---

### الموقع لا يفتح (استكشاف الأخطاء)

1. **جرّب رابط Railway الافتراضي**  
   في المشروع: **Settings** أو **Deployments** → انسخ رابط الخدمة (مثل `https://key2lix-production-xxxx.up.railway.app`). افتحه في المتصفح.
   - **إن فتح:** التطبيق يعمل؛ المشكلة من النطاق المخصص (key2lix.com) أو DNS.
   - **إن لم يفتح:** المشكلة من التطبيق أو الإعداد (مثلاً PORT، أو الخدمة متوقفة).

2. **ربط النطاق key2lix.com في Railway**  
   **Settings** → **Networking** / **Domains** → **Custom Domain** → أضف `key2lix.com`. انسخ القيمة التي يعطيك إياها Railway (مثل `cname.railway.app` أو عنواناً للـ CNAME).

3. **إعداد DNS عند مزود النطاق**  
   في لوحة الدومين (Namecheap, GoDaddy, Cloudflare, إلخ):
   - أنشئ سجل **CNAME**: الاسم `key2lix.com` (أو `@` حسب المزود)، والقيمة هي ما نسخته من Railway.
   - أو **A record** إن طلبه Railway بدل CNAME.
   - انتظر 5–60 دقيقة (أحياناً حتى 48 ساعة) لانتشار DNS.

4. **تأكد أن PORT غير معرّف** في **Variables** (احذفه إن وُجد)، ثم **Redeploy**.

---

### الموقع يفتح لكن لا يجلب بيانات

إذا الصفحة تظهر لكن المحتوى (المنتجات، الإحصائيات، إلخ) لا يظهر:

1. **تأكد أنك على نفس النطاق:** افتح الموقع من **https://key2lix.com** (أو رابط Railway نفسه). إن فتحت من ملف محلي (file://) أو نطاق آخر فلن تعمل طلبات الـ API.
2. **افتح أدوات المطوّر (F12)** → تبويب **Network (الشبكة)** → حدّث الصفحة. انظر الطلبات إلى `/api/config`, `/data/products.json`, `/api/stats`:
   - إن كانت **حمراء** أو **فاشلة**: الخادم لا يرد أو يرد بخطأ. راجع **Deploy Logs** على Railway (أخطاء، Out of memory).
   - إن كانت **200** لكن المحتوى لا يظهر: راجع تبويب **Console** لأخطاء JavaScript.
3. **اختبر الـ API يدوياً:** افتح في المتصفح:
   - `https://key2lix.com/api/ok` — يفترض أن ترى `{"ok":true,"ts":...}`.
   - `https://key2lix.com/api/config` — يفترض أن ترى JSON بإعدادات.
   - `https://key2lix.com/data/products.json` — يفترض أن ترى JSON المنتجات.
   إن ظهرت صفحة خطأ أو HTML بدل JSON فالمشكلة من الخادم (تعطل، OOM، أو مسار خاطئ).
4. **إن استمرت المشكلة:** تأكد من **NODE_OPTIONS=--max-old-space-size=384** وعدم نفاد الذاكرة، ثم أعد النشر وراجع السجلات.

---

### Out of memory (نفاد الذاكرة)

إذا ظهر تنبيه **"key2lix out of memory"** أو **"Out of memory"** على Railway:

1. **زيادة ذاكرة الخدمة (الحل الأفضل)**  
   - في Railway: اختر مشروع **key2lix** → الخدمة (Service) → **Settings**.  
   - ابحث عن **Resources** أو **Instance** أو **Memory** أو **Service limits**.  
   - زِد **Memory** إلى **1024 MB (1 GB)** أو أكثر إن كان متاحاً في خطتك.  
   - في الخطط المجانية قد لا يظهر خيار الذاكرة؛ تحتاج عندها **ترقية الخطة** (مثلاً Developer / مدفوعة) لتفعيل زيادة الذاكرة.  
   - بعد التغيير: **Redeploy**.

2. **حد أقصى لذاكرة Node**  
   في **Variables** أضف (مهم لتجنب أكل كل الذاكرة):
   ```
   NODE_OPTIONS=--max-old-space-size=384
   ```
   إن كانت ذاكرة الخدمة **512 MB** استخدم 384. إن زدت الذاكرة إلى **1 GB** استخدم `768`. ثم **Redeploy**.

3. **التطبيق** يؤجل تحميل مكتبات ثقيلة (sharp، PDF، Excel، bcrypt، multer، speakeasy، QRCode) حتى أول طلب يحتاجها. إن استمر التنبيه بعد الخطوتين أعلاه فالمشروع يحتاج **على الأقل 1 GB ذاكرة** — زِدها من إعدادات الخدمة أو انتقل لخطة تسمح بذلك.

*لتفاصيل كل متغير راجع `.env.example` في جذر المشروع.*
