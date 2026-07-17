import { store, json, guard } from './_lib.mjs';
import catalog from '../../viz/catalog.json' with { type: 'json' };

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

async function falRun(body) {
  const r = await fetch(`https://fal.run/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Key ${FAL}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`fal ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

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

export default async (req, ctx) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!FAL) return json({ error: 'FAL_KEY חסר. הגדירו אותו ב-Netlify → Environment variables.' }, 500);

  const { room, productId, session, aspect } = await req.json().catch(() => ({}));
  if (!room || !productId || !session) return json({ error: 'חסרים נתונים.' }, 400);

  const blocked = await guard(req, session);
  if (blocked) return json({ error: blocked }, 429);

  const p = catalog.products.find(x => x.id === productId);
  if (!p) return json({ error: 'מוצר לא נמצא.' }, 400);

  const site = process.env.URL || new URL(req.url).origin;
  p._absImage = site + p.image;

  const jobs = store('jobs');
  const jobId = crypto.randomUUID();
  const prompt = buildPrompt(p);
  // יחס התמונה נעול ליחס של תמונת החדר. auto נותן למודל רשות למסגר מחדש.
  const ar = nearestAspect(aspect);

  let last = null, report = null;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const out = await falRun({
        prompt,
        image_urls: [room, p._absImage],   // 1 = החדר, 2 = המוצר
        num_images: 1,
        output_format: 'jpeg',
        resolution: '2K',
        aspect_ratio: ar,
        // seed משתנה בכל ניסיון כדי לא לקבל את אותה שגיאה שוב
        seed: Math.floor(Math.random() * 1e9),
      });
      const url = out.images?.[0]?.url || out.image?.url;
      if (!url) throw new Error('fal לא החזיר תמונה');
      last = url;

      report = await verify(url, p);
      if (report.verdict !== 'reject') break;
      console.warn(`[verify] ניסיון ${attempt} נפסל: ${report.reason}`);
    } catch (e) {
      console.error('[generate]', e.message);
      if (attempt === MAX_TRIES) return json({ error: 'הייצור נכשל. נסו שוב.' }, 502);
    }
  }
  if (!last) return json({ error: 'הייצור נכשל. נסו שוב.' }, 502);

  await jobs.setJSON(jobId, {
    url: last, productId, session,
    verified: false, report,
    createdAt: Date.now(),
    // מחיקה אוטומטית — תמונת חדר של אדם היא מידע אישי
    expiresAt: Date.now() + 30 * 864e5,
  });

  // ה-URL לא חוזר עד שיש ליד. השער הוא שרת-צד, לא CSS.
  return json({ jobId, ready: true });
};

export const config = { path: '/api/generate' };
