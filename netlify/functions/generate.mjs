import { store, json, guard } from './_lib.mjs';
import catalog from '../../viz/viz-catalog.json' with { type: 'json' };

const FAL = process.env.FAL_KEY;
const MODEL = process.env.FAL_MODEL || 'fal-ai/nano-banana-pro/edit';
const VERIFY = process.env.VERIFY_ENABLED !== 'false';
const MAX_TRIES = Number(process.env.MAX_TRIES || 3);

/**
 * הפרומפט. זה הלב.
 * מכויל מול הרצה אמיתית שעבדה — לא ניחוש.
 * שני ממצאים שהוא מקודד:
 *   1. המשימה היא החלפה, לא הוספה — כשיש מה להחליף.
 *   2. הסכנה הגדולה: המודל גורר את הסצנה של הרנדר במקום רק את המוצר.
 * המשימה משתנה לפי סוג המוצר, ולכן היא נקראת מהקטלוג ולא מקודדת כאן.
 */
const PLACEMENT = {
  against_wall: 'standing flat on the floor against the wall, back flush to it.',
  floor_center: 'standing on the floor in the open part of the room, not pushed against any wall.',
  on_bed_frame: 'resting on top of the existing bed frame, replacing whatever is currently on it.',
  in_niche:     'built into the alcove or recess, fitted wall to wall within it.',
  // מיטה: הראש לקיר, הגוף נמשך אל תוך החדר על הרצפה
  headboard_to_wall: 'standing on the floor with the headboard flat against the wall, the bed extending forward into the room across the floor, both long sides visible.',
};

function buildPrompt(p) {
  const i = p.identity || {};
  const noun = p.category || 'furniture unit';
  const where = PLACEMENT[p.placement] || PLACEMENT.against_wall;

  // יש מה להחליף → החלפה. אין → הוספה. שתי משימות שונות לגמרי.
  const task = p.replaces
    ? `THE REPLACEMENT:
If a ${p.replaces} already stands in the room, remove it completely and put the new ${noun} in its place — same position, same footprint.
Reconstruct whatever the old one was hiding — wall, wallpaper texture, skirting, floor — continuing naturally from the surrounding surfaces. No ghost, no smear, no patch.
If there is nothing to replace, place the new ${noun} in the most natural free position for a ${noun} in this room.
There must be exactly ONE ${noun} of this kind in the output.`
    : `THE ADDITION:
Add the ${noun} to the room. Do not remove or replace any existing furniture — it is an addition.
Place it in the most natural free position for a ${noun} in this room, ${where}
It must not overlap or intersect anything already there.`;

  const spec = [
    i.door_count != null && `- Exactly ${i.door_count} ${i.door_type || ''} doors.`.replace('  ', ' '),
    i.panel_seams_per_door ? `- ${i.panel_seams_per_door} horizontal panel seams per door, evenly spaced.` : null,
    i.frame_color && i.frame_color !== 'none' && `- ${i.frame_color} frame and track, slim profile.`,
    i.glass_doors && '- Glass door panels, as in the reference.',
    i.headboard && `- ${i.headboard} headboard.`,
    i.legs && `- Legs: ${i.legs}.`,
    p.finish && `- Finish: ${p.finish}. Match material, colour and grain to the reference.`,
    i.has_tv_niche && `- Recessed screen niche on the ${i.tv_niche_position}, screen switched off — plain dark panel. No content, no logos.`,
  ].filter(Boolean).join('\n');

  return `Put the ${noun} from the second image into the room photograph (first image).

THE CAMERA DOES NOT MOVE:
Output the first image. Same crop, same framing, same focal length, same viewpoint, same perspective. Do not zoom, re-frame or recompose. Do not turn this into a product photo.

${task}
Position: ${where}

TAKE THE PRODUCT ONLY — NOT ITS SCENE:
The second image is a product render placed in a staged room. Take ONLY the ${noun} itself: its geometry, doors, colour, finish, materials, proportions.
IGNORE everything else in that image — its room, walls, floor, lighting, window, styling, props, chairs, decorations. None of that comes across. The first image's room is the only room.

THE ROOM IS NOT YOURS TO EDIT:
Every existing object — bed, desk, chair, clutter, boxes, cables, rug, curtains, door, window, lighting — stays EXACTLY as it is. Do not tidy. Do not restyle. Do not clean up. You are placing one object in a photograph, nothing else.
Anything standing in front of the ${noun} must still occlude it correctly.

THE PRODUCT — COPY THE SECOND IMAGE EXACTLY:
${spec}
- ADD NOTHING. If it is not visible in the reference image, it does not exist.

LIGHT:
Relight the new unit to match the room's own light direction, colour temperature and intensity. Contact shadow at the floor line, soft occlusion where it meets the wall. Same grain and depth of field as the photo.

Output: the first image, everything else untouched, containing this ${noun}.`;
}

/** היחס הנתמך הקרוב ביותר לתמונת החדר. שומר על המסגור. */
function nearestAspect(a) {
  const opts = { '1:1':1, '3:4':0.75, '4:3':1.333, '9:16':0.5625, '16:9':1.777, '2:3':0.667, '3:2':1.5 };
  if (!a || !isFinite(a)) return '3:4';
  return Object.entries(opts).sort((x, y) => Math.abs(x[1]-a) - Math.abs(y[1]-a))[0][0];
}

/**
 * שליחה לתור של fal במקום המתנה סינכרונית.
 * פונקציה רגילה בנטליפיי נחתכת ב-30 שניות וההדמיה לוקחת יותר,
 * ולכן אנחנו מוסרים את העבודה, חוזרים מיד, ושואלים אחר כך אם היא מוכנה.
 * שומרים את הכתובות כפי שהתקבלו ולא בונים אותן, כי לדגם עם נתיב
 * מלא כמו nano-banana-pro/edit הכתובות אינן נגזרות ישירות מהשם.
 */
async function falSubmit(body) {
  const r = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Key ${FAL}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`fal submit ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const q = await r.json();
  if (!q.status_url || !q.response_url) throw new Error('fal לא החזיר כתובות תור');
  return q;
}

async function falGet(url) {
  const r = await fetch(url, { headers: { Authorization: `Key ${FAL}` } });
  if (!r.ok) throw new Error(`fal ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/* גוף הבקשה זהה בכל ניסיון חוץ מה-seed, שמשתנה כדי לא לחזור על אותה שגיאה.
   בהשוואת גימורים דווקא כן שולחים seed קבוע, כדי שכל הגימורים
   ייצאו מאותה נקודת מבט ואפשר יהיה להשוות ביניהם. */
const falBody = (prompt, room, prodImg, ar, seed) => ({
  prompt,
  image_urls: [room, prodImg],   // 1 = החדר, 2 = המוצר
  num_images: 1,
  output_format: 'jpeg',
  resolution: '2K',
  aspect_ratio: ar,
  seed,
});

/**
 * שכבת האימות. עולה גרושים, וזה מה שמונע ארון עם 3 דלתות במקום 2.
 */
async function verify(outUrl, p) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !VERIFY) return { verdict: 'skip' };
  const i = p.identity || {};
  // 80% זה הרף. פוסלים רק על זהות מוצר שגויה — לא על חוסר שלמות.
  if (i.door_count == null) return { verdict: 'skip' };
  const q = `Compare the closet in image A (generated) against the reference product in image B.
Answer ONLY with JSON, no markdown:
{"door_count_seen":<int>,"door_count_match":<bool>,"finish_match":<bool>,"frame_match":<bool>,"floating_or_clipping":<bool>,"room_altered":<bool>,"verdict":"pass"|"reject","reason":"<12 words max>"}
Reference truth: ${i.door_count} ${i.door_type} doors, ${p.finish} finish.
Reject if door count differs, finish is wrong, the closet floats/clips, or the room was restyled.`;

  const toB64 = async u => {
    const b = await (await fetch(u)).arrayBuffer();
    return Buffer.from(b).toString('base64');
  };
  const [a, b] = await Promise.all([toB64(outUrl), toB64(p._absImage)]);

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: q },
          { inline_data: { mime_type: 'image/jpeg', data: a } },
          { inline_data: { mime_type: 'image/jpeg', data: b } },
        ]}],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    }
  );
  if (!r.ok) return { verdict: 'skip' };
  const d = await r.json();
  try { return JSON.parse(d.candidates[0].content.parts[0].text); }
  catch { return { verdict: 'skip' }; }
}

/* ---------- שלבים שמוצגים ללקוח. אמיתיים, לא הצגה ---------- */
const STAGE = {
  queued:   'ממתין בתור',
  working:  'מרכיב את הרהיט בחדר שלכם',
  verify:   'בודק שהתוצאה נאמנה לדגם',
  retry:    'התוצאה לא הייתה מדויקת. מנסה שוב',
};

/* ---------- שליחת עבודה חדשה לתור ---------- */
async function submitJob({ room, p, ar, prompt, session, jobs, jobId, attempt, seed }) {
  const q = await falSubmit(falBody(prompt, room, p._absImage, ar, seed));
  await jobs.setJSON(jobId, {
    statusUrl: q.status_url, responseUrl: q.response_url,
    productId: p.id, session, room, ar, prompt, seed,
    attempt, state: 'queued', url: null, verified: false, report: null,
    createdAt: Date.now(),
    // מחיקה אוטומטית — תמונת חדר של אדם היא מידע אישי
    expiresAt: Date.now() + 30 * 864e5,
  });
  return jobId;
}

