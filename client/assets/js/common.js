/**
 * Key2lix – تحميل الـ navbar والـ footer وإعادة تطبيق اللغة بعد الحقن
 * A20: تحميل Sentry للعميل عند ضبط SENTRY_DSN
 * ngrok: إضافة هيدر تخطي تحذير المتصفح لجميع طلبات fetch عند فتح الموقع عبر ngrok
 * تحديث تلقائي: عند إعادة الرفع، نسخة التطبيق تتغير فيتم إعادة تحميل الصفحة مرة واحدة لتفعيل التعديلات دون حذف cookies يدوياً
 */
(function () {
  var VERSION_KEY = 'key2lix_app_version';
  try {
    fetch('/api/version', { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var newVer = (data && data.version) ? String(data.version) : '';
        if (!newVer) return;
        var stored = localStorage.getItem(VERSION_KEY);
        if (stored !== null && stored !== newVer) {
          localStorage.setItem(VERSION_KEY, newVer);
          var url = location.pathname + (location.search || '');
          if (url.indexOf('nocache=') === -1) location.href = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'nocache=' + Date.now();
        } else if (stored === null) localStorage.setItem(VERSION_KEY, newVer);
      })
      .catch(function () {});
  } catch (e) {}

  var isNgrok = typeof location !== 'undefined' && location.hostname && location.hostname.indexOf('ngrok') !== -1;
  if (isNgrok && typeof fetch !== 'undefined') {
    var origFetch = window.fetch;
    window.fetch = function (url, opts) {
      opts = opts || {};
      opts.headers = opts.headers || {};
      if (opts.headers instanceof Headers) {
        opts.headers.set('ngrok-skip-browser-warning', '1');
      } else {
        opts.headers['ngrok-skip-browser-warning'] = '1';
      }
      return origFetch.call(this, url, opts);
    };
  }
  function applyFooterConfig(c) {
    if (!c) return;
    if (c.social) {
      var wrap = document.getElementById('footer-social');
      var mobileWrap = document.getElementById('footer-mobile-social');
      if (wrap) wrap.querySelectorAll('[data-social]').forEach(function (a) {
        var key = a.getAttribute('data-social');
        var url = c.social[key];
        if (url) { a.href = url; a.removeAttribute('title'); a.style.display = ''; } else { a.style.display = 'none'; }
      });
      if (mobileWrap) mobileWrap.querySelectorAll('[data-social]').forEach(function (a) {
        var key = a.getAttribute('data-social');
        var url = c.social[key];
        if (url) { a.href = url; a.removeAttribute('title'); a.style.display = ''; } else { a.style.display = 'none'; }
      });
    }
    var wa = c.whatsappUrl || c.social && c.social.whatsapp;
    if (wa) {
      var cta = document.getElementById('footer-whatsapp-cta');
      if (cta) cta.href = wa;
    }
  }
  /** تحويل hex إلى تدرج أفتح (لـ --key2lix-primary-light) */
  function hexLighten(hex, pct) {
    if (!hex || typeof hex !== 'string') return '#a78bfa';
    var m = hex.replace(/^#/, '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return hex;
    pct = (pct != null ? pct : 0.25);
    var r = Math.min(255, Math.round(parseInt(m[1], 16) + (255 - parseInt(m[1], 16)) * pct));
    var g = Math.min(255, Math.round(parseInt(m[2], 16) + (255 - parseInt(m[2], 16)) * pct));
    var b = Math.min(255, Math.round(parseInt(m[3], 16) + (255 - parseInt(m[3], 16)) * pct));
    return '#' + [r, g, b].map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }

  function applyTheme(data) {
    if (!data || !data.primary) return;
    var primary = data.primary;
    var secondary = data.secondary || primary;
    var light = hexLighten(primary, 0.3);
    var id = 'key2lix-theme-vars';
    var el = document.getElementById(id);
    if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
    el.textContent = ':root { ' +
      '--key2lix-primary: ' + primary + '; ' +
      '--key2lix-primary-dark: ' + secondary + '; ' +
      '--key2lix-primary-light: ' + light + '; ' +
      '--key2lix-border: rgba(' + (function (h) {
        var m = h.replace(/^#/, '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
        return m ? parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) : '124,58,237';
      }(primary)) + ', 0.25); ' +
      '--key2lix-border-light: rgba(' + (function (h) {
        var m = h.replace(/^#/, '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
        return m ? parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) : '124,58,237';
      }(primary)) + ', 0.18); }';

    var heroWrap = document.querySelector('.home-hero-wrap');
    if (heroWrap && data.hero) {
      var h = data.hero;
      if (h.type === 'gradient' && h.gradient) {
        heroWrap.style.backgroundImage = h.gradient;
        heroWrap.style.backgroundSize = 'cover';
        heroWrap.style.backgroundPosition = 'center';
      } else if (h.type === 'solid' && h.color) {
        heroWrap.style.backgroundImage = 'none';
        heroWrap.style.backgroundColor = h.color;
      } else if (h.imageUrl) {
        heroWrap.style.backgroundImage = 'url(' + h.imageUrl + ')';
        heroWrap.style.backgroundSize = 'cover';
        heroWrap.style.backgroundPosition = 'center';
      }
      if (h.title) {
        var titleEl = document.getElementById('hero-title');
        if (titleEl) titleEl.textContent = h.title;
      }
      if (h.tagline) {
        var tagEl = heroWrap.querySelector('.hero-tagline');
        if (tagEl) tagEl.textContent = h.tagline;
      }
      var ctaPrimary = document.getElementById('hero-cta-primary');
      if (ctaPrimary) {
        if (h.ctaText) {
          var ctaSpan = ctaPrimary.querySelector('.hero-cta-text');
          if (ctaSpan) ctaSpan.textContent = h.ctaText;
        }
        if (h.ctaUrl) ctaPrimary.href = h.ctaUrl;
      }
      var heroVideo = heroWrap.querySelector('.hero-video-bg');
      if (h.videoUrl) {
        if (!heroVideo) {
          heroVideo = document.createElement('video');
          heroVideo.className = 'hero-video-bg';
          heroVideo.setAttribute('muted', '');
          heroVideo.setAttribute('playsinline', '');
          heroVideo.setAttribute('autoplay', '');
          heroVideo.setAttribute('loop', '');
          heroVideo.setAttribute('aria-hidden', 'true');
          heroWrap.insertBefore(heroVideo, heroWrap.firstChild);
        }
        heroVideo.src = h.videoUrl;
        heroVideo.style.display = '';
      } else if (heroVideo) {
        heroVideo.style.display = 'none';
        heroVideo.removeAttribute('src');
      }
    }

    if (data.homeSections) {
      var main = document.getElementById('main-content');
      var order = data.homeSections.order;
      var enabled = data.homeSections.enabled || {};
      if (main && Array.isArray(order) && order.length) {
        var sections = [].slice.call(main.querySelectorAll('[data-section-id]'));
        var byId = {};
        sections.forEach(function (s) { byId[s.getAttribute('data-section-id')] = s; });
        order.forEach(function (id) {
          if (byId[id]) {
            main.appendChild(byId[id]);
            byId[id].style.display = (enabled[id] === false) ? 'none' : '';
          }
        });
        sections.forEach(function (s) {
          var id = s.getAttribute('data-section-id');
          if (order.indexOf(id) === -1) {
            main.appendChild(s);
            s.style.display = (enabled[id] === false) ? 'none' : '';
          }
        });
      }
    }

    var icons = data.categoryIcons || {};
    ['products', 'subscriptions', 'hardware', 'software'].forEach(function (key) {
      var url = icons[key];
      if (!url) return;
      document.querySelectorAll('[data-category="' + key + '"] .home-cat-img, [data-category="' + key + '"] img.cat-icon').forEach(function (img) {
        img.src = url;
      });
      document.querySelectorAll('.dropdown-item[data-category="' + key + '"] img.cat-icon').forEach(function (img) {
        img.src = url;
      });
    });
  }

  var CURRENCY_KEY = 'key2lix_currency';
  var currencyRatesCache = { USD: 270, EUR: 300 };

  var SUPPORTED_CURRENCIES = ['DZD', 'USD', 'EUR'];

  window.Key2lixCurrency = {
    current: function () {
      try {
        var c = localStorage.getItem(CURRENCY_KEY);
        return (c === 'USD' || c === 'EUR') ? c : 'DZD';
      } catch (e) { return 'DZD'; }
    },
    isValid: function (code) { return code === 'DZD' || code === 'USD' || code === 'EUR'; },
    supported: function () { return SUPPORTED_CURRENCIES.slice(); },
    apply: function (code) {
      try {
        if (!this.isValid(code)) return;
          localStorage.setItem(CURRENCY_KEY, code);
          var langStr = (window.Key2lixLang && window.Key2lixLang.current() === 'ar') ? 'AR' : 'EN';
          var footerLabel = document.getElementById('footer-lang-currency-label');
          if (footerLabel) footerLabel.textContent = langStr + ' / ' + code;
          var langCurrencyLabel = document.getElementById('lang-currency-label');
          if (langCurrencyLabel) langCurrencyLabel.textContent = langStr + ' / ' + code;
          try { document.dispatchEvent(new CustomEvent('key2lix:currencyChange', { detail: { currency: code } })); } catch (e) {}
      } catch (e) {}
    },
    getRates: function () { return Object.assign({}, currencyRatesCache); },
    setRates: function (r) {
      if (r && r.USD != null) { var u = parseFloat(r.USD); currencyRatesCache.USD = isNaN(u) || u <= 0 ? 270 : u; }
      if (r && r.EUR != null) { var e = parseFloat(r.EUR); currencyRatesCache.EUR = isNaN(e) || e <= 0 ? 300 : e; }
    }
  };

  /**
   * تنسيق مبلغ (مخزّن دائماً بالدينار) حسب العملة المعروضة.
   * @param {number|string} num - المبلغ بالدينار (يقبل أرقاماً سالبة، أو نصوص مثل "1 500,50")
   * @param {Object} [options] - forceDzd, decimals, symbol: 'dzd'|'DZD', thousands, compact: true للأرقام الكبيرة (مثلاً 1.2K).
   * @returns {string} نص منسق جاهز للعرض
   */
  window.formatPrice = function (num, options) {
    if (num === null || num === undefined || num === '') return '';
    var raw = String(num).replace(/\s/g, '').replace(/,/g, '.');
    var n = parseFloat(raw);
    if (isNaN(n)) return '';
    var opts = options || {};
    var forceDzd = opts.forceDzd === true;
    var currency = forceDzd ? 'DZD' : (window.Key2lixCurrency ? window.Key2lixCurrency.current() : 'DZD');
    var decimals = (opts.decimals != null) ? opts.decimals : 2;
    var useDzdSymbol = opts.symbol === 'dzd' || (opts.symbol !== 'DZD' && window.Key2lixLang && window.Key2lixLang.current() === 'ar');
    var thousands = opts.thousands != null ? opts.thousands : (window.Key2lixLang && window.Key2lixLang.current() === 'ar' ? '\u066C' : ',');
    var compact = opts.compact === true;
    var negative = n < 0;
    n = Math.abs(n);

    function formatDzdAmount(value) {
      var fixed = value.toFixed(2);
      var parts = fixed.split('.');
      var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
      var out = parts[1] ? intPart + '.' + parts[1] : intPart;
      return (negative ? '\u2212' : '') + out + (useDzdSymbol ? ' د.ج' : ' DZD');
    }

    function compactNum(value) {
      if (value >= 1e6) return (negative ? '\u2212' : '') + (value / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
      if (value >= 1e3) return (negative ? '\u2212' : '') + (value / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
      return null;
    }

    if (currency === 'DZD') {
      if (compact) {
        var c = compactNum(n);
        if (c) return c + (useDzdSymbol ? ' د.ج' : ' DZD');
      }
      return formatDzdAmount(n);
    }
    var rates = (window.Key2lixCurrency && window.Key2lixCurrency.getRates()) || currencyRatesCache;
    var rate = currency === 'USD' ? rates.USD : rates.EUR;
    if (!rate || rate <= 0 || isNaN(rate)) return formatDzdAmount(n);
    var converted = n / rate;
    var convertedFixed = converted.toFixed(decimals);
    return (negative ? '\u2212' : '') + convertedFixed + ' ' + currency;
  };

  /**
   * تنسيق مبلغ للعرض: يستخدم العملة المختارة. في صفحات الأدمن يُجبر عرض الدينار فقط.
   */
  window.formatPriceDzd = function (num, options) {
    var opts = options || {};
    var path = (window.location && window.location.pathname) || '';
    if (path.indexOf('admin') !== -1) opts.forceDzd = true;
    return window.formatPrice ? window.formatPrice(num, opts) : (num != null && num !== '' ? (parseFloat(String(num).replace(/\s/g, '').replace(/,/g, '.')) || 0).toFixed(2) + ' DZD' : '');
  };

  /** تحديث كل العناصر ذات data-price-dzd عند تغيير العملة (بدون إعادة تحميل). */
  function refreshPriceElements() {
    if (!window.formatPrice) return;
    document.querySelectorAll('[data-price-dzd]').forEach(function (el) {
      var raw = el.getAttribute('data-price-dzd');
      if (raw !== null && raw !== '') el.textContent = window.formatPrice(raw);
    });
  }
  document.addEventListener('key2lix:currencyChange', refreshPriceElements);

  fetch('/api/config', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (c) {
      if (c) window.Key2lixConfig = c;
      if (c && c.currencyRates && window.Key2lixCurrency) window.Key2lixCurrency.setRates(c.currencyRates);
      if (c && c.sentryDsn) {
        var s = document.createElement('script');
        s.src = 'https://browser.sentry-cdn.com/7.109.0/bundle.tracing.min.js';
        s.crossOrigin = 'anonymous';
        s.onload = function () {
          if (window.Sentry) window.Sentry.init({ dsn: c.sentryDsn, environment: c.env || 'development', tracesSampleRate: 0.1 });
        };
        document.head.appendChild(s);
      }
      applyFooterConfig(c);
    })
    .catch(function () {});

  fetch('/api/theme', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(applyTheme)
    .catch(function () {});

  /**
   * تنسيق السعر بالدينار الجزائري بدون مسافات: 800.00 DZD ، 5000.00 DZD ، 2200.00 DZD
   * @param {number|string} num - الرقم أو النص (يقبل "800", "5000", "10 000", ...)
   * @returns {string} نص منسق مثل "2200.00 DZD"
   */
  /** معرف جلسة الضيف (للتوصيات والصفحة الرئيسية الشخصية دون تسجيل دخول) */
  window.Key2lixGuestSessionId = function () {
    try {
      var key = 'key2lix_guest_session';
      var id = localStorage.getItem(key);
      if (!id || id.length < 10) {
        id = 'gs_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36);
        localStorage.setItem(key, id);
      }
      return id;
    } catch (e) { return ''; }
  };

  window.Key2lixToast = function (message, type) {
    type = type || 'success';
    var toast = document.createElement('div');
    toast.className = 'key2lix-toast ' + type;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, 3000);
  };

  (function initQuickViewForListPages() {
    var path = typeof window.location !== 'undefined' ? window.location.pathname : '';
    if (path !== '/products' && path !== '/category' && path !== '/products.html' && path !== '/category.html') return;
    if (document.getElementById('home-quick-view')) return;
    var wrap = document.createElement('div');
    wrap.id = 'home-quick-view';
    wrap.className = 'home-quick-view-overlay';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'qv-title');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = '<div class="home-quick-view-modal"><div class="img-wrap" style="position:relative;"><button type="button" class="home-quick-view-close" aria-label="Close" id="qv-close"><i class="fas fa-times" aria-hidden="true"></i></button><img id="qv-img" src="" alt=""></div><div class="card-body"><h3 id="qv-title"></h3><p class="card-price" id="qv-price"></p><div class="qv-actions"><a href="#" id="qv-add-cart" class="btn btn-qv-cart"><i class="fas fa-cart-plus" aria-hidden="true"></i> <span data-i18n="addToCart">أضف للسلة</span></a><a href="#" id="qv-link" class="btn btn-qv-view"><span data-i18n="viewProduct">عرض المنتج</span> <i class="fas fa-chevron-right card-btn-icon" aria-hidden="true"></i></a></div></div></div>';
    document.body.appendChild(wrap);
    var overlay = document.getElementById('home-quick-view');
    var qvClose = document.getElementById('qv-close');
    if (qvClose) qvClose.addEventListener('click', function () { overlay.classList.remove('visible'); overlay.setAttribute('aria-hidden', 'true'); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) { overlay.classList.remove('visible'); overlay.setAttribute('aria-hidden', 'true'); } });
    window.Key2lixQuickView = {
      show: function (p) {
        if (!p || !overlay) return;
        var img = document.getElementById('qv-img');
        var title = document.getElementById('qv-title');
        var price = document.getElementById('qv-price');
        var link = document.getElementById('qv-link');
        var addCart = document.getElementById('qv-add-cart');
        if (!img || !title || !price || !link) return;
        var imgSrc = (p.images && p.images[0]) ? p.images[0] : '/assets/img/default.png';
        if (imgSrc.indexOf('/') !== 0) imgSrc = '/' + imgSrc;
        var rawPrice = (p.prices && p.prices[0]) ? p.prices[0].value : null;
        var priceVal = (window.formatPriceDzd && rawPrice != null) ? window.formatPriceDzd(rawPrice) : (rawPrice || 'N/A');
        var productUrl = '/product.html?product=' + encodeURIComponent(p.key || '') + '&category=' + encodeURIComponent(p.category || '');
        if (p.subcat) productUrl += '&subcat=' + encodeURIComponent(p.subcat);
        img.src = imgSrc;
        img.alt = p.name || '';
        title.textContent = p.name || '';
        price.textContent = priceVal;
        if (rawPrice != null && rawPrice !== '') price.setAttribute('data-price-dzd', String(rawPrice)); else price.removeAttribute('data-price-dzd');
        link.href = productUrl;
        overlay.classList.add('visible');
        overlay.setAttribute('aria-hidden', 'false');
        overlay._qvProduct = p;
        if (addCart) addCart.onclick = function (e) {
          e.preventDefault();
          if (window.Key2lixCart && window.Key2lixCart.add) window.Key2lixCart.add({ key: p.key, category: p.category, subcat: p.subcat || '', name: p.name, value: rawPrice, img: imgSrc });
          if (window.Key2lixToast) window.Key2lixToast((window.Key2lixLang && window.Key2lixLang.get('addedToCart')) || 'Added to cart!', 'success');
          overlay.classList.remove('visible');
          overlay.setAttribute('aria-hidden', 'true');
        };
      }
    };
  })();

  /**
   * P23 — تتبع أحداث التحليلات (تحليلات مخصصة).
   * يرسل حدثاً للصفحة (للتكامل مع Google Tag Manager أو غيره) واختيارياً إلى الخادم.
   * @param {string} eventName - اسم الحدث (مثل 'view_item', 'add_to_cart', 'purchase')
   * @param {object} [data] - بيانات اختيارية (مثل productId, value, ...)
   */
  window.Key2lixTrack = function (eventName, data) {
    try {
      var payload = { event: eventName, data: data || {}, ts: Date.now() };
      if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('key2lix-track', { detail: payload }));
      }
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin'
      }).catch(function () {});
    } catch (e) { /* no-op */ }
  };

  function loadPartial(id, url) {
    var el = document.getElementById(id);
    if (!el) return Promise.resolve();
    return fetch(url)
      .then(function (r) { return r.text(); })
      .then(function (html) {
        el.innerHTML = html;
        return el;
      })
      .catch(function (e) { console.error('Load error ' + url, e); });
  }

  function updateLangCurrencyButtonLabel() {
    var lang = (window.Key2lixLang && window.Key2lixLang.current()) ? window.Key2lixLang.current() : 'en';
    var cur = (window.Key2lixCurrency && window.Key2lixCurrency.current()) ? window.Key2lixCurrency.current() : 'DZD';
    var langStr = lang === 'ar' ? 'AR' : 'EN';
    var label = langStr + ' / ' + cur;
    var el = document.getElementById('lang-currency-label');
    if (el) el.textContent = label;
    var btn = document.getElementById('lang-currency-btn');
    if (btn) {
      var aria = (window.Key2lixLang && window.Key2lixLang.get('languageAndCurrency')) || 'Language and currency';
      btn.setAttribute('aria-label', aria + ': ' + label);
    }
    var langList = document.getElementById('lang-currency-lang-list');
    if (langList) langList.querySelectorAll('[data-lang]').forEach(function (li) {
      li.setAttribute('aria-selected', li.getAttribute('data-lang') === lang ? 'true' : 'false');
      li.classList.toggle('lang-currency-selected', li.getAttribute('data-lang') === lang);
    });
    var curList = document.getElementById('lang-currency-currency-list');
    if (curList) curList.querySelectorAll('[data-currency]').forEach(function (li) {
      li.setAttribute('aria-selected', li.getAttribute('data-currency') === cur ? 'true' : 'false');
      li.classList.toggle('lang-currency-selected', li.getAttribute('data-currency') === cur);
    });
  }

  function bindLangCurrencyDropdown() {
    var wrap = document.getElementById('lang-currency-wrap');
    var btn = document.getElementById('lang-currency-btn');
    var panel = document.getElementById('lang-currency-panel');
    var langList = document.getElementById('lang-currency-lang-list');
    var curList = document.getElementById('lang-currency-currency-list');
    if (!btn || !panel) return;

    panel.setAttribute('hidden', '');
    panel.style.display = 'none';
    updateLangCurrencyButtonLabel();

    function openPanel() {
      panel.removeAttribute('hidden');
      panel.style.display = 'block';
      btn.setAttribute('aria-expanded', 'true');
      var firstLang = langList && langList.querySelector('[data-lang]');
      if (firstLang) firstLang.focus();
    }
    function closePanel() {
      panel.setAttribute('hidden', '');
      panel.style.display = 'none';
      btn.setAttribute('aria-expanded', 'false');
      btn.focus();
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var isOpen = panel.style.display === 'block';
      if (isOpen) closePanel(); else openPanel();
    });

    function bindList(listEl, attr, applyFn) {
      if (!listEl) return;
      var items = listEl.querySelectorAll('li');
      items.forEach(function (li, idx) {
        li.addEventListener('click', function () {
          var val = li.getAttribute(attr);
          if (val && applyFn) applyFn(val);
          updateLangCurrencyButtonLabel();
        });
        li.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); return; }
          if (e.key === 'ArrowDown' && idx < items.length - 1) { e.preventDefault(); items[idx + 1].focus(); return; }
          if (e.key === 'ArrowUp' && idx > 0) { e.preventDefault(); items[idx - 1].focus(); return; }
          if (e.key === 'Escape') { e.preventDefault(); closePanel(); }
        });
      });
    }
    bindList(langList, 'data-lang', function (lang) { if (window.Key2lixLang) window.Key2lixLang.apply(lang); });
    bindList(curList, 'data-currency', function (code) { if (window.Key2lixCurrency && window.Key2lixCurrency.isValid(code)) window.Key2lixCurrency.apply(code); });

    document.addEventListener('click', function (e) {
      if (wrap && !wrap.contains(e.target)) closePanel();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.style.display === 'block') { e.preventDefault(); closePanel(); }
    });
    document.addEventListener('key2lix:languageChange', updateLangCurrencyButtonLabel);
    document.addEventListener('key2lix:currencyChange', updateLangCurrencyButtonLabel);
  }

  function bindThemeToggle() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    var theme = localStorage.getItem('key2lix_theme') || 'dark';
    if (theme === 'light') document.body.classList.add('theme-light');
    btn.addEventListener('click', function () {
      document.body.classList.toggle('theme-light');
      var isLight = document.body.classList.contains('theme-light');
      localStorage.setItem('key2lix_theme', isLight ? 'light' : 'dark');
    });
  }

  function applyContrastPreference() {
    if (localStorage.getItem('key2lix_contrast') === 'high') document.body.classList.add('theme-contrast');
    else document.body.classList.remove('theme-contrast');
  }

  function bindContrastToggle() {
    var btn = document.getElementById('contrast-toggle');
    if (!btn) return;
    applyContrastPreference();
    function updateContrastLabel() {
      var isHigh = document.body.classList.contains('theme-contrast');
      btn.setAttribute('aria-pressed', isHigh ? 'true' : 'false');
      btn.title = isHigh ? (window.Key2lixLang && window.Key2lixLang.get('contrastOff')) || 'تعطيل التباين العالي' : (window.Key2lixLang && window.Key2lixLang.get('contrastOn')) || 'تفعيل التباين العالي';
    }
    updateContrastLabel();
    btn.addEventListener('click', function () {
      document.body.classList.toggle('theme-contrast');
      var isHigh = document.body.classList.contains('theme-contrast');
      try { localStorage.setItem('key2lix_contrast', isHigh ? 'high' : ''); } catch (e) {}
      updateContrastLabel();
    });
  }

  function bindDropdownAria() {
    var drop = document.querySelector('#navbar .dropdown');
    var navEl = document.getElementById('navbar');
    if (!drop) return;
    var btn = drop.querySelector('.dropbtn');
    var content = drop.querySelector('.dropdown-content');
    if (!btn || !content) return;
    var leaveTimer = null;
    function setOpen(open) {
      if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
      drop.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (navEl) navEl.classList.toggle('dropdown-open', open);
    }
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(!drop.classList.contains('open'));
    });
    drop.addEventListener('mouseenter', function () {
      if (window.innerWidth > 768) {
        if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
        setOpen(true);
      }
    });
    drop.addEventListener('mouseleave', function () {
      if (window.innerWidth > 768) {
        leaveTimer = setTimeout(function () { setOpen(false); leaveTimer = null; }, 180);
      }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#navbar .dropdown')) setOpen(false);
    });
  }

  function bindNavbarMobile() {
    var drop = document.querySelector('#navbar .dropdown');
    if (drop) {
      var dropbtn = drop.querySelector('.dropbtn');
      if (dropbtn) dropbtn.addEventListener('click', function (e) {
        if (window.innerWidth <= 768) { e.preventDefault(); drop.classList.toggle('open'); }
      });
    }
    bindNavDrawer();
  }

  function bindNavDrawer() {
    var navbarRoot = document.getElementById('navbar');
    var menuBtn = document.getElementById('nav-mobile-menu-btn');
    var drawer = document.getElementById('nav-drawer');
    var backdrop = document.getElementById('nav-drawer-backdrop');
    var closeBtn = document.getElementById('nav-drawer-close');
    if (!navbarRoot || !drawer) return;

    function getDrawerFocusables() {
      var sel = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
      return [].slice.call(drawer.querySelectorAll(sel)).filter(function (el) {
        return el.offsetParent !== null && !el.hasAttribute('aria-hidden');
      });
    }

    function openDrawer() {
      navbarRoot.classList.add('nav-drawer-open');
      drawer.setAttribute('aria-hidden', 'false');
      if (backdrop) backdrop.setAttribute('aria-hidden', 'false');
      if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      if (closeBtn) closeBtn.focus();
      document.addEventListener('keydown', handleDrawerKeydown);
    }

    function closeDrawer() {
      navbarRoot.classList.remove('nav-drawer-open');
      drawer.setAttribute('aria-hidden', 'true');
      if (backdrop) backdrop.setAttribute('aria-hidden', 'true');
      if (menuBtn) {
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.focus();
      }
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleDrawerKeydown);
      drawer.querySelectorAll('.nav-drawer-dropdown.open').forEach(function (el) {
        el.classList.remove('open');
        var sub = el.querySelector('.nav-drawer-sub');
        if (sub) sub.setAttribute('aria-hidden', 'true');
        var btn = el.querySelector('.nav-drawer-dropdown-btn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });
    }

    function handleDrawerKeydown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDrawer();
        return;
      }
      if (e.key !== 'Tab' || !navbarRoot.classList.contains('nav-drawer-open')) return;
      var focusables = getDrawerFocusables();
      if (focusables.length === 0) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    if (menuBtn) menuBtn.addEventListener('click', openDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    if (backdrop) {
      backdrop.addEventListener('click', closeDrawer);
      backdrop.addEventListener('touchend', function (e) { e.preventDefault(); closeDrawer(); }, { passive: false });
    }

    drawer.querySelectorAll('.nav-drawer-dropdown-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var parent = btn.closest('.nav-drawer-dropdown');
        if (!parent) return;
        var sub = parent.querySelector('.nav-drawer-sub');
        var isOpen = parent.classList.toggle('open');
        if (sub) sub.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    });

    drawer.querySelectorAll('.nav-drawer-link[href]').forEach(function (a) {
      if (a.getAttribute('href') && a.getAttribute('href') !== '#') a.addEventListener('click', closeDrawer);
    });
    drawer.querySelectorAll('.nav-drawer-sub a').forEach(function (a) {
      a.addEventListener('click', closeDrawer);
    });
    var settingsLink = drawer.querySelector('.nav-drawer-settings');
    if (settingsLink) settingsLink.addEventListener('click', closeDrawer);

    var mobileSearchBtn = document.getElementById('nav-mobile-search-btn');
    var mobileSearchInput = document.getElementById('search-mobile');
    if (mobileSearchBtn && mobileSearchInput) {
      mobileSearchBtn.addEventListener('click', function () {
        var q = (mobileSearchInput.value || '').trim();
        if (q) window.location.href = '/products?q=' + encodeURIComponent(q);
        else mobileSearchInput.focus();
      });
    }
    bindMobileLangPicker();
  }

  function bindMobileLangPicker() {
    var trigger1 = document.getElementById('nav-mobile-lang-trigger');
    var trigger2 = document.getElementById('nav-drawer-lang');
    var trigger3 = document.getElementById('footer-mobile-lang-trigger');
    var picker = document.getElementById('nav-mobile-lang-picker');
    var backdrop = document.getElementById('nav-mobile-lang-picker-backdrop');
    if (!picker) return;
    function openPicker(e) {
      if (e) e.preventDefault();
      picker.classList.add('is-open');
      picker.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
    function closePicker() {
      picker.classList.remove('is-open');
      picker.setAttribute('aria-hidden', 'true');
      var navbar = document.getElementById('navbar');
      if (!navbar || !navbar.classList.contains('nav-drawer-open')) document.body.style.overflow = '';
    }
    if (trigger1) trigger1.addEventListener('click', openPicker);
    if (trigger2) trigger2.addEventListener('click', openPicker);
    if (trigger3) {
      trigger3.addEventListener('click', openPicker);
      trigger3.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(e); } });
    }
    if (backdrop) backdrop.addEventListener('click', closePicker);
    picker.querySelectorAll('[data-lang]').forEach(function (li) {
      li.addEventListener('click', function () {
        var lang = li.getAttribute('data-lang');
        if (window.Key2lixLang) window.Key2lixLang.apply(lang);
        closePicker();
      });
    });
    picker.querySelectorAll('[data-currency]').forEach(function (li) {
      li.addEventListener('click', function () {
        var code = li.getAttribute('data-currency');
        if (window.Key2lixCurrency) window.Key2lixCurrency.apply(code);
        closePicker();
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && picker.classList.contains('is-open')) closePicker();
    });
  }

  function bindBackToTop() {
    var btn = document.getElementById('back-to-top');
    if (!btn) return;
    var backToTopLabel = (window.Key2lixLang && window.Key2lixLang.get('backToTop')) || 'Back to top';
    btn.setAttribute('aria-label', backToTopLabel);
    btn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    window.addEventListener('scroll', function () {
      btn.style.display = window.scrollY > 400 ? 'flex' : 'none';
      btn.classList.toggle('visible', window.scrollY > 400);
    });
  }

  function bindNavbarScroll() {
    var navbarRoot = document.getElementById('navbar');
    if (!navbarRoot) return;
    var scrollThreshold = 80;
    window.addEventListener('scroll', function () {
      navbarRoot.classList.toggle('navbar-scrolled', window.scrollY > scrollThreshold);
    }, { passive: true });
  }

  function loadCartScript() {
    if (window.Key2lixCart) return;
    var s = document.createElement('script');
    s.src = '/assets/js/cart.js';
    s.async = false;
    document.body.appendChild(s);
  }

  function loadSearchScriptDeferred() {
    if (document.documentElement.getAttribute('data-key2lix-search') !== '1') return;
    var cb = window.requestIdleCallback || function (fn) { setTimeout(fn, 500); };
    cb(function () {
      var s = document.createElement('script');
      s.src = '/assets/js/search.js';
      s.onload = function () { document.dispatchEvent(new CustomEvent('key2lix-partials-loaded')); };
      document.body.appendChild(s);
    }, { timeout: 2000 });
  }

  function bindFooterNewsletter() {
    var form = document.getElementById('footer-newsletter-form');
    var emailInput = document.getElementById('footer-newsletter-email');
    var msgEl = document.getElementById('footer-newsletter-msg');
    if (!form || !emailInput) return;
    function t(k) { return (window.Key2lixLang && window.Key2lixLang.get(k)) || k; }
    emailInput.placeholder = t('newsletterEmailPlaceholder') || 'Your email';
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (emailInput.value || '').trim();
      if (!email) return;
      if (msgEl) msgEl.textContent = '';
      fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email })
      })
        .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
        .then(function (result) {
          if (msgEl) msgEl.textContent = result.ok ? (t('newsletterSuccess') || 'Check your email to confirm.') : ((result.data && result.data.error) || t('newsletterError'));
          if (result.ok) emailInput.value = '';
        })
        .catch(function () {
          if (msgEl) msgEl.textContent = t('newsletterError') || 'Subscription failed.';
        });
    });
  }

  function initPullToRefresh() {
    var main = document.getElementById('main-content');
    if (!main || !main.hasAttribute('data-pull-to-refresh')) return;
    var ptrThreshold = 80;
    var startY = 0;
    var indicator = document.getElementById('key2lix-ptr');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'key2lix-ptr';
      indicator.setAttribute('aria-live', 'polite');
      var msg = (window.Key2lixLang && window.Key2lixLang.get('refreshing')) || 'جاري التحديث...';
      indicator.textContent = msg;
      document.body.appendChild(indicator);
    }
    function onTouchStart(e) {
      if (window.scrollY === 0) startY = e.touches[0].clientY;
    }
    function onTouchMove(e) {
      if (window.scrollY > 0) return;
      var y = e.touches[0].clientY;
      var pull = y - startY;
      if (pull > 0) indicator.classList.toggle('key2lix-ptr-pulling', pull > 20);
    }
    function onTouchEnd(e) {
      if (window.scrollY > 0) return;
      var y = e.changedTouches[0].clientY;
      var pull = y - startY;
      if (pull >= ptrThreshold) {
        indicator.classList.add('key2lix-ptr-refreshing');
        window.location.reload();
      } else {
        indicator.classList.remove('key2lix-ptr-pulling');
      }
    }
    main.addEventListener('touchstart', onTouchStart, { passive: true });
    main.addEventListener('touchmove', onTouchMove, { passive: true });
    main.addEventListener('touchend', onTouchEnd, { passive: true });
  }

  function initPwaInstallBanner() {
    var key = 'key2lix_pwa_install_dismissed';
    if (localStorage.getItem(key)) return;
    // تخزين الـ prompt على window لضمان استدعاء prompt() عند النقر (متطلب المتصفح بعد preventDefault)
    window.Key2lixDeferredInstallPrompt = null;
    var deferredPrompt = null;
    function storeAndShow(e) {
      e.preventDefault(); // نتحكم بوقت عرض نافذة التثبيت؛ سنستدعي prompt() عند نقر المستخدم على «تثبيت»
      deferredPrompt = e;
      window.Key2lixDeferredInstallPrompt = e;
      var b = document.getElementById('key2lix-pwa-banner');
      if (b) b.classList.add('key2lix-pwa-banner-visible');
    }
    function onInstallClick() {
      var prompt = window.Key2lixDeferredInstallPrompt || deferredPrompt;
      if (prompt) {
        try {
          prompt.prompt();
          prompt.userChoice.then(function (choice) {
            if (choice && choice.outcome === 'accepted') localStorage.setItem(key, '1');
            window.Key2lixDeferredInstallPrompt = null;
            deferredPrompt = null;
          }).catch(function () { window.Key2lixDeferredInstallPrompt = null; deferredPrompt = null; });
        } catch (err) { window.Key2lixDeferredInstallPrompt = null; deferredPrompt = null; }
      }
      var banner = document.getElementById('key2lix-pwa-banner');
      if (banner) banner.classList.remove('key2lix-pwa-banner-visible');
    }
    window.addEventListener('beforeinstallprompt', storeAndShow);
    var banner = document.getElementById('key2lix-pwa-banner');
    if (!banner) {
      var t = function (k) { return (window.Key2lixLang && window.Key2lixLang.get(k)) || k; };
      banner = document.createElement('div');
      banner.id = 'key2lix-pwa-banner';
      banner.className = 'key2lix-pwa-banner';
      banner.setAttribute('role', 'dialog');
      banner.setAttribute('aria-label', t('installApp') || 'تثبيت التطبيق');
      banner.innerHTML =
        '<div class="key2lix-pwa-banner-inner">' +
        '<p class="key2lix-pwa-banner-text">' + (t('installAppMessage') || 'ثبّت Key2lix للوصول السريع والإشعارات') + '</p>' +
        '<div class="key2lix-pwa-banner-actions">' +
        '<button type="button" class="key2lix-pwa-banner-install" data-i18n="installApp">' + (t('installApp') || 'تثبيت التطبيق') + '</button>' +
        '<button type="button" class="key2lix-pwa-banner-later" data-i18n="later">' + (t('later') || 'لاحقاً') + '</button>' +
        '</div>' +
        '<button type="button" class="key2lix-pwa-banner-close" aria-label="' + (t('close') || 'إغلاق') + '"><i class="fas fa-times"></i></button>' +
        '</div>';
      document.body.appendChild(banner);
      banner.querySelector('.key2lix-pwa-banner-install').addEventListener('click', onInstallClick);
      banner.querySelector('.key2lix-pwa-banner-later').addEventListener('click', function () {
        localStorage.setItem(key, '1');
        banner.classList.remove('key2lix-pwa-banner-visible');
      });
      banner.querySelector('.key2lix-pwa-banner-close').addEventListener('click', function () {
        localStorage.setItem(key, '1');
        banner.classList.remove('key2lix-pwa-banner-visible');
      });
      if (window.Key2lixDeferredInstallPrompt) banner.classList.add('key2lix-pwa-banner-visible');
    } else {
      var installBtn = banner.querySelector('.key2lix-pwa-banner-install');
      if (installBtn) installBtn.addEventListener('click', onInstallClick);
    }
  }

  function initCookieConsent() {
    var key = 'key2lix_cookie_consent';
    if (localStorage.getItem(key)) return;
    var wrap = document.getElementById('cookie-consent-bar');
    if (wrap) return;
    var t = function (k) { return (window.Key2lixLang && window.Key2lixLang.get(k)) || k; };
    wrap = document.createElement('div');
    wrap.id = 'cookie-consent-bar';
    wrap.className = 'cookie-consent-bar';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', t('cookieLearnMore'));
    wrap.innerHTML =
      '<p class="cookie-consent-msg"><span data-i18n="cookieConsentMessage">' + (t('cookieConsentMessage')) + '</span> <a href="/privacy" class="cookie-consent-link" data-i18n="cookieLearnMore">' + (t('cookieLearnMore')) + '</a></p>' +
      '<div class="cookie-consent-actions">' +
      '<button type="button" class="btn cookie-consent-btn cookie-consent-accept" data-i18n="cookieAccept">' + (t('cookieAccept')) + '</button>' +
      '<button type="button" class="btn cookie-consent-btn cookie-consent-reject" data-i18n="cookieReject">' + (t('cookieReject')) + '</button>' +
      '</div>';
    document.body.appendChild(wrap);
    if (window.Key2lixLang) window.Key2lixLang.apply(window.Key2lixLang.current());
    wrap.querySelector('.cookie-consent-accept').addEventListener('click', function () {
      localStorage.setItem(key, 'accepted');
      wrap.classList.add('cookie-consent-hidden');
      setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 300);
    });
    wrap.querySelector('.cookie-consent-reject').addEventListener('click', function () {
      localStorage.setItem(key, 'rejected');
      wrap.classList.add('cookie-consent-hidden');
      setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 300);
    });
  }

  function afterPartialsLoaded() {
    if (window.Key2lixLang) {
      window.Key2lixLang.apply(window.Key2lixLang.current());
      bindLangCurrencyDropdown();
    }
    bindNavbarMobile();
    bindThemeToggle();
    bindContrastToggle();
    bindDropdownAria();
    bindBackToTop();
    bindNavbarScroll();
    loadCartScript();
    loadSearchScriptDeferred();
    updateClientNav();
    bindFooterNewsletter();
    initPullToRefresh();
    initPwaInstallBanner();
    initCookieConsent();
    if (window.Key2lixConfig) applyFooterConfig(window.Key2lixConfig);
    try { document.dispatchEvent(new CustomEvent('key2lix-partials-loaded')); } catch (e) {}
  }

  function updateClientNav() {
    var loginEl = document.getElementById('nav-client-login');
    var registerEl = document.getElementById('nav-client-register');
    var accountEl = document.getElementById('nav-client-account');
    var logoutEl = document.getElementById('nav-client-logout');
    var vendorDashEl = document.getElementById('nav-vendor-dashboard');
    var vendorLogoutEl = document.getElementById('nav-vendor-logout');
    if (!loginEl && !accountEl && !vendorDashEl) return;

    var notifWrap = document.getElementById('nav-notifications-wrap');
    var notifBtn = document.getElementById('nav-notifications-btn');
    var notifCount = document.getElementById('nav-notifications-count');
    var notifDrop = document.getElementById('nav-notifications-dropdown');
    function loadNotifications() {
      if (!notifWrap || notifWrap.style.display === 'none') return;
      fetch('/api/notifications', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var list = (data && data.notifications) || [];
          var unread = (data && data.unread) || 0;
          if (notifCount) {
            notifCount.textContent = unread > 99 ? '99+' : unread;
            notifCount.style.display = unread > 0 ? '' : 'none';
          }
          if (notifDrop) {
            if (!list.length) { notifDrop.innerHTML = '<p class="nav-notifications-empty">' + ((window.Key2lixLang && window.Key2lixLang.get('noNotifications')) || 'No notifications') + '</p>'; return; }
            var markAllRead = (unread > 0) ? '<button type="button" class="nav-notifications-mark-all" data-i18n="markAllRead">' + ((window.Key2lixLang && window.Key2lixLang.get('markAllRead')) || 'Mark all read') + '</button>' : '';
            notifDrop.innerHTML = markAllRead + list.slice(0, 15).map(function (n) {
              return '<a href="' + (n.link || '#') + '" class="nav-notification-item' + (n.is_read ? '' : ' unread') + '" data-id="' + n.id + '" role="menuitem">' + (n.title || '').replace(/</g, '&lt;') + '</a>';
            }).join('');
            if (notifDrop.querySelector('.nav-notifications-mark-all')) {
              notifDrop.querySelector('.nav-notifications-mark-all').addEventListener('click', function (e) {
                e.preventDefault();
                fetch('/api/notifications/read-all', { method: 'POST', credentials: 'include' }).then(function () { loadNotifications(); }).catch(function () {});
              });
            }
            notifDrop.querySelectorAll('.nav-notification-item').forEach(function (a) {
              a.addEventListener('click', function () {
                var id = a.getAttribute('data-id');
                if (id) fetch('/api/notifications/read/' + id, { method: 'POST', credentials: 'include' }).catch(function () {});
              });
            });
          }
        })
        .catch(function () {});
    }
    var bottomAccount = document.querySelector('#footer .bottom-nav-account');
    var bottomLogin = document.querySelector('#footer .bottom-nav-login');
    var mobileAccount = document.getElementById('nav-mobile-account');
    var mobileLogin = document.getElementById('nav-mobile-login');
    var drawerAccount = document.querySelector('.nav-drawer-account');
    var drawerLogin = document.querySelector('.nav-drawer-login');
    function syncMobileAuth(showAccount) {
      if (mobileAccount) mobileAccount.style.display = showAccount ? '' : 'none';
      if (mobileLogin) mobileLogin.style.display = showAccount ? 'none' : '';
      if (drawerAccount) drawerAccount.style.display = showAccount ? '' : 'none';
      if (drawerLogin) drawerLogin.style.display = showAccount ? 'none' : '';
    }
    function showClient() {
      if (loginEl) loginEl.style.display = 'none';
      if (registerEl) registerEl.style.display = 'none';
      if (accountEl) accountEl.style.display = '';
      if (logoutEl) logoutEl.style.display = '';
      if (vendorDashEl) vendorDashEl.style.display = 'none';
      if (vendorLogoutEl) vendorLogoutEl.style.display = 'none';
      if (notifWrap) notifWrap.style.display = '';
      if (bottomAccount) { bottomAccount.classList.add('show'); }
      if (bottomLogin) { bottomLogin.classList.remove('show'); }
      syncMobileAuth(true);
      loadNotifications();
    }
    function showVendor() {
      if (loginEl) loginEl.style.display = 'none';
      if (registerEl) registerEl.style.display = 'none';
      if (accountEl) accountEl.style.display = 'none';
      if (logoutEl) logoutEl.style.display = 'none';
      if (vendorDashEl) vendorDashEl.style.display = '';
      if (vendorLogoutEl) vendorLogoutEl.style.display = '';
      if (notifWrap) notifWrap.style.display = '';
      if (bottomAccount) { bottomAccount.classList.remove('show'); }
      if (bottomLogin) { bottomLogin.classList.add('show'); }
      syncMobileAuth(false);
      loadNotifications();
    }
    function showGuest() {
      if (loginEl) loginEl.style.display = '';
      if (registerEl) registerEl.style.display = '';
      if (accountEl) accountEl.style.display = 'none';
      if (logoutEl) logoutEl.style.display = 'none';
      if (vendorDashEl) vendorDashEl.style.display = 'none';
      if (vendorLogoutEl) vendorLogoutEl.style.display = 'none';
      if (notifWrap) notifWrap.style.display = 'none';
      if (bottomAccount) { bottomAccount.classList.remove('show'); }
      if (bottomLogin) { bottomLogin.classList.add('show'); }
      syncMobileAuth(false);
    }
    if (notifBtn && notifDrop) {
      notifBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = notifDrop.classList.toggle('show');
        notifBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) loadNotifications();
      });
      document.addEventListener('click', function () { notifDrop.classList.remove('show'); notifBtn.setAttribute('aria-expanded', 'false'); });
    }

    var pathname = (window.location && window.location.pathname) || '';
    var isVendorPage = /^\/(vendor|vendor-login|vendor-register)(\/|$)/.test(pathname);
    function tryVendorThenGuest() {
      fetch('/api/vendor/me', { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function () { showVendor(); })
        .catch(function () { showGuest(); });
    }
    function tryClientThenVendor() {
      fetch('/api/client/me', { credentials: 'same-origin' })
        .then(function (r) {
          if (!r.ok) return { loggedIn: false };
          return r.json();
        })
        .then(function (data) {
          if (data && data.loggedIn) return showClient();
          tryVendorThenGuest();
        })
        .catch(function () { tryVendorThenGuest(); });
    }
    function tryVendorThenClient() {
      fetch('/api/vendor/me', { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function () { showVendor(); })
        .catch(function () {
          fetch('/api/client/me', { credentials: 'same-origin' })
            .then(function (r) {
              if (!r.ok) return { loggedIn: false };
              return r.json();
            })
            .then(function (data) { if (data && data.loggedIn) showClient(); else showGuest(); })
            .catch(function () { showGuest(); });
        });
    }
    if (isVendorPage) tryVendorThenClient(); else tryClientThenVendor();

    if (logoutEl) {
      logoutEl.addEventListener('click', function () {
        var msg = (window.Key2lixLang && window.Key2lixLang.get('confirmLogout')) || 'Sign out?';
        if (!confirm(msg)) return;
        fetch('/api/client/logout', { method: 'POST', credentials: 'include' })
          .then(function () { window.location.href = '/'; })
          .catch(function () { window.location.href = '/'; });
      });
    }
    if (vendorLogoutEl) {
      vendorLogoutEl.addEventListener('click', function () {
        var msg = (window.Key2lixLang && window.Key2lixLang.get('confirmLogout')) || 'Sign out?';
        if (!confirm(msg)) return;
        fetch('/api/vendor/logout', { method: 'POST', credentials: 'include' })
          .then(function () { window.location.href = '/'; })
          .catch(function () { window.location.href = '/'; });
      });
    }
  }

  (function registerPWA() {
  var link = document.createElement('link');
  link.rel = 'manifest';
  link.href = '/manifest.json';
  if (document.head) document.head.appendChild(link);
  /* لا نُسجّل Service Worker في التطوير (localhost أو ngrok) حتى تظهر التعديلات فوراً دون مسح بيانات الموقع */
  var host = window.location.hostname || '';
  var isDev = host === 'localhost' || host === '127.0.0.1' || host.indexOf('ngrok') !== -1;
  if ('serviceWorker' in navigator && !isDev) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
  }
})();

document.addEventListener('DOMContentLoaded', function () {
    if (localStorage.getItem('key2lix_theme') === 'light') document.body.classList.add('theme-light');
    if (localStorage.getItem('key2lix_contrast') === 'high') document.body.classList.add('theme-contrast');
    var navEl = document.getElementById('navbar');
    var footEl = document.getElementById('footer');
    if (!navEl && !footEl) return;

    var p = Promise.resolve();
    if (navEl) p = p.then(function () { return loadPartial('navbar', '/partials/navbar.html'); });
    if (footEl) p = p.then(function () { return loadPartial('footer', '/partials/footer.html'); });
    p.then(afterPartialsLoaded);
  });
})();
