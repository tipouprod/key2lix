/**
 * Wishlist: localStorage key key2lix_wishlist = array of { key, category, subcat, name, img }
 * P8: عند تسجيل الدخول يتم المزامنة مع API (/api/client/wishlist)
 */
(function () {
  var STORAGE_KEY = 'key2lix_wishlist';

  function getRaw() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function save(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  function itemId(item) {
    var sub = (item && item.subcat) ? item.subcat : '';
    return (item && item.key) + '|' + (item && item.category) + '|' + sub;
  }

  function get() {
    return getRaw().slice();
  }

  function syncFromServer() {
    fetch('/api/client/me', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) { return (data && data.loggedIn) ? fetch('/api/client/wishlist', { credentials: 'same-origin' }) : Promise.reject(); })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (arr) {
        if (Array.isArray(arr) && arr.length >= 0) save(arr);
      })
      .catch(function () {});
  }

  function add(item) {
    if (!item || !item.key || !item.category) return false;
    var list = getRaw();
    var id = itemId(item);
    if (list.some(function (x) { return itemId(x) === id; })) return true;
    list.push({
      key: item.key,
      category: item.category,
      subcat: item.subcat || '',
      name: item.name || '',
      img: item.img || ''
    });
    save(list);
    fetch('/api/client/me', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) { if (data && data.loggedIn) return fetch('/api/client/wishlist', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) }); })
      .catch(function () {});
    return true;
  }

  function remove(key, category, subcat) {
    var list = getRaw().filter(function (x) {
      return x.key !== key || x.category !== category || (x.subcat || '') !== (subcat || '');
    });
    save(list);
    var sub = (subcat != null && subcat !== undefined) ? subcat : '';
    var q = '?category=' + encodeURIComponent(category || '') + '&subcat=' + encodeURIComponent(sub) + '&slug=' + encodeURIComponent(key || '');
    fetch('/api/client/me', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) { if (data && data.loggedIn) return fetch('/api/client/wishlist' + q, { method: 'DELETE', credentials: 'same-origin' }); })
      .catch(function () {});
    return true;
  }

  function isIn(key, category, subcat) {
    var id = (key || '') + '|' + (category || '') + '|' + (subcat || '');
    return getRaw().some(function (x) { return itemId(x) === id; });
  }

  function toggle(item) {
    if (isIn(item.key, item.category, item.subcat)) {
      remove(item.key, item.category, item.subcat);
      return false;
    }
    add(item);
    return true;
  }

  if (typeof window !== 'undefined') setTimeout(syncFromServer, 300);

  window.Key2lixWishlist = {
    get: get,
    add: add,
    remove: remove,
    isIn: isIn,
    toggle: toggle,
    syncFromServer: syncFromServer
  };
})();
