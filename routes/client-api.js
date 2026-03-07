/**
 * مسارات API العميل: تسجيل، دخول، تحقق بريد، كلمة مرور، طلباتي، قوائم، قائمة مشاركة، تذكير مناسبات، إشعارات، متاجر مميزة، متجر مورد.
 * تحتاج جلسة (عميل أو مورد للإشعارات) أو لا (قائمة مشاركة، تسجيل، نسيت كلمة المرور).
 */
const crypto = require('crypto');

const PENDING_VERIFY_EXPIRY_MS = 15 * 60 * 1000;
const RESEND_VERIFY_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;

function pruneClientLoginAttempts(attemptsMap, lockMs) {
  if (attemptsMap.size <= 1000) return;
  const now = Date.now();
  for (const [k, v] of attemptsMap.entries()) {
    if (!v || v.lockedUntil < now) attemptsMap.delete(k);
  }
  if (attemptsMap.size > 1000) {
    const keys = [...attemptsMap.keys()].slice(0, Math.floor(attemptsMap.size / 2));
    keys.forEach((k) => attemptsMap.delete(k));
  }
}

function registerClientApi(app, opts) {
  const db = opts.db;
  const logger = opts.logger || { info: () => {}, warn: () => {} };
  const express = opts.express;
  const getBcrypt = opts.getBcrypt;
  const emailService = opts.emailService || {};
  const queue = opts.queue || null;
  const normalizeClientEmail = opts.normalizeClientEmail || ((e) => (e && String(e).trim()) || '');
  const clientLoginAttempts = opts.clientLoginAttempts;
  const CLIENT_LOGIN_MAX = opts.CLIENT_LOGIN_MAX != null ? opts.CLIENT_LOGIN_MAX : 5;
  const CLIENT_LOCK_MS = opts.CLIENT_LOCK_MS != null ? opts.CLIENT_LOCK_MS : 15 * 60 * 1000;

  if (!db || !express || !getBcrypt) {
    throw new Error('routes/client-api: db, express, getBcrypt are required');
  }

  /* ===== تسجيل عميل (مع تحقق بريد) ===== */
  app.post('/api/client/register', async (req, res) => {
    try {
      const pending = req.session && req.session.pendingClient;
      const { email, password, code, name, phone, address } = req.body || {};
      if (pending && code != null) {
        const sentAt = pending.sentAt ? new Date(pending.sentAt.replace(' ', 'T') + 'Z').getTime() : 0;
        if (Date.now() - sentAt > PENDING_VERIFY_EXPIRY_MS) {
          delete req.session.pendingClient;
          return res.status(400).json({ error: 'انتهت صلاحية الرمز (15 دقيقة). يرجى طلب رمز جديد.' });
        }
        const trimmed = String(code).trim();
        if (trimmed.length < 4 || trimmed !== pending.verifyCode) {
          return res.status(400).json({ error: 'رمز التحقق غير صحيح. تحقق من الرمز وأعد المحاولة.' });
        }
        const clientId = pending.clientId;
        if (!clientId) {
          delete req.session.pendingClient;
          return res.status(400).json({ error: 'جلسة تسجيل غير صالحة. يرجى إعادة التسجيل من البداية.' });
        }
        if (db.markClientEmailVerified) db.markClientEmailVerified(clientId);
        else if (db.getDb && db.getDb().prepare) db.getDb().prepare('UPDATE clients SET email_verified = 1 WHERE id = ?').run(clientId);
        try { db.insertClientActivity(clientId, 'registered'); } catch (e) { }
        try { db.insertClientActivity(clientId, 'email_verified'); } catch (e) { }
        delete req.session.pendingClient;
        res.json({ success: true, message: 'تم إنشاء حسابك بنجاح. يمكنك تسجيل الدخول الآن.' });
        return;
      }
      if (!email || !password) return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور.' });
      const phoneTrim = (phone != null && typeof phone === 'string') ? phone.trim() : '';
      const addressTrim = (address != null && typeof address === 'string') ? address.trim() : '';
      if (!phoneTrim) return res.status(400).json({ error: 'يرجى إدخال رقم الهاتف.' });
      if (!addressTrim) return res.status(400).json({ error: 'يرجى إدخال العنوان.' });
      const normalized = String(email).trim().toLowerCase();
      const nameTrim = (name != null && typeof name === 'string') ? String(name).trim() : '';
      const hash = getBcrypt().hashSync(password, 10);
      let clientId;
      const existing = db.getClientByEmail(normalized);
      if (existing) {
        if (existing.email_verified) return res.status(400).json({ error: 'هذا البريد الإلكتروني مسجّل مسبقاً. جرّب تسجيل الدخول أو استعادة كلمة المرور.' });
        clientId = existing.id;
        if (db.updateClientPassword) db.updateClientPassword(clientId, hash);
        if (db.updateClientProfile) db.updateClientProfile(clientId, { name: nameTrim, phone: phoneTrim, address: addressTrim });
      } else {
        clientId = db.createClient(normalized, hash, nameTrim, phoneTrim, addressTrim);
      }
      const verifyCode = String(crypto.randomInt(100000, 999999));
      req.session.pendingClient = {
        clientId,
        email: normalized,
        password_hash: hash,
        name: nameTrim,
        phone: phoneTrim,
        address: addressTrim,
        verifyCode,
        sentAt: new Date().toISOString()
      };
      let emailSent = false;
      if (emailService.sendEmailVerification) {
        try {
          logger.info({ to: normalized.substring(0, 3) + '***', type: 'verification_email' }, 'Sending verification code');
          if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) {
            await queue.addEmailJob({ type: 'sendEmailVerification', to: normalized, code: verifyCode });
            emailSent = true;
          } else {
            emailSent = await emailService.sendEmailVerification(normalized, verifyCode);
          }
          if (emailSent) logger.info({ to: normalized.substring(0, 3) + '***' }, 'Verification email sent');
          else logger.warn({ to: normalized.substring(0, 3) + '***' }, 'Verification email not sent');
        } catch (e) {
          logger.warn({ err: e.message, to: normalized.substring(0, 3) + '***' }, 'Verification email error');
        }
      }
      const message = emailSent
        ? 'تم إرسال رمز التحقق إلى بريدك. أدخل الرمز أدناه لإكمال إنشاء الحساب.'
        : 'تعذّر إرسال رمز التحقق حاليًا. يرجى المحاولة لاحقاً أو التواصل مع الدعم.';
      res.json({ step: 'verify', message, email_sent: emailSent });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/client/register-resend-code', async (req, res) => {
    try {
      const pending = req.session && req.session.pendingClient;
      if (!pending) return res.status(400).json({ error: 'لا توجد جلسة تسجيل. يرجى إعادة تعبئة النموذج.' });
      const verifyCode = String(crypto.randomInt(100000, 999999));
      pending.verifyCode = verifyCode;
      pending.sentAt = new Date().toISOString();
      let emailSent = false;
      if (emailService.sendEmailVerification) {
        try {
          if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) {
            await queue.addEmailJob({ type: 'sendEmailVerification', to: pending.email, code: verifyCode });
            emailSent = true;
          } else {
            emailSent = await emailService.sendEmailVerification(pending.email, verifyCode);
          }
        } catch (e) { }
      }
      res.json({ success: true, email_sent: emailSent });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/client/login', (req, res) => {
    try {
      if (clientLoginAttempts) pruneClientLoginAttempts(clientLoginAttempts, CLIENT_LOCK_MS);
      const ip = req.ip || req.connection?.remoteAddress;
      const now = Date.now();
      let record = clientLoginAttempts ? clientLoginAttempts.get(ip) : null;
      if (record && record.lockedUntil > now) return res.status(429).json({ error: 'تم تجاوز عدد المحاولات المسموح بها. يرجى المحاولة مرة أخرى بعد 15 دقيقة.' });
      if (clientLoginAttempts && (!record || record.lockedUntil < now)) { record = { count: 0, lockedUntil: 0 }; clientLoginAttempts.set(ip, record); }
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور.' });
      const client = db.getClientByEmail(String(email).trim().toLowerCase());
      if (!client || !getBcrypt().compareSync(password, client.password_hash)) {
        if (record) { record.count++; if (record.count >= CLIENT_LOGIN_MAX) record.lockedUntil = now + CLIENT_LOCK_MS; }
        logger.warn({ type: 'client_login_failed', ip, email: email ? String(email).trim().substring(0, 3) + '***' : '[missing]' }, 'Failed client login attempt');
        return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التحقق والمحاولة مرة أخرى.' });
      }
      if (clientLoginAttempts) clientLoginAttempts.set(ip, { count: 0, lockedUntil: 0 });
      req.session.clientId = client.id;
      req.session.clientEmail = client.email;
      const returnUrl = (req.body && req.body.returnUrl) ? String(req.body.returnUrl).trim() : '';
      const redirect = (returnUrl && returnUrl.startsWith('/')) ? returnUrl : '/';
      req.session.save((err) => {
        if (err) { logger.error({ err: err.message }, 'Session save failed after client login'); return res.status(500).json({ error: 'خطأ في الجلسة. جرّب مرة أخرى.' }); }
        res.json({ success: true, redirect, client: { id: client.id, email: client.email, name: client.name, phone: client.phone, email_verified: !!client.email_verified } });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/client/logout', (req, res) => {
    req.session.clientId = null;
    req.session.clientEmail = null;
    res.json({ success: true });
  });

  app.post('/api/client/verify-email', (req, res) => {
    try {
      if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً.' });
      const code = (req.body && req.body.code) ? String(req.body.code).trim() : '';
      if (!code) return res.status(400).json({ error: 'يرجى إدخال رمز التأكيد المرسل إلى بريدك.' });
      const ok = db.verifyClientEmailByCode(req.session.clientId, code);
      if (!ok) return res.status(400).json({ error: 'رمز التأكيد غير صحيح أو انتهت صلاحيته. الرمز صالح لمدة 15 دقيقة من وقت الإرسال.' });
      try { db.insertClientActivity(req.session.clientId, 'email_verified'); } catch (e) { }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/client/resend-verify-email', (req, res) => {
    try {
      if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً.' });
      const client = db.getClientById(req.session.clientId);
      if (!client || !client.email) return res.status(400).json({ error: 'لا يوجد بريد إلكتروني مرتبط بهذا الحساب.' });
      if (client.email_verified) return res.status(400).json({ error: 'تم تأكيد بريدك الإلكتروني مسبقاً.' });
      const row = db.getDb().prepare('SELECT email_verification_sent_at FROM clients WHERE id = ?').get(req.session.clientId);
      if (row && row.email_verification_sent_at) {
        const sentAt = new Date(row.email_verification_sent_at.replace(' ', 'T') + 'Z').getTime();
        if (Date.now() - sentAt < RESEND_VERIFY_COOLDOWN_MS) {
          const retryAfter = Math.ceil((RESEND_VERIFY_COOLDOWN_MS - (Date.now() - sentAt)) / 1000);
          return res.status(429).json({ error: 'يرجى الانتظار قليلاً قبل طلب إرسال رمز جديد.', retryAfter });
        }
      }
      const verifyCode = String(crypto.randomInt(100000, 999999));
      db.setClientEmailVerificationToken(req.session.clientId, verifyCode);
      if (emailService.sendEmailVerification) {
        const toEmail = normalizeClientEmail(client.email);
        if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) queue.addEmailJob({ type: 'sendEmailVerification', to: toEmail, code: verifyCode }).catch(() => { });
        else emailService.sendEmailVerification(toEmail, verifyCode).catch(() => { });
      }
      res.json({ success: true, retryAfter: 60 });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/client/forgot-password', express.json(), (req, res) => {
    try {
      const email = (req.body && req.body.email) ? String(req.body.email).trim().toLowerCase() : '';
      if (!email) return res.status(400).json({ error: 'يرجى إدخال بريدك الإلكتروني.' });
      const client = db.getClientByEmail(email);
      const baseUrl = (process.env.SITE_URL || '').trim() || (req.protocol + '://' + (req.get('host') || ''));
      if (client && client.email && emailService.sendPasswordResetEmail) {
        const token = crypto.randomBytes(32).toString('hex');
        db.setClientPasswordResetToken(client.id, token);
        const resetLink = (baseUrl.replace(/\/$/, '') + '/client-reset-password?token=' + encodeURIComponent(token));
        const toEmail = normalizeClientEmail(client.email);
        if (queue && queue.isQueueEnabled && queue.isQueueEnabled()) queue.addEmailJob({ type: 'sendPasswordResetEmail', to: toEmail, resetLink }).catch(() => { });
        else emailService.sendPasswordResetEmail(toEmail, resetLink).catch(() => { });
      }
      res.json({ success: true, message: 'إذا كان هذا البريد مسجّلاً لدينا، ستتلقى خلال دقائق رسالة تحتوي على رابط إعادة تعيين كلمة المرور. يرجى التحقق من صندوق الوارد ومجلد الرسائل غير المرغوب فيها.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/client/reset-password', express.json(), (req, res) => {
    try {
      const token = (req.body && req.body.token) ? String(req.body.token).trim() : '';
      const newPassword = (req.body && req.body.newPassword) ? String(req.body.newPassword) : '';
      if (!token) return res.status(400).json({ error: 'رابط إعادة التعيين غير صالح. يرجى طلب رابط جديد من صفحة "نسيت كلمة المرور".' });
      if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.' });
      const client = db.getClientByPasswordResetToken(token);
      if (!client) return res.status(400).json({ error: 'رابط إعادة التعيين غير صالح أو مستخدم مسبقاً. يرجى طلب رابط جديد.' });
      const sentAt = client.password_reset_sent_at ? new Date(client.password_reset_sent_at.replace(' ', 'T') + 'Z').getTime() : 0;
      if (Date.now() - sentAt > PASSWORD_RESET_EXPIRY_MS) {
        db.clearClientPasswordResetToken(client.id);
        return res.status(400).json({ error: 'انتهت صلاحية هذا الرابط (ساعة من الإرسال). يرجى طلب إعادة تعيين كلمة المرور مرة أخرى.' });
      }
      const hash = getBcrypt().hashSync(newPassword, 10);
      db.updateClientPassword(client.id, hash);
      db.clearClientPasswordResetToken(client.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/client/change-password', (req, res) => {
    try {
      if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Unauthorized' });
      const { currentPassword, newPassword } = req.body || {};
      if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
      if (String(newPassword).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
      const client = db.getClientByIdWithPassword(req.session.clientId);
      if (!client || !getBcrypt().compareSync(String(currentPassword), client.password_hash)) return res.status(401).json({ error: 'Wrong current password' });
      const hash = getBcrypt().hashSync(String(newPassword), 10);
      db.updateClientPassword(req.session.clientId, hash);
      try { db.insertClientActivity(req.session.clientId, 'password_changed'); } catch (e) { }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/client/activity', (req, res) => {
    try {
      if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
      res.json(db.getClientActivity(req.session.clientId, 30));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/client/me', (req, res) => {
    if (req.session && req.session.clientId) {
      const c = db.getClientById(req.session.clientId);
      if (c) {
        const orderCount = db.getOrderCountByClientId ? db.getOrderCountByClientId(req.session.clientId) : 0;
        return res.json({ loggedIn: true, id: c.id, email: c.email, name: c.name, phone: c.phone || '', address: c.address || '', email_verified: !!c.email_verified, notify_by_email: !!c.notify_by_email, notify_by_dashboard: !!c.notify_by_dashboard, order_count: orderCount });
      }
    }
    res.json({ loggedIn: false });
  });

  app.patch('/api/client/me', (req, res) => {
    try {
      if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
      const { name, phone, address, notify_by_email, notify_by_dashboard } = req.body || {};
      const updates = {};
      if (name !== undefined) updates.name = String(name).trim();
      if (phone !== undefined) updates.phone = String(phone).trim();
      if (address !== undefined) updates.address = String(address).trim();
      if (notify_by_email !== undefined) updates.notify_by_email = !!notify_by_email;
      if (notify_by_dashboard !== undefined) updates.notify_by_dashboard = !!notify_by_dashboard;
      if (Object.keys(updates).length) db.updateClientProfile(req.session.clientId, updates);
      const c = db.getClientById(req.session.clientId);
      return res.json({ id: c.id, email: c.email, name: c.name, phone: c.phone || '', address: c.address || '', email_verified: !!c.email_verified, notify_by_email: !!c.notify_by_email, notify_by_dashboard: !!c.notify_by_dashboard });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/client/orders', (req, res) => {
    try {
      if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
      res.json(db.getOrdersByClientId(req.session.clientId));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/client/me/export', (req, res) => {
    try {
      if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
      const client = db.getClientById(req.session.clientId);
      if (!client) return res.status(404).json({ error: 'Client not found' });
      const orders = db.getOrdersByClientId(req.session.clientId);
      const exportData = {
        exported_at: new Date().toISOString(),
        profile: {
          id: client.id,
          email: client.email,
          name: client.name,
          phone: client.phone || '',
          address: client.address || '',
          created_at: client.created_at
        },
        orders: (orders || []).map((o) => ({
          id: o.id,
          date: o.date,
          product: o.product,
          value: o.value,
          status: o.status,
          product_category: o.product_category,
          product_subcat: o.product_subcat
        }))
      };
      const filename = 'key2lix-my-data-' + (client.id || 'user') + '-' + Date.now() + '.json';
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
      res.send(JSON.stringify(exportData, null, 2));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/client/wishlist', (req, res) => {
    try {
      if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
      res.json(db.getClientWishlist(req.session.clientId));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/client/wishlist', (req, res) => {
    try {
      if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
      const item = req.body && typeof req.body === 'object' ? req.body : {};
      db.addClientWishlist(req.session.clientId, { key: item.key, category: item.category, subcat: item.subcat || '', name: item.name, img: item.img });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/client/wishlist', (req, res) => {
    try {
      if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
      const { category, subcat, slug } = req.query || req.body || {};
      if (!category || !slug) return res.status(400).json({ error: 'category and slug required' });
      db.removeClientWishlist(req.session.clientId, category, subcat || '', slug);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/client/home-personalized', (req, res) => {
    try {
      const clientId = req.session && req.session.clientId ? req.session.clientId : null;
      const sessionId = (req.query.session_id && String(req.query.session_id).trim()) || (req.cookies && req.cookies.key2lix_guest_session) || null;
      const categoriesOfInterest = db.getCategoriesOfInterest(clientId, sessionId, 8);
      const recommendedProducts = db.getProductRecommendations({ clientId, sessionId, limit: 12 });
      res.json({ categoriesOfInterest, recommendedProducts });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/client/lists', (req, res) => {
    try {
      if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
      res.json(db.getClientLists(req.session.clientId));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/client/lists', express.json(), (req, res) => {
    try {
      if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
      const name = (req.body && req.body.name && String(req.body.name).trim()) || 'قائمة جديدة';
      const isPublic = !!(req.body && req.body.is_public);
      const list = db.addClientList(req.session.clientId, name, isPublic);
      res.status(201).json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/client/lists/:id', (req, res) => {
    try {
      if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
      const id = parseInt(req.params.id, 10);
      const list = db.getClientListById(id, req.session.clientId);
      if (!list) return res.status(404).json({ error: 'List not found' });
      const items = db.getClientListItems(id, req.session.clientId);
      res.json({ ...list, items });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/client/lists/:id', express.json(), (req, res) => {
    try {
      if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
      const id = parseInt(req.params.id, 10);
      const list = db.updateClientList(id, req.session.clientId, req.body || {});
      if (!list) return res.status(404).json({ error: 'List not found' });
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/client/lists/:id', (req, res) => {
    try {
      if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
      const id = parseInt(req.params.id, 10);
      const ok = db.deleteClientList(id, req.session.clientId);
      if (!ok) return res.status(404).json({ error: 'List not found' });
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/client/lists/:id/items', express.json(), (req, res) => {
    try {
      if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
      const listId = parseInt(req.params.id, 10);
      const { category, subcat, slug } = req.body || {};
      if (!category || !slug) return res.status(400).json({ error: 'category and slug required' });
      const item = db.addClientListItem(listId, req.session.clientId, category, subcat || '', slug);
      if (!item) return res.status(404).json({ error: 'List not found' });
      res.status(201).json(item);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/client/lists/:id/items', (req, res) => {
    try {
      if (!req.session || !req.session.clientId) return res.status(401).json({ error: 'Not logged in' });
      const listId = parseInt(req.params.id, 10);
      const { category, subcat, slug } = req.query || {};
      if (!category || !slug) return res.status(400).json({ error: 'category and slug required' });
      const ok = db.removeClientListItem(listId, req.session.clientId, category, subcat || '', slug);
      if (!ok) return res.status(404).json({ error: 'Item or list not found' });
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/list/:shareToken', (req, res) => {
    try {
      const token = (req.params.shareToken || '').trim();
      const list = db.getListByShareToken(token);
      if (!list) return res.status(404).json({ error: 'List not found' });
      const items = db.getClientListItems(list.id, true);
      const baseUrl = (process.env.BASE_URL || process.env.SITE_URL || (req.protocol + '://' + (req.get('host') || ''))).replace(/\/$/, '');
      res.json({ name: list.name, share_token: list.share_token, share_url: baseUrl + '/list/' + encodeURIComponent(list.share_token), items });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/list/:shareToken/items', express.json(), (req, res) => {
    try {
      const token = (req.params.shareToken || '').trim();
      const { category, subcat, slug } = req.body || {};
      if (!category || !slug) return res.status(400).json({ error: 'category and slug required' });
      const item = db.addClientListItemByShareToken(token, category, subcat || '', slug);
      if (!item) return res.status(404).json({ error: 'List not found' });
      res.status(201).json(item);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/occasion-reminders', express.json(), (req, res) => {
    try {
      const { email, occasion_type, occasion_date, reminder_days_before } = req.body || {};
      const orderEmail = (email && String(email).trim()) || (req.session && req.session.clientId && db.getClientById(req.session.clientId) && db.getClientById(req.session.clientId).email) || '';
      if (!orderEmail) return res.status(400).json({ error: 'Email required' });
      const occasionDate = (occasion_date && String(occasion_date).trim().slice(0, 10)) || '';
      if (!occasionDate) return res.status(400).json({ error: 'occasion_date required (YYYY-MM-DD)' });
      const reminder = db.addOccasionReminder(orderEmail, req.session && req.session.clientId ? req.session.clientId : null, occasion_type || 'custom', occasionDate, reminder_days_before);
      res.status(201).json(reminder);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/occasion-reminders', (req, res) => {
    try {
      if (req.session && req.session.clientId) {
        return res.json(db.getOccasionRemindersByClient(req.session.clientId));
      }
      const email = (req.query.email && String(req.query.email).trim()) || '';
      if (!email) return res.json([]);
      res.json(db.getOccasionRemindersByEmail(email));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/occasion-reminders/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (req.session && req.session.clientId) {
        const ok = db.deleteOccasionReminder(id, req.session.clientId);
        return ok ? res.status(204).end() : res.status(404).json({ error: 'Not found' });
      }
      const email = (req.query.email && String(req.query.email).trim()) || '';
      if (!email) return res.status(400).json({ error: 'Email required' });
      const ok = db.deleteOccasionReminder(id, email);
      return ok ? res.status(204).end() : res.status(404).json({ error: 'Not found' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/notifications', (req, res) => {
    try {
      if (req.session && req.session.clientId) {
        const list = db.getNotifications('client', req.session.clientId);
        const unread = db.getUnreadNotificationsCount('client', req.session.clientId);
        return res.json({ notifications: list, unread });
      }
      if (req.session && req.session.vendorId) {
        const list = db.getNotifications('vendor', req.session.vendorId);
        const unread = db.getUnreadNotificationsCount('vendor', req.session.vendorId);
        return res.json({ notifications: list, unread });
      }
      res.json({ notifications: [], unread: 0 });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/notifications/read/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (req.session && req.session.clientId) {
        db.markNotificationRead(id, 'client', req.session.clientId);
        return res.json({ success: true });
      }
      if (req.session && req.session.vendorId) {
        db.markNotificationRead(id, 'vendor', req.session.vendorId);
        return res.json({ success: true });
      }
      res.status(401).json({ error: 'Not logged in' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/notifications/read-all', (req, res) => {
    try {
      if (req.session && req.session.clientId) {
        db.markAllNotificationsRead('client', req.session.clientId);
        return res.json({ success: true });
      }
      if (req.session && req.session.vendorId) {
        db.markAllNotificationsRead('vendor', req.session.vendorId);
        return res.json({ success: true });
      }
      res.status(401).json({ error: 'Not logged in' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/featured-stores', (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 8;
      res.json(db.getFeaturedStores(limit));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/vendor-store/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: 'Invalid vendor id' });
      const vendor = db.getVendorById(id);
      if (!vendor || vendor.status !== 'approved') return res.status(404).json({ error: 'Vendor not found' });
      const products = db.getProductsByVendor(id).filter((p) => p.status === 'approved' || p.status == null);
      const displayName = (vendor.store_name && String(vendor.store_name).trim()) ? String(vendor.store_name).trim() : (vendor.name || vendor.email);
      res.json({
        vendor: {
          id: vendor.id,
          name: displayName,
          logo: vendor.logo || null,
          banner: vendor.banner || null,
          description: vendor.store_description || null,
          facebook_url: vendor.facebook_url || null,
          instagram_url: vendor.instagram_url || null,
          whatsapp_url: vendor.whatsapp_url || null,
          website_url: vendor.website_url || null
        },
        products: products.map((p) => ({
          key: p.slug,
          category: p.category,
          subcat: p.subcat,
          name: p.name,
          desc: p.desc,
          images: p.images,
          prices: p.prices,
          discount: p.discount,
          oldPrice: p.oldPrice,
          tags: p.tags
        }))
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/notifications/read-order-chat', (req, res) => {
    try {
      const orderId = (req.body && req.body.orderId) || (req.query && req.query.order);
      if (!orderId || typeof orderId !== 'string') return res.status(400).json({ error: 'orderId required' });
      const link = '/order-chat?order=' + encodeURIComponent(orderId.trim());
      if (req.session && req.session.clientId) {
        db.markNotificationsReadByLink('client', req.session.clientId, link);
        return res.json({ success: true });
      }
      if (req.session && req.session.vendorId) {
        db.markNotificationsReadByLink('vendor', req.session.vendorId, link);
        return res.json({ success: true });
      }
      res.status(401).json({ error: 'Not logged in' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerClientApi };
