/**
 * إشعارات البريد: طلب جديد، اعتماد منتج، تأكيد البريد.
 * يدعم: SMTP أو EmailJS. الإعدادات من process.env أو من db عبر initFromDb(db).
 */
const nodemailer = require('nodemailer');
const https = require('https');

let _db = null;
function getVal(key, def) {
  if (_db && typeof _db.getSetting === 'function') {
    const v = _db.getSetting(key);
    if (v != null && v !== '') return String(v).trim();
  }
  return (process.env[key] || def || '').toString().trim();
}

let transporter = null;
let _smtpHost = process.env.SMTP_HOST || '';
let _smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
let _smtpSecure = process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1';
let _smtpUser = process.env.SMTP_USER || process.env.SMTP_USERNAME || '';
let _smtpPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '';
let _notifyFrom = process.env.NOTIFY_FROM || _smtpUser || 'support@key2lix.com';
let _emailJsServiceId = (process.env.EMAILJS_SERVICE_ID || '').trim();
let _emailJsTemplateId = (process.env.EMAILJS_TEMPLATE_ID || '').trim();
let _emailJsPublicKey = (process.env.EMAILJS_PUBLIC_KEY || '').trim();
let _emailJsPrivateKey = (process.env.EMAILJS_PRIVATE_KEY || '').trim();

function reinitTransporter() {
  transporter = null;
  if (_smtpHost && _smtpUser && _smtpPass) {
    try {
      transporter = nodemailer.createTransport({
        host: _smtpHost,
        port: _smtpPort,
        secure: _smtpSecure,
        auth: { user: _smtpUser, pass: _smtpPass }
      });
    } catch (err) {
      console.warn('Email: failed to create transporter', err.message);
    }
  }
}

function initFromDb(db) {
  if (!db || typeof db.getSetting !== 'function') return;
  _db = db;
  _smtpHost = getVal('SMTP_HOST', '');
  _smtpPort = parseInt(getVal('SMTP_PORT', '587'), 10) || 587;
  _smtpSecure = getVal('SMTP_SECURE', '') === '1' || getVal('SMTP_SECURE', '') === 'true';
  _smtpUser = getVal('SMTP_USER', '') || getVal('SMTP_USERNAME', '');
  _smtpPass = getVal('SMTP_PASS', '') || getVal('SMTP_PASSWORD', '');
  _notifyFrom = getVal('NOTIFY_FROM', '') || _smtpUser || 'support@key2lix.com';
  _emailJsServiceId = getVal('EMAILJS_SERVICE_ID', '');
  _emailJsTemplateId = getVal('EMAILJS_TEMPLATE_ID', '');
  _emailJsPublicKey = getVal('EMAILJS_PUBLIC_KEY', '');
  _emailJsPrivateKey = getVal('EMAILJS_PRIVATE_KEY', '');
  reinitTransporter();
  if (!transporter && !(_emailJsServiceId && _emailJsTemplateId && _emailJsPublicKey && _emailJsPrivateKey)) {
    var missing = [];
    if (!_smtpHost) missing.push('SMTP_HOST');
    if (!_smtpUser) missing.push('SMTP_USER');
    if (!_smtpPass) missing.push('SMTP_PASS');
    if (missing.length) console.warn('Email: غير مُعدّ بعد initFromDb — القيم الناقصة أو الفارغة:', missing.join(', '), '(من Variables أو لوحة الأدمن)');
  } else if (transporter) {
    console.info('Email: SMTP مُعدّ —', _smtpHost);
  }
}

reinitTransporter();
const emailJsConfigured = !!( _emailJsServiceId && _emailJsTemplateId && _emailJsPublicKey && _emailJsPrivateKey);
if (!transporter && !emailJsConfigured) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('Email: No sender configured. Set SMTP_* or EMAILJS_* in .env or from admin settings.');
  }
} else if (emailJsConfigured) {
  console.info('Email: EmailJS configured. If emails do not send, enable "Allow API requests" in EmailJS dashboard > Account > Security.');
}

