/**
 * Key2lix – بحث احترافي ومبتكر: اقتراحات غنية، بحث حديث، لوحة مفاتيح، ARIA
 */
(function () {
  var RECENT_KEY = 'key2lix_search_recent';
  var RECENT_MAX = 8;
  var MIN_CHARS = 2;
  var SUGGEST_LIMIT = 12;
  var DEBOUNCE_MS = 220;

  function t(key) {
    return (window.Key2lixLang && window.Key2lixLang.get(key)) || key;
  }

  function imgSrc(path) {
    if (!path) return '/assets/img/default.png';
    return path.indexOf('/') === 0 ? path : '/' + path;
  }

  function getRecent() {
    try {
      var raw = localStorage.getItem(RECENT_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.slice(0, RECENT_MAX) : [];
    } catch (e) { return []; }
  }

  function addRecent(entry) {
    if (!entry || !entry.slug) return;
    var slug = String(entry.slug).trim();
    var name = (entry.name || slug).trim();
    var list = getRecent().filter(function (r) { return r.slug !== slug; });
    list.unshift({ slug: slug, name: name, category: entry.category || '', subcat: entry.subcat || '' });
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
    } catch (e) {}
  }

  function flattenProducts(products) {
    var list = [];
    if (!products || typeof products !== 'object') return list;
    Object.keys(products).forEach(function (cat) {
      var catData = products[cat];
      if (cat === 'hardware' && catData && typeof catData === 'object' && !Array.isArray(catData)) {
        Object.keys(catData).forEach(function (sub) {
          var subData = catData[sub];
          if (subData && typeof subData === 'object') {
            Object.keys(subData).forEach(function (k) {
              var p = subData[k];
              list.push({ key: k, slug: k, category: cat, subcat: sub, name: p.name, images: p.images, prices: p.prices });
            });
          }
        });
      } else if (catData && typeof catData === 'object' && !Array.isArray(catData)) {
        Object.keys(catData).forEach(function (k) {
          var p = catData[k];
          list.push({ key: k, slug: k, category: cat, subcat: '', name: p.name, images: p.images, prices: p.prices });
        });
      }
    });
    return list;
  }

  function formatPrice(val) {
    return window.formatPriceDzd ? window.formatPriceDzd(val) : (val != null ? String(val) : '');
  }

  function highlightMatch(text, query) {
    if (!query || !text) return escapeHtml(text || '');
    var q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp('(' + q + ')', 'gi');
    return escapeHtml(text).replace(re, '<mark class="search-highlight">$1</mark>');
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function categoryLabel(cat, subcat) {
    if (!cat) return '';
    var key = (cat + (subcat ? '_' + subcat : '')).toLowerCase().replace(/\s+/g, '');
    var labels = { game_cards: 'Game Cards', skins: 'Subscriptions', hardware: 'Hardware', software: 'Software' };
    return labels[cat.toLowerCase()] || (subcat ? subcat : cat);
  }

  function createResultItem(p, query, isNav) {
    var key = p.key || p.slug;
    var img = (p.images && p.images[0]) ? (typeof p.images[0] === 'string' ? p.images[0] : (p.images[0].url || '')) : (p.image || '');
    var priceVal = (p.prices && p.prices[0] && p.prices[0].value != null) ? p.prices[0].value : (p.price != null ? p.price : null);
    var priceStr = priceVal != null && priceVal !== '' ? formatPrice(priceVal) : '';
    var name = p.name || key;
    var nameHtml = query && name ? highlightMatch(name, query) : escapeHtml(name);
    var cardClass = isNav ? 'search-card search-card-nav' : 'search-card';
    var div = document.createElement('div');
    div.className = cardClass;
    div.setAttribute('role', 'option');
    div.setAttribute('data-slug', key);
    div.setAttribute('data-category', p.category || '');
    div.setAttribute('data-subcat', p.subcat || '');
    div.innerHTML =
      '<div class="search-card-img">' +
      (img ? '<img src="' + imgSrc(img) + '" alt="" loading="lazy">' : '<span class="search-card-noimg"><i class="fas fa-box"></i></span>') +
      '</div>' +
      '<div class="search-card-body">' +
      (p.category ? '<span class="search-card-cat">' + escapeHtml(categoryLabel(p.category, p.subcat)) + '</span>' : '') +
      '<span class="search-card-name">' + nameHtml + '</span>' +
      (priceStr ? '<span class="search-card-price">' + escapeHtml(priceStr) + '</span>' : '') +
      '</div>';
    div.addEventListener('click', function () {
      addRecent({ slug: key, name: name, category: p.category, subcat: p.subcat });
      window.location.href = '/product.html?product=' + encodeURIComponent(key) +
        (p.category ? '&category=' + encodeURIComponent(p.category) : '') +
        (p.subcat ? '&subcat=' + encodeURIComponent(p.subcat) : '');
    });
    return div;
  }

  function bindSearchPair(searchInput, searchResults) {
    if (!searchInput || !searchResults || searchInput._key2lixSearchBound) return;
    searchInput._key2lixSearchBound = true;

    var suggestDebounce = null;
    var activeIndex = -1;
    var lastSuggestions = [];
    var isNav = searchResults.classList.contains('nav-search-results') || searchResults.classList.contains('nav-search-results-mobile');

    function getOptionEls() {
      return searchResults.querySelectorAll('[role="option"]');
    }

    function setActiveIndex(idx) {
      var opts = getOptionEls();
      activeIndex = Math.max(-1, Math.min(idx, opts.length - 1));
      opts.forEach(function (el, i) {
        el.classList.toggle('search-item-active', i === activeIndex);
        el.setAttribute('aria-selected', i === activeIndex ? 'true' : 'false');
      });
      if (opts[activeIndex]) opts[activeIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function openPanel() {
      searchResults.classList.add('search-panel-open');
      searchResults.style.display = 'block';
      searchInput.setAttribute('aria-expanded', 'true');
      activeIndex = -1;
    }

    function closePanel() {
      searchResults.classList.remove('search-panel-open');
      searchResults.style.display = 'none';
      searchInput.setAttribute('aria-expanded', 'false');
      activeIndex = -1;
    }

    function showLoading() {
      searchResults.innerHTML = '';
      searchResults.classList.add('search-panel-loading');
      searchResults.setAttribute('aria-busy', 'true');
      var loader = document.createElement('div');
      loader.className = 'search-loading';
      loader.setAttribute('aria-live', 'polite');
      loader.innerHTML = '<span class="search-loading-spinner"></span><span class="search-loading-text">' + escapeHtml(t('searching')) + '</span>';
      searchResults.appendChild(loader);
      searchResults.style.display = 'block';
      searchResults.classList.add('search-panel-open');
    }

    function showEmpty(query) {
      searchResults.classList.remove('search-panel-loading');
      searchResults.setAttribute('aria-busy', 'false');
      searchResults.innerHTML = '<div class="search-empty" role="status">' +
        '<i class="fas fa-search search-empty-icon" aria-hidden="true"></i>' +
        '<p class="search-empty-text">' + escapeHtml(t('searchNoResults')) + '</p>' +
        (query ? '<a href="/products?q=' + encodeURIComponent(query) + '" class="search-view-all">' + escapeHtml(t('searchViewAll')) + '</a>' : '') +
        '</div>';
      searchResults.style.display = 'block';
      searchResults.classList.add('search-panel-open');
    }

    function showRecent() {
      var recent = getRecent();
      searchResults.classList.remove('search-panel-loading');
      searchResults.setAttribute('aria-busy', 'false');
      searchResults.innerHTML = '';
      if (recent.length === 0) return;
      var head = document.createElement('div');
      head.className = 'search-section-head';
      head.textContent = t('searchRecent');
      searchResults.appendChild(head);
      recent.forEach(function (r) {
        var opt = document.createElement('div');
        opt.className = 'search-card search-card-nav search-card-recent';
        opt.setAttribute('role', 'option');
        opt.setAttribute('data-slug', r.slug);
        opt.setAttribute('data-category', r.category || '');
        opt.setAttribute('data-subcat', r.subcat || '');
        opt.innerHTML = '<div class="search-card-body">' +
          '<span class="search-card-name">' + escapeHtml(r.name) + '</span>' +
          '</div>';
        opt.addEventListener('click', function () {
          addRecent(r);
          window.location.href = '/product.html?product=' + encodeURIComponent(r.slug) +
            (r.category ? '&category=' + encodeURIComponent(r.category) : '') +
            (r.subcat ? '&subcat=' + encodeURIComponent(r.subcat) : '');
        });
        searchResults.appendChild(opt);
      });
      openPanel();
    }

    function renderSuggestions(matched, fromApi, query) {
      searchResults.classList.remove('search-panel-loading');
      searchResults.setAttribute('aria-busy', 'false');
      searchResults.innerHTML = '';
      lastSuggestions = matched;

      if (matched.length === 0) {
        showEmpty(query);
        return;
      }

      matched.forEach(function (p) {
        searchResults.appendChild(createResultItem(p, query, isNav));
      });

      var viewAll = document.createElement('a');
      viewAll.href = '/products?q=' + encodeURIComponent(query || searchInput.value.trim());
      viewAll.className = 'search-view-all-link';
      viewAll.textContent = t('searchViewAll');
      searchResults.appendChild(viewAll);

      openPanel();
      setActiveIndex(-1);
    }

    function doFetch(query) {
      showLoading();
      fetch('/api/search/suggest?q=' + encodeURIComponent(query) + '&limit=' + SUGGEST_LIMIT, { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var list = (data && data.suggestions) || [];
          var matched = list.map(function (s) {
            return {
              key: s.slug,
              slug: s.slug,
              category: s.category,
              subcat: s.subcat || '',
              name: s.name,
              image: s.image,
              price: s.price
            };
          });
          renderSuggestions(matched, true, query);
        })
        .catch(function () {
          fetch('/data/products.json', { credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (products) {
              if (!products) { renderSuggestions([], true, query); return; }
              var all = flattenProducts(products);
              var q = query.toLowerCase();
              var matched = all.filter(function (p) {
                var nameL = (p.name || '').toLowerCase();
                var keyL = (p.key || '').toLowerCase();
                return nameL.indexOf(q) !== -1 || keyL.indexOf(q) !== -1;
              }).slice(0, SUGGEST_LIMIT);
              renderSuggestions(matched, false, query);
            })
            .catch(function () { renderSuggestions([], true, query); });
        });
    }

    searchInput.addEventListener('focus', function () {
      var q = (searchInput.value || '').trim();
      if (q.length >= MIN_CHARS) doFetch(q);
      else if (q.length === 0) showRecent();
    });

    searchInput.addEventListener('input', function () {
      var query = (searchInput.value || '').trim();
      clearTimeout(suggestDebounce);

      if (query.length < MIN_CHARS) {
        searchResults.innerHTML = '';
        searchResults.style.display = 'none';
        if (query.length === 0) { showRecent(); return; }
        return;
      }

      suggestDebounce = setTimeout(function () { doFetch(query); }, DEBOUNCE_MS);
    });

    searchInput.addEventListener('keydown', function (e) {
      var opts = getOptionEls();
      if (!opts.length) {
        if (e.key === 'Escape') { searchInput.blur(); closePanel(); }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(activeIndex + 1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(activeIndex === -1 ? opts.length - 1 : activeIndex - 1);
        return;
      }
      if (e.key === 'Enter' && activeIndex >= 0 && opts[activeIndex]) {
        e.preventDefault();
        opts[activeIndex].click();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closePanel();
        searchInput.blur();
      }
    });

    searchInput.addEventListener('blur', function () {
      setTimeout(function () {
        var active = document.activeElement;
        if (searchResults.contains(active)) return;
        closePanel();
      }, 180);
    });

    var wrap = searchInput.closest('.nav-search-wrap') || searchInput.closest('.hero-search-mobile-wrap') || searchInput.parentElement;
    if (wrap && !wrap.querySelector('.search-clear-btn')) {
        var clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'search-clear-btn';
        clearBtn.setAttribute('aria-label', t('searchClear'));
        clearBtn.innerHTML = '<i class="fas fa-times"></i>';
        clearBtn.style.display = 'none';
        wrap.style.position = 'relative';
        wrap.appendChild(clearBtn);
        function toggleClear() {
          clearBtn.style.display = (searchInput.value || '').trim().length > 0 ? 'flex' : 'none';
        }
        searchInput.addEventListener('input', toggleClear);
        searchInput.addEventListener('focus', toggleClear);
        clearBtn.addEventListener('click', function () {
          searchInput.value = '';
          searchInput.focus();
          searchResults.innerHTML = '';
          searchResults.style.display = 'none';
          clearBtn.style.display = 'none';
          showRecent();
        });
    }
  }

  function addVoiceToSearch(inputEl) {
    if (!inputEl || !inputEl.parentNode) return;
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    var wrap = inputEl.parentNode;
    if (wrap.querySelector('.search-voice-btn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-voice-btn';
    btn.setAttribute('aria-label', t('searchByVoice'));
    btn.innerHTML = '<i class="fas fa-microphone"></i>';
    btn.style.cssText = 'position:absolute; top:50%; transform:translateY(-50%); background:none; border:none; color:#94a3b8; cursor:pointer; padding:6px; font-size:1rem; z-index:5;';
    wrap.style.position = 'relative';
    wrap.classList.add('search-has-voice');
    wrap.insertBefore(btn, wrap.querySelector('input') || wrap.firstChild);
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = (document.documentElement.lang === 'ar') ? 'ar-DZ' : 'en-US';
      rec.onresult = function (ev) {
        var t0 = (ev.results && ev.results[0] && ev.results[0][0]) ? ev.results[0][0].transcript : '';
        if (t0) {
          inputEl.value = t0;
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        btn.classList.remove('recording');
      };
      rec.onerror = function (ev) {
        btn.classList.remove('recording');
        var msg = t('searchVoiceUnavailable');
        if (ev.error === 'not-allowed' || ev.error === 'permission-denied') msg = t('searchVoiceDenied');
        else if (ev.error === 'network') msg = t('searchVoiceNetwork') || msg;
        if (window.Key2lixToast) window.Key2lixToast(msg, 'error');
      };
      rec.onend = function () { btn.classList.remove('recording'); };
      btn.classList.add('recording');
      try {
        rec.start();
      } catch (err) {
        btn.classList.remove('recording');
        if (window.Key2lixToast) window.Key2lixToast(t('searchVoiceUnavailable'), 'error');
      }
    });
  }

  function initSearch() {
    bindSearchPair(document.getElementById('search'), document.getElementById('search-results'));
    bindSearchPair(document.getElementById('hero-search'), document.getElementById('hero-search-results'));
    bindSearchPair(document.getElementById('search-mobile'), document.getElementById('search-results-mobile'));
    addVoiceToSearch(document.getElementById('hero-search'));
    addVoiceToSearch(document.getElementById('search'));
    addVoiceToSearch(document.getElementById('search-mobile'));
  }

  document.addEventListener('DOMContentLoaded', initSearch);
  document.addEventListener('key2lix-partials-loaded', initSearch);
  if (document.readyState !== 'loading') setTimeout(initSearch, 150);
})();
