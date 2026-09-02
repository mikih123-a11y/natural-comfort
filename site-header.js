/* הכותרת המשותפת. מקור אחד לכל האתר.
   שימוש: <div id="nc-header"></div> ובעמודים עם סל: data-cart="1".
   הסגנון ב-site-header.css. */
(function () {
  var slot = document.getElementById('nc-header');
  if (!slot) return;

  var here = location.pathname.replace(/index\.html$/, '');
  var links = [
    ['/#collections', 'קולקציות'],
    ['/#shop', 'כל הדגמים'],
    ['/gallery.html', 'גלריה'],
    ['/viz/', 'הדמיה בחדר'],
    ['/myorder.html', 'מעקב הזמנה'],
    ['/#contact', 'ייעוץ אישי'],
  ];

  var nav = links.map(function (l) {
    var cur = l[0].indexOf('#') === -1 && here === l[0] ? ' aria-current="page"' : '';
    return '<a href="' + l[0] + '"' + cur + '>' + l[1] + '</a>';
  }).join('');

  // הסל מוצג רק בעמודים שביקשו אותו, כדי לא להוסיף כפתור מת
  var cart = slot.dataset.cart === '1'
    ? '<a class="icon cart" href="/cart.html" id="cartLink" aria-label="סל ההזמנה">🛒'
      + '<span class="nc-badge" hidden>0</span></a>'
    : '';

  slot.outerHTML =
    '<div class="notice">ייעוץ אישי · ייצור ישראלי · התאמה אישית מלאה</div>'
    + '<header class="header"><div class="wrap">'
    + '<nav class="nav">' + nav + '</nav>'
    + '<a class="logo" href="/">Natural Comfort<small>CUSTOM FURNITURE</small></a>'
    + '<div class="tools">' + cart
    + '<a class="icon" href="/#shop" aria-label="חיפוש בקטלוג">⌕</a>'
    + '<a class="icon" href="tel:0796622666" aria-label="טלפון">☎</a>'
    + '</div></div></header>';
})();