/** تطبيع عنوان البريد: عنوان واحد فقط، بدون مسافات أو فواصل (لتجنب "user@domain.com domain.com"). */
function normalizeEmail(email) {
  if (email == null || typeof email !== 'string') return '';
  var s = String(email).trim();
  var first = s.split(/[\s,;]+/)[0];
  return (first && first.indexOf('@') > 0) ? first : s;
}

function isConfigured() {
  return transporter != null || !!(_emailJsServiceId && _emailJsTemplateId && _emailJsPublicKey && _emailJsPrivateKey);
}

/** عنوان الموقع (لروابط الشعار في البريد). يُفضّل تعيين BASE_URL أو SITE_URL في .env */
function getSiteUrl() {
  return (process.env.BASE_URL || process.env.SITE_URL || 'https://key2lix.com').toString().trim().replace(/\/$/, '');
}

/** غلاف HTML للبريد: شعار Key2lix في الأعلى ثم المحتوى (لتوحيد العلامة التجارية في الرسائل) */
function wrapEmailWithLogo(bodyHtml) {
  if (!bodyHtml || typeof bodyHtml !== 'string') return bodyHtml || '';
  var logoUrl = getSiteUrl() + '/assets/img/logo.svg';
  return '<div style="font-family:Outfit,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;direction:rtl;">' +
    '<p style="margin:0 0 20px;"><a href="' + getSiteUrl() + '" style="display:inline-block;"><img src="' + logoUrl + '" alt="Key2lix" width="120" height="30" style="display:block;border:0;"></a></p>' +
    '<div style="color:#1e293b;line-height:1.6;">' + bodyHtml + '</div></div>';
}

/** إرسال بريد عبر EmailJS API. نمرّر to_email فقط للمستلم لتجنّب دمج خاطئ (مثل "user@domain.com domain.com"). */
function sendViaEmailJs(templateParams) {
  const ej = _emailJsServiceId && _emailJsTemplateId && _emailJsPublicKey && _emailJsPrivateKey;
  if (!ej) return Promise.resolve(false);
  var params = { ...templateParams };
  if (params.to_email != null) {
    params.to_email = normalizeEmail(params.to_email);
  }
  delete params.reply_to;
  if (params.verify_url && !params.verification_link) params.verification_link = params.verify_url;
  if (params.verify_url && !params.link) params.link = params.verify_url;
  if (params.verify_code !== undefined && !params.verification_code) params.verification_code = params.verify_code;
  var payload = {
    service_id: _emailJsServiceId,
    template_id: _emailJsTemplateId,
    user_id: _emailJsPublicKey,
    accessToken: _emailJsPrivateKey,
    template_params: params
  };
  var body = JSON.stringify(payload);
  return new Promise(function (resolve) {
    var req = https.request({
      hostname: 'api.emailjs.com',
      path: '/api/v1.0/email/send',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body, 'utf8') }
    }, function (res) {
      var data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          console.warn('EmailJS error:', res.statusCode, data || res.statusMessage);
          try {
            var errJson = JSON.parse(data);
            if (errJson.message || errJson.error) console.warn('EmailJS message:', errJson.message || errJson.error);
          } catch (e) {}
          resolve(false);
        }
      });
    });
    req.on('error', function (err) {
      console.warn('EmailJS request error:', err.message);
      resolve(false);
    });
    req.setTimeout(15000, function () { req.destroy(); resolve(false); });
    req.write(body);
    req.end();
  });
}

/**
 * إرسال بريد. لا يرمي أخطاء؛ يسجّل فقط (لعدم تعطيل الطلب/الاعتماد).
 * @param {string} to
 * @param {string} subject
 * @param {string} text
 * @param {string} [html]
 */
