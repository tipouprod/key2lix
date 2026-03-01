# نشر Key2lix خطوة بخطوة (Netlify + Render)

**Netlify** = الواجهة (المحتوى الذي يراه الزائر)  
**Render** = الخادم (تسجيل الدخول، الطلبات، المنتجات، الـ API)

كلاهما مجاني للاستخدام الأساسي.

---

## الجزء 1: نشر الخادم (Backend) على Render

### 1.1 رفع المشروع إلى GitHub

1. أنشئ مستودعاً جديداً على [GitHub](https://github.com) (مثلاً اسمه `key2lix`).
2. على جهازك، داخل مجلد المشروع، نفّذ في الطرفية:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/key2lix.git
   git push -u origin main
   ```
   (استبدل `YOUR-USERNAME` باسم مستخدمك على GitHub.)

### 1.2 إنشاء خدمة على Render

1. ادخل إلى [render.com](https://render.com) وسجّل دخولك (أو أنشئ حساباً، يمكن عبر GitHub).
2. من لوحة التحكم اضغط **New +** ثم **Web Service**.
3. اختر المستودع **key2lix** (أو الاسم الذي أنشأته) وربطه إن طُلب منك.
4. املأ الحقول كالتالي:
   - **Name:** مثلاً `key2lix-api`
   - **Region:** اختر الأقرب لك (مثلاً Frankfurt).
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:**  
     `npm install`
   - **Start Command:**  
     `node server.js` أو `npm start`
   - **Instance Type:** اختر **Free**.

### 1.3 متغيرات البيئة (Environment Variables)

في نفس صفحة إنشاء الخدمة، انزل إلى **Environment Variables** واضغط **Add Environment Variable** وأضف:

| Key             | Value (مثال – غيّر القيم الحقيقية)     |
|-----------------|----------------------------------------|
| `ADMIN_USER`    | odjazzar                               |
| `ADMIN_PASS`    | كلمة المرور التي تستخدمها للأدمن       |
| `SESSION_SECRET`| سلسلة عشوائية طويلة (مثلاً 32 حرفاً)   |

يمكنك توليد سلسلة عشوائية من: [randomkeygen.com](https://randomkeygen.com) (مقطع Code Key).

### 1.4 النشر والحصول على الرابط

1. اضغط **Create Web Service**.
2. انتظر حتى تنتهي عملية البناء والنشر (قد تستغرق بضع دقائق).
3. عند النجاح ستظهر رسالة مثل: **Your service is live at...**
4. انسخ **رابط الخدمة** (مثل `https://key2lix-api-xxxx.onrender.com`) — سنستخدمه في Netlify.

**ملاحظة:** الخطة المجانية على Render تضع الخادم في وضع "نوم" بعد فترة عدم استخدام؛ أول طلب بعدها قد يستغرق 30–60 ثانية حتى يعود الخادم.

### 1.5 (اختياري) إبقاء الخادم مستيقظاً لتجنب انتظار الزائر

لتقليل احتمال أن ينتظر الزائر عند أول زيارة، يمكن إرسال طلب بسيط للخادم كل 10–14 دقيقة حتى لا ينام:

1. استخدم خدمة مجانية مثل **[UptimeRobot](https://uptimerobot.com)** أو **[cron-job.org](https://cron-job.org)**.
2. أنشئ "Monitor" أو "Cron Job" يفتح هذا الرابط كل **14 دقيقة**:
   ```
   https://YOUR-RENDER-URL.onrender.com/
   ```
   (ضع رابط خادمك من Render مكان `YOUR-RENDER-URL.onrender.com`.)
3. بهذا الشكل الخادم يبقى مستيقظاً غالباً، والزوار لا يواجهون التأخير.

---

## الجزء 2: ربط الموقع على Netlify بالخادم على Render

### 2.1 تحديث ملف netlify.toml

1. افتح ملف **`netlify.toml`** في جذر المشروع.
2. ابحث عن السطر:
   ```toml
   to = "https://YOUR-BACKEND-URL.com/api/:splat"
   ```
3. استبدل `YOUR-BACKEND-URL.com` برابط Render الذي نسخته (بدون `/api` في آخره).

   **مثال:** إذا كان الرابط `https://key2lix-api-abc1.onrender.com` فليصبح السطر:
   ```toml
   to = "https://key2lix-api-abc1.onrender.com/api/:splat"
   ```
4. احفظ الملف وارفع التعديل إلى GitHub:
   ```bash
   git add netlify.toml
   git commit -m "Set Render API URL for Netlify"
   git push
   ```

بهذا الشكل، أي طلب من موقعك على Netlify إلى `/api/...` سيُحوَّل تلقائياً إلى خادمك على Render.

---

## الجزء 3: نشر الواجهة على Netlify

### 3.1 ربط المستودع مع Netlify

1. ادخل إلى [netlify.com](https://netlify.com) وسجّل الدخول (يمكن عبر GitHub).
2. اضغط **Add new site** → **Import an existing project**.
3. اختر **GitHub** واختر مستودع **key2lix** (أو اسم مشروعك).
4. في إعدادات البناء:
   - **Branch to deploy:** `main`
   - **Build command:** اتركه **فارغاً** (لا تحتاج خطوة build للواجهة الحالية).
   - **Publish directory:** اكتب `client` ثم اضغط **Deploy site**.

### 3.2 بعد النشر

1. Netlify سيعطيك رابطاً مثل `https://random-name-123.netlify.app`.
2. يمكنك تغيير الاسم من: Site settings → Domain management → Options → Edit site name (مثلاً `key2lix.netlify.app`).
3. جرّب الموقع:
   - الصفحة الرئيسية، المنتجات، Contact.
   - صفحة تسجيل الدخول: `/login` ثم لوحة الأدمن `/admin`.

إذا كان كل شيء مضبوطاً، تسجيل الدخول والطلبات والمنتجات ستعمل عبر خادم Render.

---

## ملخص سريع

| الخطوة | أين | ماذا تفعل |
|--------|-----|------------|
| 1 | GitHub | رفع المشروع (كل الملفات). |
| 2 | Render | New → Web Service، ربط المستودع، Build: `npm install`، Start: `node server.js`، إضافة ADMIN_USER, ADMIN_PASS, SESSION_SECRET، نسخ رابط الخدمة. |
| 3 | المشروع | في `netlify.toml` استبدال `YOUR-BACKEND-URL.com` برابط Render، ثم push إلى GitHub. |
| 4 | Netlify | Import من GitHub، Publish directory: `client`، Deploy. |

---

## استكشاف الأخطاء

- **تسجيل الدخول لا يعمل أو الطلبات لا تُحفظ:** تأكد أن رابط Render في `netlify.toml` صحيح (يبدأ بـ `https://` ولا ينتهي بـ `/api`)، ثم أعد النشر على Netlify بعد التعديل.
- **الصفحة الرئيسية أو المنتجات لا تظهر:** تأكد أن **Publish directory** في Netlify مضبوط على `client` بالضبط.
- **الخادم بطيء جداً عند أول طلب:** هذا متوقع على الخطة المجانية في Render (استيقاظ الخادم من النوم).

بعد اتباع هذه الخطوات، الموقع سيعمل بالكامل (واجهة على Netlify + API على Render) بشكل مجاني.

---

## خطط مستقبلية (للعمل عليها)

- توثيق نطاق مخصص (Custom domain) على Netlify وربط SSL.
- توثيق متغيرات البيئة للواجهة (إن استُخدمت) في Netlify.
- توثيق نشر الواجهة من مجلد `dist/` (بعد `npm run build`) إن أردت تقديم النسخة المُصدّفة من Netlify.
