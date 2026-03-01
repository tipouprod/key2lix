/**
 * اختبار إرسال بريد التحقق عبر EmailJS.
 * تشغيل: node test-emailjs.js your@email.com  (من مجلد scripts أو استخدم المسار الكامل)
 * تأكد من تفعيل "Allow API requests" في EmailJS > Account > Security.
 */
require('dotenv').config();
const https = require('https');

const serviceId = (process.env.EMAILJS_SERVICE_ID || '').trim();
const templateId = (process.env.EMAILJS_TEMPLATE_ID || '').trim();
const publicKey = (process.env.EMAILJS_PUBLIC_KEY || '').trim();
const privateKey = (process.env.EMAILJS_PRIVATE_KEY || '').trim();
const toEmail = process.argv[2] || process.env.TEST_EMAIL || 'test@key2lix.com';
const verifyCode = process.env.TEST_CODE || '123456';

if (!serviceId || !templateId || !publicKey || !privateKey) {
  console.error('Missing EMAILJS_* in .env');
  process.exit(1);
}

const templateParams = {
  to_email: toEmail,
  reply_to: toEmail,
  verify_code: verifyCode,
  subject: '[Key2lix] تأكيد بريدك الإلكتروني'
};

const body = JSON.stringify({
  service_id: serviceId,
  template_id: templateId,
  user_id: publicKey,
  accessToken: privateKey,
  template_params: templateParams
});

console.log('Sending test email to:', toEmail);
console.log('Verify code:', verifyCode);

const req = https.request({
  hostname: 'api.emailjs.com',
  path: '/api/v1.0/email/send',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body, 'utf8') }
}, function (res) {
  let data = '';
  res.on('data', function (chunk) { data += chunk; });
  res.on('end', function () {
    console.log('Status:', res.statusCode);
    console.log('Response:', data || res.statusMessage);
    if (res.statusCode === 200) {
      console.log('OK — تحقق من صندوق الوارد أو السبام.');
    } else {
      console.log('فشل. إذا كان 403/401: فعّل "Allow API requests" من EmailJS > Account > Security.');
    }
  });
});

req.on('error', function (err) {
  console.error('Request error:', err.message);
});
req.write(body);
req.end();