function sendMail(to, subject, text, html) {
  var toAddr = normalizeEmail(to);
  if (!transporter || !toAddr || !subject) {
    if (!transporter && toAddr && subject) console.warn('Email: skipped (no SMTP). Would send to:', toAddr);
    return Promise.resolve(false);
  }
  var bodyHtml = html || (text ? text.replace(/\n/g, '<br>') : '');
  if (bodyHtml) bodyHtml = wrapEmailWithLogo(bodyHtml);
  return transporter.sendMail({
    from: _notifyFrom,
    to: toAddr,
    subject,
    text: text || '',
    html: bodyHtml
  }).then(function () { return true; }).catch((err) => {
    var hint = '';
    if (err.code === 'EAUTH' || (err.message && err.message.toLowerCase().includes('auth'))) {
      hint = ' — تحقق من SMTP_USER و SMTP_PASS. لـ Gmail استخدم كلمة مرور التطبيق (App Password) وليس كلمة المرور العادية.';
    } else if (err.code === 'ESOCKET' || (err.message && err.message.toLowerCase().includes('connection'))) {
      hint = ' — تحقق من SMTP_HOST و SMTP_PORT (مثلاً smtp.gmail.com و 587).';
    }
    console.warn('Email send failed:', err.message, err.code || '', hint);
    return false;
  });
}

function getTemplate(key, vars, defaultSubject, defaultBody) {
  const k = 'EMAIL_TEMPLATE_' + key.toUpperCase();
  let subj = _db && typeof _db.getSetting === 'function' ? (_db.getSetting(k + '_SUBJECT') || '') : '';
  let body = _db && typeof _db.getSetting === 'function' ? (_db.getSetting(k + '_BODY') || '') : '';
  if (!subj) subj = defaultSubject;
  if (!body) body = defaultBody;
  const replace = (s) => {
    if (!s || typeof s !== 'string') return s;
    return s.replace(/\{\{(\w+)\}\}/g, (m, kk) => (vars && vars[kk] != null ? String(vars[kk]) : m));
  };
  return { subject: replace(subj), body: replace(body) };
}

/** إشعار المورد بطلب جديد على أحد منتجاته */
function notifyVendorNewOrder(vendorEmail, order) {
  const product = (order && order.product) ? order.product : '-';
  const value = (order && order.value) ? order.value : '-';
  const name = (order && order.name) ? order.name : '-';
  const phone = (order && order.phone) ? order.phone : '-';
  const orderId = (order && order.id) ? order.id : '-';
  const defaultSubject = '[Key2lix] طلب جديد — يرجى المتابعة / New order — action required';
  const text = `مرحباً،

تلقيت طلباً جديداً على منصة Key2lix.

تفاصيل الطلب:
• رقم الطلب: ${orderId}
• المنتج: ${product}
• القيمة: ${value}
• العميل: ${name}
• الهاتف: ${phone}

يرجى الدخول إلى لوحة البائع لمتابعة الطلب والرد على العميل.

—
Hello,

You have received a new order on Key2lix.

Order details:
• Order ID: ${orderId}
• Product: ${product}
• Value: ${value}
• Customer: ${name}
• Phone: ${phone}

Please log in to your vendor dashboard to process the order and respond to the customer.`;
  const t = getTemplate('vendor_new_order', { orderId, product, value, name, phone }, defaultSubject, text);
  return sendMail(vendorEmail, t.subject, t.body);
}

/** إشعار المورد باعتماد منتجه */
function notifyVendorProductApproved(vendorEmail, productName) {
  const name = productName || 'منتجك';
  const defaultSubject = '[Key2lix] تم اعتماد منتجك / Your product has been approved';
  const text = `مرحباً،

تم اعتماد المنتج التالي وعرضه في المتجر:

"${name}"

يمكن للعملاء الآن رؤية المنتج وشراؤه. يمكنك متابعة الطلبات من لوحة البائع.

—
Hello,

The following product has been approved and is now live in the store:

"${name}"

Customers can now view and purchase it. You can track orders from your vendor dashboard.`;
  const t = getTemplate('vendor_product_approved', { productName: name }, defaultSubject, text);
  return sendMail(vendorEmail, t.subject, t.body);
}

