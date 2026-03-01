# واجهة API للتكامل — ERP / محاسبة

للتكامل مع أنظمة ERP أو المحاسبة، يمكن استخدام مفتاح API خاص يسمح بالوصول إلى ملخصات الطلبات والعمولات دون جلسة أدمن.

---

## إعداد المفتاح

1. أضف في `.env`:
   ```env
   INTEGRATION_API_KEY=your-secure-random-key-here
   ```
2. يفضّل أن يكون المفتاح 32+ حرفاً عشوائياً (مثلاً `openssl rand -hex 32`).

---

## المصادقة

أرسل المفتاح في أحد الشكلين:

- **رأس HTTP:** `X-API-Key: <your-key>`
- **أو:** `Authorization: Bearer <your-key>`

جميع المسارات أدناه تقبل **جلسة أدمن** أو **مفتاح التكامل**.

---

## المسارات

### ملخص الطلبات

```
GET /api/integration/orders-summary?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
```

**Query (اختياري):**
- `date_from` — بداية الفترة
- `date_to` — نهاية الفترة

**الاستجابة (200):**
```json
{
  "totalOrders": 150,
  "completedOrders": 120,
  "totalSales": 2500000,
  "totalCommission": 125000,
  "period": { "from": "2026-01-01", "to": "2026-02-25" }
}
```

---

### ملخص العمولات حسب المورد

```
GET /api/integration/commissions-summary?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
```

**Query (اختياري):** `date_from`, `date_to`

**الاستجابة (200):**
```json
{
  "totalCommission": 125000,
  "byVendor": [
    { "vendor_id": 1, "vendor_name": "مورد 1", "totalCommission": 80000, "orderCount": 45 },
    { "vendor_id": 2, "vendor_name": "مورد 2", "totalCommission": 45000, "orderCount": 30 }
  ],
  "period": { "from": "2026-01-01", "to": "2026-02-25" }
}
```

---

### قائمة الطلبات

```
GET /api/integration/orders?date_from=&date_to=&vendor_id=&limit=50&offset=0
```

**Query (اختياري):**
- `date_from`, `date_to` — فلترة حسب التاريخ
- `vendor_id` — فلترة حسب المورد
- `limit` — عدد النتائج (1–500، افتراضي 50)
- `offset` — للإرساع

**الاستجابة (200):**
```json
{
  "orders": [ { "id", "date", "product", "value", "status", "vendor_id", "vendor_name", "commission_amount", ... } ],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

---

## حدّ الطلبات (Rate Limit)

ينطبق الحد العام لـ `/api`: 150 طلب / 15 دقيقة لكل IP.

---

*آخر تحديث: شباط 2026*
