import { store, json, normPhone } from './_lib.mjs';
import { readSession, bumpSessionVersion } from './_auth.mjs';

/**
 * ה-API היחיד שהאדמין קורא לו.
 * מוגן בטוקן. כל הסוגים דרך פרמטר ?type=
 *
 *   ?type=orders&q=&status=&from=&to=&limit=
 *   ?type=order&id=NC-260729-422
 *   ?type=order-status   (POST)  {id, status, note}
 *   ?type=order-update   (POST)  {id, customer{}, address{}, tax_id, admin_notes, cost_num, shipping_num}
 *   ?type=order-note     (POST)  {id, text}            הוספת הערה ליומן
 *   ?type=supplier                          חשבוניות ספק · כפילויות · חסרות · לא שולמו
 *   ?type=customer&phone=  |  &email=      כרטיס לקוח מלא
 *   ?type=export&q=&status=&from=&to=       ייצוא הזמנות ל-CSV
 *   ?type=logout-all     (POST)             ניתוק כל המכשירים
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

/**
 * כרום ממלא כתובות באנגלית. הלקוח כתב Petah Tikva, אתה מחפש "פתח תקווה".
 * המפה הזו מגשרת בין השניים לשני הכיוונים.
 */
const CITY_ALIAS = [
  ['פתח תקווה','petah tikva','petach tikva','petah tiqwa','petah tikwa'],
  ['תל אביב','tel aviv','tel aviv-yafo','tel aviv yafo'],
  ['ירושלים','jerusalem','yerushalayim'],
  ['חיפה','haifa','hefa'],
  ['ראשון לציון','rishon lezion','rishon letzion','rishon leziyyon'],
  ['אשדוד','ashdod'], ['אשקלון','ashkelon','ashqelon'],
  ['נתניה','netanya','netania'], ['באר שבע','beer sheva','beersheba','be er sheva'],
  ['בני ברק','bnei brak','bene beraq'], ['חולון','holon'],
  ['רמת גן','ramat gan'], ['רחובות','rehovot','rehovoth'],
  ['בת ים','bat yam'], ['הרצליה','herzliya','herzliyya'],
  ['כפר סבא','kfar saba','kefar sava'], ['חדרה','hadera','hadera'],
  ['מודיעין','modiin','modiin maccabim reut'], ['רעננה','raanana','ra anana'],
  ['רמלה','ramla','ramle'], ['לוד','lod'], ['נצרת','nazareth'],
  ['אילת','eilat','elat'], ['עכו','acre','akko'], ['טבריה','tiberias','teverya'],
  ['ראש העין','rosh haayin','rosh ha ayin'], ['יבנה','yavne','yavneh'],
  ['הוד השרון','hod hasharon'], ['גבעתיים','givatayim'], ['קריית גת','kiryat gat'],
  ['קריית ביאליק','kiryat bialik'], ['אור יהודה','or yehuda'],
  ['ראש פינה','rosh pina'], ['נס ציונה','ness ziona','nes ziyyona'],
  ['אריאל','ariel'], ['בית שמש','beit shemesh'], ['דימונה','dimona'],
];

