# قالب EmailJS الموحّد — لجميع رسائل الموقع

عند ضبط EmailJS (Service ID, Template ID, Public Key, Private Key)، التطبيق يرسل **جميع** الرسائل عبر نفس القالب باستخدام المتغير **`body_html`**: المحتوى الكامل للرسالة (تحقق، إعادة تعيين كلمة المرور، إشعارات الطلبات، إلخ) يُبنى في السيرفر ويُمرَّر كـ HTML جاهز.

---

## إعداد قالب واحد لجميع الرسائل

في [EmailJS](https://dashboard.emailjs.com) → **Email Templates** → القالب المرتبط بـ Template ID الذي ضبطته:

### المتغيرات التي يرسلها التطبيق

| المتغيّر | الوصف |
|----------|--------|
| `to_email` | بريد المستلم |
| `subject` | موضوع الرسالة |
| `body_html` | محتوى الرسالة (HTML) — يُنسخ أيضاً إلى `message` |
| `message` | **نفس محتوى body_html** — استخدم `{{{message}}}` في القالب لعرض المحتوى |
| `verify_code` | (اختياري) يمرّ مع رسالة التحقق أيضًا ليتوافق مع قوالب قديمة |
| `reset_link` | (اختياري) يمرّ مع رسالة إعادة التعيين |
| `verification_code` | نفس قيمة `verify_code` |

### قالب كامل احترافي (جاهز للنسخ)

يوجد قالب HTML كامل في الملف **`docs/EMAILJS-UNIVERSAL-TEMPLATE.html`** — انسخ محتواه بالكامل إلى محرر القالب في EmailJS (Content / Body)، وضَع **Subject** = `{{subject}}`.

### محتوى القالب الموحّد (إن أردت البناء يدوياً)

- **Subject (الموضوع):** `{{subject}}`
- **المحتوى (Content / Body):** استخدم `{{{message}}}` (ثلاثة أقواس لعدم تهريب HTML). إن لم يظهر المحتوى جرّب `{{{body_html}}}`.
  - التطبيق يرسل المحتوى في المتغيرين `message` و `body_html`. حد EmailJS لمجموع المتغيرات 50 كيلوبايت.

مثال بسيط للمحتوى:

```html
<div style="font-family: system-ui, sans-serif;">
  {{#if body_html}}
    {{{body_html}}}
  {{else}}
    {{#if verify_code}}
      <p>Your verification code: {{verify_code}}</p>
    {{/if}}
    {{#if reset_link}}
      <p>Reset link: <a href="{{reset_link}}">{{reset_link}}</a></p>
    {{/if}}
  {{/if}}
</div>
<p style="color:#999;font-size:12px;">Keylix — Email sent via EmailJS</p>
```

إذا كان محرر EmailJS **لا** يدعم `{{{body_html}}}` أو الشروط، استخدم فقط:

```html
{{{body_html}}}
```

أو (إن كان يهرب المحتوى):

```html
{{body_html}}
```

---

## أنواع الرسائل المشمولة

عند استخدام القالب الموحّد مع `body_html`، يعمل تلقائيًا مع:

- رمز التحقق (تسجيل / تأكيد البريد)
- إعادة تعيين كلمة المرور
- إشعار المورد بطلب جديد
- إشعار المورد باعتماد منتج
- إشعار العميل بتحديث حالة الطلب
- إشعار العميل برد جديد في المحادثة
- تذكير السلة المهجورة
- الرسالة التجريبية من لوحة الأدمن (عند استخدام مسار EmailJS)
- أي رسالة أخرى يرسلها التطبيق عبر `sendMail`

كلها تُبنى كـ HTML في السيرفر ثم تُمرَّر في `body_html` إلى نفس القالب.
