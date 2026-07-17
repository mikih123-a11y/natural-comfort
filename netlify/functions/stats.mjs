import { store, json } from './_lib.mjs';

const STAGES = ['upload', 'generate_start', 'generate_done', 'generate_fail',
                'gate_view', 'otp_sent', 'otp_verified', 'lead', 'reveal'];

export default async (req) => {
  const u = new URL(req.url);
  const token = u.searchParams.get('token') || req.headers.get('x-stats-token');
  if (!process.env.STATS_TOKEN) return json({ error: 'STATS_TOKEN לא מוגדר.' }, 500);
  if (token !== process.env.STATS_TOKEN) return json({ error: 'לא מורשה.' }, 403);

  const days = Math.min(Number(u.searchParams.get('days') || 30), 90);
  const f = store('funnel');

  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10);
  }).reverse();

  const daily = await Promise.all(dates.map(async date => {
    const row = { date };
    await Promise.all(STAGES.map(async s => {
      row[s] = Number((await f.get(`${date}:${s}`)) || 0);
    }));
    return row;
  }));

  const total = STAGES.reduce((a, s) => (a[s] = daily.reduce((n, d) => n + d[s], 0), a), {});

  // כמה ארונות נמכרו — נרשם ידנית, כי הסגירה בטלפון
  const won = Number((await f.get('quote_won')) || 0);

  const pct = (a, b) => (b ? +(a / b * 100).toFixed(1) : 0);
  const funnel = {
    uploaded:  total.upload,
    completed: total.generate_done,
    leads:     total.lead,
    won,
    rate_upload_to_done: pct(total.generate_done, total.upload),
    rate_done_to_lead:   pct(total.lead, total.generate_done),
    rate_lead_to_won:    pct(won, total.lead),
    // הנקודה שהכי כואבת: ראו את השער וברחו
    abandoned_at_gate:   Math.max(0, total.generate_done - total.lead),
  };

  return json({ funnel, total, daily });
};

export const config = { path: '/api/stats' };
