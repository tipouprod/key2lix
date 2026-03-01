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
    fetch('/data/products.json')
      .then(function (r) { return r.json(); })
      .then(function (products) {
        var allProducts = flattenProducts(products);
        searchInput.addEventListener('input', function () {
          var query = (searchInput.value || '').toLowerCase().trim();
          searchResults.innerHTML = '';
          if (!query) {
            searchResults.style.display = 'none';
            return;
          }
          var matched = [];
          allProducts.forEach(function (p) {
            if (!p.name) return;
            var nameL = p.name.toLowerCase();
            var keyL = (p.key || '').toLowerCase();
            if (nameL.indexOf(query) !== -1 || keyL.indexOf(query) !== -1) matched.push(p);
          });
          var typoMap = { pubj: 'pubg', valorent: 'valorant', genchin: 'genshin' };
          if (matched.length === 0 && typoMap[query])
            allProducts.forEach(function (p) {
              if ((p.name || '').toLowerCase().indexOf(typoMap[query]) !== -1) matched.push(p);
            });
          if (matched.length === 0) {
            var suggestTitle = document.createElement('div');
            suggestTitle.style.cssText = 'padding:10px 16px 6px;font-size:0.85rem;color:#94a3b8;font-weight:600;border-bottom:1px solid rgba(255,255,255,0.06);';
            suggestTitle.textContent = (window.Key2lixLang && window.Key2lixLang.get('suggestedProducts')) || 'منتجات مقترحة';
            searchResults.appendChild(suggestTitle);
            matched = allProducts.slice(0, 6);
          } else {
            matched = matched.slice(0, 10);
          }
          matched.forEach(function (p) {
            var div = document.createElement('div');
            var priceStr = (p.prices && p.prices[0] && p.prices[0].value != null && p.prices[0].value !== '') ? (' - ' + (window.formatPriceDzd ? window.formatPriceDzd(p.prices[0].value) : p.prices[0].value)) : '';
            div.innerHTML = '<img src="' + imgSrc(p.images && p.images[0]) + '" width="30" style="border-radius:5px;"> ' + p.name + priceStr;
            div.style.cursor = 'pointer';
            div.addEventListener('click', function () {
              window.location.href = '/product.html?product=' + encodeURIComponent(p.key) + (p.category ? '&category=' + encodeURIComponent(p.category) : '') + (p.subcat ? '&subcat=' + encodeURIComponent(p.subcat) : '');
            });
            searchResults.appendChild(div);
          });
          searchResults.style.display = searchResults.children.length ? 'block' : 'none';
        });
      })
      .catch(function (e) { console.error('Search: load products failed', e); });
  }

  function initSearch() {
    bindSearchPair(document.getElementById('search'), document.getElementById('search-results'));
    bindSearchPair(document.getElementById('hero-search'), document.getElementById('hero-search-results'));
    bindSearchPair(document.getElementById('search-mobile'), document.getElementById('search-results-mobile'));
  }

  document.addEventListener('DOMContentLoaded', initSearch);
  document.addEventListener('key2lix-partials-loaded', initSearch);
})();
