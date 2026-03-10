/**
 * Key2lix API Cache — تخزين مؤقت في الذاكرة لتقليل الطلبات المكررة.
 * راجع docs/PERFORMANCE-PLAN.md (الخطة 4).
 *
 * - getConfig(): يُرجع Promise بـ /api/config — يُخزَّن حتى إعادة تحميل الصفحة.
 * - getClientMe(): يُرجع Promise بـ /api/client/me — يُخزَّن حتى invalidateClientMe().
 * - invalidateClientMe(): يُبطّل الكاش لـ client/me (استدعاؤه بعد تسجيل الدخول/الخروج).
 */
(function () {
  'use strict';
  var _configPromise = null;
  var _clientMePromise = null;

  function getConfig() {
    if (_configPromise) return _configPromise;
    _configPromise = fetch('/api/config', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) { return data || {}; })
      .catch(function () { return {}; });
    return _configPromise;
  }

  function getClientMe(opts) {
    opts = opts || {};
    if (!opts.force && _clientMePromise) return _clientMePromise;
    _clientMePromise = fetch('/api/client/me', { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) return { loggedIn: false };
        return r.json();
      })
      .then(function (data) { return data || { loggedIn: false }; })
      .catch(function () { return { loggedIn: false }; });
    return _clientMePromise;
  }

  function invalidateClientMe() {
    _clientMePromise = null;
  }

  window.Key2lixApi = {
    getConfig: getConfig,
    getClientMe: getClientMe,
    invalidateClientMe: invalidateClientMe
  };
})();
