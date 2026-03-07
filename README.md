# Key2lix

**سوق رقمية متعددة الموردين** — بطاقات ألعاب، اشتراكات، برمجيات (الجزائر).

- **التشغيل:** `npm install` ثم `npm start` — راجع [docs/SERVER-RUN.md](docs/SERVER-RUN.md).
- **قاعدة البيانات:** SQLite افتراضياً (`client/data/key2lix.db`) — راجع [docs/DATABASE.md](docs/DATABASE.md).
- **النشر:** Docker و Railway مدعومان — راجع [docs/DEPLOY-RAILWAY.md](docs/DEPLOY-RAILWAY.md) و [docs/DOCKER.md](docs/DOCKER.md).

## الوثائق

فهرس الوثائق الكامل في **[docs/README.md](docs/README.md)**، ومنه:

| القسم | وثائق رئيسية |
|--------|----------------|
| التطوير والتخطيط | [IMPLEMENTATION-ROADMAP.md](docs/IMPLEMENTATION-ROADMAP.md), [API.md](docs/API.md) |
| التنظيم والبنية | [ORGANIZATION-DETAILED.md](docs/ORGANIZATION-DETAILED.md), [ORGANIZATION-CHECKLIST.md](docs/ORGANIZATION-CHECKLIST.md) |
| التشغيل والنشر | [SERVER-RUN.md](docs/SERVER-RUN.md), [DATABASE.md](docs/DATABASE.md), [BUILD.md](docs/BUILD.md), [DOCKER.md](docs/DOCKER.md), [BACKUP.md](docs/BACKUP.md) |
| الأمان والمراقبة | [SECURITY-HEADERS.md](docs/SECURITY-HEADERS.md), [ADMIN-SECURITY.md](docs/ADMIN-SECURITY.md), [MONITORING.md](docs/MONITORING.md) |

## البنية المختصرة

- **`server.js`** — نقطة الدخول (Express)، المسارات، الـ middleware.
- **`database/`** — SQLite (`db.js`) أو PostgreSQL (`db-pg.js`) حسب `DB_DRIVER`.
- **`client/`** — واجهة أمامية (HTML/CSS/JS)، صفحات ثابتة.
- **`routes/`** — تسجيل مسارات الصفحات والـ API (صفحات، ثابت، صحة).
- **`lib/`** — بريد، ضغط، جلسات، Stripe، S3، طابور، إلخ.
- **`middleware/`** — مصادقة (أدمن/مورد/عميل)، أمان أدمن.
- **`docs/`** — وثائق تقنية وتشغيلية.

## الترخيص

ISC.
