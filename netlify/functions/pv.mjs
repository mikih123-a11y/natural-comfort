import { store, json } from './_lib.mjs';

/**
 * מונה צפיות במוצרים — POST /api/pv  {kind, ids:[modelId]}
 *
 * נקרא מ-site.js על כל אירוע פיקסל, כדי שנדע מה נצפה ומה נכנס לסל.
 * לא נשמר כאן שום מידע אישי: רק מזהה דגם ומונה. בלי IP, בלי עוגייה.
 * הנתונים יושבים בבלוב אחד לחודש: metrics/m:YYYY-MM
 */

const KINDS = {
  ViewContent:       'view',
  AddToCart:         'cart',
  InitiateCheckout:  'checkout',
};

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const b = await req.json().catch(() => ({}));
  const kind = KINDS[b.kind];
  if (!kind) return json({ ok: true });

  const ids = (Array.isArray(b.ids) ? b.ids : [])
    .map(x => String(x || '').replace(/[^\w\-]/g, '').slice(0, 60))
    .filter(Boolean)
    .slice(0, 20);
  if (!ids.length) return json({ ok: true });

  const ms  = store('metrics');
  const key = 'm:' + new Date().toISOString().slice(0, 7);

  try {
    const map = (await ms.get(key, { type: 'json' })) || {};
    ids.forEach(id => {
      map[id] = map[id] || { view: 0, cart: 0, checkout: 0 };
      map[id][kind] = (map[id][kind] || 0) + 1;
    });
    await ms.setJSON(key, map);
  } catch (e) {
    console.error('[pv]', e?.message);
  }

  return json({ ok: true });
};

export const config = { path: '/api/pv' };
