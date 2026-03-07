/**
 * مسارات ثابتة وسريعة — تُستدعى قبل الجلسة لتقليل التأخير و 499 على الموازنات.
 * لا تحتاج جلسة ولا قاعدة بيانات.
 */
function registerStatic(app) {
  /* استجابة فورية للموازن والـ health check (قبل الجلسة) — استخدمها في Railway/Render كـ Health Check Path */
  app.get('/ping', (req, res) => {
    res.status(200).set('Content-Type', 'text/plain').send('ok');
  });

  /* تشخيص: هل الـ API يرد بـ JSON؟ */
  app.get('/api/ok', (req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  /* طلبات سريعة قبل الجلسة — لتقليل 499 و timeout على Railway */
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send('User-agent: *\nAllow: /\n');
  });

  app.get('/favicon.ico', (req, res) => {
    res.redirect(301, '/assets/img/favicon.png');
  });
}

module.exports = { registerStatic };
