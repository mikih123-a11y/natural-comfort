import { store, json, normPhone } from './_lib.mjs';

/**
 * הודעה מהלקוח על ההזמנה — ציבורי, בלי הרשמה.
 *   POST /api/order-message  {number, phone, text}
 *
 * מאומת בדיוק כמו מעקב ההזמנה: מספר הזמנה מול הטלפון של המזמין.
 * ההודעה נכנסת ליומן ההערות של ההזמנה ומסומנת כ"לקוח",
 * ומועלה מונה הודעות שלא נקראו כדי שיופיע תג באדמין.
 */

const digits = s => String(s || '').replace(/\D/g, '');
const tail   = s => digits(s).replace(/^972/, '').replace(/^0/, '');
const clean  = (v, max) => String(v == null ? '' : v)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max);

const NOPE = 'לא נמצאה הזמנה עם הפרטים האלה.';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const b      = await req.json().catch(() => ({}));
  const number = clean(b.number, 40).trim().toUpperCase();
  const phone  = clean(b.phone, 30);
  const text   = clean(b.text, 1500).trim();

  if (!number || !phone) return json({ error: 'חסרים פרטים.' }, 400);
  if (!text)             return json({ error: 'יש לכתוב הודעה.' }, 400);

  /* הגבלת קצב — 10 הודעות לשעה מאותו IP */
  const ip = (req.headers.get('x-nf-client-connection-ip')
           || req.headers.get('x-forwarded-for') || 'x').split(',')[0].trim();
  const rl  = store('ratelimit');
  const key = 'msg_' + ip.replace(/[^0-9a-zA-Z.:]/g, '');
  const now = Date.now();
  try {
    let rec = await rl.get(key, { type: 'json' });
    if (!rec || now - rec.since > 3600000) rec = { since: now, n: 0 };
    if (rec.n >= 10) return json({ error: 'יותר מדי הודעות. נסו שוב בעוד שעה.' }, 429);
    rec.n++;
    await rl.setJSON(key, rec);
  } catch (e) {}

  const os = store('orders');
  const o  = await os.get(number, { type: 'json' }).catch(() => null);
  if (!o) return json({ error: NOPE }, 404);

  const onFile = tail(o.customer?.phone || '');
  if (!onFile || onFile !== tail(normPhone(phone) || phone))
    return json({ error: NOPE }, 404);

  const at = new Date().toISOString();
  o.notes_log = o.notes_log || [];
  o.notes_log.unshift({ at, text, by: 'customer' });
  o.cust_unread = (o.cust_unread || 0) + 1;
  o.log = o.log || [];
  o.log.unshift({ at, what: 'הודעה מהלקוח' });

  await os.setJSON(number, o);

  /* סימון באינדקס החודשי, כדי שהתג יופיע ברשימת ההזמנות */
  try {
    const ikey = `_idx:${String(o.date).slice(0, 7)}`;
    const idx  = (await os.get(ikey, { type: 'json' })) || [];
    const hit  = idx.find(r => r.number === o.number);
    if (hit) { hit.cust_unread = o.cust_unread; await os.setJSON(ikey, idx); }
  } catch (e) { console.error('[order-message] index', e?.message); }

  return json({
    ok: true,
    messages: o.notes_log.filter(n => n.by === 'customer')
      .map(n => ({ at: n.at, text: n.text })),
  });
};

export const config = { path: '/api/order-message' };
