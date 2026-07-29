import { store, json, normPhone, ip } from './_lib.mjs';
import vizCatalog from '../../viz/catalog.json' with { type: 'json' };

/**
 * הליד יוצא לכל יעד שמוגדר. מה שלא מוגדר — מדולג בשקט.
 * הכל במקביל, ואף כישלון לא חוסם את פתיחת ההדמיה ללקוח.
 *
 * תיקון: הקטלוג של המדמה הוא viz/catalog.json ובו המפתח `products`.
 * הקובץ products/catalog.json הוא של החנות ובו המפתח `models` —
 * ייבוא ממנו הפיל את הפונקציה ולכן לידים לא נשמרו ולא נשלחו.
 */

/* חיפוש מוצר שלא קורס — לא משנה איך הקטלוג בנוי */
function findProduct(id) {
  if (!id) return null;
  try {
    const list = vizCatalog?.products || vizCatalog?.models || [];
    return list.find(x => x && x.id === id) || null;
  } catch {
    return null;
  }
}

/* מידות שעשויות לא להתקיים כלל */
const dimsOf = p => {
  const d = p && p.dims;
  return d && d.w && d.h && d.d ? `${d.w}×${d.h}×${d.d}` : '—';
};

const wa = (l, p) =>
  `🛋️ *ליד חדש — הדמיה*\n\n` +
  `*${l.name}*\n📱 ${l.phone}\n✉️ ${l.email}\n\n` +
  `*הארון:* ${p?.name || l.productId || '—'}\n*מידות:* ${dimsOf(p)}\n\n` +
  (l.imageUrl ? `*תמונת החדר שלו + ההדמיה:*\n${l.imageUrl}\n\n` : '') +
  `_${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}_`;

const html = (l, p) => `<div dir="rtl" style="font-family:Assistant,Arial,sans-serif;max-width:520px">
<h2 style="font-weight:500">ליד חדש מהמדמה</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px">
<tr><td style="padding:6px 0;color:#8A837A">שם</td><td><b>${l.name}</b></td></tr>
<tr><td style="padding:6px 0;color:#8A837A">טלפון</td><td><a href="tel:${l.phone}">${l.phone}</a> · <a href="https://wa.me/${l.phone.replace('+','')}">וואטסאפ</a></td></tr>
<tr><td style="padding:6px 0;color:#8A837A">אימייל</td><td><a href="mailto:${l.email}">${l.email}</a></td></tr>
<tr><td style="padding:6px 0;color:#8A837A">ארון</td><td>${p?.name || l.productId || '—'}</td></tr>
<tr><td style="padding:6px 0;color:#8A837A">מידות</td><td>${dimsOf(p)} ס"מ</td></tr>
</table>
${l.imageUrl ? `<p style="margin:18px 0 6px;color:#8A837A;font-size:13px">ההדמיה שהוא ראה:</p>
<img src="${l.imageUrl}" style="width:100%;border:1px solid #E2DCD2">` : ''}
<p style="font-size:12px;color:#8A837A">${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}</p>
</div>`;

const sinks = {
  // 0. Netlify Forms — משתמש בערוץ ההתראות שכבר עובד באתר.
  //    בלי חשבון חיצוני ובלי מפתחות. נשלח תמיד.
  netlifyForm: async (l, p) => {
    const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
    if (!base) return;
    const body = new URLSearchParams({
      'form-name': 'lead',
      name:    l.name,
      phone:   l.phone,
      email:   l.email,
      product: p?.name || l.productId || '—',
      image:   l.imageUrl || '—',
      source:  'הדמיה בחדר',
      ip:      l.ip || '—',
      notes:   `מידות: ${dimsOf(p)} · ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`,
    }).toString();

    const r = await fetch(base + '/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!r.ok) throw new Error('netlify form ' + r.status);
  },

  // 1. CRM / Make / Zapier / כל endpoint
  webhook: async (l, p) => {
    if (!process.env.LEAD_WEBHOOK_URL) return;
    await fetch(process.env.LEAD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(process.env.LEAD_WEBHOOK_AUTH ? { Authorization: process.env.LEAD_WEBHOOK_AUTH } : {}) },
      body: JSON.stringify({ ...l, product: p, source: 'nc-visualizer' }),
    });
  },
  // 2. וואטסאפ — לכל ספק שמקבל POST
  whatsapp: async (l, p) => {
    if (!process.env.WA_WEBHOOK_URL) return;
    await fetch(process.env.WA_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(process.env.WA_WEBHOOK_AUTH ? { Authorization: process.env.WA_WEBHOOK_AUTH } : {}) },
      body: JSON.stringify({ phone: process.env.WA_TO || '+972524400030', text: wa(l, p), imageUrl: l.imageUrl }),
    });
  },
  // 3. מייל דרך Resend
  email: async (l, p) => {
    if (!process.env.RESEND_API_KEY || !process.env.LEAD_EMAIL_TO) return;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: process.env.LEAD_EMAIL_FROM || 'leads@naturalcomfort.co.il',
        to: process.env.LEAD_EMAIL_TO.split(','),
        subject: `ליד חדש · ${l.name} · ${p?.name || l.productId || 'הדמיה'}`,
        html: html(l, p),
      }),
    });
  },
};

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const b = await req.json().catch(() => ({}));
  const { name, phone, email, productId, jobId, session, consent } = b;
  if (!name || !phone || !email || !session || !consent) {
    return json({ error: 'חסרים נתונים או הסכמה.' }, 400);
  }

  const ok = await store('sessions').get(`v:${session}`, { type: 'json' });
  if (!ok) return json({ error: 'הסשן לא מאומת.' }, 403);

  let job = null;
  try {
    job = jobId ? await store('jobs').get(jobId, { type: 'json' }) : null;
  } catch (e) {
    console.error('[lead] job lookup failed:', e?.message);
  }

  const lead = {
    name: String(name).slice(0, 80),
    phone: normPhone(phone),
    email: String(email).slice(0, 120),
    productId: productId || null,
    jobId: jobId || null,
    imageUrl: job?.url || null,
    verification: job?.report || null,
    consent: true,
    consentAt: new Date().toISOString(),
    ip: ip(req),
    ua: req.headers.get('user-agent'),
  };

  /* השמירה קודמת לכל דבר אחר. ליד שנשמר לא הולך לאיבוד
     גם אם הקטלוג, הוואטסאפ או המייל נופלים. */
  try {
    await store('leads').setJSON(`${Date.now()}-${session}`, lead);
  } catch (e) {
    console.error('[lead] SAVE FAILED:', e?.message);
    return json({ error: 'שמירת הליד נכשלה.' }, 500);
  }

  const p = findProduct(productId);

  const out = await Promise.allSettled(Object.values(sinks).map(f => f(lead, p)));
  out.forEach(r => r.status === 'rejected' && console.error('[lead sink]', r.reason?.message));

  const delivered = Object.keys(sinks).filter((k, i) => out[i].status === 'fulfilled');
  return json({ ok: true, saved: true, delivered });
};

export const config = { path: '/api/lead' };
