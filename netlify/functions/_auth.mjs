/**
 * כניסה לאדמין — קוד חד-פעמי למייל + סשן חתום בעוגייה.
 *
 * אין סיסמה לזכור ואין מה לגנוב מהדפדפן:
 * העוגייה חתומה ב-HMAC על סוד השרת, ותוקפה 12 שעות.
 *
 * הסוד: ADMIN_SECRET, ואם לא הוגדר — STATS_TOKEN.
 * הרשימה הלבנה: ADMIN_EMAILS (מופרד בפסיקים).
 */

const enc = new TextEncoder();

export const SESSION_HOURS = 12;
export const COOKIE = 'nc_admin';

const secret = () => process.env.ADMIN_SECRET || process.env.STATS_TOKEN || '';

export const allowedEmails = () =>
  String(process.env.ADMIN_EMAILS || 'mikiH123@gmail.com')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

export const isAllowed = email =>
  allowedEmails().includes(String(email || '').trim().toLowerCase());

/* ---------- חתימה ---------- */

const b64url = buf =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function key() {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
}

export async function sign(text) {
  const sig = await crypto.subtle.sign('HMAC', await key(), enc.encode(text));
  return b64url(sig);
}

/** גיבוב הקוד — הקוד עצמו לא נשמר בשום מקום */
export async function hashCode(email, code) {
  return sign('code:' + String(email).toLowerCase() + ':' + code);
}

/* ---------- סשן ---------- */

export async function makeSession(email) {
  const payload = JSON.stringify({
    e: String(email).toLowerCase(),
    x: Date.now() + SESSION_HOURS * 3600e3,
  });
  const body = b64url(enc.encode(payload));
  return body + '.' + (await sign(body));
}

export async function readSession(req) {
  if (!secret()) return null;
  const raw = req.headers.get('cookie') || '';
  const hit = raw.split(';').map(s => s.trim())
    .find(s => s.startsWith(COOKIE + '='));
  if (!hit) return null;

  const val = hit.slice(COOKIE.length + 1);
  const dot = val.lastIndexOf('.');
  if (dot < 1) return null;

  const body = val.slice(0, dot), sig = val.slice(dot + 1);
  if (sig !== await sign(body)) return null;         // חתימה לא תואמת

  try {
    const pad = body.replace(/-/g, '+').replace(/_/g, '/');
    const data = JSON.parse(atob(pad));
    if (!data.x || Date.now() > data.x) return null;  // פג תוקף
    if (!isAllowed(data.e)) return null;              // הוסר מהרשימה הלבנה
    return data.e;
  } catch (e) { return null; }
}

export const cookieHeader = (value, maxAge) =>
  `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

export const jsonCookie = (body, cookie, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'set-cookie': cookie },
  });

/* ---------- שליחת מייל ---------- */

export async function sendMail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || 'Natural Comfort <onboarding@resend.dev>';
  if (!apiKey) return { ok: false, reason: 'no-key' };

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'authorization': 'Bearer ' + apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!r.ok) {
      console.error('[mail] resend failed', r.status, await r.text());
      return { ok: false, reason: 'send-failed' };
    }
    return { ok: true };
  } catch (e) {
    console.error('[mail] error', e?.message);
    return { ok: false, reason: 'error' };
  }
}
