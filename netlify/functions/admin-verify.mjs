import { store, json, ip } from './_lib.mjs';
import { isAllowed, hashCode, makeSession, cookieHeader, jsonCookie, SESSION_HOURS } from './_auth.mjs';

/**
 * שלב 2 בכניסה לאדמין: אימות הקוד והנפקת סשן.
 * חמישה ניסיונות לכל קוד, ואז הוא נמחק וצריך לבקש חדש.
 *
 * POST {email, code}          כניסה
 * POST {logout:true}          יציאה
 */

const MAX_TRIES = 5;

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const b = await req.json().catch(() => ({}));

  if (b.logout) return jsonCookie({ ok: true }, cookieHeader('', 0));

  const email = String(b.email || '').trim().toLowerCase();
  const code = String(b.code || '').replace(/\D/g, '');

  if (!email || code.length !== 6) return json({ error: 'קוד לא תקין.' }, 400);
  if (!isAllowed(email)) return json({ error: 'קוד שגוי או שפג תוקפו.' }, 403);

  const st = store('adminauth');
  const key = 'code:' + email;
  const rec = await st.get(key, { type: 'json' });

  if (!rec) return json({ error: 'קוד שגוי או שפג תוקפו.' }, 403);
  if (Date.now() > rec.exp) { await st.delete(key); return json({ error: 'הקוד פג. בקשו קוד חדש.' }, 403); }

  if ((rec.tries || 0) >= MAX_TRIES) {
    await st.delete(key);
    return json({ error: 'יותר מדי ניסיונות. בקשו קוד חדש.' }, 429);
  }

  if (await hashCode(email, code) !== rec.hash) {
    rec.tries = (rec.tries || 0) + 1;
    await st.setJSON(key, rec);
    return json({ error: 'קוד שגוי.', left: MAX_TRIES - rec.tries }, 403);
  }

  await st.delete(key);
  console.log('[admin-verify] כניסה:', email, ip(req));

  const token = await makeSession(email);
  return jsonCookie(
    { ok: true, email, hours: SESSION_HOURS },
    cookieHeader(token, SESSION_HOURS * 3600)
  );
};

export const config = { path: '/api/admin-verify' };
