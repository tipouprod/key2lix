#!/usr/bin/env node
/**
 * اختبار تسجيل الدخول على الموقع المنشور (مثلاً Railway).
 * الاستخدام:
 *   node scripts/test-login-remote.js <email> <password>
 *   أو: TEST_LOGIN_EMAIL=... TEST_LOGIN_PASSWORD=... BASE_URL=https://key2lix.com node scripts/test-login-remote.js
 */
const BASE_URL = process.env.BASE_URL || 'https://key2lix.com';
const email = process.env.TEST_LOGIN_EMAIL || process.argv[2];
const password = process.env.TEST_LOGIN_PASSWORD || process.argv[3];

if (!email || !password) {
  console.error('الاستخدام: node scripts/test-login-remote.js <email> <password>');
  console.error('أو: TEST_LOGIN_EMAIL=... TEST_LOGIN_PASSWORD=... BASE_URL=https://key2lix.com node scripts/test-login-remote.js');
  process.exit(1);
}

const base = BASE_URL.replace(/\/$/, '');

function request(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const url = new URL(path.startsWith('http') ? path : base + path);
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
    };
    if (cookie) opts.headers.Cookie = cookie;
    const lib = url.protocol === 'https:' ? require('https') : require('http');
    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const setCookies = res.headers['set-cookie'];
        const cookieStr = Array.isArray(setCookies)
          ? setCookies.map((h) => h.split(';')[0].trim()).filter(Boolean).join('; ')
          : (setCookies && String(setCookies).split(';')[0].trim()) || '';
        const text = Buffer.concat(chunks).toString();
        let json;
        try { json = JSON.parse(text); } catch (_) { json = {}; }
        resolve({ status: res.statusCode, json, cookie: cookieStr });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('Testing login at:', base);
  console.log('POST /api/client/login ...');

  const loginRes = await request('POST', base + '/api/client/login', {
    email,
    password,
    returnUrl: '/client-account'
  });

  if (loginRes.status !== 200 || !loginRes.json.success) {
    console.error('Login failed:', loginRes.status, loginRes.json.error || loginRes.json);
    process.exit(1);
  }
  console.log('Login response: success=true, redirect=', loginRes.json.redirect);

  if (!loginRes.cookie) {
    console.warn('No Set-Cookie in login response — session cookie might not be set.');
  } else {
    console.log('Cookie received (first 60 chars):', loginRes.cookie.substring(0, 60) + '...');
  }

  console.log('GET /api/client/me with cookie ...');
  const meRes = await request('GET', base + '/api/client/me', null, loginRes.cookie);

  if (meRes.json.loggedIn === true) {
    console.log('OK — /api/client/me returned loggedIn: true, email:', meRes.json.email);
  } else {
    console.error('FAIL — /api/client/me returned loggedIn:', meRes.json.loggedIn, '(expected true). Full:', JSON.stringify(meRes.json));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
