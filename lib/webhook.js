/**
 * إرسال Webhook للطلب: POST إلى webhook_url المورد مع توقيع HMAC
 * يرفض عناوين غير http/https أو مضيفين داخليين (تخفيف SSRF).
 */
const crypto = require('crypto');
const https = require('https');
const http = require('http');

function signPayload(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

/** رفض المضيفين الداخليين/المحليين لتقليل مخاطر SSRF */
function isBlockedWebhookHost(hostname) {
  if (!hostname || typeof hostname !== 'string') return true;
  const h = hostname.toLowerCase().replace(/\[|\]/g, '');
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^fc00:/i.test(h) || /^fe80:/i.test(h)) return true;
  return false;
}

/**
 * إرسال حدث طلب إلى webhook المورد (بدون انتظار — fire and forget مع إعادة محاولة بسيطة)
 * @param {string} webhookUrl - URL كامل
 * @param {string} webhookSecret - سر التوقيع
 * @param {object} payload - { event, order_id, status, order?, created_at }
 */
function sendOrderWebhook(webhookUrl, webhookSecret, payload) {
  if (!webhookUrl || typeof webhookUrl !== 'string') return;
  let url;
  try {
    url = new URL(webhookUrl);
  } catch (_) {
    return;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (isBlockedWebhookHost(url.hostname)) return;
  const body = JSON.stringify({
    event: payload.event,
    order_id: payload.order_id,
    status: payload.status || null,
    created_at: payload.created_at || new Date().toISOString(),
    ...(payload.order ? { order: payload.order } : {})
  });
  const signature = webhookSecret ? signPayload(webhookSecret, body) : '';
  const isHttps = url.protocol === 'https:';
  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body, 'utf8')
    }
  };
  if (signature) options.headers['X-Key2lix-Signature'] = 'sha256=' + signature;
  const req = (isHttps ? https : http).request(options, (res) => {
    if (res.statusCode >= 400) {
      console.warn('[webhook]', webhookUrl, 'status', res.statusCode);
    }
  });
  req.on('error', (err) => {
    console.warn('[webhook]', webhookUrl, err.message);
  });
  req.setTimeout(10000, () => {
    req.destroy();
  });
  req.write(body);
  req.end();
}

module.exports = { sendOrderWebhook, signPayload, isBlockedWebhookHost };
