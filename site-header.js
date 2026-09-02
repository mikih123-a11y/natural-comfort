/* הכותרת המשותפת. מקור אחד לכל האתר.
   שימוש: <div id="nc-header"></div> ובעמודים עם סל: data-cart="1".
   בעמודים עם כותרת סטטית (בלי #nc-header) הקובץ מוסיף רק את תפריט המובייל לכותרת הקיימת.
   הסגנון ב-site-header.css. סגנון תפריט המובייל מוזרק מכאן כדי שיעבוד בכל עמוד. */
(function () {
  var links = [
    ['/#collections', 'קולקציות'],
    ['/#shop', 'כל הדגמים'],
    ['/gallery.html', 'גלריה'],
    ['/viz/', 'הדמיה בחדר'],
    ['/myorder.html', 'מעקב הזמנה'],
    ['/#contact', 'ייעוץ אישי'],
  ];

  var slot = document.getElementById('nc-header');
  if (slot) {
    var here = location.pathname.replace(/index\.html$/, '');
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
      '<div class="notice">רהיטים בהתאמה אישית</div>'
      + '<header class="header"><div class="wrap">'
      + '<nav class="nav">' + nav + '</nav>'
      + '<a class="logo" href="/">Natural Comfort<small>CUSTOM FURNITURE</small></a>'
      + '<div class="tools">' + cart
      + '<a class="icon" href="/#shop" aria-label="חיפוש בקטלוג">⌕</a>'
      + '</div></div></header>';
  }

  /* ---------- תפריט מובייל (המבורגר) ---------- */
  var header = document.querySelector('header.header');
  var tools = header && header.querySelector('.tools');
  if (!tools || document.getElementById('nc-menu')) return;

  var css = '.nc-menu-btn{display:none}'
    + '@media(max-width:900px){'
    + '.nc-menu-btn{display:grid;font-size:22px;line-height:1}'
    + '.nc-menu{position:fixed;inset:0;top:var(--nc-menu-top,66px);z-index:49;background:#fbfaf7;overflow:auto;'
    + 'padding:8px 20px 40px;border-top:1px solid #e6e2da;font-family:"Assistant","Heebo",system-ui,sans-serif}'
    + '.nc-menu a{display:flex;align-items:center;min-height:56px;font-size:18px;color:#211f1d;text-decoration:none;border-bottom:1px solid #eee9e0}'
    + '.nc-menu a[aria-current]{font-weight:700}'
    + '.nc-menu .nc-menu-cats{margin-top:22px}'
    + '.nc-menu .nc-menu-cats h3{font-size:12px;letter-spacing:.16em;color:#9b8870;font-weight:600;margin:0 0 4px}'
    + '.nc-menu .nc-menu-cats a{min-height:50px;font-size:17px}'
    + '.nc-menu .nc-menu-contact{margin-top:18px;display:grid;gap:10px}'
    + '.nc-menu .nc-menu-contact a{border:1px solid #211f1d;justify-content:center;min-height:50px;font-weight:600;border-bottom:1px solid #211f1d}'
    + '.nc-menu .nc-menu-contact a.wa{background:#211f1d;color:#fbfaf7}'
    + '.nc-menu a:focus-visible,.nc-menu-btn:focus-visible{outline:3px solid #211f1d;outline-offset:-3px}'
    + 'body.nc-menu-open{overflow:hidden}'
    + '}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'icon nc-menu-btn';
  btn.setAttribute('aria-label', 'תפריט'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'nc-menu');
  btn.textContent = '☰';
  tools.insertBefore(btn, tools.firstChild);

  var menu = document.createElement('nav');
  menu.id = 'nc-menu'; menu.className = 'nc-menu'; menu.hidden = true; menu.setAttribute('aria-label', 'ניווט ראשי');
  var here2 = location.pathname.replace(/index\.html$/, '');
  menu.innerHTML = links.map(function (l) {
    var cur = l[0].indexOf('#') === -1 && here2 === l[0] ? ' aria-current="page"' : '';
    return '<a href="' + l[0] + '"' + cur + '>' + l[1] + '</a>';
  }).join('')
    + '<div class="nc-menu-cats" id="nc-menu-cats" hidden><h3>קטגוריות</h3></div>'
    + '<div class="nc-menu-contact">'
    + '<a class="wa" href="/#contact">ייעוץ אישי</a>'
    + '</div>';
  header.insertAdjacentElement('afterend', menu);

  // הקטגוריות מהקטלוג, רק כאלה שיש בהן דגמים. אותו חישוב כמו בדף הבית.
  fetch('/products/catalog.json').then(function (r) { return r.json(); }).then(function (d) {
    var groupOf = function (m) { return ((d.lines || {})[m.line_id] || {}).group; };
    var live = (d.groups || []).filter(function (g) { return (d.models || []).some(function (m) { return groupOf(m) === g.id; }); });
    if (!live.length) return;
    var box = document.getElementById('nc-menu-cats');
    var q = new URLSearchParams(location.search).get('group');
    box.innerHTML = '<h3>קטגוריות</h3>' + live.map(function (g) {
      var cur = location.pathname === '/category.html' && q === g.id ? ' aria-current="page"' : '';
      return '<a href="/category.html?group=' + encodeURIComponent(g.id) + '"' + cur + '>' + g.name + '</a>';
    }).join('');
    box.hidden = false;
  }).catch(function () {});

  function place() {
    var r = header.getBoundingClientRect();
    menu.style.setProperty('--nc-menu-top', Math.max(0, r.bottom) + 'px');
  }
  function open(v) {
    if (v) place();
    menu.hidden = !v;
    btn.setAttribute('aria-expanded', v ? 'true' : 'false');
    btn.textContent = v ? '✕' : '☰';
    document.body.classList.toggle('nc-menu-open', v);
    if (v) menu.querySelector('a').focus();
  }
  btn.addEventListener('click', function () { open(menu.hidden); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) open(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { open(false); btn.focus(); } });
  window.addEventListener('resize', function () { if (!menu.hidden) place(); });
})();
