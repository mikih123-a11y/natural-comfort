import { store, json } from './_lib.mjs';

/**
 * ארבעת המספרים. הכל שאר האתר הוא רעש.
 *   upload → generate_done → lead → (quote_won, נרשם ידנית)
 * מונים בלבד. בלי IP, בלי מזהה אישי — זו מדידה, לא מעקב.
 */
const STAGES = ['upload', 'generate_start', 'generate_done', 'generate_fail',
                'gate_view', 'otp_sent', 'otp_verified', 'lead', 'reveal'];

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const { stage, productId } = await req.json().catch(() => ({}));
  if (!STAGES.includes(stage)) return json({ error: 'stage לא מוכר' }, 400);

  const f = store('funnel');
  const day = new Date().toISOString().slice(0, 10);
  const keys = [`${day}:${stage}`];
  if (productId) keys.push(`${day}:p:${productId}:${stage}`);

  await Promise.all(keys.map(async k => {
    const n = Number((await f.get(k)) || 0);
    await f.set(k, String(n + 1));
  }));

  return json({ ok: true });
};

export const config = { path: '/api/track' };
