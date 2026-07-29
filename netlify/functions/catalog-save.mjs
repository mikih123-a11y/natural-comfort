import { json } from './_lib.mjs';
import { readSession } from './_auth.mjs';

/**
 * שמירת הקטלוג ישירות ל-GitHub.
 *
 * זה מחליף את "הורדה וגרירה": האדמין שולח את הקטלוג המלא,
 * הפונקציה דוחפת אותו לרפוזיטורי, ונטליפיי בונה מחדש לבד.
 *
 * משתני סביבה נדרשים:
 *   GITHUB_TOKEN   — Fine-grained token עם הרשאת Contents: Read and write
 *   GITHUB_REPO    — ברירת מחדל mikih123-a11y/natural-comfort
 *   GITHUB_BRANCH  — ברירת מחדל main
 */

const API = 'https://api.github.com';

const repo   = () => process.env.GITHUB_REPO   || 'mikih123-a11y/natural-comfort';
const branch = () => process.env.GITHUB_BRANCH || 'main';

const gh = (path, opts = {}) =>
  fetch(API + path, {
    ...opts,
    headers: {
      'authorization': 'Bearer ' + process.env.GITHUB_TOKEN,
      'accept': 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'natural-comfort-admin',
      ...(opts.headers || {}),
    },
  });

/* base64 שעומד ביוניקוד — עברית שוברת btoa רגיל */
const toB64 = str => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  /* אותה הרשאה כמו כל האדמין */
  const email = await readSession(req);
  const u = new URL(req.url);
  const token = u.searchParams.get('token') || req.headers.get('x-admin-token');
  const byToken = process.env.STATS_TOKEN && token === process.env.STATS_TOKEN;
  if (!email && !byToken) return json({ error: 'לא מורשה.', login: true }, 401);

  if (!process.env.GITHUB_TOKEN)
    return json({ error: 'GITHUB_TOKEN לא מוגדר ב-Netlify. בלעדיו אי אפשר לשמור.' }, 500);

  const b = await req.json().catch(() => ({}));
  const path = String(b.path || 'products/catalog.json');
  const data = b.data;

  if (!['products/catalog.json', 'viz/catalog.json'].includes(path))
    return json({ error: 'נתיב לא מורשה.' }, 400);
  if (!data || typeof data !== 'object')
    return json({ error: 'חסר תוכן לשמירה.' }, 400);

  /* בדיקת שפיות — עדיף להיכשל כאן מאשר לדרוס קטלוג תקין בקובץ ריק */
  if (path === 'products/catalog.json') {
    if (!Array.isArray(data.models) || data.models.length === 0)
      return json({ error: 'הקטלוג ריק מדגמים. השמירה בוטלה.' }, 400);
  } else if (!Array.isArray(data.products)) {
    return json({ error: 'קובץ ההדמיה חייב מפתח products.' }, 400);
  }

  const body = JSON.stringify(data, null, 1);
  const url = `/repos/${repo()}/contents/${path}`;

  try {
    /* צריך את ה-SHA הנוכחי כדי לעדכן ולא ליצור */
    let sha = null;
    const cur = await gh(`${url}?ref=${branch()}`);
    if (cur.ok) sha = (await cur.json()).sha;
    else if (cur.status !== 404) {
      const t = await cur.text();
      console.error('[catalog-save] read failed', cur.status, t);
      return json({ error: 'קריאת הקובץ הנוכחי נכשלה (' + cur.status + ').' }, 502);
    }

    const who = email || 'admin';
    const res = await gh(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: `catalog: עדכון מהאדמין · ${who}`,
        content: toB64(body),
        branch: branch(),
        ...(sha ? { sha } : {}),
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      console.error('[catalog-save] write failed', res.status, t);
      if (res.status === 401 || res.status === 403)
        return json({ error: 'ה-GITHUB_TOKEN לא תקף או בלי הרשאת כתיבה.' }, 502);
      if (res.status === 409)
        return json({ error: 'הקובץ השתנה בינתיים. רעננו את הדף ונסו שוב.' }, 409);
      return json({ error: 'השמירה נכשלה (' + res.status + ').' }, 502);
    }

    const out = await res.json();
    return json({
      ok: true,
      path,
      models: Array.isArray(data.models) ? data.models.length : null,
      commit: out.commit?.html_url || null,
    });

  } catch (e) {
    console.error('[catalog-save] error', e?.message);
    return json({ error: 'שגיאה בשמירה: ' + (e?.message || '') }, 500);
  }
};

export const config = { path: '/api/catalog-save' };
