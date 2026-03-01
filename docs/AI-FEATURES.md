# ميزات الـ AI في Key2lix

تشات بوت، توليد نصوص، تحليل صور، وتوصيات ذكية.

---

## التفعيل

أضف في `.env`:

```env
OPENAI_API_KEY=sk-...your-key...
# اختياري: النموذج (الافتراضي gpt-4o-mini)
# AI_MODEL=gpt-4o-mini
```

ثم أعد تشغيل السيرفر.

---

## الميزات

### 1. تشات بوت
- مساعد دعم واختيار منتجات
- يظهر كزر في الزاوية السفلية عند تفعيل AI
- صفحات: الرئيسية، المنتجات، الدعم

### 2. توليد النصوص
- **وصف المنتج:** `POST /api/ai/generate-description`  
  Body: `{ "name": "Steam 50 DZD", "category": "game_cards", "bulletPoints": ["فوري", "داخل الجزائر"] }`
- **نص ترويجي:** `POST /api/ai/generate-promo`  
  Body: `{ "type": "banner"|"email"|"social", "subject": "...", "topic": "...", "message": "..." }`

### 3. تحليل الصور
- `POST /api/ai/analyze-image`  
  Body: `{ "image": "data:image/png;base64,..." }` أو رابط صورة
- يقيّم جودة الصورة وملاءمتها للمنتج

### 4. توصيات ذكية
- `GET /api/ai/recommendations?category=game_cards&slug=steam-50&limit=8`
- تعتمد على: مشاهدات العميل، طلباته، ونفس الفئة
- تظهر في صفحة المنتج كـ "قد يعجبك أيضاً"

---

## تتبع المشاهدات

عند استدعاء `Key2lixTrack('view_item', { category, subcat, slug })` (كما في صفحة المنتج) تُحفظ المشاهدة في `product_views` لاستخدامها في التوصيات.

---

## Rate Limit

- `/api/ai/*`: 30 طلب / دقيقة لكل IP

---

*آخر تحديث: شباط 2026*
