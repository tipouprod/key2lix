/**
 * مسارات الصفحات (HTML): الرئيسية، المنتجات، النماذج، إلخ.
 * يُستدعى من server.js مع sendPage و sendPageNoCache.
 */
const path = require('path');
const fs = require('fs');
const db = require('../database');

/** عند الطلب من ngrok: تحميل CSS و JS عبر fetch مع هيدر تخطي التحذير */
function sendIndexMaybeNgrok(sendPage, CLIENT_ROOT, projectRoot, logger) {
  const indexPath = path.join(projectRoot, CLIENT_ROOT, 'pages', 'index.html');
  const skipHeader = 'ngrok-skip-browser-warning';
  const cssLoader = '<script>(function(){var h={"'+skipHeader+'":"1"};var opts={headers:h,credentials:"same-origin",cache:"no-store"};["/assets/css/style.css","/assets/css/home.css"].forEach(function(u){fetch(u,opts).then(function(r){return r.text();}).then(function(t){if(t&&t.trim().indexOf("<")!==0){var s=document.createElement("style");s.textContent=t;document.head.appendChild(s);}}).catch(function(e){console.error("ngrok CSS fail",u,e);});});})();</script>';
  const jsLoader = '<script>(function(){var l=["/assets/js/lang.js","/assets/js/common.js","/assets/js/wishlist.js","/assets/js/ai-chat.js"];var h={"'+skipHeader+'":"1"};var opts={headers:h,credentials:"same-origin",cache:"no-store"};function n(i){if(i>=l.length){var el=document.getElementById("ngrok-loading");if(el)el.remove();return;}fetch(l[i],opts).then(function(r){return r.text();}).then(function(t){if(t&&t.trim().indexOf("<")===0){console.warn("ngrok: got HTML instead of JS",l[i]);return n(i+1);}var s=document.createElement("script");s.textContent=t;document.body.appendChild(s);n(i+1);}).catch(function(e){console.error("ngrok JS fail",l[i],e);n(i+1);});}n(0);})();</script>';
  const skipHeaderName = 'ngrok-skip-browser-warning';
  const fetchPatch = '<script>(function(){var h={"'+skipHeaderName+'":"1"};var f=window.fetch;if(f){window.fetch=function(u,o){o=o||{};o.headers=o.headers||{};if(o.headers instanceof Headers)o.headers.set("'+skipHeaderName+'","1");else o.headers["'+skipHeaderName+'"]="1";return f.call(this,u,o);};}</script>';
  const loadingBar = '<div id="ngrok-loading" style="position:fixed;inset:0;background:#0f0f18;color:#fff;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem;z-index:99999;font-family:sans-serif;"><p>جاري التحميل...</p><p style="font-size:0.85rem;opacity:0.8">Key2lix عبر ngrok</p></div>';
  const cssBlock = /\s*<link rel="stylesheet" href="\/assets\/css\/style\.css">\s*<link rel="stylesheet" href="\/assets\/css\/home\.css">/;
  const scriptBlock = /\s*<script src="\/assets\/js\/lang\.js"><\/script>\s*<script src="\/assets\/js\/common\.js"><\/script>\s*<script src="\/assets\/js\/wishlist\.js"><\/script>\s*<script defer src="\/assets\/js\/ai-chat\.js"><\/script>/;
  const bodyOpen = /<body>\s*/;
  return (req, res) => {
    const host = (req.get('host') || '').toLowerCase();
    if (host.indexOf('ngrok') === -1 || !fs.existsSync(indexPath)) {
      return sendPage('index.html')(req, res);
    }
    let html = fs.readFileSync(indexPath, 'utf8');
    const hadCss = cssBlock.test(html);
    const hadScript = scriptBlock.test(html);
    if (hadCss) html = html.replace(cssBlock, cssLoader);
    if (hadScript) html = html.replace(scriptBlock, jsLoader);
    if (hadCss || hadScript) {
      if (bodyOpen.test(html)) html = html.replace(bodyOpen, '<body>\n' + fetchPatch + '\n' + loadingBar);
      if (logger) logger.info({ host }, 'Serving index with ngrok loader (CSS+JS via fetch)');
      res.type('html').send(html);
      return;
    }
    return sendPage('index.html')(req, res);
  };
}

