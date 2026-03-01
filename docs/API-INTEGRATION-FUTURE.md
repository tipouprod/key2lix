# تكامل API — مفاتيح API و Webhooks

**الحالة:** مُنفَّذ. التفاصيل في [API.md](API.md) (مفاتيح API للمورد، Webhooks للطلبات).

---

## مفتاح API للموردين (API Keys) — مُنفَّذ

- **جدول:** `vendor_api_keys` (`id`, `vendor_id`, `key_hash`, `name`, `created_at`). تخزين هاش SHA-256 للمفتاح.
- **إنشاء/قائمة/حذف:** من لوحة المورد عبر الجلسة: `POST /api/vendor/api-keys`, `GET /api/vendor/api-keys`, `DELETE /api/vendor/api-keys/:id`. المفتاح الخام يُعاد مرة واحدة عند الإنشاء فقط.
- **المصادقة:** رأس `X-API-Key` أو `Authorization: Bearer <key>`. يُطبَّق على `GET /api/vendor/orders` و `GET /api/vendor/products` (جلسة أو مفتاح API).
- **Rate limit:** 300 طلب / 15 دقيقة لكل مفتاح API عند استخدام المفتاح.

---

## Webhooks للطلبات — مُنفَّذ

- **الإعداد:** المورد يضبط URL عبر `PATCH /api/vendor/webhook` (body: `webhook_url`). يُولَّد سر ويُعاد مرة واحدة في الاستجابة.
- **الأحداث:** `order.created` عند إنشاء طلب، `order.status_changed` عند تغيير الحالة (مثلاً `preparing` أو `completed`).
- **Payload:** JSON مثل `{ "event": "order.created" | "order.status_changed", "order_id", "status", "order" (لـ created), "created_at" }`.
- **التوقيع:** رأس `X-Key2lix-Signature: sha256=<hmac_hex>` (HMAC-SHA256 لجسم الطلب باستخدام السر). التحقق: [API.md](API.md#webhooks-للطلبات).
