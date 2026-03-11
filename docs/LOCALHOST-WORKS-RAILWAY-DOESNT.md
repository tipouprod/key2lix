# localhost يعمل جيدًا لكن Railway لا يعمل

عندما التطبيق يعمل على **localhost** ولا يعمل (أو تسجيل الدخول/صفحة حسابي لا تعمل) على **Railway**، السبب عادة من **الفرق في البيئة**: متغيرات البيئة، الكوكي، أو عدد النسخ. اتبع القائمة التالية بالترتيب.

---

## 1. التحقق من أن Railway يشغّل التطبيق فعلاً

- افتح **https://key2lix.com/ping** (أو رابط مشروعك على Railway) → يفترض أن ترى `ok`.
- افتح **https://key2lix.com/api/ok** → يفترض أن ترى `{"ok":true,"ts":...}`.

إن لم يظهر ذلك فالمشكلة من التشغيل أو الأمر (مثلاً أمر التشغيل = `npm test` بدل `npm start`). راجع [استكشاف أخطاء Railway](RAILWAY-TROUBLESHOOTING.md) القسم 2 و 5.

---

## 2. التحقق من إعدادات الجلسة على Railway

افتح في المتصفح (على **نفس النطاق** الذي تختبر منه، مثلاً key2lix.com):

**https://key2lix.com/api/session-check**

ستظهر نافذة JSON شبيهة بـ:

```json
{
  "env": "production",
  "sessionStore": "db",
  "cookieDomainSet": false,
  "trustProxy": true
}
```

| الحقل | القيمة المتوقعة على Railway | إن كانت خاطئة |
|-------|-----------------------------|----------------|
| **env** | `production` | إن كانت `development` أضف في Railway → Variables: **NODE_ENV** = `production` ثم Redeploy. |
| **sessionStore** | `db` (موصى به) | إن كانت `memory` وأكثر من نسخة واحدة فالجلسة تضيع. أضف **SESSION_STORE** = `db` ثم Redeploy. |
| **cookieDomainSet** | `false` أو `true` حسب النطاق | إن كان الموقع يُفتح من `https://key2lix.com` لا تضبط **COOKIE_DOMAIN** أو اضبطها **`.key2lix.com`**. إن ضبطتها لـ `www.key2lix.com` فقط والمستخدم يفتح بدون www فالمتصفح لا يرسل الكوكي. |
| **trustProxy** | `true` | يجب أن يكون `true` في الإنتاج (يعتمد على NODE_ENV=production). |

عدّل المتغيرات في Railway ثم **Redeploy** ثم أعد فتح `/api/session-check` للتأكد.

---

## 3. متغيرات البيئة المطلوبة على Railway

في **Railway → مشروعك → الخدمة → Variables** تأكد من:

| المتغير | القيمة | ملاحظة |
|---------|--------|--------|
| **NODE_ENV** | `production` | ضروري لتفعيل trust proxy وكوكي Secure. |
| **SESSION_SECRET** | سلسلة عشوائية قوية (32+ حرفاً) | لا تغيّرها بعد البدء وإلا تُبطَل كل الجلسات. |
| **SESSION_STORE** | `db` | موصى به حتى تُحفظ الجلسات في SQLite وتعمل حتى مع نسخة واحدة. |
| **COOKIE_DOMAIN** | **إما غير مضبوط** أو **`.key2lix.com`** | إن كان الموقع يُفتح من `https://key2lix.com` فقط اتركه غير مضبوط. إن كان يعمل مع `www` وبدون www فاضبط `.key2lix.com` (نقطة في البداية). |
| **ALLOWED_ORIGINS** | اختياري — `https://key2lix.com,https://www.key2lix.com` | للطلبات من نفس النطاق الكود يسمح تلقائياً بنفس النطاق. إن استمرت مشكلة POST (Provisional headers، الطلب لا يصل): أضف صراحة لضمان CORS preflight. |

**لا تضبط PORT** — اترك Railway يضبطه.

---

## 4. عدد النسخ (Replicas)

- في **Railway → Settings → Scaling** (أو ما يعادله) تأكد أن عدد النسخ = **1** ما لم يكن لديك مخزن جلسات مشترك (مثل Redis).
- إن كان العدد أكثر من 1 والجلسات في الذاكرة (`sessionStore: "memory"`) فكل طلب قد يذهب لنسخة مختلفة ولا ترى الجلسة. **الحل:** إما نسخة واحدة، أو **SESSION_STORE=db** حتى تُحفظ الجلسات في قاعدة البيانات.

---

## 5. أمر التشغيل (Start Command)

- في **Settings → Deploy / Start Command** يجب أن يكون: **`npm start`** أو **`node server.js`**.
- لا يكون **`npm test`** — وإلا سترى خطأ `Cannot find module '.../jest/bin/jest.js'` والتطبيق لن يعمل.

---

## 6. اختبار تسجيل الدخول من جهازك ضد Railway

بعد تطبيق الخطوات أعلاه، من مجلد المشروع على جهازك:

```bash
node scripts/test-login-remote.js "بريدك@example.com" "كلمة_المرور"
```

- إن ظهر **`OK — /api/client/me returned loggedIn: true`** فالجلسة تعمل على Railway. إن كانت صفحة «حسابي» لا تزال لا تعمل في المتصفح فجرّب نافذة خاصة أو مسح الكوكيات لـ key2lix.com ثم تسجيل الدخول من جديد.
- إن ظهر **`FAIL — /api/client/me returned loggedIn: false`** فالمشكلة من الكوكي أو النطاق — راجع **COOKIE_DOMAIN** وافتح الموقع دائمًا من **نفس النطاق** (مثلاً دائماً https://key2lix.com أو دائماً مع www).

دليل تفصيلي: [كيف تختبر تسجيل الدخول على الموقع المنشور](TEST-LOGIN-REMOTE.md).

---

## 7. سجلات Railway

في **Deploy Logs** أو **Logs** ابحث عن:

- **`client/me: no session (cookie missing or not in store)`** → الطلب يصل لكن بدون جلسة: إما المتصفح لا يرسل الكوكي (نطاق أو Secure) أو الجلسة غير مخزنة (نسخ متعددة بدون SESSION_STORE=db).
- **`Session save failed after client login`** → فشل حفظ الجلسة (مثلاً SQLite مقفول أو مسار قاعدة البيانات مختلف).

---

## ملخص سريع

1. تأكد أن **/ping** و **/api/ok** يعملان على رابط Railway.
2. افتح **/api/session-check** وتأكد: **env=production**, **sessionStore=db** (موصى به), **trustProxy=true**, و **COOKIE_DOMAIN** إما غير مضبوط أو `.key2lix.com`.
3. في Variables: **NODE_ENV=production**, **SESSION_SECRET** قوي وثابت، **SESSION_STORE=db**.
4. عدد النسخ = **1** أو **SESSION_STORE=db**.
5. أمر التشغيل = **npm start** أو **node server.js**.
6. بعد أي تعديل: **Redeploy** ثم اختبر مرة أخرى (متصفح + سكربت `test-login-remote.js`).

للتفاصيل والأخطاء الأخرى راجع [استكشاف أخطاء النشر على Railway](RAILWAY-TROUBLESHOOTING.md).