module.exports = function registerPages(app, opts) {
  const { sendPage, sendPageNoCache, CLIENT_ROOT, logger } = opts;
  const projectRoot = path.join(__dirname, '..');

  app.get('/', sendIndexMaybeNgrok(sendPage, CLIENT_ROOT, projectRoot, logger));
  app.get('/login', (req, res, next) => {
    if (req.session && req.session.admin) return res.redirect('/admin');
    return sendPage('login.html')(req, res, next);
  });
  app.get('/client-login', sendPage('client-login.html'));
  app.get('/client-register', sendPage('client-register.html'));
  app.get('/client-account', sendPage('client-account.html'));
  app.get('/client-forgot-password', sendPage('client-forgot-password.html'));
  app.get('/client-reset-password', sendPage('client-reset-password.html'));
  app.get('/verify-email', (req, res) => res.redirect('/client-account'));
  app.get('/order-chat', sendPage('order-chat.html'));
  app.get('/gift', sendPage('gift.html'));
  app.get('/products', sendPage('products.html'));
  app.get('/deals', sendPage('deals.html'));
  app.get('/wishlist', sendPage('wishlist.html'));
  app.get('/list/:shareToken', sendPage('list.html'));
  app.get('/product.html', sendPage('product.html'));
  app.get('/form.html', sendPage('form.html'));
  app.get('/hardware', sendPage('hardware.html'));
  app.get('/software', sendPage('software.html'));
  app.get('/subscriptions', sendPage('subscriptions.html'));
  app.get('/skins', (req, res) => res.redirect(301, '/subscriptions'));
  app.get('/cart', sendPage('cart.html'));
  app.get('/contact', sendPage('contact.html'));
  app.get('/how-to-buy', sendPage('how-to-buy.html'));
  app.get('/support', sendPage('support.html'));
  app.get('/news', sendPage('news.html'));
  app.get('/status', sendPage('status.html'));
  app.get('/key2lix-plus', sendPage('Key2lix-plus.html'));
  // الرابط القديم (قبل إعادة التسمية إلى Key2lix) — إعادة توجيه 301 للمحافظة على الإشارات والروابط الخارجية
  app.get('/keylix-plus', (req, res) => res.redirect(301, '/key2lix-plus'));
  app.get('/how-to-sell', sendPage('how-to-sell.html'));
  app.get('/api', sendPage('api.html'));
  app.get('/docs/openapi.yaml', (req, res) => {
    const p = path.join(projectRoot, 'docs', 'openapi.yaml');
    if (fs.existsSync(p)) res.type('application/x-yaml').sendFile(p);
    else res.status(404).send('Not found');
  });
  app.get('/docs/api', (req, res) => {
    const p = path.join(projectRoot, 'docs', 'API.md');
    if (fs.existsSync(p)) res.type('text/markdown').sendFile(p);
    else res.status(404).send('Not found');
  });
  app.get('/ads', sendPage('ads.html'));
  app.get('/partnerships', sendPage('partnership.html'));
  app.get('/privacy', sendPage('privacy.html'));
  app.get('/terms', sendPage('terms.html'));
  app.get('/category', sendPage('category.html'));
  app.get('/category.html', sendPage('category.html'));
  app.get('/store/:id', sendPage('store.html'));
  app.get('/vendor-login', sendPage('vendor-login.html'));
  app.get('/vendor-register', sendPage('vendor-register.html'));

  app.get('/pages/admin.html', (req, res) => {
    if (req.session && req.session.admin) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');
      return sendPage('admin.html')(req, res, () => {});
    }
    return res.redirect('/login');
  });
  app.get('/pages/login.html', (req, res) => {
    if (req.session && req.session.admin) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');
      return sendPage('login.html')(req, res, () => {});
    }
    return res.redirect('/login');
  });
  app.get('/pages/vendor.html', (req, res) => {
    if (req.session && req.session.vendorId) {
      const v = db.getVendorById(req.session.vendorId);
      if (v && v.status === 'approved') {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
        return sendPage('vendor.html')(req, res, () => {});
      }
    }
    return res.redirect('/vendor-login');
  });
};
