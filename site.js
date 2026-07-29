/* ===========================================================
   Natural Comfort — נגישות + הסכמת עוגיות
   קובץ אחד לכל האתר. להוסיף לפני </body> בכל עמוד:
     <script src="/site.js"></script>

   פיקסל פייסבוק: לעטוף אותו כך שלא ירוץ לפני הסכמה —
     window.ncOnConsent(function(){  ... קוד הפיקסל כאן ...  });
   =========================================================== */

(function () {
  'use strict';

  /* ==========================================================
     חלק 1 — נגישות
     ========================================================== */

  var A_KEY = 'nc_a11y_v1';
  var state = { font: 0, contrast: '', links: false, readable: false, still: false, cursor: false };

  try {
    var saved = JSON.parse(localStorage.getItem(A_KEY) || '{}');
    for (var k in saved) if (state.hasOwnProperty(k)) state[k] = saved[k];
  } catch (e) {}

  var CSS = ''
    /* ---- כפתור פתיחה ---- */
    + '#nc-a11y-btn{position:fixed;inset-inline-start:16px;bottom:74px;z-index:9998;'
    + 'width:46px;height:46px;border-radius:50%;border:0;cursor:pointer;'
    + 'background:#1b4a72;color:#fff;display:grid;place-items:center;'
    + 'box-shadow:0 3px 12px rgba(0,0,0,.2);transition:transform .2s}'
    + '#nc-a11y-btn:hover{transform:translateY(-2px)}'
    + 'html.nc-ck-open #nc-a11y-btn{bottom:150px}'
    + 'html.nc-ck-open #nc-a11y{bottom:206px}'
    + '@media(max-width:560px){html.nc-ck-open #nc-a11y-btn{bottom:190px}'
    + 'html.nc-ck-open #nc-a11y{bottom:246px}}'
    + '#nc-a11y-btn svg{fill:currentColor}'

    /* ---- פאנל ---- */
    + '#nc-a11y{position:fixed;inset-inline-start:16px;bottom:130px;z-index:9999;'
    + 'width:290px;max-width:calc(100vw - 32px);background:#fff;color:#1a1a1a;'
    + 'border:1px solid #ddd;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.22);'
    + 'padding:16px;direction:rtl;display:none;'
    + 'font:400 14px/1.5 "Assistant",system-ui,Arial,sans-serif}'
    + '#nc-a11y.open{display:block}'
    + '#nc-a11y h2{margin:0 0 12px;font-size:16px;font-weight:700;'
    + 'display:flex;justify-content:space-between;align-items:center}'
    + '#nc-a11y-close{border:0;background:none;font-size:22px;line-height:1;cursor:pointer;'
    + 'color:#666;padding:0 4px}'
    + '#nc-a11y .g{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:7px}'
    + '#nc-a11y button.o{border:1px solid #ddd;background:#fafafa;border-radius:8px;'
    + 'padding:10px 8px;font:inherit;cursor:pointer;text-align:center;color:inherit}'
    + '#nc-a11y button.o:hover{border-color:#1b4a72}'
    + '#nc-a11y button.o[aria-pressed="true"]{background:#1b4a72;color:#fff;border-color:#1b4a72}'
    + '#nc-a11y .full{grid-column:1/-1}'
    + '#nc-a11y .rst{width:100%;margin-top:9px;border:0;background:#eee;border-radius:8px;'
    + 'padding:10px;font:inherit;cursor:pointer;color:inherit}'
    + '#nc-a11y .lnk{display:block;margin-top:11px;font-size:12.5px;color:#1b4a72;text-align:center}'

    /* ---- הפעלות ---- */
    + 'html.nc-links a{text-decoration:underline !important;text-underline-offset:2px}'
    + 'html.nc-readable *{font-family:Arial,"Assistant",sans-serif !important;'
    + 'letter-spacing:.02em !important}'
    + 'html.nc-still *,html.nc-still *::before,html.nc-still *::after{'
    + 'animation:none !important;transition:none !important;scroll-behavior:auto !important}'
    + 'html.nc-contrast{filter:contrast(1.35)}'
    + 'html.nc-invert{filter:invert(1) hue-rotate(180deg)}'
    + 'html.nc-invert img,html.nc-invert video{filter:invert(1) hue-rotate(180deg)}'
    + 'html.nc-cursor,html.nc-cursor *{cursor:url("data:image/svg+xml,'
    + "%3Csvg xmlns='http://www.w3.org/2000/svg' width='38' height='38' viewBox='0 0 38 38'%3E"
    + "%3Cpath d='M6 2l26 15-12 3-5 12z' fill='%23000' stroke='%23fff' stroke-width='2'/%3E%3C/svg%3E"
    + '") 4 2, auto !important}'
    + ':focus-visible{outline:3px solid #1b4a72 !important;outline-offset:2px !important}'

    /* ---- באנר עוגיות ---- */
    + '#nc-ck{position:fixed;inset-inline:0;bottom:0;z-index:9997;background:#12283f;color:#fff;'
    + 'padding:16px 20px;direction:rtl;display:none;'
    + 'font:400 14px/1.55 "Assistant",system-ui,Arial,sans-serif;'
    + 'box-shadow:0 -4px 20px rgba(0,0,0,.2)}'
    + '#nc-ck.open{display:block}'
    + '#nc-ck .in{max-width:1000px;margin:0 auto;display:flex;gap:16px;'
    + 'align-items:center;flex-wrap:wrap;justify-content:space-between}'
    + '#nc-ck p{margin:0;flex:1 1 320px;font-size:13.5px}'
    + '#nc-ck a{color:#cfe0f0;text-decoration:underline}'
    + '#nc-ck .b{display:flex;gap:9px;flex-wrap:wrap}'
    + '#nc-ck button{border:0;border-radius:8px;padding:11px 20px;font:600 14px inherit;'
    + 'cursor:pointer;font-family:inherit}'
    + '#nc-ck .ok{background:#fff;color:#12283f}'
    + '#nc-ck .no{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.45)}'
    + '@media(max-width:560px){#nc-ck .b{width:100%}#nc-ck button{flex:1}}';

  function inject() {
    var st = document.createElement('style');
    st.id = 'nc-site-css';
    st.appendChild(document.createTextNode(CSS));
    document.head.appendChild(st);
  }

  function apply() {
    var h = document.documentElement;
    h.classList.toggle('nc-links', state.links);
    h.classList.toggle('nc-readable', state.readable);
    h.classList.toggle('nc-still', state.still);
    h.classList.toggle('nc-cursor', state.cursor);
    h.classList.toggle('nc-contrast', state.contrast === 'high');
    h.classList.toggle('nc-invert', state.contrast === 'invert');
    h.style.fontSize = state.font ? (100 + state.font * 10) + '%' : '';

    var p = document.getElementById('nc-a11y');
    if (p) {
      p.querySelectorAll('[data-t]').forEach(function (b) {
        var t = b.dataset.t;
        var on = t === 'contrast-high'  ? state.contrast === 'high'
               : t === 'contrast-invert'? state.contrast === 'invert'
               : !!state[t];
        b.setAttribute('aria-pressed', String(on));
      });
    }
    try { localStorage.setItem(A_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function buildA11y() {
    var btn = document.createElement('button');
    btn.id = 'nc-a11y-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'תפריט נגישות');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">'
      + '<circle cx="12" cy="4" r="2"/><path d="M20 7.5c-2.5 1-5 1.5-8 1.5s-5.5-.5-8-1.5'
      + 'a1 1 0 10-.7 1.9c1.9.7 3.8 1.2 5.7 1.4v2.4L7.2 20a1 1 0 101.9.6L11 15.4h2l1.9 5.2'
      + 'a1 1 0 101.9-.6L15 13.2v-2.4c1.9-.2 3.8-.7 5.7-1.4a1 1 0 10-.7-1.9z"/></svg>';

    var p = document.createElement('div');
    p.id = 'nc-a11y';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', 'הגדרות נגישות');
    p.innerHTML = ''
      + '<h2>נגישות <button id="nc-a11y-close" type="button" aria-label="סגירה">&times;</button></h2>'
      + '<div class="g">'
      +   '<button class="o" data-a="font+" type="button">הגדלת טקסט</button>'
      +   '<button class="o" data-a="font-" type="button">הקטנת טקסט</button>'
      +   '<button class="o" data-t="contrast-high" data-a="contrast-high" type="button">ניגודיות גבוהה</button>'
      +   '<button class="o" data-t="contrast-invert" data-a="contrast-invert" type="button">היפוך צבעים</button>'
      +   '<button class="o" data-t="links" data-a="links" type="button">הדגשת קישורים</button>'
      +   '<button class="o" data-t="readable" data-a="readable" type="button">גופן קריא</button>'
      +   '<button class="o" data-t="still" data-a="still" type="button">עצירת אנימציות</button>'
      +   '<button class="o" data-t="cursor" data-a="cursor" type="button">סמן גדול</button>'
      + '</div>'
      + '<button class="rst" data-a="reset" type="button">איפוס הגדרות</button>'
      + '<a class="lnk" href="/accessibility.html">הצהרת הנגישות שלנו</a>';

    document.body.appendChild(btn);
    document.body.appendChild(p);

    var open = function (v) {
      p.classList.toggle('open', v);
      btn.setAttribute('aria-expanded', String(v));
      if (v) p.querySelector('button').focus();
    };

    btn.addEventListener('click', function () { open(!p.classList.contains('open')); });
    document.getElementById('nc-a11y-close').addEventListener('click', function () {
      open(false); btn.focus();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && p.classList.contains('open')) { open(false); btn.focus(); }
    });

    p.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]');
      if (!b) return;
      var a = b.dataset.a;
      if (a === 'font+') state.font = Math.min(4, state.font + 1);
      else if (a === 'font-') state.font = Math.max(-2, state.font - 1);
      else if (a === 'contrast-high')   state.contrast = state.contrast === 'high'   ? '' : 'high';
      else if (a === 'contrast-invert') state.contrast = state.contrast === 'invert' ? '' : 'invert';
      else if (a === 'reset') state = { font:0, contrast:'', links:false, readable:false, still:false, cursor:false };
      else state[a] = !state[a];
      apply();
    });
  }

  /* ==========================================================
     חלק 2 — הסכמת עוגיות
     ========================================================== */

  var C_KEY = 'nc_cookie_v1';
  var queue = [];
  var granted = null;

  try { granted = localStorage.getItem(C_KEY); } catch (e) {}

  /* קוד מדידה נרשם דרך זה ורץ רק אחרי הסכמה */
  window.ncOnConsent = function (fn) {
    if (granted === 'yes') { try { fn(); } catch (e) { console.warn(e); } }
    else queue.push(fn);
  };

  function runQueue() {
    while (queue.length) {
      var fn = queue.shift();
      try { fn(); } catch (e) { console.warn(e); }
    }
  }

  function decide(v) {
    granted = v;
    try { localStorage.setItem(C_KEY, v); } catch (e) {}
    var bar = document.getElementById('nc-ck');
    if (bar) bar.classList.remove('open');
    document.documentElement.classList.remove('nc-ck-open');
    if (v === 'yes') runQueue(); else queue.length = 0;
  }

  function buildCookies() {
    if (granted === 'yes' || granted === 'no') {
      if (granted === 'yes') runQueue();
      return;
    }
    var bar = document.createElement('div');
    bar.id = 'nc-ck';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'הודעת עוגיות');
    bar.innerHTML = ''
      + '<div class="in">'
      +   '<p>אנחנו משתמשים בעוגיות כדי שהאתר יעבוד, וגם למדידה ולשיפור הפרסום שלנו. '
      +   'אפשר להמשיך בלי עוגיות המדידה — האתר יעבוד רגיל. '
      +   '<a href="/privacy.html">מדיניות הפרטיות</a></p>'
      +   '<div class="b">'
      +     '<button class="ok" type="button" data-c="yes">מאשר/ת הכל</button>'
      +     '<button class="no" type="button" data-c="no">רק ההכרחי</button>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(bar);
    setTimeout(function () {
      bar.classList.add('open');
      document.documentElement.classList.add('nc-ck-open');
    }, 600);
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-c]');
      if (b) decide(b.dataset.c);
    });
  }

  /* ==========================================================
     חלק 3 — פיקסל פייסבוק
     רץ רק אחרי הסכמה. עמודים דוחפים אירועים ל-window.ncQ,
     כי site.js נטען אחריהם והתור מבטיח שכלום לא ילך לאיבוד.
     ========================================================== */

  var PIXEL_ID = '674504652419627';

  window.ncQ = window.ncQ || [];

  /* אפשר לקרוא לזה מכל מקום, גם לפני שהפיקסל נטען */
  window.ncTrack = function (name, params, custom) {
    window.ncQ.push([name, params || {}, !!custom]);
    flush();
  };

  var pixelReady = false;

  function flush() {
    if (!pixelReady) return;
    while (window.ncQ.length) {
      var e = window.ncQ.shift();
      try {
        if (e[2]) window.fbq('trackCustom', e[0], e[1]);
        else      window.fbq('track', e[0], e[1]);
      } catch (err) { console.warn('[pixel]', err); }
    }
  }

  function loadPixel() {
    if (window.fbq) { pixelReady = true; flush(); return; }

    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
      n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');

    pixelReady = true;
    flush();
  }

  window.ncOnConsent(loadPixel);

  /* ==========================================================
     חלק 4 — קישור למעקב הזמנה בפוטר
     נדחף אוטומטית לכל עמוד שיש בו קישור לתקנון,
     כדי שלא צריך לערוך את הפוטר בכל קובץ בנפרד.
     ========================================================== */

  function addTrackLink() {
    if (location.pathname.indexOf('myorder') !== -1) return;
    var foot = document.querySelector('footer');
    if (!foot || foot.querySelector('a[href^="/myorder"]')) return;

    var anchor = foot.querySelector('a[href="/terms.html"]')
              || foot.querySelector('a[href="/about.html"]');

    var a = document.createElement('a');
    a.href = '/myorder.html';
    a.textContent = 'מעקב הזמנה';
    a.style.textDecoration = 'none';

    if (anchor && anchor.parentNode) {
      anchor.parentNode.appendChild(document.createTextNode(' · '));
      anchor.parentNode.appendChild(a);
    } else {
      /* פוטר בלי קישורי תקנון — מוסיפים שורה משלנו */
      var d = document.createElement('div');
      d.style.marginTop = '8px';
      d.appendChild(a);
      (foot.querySelector('.wrap') || foot).appendChild(d);
    }
  }

  /* ---------- הפעלה ---------- */
  function init() {
    inject();
    buildA11y();
    apply();
    buildCookies();
    addTrackLink();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
