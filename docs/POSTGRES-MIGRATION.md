# التحضير للانتقال إلى PostgreSQL (P17)

هذا الملف يوثق مخطط الجداول الحالي (SQLite) ويقترح خطوات الترحيل إلى PostgreSQL عند الحاجة.

## الجداول الحالية (SQLite)

- **orders** — id, date, product, value, name, phone, email, address, vendor_id, commission_amount, client_id, status, completed_at, product_category, product_subcat, product_slug
- **contacts** — id, date, name, email, subject, message
- **vendors** — id, email, password_hash, name, phone, status, created_at
- **products** — id, vendor_id, category, subcat, slug, name, desc, images_json, prices_json, discount, old_price, tags_json, status, created_at
- **clients** — id, email, password_hash, name, phone, created_at
- **reviews** — id, category, subcat, slug, client_id, rating, comment, created_at
- **notifications** — id, user_type, user_id, type, title, link, is_read, created_at
- **order_messages** — id, order_id, from_role, from_id, body, created_at
- **vendor_payments** — id, vendor_id, amount, paid_at
- **settings** — key, value
- **client_wishlist** — id, client_id, category, subcat, slug, name, img, created_at

## الاستخدام (P17 — مُنفَّذ)

1. في `.env` ضع: `DB_DRIVER=postgres` و `DATABASE_URL=postgresql://user:pass@host:5432/dbname`
2. تشغيل التطبيق — `database/index.js` يحمّل `db-pg.js` تلقائياً عند `DB_DRIVER=postgres`
3. الجداول تُنشأ تلقائياً عند أول تشغيل

## خطوات الترحيل المقترحة (للبيانات الموجودة)

1. تثبيت `pg` (موجود).
2. إنشاء نفس الجداول في PostgreSQL — يتم عبر `db-pg.js` عند التشغيل.
3. تصدير البيانات من SQLite (استعلامات SELECT أو أداة مثل sqlite3 .dump) ثم استيرادها إلى PostgreSQL (COPY أو INSERT).
4. تحديث `database/db.js` لاستخدام عميل `pg` مع واجهة موحّدة (نفس الدوال: getOrders, addOrder, ...) حتى لا تتغير استدعاءات الـ API في server.js.
5. تشغيل الاختبارات والتحقق من السلوك قبل القطع على PostgreSQL في الإنتاج.

## الفهارس الإضافية (مُنفَّذة)

تمت إضافة فهارس في SQLite وPostgreSQL لتحسين الاستعلامات الأكثر استخداماً:

- **orders**: `client_id`, `date`, `(vendor_id, status)`
- **products**: `(category, subcat, slug)`, `(vendor_id, status)`
- **reviews**: `(category, subcat, slug)`
- **notifications**: `(user_type, user_id, is_read)`

## تخزين الجلسات خارج الذاكرة (مُنفَّذ)

- ضبط **SESSION_STORE=db** في `.env` يخزّن الجلسات في جدول `sessions` (SQLite أو PostgreSQL) بدل memory store.
- مناسب لبيئة متعددة العقد أو لإطالة عمر الجلسة دون فقدانها عند إعادة تشغيل العملية.
- الجدول يُنشأ تلقائياً عند التشغيل.

## قراءة/كتابة منفصلة (Read replicas) — مستقبلي

- عند حجم كبير: إعداد replica للقراءة فقط وتوجيه استعلامات التقارير وقوائم المنتجات إليها، والكتابة إلى الرئيسي.
- يتطلب إعداداً في PostgreSQL (connection string منفصل للقراءة) وتعديلاً في طبقة DB لاستخدام pool قراءة عند استدعاءات معينة.

## ملاحظات

- الفهارس: مُضافة كما أعلاه؛ يمكن مراجعة استعلامات إضافية وإضافة فهارس عند الحاجة.
- التواريخ: SQLite يستخدم نصوص ISO؛ في PostgreSQL يمكن استخدام `TIMESTAMPTZ`.
- الـ JSON: في PostgreSQL يمكن استخدام نوع `jsonb` لـ images_json, prices_json, tags_json لاستعلامات أسرع إن لزم.

*آخر تحديث: شباط 2026.*
