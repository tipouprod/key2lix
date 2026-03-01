/**
 * OAuth2 helpers for Google and Facebook client login.
 * Redirect + token exchange + profile fetch via HTTPS.
 */
const https = require('https');

function getGoogleLoginUrl(redirectUri, state) {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile'
  });
  if (state) params.set('state', state);
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

function getFacebookLoginUrl(redirectUri, state) {
  const appId = process.env.FACEBOOK_APP_ID || '';
  if (!appId) return null;
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'email,public_profile'
  });
  if (state) params.set('state', state);
  return 'https://www.facebook.com/v21.0/dialog/oauth?' + params.toString();
}

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = typeof body === 'string' ? body : (body ? new URLSearchParams(body).toString() : '');
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(buf));
        } catch (_) {
          resolve(buf);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: headers || {}
    };
    https.get(opts, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(buf));
        } catch (_) {
          resolve(buf);
        }
      });
    }).on('error', reject);
  });
}

async function exchangeGoogleCode(code, redirectUri) {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) return null;
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  }).toString();
  const tokenRes = await httpsPost('https://oauth2.googleapis.com/token', body);
  if (!tokenRes || !tokenRes.access_token) return null;
  const profile = await httpsGet('https://www.googleapis.com/oauth2/v2/userinfo', {
    Authorization: 'Bearer ' + tokenRes.access_token
  });
  return profile && profile.email ? { email: profile.email.trim().toLowerCase(), name: (profile.name || '').trim() || profile.email } : null;
}

async function exchangeFacebookCode(code, redirectUri) {
  const appId = process.env.FACEBOOK_APP_ID || '';
  const appSecret = process.env.FACEBOOK_APP_SECRET || '';
  if (!appId || !appSecret) return null;
  const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`;
  const tokenRes = await httpsGet(tokenUrl);
  if (!tokenRes || !tokenRes.access_token) return null;
  const profile = await httpsGet(`https://graph.facebook.com/v21.0/me?fields=id,email,name&access_token=${encodeURIComponent(tokenRes.access_token)}`);
  const email = profile && profile.email ? String(profile.email).trim().toLowerCase() : null;
  if (!email) return null;
  return { email, name: (profile.name || '').trim() || email };
}

function isGoogleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function isFacebookConfigured() {
  return !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
}

module.exports = {
  getGoogleLoginUrl,
  getFacebookLoginUrl,
  exchangeGoogleCode,
  exchangeFacebookCode,
  isGoogleConfigured,
  isFacebookConfigured
};
