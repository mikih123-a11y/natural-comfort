/* Natural Comfort. Service Worker זהיר.
   מה נשמר: קבצי המעטפת (CSS, JS, פונטים, אייקונים) ותמונות מוצר, כדי שהאתר ייפתח מהר.
   HTML והקטלוג: network-first, תמיד הגרסה העדכנית, וה-cache רק כגיבוי בלי רשת.
   מה לא נשמר לעולם: הזמנות, סל, פרטי לקוח, אדמין, פונקציות, POST.
   כדי לשחרר עדכון: להעלות מספר גרסה חדש ב-VERSION. */

const VERSION = 'nc-2026-09-02c';
const SHELL = `${VERSION}-shell`;
const PAGES = `${VERSION}-pages`;
const IMAGES = `${VERSION}-images`;

/* נתיבים שאסור לגעת בהם: תמיד ישירות לרשת, בלי cache */
const NEVER = [
  /^\/api\//, /^\/\.netlify\//, /^\/og-product\.png/,
  /^\/cart\.html/, /^\/checkout\.html/, /^\/thank-you\.html/,
  /^\/orders\.html/, /^\/myorder\.html/, /^\/admin/, /^\/stats/,
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) => c.addAll([
      '/site-header.css', '/site-header.js', '/premium-inner.css', '/luxury-home.css',
      '/footer-upgrade.css', '/footer-upgrade.js', '/site.js', '/cart.js', '/pwa.js',
      '/manifest.webmanifest', '/pwa/icon-192.png', '/pwa/icon-512.png',
    ]).catch(() => null)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (NEVER.some((rx) => rx.test(url.pathname))) return;

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  const isCatalog = /\.json$/.test(url.pathname);
  const isImage = /\.(png|jpe?g|webp|avif|svg|gif)$/i.test(url.pathname);
  const isCode = /\.(css|js|webmanifest)$/i.test(url.pathname);
  const isShell = /\.(woff2?|ttf)$/i.test(url.pathname);

  /* HTML, קטלוג, CSS ו-JS: תמיד מהרשת. כך כל העלאה נראית מיד, וה-cache משמש רק בלי קליטה. */
  if (isHTML || isCatalog || isCode) {
    /* network-first: תמיד העדכני ביותר, גיבוי מה-cache רק כשאין רשת */
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok && !url.search.includes('source=')) {
          const copy = res.clone();
          caches.open(isCode ? SHELL : PAGES).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || (isHTML ? caches.match('/') : undefined)))
    );
    return;
  }

  if (isShell || isImage) {
    /* cache-first, ומרעננים ברקע */
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone(); // לשכפל לפני שהדף צורך את התגובה
            caches.open(isImage ? IMAGES : SHELL).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});

/* העמוד יכול לבקש הפעלה מיידית של גרסה חדשה */
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
