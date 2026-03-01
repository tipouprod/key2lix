/**
 * Key2lix — توصيات ذكية "قد يعجبك أيضاً"
 * استخدم: Key2lixRecommendations.render(containerId, options)
 */
window.Key2lixRecommendations = (function () {
  function buildProductCard(p, baseUrl) {
    const img = (p.images && p.images[0]) ? p.images[0] : '/assets/img/placeholder.png';
    let price = '';
    if (p.prices && p.prices[0] && p.prices[0].value) price = (window.formatPriceDzd || function (v) { return v; })(p.prices[0].value);
    const href = p.subcat
      ? baseUrl + '/product.html?product=' + encodeURIComponent(p.slug) + '&category=' + encodeURIComponent(p.category) + '&subcat=' + encodeURIComponent(p.subcat)
      : baseUrl + '/product.html?product=' + encodeURIComponent(p.slug) + '&category=' + encodeURIComponent(p.category);
    return `
      <a href="${href}" class="rec-card" data-category="${p.category}" data-subcat="${p.subcat || ''}" data-slug="${p.slug}">
        <img src="${img}" alt="${(p.name || '').replace(/"/g, '&quot;')}" loading="lazy" class="rec-card-img">
        <div class="rec-card-body">
          <span class="rec-card-name">${(p.name || '').substring(0, 50)}</span>
          ${price ? '<span class="rec-card-price">' + price + '</span>' : ''}
        </div>
      </a>`;
  }

  function render(containerId, options) {
    const opts = options || {};
    const container = document.getElementById(containerId);
    if (!container) return;

    const params = new URLSearchParams();
    if (opts.category) params.set('category', opts.category);
    if (opts.subcat) params.set('subcat', opts.subcat);
    if (opts.slug) params.set('slug', opts.slug);
    if (opts.limit) params.set('limit', opts.limit);

    fetch('/api/ai/recommendations?' + params.toString(), { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        const products = data.products || [];
        if (products.length === 0) {
          container.innerHTML = '';
          container.style.display = 'none';
          return;
        }
        const baseUrl = (typeof window.Key2lixConfig !== 'undefined' && window.Key2lixConfig.baseUrl) ? window.Key2lixConfig.baseUrl : '';
        container.innerHTML = '<h3 class="rec-title">' + (opts.title || 'قد يعجبك أيضاً') + '</h3><div class="rec-grid">' +
          products.map(function (p) { return buildProductCard(p, baseUrl); }).join('') + '</div>';
        container.style.display = 'block';
        container.querySelectorAll('.rec-card').forEach(function (card) {
          card.addEventListener('click', function () {
            if (window.Key2lixTrack) {
              window.Key2lixTrack('view_item', {
                category: card.dataset.category,
                subcat: card.dataset.subcat || '',
                slug: card.dataset.slug
              });
            }
          });
        });
      })
      .catch(function () {
        container.innerHTML = '';
        container.style.display = 'none';
      });
  }

  return { render: render };
})();