export default async (req, ctx) => {
  if (!FAL) return json({ error: 'FAL_KEY חסר. הגדירו אותו ב-Netlify → Environment variables.' }, 500);
  const jobs = store('jobs');

  /* ============ בדיקת מצב ============ */
  if (req.method === 'GET') {
    const u = new URL(req.url);
    const jobId = u.searchParams.get('jobId') || '';
    const session = u.searchParams.get('session') || '';
    if (!jobId || !session) return json({ error: 'חסרים נתונים.' }, 400);

    const j = await jobs.get(jobId, { type: 'json' }).catch(() => null);
    if (!j || j.session !== session) return json({ error: 'עבודה לא נמצאה.' }, 404);
    if (j.state === 'done')   return json({ jobId, status: 'ready', ready: true });
    if (j.state === 'failed') return json({ error: 'הייצור נכשל. נסו שוב.' }, 502);

    let st;
    try { st = await falGet(j.statusUrl); }
    catch (e) { return json({ status: 'working', stage: STAGE.working }); }

    const s = st.status;
    if (s === 'IN_QUEUE')    return json({ status: 'working', stage: STAGE.queued });
    if (s === 'IN_PROGRESS') return json({ status: 'working', stage: STAGE.working });
    if (s !== 'COMPLETED')   return json({ status: 'working', stage: STAGE.working });

    /* הסתיים אצל fal — מושכים את התוצאה ובודקים אותה */
    let url = null;
    try {
      const out = await falGet(j.responseUrl);
      url = out.images?.[0]?.url || out.image?.url || null;
    } catch (e) { console.error('[generate] response', e.message); }

    if (!url) {
      j.state = 'failed';
      await jobs.setJSON(jobId, j);
      return json({ error: 'הייצור נכשל. נסו שוב.' }, 502);
    }

    const report = await verify(url, catalog.products.find(x => x.id === j.productId) || {});

    /* נפסל ונשארו ניסיונות — שולחים עוד אחד ומדווחים שממשיכים */
    if (report && report.verdict === 'reject' && j.attempt < MAX_TRIES) {
      console.warn(`[verify] ניסיון ${j.attempt} נפסל: ${report.reason}`);
      const p = catalog.products.find(x => x.id === j.productId);
      const site = process.env.URL || new URL(req.url).origin;
      p._absImage = site + p.image;
      try {
        await submitJob({ room: j.room, p, ar: j.ar, prompt: j.prompt,
                          session, jobs, jobId, attempt: j.attempt + 1,
                          seed: Math.floor(Math.random() * 1e9) });
        return json({ status: 'working', stage: STAGE.retry });
      } catch (e) { console.error('[generate] retry', e.message); }
    }

    j.state = 'done'; j.url = url; j.report = report;
    await jobs.setJSON(jobId, j);
    // ה-URL לא חוזר עד שיש ליד. השער הוא שרת-צד, לא CSS.
    return json({ jobId, status: 'ready', ready: true });
  }

  /* ============ פתיחת עבודה ============ */
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const { room, productId, session, aspect, seed } = await req.json().catch(() => ({}));
  if (!room || !productId || !session) return json({ error: 'חסרים נתונים.' }, 400);

  const blocked = await guard(req, session);
  if (blocked) return json({ error: blocked }, 429);

  const p = catalog.products.find(x => x.id === productId);
  if (!p) return json({ error: 'מוצר לא נמצא.' }, 400);

  const site = process.env.URL || new URL(req.url).origin;
  p._absImage = site + p.image;

  const jobId = crypto.randomUUID();
  // יחס התמונה נעול ליחס של תמונת החדר. auto נותן למודל רשות למסגר מחדש.
  const ar = nearestAspect(aspect);
  // seed מהלקוח = השוואת גימורים באותה נקודת מבט. אחרת אקראי.
  const useSeed = Number.isInteger(seed) ? seed : Math.floor(Math.random() * 1e9);

  try {
    await submitJob({ room, p, ar, prompt: buildPrompt(p), session, jobs, jobId,
                      attempt: 1, seed: useSeed });
  } catch (e) {
    console.error('[generate] submit', e.message);
    return json({ error: 'הייצור נכשל. נסו שוב.' }, 502);
  }

  return json({ jobId, status: 'queued', stage: STAGE.queued, seed: useSeed });
};

export const config = { path: '/api/generate' };
