import { store, json } from './_lib.mjs';

/**
 * ה-API היחיד שהאדמין קורא לו.
 * מוגן בטוקן. כל הסוגים דרך פרמטר ?type=
 *
 *   ?type=orders&q=&status=&from=&to=&limit=
 *   ?type=order&id=NC-260729-422
 *   ?type=order-status&id=...&status=...&note=      (POST)
 *   ?type=leads&days=30
 *   ?type=analytics&days=90
 */

const MONTHS_BACK = 24;

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
  return parts.filter(Boolean).flat();
}

const norm = s => String(s || '').toLowerCase().trim();
const digits = s => String(s || '').replace(/\D/g, '');

function matches(row, q) {
  if (!q) return true;
  const t = norm(q);
  const d = digits(q);
  if (norm(row.number).includes(t)) return true;
  if (norm(row.name).includes(t))   return true;
  if (norm(row.email).includes(t))  return true;
  if (norm(row.city).includes(t))   return true;
  if (d.length >= 4 && digits(row.phone).includes(d)) return true;
  return false;
}

export default async (req) => {
  const u = new URL(req.url);
  const token = u.searchParams.get('token') || req.headers.get('x-admin-token');
  if (!process.env.STATS_TOKEN) return json({ error: 'STATS_TOKEN לא מוגדר ב-Netlify.' }, 500);
  if (token !== process.env.STATS_TOKEN) return json({ error: 'לא מורשה.' }, 403);

  const type = u.searchParams.get('type') || 'orders';
  const os = store('orders');

  /* ---------- הזמנה בודדת ---------- */
  if (type === 'order') {
    const id = u.searchParams.get('id');
    if (!id) return json({ error: 'חסר מזהה.' }, 400);
    const o = await os.get(id, { type: 'json' });
    return o ? json({ order: o }) : json({ error: 'לא נמצאה.' }, 404);
  }

  /* ---------- עדכון סטטוס ---------- */
  if (type === 'order-status') {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    const b = await req.json().catch(() => ({}));
    const { id, status, note } = b;
    const allowed = ['new','contacted','measuring','confirmed','production','delivered','cancelled'];
    if (!id || !allowed.includes(status)) return json({ error: 'נתונים לא תקינים.' }, 400);

    const o = await os.get(id, { type: 'json' });
    if (!o) return json({ error: 'לא נמצאה.' }, 404);

    o.status = status;
    o.log = o.log || [];
    o.log.unshift({ at: new Date().toISOString(), what: 'סטטוס: ' + status + (note ? ' · ' + note : '') });
    await os.setJSON(id, o);

    // עדכון האינדקס
    const key = `_idx:${String(o.date).slice(0, 7)}`;
    const idx = (await os.get(key, { type: 'json' })) || [];
    const hit = idx.find(r => r.number === id);
    if (hit) { hit.status = status; await os.setJSON(key, idx); }

    return json({ ok: true, status });
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
    let revenue = 0;

    idx.forEach(r => {
      const c = (r.city || '—').trim() || '—';
      cities[c] = cities[c] || { orders: 0, revenue: 0 };
      cities[c].orders++;
      if (typeof r.total_num === 'number') { cities[c].revenue += r.total_num; revenue += r.total_num; }

      (r.products || []).forEach(p => { products[p] = (products[p] || 0) + 1; });
      statuses[r.status || 'new'] = (statuses[r.status || 'new'] || 0) + 1;

      const m = String(r.date).slice(0, 7);
      byMonth[m] = byMonth[m] || { orders: 0, revenue: 0 };
      byMonth[m].orders++;
      if (typeof r.total_num === 'number') byMonth[m].revenue += r.total_num;
    });

    const top = o => Object.entries(o).sort((a, b) =>
      (b[1].orders ?? b[1]) - (a[1].orders ?? a[1]));

    return json({
      days,
      orders: idx.length,
      revenue,
      avg: idx.length ? Math.round(revenue / idx.length) : 0,
      cities:   top(cities).slice(0, 40).map(([name, v]) => ({ name, ...v })),
      products: top(products).slice(0, 40).map(([id, n]) => ({ id, n })),
      statuses,
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

  if (status) rows = rows.filter(r => (r.status || 'new') === status);
  if (from)   rows = rows.filter(r => r.date >= from);
  if (to)     rows = rows.filter(r => r.date <= to + 'T23:59:59Z');
  if (q)      rows = rows.filter(r => matches(r, q));

  rows.sort((a, b) => (a.date < b.date ? 1 : -1));

  return json({ count: rows.length, orders: rows.slice(0, limit) });
};

export const config = { path: '/api/admin' };
