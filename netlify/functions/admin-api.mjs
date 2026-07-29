import { store, json, normPhone } from './_lib.mjs';

/**
 * ה-API היחיד שהאדמין קורא לו.
 * מוגן בטוקן. כל הסוגים דרך פרמטר ?type=
 *
 *   ?type=orders&q=&status=&from=&to=&limit=
 *   ?type=order&id=NC-260729-422
 *   ?type=order-status   (POST)  {id, status, note}
 *   ?type=order-update   (POST)  {id, customer{}, address{}, tax_id, admin_notes, cost_num, shipping_num}
 *   ?type=order-note     (POST)  {id, text}            הוספת הערה ליומן
 *   ?type=customer&phone=  |  &email=      כרטיס לקוח מלא
 *   ?type=costs                             מפת עלויות מהמפעל
 *   ?type=cost-set       (POST)  {modelId, cost, note}
 *   ?type=leads&days=30
 *   ?type=analytics&days=90
 *
 * עלויות המפעל יושבות ב-Blobs בלבד ולעולם לא ב-catalog.json הציבורי.
 */

const MONTHS_BACK = 24;

/* ---------- סטטוסים ---------- */
export const STATUS = {
  received:  'התקבלה',
  paid:      'שולמה',
  production:'בייצור',
  ready:     'מוכנה לתיאום',
  scheduled: 'אספקה תואמה',
  shipped:   'נשלחה',
  cancelled: 'בוטלה',
};
const ORDER_OF = ['received','paid','production','ready','scheduled','shipped','cancelled'];

/* מיפוי מהסטטוסים הישנים — כדי שהזמנות קיימות לא ייעלמו */
const LEGACY = {
  new: 'received', contacted: 'received', measuring: 'received',
  confirmed: 'paid', delivered: 'shipped',
};
const normStatus = s => {
  const v = String(s || 'received');
  return STATUS[v] ? v : (LEGACY[v] || 'received');
};

