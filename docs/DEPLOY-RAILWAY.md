# رفع Keylix إلى Railway

## المتطلبات

- حساب على [Railway](https://railway.app) (تسجيل بـ GitHub)
- المشروع على **GitHub** (مستودع Git)

---

## الخطوة 1: رفع المشروع إلى GitHub

إذا لم يكن المشروع على GitHub بعد:

```bash
cd مسار/مجلد/المشروع
git init
git add .
git commit -m "Initial commit"
```

(استبدل `مسار/مجلد/المشروع` بمجلد Keylix عندك، مثلاً على Windows: `cd C:\Users\اسمك\Desktop\keylix`)

أنشئ مستودعاً جديداً على [github.com/new](https://github.com/new) ثم:

```bash
git remote add origin https://github.com/YOUR_USERNAME/keylix.git
git branch -M main
git push -u origin main
```

---

## الخطوة 2: إنشاء مشروع على Railway

1. ادخل إلى [railway.app](https://railway.app) وسجّل الدخول بـ GitHub.
2. اضغط **"New Project"**.
3. اختر **"Deploy from GitHub repo"**.
4. اختر مستودع **keylix** (أو اسم المستودع الذي رفعته).
5. إذا طُلب منك، فعّل **Railway** للوصول إلى المستودع (Authorize).

---

## الخطوة 3: الإعدادات التلقائية

- Railway يكتشف أن المشروع **Node.js** ويشغّل `npm install` ثم `npm start`.
- المنفذ يُعيّن تلقائياً عبر المتغيّر `PORT` (المشروع يدعمه).
- لا حاجة لملف `Procfile` لأن `package.json` يحتوي على `"start": "node server.js"`.

---

## الخطوة 4: تخزين قاعدة البيانات (مهم) — إنشاء Volume

على Railway، القرص **مؤقّت** — قد تُفقد قاعدة SQLite عند إعادة النشر. لتفادي ذلك أضف **Volume** واربطه بمجلد قاعدة البيانات.

### إنشاء Volume من لوحة Railway

1. ادخل إلى [railway.app](https://railway.app) وافتح **مشروعك**.
2. اضغط على **الخدمة (Service)** التي تشغّل التطبيق (مثلاً اسم المستودع أو "keylix").
3. **فتح نافذة إنشاء Volume:**
   - اضغط **⌘K** (Mac) أو **Ctrl+K** (Windows) لفتح **Command Palette**، اكتب **volume** واختر **Create Volume** أو **Add Volume**.
   - أو: انقر بزر الماوس الأيمن على منطقة المشروع (Canvas) واختر **Create Volume**.
4. عند الطلب، اختر **الخدمة** التي تريد ربط الـ Volume بها (نفس خدمة التطبيق).
5. **ضبط Mount Path:** في حقل **Mount Path** أدخل:
   ```
   /app/client/data
   ```
   (التطبيق على Railway داخل `/app`، والمشروع يكتب القاعدة في `client/data`، فيصبح المسار الكامل `/app/client/data`.)
6. احفظ/أنشئ الـ Volume. بعدها يُربَط المجلد بقرص دائم وتُحفظ قاعدة البيانات والنسخ الاحتياطية بين عمليات النشر.

### إنشاء Volume من سطر الأوامر (CLI)

إذا كان لديك [Railway CLI](https://docs.railway.com/develop/cli) مربوطاً بمشروعك:

```bash
railway volume add --mount-path /app/client/data
```

(تأكد أنك داخل مجلد المشروع وربطت `railway link` بالمشروع والخدمة الصحيحة.)

### ملاحظات

- **Mount Path** يجب أن يبدأ بـ `/` (مسار مطلق).
- الـ Volume يُربَط عند **تشغيل** الحاوية وليس أثناء البناء؛ البيانات التي يكتبها التطبيق بعد التشغيل هي التي تُحفظ.
- إن لم تضف Volume، قاعدة البيانات ستعمل لكن قد تُمسح عند إعادة Deploy.

---

## الخطوة 5: المتغيّرات (Environment Variables)

من نفس خدمتك → **Variables** أضف ما تحتاجه، مثلاً:

| المتغيّر | الوصف | مثال |
|----------|--------|------|
| `NODE_ENV` | بيئة التشغيل | `production` |
| `SESSION_SECRET` | **مهم:** سر الجلسات (32+ حرفاً) — وإلا يظهر تحذير | سلسلة عشوائية طويلة |
| `SESSION_STORE` | تخزين الجلسات في قاعدة البيانات (يُزيل تحذير MemoryStore) | `db` |
| `ADMIN_USER` | اسم مستخدم لوحة الأدمن (إن لم يُضبط = `admin`) | اختياري |
| `ADMIN_PASS` | كلمة مرور لوحة الأدمن (إن لم تُضبط = `admin`) | **غيّرها في الإنتاج** |
| `BASE_URL` | رابط الموقع بعد النشر | `https://key2lix-production.up.railway.app` |

- **البريد (اختياري):** لإرسال رمز التحقق وغيره ضع `SMTP_*` أو `EMAILJS_*` في Variables أو من لوحة الأدمن → الإعدادات. لـ **Gmail** استخدم **كلمة مرور التطبيق** (App Password). لـ **PrivateEmail.com** (Namecheap): `SMTP_HOST=mail.privateemail.com`. للمنفذ **465** (موصى به): `SMTP_PORT=465`, `SMTP_SECURE=true`. للمنفذ **587**: `SMTP_PORT=587`, `SMTP_SECURE=false`. إذا ظهر خطأ SSL "wrong version number" فغيّر إلى 465 مع SMTP_SECURE=true.
- **دخول الأدمن (401 على /api/login):** استخدم نفس **اسم المستخدم** و**كلمة المرور** المعرّفين في `ADMIN_USER` و `ADMIN_PASS`. إن لم تضبطهما على Railway فالقيمة الافتراضية هي **admin** / **admin**. إذا غيّرتهما في Variables فاستخدم القيم الجديدة.
- الباقي اختياري (الدفع، إلخ). يمكنك نسخ ما تحتاجه من `.env` المحلي (بدون كلمات السر الحساسة إن أردت).

---

## الخطوة 6: النشر والحصول على الرابط

1. بعد ربط المستودع، Railway يبني المشروع وينشره تلقائياً.
2. من إعدادات الخدمة → **Settings** → **Networking** فعّل **Generate Domain**.
3. سيُعطى لك رابط مثل: `https://key2lix-production.up.railway.app`.
4. ضع هذا الرابط في `BASE_URL` إن أردت (ثم أعد النشر إذا لزم).

---

## التحديثات لاحقاً

بعد أي تعديل على المشروع:

```bash
git add .
git commit -m "وصف التعديل"
git push origin main
```

Railway يعيد البناء والنشر تلقائياً عند كل `push` إلى الفرع المتصل (غالباً `main`).

---

## إذا لم تستطع الدخول لصفحة الأدمن

1. **تسجيل الدخول يعيدك لصفحة الدخول:** تأكد من ضبط `SESSION_STORE=db` في Variables ثم أعد النشر — الجلسات تُحفظ في قاعدة البيانات ولا تضيع عند إعادة التشغيل.
2. **401 أو "Invalid credentials":** استخدم نفس `ADMIN_USER` و `ADMIN_PASS` المضبوطين على Railway (الافتراضي `admin` / `admin`).
3. **افتح الموقع بنفس الرابط دائماً:** استخدم رابط HTTPS (مثل `https://key2lix-production.up.railway.app`) — لا تفتح من `http://` أو من عنوان IP فقط.
4. جرّب من نافذة خاصة أو بعد مسح الكوكيز للموقع إن كان المتصفح يخزن جلسة قديمة.

## كود التحقق لا يصل إلى بريد العميل

1. **تأكد من إعداد البريد:** لوحة الأدمن → الإعدادات → إعدادات البريد. أو ضع في Variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `NOTIFY_FROM`.
2. **Gmail:** استخدم **كلمة مرور التطبيق** (App Password) — لا تعمل كلمة المرور العادية مع SMTP.
3. **راجع سجلات Railway (Logs):** ابحث عن "Email send failed" أو "EAUTH" — ستظهر رسالة توضيحية.
4. **صندوق البريد العشوائي:** تحقق من مجلد السبام.
5. **اختبار الإرسال:** من لوحة الأدمن → إعدادات البريد → أرسل رسالة تجريبية إلى بريدك.

### إذا ظهر Connection timeout (ETIMEDOUT) مع SMTP

قد تحجب Railway منافذ SMTP الصادرة. استخدم **EmailJS** بدلاً من SMTP المباشر:

1. سجّل دخول إلى [EmailJS.com](https://www.emailjs.com) وأنشئ خدمة SMTP مرتبطة ببريدك (مثل PrivateEmail أو Gmail).
2. أنشئ **قالب (Template)** وأضف المتغيرات التي يرسلها التطبيق:
   - **المستلم:** `{{to_email}}`
   - **رمز التحقق:** `{{verify_code}}` أو `{{verification_code}}`
   - **الموضوع (اختياري):** `{{subject}}`
3. من لوحة الأدمن → الإعدادات → إعدادات البريد املأ **فقط** حقول EmailJS:
   - **EmailJS Service ID** (مثل `service_xxxxx`)
   - **EmailJS Template ID**
   - **EmailJS Public Key**
   - **EmailJS Private Key**
4. احفظ ثم جرّب «إرسال تجريبي». فعّل من لوحة EmailJS: Account → Security → **Allow API requests**.

## ملاحظات

- **تحذير MemoryStore:** إذا ظهر تحذير `connect.session() MemoryStore is not designed for a production environment` فغيّر في Variables إلى `SESSION_STORE=db` ثم أعد النشر — ستُخزَّن الجلسات في SQLite ولن يظهر التحذير.
- **الطبقة المجانية:** Railway يعطيك رصيداً شهرياً محدوداً؛ بعدها تحتاج خطة مدفوعة.
- **النوم (Sleep):** في الخطط المجانية قد "ينام" التطبيق بعد عدم استخدام، فأول طلب قد يأخذ بضع ثوانٍ.
- **قاعدة البيانات:** إما تستخدم **Volume** كما أعلاه، أو لاحقاً يمكنك نقل المشروع إلى قاعدة مثل **PostgreSQL** على Railway وتعديل المشروع لاستخدامها (الموجود حالياً SQLite).

### إذا ظهر "This site can't be reached" أو ERR_FAILED

- تأكد أن التطبيق يعمل على Railway: من لوحة المشروع → **Deployments** وتحقق من آخر نشر (Running / Crashed).
- تحقق من **Logs** في Railway: أخطاء عند التشغيل أو عند طلب `/admin` قد تسبب فشل الاتصال.
- الصفحات `/admin` و `/login` لا تمر عبر كاش الـ Service Worker (يتم استثناؤها)؛ إذا استمر الخطأ فالسبب غالباً من الخادم أو الشبكة (انقطاع، مهلة، أو التطبيق متوقف).
- جرّب فتح الموقع من نافذة خاصة (Incognito) أو بعد مسح بيانات الموقع للتأكد من أن نسخة قديمة من الـ SW ليست السبب.