/** إشعار العميل بتغيير حالة الطلب (مثلاً اكتمال الطلب) */
function notifyClientOrderStatusChanged(clientEmail, orderId, status, productName) {
  const id = orderId || '-';
  const product = productName || '-';
  const statusAr = status === 'completed' ? 'مكتمل' : (status || 'قيد المعالجة');
  const statusEn = status === 'completed' ? 'Completed' : (status || 'In progress');
  const defaultSubject = '[Key2lix] تحديث حالة طلبك / Your order status has been updated';
  const text = `مرحباً،

تم تحديث حالة الطلب التالي:

• رقم الطلب: ${id}
• المنتج: ${product}
• الحالة: ${statusAr} / ${statusEn}

يمكنك متابعة تفاصيل الطلب والمراسلات من صفحة "حسابي" في الموقع.

—
Hello,

Your order status has been updated:

• Order ID: ${id}
• Product: ${product}
• Status: ${statusEn}

You can view order details and messages in the "My account" section on the website.`;
  const t = getTemplate('client_order_status', { orderId: id, productName: product, status: statusAr, statusEn }, defaultSubject, text);
  return sendMail(clientEmail, t.subject, t.body);
}

/** إشعار العميل برد جديد في دردشة الطلب (من البائع أو الأدمن) */
function notifyClientNewReply(clientEmail, orderId, productName, senderLabel) {
  const id = orderId || '-';
  const product = productName || '-';
  const from = senderLabel || 'البائع';
  const defaultSubject = '[Key2lix] رسالة جديدة بخصوص طلبك / New message about your order';
  const text = `مرحباً،

تلقيت رسالة جديدة بخصوص طلبك على Key2lix.

• رقم الطلب: ${id}
• المنتج: ${product}
• المرسل: ${from}

يرجى الدخول إلى حسابك وفتح محادثة الطلب لقراءة الرد والرد عليه.

—
Hello,

You have received a new message regarding your Key2lix order.

• Order ID: ${id}
• Product: ${product}
• From: ${from}

Please log in to your account and open the order conversation to read and reply.`;
  const t = getTemplate('client_new_reply', { orderId: id, productName: product, senderLabel: from }, defaultSubject, text);
  return sendMail(clientEmail, t.subject, t.body);
}

/** N5 — تذكير بالسلة المهجورة */
function notifyAbandonedCart(toEmail, itemsSummary, cartUrl) {
  const url = cartUrl || '/cart';
  const defaultSubject = '[Key2lix] لديك منتجات في السلة — أكمل طلبك / You have items in your cart';
  const text = `مرحباً،

لاحظنا أنك أضفت منتجات إلى السلة ولم تكمل الطلب. لا يزال بإمكانك إكمال الشراء في أي وقت.

محتويات السلة:
${itemsSummary}

رابط السلة: ${url}

نشكرك على اختيار Key2lix. إن كان لديك أي استفسار، تواصل معنا.

—
Hello,

We noticed you added items to your cart but didn’t complete the order. You can still complete your purchase at any time.

Cart summary:
${itemsSummary}

View your cart: ${url}

Thank you for choosing Key2lix. If you have any questions, feel free to contact us.`;
  const t = getTemplate('abandoned_cart', { itemsSummary, cartUrl: url }, defaultSubject, text);
  return sendMail(toEmail, t.subject, t.body);
}

