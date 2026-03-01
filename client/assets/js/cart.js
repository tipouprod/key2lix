/**
 * سلة المشتريات — تخزين محلي (localStorage)
 */
(function () {
  var KEY = 'key2lix_cart';

  function getCart() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function setCart(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    updateCartBadge();
    try { window.dispatchEvent(new Event('storage')); } catch (e) {}
  }

  /** N5: إرسال السلة للخادم (عميل مسجّل أو زائر مع بريد) للتذكير لاحقاً */
  function syncToServer(optionalEmail) {
    var items = getCart();
    var payload = { items: items.map(function (it) {
      return { category: it.category, subcat: it.subcat || '', slug: it.key || '', name: it.name, price: it.value };
    }) };
    if (optionalEmail && String(optionalEmail).trim()) payload.email = String(optionalEmail).trim();
    fetch('/api/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin'
    }).catch(function () {});
  }

  window.Key2lixCart = {
    get: getCart,
    add: function (item) {
      var cart = getCart();
      cart.push({
        key: item.key,
        category: item.category,
        subcat: item.subcat || '',
        name: item.name,
        value: item.value,
        img: item.img || ''
      });
      setCart(cart);
      if (window.Key2lixTrack) window.Key2lixTrack('add_to_cart', { category: item.category, subcat: item.subcat || '', slug: item.key, name: item.name, value: item.value });
      syncToServer();
    },
    remove: function (index) {
      var cart = getCart();
      if (index >= 0 && index < cart.length) {
        cart.splice(index, 1);
        setCart(cart);
      }
    },
    clear: function () {
      setCart([]);
    },
    count: function () {
      return getCart().length;
    },
    /** استدعاء مزامنة السلة مع الخادم. للعميل المسجّل يُستنتج من الجلسة؛ للزائر مرّر البريد. */
    syncToServer: syncToServer
  };

  function updateCartBadge() {
    var n = getCart().length;
    document.querySelectorAll('.cart-count').forEach(function (el) {
      el.textContent = n;
      el.style.display = n ? 'inline-flex' : 'none';
    });
  }

  document.addEventListener('DOMContentLoaded', updateCartBadge);
  window.addEventListener('storage', updateCartBadge);
  updateCartBadge();
})();
