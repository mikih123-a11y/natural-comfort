import { store, json, normPhone } from './_lib.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const { phone, code, session } = await req.json().catch(() => ({}));
  if (!phone || !code || !session) return json({ error: 'חסרים נתונים.' }, 400);

  const otp = store('otp');
  const rec = await otp.get(`code:${session}`, { type: 'json' });
  if (!rec) return json({ error: 'לא נמצא קוד פעיל. בקשו קוד חדש.' }, 400);
  if (Date.now() > rec.exp) { await otp.delete(`code:${session}`); return json({ error: 'הקוד פג תוקף. בקשו קוד חדש.' }, 400); }
  if (rec.tries >= 5) { await otp.delete(`code:${session}`); return json({ error: 'יותר מדי ניסיונות. בקשו קוד חדש.' }, 429); }
  if (rec.phone !== normPhone(phone)) return json({ error: 'המספר לא תואם.' }, 400);

  if (rec.code !== String(code).trim()) {
    await otp.setJSON(`code:${session}`, { ...rec, tries: rec.tries + 1 });
    return json({ error: `קוד שגוי. נותרו ${4 - rec.tries} ניסיונות.` }, 400);
  }

  await otp.delete(`code:${session}`);
  await store('sessions').setJSON(`v:${session}`, { phone: rec.phone, at: Date.now() });
  return json({ verified: true });
};

export const config = { path: '/api/otp-verify' };
