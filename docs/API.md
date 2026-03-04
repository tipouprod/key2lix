# توثيق API — Key2lix

مرجع سريع لنقاط النهاية العامة والمحمية. للاستخدام الداخلي أو تكامل طرف ثالث.

---

## أساسيات

- **Base URL:** نفس نطاق الموقع (مثلاً `https://key2lix.com`).
- **إصدار API (Versioning):** المسارات تعمل تحت `/api/...` و **تحت `/api/v1/...`** بنفس السلوك (مثلاً `GET /api/v1/orders` = `GET /api/orders`). إدخال v2 لاحقاً دون كسر عملاء v1.
- **الجلسات:** تُستخدم cookies لجلسة الأدمن (`/api/login`) أو العميل (`/api/client/login`) أو المورد (`/api/vendor/login`). أرسل `credentials: 'include'` في طلبات `fetch` من نفس المصدر.
- **Rate limits:**
  - عام `/api`: 150 طلب / 15 دقيقة.
  - `/api/order`, `/api/contact`: 10 / 15 دقيقة.
  - تسجيل الدخول (admin, client, vendor): 8 / 15 دقيقة.
- **حجم الطلب:** حد افتراضي 500kb لـ body (قابل للتعديل عبر `BODY_LIMIT`).

---

## نقاط عامة (بدون مصادقة)

### Health

```
GET /health
```

**الاستجابة (200):**
```json
{ "status": "ok", "db": "connected", "uptime": 12345 }
```

**الاستجابة (503 عند فشل DB):**
```json
{ "status": "error", "db": "disconnected", "error": "..." }
```

---

### إعدادات العمولة (للموردين والمعاينة)

```
GET /api/settings/commission
```

**الاستجابة (200):**
```json
{
  "threshold": 4000,
  "rate_below": 0.1,
  "rate_above": 0.05
}
```

- `threshold`: عتبة السعر (DZD). أقل من العتبة → `rate_below`، من العتبة فما فوق → `rate_above`.

---

### إعدادات عامة (للوصف الأمامي)

```
GET /api/config
```

**الاستجابة (200):** كائن بإعدادات عامة للموقع، منها:
- `currencyRates`: أسعار الصرف للعرض فقط، مثلاً `{ "USD": 270, "EUR": 300 }` (عدد الدنانير مقابل 1 USD و 1 EUR).
- حقول أخرى حسب التنفيذ (مثل `sentryDsn`, `env`).

**ملاحظة:** المبالغ في القاعدة والطلبات تبقى بالدينار؛ هذه الأسعار لتحويل العرض في الواجهة فقط.

---

### أسعار الصرف (عرض فقط)

```
GET /api/currency-rates
```

**الاستجابة (200):**
```json
{ "USD": 270, "EUR": 300 }
```

- المعنى: 1 USD = 270 DZD، 1 EUR = 300 DZD. القيم من إعدادات الأدمن أو متغيرات البيئة (`CURRENCY_RATE_USD`, `CURRENCY_RATE_EUR`).

---

### المنتجات (عرض عام)

```
GET /data/products.json
```

**الاستجابة (200):** كائن JSON بالفئات (`game_cards`, `skins`, `hardware`, `software`) وكل فئة تحتوي منتجات بمفتاح (slug) وقيم (name, desc, images, prices, discount, oldPrice, …).

---

## عميل (يحتاج جلسة عميل)

### تسجيل الدخول

```
POST /api/client/login
Content-Type: application/json

{ "email": "user@key2lix.com", "password": "***", "returnUrl": "/optional-path" }
```

**الاستجابة (200):**
```json
{ "success": true, "redirect": "/", "client": { "id": 1, "email": "...", "name": "...", "phone": "..." } }
```

**الاستجابة (401):** `{ "error": "..." }`

---

### بياناتي

```
GET /api/client/me
```

دائماً **200.** مع جلسة عميل: `{ "loggedIn": true, "id", "email", "name", "phone", "address", ... }`. بدون جلسة: `{ "loggedIn": false }`.

---

### طلباتي

```
GET /api/client/orders
```

