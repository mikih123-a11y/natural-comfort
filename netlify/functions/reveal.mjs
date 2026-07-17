import { store, json } from './_lib.mjs';

/**
 * השער. הוא כאן ולא ב-CSS.
 * בלי סשן מאומת ה-URL לא יוצא מהשרת — גם לא ב-DevTools.
 */
export default async (req) => {
  const u = new URL(req.url);
  const jobId = u.searchParams.get('jobId');
  const session = u.searchParams.get('session');
  if (!jobId || !session) return json({ error: 'חסרים נתונים.' }, 400);

  const ok = await store('sessions').get(`v:${session}`, { type: 'json' });
  if (!ok) return json({ error: 'הסשן לא מאומת.' }, 403);

  const jobs = store('jobs');
  const job = await jobs.get(jobId, { type: 'json' });
  if (!job) return json({ error: 'ההדמיה לא נמצאה או פגה.' }, 404);
  if (job.session !== session) return json({ error: 'ההדמיה לא שייכת לסשן הזה.' }, 403);

  if (!job.verified) await jobs.setJSON(jobId, { ...job, verified: true, revealedAt: Date.now() });
  return json({ url: job.url });
};

export const config = { path: '/api/reveal' };
