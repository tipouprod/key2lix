/**
 * مسارات API المورد: تسجيل، دخول، 2FA، ملف شخصي، مفاتيح API، webhook، منتجات، طلبات، تقارير، استيراد كتالوج، تسوية PDF.
 * تحتاج جلسة مورد أو مفتاح API (للمسارات المدعومة).
 */
const crypto = require('crypto');

function parseCSVLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if ((c === ',' || c === ';') && !inQuotes) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function registerVendorApi(app, opts) {
  const db = opts.db;
  const logger = opts.logger || { info: () => {}, warn: () => {} };
  const express = opts.express;
  const getBcrypt = opts.getBcrypt;
  const getSpeakeasy = opts.getSpeakeasy;
  const getQRCode = opts.getQRCode;
  const getUpload = opts.getUpload;
  const requireVendor = opts.requireVendor;
  const requireVendorOrApiKey = opts.requireVendorOrApiKey;
  const processImageToWebP = opts.processImageToWebP;
  const maybeUploadImagesToS3 = opts.maybeUploadImagesToS3;
  const invalidateProductsCache = opts.invalidateProductsCache;
  const getPDFDocument = opts.getPDFDocument;
  const commissionService = opts.commissionService;
  const auditLog = opts.auditLog;
  const pushService = opts.pushService || { isConfigured: () => false, sendNotification: () => Promise.resolve(false) };
  const emailService = opts.emailService || { isConfigured: () => false, notifyClientOrderStatusChanged: () => Promise.resolve() };
  const queue = opts.queue || null;
  const normalizeClientEmail = opts.normalizeClientEmail || ((e) => (e && String(e).trim()) || '');
  const body = opts.body;
  const validationResult = opts.validationResult;
  const Sentry = opts.sentry || { captureException: () => {} };

  if (!db || !express || !getBcrypt || !getSpeakeasy || !getQRCode || !getUpload || !requireVendor || !requireVendorOrApiKey) {
    throw new Error('routes/vendor-api: db, express, getBcrypt, getSpeakeasy, getQRCode, getUpload, requireVendor, requireVendorOrApiKey are required');
  }
  if (!processImageToWebP || !maybeUploadImagesToS3 || typeof invalidateProductsCache !== 'function') {
    throw new Error('routes/vendor-api: processImageToWebP, maybeUploadImagesToS3, invalidateProductsCache are required');
  }
  if (!getPDFDocument || !commissionService || !auditLog) {
    throw new Error('routes/vendor-api: getPDFDocument, commissionService, auditLog are required');
  }
  if (!body || !validationResult) {
    throw new Error('routes/vendor-api: body, validationResult (express-validator) are required');
  }

  /* ===== Vendor: Register ===== */
  app.post('/api/vendor/register', async (req, res) => {
    try {
      const { name, email, phone, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
      if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      const existing = db.getVendorByEmail(email.trim());
      if (existing) return res.status(400).json({ error: 'Email already registered' });
      const password_hash = await getBcrypt().hash(String(password), 10);
      db.createVendor({ email: email.trim(), password_hash, name: (name || '').trim(), phone: (phone || '').trim() });
      res.json({ success: true, message: 'Registration successful. Wait for admin approval.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Vendor: Login ===== */
  app.post('/api/vendor/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
      const vendor = db.getVendorByEmail(email.trim());
      if (!vendor) {
        logger.warn({ type: 'vendor_login_failed', ip: req.ip || req.connection?.remoteAddress, email: String(email).trim().substring(0, 3) + '***' }, 'Failed vendor login: vendor not found');
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      if (vendor.status !== 'approved') {
        logger.warn({ type: 'vendor_login_failed', ip: req.ip || req.connection?.remoteAddress, reason: 'not_approved', vendorId: vendor.id }, 'Failed vendor login: account not approved');
        return res.status(403).json({ error: 'Account pending approval' });
      }
      const match = await getBcrypt().compare(String(password), vendor.password_hash);
      if (!match) {
        logger.warn({ type: 'vendor_login_failed', ip: req.ip || req.connection?.remoteAddress, email: String(email).trim().substring(0, 3) + '***' }, 'Failed vendor login: wrong password');
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      if (vendor.totp_enabled && vendor.totp_secret) {
        const tempToken = crypto.randomBytes(32).toString('hex');
        if (!global.vendorTempTokens) global.vendorTempTokens = new Map();
        global.vendorTempTokens.set(tempToken, { vendorId: vendor.id, createdAt: Date.now() });
        setTimeout(() => { if (global.vendorTempTokens) global.vendorTempTokens.delete(tempToken); }, 5 * 60 * 1000);
        try { db.addVendorActivityLog(vendor.id, 'login_2fa_pending', null); } catch (e) { }
        return res.json({ requires2FA: true, tempToken });
      }
      req.session.vendorId = vendor.id;
      req.session.loggedInAt = new Date().toISOString();
      try { db.addVendorActivityLog(vendor.id, 'login', null); } catch (e) { }
      res.json({ success: true, vendor: { id: vendor.id, name: vendor.name, email: vendor.email } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/vendor/logout', (req, res) => {
    if (req.session && req.session.vendorId) {
      try { db.addVendorActivityLog(req.session.vendorId, 'logout', null); } catch (e) { }
    }
    req.session.vendorId = null;
    req.session.loggedInAt = null;
    res.json({ success: true });
  });

  app.post('/api/vendor/logout-all', requireVendor, (req, res) => {
    const vendorId = req.session.vendorId;
    try {
      db.setVendorLogoutAllBefore(vendorId);
      db.addVendorActivityLog(vendorId, 'logout_all', null);
    } catch (e) { }
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.post('/api/vendor/2fa/verify-login', async (req, res) => {
    try {
      const { tempToken, code } = req.body || {};
      if (!tempToken || !code) return res.status(400).json({ error: 'tempToken and code required' });
      const pending = global.vendorTempTokens && global.vendorTempTokens.get(tempToken);
      if (!pending || Date.now() - pending.createdAt > 5 * 60 * 1000) {
        if (pending && global.vendorTempTokens) global.vendorTempTokens.delete(tempToken);
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
      }
      const vendor = db.getVendorByIdWithPassword(pending.vendorId);
      if (!vendor || !vendor.totp_secret) {
        if (global.vendorTempTokens) global.vendorTempTokens.delete(tempToken);
        return res.status(401).json({ error: 'Invalid session' });
      }
      const valid = getSpeakeasy().totp.verify({ secret: vendor.totp_secret, encoding: 'base32', token: String(code).trim(), window: 1 });
      if (!valid) return res.status(401).json({ error: 'Invalid code' });
      if (global.vendorTempTokens) global.vendorTempTokens.delete(tempToken);
      req.session.vendorId = vendor.id;
      req.session.loggedInAt = new Date().toISOString();
      try { db.addVendorActivityLog(vendor.id, 'login', '2FA'); } catch (e) { }
      res.json({ success: true, vendor: { id: vendor.id, name: vendor.name, email: vendor.email } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/vendor/activity-log', requireVendor, (req, res) => {
    try {
      const list = db.getVendorActivityLog(req.session.vendorId, 100);
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/vendor/2fa/setup', requireVendor, async (req, res) => {
    try {
      const v = db.getVendorById(req.session.vendorId);
      const label = (v && v.email) ? 'Key2lix (' + v.email + ')' : 'Key2lix (Vendor)';
      const secret = getSpeakeasy().generateSecret({ name: label, length: 20 });
      req.session.totpSetupSecret = secret.base32;
      const otpauth = secret.otpauth_url || ('otpauth://totp/Key2lix:vendor?secret=' + secret.base32 + '&issuer=Key2lix');
      const qrUrl = await getQRCode().toDataURL(otpauth);
      res.json({ secret: secret.base32, qrUrl });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/vendor/2fa/verify-setup', requireVendor, (req, res) => {
    try {
      const { code } = req.body || {};
      const secret = req.session.totpSetupSecret;
      if (!secret) return res.status(400).json({ error: 'Start 2FA setup first' });
      if (!code) return res.status(400).json({ error: 'Code required' });
      const valid = getSpeakeasy().totp.verify({ secret, encoding: 'base32', token: String(code).trim(), window: 1 });
      if (!valid) return res.status(400).json({ error: 'Invalid code' });
      db.setVendorTotp(req.session.vendorId, secret, true);
      req.session.totpSetupSecret = null;
      try { db.addVendorActivityLog(req.session.vendorId, '2fa_enabled', null); } catch (e) { }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/vendor/2fa/disable', requireVendor, (req, res) => {
    try {
      const { password } = req.body || {};
      if (!password) return res.status(400).json({ error: 'Password required' });
      const v = db.getVendorByIdWithPassword(req.session.vendorId);
      if (!v) return res.status(404).json({ error: 'Vendor not found' });
      const match = getBcrypt().compareSync(password, v.password_hash);
      if (!match) return res.status(400).json({ error: 'Incorrect password' });
      db.setVendorTotp(req.session.vendorId, null, false);
      try { db.addVendorActivityLog(req.session.vendorId, '2fa_disabled', null); } catch (e) { }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/vendor/me', requireVendor, (req, res) => {
    const v = db.getVendorById(req.session.vendorId);
    if (!v) return res.status(404).json({ error: 'Vendor not found' });
    res.json({
      id: v.id,
      email: v.email,
      name: v.name,
      phone: v.phone || '',
      store_name: v.store_name || null,
      logo: v.logo || null,
      banner: v.banner || null,
      store_description: v.store_description || null,
      response_time_hours: v.response_time_hours != null ? v.response_time_hours : null,
      anydesk_id: v.anydesk_id || null,
      return_policy: v.return_policy || null,
      facebook_url: v.facebook_url || null,
      instagram_url: v.instagram_url || null,
      whatsapp_url: v.whatsapp_url || null,
      website_url: v.website_url || null,
      totp_enabled: !!v.totp_enabled,
      notify_by_email: v.notify_by_email !== false,
      notify_by_dashboard: v.notify_by_dashboard !== false
    });
  });

  /* ===== Vendor API keys (session only) ===== */
  app.post('/api/vendor/api-keys', requireVendor, express.json(), (req, res) => {
    try {
      const name = (req.body && req.body.name) ? String(req.body.name).trim() : 'API Key';
      const key = crypto.randomBytes(32).toString('hex');
      const keyHash = crypto.createHash('sha256').update(key).digest('hex');
      const id = db.createVendorApiKey(req.vendorId, keyHash, name);
      res.status(201).json({ id, name, key });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get('/api/vendor/api-keys', requireVendor, (req, res) => {
    try {
      res.json(db.listVendorApiKeys(req.vendorId));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete('/api/vendor/api-keys/:id', requireVendor, (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const ok = db.deleteVendorApiKey(id, req.vendorId);
      if (!ok) return res.status(404).json({ error: 'API key not found' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Vendor webhook (session only) ===== */
  app.patch('/api/vendor/webhook', requireVendor, express.json(), (req, res) => {
    try {
      const webhookUrl = (req.body && req.body.webhook_url != null) ? String(req.body.webhook_url).trim() : '';
      const webhookSecret = crypto.randomBytes(24).toString('hex');
      db.updateVendorWebhook(req.vendorId, webhookUrl || null, webhookSecret);
      res.json({ webhook_url: webhookUrl || null, webhook_secret: webhookSecret });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/vendor/me', requireVendor, getUpload().fields([{ name: 'logo', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), async (req, res) => {
    try {
      const vendorId = req.session.vendorId;
      const updates = {};
      if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
      if (req.body.phone !== undefined) updates.phone = String(req.body.phone).trim();
      if (req.body.store_name !== undefined) {
        const raw = String(req.body.store_name || '').trim();
        updates.store_name = raw ? raw.slice(0, 100) : null;
      }
      if (req.body.store_description !== undefined) {
        const raw = String(req.body.store_description || '').trim();
        updates.store_description = raw ? raw.slice(0, 2000) : null;
      }
      if (req.body.response_time_hours !== undefined) {
        const v = req.body.response_time_hours;
        updates.response_time_hours = (v === '' || v === null || v === undefined) ? null : parseInt(v, 10);
      }
      if (req.body.anydesk_id !== undefined) {
        const aid = String(req.body.anydesk_id || '').trim();
        updates.anydesk_id = aid || null;
      }
      if (req.body.return_policy !== undefined) {
        const raw = String(req.body.return_policy || '').trim();
        updates.return_policy = raw ? raw.slice(0, 2000) : null;
      }
      if (req.body.facebook_url !== undefined) updates.facebook_url = (String(req.body.facebook_url || '').trim() || null).slice(0, 500) || null;
      if (req.body.instagram_url !== undefined) updates.instagram_url = (String(req.body.instagram_url || '').trim() || null).slice(0, 500) || null;
      if (req.body.whatsapp_url !== undefined) updates.whatsapp_url = (String(req.body.whatsapp_url || '').trim() || null).slice(0, 500) || null;
      if (req.body.website_url !== undefined) updates.website_url = (String(req.body.website_url || '').trim() || null).slice(0, 500) || null;
      const files = req.files || {};
      const logoFile = Array.isArray(files.logo) ? files.logo[0] : files.logo;
      const bannerFile = Array.isArray(files.banner) ? files.banner[0] : files.banner;
      if (logoFile && logoFile.path) {
        const rel = await processImageToWebP(logoFile.path);
        if (rel && typeof rel === 'object') updates.logo = rel.main;
        else if (rel) updates.logo = rel;
      }
      if (bannerFile && bannerFile.path) {
        const rel = await processImageToWebP(bannerFile.path);
        if (rel && typeof rel === 'object') updates.banner = rel.main;
        else if (rel) updates.banner = rel;
      }
      if (req.body.notify_by_email !== undefined) updates.notify_by_email = (req.body.notify_by_email === true || req.body.notify_by_email === '1');
      if (req.body.notify_by_dashboard !== undefined) updates.notify_by_dashboard = (req.body.notify_by_dashboard === true || req.body.notify_by_dashboard === '1');
      if (Object.keys(updates).length) {
        db.updateVendorProfile(vendorId, updates);
        try { db.addVendorActivityLog(vendorId, 'profile_updated', null); } catch (e) { }
      }
      const vUpdated = db.getVendorById(vendorId);
      res.json({
        id: vUpdated.id,
        email: vUpdated.email,
        name: vUpdated.name,
        phone: vUpdated.phone || '',
        store_name: vUpdated.store_name || null,
        logo: vUpdated.logo || null,
        response_time_hours: vUpdated.response_time_hours != null ? vUpdated.response_time_hours : null,
        anydesk_id: vUpdated.anydesk_id || null,
        notify_by_email: vUpdated.notify_by_email !== false,
        notify_by_dashboard: vUpdated.notify_by_dashboard !== false,
        return_policy: vUpdated.return_policy || null,
        banner: vUpdated.banner || null,
        store_description: vUpdated.store_description || null,
        facebook_url: vUpdated.facebook_url || null,
        instagram_url: vUpdated.instagram_url || null,
        whatsapp_url: vUpdated.whatsapp_url || null,
        website_url: vUpdated.website_url || null
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/vendor/change-password', requireVendor, [
    body('current_password').notEmpty().withMessage('Current password required'),
    body('new_password').isLength({ min: 6 }).withMessage('New password at least 6 characters')
  ], (req, res) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: errs.array().map(e => e.msg).join(' ') });
      const vendorId = req.session.vendorId;
      const v = db.getVendorByIdWithPassword(vendorId);
      if (!v) return res.status(404).json({ error: 'Vendor not found' });
      const match = getBcrypt().compareSync(req.body.current_password, v.password_hash);
      if (!match) return res.status(400).json({ error: 'Current password is incorrect' });
      const hash = getBcrypt().hashSync(req.body.new_password, 10);
      db.updateVendorPassword(vendorId, hash);
      try { db.addVendorActivityLog(vendorId, 'password_changed', null); } catch (e) { }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Vendor: Notifications SSE ===== */
  app.get('/api/vendor/notifications/stream', requireVendor, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const vendorId = req.session.vendorId;
    let lastCount = -1;
    const send = (data) => {
      res.write('data: ' + JSON.stringify(data) + '\n\n');
      try { res.flush && res.flush(); } catch (_) { }
    };
    const tick = () => {
      try {
        const count = db.getUnreadNotificationsCount('vendor', vendorId);
        if (count !== lastCount) { lastCount = count; send({ type: 'notifications', count }); }
      } catch (_) { }
    };
    tick();
    const iv = setInterval(tick, 8000);
    req.on('close', () => clearInterval(iv));
  });

  /* ===== Vendor: Products ===== */
  app.get('/api/vendor/products', requireVendorOrApiKey, (req, res) => {
    try {
      res.json(db.getProductsByVendor(req.vendorId));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/vendor/products', requireVendor, getUpload().array('images', 10), async (req, res) => {
    try {
      const scalar = (v) => (Array.isArray(v) ? (v[0] != null ? v[0] : '') : v);
      const raw = req.body || {};
      const category = scalar(raw.category);
      const subcat = scalar(raw.subcat);
      const key = scalar(raw.key);
      const name = scalar(raw.name);
      const desc = raw.desc;
      const prices = raw.prices;
      const tags = raw.tags;
      const discount = raw.discount;
      const old_price = raw.old_price;
      const offer_until = raw.offer_until;
      if (!category || !key || !name) return res.status(400).json({ error: 'Category, key and name required' });
      let imagePath = 'assets/img/default.png';
      const images = [];
      const files = req.files && Array.isArray(req.files) ? req.files : [];
      for (const file of files) {
        let rel = await processImageToWebP(file.path);
        rel = await maybeUploadImagesToS3(rel);
        if (rel && typeof rel === 'object') {
          images.push(rel.main);
          if (!imagePath || imagePath === 'assets/img/default.png') imagePath = rel.main;
        } else if (rel) {
          images.push(rel);
          if (!imagePath || imagePath === 'assets/img/default.png') imagePath = rel;
        }
      }
      if (images.length === 0) images.push(imagePath);
      let tagsArr = [];
      if (tags != null && tags !== '') {
        if (Array.isArray(tags)) tagsArr = tags;
        else if (typeof tags === 'string') tagsArr = tags.split(/[\s,،]+/).map((t) => t.trim()).filter(Boolean);
      }
      const productData = {
        name,
        desc: desc || '',
        images,
        prices: prices ? JSON.parse(prices) : [],
        tags: tagsArr.length ? tagsArr : null,
        discount: discount != null && discount !== '' ? discount : null,
        oldPrice: old_price != null && old_price !== '' ? old_price : null,
        offer_until: offer_until != null && offer_until !== '' ? offer_until : null
      };
      db.addProduct(req.session.vendorId, category, subcat || '', key, productData);
      invalidateProductsCache();
      try { db.addVendorActivityLog(req.session.vendorId, 'product_added', key + (name ? ':' + name : '')); } catch (e) { }
      res.json({ success: true, message: 'Product added' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/vendor/products/update', requireVendor, getUpload().single('image'), async (req, res) => {
    try {
      const { category, subcat, key, name, desc, prices, tags, discount, old_price, offer_until } = req.body;
      const prod = db.getProductByKey(category, subcat || '', key);
      if (!prod) return res.status(404).json({ error: 'Product not found' });
      let tagsArr = null;
      if (tags != null && tags !== '') {
        if (Array.isArray(tags)) tagsArr = tags;
        else if (typeof tags === 'string') tagsArr = tags.split(/[\s,،]+/).map((t) => t.trim()).filter(Boolean);
      }
      if (tagsArr && !tagsArr.length) tagsArr = null;
      const productData = {
        name: name || prod.name,
        desc: desc != null ? desc : prod.desc,
        images: JSON.parse(prod.images_json || '[]'),
        prices: prices ? JSON.parse(prices) : JSON.parse(prod.prices_json || '[]'),
        tags: tagsArr != null ? tagsArr : (prod.tags_json ? JSON.parse(prod.tags_json) : null),
        discount: discount !== undefined && discount !== '' ? discount : (prod.discount ?? null),
        oldPrice: old_price !== undefined && old_price !== '' ? old_price : (prod.old_price ?? null),
        offer_until: offer_until !== undefined && offer_until !== '' ? offer_until : (prod.offer_until ?? null)
      };
      if (req.file) {
        let rel = await processImageToWebP(req.file.path);
        rel = await maybeUploadImagesToS3(rel);
        if (rel && typeof rel === 'object') {
          productData.images.unshift(rel.main);
        } else productData.images.unshift(rel || `assets/img/${req.file.filename}`);
      }
      const ok = db.updateProduct(category, subcat || '', key, productData, req.session.vendorId);
      if (ok) invalidateProductsCache();
      if (!ok) return res.status(403).json({ error: 'Not your product' });
      try { db.addVendorActivityLog(req.session.vendorId, 'product_updated', key); } catch (e) { }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/vendor/products/delete', requireVendor, (req, res) => {
    try {
      const { category, subcat, key } = req.body;
      const ok = db.deleteProduct(category, subcat || '', key, req.session.vendorId);
      if (ok) invalidateProductsCache();
      if (!ok) return res.status(403).json({ error: 'Product not found or not yours' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/vendor/products/check-slug', requireVendor, (req, res) => {
    try {
      const { category, subcat, slug, exclude_category, exclude_subcat, exclude_slug } = req.query;
      if (!category || !slug) return res.status(400).json({ error: 'category and slug required' });
      const result = db.productSlugTaken(
        category,
        subcat || '',
        slug,
        exclude_category !== undefined ? exclude_category : null,
        exclude_subcat !== undefined ? exclude_subcat : null,
        exclude_slug !== undefined ? exclude_slug : null
      );
      if (!result.taken) return res.json({ taken: false });
      res.json({ taken: true, by_you: result.byVendorId === req.session.vendorId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/vendor/products/status', requireVendor, (req, res) => {
    try {
      const { category, subcat, key, status } = req.body;
      if (!category || !key || (status !== 'archived' && status !== 'approved')) {
        return res.status(400).json({ error: 'category, key and status (archived|approved) required' });
      }
      const ok = db.updateProductStatusByVendor(category, subcat || '', key, req.session.vendorId, status);
      if (ok) invalidateProductsCache();
      if (!ok) return res.status(403).json({ error: 'Product not found or not yours' });
      try { db.addVendorActivityLog(req.session.vendorId, status === 'archived' ? 'product_archived' : 'product_restored', key); } catch (e) { }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ===== Vendor: Orders ===== */
  app.get('/api/vendor/orders', requireVendorOrApiKey, (req, res) => {
    try {
      res.json(db.getOrdersByVendorId(req.vendorId));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/vendor/reports', requireVendor, (req, res) => {
    try {
      const orders = db.getOrdersByVendorId(req.session.vendorId);
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const byDay = {};
      const byProduct = {};
      orders.forEach((o) => {
        const d = o.date ? o.date.slice(0, 10) : null;
        if (!d || new Date(d) < thirtyDaysAgo) return;
        const day = d;
        if (!byDay[day]) byDay[day] = { count: 0, total: 0 };
        byDay[day].count += 1;
        const price = commissionService.parsePriceFromValue(o.value);
        if (!isNaN(price)) byDay[day].total += price;
        const name = (o.product || '').trim() || '—';
        byProduct[name] = (byProduct[name] || 0) + 1;
      });
      const salesByDay = Object.keys(byDay).sort().map((date) => ({ date, count: byDay[date].count, total: Math.round(byDay[date].total) }));
      const topProducts = Object.keys(byProduct).map((product) => ({ product, count: byProduct[product] })).sort((a, b) => b.count - a.count).slice(0, 10);
      res.json({ salesByDay, topProducts });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/vendor/repeat-customers', requireVendor, (req, res) => {
    try {
      const list = db.getRepeatCustomers(req.session.vendorId);
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/vendor/payments', requireVendor, (req, res) => {
    try {
      const list = db.getVendorPayments(req.session.vendorId);
      const total_paid = list.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const total_owed = db.getVendorCommissionOwed(req.session.vendorId);
      res.json({ payments: list, total_owed, total_paid, balance: Math.max(0, total_owed - total_paid) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/vendor/score', requireVendor, (req, res) => {
    try {
      res.json(db.getVendorScore(req.session.vendorId));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/vendor/price-suggestion', requireVendor, (req, res) => {
    try {
      const category = (req.query.category || '').trim();
      const subcat = (req.query.subcat || '').trim();
      if (!category) return res.status(400).json({ error: 'category required' });
      res.json(db.getPriceSuggestion(category, subcat));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/vendor/insights', requireVendor, (req, res) => {
    try {
      res.json({
        mostViewedNoOrder: db.getVendorMostViewedNoOrder(req.session.vendorId),
        categoriesToAdd: db.getCategoriesOrderedNotVendor(req.session.vendorId)
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/vendor/import-catalog', requireVendor, getUpload().single('file'), (req, res) => {
    try {
      if (!req.file || !req.file.path) return res.status(400).json({ error: 'No file uploaded' });
      const fs = require('fs');
      const raw = fs.readFileSync(req.file.path, 'utf8').replace(/^\uFEFF/, '');
      const lines = raw.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) return res.status(400).json({ error: 'CSV must have header and at least one row' });
      const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/\s/g, '_'));
      const nameIdx = header.indexOf('name') >= 0 ? header.indexOf('name') : 0;
      const descIdx = header.indexOf('desc') >= 0 ? header.indexOf('desc') : header.indexOf('description') >= 0 ? header.indexOf('description') : -1;
      const catIdx = header.indexOf('category') >= 0 ? header.indexOf('category') : -1;
      const subcatIdx = header.indexOf('subcat') >= 0 ? header.indexOf('subcat') : -1;
      const slugIdx = header.indexOf('slug') >= 0 ? header.indexOf('slug') : header.indexOf('key') >= 0 ? header.indexOf('key') : 1;
      const priceIdx = header.indexOf('price') >= 0 ? header.indexOf('price') : -1;
      const labelIdx = header.indexOf('label') >= 0 ? header.indexOf('label') : -1;
      const valueIdx = header.indexOf('value') >= 0 ? header.indexOf('value') : -1;
      const imported = [];
      const vendorId = req.session.vendorId;
      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        const name = (row[nameIdx] || '').trim();
        if (!name) continue;
        const category = (catIdx >= 0 && row[catIdx]) ? String(row[catIdx]).trim() : 'game_cards';
        const subcat = (subcatIdx >= 0 && row[subcatIdx]) ? String(row[subcatIdx]).trim() : '';
        let slug = (slugIdx >= 0 && row[slugIdx]) ? String(row[slugIdx]).trim() : name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\u0600-\u06FF\-_]/g, '').slice(0, 80);
        if (!slug) slug = 'product-' + i;
        const desc = descIdx >= 0 ? (row[descIdx] || '').trim() : '';
        let priceVal = (priceIdx >= 0 && row[priceIdx]) ? String(row[priceIdx]).trim() : (valueIdx >= 0 && row[valueIdx]) ? String(row[valueIdx]).trim() : '';
        const label = (labelIdx >= 0 && row[labelIdx]) ? String(row[labelIdx]).trim() : 'Default';
        const priceNum = parseFloat((priceVal || '').replace(/[^\d.]/g, ''));
        const prices = priceNum > 0 ? [{ label: label || 'Default', value: Math.round(priceNum) + ' DZD' }] : [];
        try {
          let s = slug;
          while (db.productSlugTaken(category, subcat, s).taken) s = slug + '-' + Date.now() + '-' + i;
          db.addProduct(vendorId, category, subcat, s, { name, desc, images: ['/assets/img/default.png'], prices, tags: null, discount: null, oldPrice: null, offer_until: null });
          imported.push({ name, category, subcat, slug: s });
        } catch (e) {
          if (e.message && e.message.indexOf('UNIQUE') >= 0) continue;
          throw e;
        }
      }
      try { db.addVendorActivityLog(vendorId, 'catalog_imported', String(imported.length)); } catch (e) { }
      if (imported.length > 0) invalidateProductsCache();
      res.json({ success: true, imported: imported.length, products: imported });
    } catch (err) {
      Sentry.captureException(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/vendor/settlement-report.pdf', requireVendor, (req, res) => {
    try {
      const from = (req.query.from || '').trim().slice(0, 10);
      const to = (req.query.to || '').trim().slice(0, 10);
      const report = db.getVendorSettlementReport(req.session.vendorId, from || null, to || null);
      const doc = new getPDFDocument()({ size: 'A4', margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="key2lix-settlement-' + (from || '') + '-' + (to || '') + '.pdf"');
      doc.pipe(res);
      doc.fontSize(20).fillColor('#7c3aed').text('Key2lix', { align: 'center' });
      doc.fontSize(12).fillColor('#000').text('Settlement Report / تقرير التسوية', { align: 'center' });
      doc.fontSize(10).fillColor('#666').text('Period: ' + (from || '—') + ' to ' + (to || '—'), { align: 'center' });
      doc.moveDown(1.5);
      doc.fontSize(14).fillColor('#000').text('Summary', 50);
      doc.fontSize(10).text('Total sales (completed): ' + report.total_sales + ' DZD');
      doc.text('Commission: ' + report.total_commission + ' DZD');
      doc.text('Net: ' + report.net + ' DZD');
      doc.moveDown(1);
      doc.fontSize(12).fillColor('#000').text('Orders (' + report.orders.length + ')', 50);
      doc.fontSize(9);
      report.orders.slice(0, 50).forEach((o) => {
        doc.fillColor('#333').text((o.date || '').slice(0, 10) + ' — ' + (o.product || '').slice(0, 30) + ' — ' + (o.value || '') + ' — Commission: ' + (o.commission_amount || 0));
      });
      if (report.orders.length > 50) doc.text('... and ' + (report.orders.length - 50) + ' more');
      doc.end();
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  });

  /* ===== Vendor: Order status / estimated-delivery / complete ===== */
  app.patch('/api/vendor/orders/:orderId/estimated-delivery', requireVendor, (req, res) => {
    try {
      const order = db.getOrderById(req.params.orderId);
      if (!order || order.vendor_id !== req.session.vendorId) return res.status(403).json({ error: 'Forbidden' });
      const estimated_delivery = (req.body && req.body.estimated_delivery != null) ? String(req.body.estimated_delivery).trim() || null : null;
      db.updateOrderEstimatedDelivery(req.params.orderId, estimated_delivery);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/vendor/orders/:orderId/status', requireVendor, (req, res) => {
    try {
      const order = db.getOrderById(req.params.orderId);
      if (!order || order.vendor_id !== req.session.vendorId) return res.status(403).json({ error: 'Forbidden' });
      const status = (req.body && req.body.status) ? String(req.body.status).toLowerCase() : '';
      if (status === 'preparing') {
        db.updateOrderStatus(req.params.orderId, 'preparing', null);
        auditLog('vendor', req.session.vendorId, 'order_status_change', { order_id: req.params.orderId, status: 'preparing' }, req);
        try {
          const v = db.getVendorById(order.vendor_id);
          if (v && v.webhook_url) {
            const webhook = require('../lib/webhook');
            const secret = db.getVendorWebhookSecret && db.getVendorWebhookSecret(order.vendor_id);
            webhook.sendOrderWebhook(v.webhook_url, secret, { event: 'order.status_changed', order_id: req.params.orderId, status: 'preparing', created_at: new Date().toISOString() });
          }
        } catch (e) { }
        return res.json({ success: true });
      }
      if (status === 'completed') {
        if (order.status === 'completed') return res.json({ success: true, already: true });
        db.updateOrderStatus(req.params.orderId, 'completed', new Date().toISOString());
        auditLog('vendor', req.session.vendorId, 'order_status_change', { order_id: req.params.orderId, status: 'completed' }, req);
        try {
          const v = db.getVendorById(order.vendor_id);
          if (v && v.webhook_url) {
            const webhook = require('../lib/webhook');
            const secret = db.getVendorWebhookSecret && db.getVendorWebhookSecret(order.vendor_id);
            webhook.sendOrderWebhook(v.webhook_url, secret, { event: 'order.status_changed', order_id: req.params.orderId, status: 'completed', created_at: new Date().toISOString() });
          }
        } catch (e) { }
        if (order.client_id) {
          const client = db.getClientById(order.client_id);
          if (client && client.notify_by_dashboard !== false) {
            try { db.addNotification('client', order.client_id, 'order_status', 'تم إكمال طلبك #' + order.id, '/client-account'); } catch (e) { }
            if (pushService.isConfigured()) {
              const subs = db.getPushSubscriptionsByUser('client', order.client_id);
              const payload = { title: 'تم إكمال طلبك', body: 'طلب #' + order.id + ' مكتمل', link: '/client-account' };
              subs.forEach((s) => pushService.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload).catch(() => { }));
            }
          }
          if (emailService.isConfigured() && client && client.email && client.notify_by_email) {
            const to = normalizeClientEmail(client.email);
            if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) queue.addEmailJob({ type: 'notifyClientOrderStatusChanged', to, orderId: order.id, status: 'completed', productName: order.product }).catch(() => { });
            else emailService.notifyClientOrderStatusChanged(to, order.id, 'completed', order.product).catch(() => { });
          }
        }
        return res.json({ success: true });
      }
      return res.status(400).json({ error: 'Invalid status. Use preparing or completed.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/vendor/orders/:orderId/complete', requireVendor, (req, res) => {
    try {
      const order = db.getOrderById(req.params.orderId);
      if (!order || order.vendor_id !== req.session.vendorId) return res.status(403).json({ error: 'Forbidden' });
      if (order.status === 'completed') return res.json({ success: true, already: true });
      db.updateOrderStatus(req.params.orderId, 'completed', new Date().toISOString());
      auditLog('vendor', req.session.vendorId, 'order_status_change', { order_id: req.params.orderId, status: 'completed' }, req);
      try {
        const v = db.getVendorById(order.vendor_id);
        if (v && v.webhook_url) {
          const webhook = require('../lib/webhook');
          const secret = db.getVendorWebhookSecret && db.getVendorWebhookSecret(order.vendor_id);
          webhook.sendOrderWebhook(v.webhook_url, secret, { event: 'order.status_changed', order_id: req.params.orderId, status: 'completed', created_at: new Date().toISOString() });
        }
      } catch (e) { }
      if (order.client_id) {
        const client = db.getClientById(order.client_id);
        if (client && client.notify_by_dashboard !== false) {
          try { db.addNotification('client', order.client_id, 'order_status', 'تم إكمال طلبك #' + order.id, '/client-account'); } catch (e) { }
          if (pushService.isConfigured()) {
            const subs = db.getPushSubscriptionsByUser('client', order.client_id);
            const payload = { title: 'تم إكمال طلبك', body: 'طلب #' + order.id + ' مكتمل', link: '/client-account' };
            subs.forEach((s) => pushService.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload).catch(() => { }));
          }
        }
        if (emailService.isConfigured() && client && client.email && client.notify_by_email) {
          const to = normalizeClientEmail(client.email);
          if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) queue.addEmailJob({ type: 'notifyClientOrderStatusChanged', to, orderId: order.id, status: 'completed', productName: order.product }).catch(() => { });
          else emailService.notifyClientOrderStatusChanged(to, order.id, 'completed', order.product).catch(() => { });
        }
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerVendorApi };
