import { store, json, normPhone, ip } from './_lib.mjs';

const PROVIDER = process.env.OTP_PROVIDER || 'dev';

async function deliver(phone, code) {
  const text = `הקוד שלך לפתיחת ההדמיה: ${code}\n\nNatural Comfort`;

  if (PROVIDER === 'dev') { console.log(`[OTP dev] ${phone} → ${code}`); return; }

  // ספק גנרי — מתאים ל-Green API, 019, Inforu, Make/Zapier, כל דבר שמקבל POST
  if (PROVIDER === 'webhook') {
    const r = await fetch(process.env.OTP_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(process.env.OTP_WEBHOOK_AUTH ? { Authorization: process.env.OTP_WEBHOOK_AUTH } : {}) },
      body: JSON.stringify({ phone, text, code }),
    });
    if (!r.ok) throw new Error(`ספק ה-OTP החזיר ${r.status}`);
    return;
  }

  if (PROVIDER === 'twilio') {
    const { TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM } = process.env;
    const body = new URLSearchParams({
      To: `whatsapp:${phone}`, From: `whatsapp:${TWILIO_FROM}`, Body: text,
    });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!r.ok) throw new Error(`Twilio: ${(await r.text()).slice(0, 120)}`);
    return;
  }

  throw new Error(`OTP_PROVIDER לא מוכר: ${PROVIDER}`);
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const { phone, session } = await req.json().catch(() => ({}));
  if (!phone || !session) return json({ error: 'חסרים נתונים.' }, 400);

  const p = normPhone(phone);
  if (!/^\+972(5\d|7[2-9])\d{7}$/.test(p)) return json({ error: 'מספר נייד ישראלי לא תקין.' }, 400);

  const otp = store('otp');
  const day = new Date().toISOString().slice(0, 10);

  // חסם: מקסימום 5 קודים למספר ליום, 20 ל-IP
  const pk = `sent:${p}:${day}`, ik = `sentip:${ip(req)}:${day}`;
  const pn = Number((await otp.get(pk)) || 0), inum = Number((await otp.get(ik)) || 0);
  if (pn >= 5) return json({ error: 'נשלחו יותר מדי קודים למספר הזה היום.' }, 429);
  if (inum >= 20) return json({ error: 'יותר מדי בקשות. נסו מאוחר יותר.' }, 429);

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await otp.setJSON(`code:${session}`, { phone: p, code, tries: 0, exp: Date.now() + 10 * 60e3 });
  await otp.set(pk, String(pn + 1));
  await otp.set(ik, String(inum + 1));

  try { await deliver(p, code); }
  catch (e) { console.error('[otp]', e.message); return json({ error: 'שליחת הקוד נכשלה. נסו שוב.' }, 502); }

  return json({ sent: true, ...(PROVIDER === 'dev' ? { devCode: code } : {}) });
};

export const config = { path: '/api/otp-send' };