يتطلب جلسة عميل. **200:** مصفوفة طلبات، كل عنصر: `id`, `date`, `product`, `value`, `name`, `phone`, `email`, `address`, `status` (`pending` | `completed`), `completed_at`, واختياريًا `product_category`, `product_subcat`, `product_slug`.

---

### إنشاء طلب

```
POST /api/order
Content-Type: application/json

{
  "orderId": "ORD-XXXXXX",
  "product": "Product name",
  "value": "5000",
  "name": "Client name",
  "phone": "+213XXXXXXXXX",
  "email": "client@key2lix.com",
  "address": "Optional",
  "product_key": "slug",
  "category": "game_cards",
  "subcat": ""
}
```

- `product_key`, `category`, `subcat`: اختيارية؛ إن وُجدت تُستخدم لحساب العمولة وربط الطلب بالمورد.

**الاستجابة (200):**
```json
{ "success": true, "orderId": "ORD-XXXXXX" }
```

**الاستجابة (401):** يجب تسجيل الدخول كعميل.

---

### بوابة الدفع (Stripe)

```
POST /api/payment/create-session
Content-Type: application/json

{ "orderId": "ORD-XXX" }
```

يتطلب جلسة عميل وامتلاك الطلب. **200:** `{ "url": "https://checkout.stripe.com/..." }` — إعادة توجيه العميل لصفحة الدفع.

**ملاحظة:** يتطلب ضبط `STRIPE_SECRET_KEY` و`STRIPE_WEBHOOK_SECRET`. راجع `docs/PAYMENT.md`.

---

### تحميل فاتورة PDF

```
GET /api/order/:orderId/invoice.pdf
```

يتطلب أن يكون الطلب تابعًا للعميل المسجّل (أو يُرجع الطلب للمصادقة حسب التنفيذ). **200:** ملف PDF. **404:** طلب غير موجود.

---

### الإشعارات (عميل أو مورد)

```
GET /api/notifications
```

يتطلب جلسة عميل أو مورد. **200:**
```json
{
  "notifications": [
    { "id": 1, "type": "new_reply", "title": "...", "link": "/order-chat?order=...", "read": false, "created_at": "..." }
  ],
  "unread": 2
}
```

```
POST /api/notifications/read/:id
```

تعليم إشعار كمقروء. يتطلب جلسة عميل أو مورد. **200:** `{ "success": true }`. **401:** غير مسجّل.

---

### التقييمات والمراجعات (منتج)

```
GET /api/reviews?category=game_cards&slug=product-slug&subcat=
```

**Query:** `category`, `slug` (مطلوبان)، `subcat` (اختياري). **200:**
```json
{
  "stats": { "average": 4.2, "count": 10 },
  "reviews": [
    { "rating": 5, "comment": "...", "created_at": "...", "client_name": "..." }
  ]
}
```

**400:** `category` أو `slug` ناقص.

```
POST /api/reviews
Content-Type: application/json

{ "category": "game_cards", "subcat": "", "slug": "product-slug", "rating": 5, "comment": "Optional text" }
```

يتطلب جلسة عميل. `rating` بين 1 و 5. **200:** `{ "success": true, "stats": { "average", "count" } }`. **400:** تقييم مكرر أو بيانات غير صالحة. **401:** غير مسجّل.

---

## تواصل (عام)

```
POST /api/contact
Content-Type: application/json

{ "name": "...", "email": "...", "subject": "...", "message": "..." }
```

**الاستجابة (200):** `{ "success": true }` أو رسالة خطأ.

---

### تتبع الأحداث (P23 — اختياري)

```
POST /api/track
Content-Type: application/json

{ "event": "view_item", "data": { "productId": "...", "value": 1000 }, "ts": 1234567890 }
```

لا يتطلب مصادقة. يُستخدم من الواجهة عبر `Key2lixTrack(eventName, data)`. **204:** تم استلام الحدث (لا يُرجع جسم). في وضع `LOG_LEVEL=debug` يُسجّل الحدث.

---

### السلة المهجورة (N5 — حفظ سلة للتذكير لاحقاً)

```
POST /api/cart
Content-Type: application/json

{ "email": "guest@key2lix.com", "items": [ { "category": "...", "subcat": "", "slug": "...", "name": "...", "price": 500 } ] }
```

