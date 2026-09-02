/* תצוגה מקדימה לשיתוף מוצר.
   וואטסאפ ופייסבוק לא מריצים JavaScript, ולכן המטא-תגיות מוזרקות כאן,
   בצד שמגיש את הדף, לפי ?id= ו-?finish= בכתובת.
   הקטלוג נקרא מ-/products/catalog.json. אין כאן מחירים או מידות מומצאים:
   מה שאין בקטלוג לא מוצג. */

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default async (request, context) => {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const res = await context.next();
  if (!id) return res;
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res;

  let cat;
  try {
    cat = await (await fetch(new URL('/products/catalog.json', url.origin))).json();
  } catch { return res; }

  const m = (cat.models || []).find((x) => x.id === id);
  if (!m) return res;

  const finishes = cat.finishes || [];
  const rends = m.renders || [];
  const wantF = url.searchParams.get('finish');
  const r = rends.find((x) => x.finish === wantF) || rends[0] || null;
  const fin = r ? finishes.find((f) => f.id === r.finish) : null;
  const line = m.line || ((cat.lines || {})[m.line_id] || {}).name || '';
  const seo = m.seo || {};

  const abs = (p) => (p ? new URL(p, url.origin).href : '');
  const image = abs(r && r.image);
  const canonical = `${url.origin}/product.html?id=${encodeURIComponent(m.id)}`
    + (r ? `&finish=${encodeURIComponent(r.finish)}` : '');

  const title = seo.title || `${m.name} · Natural Comfort`;
  const bits = [];
  if (line) bits.push(line);
  if (fin && fin.name) bits.push(`גימור ${fin.name}`);
  if (m.dims && m.dims.w && m.dims.h && m.dims.d) bits.push(`${m.dims.w} × ${m.dims.h} × ${m.dims.d} ס״מ`);
  if (typeof m.price === 'number') bits.push(`₪${m.price.toLocaleString('he-IL')}`);
  bits.push('נבנה בהתאמה אישית למידות שלכם');
  const description = seo.description || bits.join(' · ');

  const tags = [
    `<meta property="og:type" content="product">`,
    `<meta property="og:site_name" content="Natural Comfort">`,
    `<meta property="og:locale" content="he_IL">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : '',
    image ? `<meta property="og:image:alt" content="${esc(m.name)}">` : '',
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    image ? `<meta name="twitter:image" content="${esc(image)}">` : '',
    typeof m.price === 'number' ? `<meta property="product:price:amount" content="${m.price}">` : '',
    typeof m.price === 'number' ? `<meta property="product:price:currency" content="ILS">` : '',
    `<link rel="canonical" href="${esc(canonical)}">`,
  ].filter(Boolean).join('\n');

  let html = await res.text();
  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(description)}">`)
    .replace('</head>', `${tags}\n</head>`);

  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'public, max-age=300');
  return new Response(html, { status: res.status, headers });
};

export const config = { path: '/product.html' };