const monthKeys = (n = MONTHS_BACK) => {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(`_idx:${d.toISOString().slice(0, 7)}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
};

async function allIndex(os) {
  const parts = await Promise.all(
    monthKeys().map(k => os.get(k, { type: 'json' }).catch(() => null))
  );
  return parts.filter(Boolean).flat().map(r => ({ ...r, status: normStatus(r.status) }));
}

const norm   = s => String(s || '').toLowerCase().trim();
const digits = s => String(s || '').replace(/\D/g, '');
const clean  = (v, max = 200) =>
  v == null ? '' : String(v).replace(/[\u0000-\u001F\u007F]/g, '').slice(0, max);
const num = v => (typeof v === 'number' && isFinite(v)) ? v : (v === '' || v == null ? null : (isFinite(+v) ? +v : null));

/**
 * חיפוש חופשי אחד שמכסה הכל: מספר הזמנה, שם, שם משפחה,
 * מייל, טלפון, ת.ז, ח.פ, עיר, רחוב.
 */
function matches(row, q) {
  if (!q) return true;
  const t = norm(q);
  const d = digits(q);
  const txt = [row.number, row.name, row.first, row.last, row.email, row.city, row.street]
    .map(norm).join(' | ');
  if (txt.includes(t)) return true;
  if (d.length >= 4) {
    if (digits(row.phone).includes(d)) return true;
    if (digits(row.tax_id).includes(d)) return true;
    if (digits(row.business_id).includes(d)) return true;
  }
  return false;
}

/* עדכון שורה באינדקס בלי לקרוא את כל החודשים */
async function patchIndex(os, order, patch) {
  const key = `_idx:${String(order.date).slice(0, 7)}`;
  try {
    const idx = (await os.get(key, { type: 'json' })) || [];
    const hit = idx.find(r => r.number === order.number);
    if (hit) { Object.assign(hit, patch); await os.setJSON(key, idx); }
  } catch (e) { console.error('[admin] index patch failed:', e?.message); }
}

/* עלות ההזמנה לפי מפת העלויות — אלא אם הוזנה עלות ידנית */
function orderCost(order, costs) {
  if (typeof order.cost_num === 'number') return order.cost_num;
  let sum = 0, known = false;
  (order.items || []).forEach(it => {
    const c = costs[it.modelId];
    if (c && typeof c.cost === 'number') { sum += c.cost * (it.qty || 1); known = true; }
  });
  return known ? sum : null;
}

export default async (req) => {
  const u = new URL(req.url);
  const token = u.searchParams.get('token') || req.headers.get('x-admin-token');
  if (!process.env.STATS_TOKEN) return json({ error: 'STATS_TOKEN לא מוגדר ב-Netlify.' }, 500);
  if (token !== process.env.STATS_TOKEN) return json({ error: 'לא מורשה.' }, 403);

  const type = u.searchParams.get('type') || 'orders';
  const os = store('orders');
  const cs = store('costs');

  const loadCosts = async () => (await cs.get('_map', { type: 'json' }).catch(() => null)) || {};

  /* ---------- מפת עלויות ---------- */
  if (type === 'costs') {
    return json({ costs: await loadCosts(), statuses: STATUS });
  }

  if (type === 'cost-set') {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    const b = await req.json().catch(() => ({}));
    const id = clean(b.modelId, 60);
    if (!id) return json({ error: 'חסר מזהה דגם.' }, 400);
    const map = await loadCosts();
    const c = num(b.cost);
    if (c === null) delete map[id];
    else map[id] = { cost: c, note: clean(b.note, 200), at: new Date().toISOString() };
    await cs.setJSON('_map', map);
    return json({ ok: true, costs: map });
  }

  /* ---------- הזמנה בודדת ---------- */
  if (type === 'order') {
    const id = u.searchParams.get('id');
    if (!id) return json({ error: 'חסר מזהה.' }, 400);
    const o = await os.get(id, { type: 'json' });
    if (!o) return json({ error: 'לא נמצאה.' }, 404);
    o.status = normStatus(o.status);
    const costs = await loadCosts();
    const cost = orderCost(o, costs);
    const rev  = typeof o.total_num === 'number' ? o.total_num : null;
    return json({
      order: o,
      cost,
      profit: (rev !== null && cost !== null) ? rev - cost : null,
      margin: (rev && cost !== null) ? Math.round(((rev - cost) / rev) * 1000) / 10 : null,
      itemCosts: (o.items || []).map(it => ({
        modelId: it.modelId,
        cost: costs[it.modelId]?.cost ?? null,
        qty: it.qty || 1,
      })),
      statuses: STATUS,
    });
  }

  /* ---------- עדכון סטטוס ---------- */
  if (type === 'order-status') {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    const b = await req.json().catch(() => ({}));
    const { id, status, note } = b;
    if (!id || !STATUS[status]) return json({ error: 'נתונים לא תקינים.' }, 400);

    const o = await os.get(id, { type: 'json' });
    if (!o) return json({ error: 'לא נמצאה.' }, 404);

    o.status = status;
    o.log = o.log || [];
    o.log.unshift({ at: new Date().toISOString(), what: 'סטטוס: ' + STATUS[status] + (note ? ' · ' + clean(note, 300) : '') });
    await os.setJSON(id, o);
    await patchIndex(os, o, { status });

    return json({ ok: true, status, label: STATUS[status] });
  }

  /* ---------- עריכת פרטי הזמנה ---------- */
  if (type === 'order-update') {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    const b = await req.json().catch(() => ({}));
    const id = clean(b.id, 40);
    if (!id) return json({ error: 'חסר מזהה.' }, 400);

    const o = await os.get(id, { type: 'json' });
    if (!o) return json({ error: 'לא נמצאה.' }, 404);

    o.customer = o.customer || {};
    o.address  = o.address  || {};

    const c = b.customer || {};
    if (c.first !== undefined) o.customer.first = clean(c.first, 40);
    if (c.last  !== undefined) o.customer.last  = clean(c.last, 40);
    if (c.first !== undefined || c.last !== undefined)
      o.customer.name = [o.customer.first, o.customer.last].filter(Boolean).join(' ') || o.customer.name;
    if (c.name  !== undefined && c.name) o.customer.name = clean(c.name, 80);
    if (c.phone !== undefined) o.customer.phone = normPhone(c.phone);
    if (c.email !== undefined) o.customer.email = clean(c.email, 120);
    if (c.tax_id !== undefined) o.customer.tax_id = clean(c.tax_id, 20) || null;
    if (c.business_id !== undefined) o.customer.business_id = clean(c.business_id, 20) || null;

    const a = b.address || {};
    ['city','street','apartment','floor','lift'].forEach(k => {
      if (a[k] !== undefined) o.address[k] = clean(a[k], 120);
    });

    if (b.admin_notes !== undefined) o.admin_notes = clean(b.admin_notes, 2000);
    if (b.cost_num    !== undefined) o.cost_num = num(b.cost_num);

    /* משלוח והרכבה — מגיע מהקטלוג, ניתן לדריסה כאן במקרה חריג */
    if (b.shipping_num !== undefined) o.shipping_num = num(b.shipping_num);

    o.log = o.log || [];
    o.log.unshift({ at: new Date().toISOString(), what: 'הפרטים עודכנו באדמין' });
    await os.setJSON(id, o);

    await patchIndex(os, o, {
      name: o.customer.name, first: o.customer.first, last: o.customer.last,
      phone: o.customer.phone, email: o.customer.email,
      tax_id: o.customer.tax_id, business_id: o.customer.business_id,
      city: o.address.city, street: o.address.street,
      apartment: o.address.apartment, floor: o.address.floor,
      cost_num: o.cost_num,
      shipping_num: o.shipping_num,
    });

    return json({ ok: true });
  }

  /* ---------- הוספת הערה ---------- */
  if (type === 'order-note') {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    const b = await req.json().catch(() => ({}));
    const id = clean(b.id, 40);
    const text = clean(b.text, 1500);
    if (!id || !text) return json({ error: 'חסר טקסט.' }, 400);

    const o = await os.get(id, { type: 'json' });
    if (!o) return json({ error: 'לא נמצאה.' }, 404);

    o.notes_log = o.notes_log || [];
    o.notes_log.unshift({ at: new Date().toISOString(), text });
    await os.setJSON(id, o);

    return json({ ok: true, notes_log: o.notes_log });
  }

  /* ---------- כרטיס לקוח ---------- */
  if (type === 'customer') {
    const phoneQ = u.searchParams.get('phone') || '';
    const emailQ = norm(u.searchParams.get('email') || '');
    const pd = digits(phoneQ);
    if (!pd && !emailQ) return json({ error: 'צריך טלפון או מייל.' }, 400);

    const idx = await allIndex(os);
    const mine = idx.filter(r =>
      (pd.length >= 7 && digits(r.phone).endsWith(pd.slice(-9))) ||
      (emailQ && norm(r.email) === emailQ)
    );

    let revenue = 0, cost = 0, costKnown = false;
    mine.forEach(r => {
      if (typeof r.total_num === 'number' && r.status !== 'cancelled') revenue += r.total_num;
      if (typeof r.cost_num === 'number') { cost += r.cost_num; costKnown = true; }
    });

    /* ההדמיות שהלקוח עשה — אותו טלפון */
    let visuals = [];
    try {
      const ls = store('leads');
      const { blobs } = await ls.list();
      const rows = (await Promise.all(
        blobs.slice(0, 800).map(x => ls.get(x.key, { type: 'json' }).catch(() => null))
      )).filter(Boolean);
      visuals = rows.filter(l =>
        (pd.length >= 7 && digits(l.phone).endsWith(pd.slice(-9))) ||
        (emailQ && norm(l.email) === emailQ)
      ).map(l => ({ at: l.consentAt, productId: l.productId, imageUrl: l.imageUrl, name: l.name }));
    } catch (e) { console.error('[admin] customer visuals failed:', e?.message); }

    const first = mine[mine.length - 1] || null;
    return json({
      customer: first ? {
        name: first.name, first: first.first, last: first.last,
        phone: first.phone, email: first.email,
        tax_id: first.tax_id, business_id: first.business_id,
        city: first.city, street: first.street,
        apartment: first.apartment, floor: first.floor,
      } : null,
      orders: mine,
      visuals,
      totals: {
        orders: mine.length,
        revenue,
        cost: costKnown ? cost : null,
        profit: costKnown ? revenue - cost : null,
        since: mine.length ? mine[mine.length - 1].date : null,
      },
    });
  }

  /* ---------- לידים ---------- */
  if (type === 'leads') {
    const days = Math.min(+(u.searchParams.get('days') || 30), 365);
    const since = Date.now() - days * 864e5;
    const ls = store('leads');
    const { blobs } = await ls.list();
    const keys = blobs
      .map(b => b.key)
      .filter(k => {
        const ts = +String(k).split('-')[0];
        return !isNaN(ts) && ts >= since;
      })
      .sort((a, b) => +String(b).split('-')[0] - +String(a).split('-')[0])
      .slice(0, 500);

    const rows = (await Promise.all(
      keys.map(k => ls.get(k, { type: 'json' }).catch(() => null))
    )).filter(Boolean).map(l => ({
      at: +String(l.consentAt ? Date.parse(l.consentAt) : 0) || null,
      consentAt: l.consentAt, name: l.name, phone: l.phone, email: l.email,
      productId: l.productId, imageUrl: l.imageUrl, ip: l.ip,
    }));

    return json({ leads: rows, count: rows.length });
  }

  /* ---------- ניתוחים ---------- */
  if (type === 'analytics') {
    const days = Math.min(+(u.searchParams.get('days') || 90), 730);
    const since = Date.now() - days * 864e5;
    const idx = (await allIndex(os)).filter(r => Date.parse(r.date) >= since);

    const cities = {}, products = {}, statuses = {}, byMonth = {};
    let revenue = 0, cost = 0, costRows = 0;

    idx.forEach(r => {
      const c = (r.city || '—').trim() || '—';
      cities[c] = cities[c] || { orders: 0, revenue: 0 };
      cities[c].orders++;
      if (typeof r.total_num === 'number') { cities[c].revenue += r.total_num; revenue += r.total_num; }
      if (typeof r.cost_num === 'number') { cost += r.cost_num; costRows++; }

      (r.products || []).forEach(p => { products[p] = (products[p] || 0) + 1; });
      statuses[r.status] = (statuses[r.status] || 0) + 1;

      const m = String(r.date).slice(0, 7);
      byMonth[m] = byMonth[m] || { orders: 0, revenue: 0, cost: 0 };
      byMonth[m].orders++;
      if (typeof r.total_num === 'number') byMonth[m].revenue += r.total_num;
      if (typeof r.cost_num === 'number')  byMonth[m].cost += r.cost_num;
    });

    const top = o => Object.entries(o).sort((a, b) =>
      (b[1].orders ?? b[1]) - (a[1].orders ?? a[1]));

    return json({
      days,
      orders: idx.length,
      revenue,
      cost: costRows ? cost : null,
      profit: costRows ? revenue - cost : null,
      costCoverage: idx.length ? Math.round((costRows / idx.length) * 100) : 0,
      avg: idx.length ? Math.round(revenue / idx.length) : 0,
      cities:   top(cities).slice(0, 40).map(([name, v]) => ({ name, ...v })),
      products: top(products).slice(0, 40).map(([id, n]) => ({ id, n })),
      statuses,
      statusLabels: STATUS,
      byMonth: Object.entries(byMonth).sort().map(([m, v]) => ({ month: m, ...v })),
    });
  }

  /* ---------- רשימת הזמנות ---------- */
  const q      = u.searchParams.get('q') || '';
  const status = u.searchParams.get('status') || '';
  const from   = u.searchParams.get('from') || '';
  const to     = u.searchParams.get('to') || '';
  const limit  = Math.min(+(u.searchParams.get('limit') || 200), 1000);

  let rows = await allIndex(os);

  if (status) rows = rows.filter(r => r.status === status);
  if (from)   rows = rows.filter(r => r.date >= from);
  if (to)     rows = rows.filter(r => r.date <= to + 'T23:59:59Z');
  if (q)      rows = rows.filter(r => matches(r, q));

  rows.sort((a, b) => (a.date < b.date ? 1 : -1));

  const shown = rows.slice(0, limit);
  const revenue = shown.reduce((s, r) => s + (typeof r.total_num === 'number' ? r.total_num : 0), 0);

  return json({
    count: rows.length,
    revenue,
    orders: shown,
    statuses: STATUS,
    statusOrder: ORDER_OF,
  });
};

export const config = { path: '/api/admin' };
