/**
 * يشغّل السيرفر ويفتح نفق ngrok ويعرض الرابط العام.
 * استخدمه عبر: npm run start:tunnel أو تشغيل Start-Server-And-Tunnel.bat
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const ngrok = require('@ngrok/ngrok');

const ROOT = path.join(__dirname, '..');
const PORT = parseInt(process.env.PORT || '3000', 10);

function waitForServer(ms = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function tryConnect() {
      const socket = net.connect(PORT, '127.0.0.1', () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        if (Date.now() - start > ms) return reject(new Error('انتهت المهلة: السيرفر لم يبدأ'));
        setTimeout(tryConnect, 500);
      });
    }
    tryConnect();
  });
}

async function main() {
  if (!process.env.NGROK_AUTHTOKEN) {
    console.error('خطأ: NGROK_AUTHTOKEN غير معرّف في .env');
    process.exit(1);
  }

  const serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });

  serverProcess.on('error', (err) => {
    console.error('خطأ في تشغيل السيرفر:', err.message);
    process.exit(1);
  });

  process.on('SIGINT', () => {
    serverProcess.kill('SIGINT');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    serverProcess.kill('SIGTERM');
    process.exit(0);
  });

  console.log('جاري تشغيل السيرفر...');
  await waitForServer();
  console.log('السيرفر يعمل على المنفذ', PORT);

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
    console.log('  ========================================');
    console.log('  الرابط العام للموقع:');
    console.log('  ', url);
    console.log('  ========================================');
    console.log('  أوقف السيرفر والنفق بـ Ctrl+C');
    console.log('');
  } catch (err) {
    console.error('خطأ ngrok:', err.message);
    if (err.details) console.error('تفاصيل:', err.details);
    if (err.response) console.error('response:', err.response);
    console.error('راجع docs/NGROK-TROUBLESHOOTING.md أو شغّل: node scripts/check-ngrok.js');
    serverProcess.kill();
    process.exit(1);
  }

  process.stdin.resume();
}

main();
