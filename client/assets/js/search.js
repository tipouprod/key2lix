/**
 * Key2lix – بحث موحد عن المنتجات (يُربط تلقائياً إن وُجد #search و #search-results)
 */
(function () {
  function flattenProducts(products) {
    var list = [];
    if (!products || typeof products !== 'object') return list;
    Object.keys(products).forEach(function (cat) {
      var catData = products[cat];
      if (cat === 'hardware' && catData && typeof catData === 'object' && !Array.isArray(catData)) {
        Object.keys(catData).forEach(function (sub) {
          var subData = catData[sub];
          if (subData && typeof subData === 'object')
            Object.keys(subData).forEach(function (k) {
              list.push({ key: k, category: cat, subcat: sub, name: subData[k].name, images: subData[k].images, prices: subData[k].prices });
            });
        });
      } else if (catData && typeof catData === 'object' && !Array.isArray(catData)) {
        Object.keys(catData).forEach(function (k) {
          list.push({ key: k, category: cat, name: catData[k].name, images: catData[k].images, prices: catData[k].prices });
        });
      }
    });
    return list;
  }

  function imgSrc(path) {
    if (!path) return '/assets/img/default.png';
    return path.indexOf('/') === 0 ? path : '/' + path;
  }

  function bindSearchPair(searchInput, searchResults) {
    if (!searchInput || !searchResults || searchInput._key2lixSearchBound) return;
    searchInput._key2lixSearchBound = true;
    var suggestDebounce = null;
    function renderSuggestions(matched, fromApi) {
      searchResults.innerHTML = '';
      if (!matched.length && !fromApi) {
        var suggestTitle = document.createElement('div');
        suggestTitle.style.cssText = 'padding:10px 16px 6px;font-size:0.85rem;color:#94a3b8;font-weight:600;border-bottom:1px solid rgba(255,255,255,0.06);';
        suggestTitle.textContent = (window.Key2lixLang && window.Key2lixLang.get('suggestedProducts')) || 'منتجات مقترحة';
        searchResults.appendChild(suggestTitle);
      }
      matched.forEach(function (p) {
        var div = document.createElement('div');
        var key = p.key || p.slug;
        var priceStr = (p.prices && p.prices[0] && p.prices[0].value != null && p.prices[0].value !== '') ? (' - ' + (window.formatPriceDzd ? window.formatPriceDzd(p.prices[0].value) : p.prices[0].value)) : '';
        div.innerHTML = (p.images && p.images[0] ? '<img src="' + imgSrc(p.images[0]) + '" width="30" style="border-radius:5px;"> ' : '') + (p.name || key) + priceStr;
        div.style.cursor = 'pointer';
        div.addEventListener('click', function () {
          window.location.href = '/product.html?product=' + encodeURIComponent(key) + (p.category ? '&category=' + encodeURIComponent(p.category) : '') + (p.subcat ? '&subcat=' + encodeURIComponent(p.subcat) : '');
        });
        searchResults.appendChild(div);
      });
      searchResults.style.display = searchResults.children.length ? 'block' : 'none';
    }
    searchInput.addEventListener('input', function () {
      var query = (searchInput.value || '').trim();
      if (query.length < 2) {
        searchResults.innerHTML = '';
        searchResults.style.display = 'none';
        return;
      }
      clearTimeout(suggestDebounce);
      suggestDebounce = setTimeout(function () {
        fetch('/api/search/suggest?q=' + encodeURIComponent(query) + '&limit=12', { credentials: 'same-origin' })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var list = (data && data.suggestions) || [];
            var matched = list.map(function (s) { return { key: s.slug, slug: s.slug, category: s.category, subcat: s.subcat || '', name: s.name }; });
            renderSuggestions(matched, true);
          })
          .catch(function () {
            fetch('/data/products.json').then(function (r) { return r.json(); }).then(function (products) {
              var allProducts = flattenProducts(products);
              var q = query.toLowerCase();
              var matched = allProducts.filter(function (p) {
                var nameL = (p.name || '').toLowerCase();
                var keyL = (p.key || '').toLowerCase();
                return nameL.indexOf(q) !== -1 || keyL.indexOf(q) !== -1;
              }).slice(0, 10);
              renderSuggestions(matched, false);
            });
          });
      }, 220);
    });
    searchInput.addEventListener('blur', function () { setTimeout(function () { searchResults.style.display = 'none'; }, 180); });
  }

  function addVoiceToSearch(inputEl) {
    if (!inputEl || !inputEl.parentNode || !('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    var rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = (document.documentElement.lang === 'ar') ? 'ar-DZ' : 'en-US';
    var wrap = inputEl.parentNode;
    if (wrap.querySelector('.search-voice-btn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-voice-btn';
    btn.setAttribute('aria-label', (window.Key2lixLang && window.Key2lixLang.get('searchByVoice')) || 'Search by voice');
    btn.innerHTML = '<i class="fas fa-microphone"></i>';
    btn.style.cssText = 'position:absolute; top:50%; transform:translateY(-50%); left:12px; background:none; border:none; color:#94a3b8; cursor:pointer; padding:6px; font-size:1rem;';
    if (document.documentElement.dir === 'rtl') btn.style.left = 'auto'; btn.style.right = '12px';
    wrap.style.position = 'relative';
    wrap.appendChild(btn);
    btn.addEventListener('click', function () {
      rec.start();
      btn.classList.add('recording');
    });
    rec.onresult = function (e) {
      var t = (e.results && e.results[0] && e.results[0][0]) ? e.results[0][0].transcript : '';
      if (t) inputEl.value = t; inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    };
    rec.onerror = function () { btn.classList.remove('recording'); };
    rec.onend = function () { btn.classList.remove('recording'); };
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
})();
