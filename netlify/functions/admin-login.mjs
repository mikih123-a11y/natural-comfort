import { store, json, ip } from './_lib.mjs';
import { isAllowed, hashCode, sendMail } from './_auth.mjs';

/**
 * שלב 1 בכניסה לאדמין: בקשת קוד.
 *
 * מגיב אותו דבר בין אם המייל ברשימה הלבנה ובין אם לא —
 * כדי שלא יהיה אפשר לגלות דרך המסך מי מורשה.
 */

const TTL_MIN = 10;
const MAX_PER_HOUR = 5;

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!process.env.ADMIN_SECRET && !process.env.STATS_TOKEN)
    return json({ error: 'השרת לא מוגדר.' }, 500);

  const b = await req.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase();

  const ok = { ok: true, sent: true };   // התשובה האחידה

  if (!email || !email.includes('@')) return json({ error: 'כתובת לא תקינה.' }, 400);
  if (!isAllowed(email)) {
    console.warn('[admin-login] ניסיון ממייל לא מורשה:', email, ip(req));
    return json(ok);
  }

  const st = store('adminauth');

  /* חסם קצב לפי IP */
  const rk = 'rate:' + ip(req) + ':' + new Date().toISOString().slice(0, 13);
  const used = Number((await st.get(rk)) || 0);
  if (used >= MAX_PER_HOUR) return json({ error: 'יותר מדי ניסיונות. נסו בעוד שעה.' }, 429);
  await st.set(rk, String(used + 1));

  /* קוד בן 6 ספרות — נשמר מגובב בלבד */
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await st.setJSON('code:' + email, {
    hash: await hashCode(email, code),
    exp: Date.now() + TTL_MIN * 60e3,
    tries: 0,
    ip: ip(req),
  });

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right;
                max-width:460px;margin:auto;padding:28px;border:1px solid #E2DCD2">
      <div style="font-size:19px;font-weight:700;margin-bottom:18px">Natural Comfort</div>
      <p style="color:#5F584F;margin:0 0 14px">קוד הכניסה למערכת הניהול:</p>
      <div style="font-size:34px;font-weight:700;letter-spacing:.18em;
                  padding:16px;background:#F7F5F1;text-align:center">${code}</div>
      <p style="color:#5F584F;font-size:13px;margin:16px 0 0">
        הקוד תקף ל-${TTL_MIN} דקות. אם לא ביקשתם אותו — התעלמו מההודעה,
        ושקלו להחליף את הסוד בשרת.</p>
    </div>`;

  const sent = await sendMail({
    to: email,
    subject: 'קוד כניסה למערכת הניהול · Natural Comfort',
    html,
  });

  /* אין עדיין Resend? הקוד יופיע בלוג של הפונקציה בנטליפיי */
  if (!sent.ok) console.warn('[admin-login] קוד ל-' + email + ': ' + code + ' (סיבה: ' + sent.reason + ')');

  return json({ ...ok, mail: sent.ok });
};

export const config = { path: '/api/admin-login' };
