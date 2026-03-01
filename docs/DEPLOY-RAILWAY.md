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

## الخطوة 4: تخزين قاعدة البيانات (مهم)

على Railway، القرص **مؤقّت** — قد تُفقد قاعدة SQLite عند إعادة النشر. لتفادي ذلك:

1. في لوحة المشروع على Railway، اضغط على **خدمتك (Service)**.
2. من التبويب **Variables** أو **Settings** ابحث عن **Volumes**.
3. أضف **Volume** واربطه بالمجلد الذي تُحفظ فيه قاعدة البيانات، مثلاً:
   - **Mount Path:** `/app/client/data`
   - (يتطابق مع مسار `client/data` داخل المشروع حيث يوجد `keylix.db`)

بهذا تُحفظ ملفات `client/data` (قاعدة البيانات والنسخ الاحتياطية) بين عمليات النشر.

إن لم تضف Volume، قاعدة البيانات ستعمل لكن قد تُمسح عند إعادة Deploy.

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
| `BASE_URL` | رابط الموقع بعد النشر | `https://your-app.up.railway.app` |

- **البريد (اختياري):** رسالة "No sender configured" تظهر فقط في التطوير. لإرسال البريد في الإنتاج ضع `SMTP_*` أو `EMAILJS_*` في Variables أو من لوحة الأدمن → الإعدادات.
- **دخول الأدمن (401 على /api/login):** استخدم نفس **اسم المستخدم** و**كلمة المرور** المعرّفين في `ADMIN_USER` و `ADMIN_PASS`. إن لم تضبطهما على Railway فالقيمة الافتراضية هي **admin** / **admin**. إذا غيّرتهما في Variables فاستخدم القيم الجديدة.
- الباقي اختياري (الدفع، إلخ). يمكنك نسخ ما تحتاجه من `.env` المحلي (بدون كلمات السر الحساسة إن أردت).

---

## الخطوة 6: النشر والحصول على الرابط

1. بعد ربط المستودع، Railway يبني المشروع وينشره تلقائياً.
2. من إعدادات الخدمة → **Settings** → **Networking** فعّل **Generate Domain**.
3. سيُعطى لك رابط مثل: `https://keylix-production.up.railway.app`.
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

## ملاحظات

- **تحذير MemoryStore:** إذا ظهر تحذير `connect.session() MemoryStore is not designed for a production environment` فغيّر في Variables إلى `SESSION_STORE=db` ثم أعد النشر — ستُخزَّن الجلسات في SQLite ولن يظهر التحذير.
- **الطبقة المجانية:** Railway يعطيك رصيداً شهرياً محدوداً؛ بعدها تحتاج خطة مدفوعة.
- **النوم (Sleep):** في الخطط المجانية قد "ينام" التطبيق بعد عدم استخدام، فأول طلب قد يأخذ بضع ثوانٍ.
- **قاعدة البيانات:** إما تستخدم **Volume** كما أعلاه، أو لاحقاً يمكنك نقل المشروع إلى قاعدة مثل **PostgreSQL** على Railway وتعديل المشروع لاستخدامها (الموجود حالياً SQLite).
