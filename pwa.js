/* Natural Comfort. התקנה כאפליקציה.
   1. משלים תגיות מניפסט/אייקון אם חסרות בעמוד.
   2. רושם את sw.js.
   3. כפתור "התקינו את Natural Comfort" בפוטר: באנדרואיד/כרום רק כשהדפדפן מאפשר (beforeinstallprompt),
      באייפון עם הסבר קצר. אין חלון קופץ. אחרי התקנה הכפתור נעלם. */
(function () {
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;

  // תגיות ראש, אם העמוד לא כולל אותן
  var head = document.head;
  function ensure(sel, make) { if (!head.querySelector(sel)) head.appendChild(make()); }
  ensure('link[rel=manifest]', function () { var l = document.createElement('link'); l.rel = 'manifest'; l.href = '/manifest.webmanifest'; return l; });
  ensure('link[rel=apple-touch-icon]', function () { var l = document.createElement('link'); l.rel = 'apple-touch-icon'; l.href = '/pwa/apple-touch-icon.png'; return l; });
  ensure('meta[name=theme-color]', function () { var m = document.createElement('meta'); m.name = 'theme-color'; m.content = '#FBFAF8'; return m; });
  ensure('meta[name=apple-mobile-web-app-title]', function () { var m = document.createElement('meta'); m.name = 'apple-mobile-web-app-title'; m.content = 'Natural'; return m; });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function (e) { console.warn('[pwa] sw', e); });
    });
  }

  var css = '.nc-install{display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;margin:18px 0 28px}'
    + '.nc-install button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;'
    + 'border:1px solid currentColor;background:transparent;color:inherit;font:600 15px/1 inherit;font-family:inherit;cursor:pointer;border-radius:0}'
    + '.nc-install button:hover{opacity:.8}'
    + '.nc-install button:focus-visible{outline:3px solid currentColor;outline-offset:3px}'
    + '.nc-install p{margin:0;font-size:14px;line-height:1.5;text-align:center;max-width:420px}';
  var st = document.createElement('style'); st.textContent = css; head.appendChild(st);

  var box = null;
  function mount(label, onClick, helpText) {
    if (box) return box;
    var foot = document.querySelector('footer');
    if (!foot) return null;
    box = document.createElement('div'); box.className = 'nc-install';
    var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    box.appendChild(b);
    if (helpText) {
      var p = document.createElement('p'); p.id = 'nc-install-help'; p.hidden = true; p.textContent = helpText;
      b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', p.id);
      box.appendChild(p);
      b.addEventListener('click', function () { p.hidden = !p.hidden; b.setAttribute('aria-expanded', String(!p.hidden)); });
    } else {
      b.addEventListener('click', onClick);
    }
    // בפוטר המשותף: מעל שורת הזכויות והקישורים. אחרת: בסוף הפוטר.
    var bottom = foot.querySelector('.footer-bottom');
    if (bottom) bottom.parentNode.insertBefore(box, bottom);
    else (foot.querySelector('.wrap') || foot).appendChild(box);
    return box;
  }
  function unmount() { if (box) { box.remove(); box = null; } }

  // הכפתור מוצג רק בטלפון ובטאבלט. במחשב לא מציעים התקנה.
  var mobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.matchMedia('(pointer: coarse)').matches);

  // אנדרואיד / כרום: רק כשהדפדפן מציע התקנה
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    if (!mobile) return;
    mount('התקינו את Natural Comfort', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; unmount(); });
    });
  });
  window.addEventListener('appinstalled', unmount);

  // אייפון / אייפד: אין אירוע התקנה, מציגים הסבר קצר
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  if (ios) {
    window.addEventListener('load', function () {
      setTimeout(function () {
        mount('התקינו את Natural Comfort', null, 'לחצו על "שיתוף" בתחתית הדפדפן, ואז על "הוספה למסך הבית".');
      }, 800);
    });
  }
})();
