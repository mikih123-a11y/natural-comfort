import { getStore } from '@netlify/blobs';

export const store = n => getStore({ name: n, consistency: 'strong' });
export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const ip = req =>
  req.headers.get('x-nf-client-connection-ip') ||
  (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * חסם ניצול. בלי תשלום אין חיכוך — זו ההגנה היחידה על התקציב.
 * שלוש שכבות: לכל IP, לכל סשן, ותקרה יומית גלובלית שנועלת הכל.
 */
export async function guard(req, session) {
  const rl = store('ratelimit');
  const cap = Number(process.env.DAILY_GENERATION_CAP || 300);
  const perIp = Number(process.env.IP_DAILY_LIMIT || 12);
  const perSession = Number(process.env.SESSION_LIMIT || 6);

  const gKey = `global:${today()}`;
  const used = Number((await rl.get(gKey)) || 0);
  if (used >= cap) return 'המערכת הגיעה למכסה היומית. נסו שוב מחר או דברו איתנו בוואטסאפ.';

  const iKey = `ip:${ip(req)}:${today()}`;
  const iUsed = Number((await rl.get(iKey)) || 0);
  if (iUsed >= perIp) return 'הגעתם למכסת ההדמיות להיום. דברו איתנו בוואטסאפ ונמשיך משם.';

  const sKey = `s:${session}`;
  const sUsed = Number((await rl.get(sKey)) || 0);
  if (sUsed >= perSession) return 'הגעתם למכסת ההדמיות לביקור הזה.';

  await Promise.all([
    rl.set(gKey, String(used + 1)),
    rl.set(iKey, String(iUsed + 1)),
    rl.set(sKey, String(sUsed + 1)),
  ]);
  return null;
}

export const normPhone = p => {
  const d = String(p).replace(/\D/g, '');
  if (d.startsWith('972')) return '+' + d;
  if (d.startsWith('0')) return '+972' + d.slice(1);
  return '+' + d;
};