- للعميل المسجّل: يُستنتج `clientId` من الجلسة ولا حاجة لـ `email`.
- للزائر: يُرسل `email` (اختياري) مع `items` لحفظ سلة للتذكير بعد 24 ساعة.
- **200:** `{ "success": true }`. **400:** لا يوجد `email` ولا جلسة عميل.

---

## أدمن (جلسة أدمن)

جميع المسارات أدناه تتطلب تسجيل دخول أدمن (`POST /api/login` ثم استخدام نفس الجلسة).

| Method | المسار | الوصف |
|--------|--------|--------|
| GET | `/api/me` | التحقق من جلسة الأدمن |
| GET | `/api/admin/stats` | إحصائيات: ordersCount, vendorsCount, clientsCount, totalCommission |
| GET | `/api/orders` | قائمة كل الطلبات |
| GET | `/api/contacts` | قائمة رسائل التواصل |
| GET | `/api/clients` | قائمة العملاء |
| GET | `/api/vendors` | قائمة الموردين |
| POST | `/api/vendors/:id/approve` | الموافقة على مورد |
| POST | `/api/vendors/:id/reject` | رفض مورد |
| GET | `/api/admin/orders-pending-vendor-reply` | طلبات بانتظار رد البائع |
| GET | `/api/admin/products-pending` | منتجات قيد المراجعة |
| POST | `/api/admin/products/approve` | اعتماد منتج (body: category, subcat, slug) |
| POST | `/api/admin/products/reject` | رفض منتج |
| GET | `/api/admin/vendor-payments` | مستحقات الموردين |
| POST | `/api/admin/vendor-payments` | تسجيل استلام مبلغ من مورد |
| GET | `/api/admin/reports` | تقارير (query: date_from, date_to, vendor_id) |
| GET | `/api/admin/settings/commission` | إعدادات العمولة (للأدمن) |
| POST | `/api/admin/settings/commission` | حفظ إعدادات العمولة (body: threshold, rate_below, rate_above) |
| GET | `/api/admin/settings/currency` | أسعار الصرف للعرض (يعيد: dzd_per_10_usd, dzd_per_10_eur) |
| POST | `/api/admin/settings/currency` | حفظ أسعار الصرف (body: dzd_per_10_usd, dzd_per_10_eur) — تُخزَّن كسعر الوحدة داخلياً |

---

### إعدادات أسعار الصرف (أدمن)

```
GET /api/admin/settings/currency
```

يتطلب جلسة أدمن. **200:**
```json
{ "dzd_per_10_usd": 2700, "dzd_per_10_eur": 3000 }
```
(المعنى: 10 USD = 2700 د.ج، 10 EUR = 3000 د.ج — للعرض في لوحة الأدمن.)

```
POST /api/admin/settings/currency
Content-Type: application/json

{ "dzd_per_10_usd": 2700, "dzd_per_10_eur": 3000 }
```

يحفظ القيم في `settings` ويُسجّل في سجل التدقيق. **200:** `{ "success": true, "dzd_per_10_usd": 2700, "dzd_per_10_eur": 3000 }`.

---

## مورد (جلسة بائع موافق)

