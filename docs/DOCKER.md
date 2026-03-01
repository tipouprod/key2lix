# تشغيل Key2lix داخل Docker

## بناء وتشغيل الصورة

```bash
# بناء الصورة
docker build -t key2lix .

# تشغيل الحاوية (المنفذ 3000)
docker run -p 3000:3000 --env-file .env key2lix
```

بدون ملف `.env` يمكن تمرير المتغيرات يدوياً:

```bash
docker run -p 3000:3000 \
  -e PORT=3000 \
  -e ADMIN_USER=admin \
  -e ADMIN_PASS=yourpassword \
  -e SESSION_SECRET=your-secret \
  -e COMMISSION_DZD=300 \
  key2lix
```

## الاحتفاظ ببيانات SQLite

لحفظ قاعدة البيانات بين إعادة تشغيل الحاوية، استخدم مجلداً محلياً:

```bash
docker run -p 3000:3000 -v "$(pwd)/client/data:/app/client/data" --env-file .env key2lix
```

- **Windows (PowerShell):** استبدل `$(pwd)` بـ `${PWD}` أو المسار الكامل لمجلد المشروع.

## إيقاف التشغيل

```bash
docker stop <container_id>
```

للحصول على معرف الحاوية: `docker ps`.

---

## خطط مستقبلية (للعمل عليها)

- إضافة `docker-compose.yml` لتشغيل السيرفر مع خدمات إضافية (مثلاً Redis أو Nginx) إن لزم.
- توثيق بناء نسخة إنتاج (multi-stage build) لتصغير حجم الصورة.