/** التحقق من البريد الإلكتروني — إرسال الرقم السري (OTP). يُرجع Promise<boolean>. نفضّل SMTP إن وُجد لتجنّب خلل حقل "إلى" في EmailJS. */
function sendEmailVerification(toEmail, verifyCode) {
  var to = normalizeEmail(toEmail);
  if (!to) return Promise.resolve(false);
  var codeStr = String(verifyCode || '').trim();
  var defaultSubject = '[Key2lix] رمز تأكيد بريدك الإلكتروني / Email verification code';
  var text = `مرحباً،

شكراً لتسجيلك في Key2lix. لتفعيل حسابك، استخدم رمز التأكيد التالي:

  ${codeStr}

• الرمز صالح لمدة 15 دقيقة.
• أدخل الرمز في صفحة "حسابي" في الموقع.

إذا لم تقم بالتسجيل، يمكنك تجاهل هذا البريد.

—
Hello,

Thank you for signing up with Key2lix. To verify your email address, please use the following code:

  ${codeStr}

• This code is valid for 15 minutes.
• Enter it in the "My account" section on the website.

If you did not create an account, you can safely ignore this email.`;
  const t = getTemplate('email_verification', { verifyCode: codeStr }, defaultSubject, text);
  if (transporter) {
    return sendMail(to, t.subject, t.body).then(function (ok) {
      if (!ok) console.warn('Verification email: SMTP إرسال فشل. راجع السطر السابق للتفاصيل.');
      return ok;
    });
  }
  if (_emailJsServiceId && _emailJsTemplateId && _emailJsPublicKey && _emailJsPrivateKey) {
    return sendViaEmailJs({ to_email: to, verify_code: codeStr, subject: t.subject }).then(function (ok) {
      if (!ok) console.warn('Verification email: EmailJS إرسال فشل. تحقق من لوحة EmailJS و Allow API requests.');
      return ok;
    });
  }
  console.warn('Verification email: لا يوجد SMTP ولا EmailJS مُعدّ. ضع SMTP_* أو EMAILJS_* في Variables أو من لوحة الأدمن → إعدادات البريد.');
  return Promise.resolve(false);
}

/** إعادة تعيين كلمة المرور — إرسال رابط يحتوي على التوكن. نفضّل SMTP إن وُجد لتجنّب خلل "إلى" في EmailJS. */
function sendPasswordResetEmail(toEmail, resetLink) {
  var to = normalizeEmail(toEmail);
  if (!to || !resetLink) return Promise.resolve(false);
  var defaultSubject = '[Key2lix] إعادة تعيين كلمة المرور / Password reset request';
  var text = `مرحباً،

تلقينا طلباً لإعادة تعيين كلمة المرور لحسابك على Key2lix.

لتعيين كلمة مرور جديدة، افتح الرابط التالي (صالح لمدة ساعة واحدة):

${resetLink}

إذا لم تطلب إعادة التعيين، يمكنك تجاهل هذا البريد؛ حسابك آمن ولن يتم تغيير كلمة المرور.

—
Hello,

We received a request to reset the password for your Key2lix account.

To set a new password, please open the link below (valid for 1 hour):

${resetLink}

If you did not request this, you can ignore this email; your account is secure and your password will not be changed.`;
  const t = getTemplate('password_reset', { resetLink }, defaultSubject, text);
  if (transporter) return sendMail(to, t.subject, t.body);
  if (_emailJsServiceId && _emailJsTemplateId && _emailJsPublicKey && _emailJsPrivateKey) {
    return sendViaEmailJs({ to_email: to, reset_link: resetLink, subject: t.subject });
  }
  return Promise.resolve(false);
}

function getConfigForAdmin() {
  return {
    provider: _smtpHost ? 'smtp' : (_emailJsServiceId ? 'emailjs' : 'none'),
    smtp_host: _smtpHost || null,
    smtp_port: _smtpPort,
    smtp_secure: _smtpSecure,
    smtp_user: _smtpUser || null,
    smtp_pass_masked: _smtpPass ? '********' : null,
    notify_from: _notifyFrom || null,
    emailjs_service_id: _emailJsServiceId || null,
    emailjs_template_id: _emailJsTemplateId || null,
    emailjs_public_key: _emailJsPublicKey || null,
    emailjs_private_key_masked: _emailJsPrivateKey ? '********' : null
  };
}

module.exports = {
  isConfigured: () => transporter != null || !!(_emailJsServiceId && _emailJsTemplateId && _emailJsPublicKey && _emailJsPrivateKey),
  initFromDb,
  getConfigForAdmin,
  sendMail,
  notifyVendorNewOrder,
  notifyVendorProductApproved,
  notifyClientOrderStatusChanged,
  notifyClientNewReply,
  notifyAbandonedCart,
  sendEmailVerification,
  sendPasswordResetEmail
};
