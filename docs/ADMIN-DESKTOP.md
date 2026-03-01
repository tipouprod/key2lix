# Key2lix Admin — تطبيق سطح المكتب

تطبيق Electron لفتح لوحة تحكم الأدمن في نافذة مستقلة على الحاسوب (Windows، macOS، Linux).

---

## المتطلبات

- **Node.js** 18+
- السيرفر Key2lix يعمل (محلياً أو على الشبكة)

---

## التثبيت والتشغيل

```bash
cd admin-desktop
npm install
npm start
```

بشكل افتراضي يفتح التطبيق `http://localhost:3000/admin`. لتغيير العنوان:

```bash
# Windows (PowerShell)
$env:ADMIN_BASE_URL="http://192.168.1.22:3000"; npm start

# Windows (cmd)
set ADMIN_BASE_URL=http://192.168.1.22:3000
npm start

# Linux / macOS
ADMIN_BASE_URL=http://192.168.1.22:3000 npm start
```

أو للإنتاج:
```bash
ADMIN_BASE_URL=https://key2lix.com npm start
```

---

## بناء التطبيق (EXE لـ Windows)

```bash
cd admin-desktop
npm install
npm run build:win
```

الناتج في `admin-desktop/dist/` — ملف `.exe` للتثبيت أو تشغيل مباشر.

### أنظمة أخرى

- **macOS:** `npm run build:mac`
- **Linux:** `npm run build:linux`

---

## وضع التطوير

لفتح أدوات المطور (DevTools):
```bash
npm start -- --dev
```

---

## ملاحظات

- التطبيق يعرض لوحة الأدمن عبر المتصفح المدمج. يجب أن يكون السيرفر متاحاً على العنوان المُعدّ.
- تسجيل الدخول يتم كالمعتاد من صفحة `/login` ثم `/admin`.
- للإنتاج: استخدم `https://` لتأمين الاتصال.

---

*آخر تحديث: شباط 2026*