/** מחזיר את כל השמות המקבילים לערך שהוקלד */
function cityForms(v) {
  const t = norm(v).replace(/['"׳״-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const row = CITY_ALIAS.find(r => r.some(x => norm(x) === t || norm(x).includes(t) || t.includes(norm(x))));
  return row ? row.map(norm) : [t];
}
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

  /* עיר — גם אם נכתבה באנגלית והחיפוש בעברית, או להפך */
  const rc = norm(row.city);
  if (rc && cityForms(q).some(f => rc.includes(f) || f.includes(rc))) return true;
  if (d.length >= 4) {
    /* 0525005600 · 972525005600 · 525005600 — כולם צריכים למצוא את אותו לקוח */
    const p = digits(row.phone);
    const tail = x => x.replace(/^972/, '').replace(/^0/, '');
    if (p.includes(d) || tail(p).includes(tail(d))) return true;
    if (digits(row.tax_id).includes(d)) return true;
    if (digits(row.business_id).includes(d)) return true;
  }
  return false;
}

/* עדכון שורה באינדקס בלי לקרוא את כל החודשים */
/* מספר חשבונית ספק מנורמל — בלי רווחים, מקפים או אותיות גדולות/קטנות */
const supKey = v => String(v || '').replace(/[\s\-_.\/\\]/g, '').toUpperCase();

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
  if (!process.env.STATS_TOKEN && !process.env.ADMIN_SECRET)
    return json({ error: 'STATS_TOKEN לא מוגדר ב-Netlify.' }, 500);

  /* שתי דרכי כניסה: סשן חתום מהעוגייה, או טוקן ידני לגיבוי */
  const email = await readSession(req);
  const token = u.searchParams.get('token') || req.headers.get('x-admin-token');
  const byToken = process.env.STATS_TOKEN && token === process.env.STATS_TOKEN;
  if (!email && !byToken) return json({ error: 'לא מורשה.', login: true }, 401);

  const type = u.searchParams.get('type') || 'orders';

  /* בדיקת סשן — האדמין קורא לזה לפני שהוא מצייר משהו */
  if (type === 'session') return json({ ok: true, email: email || null, via: email ? 'session' : 'token' });
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

    /* אותה חשבונית ספק על יותר מהזמנה אחת = חיוב כפול */
    let dupInvoice = [];
    const myKey = supKey(o.supplier?.invoice_no);
    if (myKey) {
      const rows = await allIndex(os);
      dupInvoice = rows
        .filter(r => r.number !== o.number && supKey(r.sup_no) === myKey)
        .map(r => ({ number: r.number, name: r.name || '', amount: r.sup_amount ?? null, date: r.date || null }));
    }

    return json({
      order: o,
      dupInvoice,
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

    /* ---------- חשבונית ספק ---------- */
    if (b.supplier !== undefined) {
      const s = b.supplier || {};
      o.supplier = o.supplier || {};
      if (s.invoice_no   !== undefined) o.supplier.invoice_no   = supKey(s.invoice_no) ? clean(s.invoice_no, 40) : '';
      if (s.invoice_date !== undefined) o.supplier.invoice_date = clean(s.invoice_date, 12);
      if (s.amount       !== undefined) o.supplier.amount       = num(s.amount);
      if (s.paid         !== undefined) o.supplier.paid         = !!s.paid;
      if (s.note         !== undefined) o.supplier.note         = clean(s.note, 300);
    }

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
      sup_no:     o.supplier?.invoice_no ?? null,
      sup_amount: o.supplier?.amount ?? null,
      sup_paid:   o.supplier?.paid ?? null,
      sup_date:   o.supplier?.invoice_date ?? null,
    });

    return json({ ok: true });
  }

  /* ---------- חשבוניות ספק ---------- */
  if (type === 'supplier') {
    const rows = await allIndex(os);

    /* קיבוץ לפי מספר חשבונית מנורמל — כדי לתפוס חיוב כפול */
    const byInv = new Map();
    rows.forEach(r => {
      const k = supKey(r.sup_no);
      if (!k) return;
      if (!byInv.has(k)) byInv.set(k, []);
      byInv.get(k).push(r);
    });

    const dups = [];
    byInv.forEach((list, k) => {
      if (list.length > 1) dups.push({
        invoice: list[0].sup_no,
        key: k,
        count: list.length,
        sum: list.reduce((a, r) => a + (typeof r.sup_amount === 'number' ? r.sup_amount : 0), 0),
        orders: list.map(r => ({ number: r.number, name: r.name || '', date: r.date || null, amount: r.sup_amount ?? null })),
      });
    });

    const active  = rows.filter(r => r.status !== 'cancelled');
    const withInv = active.filter(r => supKey(r.sup_no));
    const missing = active
      .filter(r => !supKey(r.sup_no))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 200)
      .map(r => ({ number: r.number, name: r.name || '', date: r.date || null, total: r.total_num ?? null }));

    const unpaid = withInv
      .filter(r => !r.sup_paid)
      .map(r => ({ number: r.number, name: r.name || '', invoice: r.sup_no, date: r.sup_date || null, amount: r.sup_amount ?? null }));

    return json({
      dups,
      missing,
      unpaid,
      counts: {
        orders:   active.length,
        invoiced: withInv.length,
        missing:  active.length - withInv.length,
        unpaid:   unpaid.length,
      },
      totals: {
        invoiced: withInv.reduce((a, r) => a + (typeof r.sup_amount === 'number' ? r.sup_amount : 0), 0),
        unpaid:   unpaid.reduce((a, r) => a + (typeof r.amount === 'number' ? r.amount : 0), 0),
      },
    });
  }

  /* ---------- ניתוק כל המכשירים ---------- */
  if (type === 'logout-all') {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    const v = await bumpSessionVersion();
    console.warn('[admin] כל הסשנים נותקו · גרסה', v);
    return json({ ok: true, version: v });
  }

  /* ---------- ייצוא ל-CSV ---------- */
  if (type === 'export') {
    const q = u.searchParams.get('q') || '';
    const st = u.searchParams.get('status') || '';
    const from = u.searchParams.get('from') || '';
    const to = u.searchParams.get('to') || '';

    let rows = await allIndex(os);
    if (st)   rows = rows.filter(r => r.status === st);
    if (from) rows = rows.filter(r => r.date >= from);
    if (to)   rows = rows.filter(r => r.date <= to + 'T23:59:59Z');
    if (q)    rows = rows.filter(r => matches(r, q));
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));

    const head = ['מספר הזמנה','תאריך','סטטוס','שם פרטי','שם משפחה','טלפון','מייל',
                  'ת.ז','ח.פ','עיר','רחוב','דירה','קומה','פריטים','סכום','עלות','רווח','משלוח'];

    /* אקסל בעברית נשבר בלי BOM, ומפרש מספר שמתחיל ב-0 כמספר. גרש מקדים פותר את שניהם. */
    const cell = v => {
      if (v == null) return '';
      const t = String(v).replace(/"/g, '""');
      return /[",\n]/.test(t) ? '"' + t + '"' : t;
    };
    const tel = p => "'" + String(p || '').replace(/^\+972/, '0');

    const lines = [head.join(',')];
    rows.forEach(r => {
      const cost = typeof r.cost_num === 'number' ? r.cost_num : null;
      const rev  = typeof r.total_num === 'number' ? r.total_num : null;
      lines.push([
        cell(r.number), cell(String(r.date).slice(0, 10)), cell(STATUS[r.status] || r.status),
        cell(r.first), cell(r.last), cell(tel(r.phone)), cell(r.email),
        cell(r.tax_id ? "'" + r.tax_id : ''), cell(r.business_id ? "'" + r.business_id : ''),
        cell(r.city), cell(r.street), cell(r.apartment), cell(r.floor),
        cell(r.items), cell(rev), cell(cost),
        cell(rev !== null && cost !== null ? rev - cost : ''),
        cell(r.shipping_num),
      ].join(','));
    });

    const csv = '\uFEFF' + lines.join('\r\n');
    const name = 'natural-comfort-orders-' + new Date().toISOString().slice(0, 10) + '.csv';
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="' + name + '"',
      },
    });
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
    const days = Math.min(+(u.searchParams.get('days') || 180), 730);
    const since = Date.now() - days * 864e5;
    const ls = store('leads');
    const { blobs } = await ls.list();

    /* קוראים הכל ומסננים לפי התאריך שברשומה עצמה — מפתח האחסון לא אמין */
    const all = (await Promise.all(
      blobs.slice(0, 1200).map(b => ls.get(b.key, { type: 'json' }).catch(() => null))
    )).filter(Boolean);

    let rows = all.map(l => ({
      at: l.consentAt ? Date.parse(l.consentAt) : null,
      consentAt: l.consentAt, name: l.name, phone: l.phone, email: l.email,
      productId: l.productId, imageUrl: l.imageUrl, ip: l.ip,
    }));

    rows = rows.filter(r => !r.at || r.at >= since);
    rows.sort((a, b) => (b.at || 0) - (a.at || 0));

    /* מי מהם באמת הזמין — זו השאלה היחידה שחשובה במסך הזה */
    const idx = await allIndex(os);
    const tail = x => digits(x).replace(/^972/, '').replace(/^0/, '');
    const byPhone = {}, byMail = {};
    idx.forEach(r => {
      const t = tail(r.phone);
      if (t) (byPhone[t] = byPhone[t] || []).push(r);
      const m = norm(r.email);
      if (m) (byMail[m] = byMail[m] || []).push(r);
    });

    rows = rows.map(r => {
      const hits = byPhone[tail(r.phone)] || byMail[norm(r.email)] || [];
      const live = hits.filter(h => h.status !== 'cancelled');
      return {
        ...r,
        orders: live.length,
        revenue: live.reduce((s2, h) => s2 + (typeof h.total_num === 'number' ? h.total_num : 0), 0),
        lastOrder: live.length ? live[0].number : null,
      };
    });

    const converted = rows.filter(r => r.orders > 0).length;

    return json({
      leads: rows.slice(0, 600),
      count: rows.length,
      converted,
      rate: rows.length ? Math.round((converted / rows.length) * 100) : 0,
      revenue: rows.reduce((s2, r) => s2 + (r.revenue || 0), 0),
    });
  }

  /* ---------- ניתוחים ---------- */
  if (type === 'analytics') {
    const days = Math.min(+(u.searchParams.get('days') || 90), 730);
    const since = Date.now() - days * 864e5;
    const idx = (await allIndex(os)).filter(r => Date.parse(r.date) >= since);

    const cities = {}, products = {}, statuses = {}, byMonth = {};
    let revenue = 0, cost = 0, costRows = 0, live = 0, cancelled = 0, lost = 0;

    idx.forEach(r => {
      statuses[r.status] = (statuses[r.status] || 0) + 1;

      /* הזמנה שבוטלה לא נכנסת למחזור, לרווח ולממוצע */
      if (r.status === 'cancelled') {
        cancelled++;
        if (typeof r.total_num === 'number') lost += r.total_num;
        return;
      }
      live++;

      const c = (r.city || '—').trim() || '—';
      cities[c] = cities[c] || { orders: 0, revenue: 0 };
      cities[c].orders++;
      if (typeof r.total_num === 'number') { cities[c].revenue += r.total_num; revenue += r.total_num; }
      if (typeof r.cost_num === 'number') { cost += r.cost_num; costRows++; }

      (r.products || []).forEach(p => { products[p] = (products[p] || 0) + 1; });

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
      orders: live,
      total: idx.length,
      cancelled,
      lost,
      revenue,
      cost: costRows ? cost : null,
      profit: costRows ? revenue - cost : null,
      margin: (costRows && revenue) ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : null,
      costCoverage: live ? Math.round((costRows / live) * 100) : 0,
      avg: live ? Math.round(revenue / live) : 0,
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
