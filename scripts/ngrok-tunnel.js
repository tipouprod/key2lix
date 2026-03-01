/**
 * فتح نفق ngrok على منفذ السيرفر (مثلاً 3000).
 * شغّل السيرفر أولاً في طرفية أخرى: npm start
 * ثم في طرفية ثانية: npm run tunnel
 *
 * يتطلب NGROK_AUTHTOKEN في .env (احصل عليه من https://dashboard.ngrok.com/get-started/your-authtoken)
 */
require('dotenv').config();
const ngrok = require('@ngrok/ngrok');

const PORT = parseInt(process.env.PORT || '3000', 10);

async function main() {
  if (!process.env.NGROK_AUTHTOKEN) {
    console.error('خطأ: NGROK_AUTHTOKEN غير معرّف في .env');
    console.error('احصل على التوكن من: https://dashboard.ngrok.com/get-started/your-authtoken');
    process.exit(1);
  }

  try {
    const opts = {
      addr: PORT,
      authtoken: process.env.NGROK_AUTHTOKEN.trim()
    };
    if (process.env.NGROK_DOMAIN && process.env.NGROK_DOMAIN.trim()) {
      opts.domain = process.env.NGROK_DOMAIN.trim();
    }
    const listener = await ngrok.forward(opts);
    const url = listener.url();
    console.log('');
    console.log('  ngrok: النفق يعمل');
    console.log('  الرابط العام:', url);
    console.log('  المنفذ المحلي:', PORT);
    console.log('  أوقف النفق بـ Ctrl+C');
    console.log('');
  } catch (err) {
    console.error('خطأ ngrok:', err.message);
    if (err.details) console.error('تفاصيل:', err.details);
    if (err.response) console.error('response:', err.response);
    console.error('راجع docs/NGROK-TROUBLESHOOTING.md أو شغّل: node scripts/check-ngrok.js');
    process.exit(1);
  }

  process.stdin.resume();
}

main();
