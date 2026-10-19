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

/* ---------- חיפוש באתר ----------
   עיגול ⌕ בכותרת פותח שדה חיפוש עם תוצאות מיידיות מתוך catalog.json.
   מחפשים בשם הדגם, בקטגוריה, בגימורים, ברוחב, במספר הדלתות ובמחיר. */
(function () {
  var header = document.querySelector('header.header');
  if (!header || document.getElementById('nc-search')) return;
  var trigger = header.querySelector('.icon[aria-label^="חיפוש"]') || document.getElementById('searchBtn');
  if (!trigger) return;

  // דסקטופ: שדה חיפוש קצר במקום העיגול. מובייל: העיגול נשאר.
  var field = document.createElement('button');
  field.type = 'button'; field.className = 'nc-sfield'; field.id = 'nc-sfield';
  field.setAttribute('aria-label', 'חיפוש באתר');
  field.innerHTML = '<span>⌕</span><em>חיפוש דגם, גימור, רוחב</em>';
  trigger.insertAdjacentElement('afterend', field);

  var css = '.nc-sfield{display:flex;align-items:center;gap:10px;min-width:230px;height:44px;padding:0 14px;border:1px solid #ded6cc;border-radius:22px;background:#fff;color:#5f584f;cursor:pointer;font-family:inherit}'
    + '.nc-sfield span{font-size:18px;color:#29231e}.nc-sfield em{font-style:normal;font-size:14px;white-space:nowrap}'
    + '.nc-sfield:hover{border-color:#29231e}'
    + '@media(min-width:901px){.header .icon[aria-label^="חיפוש"],#searchBtn{display:none!important}}'
    + '@media(max-width:900px){.nc-sfield{display:none}}'
    + '.nc-search{position:fixed;inset:0;top:var(--nc-search-top,84px);z-index:48;background:rgba(251,250,247,.98);overflow:auto;'
    + 'border-top:1px solid #e6e2da;font-family:"Assistant","Heebo",system-ui,sans-serif;color:#211f1d}'
    + '.nc-search .in{max-width:760px;margin:0 auto;padding:28px 20px 60px}'
    + '.nc-search form{position:relative}'
    + '.nc-search input{width:100%;min-height:56px;border:1px solid #cfc6b8;background:#fff;padding:0 54px 0 16px;font:inherit;font-size:18px;color:#211f1d;border-radius:0}'
    + '.nc-search input:focus{outline:3px solid #211f1d;outline-offset:2px}'
    + '.nc-search .go{position:absolute;inset-inline-start:0;top:0;width:54px;height:56px;display:grid;place-items:center;font-size:24px;color:#5f584f;background:none;border:0;cursor:pointer}'
    + '.nc-search .hint{margin:10px 2px 0;font-size:14px;color:#5f584f}'
    + '.nc-search .cats{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}'
    + '.nc-search .cats button{min-height:40px;padding:0 14px;border:1px solid #ded6cc;background:#fff;font:inherit;font-size:15px;color:#211f1d;cursor:pointer}'
    + '.nc-search .cats button[aria-selected=true]{background:#211f1d;color:#fbfaf7;border-color:#211f1d}'
    + '.nc-search .count{margin:22px 2px 8px;font-size:14px;color:#5f584f}'
    + '.nc-search ul{list-style:none;margin:0;padding:0}'
    + '.nc-search li a{display:grid;grid-template-columns:72px 1fr auto;gap:16px;align-items:center;min-height:64px;padding:8px 6px;border-bottom:1px solid #eee9e0;color:#211f1d;text-decoration:none}'
    + '.nc-search li a:hover,.nc-search li a:focus-visible{background:#f2eee7;outline:none}'
    + '.nc-search li img{width:72px;height:72px;object-fit:contain;background:#fff;border:1px solid #e6e2da}'
    + '.nc-search li b{display:block;font-family:"Frank Ruhl Libre",Georgia,serif;font-size:18px;font-weight:500;line-height:1.25}'
    + '.nc-search li small{display:block;font-size:14px;color:#5f584f;margin-top:2px}'
    + '.nc-search li .pr{font-family:"Frank Ruhl Libre",Georgia,serif;font-size:18px;white-space:nowrap}'
    + '.nc-search .all{display:flex;align-items:center;justify-content:center;min-height:50px;margin-top:16px;border:1px solid #211f1d;color:#211f1d;font-weight:600;text-decoration:none}'
    + '.nc-search .none{padding:26px 0;color:#5f584f}'
    + '.nc-search .none a{color:#211f1d}'
    + 'body.nc-search-open{overflow:hidden}'
    + '@media(max-width:900px){.header .icon[aria-label^="חיפוש"],#searchBtn{display:grid!important}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var panel = document.createElement('div');
  panel.id = 'nc-search'; panel.className = 'nc-search'; panel.hidden = true;
  panel.setAttribute('role', 'search');
  panel.innerHTML = '<div class="in">'
    + '<form id="nc-search-form" autocomplete="off"><input id="nc-search-q" type="search" placeholder="מה אתם מחפשים? למשל: ארון 240, ספריית קודש, שמנת" aria-label="חיפוש באתר">'
    + '<button class="go" type="submit" aria-label="חיפוש">⌕</button></form>'
    + '<div class="hint">אפשר לחפש לפי שם דגם, קטגוריה, גימור, רוחב בס״מ או מספר דלתות</div>'
    + '<div class="cats" id="nc-search-cats" role="tablist" aria-label="סינון לפי קטגוריה"></div>'
    + '<div class="count" id="nc-search-count" aria-live="polite"></div>'
    + '<ul id="nc-search-list"></ul>'
    + '<div id="nc-search-more"></div>'
    + '</div>';
  header.insertAdjacentElement('afterend', panel);

  var input = panel.querySelector('#nc-search-q');
  var list  = panel.querySelector('#nc-search-list');
  var count = panel.querySelector('#nc-search-count');
  var more  = panel.querySelector('#nc-search-more');
  var DATA = null, CAT = 'all';

  function load() {
    if (DATA) return Promise.resolve(DATA);
    return fetch('/products/catalog.json').then(function (r) { return r.json(); }).then(function (d) { DATA = d; return d; });
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/[״"'׳]/g, '').replace(/\s+/g, ' ').trim(); }
  function nis(n) { return '₪' + Number(n).toLocaleString('he-IL'); }

  function index(d) {
    var fin = function (id) { return (d.finishes || []).find(function (f) { return f.id === id; }); };
    return (d.models || []).map(function (m) {
      var line = (d.lines || {})[m.line_id] || {};
      var group = (d.groups || []).find(function (g) { return g.id === line.group; }) || {};
      var fins = (m.finishes || []).map(function (id) { var f = fin(id); return f ? f.name : ''; });
      var doors = m.identity && m.identity.door_count;
      var nums = [];
      if (m.dims) nums.push(String(m.dims.w), String(m.dims.h), String(m.dims.d));
      if (doors) nums.push(String(doors));
      return {
        m: m, line: line.name || m.line || '', group: group.name || '',
        text: norm([m.name, line.name, m.line, group.name, m.family, fins.join(' '), (m.features || []).join(' ')].join(' ')),
        name: norm(m.name), nums: nums, doors: doors,
        thumb: (m.renders && m.renders[0] && m.renders[0].thumb) || ''
      };
    });
  }

  function buildCats() {
    var box = panel.querySelector('#nc-search-cats');
    if (box.children.length) return;
    var groupOf = function (m) { return ((DATA.lines || {})[m.line_id] || {}).group; };
    var live = (DATA.groups || []).filter(function (g) { return (DATA.models || []).some(function (m) { return groupOf(m) === g.id; }); });
    box.innerHTML = '<button type="button" role="tab" data-g="all" aria-selected="true">הכול</button>'
      + live.map(function (g) { return '<button type="button" role="tab" data-g="' + g.id + '" aria-selected="false">' + g.name + '</button>'; }).join('');
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-g]'); if (!b) return;
      CAT = b.dataset.g;
      box.querySelectorAll('[data-g]').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
      render(input.value);
    });
  }
  function search(q) {
    q = norm(q);
    var idx = index(DATA).filter(function (it) { return CAT === 'all' || ((DATA.lines || {})[it.m.line_id] || {}).group === CAT; });
    if (!q) return CAT === 'all' ? [] : idx;   // קטגוריה בלי מילת חיפוש: כל הדגמים בקטגוריה
    var toks = q.split(' ').filter(Boolean);
    return idx.map(function (it) {
      var score = 0;
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i], hit = false;
        if (/^\d+$/.test(t)) {
          // מספר: רוחב, גובה, עומק או דלתות. "240" מוצא ארון 240.
          if (it.nums.indexOf(t) !== -1) { hit = true; score += (it.m.dims && String(it.m.dims.w) === t) ? 6 : 3; }
          if (it.doors && (t === String(it.doors))) { hit = true; score += 4; }
        }
        var tm = t.replace(/^(ב|ל|ה|ו)(?=.{3,})/, '');   // "בשמנת" / "לארונות" → "שמנת" / "ארונות"
        if (it.name.indexOf(t) !== -1 || it.name.indexOf(tm) !== -1) { hit = true; score += 10; }
        else if (it.text.indexOf(t) !== -1 || it.text.indexOf(tm) !== -1) { hit = true; score += 4; }
        if (!hit) return null;
      }
      return { it: it, score: score };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score; }).map(function (r) { return r.it; });
  }

  function render(q) {
    var res = search(q);
    if (!norm(q) && CAT === 'all') { list.innerHTML = ''; count.textContent = ''; more.innerHTML = ''; return; }
    count.textContent = res.length ? (res.length === 1 ? 'תוצאה אחת' : res.length + ' תוצאות') : '';
    if (!res.length) {
      list.innerHTML = '';
      more.innerHTML = '<div class="none">לא מצאנו דגם שמתאים ל"' + q.replace(/</g, '&lt;') + '". נסו מילה אחרת, או <a href="/#shop">עברו לכל הדגמים</a>.</div>';
      return;
    }
    var top = res.slice(0, 8);
    list.innerHTML = top.map(function (it) {
      var m = it.m;
      var sub = [it.line, m.dims ? m.dims.w + ' × ' + m.dims.h + ' × ' + m.dims.d + ' ס״מ' : ''].filter(Boolean).join(' · ');
      return '<li><a href="/product.html?id=' + encodeURIComponent(m.id) + '">'
        + (it.thumb ? '<img src="' + it.thumb + '" alt="" loading="lazy">' : '<span></span>')
        + '<span><b>' + m.name + '</b><small>' + sub + '</small></span>'
        + '<span class="pr">' + (typeof m.price === 'number' ? nis(m.price) : 'לפי התאמה') + '</span></a></li>';
    }).join('');
    more.innerHTML = res.length > top.length
      ? '<a class="all" href="/?q=' + encodeURIComponent(q) + '#shop">לכל ' + res.length + ' התוצאות בקטלוג</a>' : '';
  }

  function place() {
    var r = header.getBoundingClientRect();
    panel.style.setProperty('--nc-search-top', Math.max(0, r.bottom) + 'px');
  }
  function open(v) {
    if (v) {
      var menu = document.getElementById('nc-menu');
      if (menu && !menu.hidden) { var mb = document.querySelector('.nc-menu-btn'); if (mb) mb.click(); }
      place();
    }
    panel.hidden = !v;
    document.body.classList.toggle('nc-search-open', v);
    trigger.setAttribute('aria-expanded', v ? 'true' : 'false');
    if (v) { load().then(function () { buildCats(); render(input.value); }); input.focus(); }
  }
  trigger.setAttribute('aria-controls', 'nc-search'); trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', function (e) { e.preventDefault(); e.stopImmediatePropagation(); open(panel.hidden); }, true);
  field.addEventListener('click', function () { open(panel.hidden); });
  if (trigger.id === 'searchBtn') trigger.onclick = null;

  var timer;
  input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { load().then(function () { render(input.value); }); }, 120); });
  panel.querySelector('#nc-search-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var first = list.querySelector('a');
    if (first) first.click(); else if (norm(input.value)) location.href = '/?q=' + encodeURIComponent(input.value) + '#shop';
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { open(false); trigger.focus(); } });
  panel.addEventListener('click', function (e) { if (e.target === panel) open(false); });
  window.addEventListener('resize', function () { if (!panel.hidden) place(); });
})();
