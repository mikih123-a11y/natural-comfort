import { store, json, normPhone } from './_lib.mjs';

/**
 * מעקב הזמנה ללקוח — ציבורי, בלי הרשמה.
 *   /api/my-order?number=NC-260729-422&phone=0525005600
 *
 * מאמת מספר הזמנה מול הטלפון של המזמין, ומחזיר גרסה מסוננת בלבד.
 * לעולם לא יוצאים מכאן: עלות מהמפעל, רווח, חשבונית ספק,
 * הערות פנימיות, יומן ההזמנה, כתובת IP.
 */

const STATUS = {
  received:  'התקבלה',
  paid:      'שולמה',
  production:'בייצור',
  ready:     'מוכנה לתיאום',
  scheduled: 'אספקה תואמה',
  shipped:   'נשלחה',
  cancelled: 'בוטלה',
};
const FLOW = ['received','paid','production','ready','scheduled','shipped'];

const LEGACY = {
  new: 'received', contacted: 'received', measuring: 'received',
  confirmed: 'paid', delivered: 'shipped',
};
const normStatus = s => {
  const v = String(s || 'received');
  return STATUS[v] ? v : (LEGACY[v] || 'received');
};

const digits = s => String(s || '').replace(/\D/g, '');
const tail   = s => digits(s).replace(/^972/, '').replace(/^0/, '');

/* הודעה אחת לכל כישלון — כדי שאי אפשר יהיה לדוג מספרי הזמנה */
const NOPE = 'לא נמצאה הזמנה עם הפרטים האלה. יש לבדוק את מספר ההזמנה ואת הטלפון שנמסר בהזמנה.';

export default async (req) => {
  const u = new URL(req.url);
  const number = (u.searchParams.get('number') || '').trim().toUpperCase();
  const phone  = u.searchParams.get('phone') || '';

  if (!number || !phone)
    return json({ error: 'יש להזין מספר הזמנה וטלפון.' }, 400);

  /* הגבלת קצב — 20 בדיקות לשעה מאותו IP, כדי שאי אפשר יהיה לנחש */
  const ip = (req.headers.get('x-nf-client-connection-ip')
           || req.headers.get('x-forwarded-for') || 'x').split(',')[0].trim();
  const rl  = store('ratelimit');
  const key = 'trk_' + ip.replace(/[^0-9a-zA-Z.:]/g, '');
  const now = Date.now();
  try {
    let rec = await rl.get(key, { type: 'json' });
    if (!rec || now - rec.since > 3600000) rec = { since: now, n: 0 };
    if (rec.n >= 20) return json({ error: 'יותר מדי ניסיונות. נסו שוב בעוד שעה.' }, 429);
    rec.n++;
    await rl.setJSON(key, rec);
  } catch (e) { /* אם ההגבלה נופלת, לא חוסמים לקוח אמיתי */ }

  const os = store('orders');
  const o  = await os.get(number, { type: 'json' }).catch(() => null);
  if (!o) return json({ error: NOPE }, 404);

  const onFile = tail(o.customer?.phone || '');
  if (!onFile || onFile !== tail(normPhone(phone) || phone))
    return json({ error: NOPE }, 404);

  const st = normStatus(o.status);
  const c  = o.customer || {};
  const a  = o.address  || {};

  return json({
    number:  o.number || number,
    date:    o.date || null,
    status:  st,
    label:   STATUS[st],
    cancelled: st === 'cancelled',
    flow:    FLOW.map(k => ({ key: k, label: STATUS[k] })),
    at:      FLOW.indexOf(st),

    customer: {
      name:  c.name || [c.first, c.last].filter(Boolean).join(' ') || '',
      phone: c.phone || '',
      email: c.email || '',
    },
    address: {
      city: a.city || '', street: a.street || '',
      apartment: a.apartment || '', floor: a.floor || '', lift: a.lift || '',
    },

    items: (o.items || []).map(it => ({
      modelId: it.modelId || null,
      name:    it.name || '',
      qty:     Number(it.qty) || 1,
      price:   typeof it.price === 'number' ? it.price : null,
      config:  it.config || [],
      delivery_install: [it.delivery_install, it.shipping, it.ship]
        .find(x => typeof x === 'number') ?? null,
    })),

    total:        o.total || null,
    total_num:    typeof o.total_num === 'number' ? o.total_num : null,
    shipping_num: typeof o.shipping_num === 'number' ? o.shipping_num : null,

    /* ההודעות של הלקוח עצמו בלבד. הערות פנימיות לא יוצאות מכאן. */
    messages: (o.notes_log || [])
      .filter(n => n && n.by === 'customer')
      .map(n => ({ at: n.at, text: n.text })),

    measure:      o.measure || null,
    measure_note: o.measure_note || null,
    notes:        o.notes || null,
  });
};

export const config = { path: '/api/my-order' };
