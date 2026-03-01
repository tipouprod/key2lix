/**
 * تشخيص ngrok: التحقق من .env وعرض خطأ ngrok إن فشل.
 * تشغيل: node scripts/check-ngrok.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const token = process.env.NGROK_AUTHTOKEN;
const port = parseInt(process.env.PORT || '3000', 10);

console.log('');
console.log('--- تشخيص ngrok ---');
console.log('  مسار .env:', path.join(__dirname, '..', '.env'));
console.log('  NGROK_AUTHTOKEN معرّف:', !!token);
if (token) console.log('  طول التوكن:', token.trim().length);
console.log('  PORT:', port);
console.log('');

if (!token || !String(token).trim()) {
  console.error('أضف NGROK_AUTHTOKEN في ملف .env ثم شغّل هذا السكربت مرة أخرى.');
  process.exit(1);
}

const ngrok = require('@ngrok/ngrok');

(async () => {
  try {
    const opts = {
      addr: port,
      authtoken: String(token).trim()
    };
    if (process.env.NGROK_DOMAIN && process.env.NGROK_DOMAIN.trim()) {
      opts.domain = process.env.NGROK_DOMAIN.trim();
      console.log('  NGROK_DOMAIN:', opts.domain);
    }
    console.log('جاري فتح النفق...');
    const listener = await ngrok.forward(opts);
    const url = listener.url();
    console.log('');
    console.log('  نجح: الرابط العام', url);
    console.log('  أوقف بـ Ctrl+C');
    console.log('');
    process.stdin.resume();
  } catch (err) {
    console.error('');
    console.error('--- فشل ngrok ---');
    console.error('الرسالة:', err.message);
    if (err.details) console.error('التفاصيل:', err.details);
    if (err.response) console.error('response:', err.response);
    if (err.stack) console.error('Stack:', err.stack);
    console.error('');
    process.exit(1);
  }
})();