| Method | المسار | الوصف |
|--------|--------|--------|
| POST | `/api/vendor/login` | تسجيل الدخول (body: email, password). إذا كان 2FA مفعّلاً يُرجع `{ requires2FA: true, tempToken }` ويُستكمل بـ verify-login |
| POST | `/api/vendor/logout` | تسجيل الخروج |
| POST | `/api/vendor/logout-all` | تسجيل خروج من جميع الأجهزة (يبطل الجلسات الأخرى؛ يتطلب جلسة بائع) |
| POST | `/api/vendor/2fa/verify-login` | إكمال الدخول بعد 2FA (body: `tempToken`, `code`) |
| GET | `/api/vendor/2fa/setup` | بدء إعداد 2FA (يتطلب جلسة). يُرجع `secret`, `qrUrl` ويخزّن السر في الجلسة |
| POST | `/api/vendor/2fa/verify-setup` | تأكيد تفعيل 2FA (body: `code`) |
| POST | `/api/vendor/2fa/disable` | تعطيل 2FA (body: `password`) |
| GET | `/api/vendor/activity-log` | سجل نشاط البائع (قراءة فقط، آخر 100 حدث) |
| GET | `/api/vendor/me` | بيانات المورد الحالي (يشمل `name`, `phone`, `logo`, `response_time_hours`, `totp_enabled`, `notify_by_email`, `notify_by_dashboard`) |
| PATCH | `/api/vendor/me` | تحديث الملف الشخصي (multipart: `name`, `phone`, `response_time_hours`, اختياري `logo`؛ و`notify_by_email`, `notify_by_dashboard` قيم 0/1) |
| POST | `/api/vendor/change-password` | تغيير كلمة المرور (body: `current_password`, `new_password`) |
| POST | `/api/vendor/api-keys` | إنشاء مفتاح API (body: `name`)؛ يُرجع `id`, `name`, `key` مرة واحدة |
| GET | `/api/vendor/api-keys` | قائمة مفاتيح API (بدون المفتاح الخام) |
| DELETE | `/api/vendor/api-keys/:id` | حذف مفتاح API |
| PATCH | `/api/vendor/webhook` | تعيين/تحديث Webhook URL (body: `webhook_url`)؛ يُرجع `webhook_secret` مرة واحدة |
| GET | `/api/vendor/products` | منتجاتي (جلسة أو مفتاح API) |
| POST | `/api/vendor/products` | إضافة منتج (multipart مع صورة) |
| POST | `/api/vendor/products/update` | تحديث منتج |
| POST | `/api/vendor/products/delete` | حذف منتج |
| GET | `/api/vendor/orders` | طلبات منتجاتي (جلسة أو مفتاح API) |
| GET | `/api/vendor/reports` | تقارير المورد |
| GET | `/api/vendor/payments` | مستحقاتي |
| PATCH | `/api/vendor/orders/:orderId/complete` | تعليم الطلب مكتملاً |
| PATCH | `/api/vendor/orders/:orderId/status` | تغيير حالة الطلب (body: `status`: `"preparing"` أو `"completed"`) |
| PATCH | `/api/vendor/orders/:orderId/estimated-delivery` | تعيين تاريخ التوصيل المتوقع (body: `estimated_delivery`: "YYYY-MM-DD" أو null) |
| GET | `/api/vendor/products/check-slug` | التحقق من تكرار المفتاح (query: `category`, `subcat`, `slug`؛ اختياري: `exclude_category`, `exclude_subcat`, `exclude_slug` للتعديل). يُرجع `{ taken: boolean, by_you?: boolean }` |
| PATCH | `/api/vendor/products/status` | تغيير حالة المنتج (body: `category`, `subcat`, `key`, `status`: `"archived"` أو `"approved"`) |

### مفاتيح API للمورد

يمكن للمورد الوصول إلى **طلباته** و**منتجاته** برمجياً باستخدام مفتاح API بدلاً من الجلسة.

- **إنشاء مفتاح (جلسة مورد فقط):** `POST /api/vendor/api-keys` مع body `{ "name": "وصف اختياري" }`. الاستجابة تحتوي على `id`, `name`, `key` — المفتاح (`key`) يُعاد **مرة واحدة فقط** ويجب تخزينه بأمان.
- **قائمة المفاتيح:** `GET /api/vendor/api-keys` — يُرجع `id`, `name`, `created_at` (بدون المفتاح الخام).
- **حذف مفتاح:** `DELETE /api/vendor/api-keys/:id`.

**استخدام المفتاح:** أرسل المفتاح في أحد الشكلين:
- رأس: `X-API-Key: <key>`
- أو: `Authorization: Bearer <key>`

المسارات التي تقبل الجلسة أو مفتاح API: `GET /api/vendor/orders`, `GET /api/vendor/products`. تطبَّق حدّة **300 طلب / 15 دقيقة** لكل مفتاح.

### Webhooks للطلبات

المورد يمكنه تعيين **عنوان ويب hook** لاستقبال إشعارات عند إنشاء طلب أو تغيير حالته.

