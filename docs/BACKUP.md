# النسخ الاحتياطي لقاعدة البيانات — Key2lix

ملف قاعدة البيانات: `client/data/key2lix.db` (SQLite).  
إذا ظهرت رسالة «قاعدة البيانات غير موجودة»، راجع [DATABASE.md](DATABASE.md) (الملف يُنشأ تلقائياً عند أول تشغيل للسيرفر).

---

## نسخ احتياطي يدوي

- **سكربت واحد:** `node scripts/backup.js` أو `npm run backup`
- **النتيجة:** نسخة في `client/data/backup/key2lix-YYYY-MM-DD_HH-mm-ss.db`

---

## نسخ احتياطي دوري (جدولة)

### 1. تشغيل السكربت الدوري (Node)

يشغّل نسخة احتياطية فوراً ثم كل 24 ساعة:

```bash
npm run backup:schedule
```

أو مع فاصل مخصص (بالساعات، عبر المتغير البيئي):

```bash
# كل 12 ساعة
set BACKUP_INTERVAL_MS=43200000
node scripts/backup-scheduled.js
```

- **Linux/Mac:** `BACKUP_INTERVAL_MS=43200000 node scripts/backup-scheduled.js`
- الفاصل بالميلي ثانية: 24 ساعة = `86400000`، 12 ساعة = `43200000`.

يمكن تشغيله في الخلفية أو عبر **PM2** مثلاً:

```bash
pm2 start scripts/backup-scheduled.js --name key2lix-backup
```

---

### 2. جدولة عبر Cron (Linux / Mac)

نسخ احتياطي مرة واحدة يومياً الساعة 3 صباحاً:

```bash
crontab -e
```

أضف السطر (عدّل المسار إلى مجلد المشروع):

```
0 3 * * * cd /path/to/key2lix && node scripts/backup.js >> /path/to/key2lix/logs/backup.log 2>&1
```

تأكد من وجود مجلد `logs` إن أردت السجل.

---

### 3. جدولة عبر Task Scheduler (Windows)

1. افتح **المجدول (Task Scheduler)**.
2. **Create Basic Task** — اسم مثل "Key2lix Backup".
3. **Trigger:** Daily، واختر الوقت (مثلاً 3:00 AM).
4. **Action:** Start a program.
   - **Program:** `node`
   - **Arguments:** `scripts/backup.js`
   - **Start in:** المسار الكامل لمجلد المشروع (مثل `C:\Users\...\key2lix`).
5. احفظ المهمة.

يمكنك استخدام المسار الكامل لـ `node` إذا لزم (مثل `C:\Program Files\nodejs\node.exe`).

---

## ملاحظات

- احتفظ بنسخ قديمة أو انقلها لمخزن آخر (قرص آخر، سحابة) حسب الحاجة.
- السكربت ينشئ مجلد `client/data/backup` تلقائياً إن لم يكن موجوداً.

---

## P29: رفع النسخ الاحتياطي إلى السحابة

عند ضبط المتغيرات في `.env`:
- `BACKUP_UPLOAD_ENABLED=1` — تفعيل الرفع
- `BACKUP_S3_BUCKET` — اسم الـ bucket
- `BACKUP_S3_REGION` — المنطقة (افتراضي us-east-1)
- `BACKUP_S3_ACCESS_KEY` أو `AWS_ACCESS_KEY_ID`
- `BACKUP_S3_SECRET_KEY` أو `AWS_SECRET_ACCESS_KEY`
- `BACKUP_S3_ENDPOINT` — اختياري، للـ B2: `https://s3.us-west-002.backblazeb2.com`

بعد النسخ المحلي، تُرفع الملفات تلقائياً إلى `backups/key2lix-YYYY-MM-DD_HH-mm-ss.db`.

- **الاحتفاظ بعدد معيّن من النسخ في السحابة:** `BACKUP_CLOUD_KEEP_COUNT=4` (افتراضي) — يحذف السكربت الأقدم بعد الرفع.

### جدولة أوقات منخفضة الحمل

يُنصح بتشغيل النسخ الاحتياطي في أوقات قليلة الزيارات (مثلاً 3:00 صباحاً) عبر Cron أو Task Scheduler كما في الأقسام أعلاه؛ يقلل ذلك التأثير على الأداء.

### نسخ احتياطي تفاضلي (مستقبلي)

النسخ الحالي كامل (full). النسخ التفاضلي (فقط التغييرات منذ آخر نسخ) يتطلب أدوات خارجية أو دعم من طبقة قاعدة البيانات؛ يمكن استكشافه لاحقاً عند الحاجة.

---

*آخر تحديث: شباط 2025 — راجع [SUGGESTIONS-PRO.md](SUGGESTIONS-PRO.md) (P29) للنسخ الاحتياطي الخارجي.*
