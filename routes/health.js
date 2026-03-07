/**
 * مسارات الصحة والإصدار — للموازنات والمراقبة (UptimeRobot، AWS، إلخ).
 * لا تخضع لـ rate limit عند تسجيلها بعد الـ limits العامة.
 */
function registerHealth(app, opts) {
  const db = opts.db;
  const appVersion = opts.appVersion != null ? opts.appVersion : (process.env.BUILD_VERSION || process.env.APP_VERSION || ('b' + Date.now().toString(36)));

  /* Health check — بدون rate limit */
  app.get('/health', (req, res) => {
    try {
      if (db && db.getDb) {
        db.getDb().prepare('SELECT 1').get();
      }
      res.json({ status: 'ok', db: 'connected', uptime: Math.floor(process.uptime()) });
    } catch (err) {
      res.status(503).json({ status: 'error', db: 'disconnected', error: err && err.message ? err.message : String(err) });
    }
  });

  /* نسخة التطبيق — عند تغييرها يُعاد تحميل الصفحة تلقائياً لتفعيل التحديثات بعد إعادة الرفع */
  app.get('/api/version', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json({ version: appVersion });
  });
}

module.exports = { registerHealth };
