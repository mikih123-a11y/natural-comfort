import { store, json } from './_lib.mjs';

/** מכירה שנסגרה. בטלפון, אז ידני. המספר הרביעי. */
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const token = req.headers.get('x-stats-token');
  if (!process.env.STATS_TOKEN || token !== process.env.STATS_TOKEN)
    return json({ error: 'לא מורשה.' }, 403);

  const f = store('funnel');
  const n = Number((await f.get('quote_won')) || 0) + 1;
  await f.set('quote_won', String(n));
  return json({ won: n });
};

export const config = { path: '/api/won' };