- **تعيين/تحديث:** `PATCH /api/vendor/webhook` (جلسة مورد) مع body `{ "webhook_url": "https://..." }`. يُولَّد سر ويُعاد في الاستجابة كـ `webhook_secret` — يُعرض **مرة واحدة** ويُستخدم للتحقق من صحة الطلبات الواردة.

**الأحداث:** يُرسل الخادم طلب POST إلى `webhook_url` عند:
- `order.created` — طلب جديد للمورد.
- `order.status_changed` — تغيير حالة الطلب (مثلاً `preparing`, `completed`).

**Payload (جسم JSON):** `event`, `order_id`, `status`, `created_at`؛ لـ `order.created` يتضمّن أيضاً كائن `order`.

**التحقق من التوقيع:** الرأس `X-Key2lix-Signature: sha256=<hmac_hex>` حيث القيمة HMAC-SHA256 لجسم الطلب (نص JSON كما استُلم) باستخدام `webhook_secret`. يمكن التحقق محلياً باستخدام الدالة المُصدَّرة من `lib/webhook`: `signPayload(secret, body)` ومقارنة الناتج مع القيمة في الرأس.

### بث الإشعارات (SSE) للمورد

```
GET /api/vendor/notifications/stream
```

يتطلب جلسة مورد. بث **Server-Sent Events** يرسل حدثاً عند تغيّر عدد الإشعارات غير المقروءة (طلبات جديدة، ردود، شكاوى). **Payload:** `{ "type": "notifications", "count": number }`. الواجهة الأمامية تعيد الاتصال تلقائياً بعد انقطاع (بفاصل زمني محدود).

---

## API للتكامل (ERP / محاسبة)

للتكامل مع أنظمة ERP أو المحاسبة، استخدم مفتاح `INTEGRATION_API_KEY` في `.env` ثم أرسل الرأس `X-API-Key` أو `Authorization: Bearer <key>`.

| Method | المسار | الوصف |
|--------|--------|--------|
| GET | `/api/integration/orders-summary` | ملخص الطلبات والمبيعات والعمولات (query: date_from, date_to) |
| GET | `/api/integration/commissions-summary` | العمولات حسب المورد (query: date_from, date_to) |
| GET | `/api/integration/orders` | قائمة الطلبات (query: date_from, date_to, vendor_id, limit, offset) |

راجع [docs/API-INTEGRATION.md](API-INTEGRATION.md) للتفاصيل.

---

## Web Push (P3 — يتطلب VAPID keys)

لتوليد المفاتيح: `node scripts/generate-vapid-keys.js` ثم أضف `VAPID_PUBLIC_KEY` و `VAPID_PRIVATE_KEY` إلى `.env`.

```
POST /api/push/subscribe
Content-Type: application/json
{ "subscription": { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } } }
```

يتطلب جلسة عميل أو بائع. يحفظ الاشتراك لإرسال إشعارات عند تحديث الطلب أو رد جديد. **200:** `{ "success": true }`.

`GET /api/config` يرجع `pushEnabled` و `vapidPublicKey` إذا كانت الإشعارات مفعّلة.

---

## AI (اختياري — يتطلب OPENAI_API_KEY)

| Method | المسار | الوصف |
|--------|--------|--------|
| GET | `/api/ai/status` | هل الـ AI مفعّل؟ `{ enabled: true }` |
| POST | `/api/ai/chat` | تشات بوت. Body: `{ "messages": [ { "role": "user", "content": "..." } ] }` |
| POST | `/api/ai/generate-description` | توليد وصف منتج. Body: `{ "name", "category", "bulletPoints"[] }` |
| POST | `/api/ai/generate-promo` | توليد نص ترويجي. Body: `{ "type": "banner"|"email"|"social", "subject", "topic", "message" }` |
| POST | `/api/ai/analyze-image` | تحليل صورة منتج. Body: `{ "image": "data:...base64..." }` |
| GET | `/api/ai/recommendations` | توصيات ذكية. Query: `category`, `subcat`, `slug`, `limit` |

راجع [AI-FEATURES.md](AI-FEATURES.md) للتفاصيل.

---

*آخر تحديث: شباط 2026 — مرجع سريع. للتفاصيل انظر الكود المصدري و [IMPLEMENTATION-ROADMAP.md](IMPLEMENTATION-ROADMAP.md).*
