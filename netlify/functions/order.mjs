import { store, json, normPhone, ip } from './_lib.mjs';

/**
 * שמירת הזמנה אצלנו.
 * שתי רשומות לכל הזמנה:
 *   1. הרשומה המלאה           orders/<number>
 *   2. שורה באינדקס החודשי     orders/_idx:YYYY-MM   ← לחיפוש מהיר
 *
 * האינדקס קיים כדי שחיפוש לא ידרוש קריאה של כל ההזמנות.
 * כשנעבור ל-Hostinger זה הופך לטבלה אחת ואינדקס במסד — אותו מודל בדיוק.
 */

const MONTH = d => d.slice(0, 7);

const clean = (v, max = 200) =>
  v == null ? '' : String(v).replace(/[\u0000-\u001F\u007F]/g, '').slice(0, max);

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const b = await req.json().catch(() => ({}));
  const {
    number, name, phone, email, city, street, floor, lift,
    contact_pref, measure, measure_note, notes,
    items, total, total_num, business_id,
  } = b;

  if (!number || !name || !phone) return json({ error: 'חסרים נתונים.' }, 400);

  const now = new Date().toISOString();

  const order = {
    number: clean(number, 40),
    date: now,
    status: 'new',                       // new · contacted · measuring · confirmed · production · delivered · cancelled
    customer: {
      name:  clean(name, 80),
      phone: normPhone(phone),
      email: clean(email, 120),
      business_id: clean(business_id, 20) || null,   // ח.פ / ת.ז — עסקיים בלבד
    },
    address: {
      city:   clean(city, 60),
      street: clean(street, 120),
      floor:  clean(floor, 20),
      lift:   clean(lift, 40),
    },
    contact_pref: clean(contact_pref, 30),
    measure:      clean(measure, 60),
    measure_note: clean(measure_note, 600),
    notes:        clean(notes, 1200),
    items: Array.isArray(items) ? items.slice(0, 40).map(it => ({
      modelId:  clean(it.modelId, 60),
      name:     clean(it.name, 140),
      config:   Array.isArray(it.config) ? it.config.slice(0, 30).map(c => clean(c, 160)) : [],
      qty:      Math.max(1, Math.min(99, +it.qty || 1)),
      price:    typeof it.price === 'number' ? it.price : null,
      image:    clean(it.image, 400),
      url:      clean(it.url, 400),
    })) : [],
    total:     clean(total, 60),
    total_num: typeof total_num === 'number' ? total_num : null,
    meta: { ip: ip(req), ua: clean(req.headers.get('user-agent'), 300) },
    log: [{ at: now, what: 'ההזמנה התקבלה מהאתר' }],
  };

  const os = store('orders');

  try {
    await os.setJSON(order.number, order);
  } catch (e) {
    console.error('[order] SAVE FAILED:', e?.message);
    return json({ error: 'שמירת ההזמנה נכשלה.' }, 500);
  }

  /* שורה דקה באינדקס — רק מה שצריך לטבלה ולחיפוש */
  const key = `_idx:${MONTH(now)}`;
  try {
    const idx = (await os.get(key, { type: 'json' })) || [];
    idx.unshift({
      number:  order.number,
      date:    now,
      status:  order.status,
      name:    order.customer.name,
      phone:   order.customer.phone,
      email:   order.customer.email,
      city:    order.address.city,
      total:   order.total,
      total_num: order.total_num,
      items:   order.items.length,
      products: order.items.map(i => i.modelId).filter(Boolean),
    });
    await os.setJSON(key, idx.slice(0, 5000));
  } catch (e) {
    console.error('[order] index update failed:', e?.message);
    // ההזמנה נשמרה. אינדקס אפשר לבנות מחדש.
  }

  return json({ ok: true, number: order.number });
};

export const config = { path: '/api/order' };
