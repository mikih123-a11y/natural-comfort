/* תמונת שיתוף למוצר, 1200×630. נקראת מהמטא-תגית og:image.
   כתובת: /og-product.png?id=<דגם>&finish=<גוון>
   מצוירת מהקטלוג בלבד: תמונת הרינדור של הגוון, לוגו, שם הדגם, מחיר הבסיס.
   אין כאן מחירים או מידות שלא בקטלוג. אם משהו נכשל, מפנים לתמונת הרינדור עצמה. */

import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 1200, H = 630;
const C = { paper: '#FBFAF8', ink: '#211F1D', soft: '#3B3733', line: '#E2DCD2', champ: '#A79A88', tag: '#9b8870' };

/* הפונטים נארזים עם הפונקציה (included_files). מחפשים אותם בכמה מיקומים אפשריים. */
const here = path.dirname(fileURLToPath(import.meta.url));
function fontPath(file) {
  const cands = [
    path.join(process.cwd(), 'netlify/functions/og-fonts', file),
    path.join(here, 'og-fonts', file),
    path.join(here, '../../netlify/functions/og-fonts', file),
    path.join('/var/task/netlify/functions/og-fonts', file),
  ];
  return cands.find((p) => existsSync(p)) || null;
}
let fontsOk = false;
try {
  const a = fontPath('FrankRuhlLibre-Bold.ttf'), b = fontPath('Assistant-SemiBold.ttf');
  if (a) GlobalFonts.registerFromPath(a, 'FrankRuhl');
  if (b) GlobalFonts.registerFromPath(b, 'AssistantNC');
  fontsOk = !!(a && b);
} catch (e) { console.warn('[og] fonts', e); }

const SERIF = fontsOk ? 'FrankRuhl' : 'serif';
const SANS  = fontsOk ? 'AssistantNC' : 'sans-serif';

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…';
  }
  return lines;
}

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  const wantF = url.searchParams.get('finish');
  let fallback = null;

  try {
    const cat = await (await fetch(new URL('/products/catalog.json', url.origin))).json();
    const m = (cat.models || []).find((x) => x.id === id);
    if (!m) return new Response('not found', { status: 404 });

    const rends = m.renders || [];
    const r = rends.find((x) => x.finish === wantF) || rends[0] || null;
    const fin = r ? (cat.finishes || []).find((f) => f.id === r.finish) : null;
    const imgUrl = r && r.image ? new URL(r.image, url.origin).href : null;
    fallback = imgUrl;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // רקע
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);

    // לוח התמונה, בצד שמאל
    const box = { x: 56, y: 56, w: 520, h: 518 };
    ctx.fillStyle = '#ffffff'; ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.strokeRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2);
    if (imgUrl) {
      try {
        const img = await loadImage(imgUrl);
        const pad = 12;
        const s = Math.min((box.w - pad * 2) / img.width, (box.h - pad * 2) / img.height);
        const dw = img.width * s, dh = img.height * s;
        ctx.drawImage(img, box.x + (box.w - dw) / 2, box.y + (box.h - dh) / 2, dw, dh);
      } catch (e) { console.warn('[og] image', e); }
    }

    // טקסט, מיושר לימין
    const R = 1140, L = 640, maxW = R - L;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';

    // לוגו
    ctx.fillStyle = C.ink;
    ctx.font = `700 44px ${SERIF}`;
    ctx.fillText('Natural Comfort', R, 118);
    ctx.fillStyle = C.tag;
    ctx.font = `600 15px ${SANS}`;
    ctx.letterSpacing = '5px';
    ctx.fillText('CUSTOM FURNITURE', R, 146);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = C.champ; ctx.fillRect(R - 72, 176, 72, 2);

    // שם הדגם
    ctx.fillStyle = C.ink;
    ctx.font = `700 52px ${SERIF}`;
    const lines = wrap(ctx, m.name || '', maxW, 3);
    let y = 262;
    for (const ln of lines) { ctx.fillText(ln, R, y); y += 62; }

    // גוון וסדרה
    ctx.fillStyle = C.soft;
    ctx.font = `600 27px ${SANS}`;
    const sub = [];
    const lineName = m.line || ((cat.lines || {})[m.line_id] || {}).name;
    if (lineName) sub.push(lineName);
    if (fin && fin.name) sub.push('גימור ' + fin.name);
    if (sub.length) { ctx.fillText(sub.join(' · '), R, y + 6); }

    // מחיר בסיס מהקטלוג
    if (typeof m.price === 'number') {
      ctx.fillStyle = C.ink;
      ctx.font = `700 58px ${SERIF}`;
      ctx.fillText('החל מ־' + m.price.toLocaleString('he-IL') + ' ₪', R, 556);
    }

    const png = await canvas.encode('png');
    return new Response(png, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
        'Netlify-CDN-Cache-Control': 'public, max-age=604800, durable',
      },
    });
  } catch (e) {
    console.error('[og]', e);
    if (fallback) return Response.redirect(fallback, 302);
    return new Response('og error', { status: 500 });
  }
};

export const config = { path: '/og-product.png' };
