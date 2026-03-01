# بوابة الدفع — Stripe

تكامل Stripe للدفع بالبطاقة (DZD). اختياري — عند عدم إعداد المفاتيح تعمل المنصة بدون بوابة دفع (الدفع عند الاستلام أو تحويل بنكي).

---

## 1. الإعداد

أضف إلى `.env`:

```
STRIPE_SECRET_KEY=sk_test_xxx   # أو sk_live_xxx في الإنتاج
STRIPE_PUBLISHABLE_KEY=pk_test_xxx  # اختياري للواجهة
STRIPE_WEBHOOK_SECRET=whsec_xxx    # مطلوب لاستلام تأكيد الدفع
```

---

## 2. التدفق

1. **إنشاء الطلب**: العميل يقدّم طلباً عبر `POST /api/order` كما هو معتاد.
2. **جلسة الدفع**: العميل يطلب جلسة Stripe Checkout عبر:
   ```
   POST /api/payment/create-session
   Content-Type: application/json
   { "orderId": "ORD-XXX" }
   ```
3. **الاستجابة**: `{ "url": "https://checkout.stripe.com/..." }` — إعادة توجيه العميل لهذا الرابط.
4. **بعد الدفع**: Stripe يُرسل حدث `checkout.session.completed` إلى الـ webhook.
5. **Webhook**: `POST /api/payment/webhook` — يحدّث `payment_status='paid'` للطلب.

---

## 3. Webhook

من [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks) أضف نقطة النهاية:

- **URL:** `https://key2lix.com/api/payment/webhook`
- **أحداث:** `checkout.session.completed`
- انسخ **Signing secret** وضعه في `STRIPE_WEBHOOK_SECRET`.

---

## 4. API

| النقطة | الطريقة | الوصف |
|--------|---------|-------|
| `/api/payment/create-session` | POST | إنشاء جلسة Stripe Checkout لطلب (يتطلب جلسة عميل) |
| `/api/payment/webhook` | POST | استقبال أحداث Stripe (يجب أن يُستدعى من Stripe فقط) |

---

## 5. قاعدة البيانات

أعمدة جديدة في جدول `orders`:

- `payment_status` — قيمة مثل `paid` عند تأكيد الدفع
- `stripe_session_id` — معرف جلسة Stripe

الترحيل يُطبق تلقائياً عند بدء التشغيل.

---

## 6. العملة

تُستخدم `dzd` (الدينار الجزائري). Stripe يدعم DZD بدون خانات عشرية؛ القيمة تُرسل بوحدة الدينار (مثلاً 5000 د.ج = 5000).
