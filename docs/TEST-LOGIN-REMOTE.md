# كيف تختبر تسجيل الدخول على الموقع المنشور (Railway)

هذا دليل تفصيلي لاختبار أن **تسجيل الدخول** و**الجلسة** يعملان على الموقع المنشور (مثلاً key2lix.com على Railway) من جهازك.

---

## ما الذي يختبره السكربت؟

1. يرسل طلب **تسجيل دخول** (POST `/api/client/login`) بالبريد وكلمة المرور.
2. يأخذ **كوكي الجلسة** من رد الخادم.
3. يرسل طلب **تحميل الحساب** (GET `/api/client/me`) مع نفس الكوكي.
4. إن رجع الخادم `loggedIn: true` فالجلسة تعمل؛ وإن رجع `loggedIn: false` فالمشكلة من الكوكي أو إعدادات الجلسة على السيرفر.

---

## المتطلبات

- **Node.js** مثبّت على جهازك (الإصدار 18 أو أحدث يكفي).
- أن يكون المشروع **Key2lix** موجوداً على جهازك (مجلد المشروع).
- **حساب عميل** مسجّل على الموقع (بريد وكلمة مرور تعرفهما).

---

## الخطوة 1: فتح الطرفية (Terminal)

- **Windows:** افتح **PowerShell** أو **CMD** (من قائمة ابدأ اكتب `PowerShell` أو `cmd`).
- **Mac/Linux:** افتح **Terminal**.

---

## الخطوة 2: الانتقال إلى مجلد المشروع

اكتب الأمر التالي (عدّل المسار إذا كان مشروعك في مكان آخر):

**Windows (PowerShell أو CMD):**
```bash
cd C:\Users\TIPOU\Desktop\keylix
```

**Mac/Linux:**
```bash
cd ~/Desktop/keylix
```

ثم اضغط **Enter**.

---

## الخطوة 3: تشغيل السكربت مع بريدك وكلمة المرور

اختر **أحد** الطرق التالية.

### الطريقة الأولى (الأبسط)

استبدل `بريدك@example.com` ببريدك الفعلي و`كلمة_المرور` بكلمة مرورك:

**PowerShell:**
```powershell
node scripts/test-login-remote.js "بريدك@example.com" "كلمة_المرور"
```

**ملاحظة:** إذا كانت كلمة المرور تحتوي على رموز خاصة (مثل `$` أو `"`) قد تحتاج إلى escapها أو استخدام الطريقة الثانية.

**CMD (Windows):**
```cmd
node scripts/test-login-remote.js "بريدك@example.com" "كلمة_المرور"
```

**Mac/Linux:**
```bash
node scripts/test-login-remote.js "بريدك@example.com" "كلمة_المرور"
```

### الطريقة الثانية (باستخدام متغيرات البيئة — أنسب إن كانت كلمة المرور فيها رموز خاصة)

**PowerShell:**
```powershell
$env:TEST_LOGIN_EMAIL="بريدك@example.com"; $env:TEST_LOGIN_PASSWORD="كلمة_المرور"; node scripts/test-login-remote.js
```

**Mac/Linux (Bash):**
```bash
TEST_LOGIN_EMAIL="بريدك@example.com" TEST_LOGIN_PASSWORD="كلمة_المرور" node scripts/test-login-remote.js
```

### إذا كان الموقع على رابط غير key2lix.com

مثلاً رابط Railway المؤقت مثل `https://key2lix-production-xxxx.up.railway.app`:

**PowerShell:**
```powershell
$env:BASE_URL="https://key2lix-production-xxxx.up.railway.app"; node scripts/test-login-remote.js "بريدك@example.com" "كلمة_المرور"
```

**Mac/Linux:**
```bash
BASE_URL=https://key2lix-production-xxxx.up.railway.app node scripts/test-login-remote.js "بريدك@example.com" "كلمة_المرور"
```

---

## الخطوة 4: فهم النتيجة

### إذا نجح الاختبار

ستظهر رسائل شبيهة بما يلي:

```
Testing login at: https://key2lix.com
POST /api/client/login ...
Login response: success=true, redirect= /client-account
Cookie received (first 60 chars): key2lix.sid=...
GET /api/client/me with cookie ...
OK — /api/client/me returned loggedIn: true, email: بريدك@example.com
```

معناه: **تسجيل الدخول والجلسة يعملان** من جهازك ضد الموقع المنشور. إذا كانت صفحة «حسابي» لا تزال لا تعمل في المتصفح، راجع الكوكي والنطاق (مثلاً COOKIE_DOMAIN) في [استكشاف أخطاء Railway](RAILWAY-TROUBLESHOOTING.md).

---

### إذا فشل تسجيل الدخول (401)

مثال:

```
Login failed: 401 البريد الإلكتروني أو كلمة المرور غير صحيحة.
```

معناه: البريد أو كلمة المرور غير صحيحة. تأكد أن الحساب مسجّل على **نفس الموقع** (نفس الرابط الذي في BASE_URL) وأنك تكتب البريد وكلمة المرور بشكل صحيح.

---

### إذا نجح الدخول لكن فشل /api/client/me (FAIL)

مثال:

```
Login response: success=true, redirect= /client-account
Cookie received ...
GET /api/client/me with cookie ...
FAIL — /api/client/me returned loggedIn: false (expected true).
```

معناه: الخادم قبل الدخول لكن **لم يتعرّف على الجلسة** في الطلب الثاني. الأسباب المحتملة:

1. **COOKIE_DOMAIN** على Railway مضبوط بشكل لا يطابق النطاق الذي تختبر منه (مثلاً تختبر من railway.app والموقع مضبوط لـ key2lix.com أو العكس).
2. **عدد نسخ الخدمة** أكثر من 1 والجلسات في الذاكرة (بدون SESSION_STORE=db).
3. **SESSION_SECRET** تغيّر بعد إنشاء الجلسة.

الحلول: راجع قسم «تسجيل الدخول يعمل لكن صفحة حسابي تظهر كضيف» في [RAILWAY-TROUBLESHOOTING.md](RAILWAY-TROUBLESHOOTING.md).

---

### إذا ظهر خطأ اتصال (Connection error / ECONNREFUSED / timeout)

معناه: جهازك لا يصل إلى الموقع (شبكة، حظر، أو الموقع غير شغّال). تأكد أن:

- الموقع يعمل من المتصفح (افتح https://key2lix.com).
- لم تُغيّر BASE_URL لرابط خاطئ أو محلي.

---

## ملخص سريع

| ما تفعله | الأمر (عدّل البريد وكلمة المرور) |
|----------|----------------------------------|
| اختبار key2lix.com | `node scripts/test-login-remote.js "بريدك@example.com" "كلمة_المرور"` |
| اختبار رابط Railway آخر | `BASE_URL=https://رابط-railway node scripts/test-login-remote.js "بريدك" "كلمة_المرور"` |
| استخدام متغيرات البيئة (PowerShell) | `$env:TEST_LOGIN_EMAIL="بريدك"; $env:TEST_LOGIN_PASSWORD="كلمة_المرور"; node scripts/test-login-remote.js` |

بعد التشغيل، انظر إلى آخر سطر: **OK** = الجلسة تعمل، **FAIL** أو **Login failed** = راجع الرسالة والقسم المناسب في التوثيق.
