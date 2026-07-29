/* ===========================================================
   Natural Comfort — סל הזמנות
   נשמר בדפדפן של הלקוח (localStorage). בלי שרת.

   שימוש:
     <script src="/cart.js"></script>
     ncCart.add({ ... })      הוספת פריט
     ncCart.items()           כל הפריטים
     ncCart.total()           סכום, או null אם יש פריט "לפי התאמה"
     ncCart.badge('#cartBtn') עדכון מונה על אלמנט
   =========================================================== */

(function () {
  'use strict';

  var KEY_CART = 'nc_cart_v1';
  var KEY_ORDERS = 'nc_orders_v1';

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { console.warn('[ncCart] אחסון נכשל', e); return false; }
  }

  function items() { return read(KEY_CART, []); }
  function save(list) { write(KEY_CART, list); paintAll(); }

  /* מזהה ייחודי להרכבה — אותו דגם בגימור אחר הוא שורה נפרדת */
  function signature(it) {
    return [it.modelId, (it.config || []).join('|')].join('::');
  }

  function add(item) {
    var list = items();
    var sig = signature(item);
    var hit = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].sig === sig) { hit = list[i]; break; }
    }
    if (hit) {
      hit.qty = (hit.qty || 1) + (item.qty || 1);
    } else {
      list.push({
        sig: sig,
        modelId: item.modelId || '',
        name: item.name || '',
        url: item.url || '',
        image: item.image || '',
        price: (typeof item.price === 'number' && isFinite(item.price)) ? item.price : null,
        priceText: item.priceText || '',
        config: item.config || [],
        repeat: !!item.repeat,          // הגיע מהזמנה קודמת
        qty: item.qty || 1,
        added: new Date().toISOString()
      });
    }
    save(list);
    return list;
  }

  function setQty(sig, qty) {
    var list = items();
    for (var i = 0; i < list.length; i++) {
      if (list[i].sig === sig) {
        list[i].qty = Math.max(1, Math.min(99, qty | 0));
        break;
      }
    }
    save(list);
  }

  function remove(sig) {
    save(items().filter(function (x) { return x.sig !== sig; }));
  }

  function clear() { save([]); }

  function count() {
    return items().reduce(function (n, x) { return n + (x.qty || 1); }, 0);
  }

  /* מחזיר null אם יש ולו פריט אחד בלי מחיר — לא מציגים סכום חלקי */
  function total() {
    var list = items(), sum = 0;
    for (var i = 0; i < list.length; i++) {
      if (typeof list[i].price !== 'number') return null;
      sum += list[i].price * (list[i].qty || 1);
    }
    return sum;
  }

  function hasRepeat() {
    return items().some(function (x) { return x.repeat; });
  }

  function hasCustomPrice() {
    return items().some(function (x) { return typeof x.price !== 'number'; });
  }

  var nis = function (n) { return '₪' + Number(n).toLocaleString('he-IL'); };

  /* ---------- מונה על אייקון הסל ---------- */
  var badgeTargets = [];

  function badge(sel) {
    if (badgeTargets.indexOf(sel) === -1) badgeTargets.push(sel);
    paint(sel);
  }

  function paint(sel) {
    var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!el) return;
    var n = count();
    el.setAttribute('data-count', n);
    el.classList.toggle('has-items', n > 0);
    var slot = el.querySelector('.nc-badge');
    if (slot) { slot.textContent = n; slot.hidden = n === 0; }
  }

  function paintAll() { badgeTargets.forEach(paint); }

  /* ---------- הזמנות שנשלחו מהמכשיר הזה ---------- */
  function orderNumber() {
    var d = new Date();
    var p = function (x) { return String(x).padStart(2, '0'); };
    var rand = Math.floor(Math.random() * 900 + 100);
    return 'NC-' + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + '-' + rand;
  }

  function saveOrder(order) {
    var list = read(KEY_ORDERS, []);
    list.unshift(order);
    write(KEY_ORDERS, list.slice(0, 50));
    return order;
  }

  function orders() { return read(KEY_ORDERS, []); }

  /* ---------- טקסט ההזמנה — נשלח אליך ומוצג ללקוח ---------- */
  function orderText(list) {
    var L = [];
    (list || items()).forEach(function (it, i) {
      L.push((i + 1) + '. ' + it.name + '  ×' + (it.qty || 1));
      (it.config || []).forEach(function (c) { L.push('   · ' + c); });
      L.push('   מחיר: ' + (typeof it.price === 'number'
        ? nis(it.price * (it.qty || 1))
        : (it.priceText || 'לפי התאמה')));
      if (it.url) L.push('   ' + it.url);
      L.push('');
    });
    var t = total();
    L.push(t !== null ? 'סה״כ: ' + nis(t) : 'סה״כ: חלק מהפריטים מתומחרים לפי התאמה אישית');
    return L.join('\n');
  }

  window.ncCart = {
    add: add, items: items, setQty: setQty, remove: remove, clear: clear,
    count: count, total: total, hasCustomPrice: hasCustomPrice, hasRepeat: hasRepeat,
    badge: badge, repaint: paintAll, nis: nis,
    orderNumber: orderNumber, saveOrder: saveOrder, orders: orders,
    orderText: orderText
  };

  /* סל שהשתנה בלשונית אחרת */
  window.addEventListener('storage', function (e) {
    if (e.key === KEY_CART) paintAll();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paintAll);
  }
})();
