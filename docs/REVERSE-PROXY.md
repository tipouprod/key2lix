# Reverse Proxy و Cache — Key2lix

لوضع Nginx أو Caddy أمام تطبيق Node لتقديم الملفات الثابتة مع تخزين مؤقت، وإنهاء SSL، وتقليل الحمل على Express.

---

## لماذا Reverse Proxy؟

- **الملفات الثابتة:** تقديم CSS/JS/صور من الـ proxy مع cache بدل تمرير كل طلب إلى Node.
- **SSL/TLS:** إنهاء HTTPS عند الـ proxy (شهادات Let's Encrypt مع Caddy أو certbot مع Nginx).
- **الأداء:** تقليل عدد الاتصالات المباشرة مع Node وتمكين ضغط (مثل Brotli) عند الـ proxy إن رغبت.

---

## افتراضات

- تطبيق Key2lix يعمل على `http://127.0.0.1:3000` (أو المنفذ المحدد في `PORT`).
- المجلد الثابت للتطبيق: `client/` (أو `dist/` عند USE_BUILD=1).

**ملفات إعداد جاهزة في المشروع:** انسخ من `config/nginx-key2lix.example.conf` أو `config/Caddyfile.example` ثم عدّل المسارات والدومين.

---

## Nginx

مثال إعداد أساسي (استبدل `key2lix.com` ومسارات الملفات حسب بيئتك):

```nginx
# Upstream لتطبيق Node
upstream key2lix_node {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name key2lix.com;
    # إعادة توجيه HTTP إلى HTTPS (بعد تفعيل SSL)
    # return 301 https://$server_name$request_uri;

    # للملفات الثابتة: تقديم من القرص مع cache
    location /assets/ {
        alias /path/to/key2lix/client/assets/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
    location /pages/ {
        alias /path/to/key2lix/client/pages/;
        expires 1h;
    }

    # باقي الطلبات إلى Node
    location / {
        proxy_pass http://key2lix_node;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
    }
}

# بعد الحصول على شهادة SSL (مثلاً certbot):
# server {
#     listen 443 ssl http2;
#     server_name key2lix.com;
#     ssl_certificate /etc/letsencrypt/live/key2lix.com/fullchain.pem;
#     ssl_certificate_key /etc/letsencrypt/live/key2lix.com/privkey.pem;
#     # ... نفس location أعلاه ...
# }
```

- عدّل `alias` ليطابق المسار الفعلي لمجلد المشروع.
- إن أردت أن يقدّم Nginx Brotli للملفات الثابتة، أضف `ngx_http_brotli_filter_module` و `ngx_http_brotli_static_module` ثم فعّل `brotli on;` و `brotli_static on;` في الـ `location` المناسب.

---

## Caddy

مثال بسيط مع SSL تلقائي (Caddy يحصل على الشهادة تلقائياً):

```caddyfile
key2lix.com {
    # ملفات ثابتة مع cache
    handle /assets/* {
        root * /path/to/key2lix/client
        file_server
        header Cache-Control "public, max-age=604800, immutable"
    }
    handle /pages/* {
        root * /path/to/key2lix/client
        file_server
        header Cache-Control "public, max-age=3600"
    }

    # باقي الطلبات إلى Node
    reverse_proxy 127.0.0.1:3000
}
```

- استبدل `/path/to/key2lix` بالمسار الفعلي.
- Caddy يدعم Brotli افتراضياً للملفات التي يقدمها.

---

## ملاحظات

- إذا قدّم الـ proxy الملفات الثابتة، تأكد أن مسارات الـ alias/root تطابق ما يرجعه التطبيق (مجلد `client` أو `dist`).
- الجلسات: مع **SESSION_STORE=db** تعمل الجلسات عبر عدة عقد؛ مع موازن حمل تأكد أن الـ proxy يمرّر نفس الجلسة إلى نفس العملية إن لم تكن الجلسات مشتركة (راجع [POSTGRES-MIGRATION.md](POSTGRES-MIGRATION.md) للجلسات في DB).
- راجع [SERVER-RUN.md](SERVER-RUN.md) لتشغيل التطبيق و [FUTURE-REVIEW.md](FUTURE-REVIEW.md) لقسم التوسع والتوفر.

**الخطوة التالية:** عند النشر على دومين حقيقي، اختر Nginx أو Caddy، انسخ المثال المناسب أعلاه، عدّل المسارات والدومين، ثم فعّل SSL (Caddy تلقائي أو certbot لـ Nginx).
