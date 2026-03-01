# اقتراحات إضافة صور في الصفحة الرئيسية (Index)

يمكنك إضافة الصور في المواضع التالية مع المسار المقترح والجداول الحالية.

---

## 1. **بانر الهيرو (Hero Banner)**
- **الموقع:** خلف أو فوق قسم Hero (العنوان + الشعار + الأزرار).
- **الاقتراح:** صورة عرضية عريضة (مثلاً 1200×400 أو 1920×500) تعبر عن الألعاب أو المنتجات الرقمية.
- **الملفات الموجودة لديك:** `background.jpg` — يمكن استخدامها كخلفية للـ Hero مع طبقة شفافة فوقها.
- **في الكود:** إضافة `background-image` لـ `.home-hero` أو عنصر داخلي، أو `<img>` داخل الـ Hero.

---

## 2. **صور الفئات (Category Tiles)**
- **الموقع:** بطاقات الفئات الأربع (Game Cards, Skins, Hardware, Software).
- **الاقتراح:** بدل الأيقونات أو بجانبها: صورة تمثل كل فئة.
- **مقترح صور:**
  - Game Cards: `steam2.png` أو `game1.png` أو صورة بطاقات ألعاب.
  - Skins: صورة من ألعاب مثل `valorant.png` أو `cs2.png`.
  - Hardware: `disque_dur.png` أو `cpu-1770409479117.png`.
  - Software: أي غلاف برنامج أو `Discord_Nitro-1770666834061.png`.
- **في الكود:** داخل كل `.home-cat-tile` إضافة `<img class="home-cat-img" src="/assets/img/..." alt="...">` وتعديل الـ CSS (مثلاً نسبة عرض إلى ارتفاع، `object-fit: cover`).

---

## 3. **شريط وسائل الدفع (Payment / Trust)**
- **الموقع:** تحت الإحصائيات أو تحت "Why Key2lix".
- **الاقتراح:** سطر واحد بعنوان "نقبل الدفع بـ" أو "Secure payment" مع شعارات: Visa, Mastercard, PayPal, Paysafecard.
- **الملفات الموجودة:** `visa.png`, `Mastercard.png`, `PayPal.png`, `paysafecard.png`.
- **تم تنفيذه:** انظر القسم `home-payment-logos` في `index.html` (إن وُجد).

---

## 4. **بانر ترويجي (Promo Banner)**
- **الموقع:** بين "Best Offers" و "Why Key2lix" أو فوق الـ FAQ.
- **الاقتراح:** صورة + نص (مثلاً "عروض الأسبوع" أو "Steam Gift Cards") وزر يوجه إلى `/products` أو صفحة الفئة.
- **مثال صورة:** `steam3.jpg` أو `play2.jpg` أو أي بانر جاهز بعرض ~1000px.

---

## 5. **شريط العلامات / المنصات (Brands / Platforms)**
- **الموقع:** فوق الـ Footer أو تحت "Why Key2lix".
- **الاقتراح:** "منصات شائعة" أو "Popular platforms" مع شعارات: Steam, Discord, إلخ.
- **الملفات الموجودة:** `Steam.png`, `Google.png`, وأي شعارات أخرى من أصولك.

---

## 6. **خلفية الصفحة**
- **الموقع:** خلفية `body` أو خلفية كل قسم.
- **الملفات:** `background.jpg`, `particles.png` — يمكن استخدامها كـ `background-image` مع `background-size: cover` وشفافية للطبقات فوقها.

---

## 7. **أفضل العروض (Best Offers)**
- **الحالة الحالية:** صور المنتجات تُجلب ديناميكياً من `products.json` (حقل `images`).
- **لا تحتاج تغييراً** إلا إذا أردت صورة افتراضية موحدة للمنتجات التي بدون صورة: استخدم مثلاً `default.png` أو أي صورة في `/assets/img/`.

---

## ملخص المسارات المقترحة للصور

| الاستخدام           | المسار المقترح (من مجلد `assets/img`) |
|---------------------|----------------------------------------|
| خلفية Hero          | `background.jpg`                       |
| Game Cards (فئة)    | `steam2.png` أو `game1.png`           |
| Skins (فئة)         | `valorant.png` أو `cs2.png`           |
| Hardware (فئة)      | `disque_dur.png` أو `cpu-*.png`       |
| Software (فئة)      | `Discord_Nitro-*.png`                  |
| وسائل الدفع         | `visa.png`, `Mastercard.png`, `PayPal.png`, `paysafecard.png` |
| بانر ترويجي         | `steam3.jpg` أو `play2.jpg`           |
| منصات               | `Steam.png`, `Google.png`             |

---

## خطط مستقبلية (للعمل عليها)

| # | الموضع | الخطوة |
|---|--------|--------|
| 1 | **بانر الهيرو** | إضافة خلفية أو صورة للـ Hero (مثلاً `background.jpg`) في `.home-hero`. |
| 2 | **صور الفئات** | إضافة صور تمثيلية لبطاقات الفئات (Game Cards، Skins، Hardware، Software) من `assets/img`. |
| 3 | **بانر ترويجي** | قسم بين "Best Offers" و "Why Key2lix" بصورة ونص وزر يوجه للمنتجات أو الفئة. |
| 4 | **شريط العلامات/المنصات** | "منصات شائعة" مع شعارات Steam، Discord، إلخ فوق الفوتر. |
| 5 | **خلفية الصفحة** | تحسين استخدام `background.jpg` أو `particles.png` لخلفية الأقسام. |

شريط وسائل الدفع (We accept) مُنفَّذ في الصفحة الرئيسية؛ يمكن تعديل الصور من مسارات `src` في القسم `home-payment`.
