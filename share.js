/* ===========================================================
   Natural Comfort — שיתוף הדמיה עם מיתוג
   לוקח את תמונת ההדמיה, צורב עליה לוגו + כתובת אתר + סייג,
   ומשתף בוואטסאפ (או מוריד, אם המכשיר לא תומך בשיתוף קבצים).

   שימוש:
     <button id="ncShareBtn" hidden>שלחו את ההדמיה בוואטסאפ</button>
     <script src="share.js"></script>
     <script>
       ncShare.init({
         button: '#ncShareBtn',
         logo:   'logo.png',
         site:   'naturalcomfort.co.il'
       });
     </script>

   וכשההדמיה חוזרת מה-AI:
     ncShare.setImage(url, 'ארון הזזה 3 דלתות');
   =========================================================== */

(function () {
  'use strict';

  var cfg = {
    button: null,
    logo: 'logo.png',
    site: 'naturalcomfort.co.il',
    disclaimer: 'הדמיה · לא מידה סופית',
    maxWidth: 1800
  };

  var currentImage = null;
  var currentTitle = '';
  var btn = null;
  var logoImg = null;
  var busy = false;

  /* ---------- טעינת תמונה עם הרשאת CORS ---------- */
  function loadImage(src, needCors) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      if (needCors) img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('load failed: ' + src)); };
      img.src = src;
    });
  }

  /* ---------- ציור הפס הממותג בתחתית ---------- */
  function brand(img) {
    var scale = Math.min(1, cfg.maxWidth / img.naturalWidth);
    var w = Math.round(img.naturalWidth * scale);
    var h = Math.round(img.naturalHeight * scale);

    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');

    ctx.drawImage(img, 0, 0, w, h);

    /* גובה הפס יחסי לתמונה, עם רצפה ותקרה */
    var bar = Math.max(72, Math.min(150, Math.round(h * 0.11)));
    var y = h - bar;

    var grad = ctx.createLinearGradient(0, y - bar * 0.5, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.45, 'rgba(0,0,0,0.42)');
    grad.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - bar * 0.5, w, bar * 1.5);

    var pad = Math.round(bar * 0.32);
    var mid = y + bar / 2;

    /* לוגו בצד ימין — כיוון הקריאה של המותג */
    if (logoImg) {
      var lh = Math.round(bar * 0.52);
      var lw = Math.round(logoImg.naturalWidth * (lh / logoImg.naturalHeight));
      var maxLw = Math.round(w * 0.34);
      if (lw > maxLw) { lw = maxLw; lh = Math.round(logoImg.naturalHeight * (lw / logoImg.naturalWidth)); }
      ctx.drawImage(logoImg, w - pad - lw, Math.round(mid - lh / 2), lw, lh);
    } else {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.font = '700 ' + Math.round(bar * 0.34) + 'px Arial, sans-serif';
      ctx.fillText('NaturalComfort', w - pad, mid);
    }

    /* כתובת האתר + הסייג בצד שמאל */
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 ' + Math.round(bar * 0.30) + 'px Arial, sans-serif';
    ctx.fillText(cfg.site, pad, mid + Math.round(bar * 0.02));

    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = '400 ' + Math.round(bar * 0.21) + 'px Arial, sans-serif';
    ctx.fillText(cfg.disclaimer, pad, mid + Math.round(bar * 0.30));

    return canvas;
  }

  function canvasToFile(canvas) {
    return new Promise(function (resolve, reject) {
      try {
        canvas.toBlob(function (blob) {
          if (!blob) { reject(new Error('toBlob returned null')); return; }
          resolve(new File([blob], 'natural-comfort.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.92);
      } catch (err) {
        /* קורה כשהתמונה הגיעה משרת שלא מאשר CORS */
        reject(err);
      }
    });
  }

  function whatsappText() {
    var t = 'ההדמיה שלי מנטורל קומפורט';
    if (currentTitle) t += ' — ' + currentTitle;
    return t + '\n' + 'https://' + cfg.site;
  }

  function downloadFile(file) {
    var url = URL.createObjectURL(file);
    var a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function setBusy(state) {
    busy = state;
    if (!btn) return;
    btn.disabled = state;
    if (state) {
      if (!btn.dataset.ncLabel) btn.dataset.ncLabel = btn.textContent;
      btn.textContent = 'מכין את התמונה…';
    } else if (btn.dataset.ncLabel && btn.textContent === 'מכין את התמונה…') {
      btn.textContent = btn.dataset.ncLabel;
    }
  }

  /* הודעה קצרה על הכפתור עצמו — בלי חלונות קופצים */
  function flash(msg, ms) {
    if (!btn) return;
    var keep = btn.dataset.ncLabel || btn.textContent;
    btn.dataset.ncLabel = keep;
    btn.textContent = msg;
    setTimeout(function () { btn.textContent = keep; }, ms || 4000);
  }

  /* העתקה ללוח — מאפשרת הדבקה בוואטסאפ רגיל, ביזנס, או כל אפליקציה */
  function copyToClipboard(canvas) {
    return new Promise(function (resolve, reject) {
      if (!navigator.clipboard || !window.ClipboardItem) { reject(new Error('no clipboard')); return; }
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error('no blob')); return; }
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(resolve, reject);
      }, 'image/png');
    });
  }

  function share() {
    if (busy || !currentImage) return;
    setBusy(true);

    var canvas = null;

    loadImage(currentImage, true)
      .catch(function () { return loadImage(currentImage, false); })
      .then(function (img) { canvas = brand(img); return canvasToFile(canvas); })
      .then(function (file) {
        var canShareFile = navigator.canShare &&
                           navigator.canShare({ files: [file] }) &&
                           navigator.share;

        /* נייד — גיליון השיתוף של המערכת. וואטסאפ וגם וואטסאפ ביזנס מופיעים שם. */
        if (canShareFile) {
          return navigator.share({ files: [file], text: whatsappText() });
        }

        /* מחשב — אי אפשר לצרף קובץ דרך קישור.
           מעתיקים ללוח וגם מורידים, והמשתמש מדביק לאן שהוא רוצה. */
        downloadFile(file);
        return copyToClipboard(canvas)
          .then(function () { flash('הועתק — הדביקו בוואטסאפ ב-Ctrl+V', 6000); })
          .catch(function () { flash('התמונה ירדה — גררו אותה לוואטסאפ', 6000); });
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return; /* המשתמש ביטל */
        console.warn('[ncShare]', err);
        /* הצריבה נכשלה — לפחות מורידים את ההדמיה עצמה */
        var a = document.createElement('a');
        a.href = currentImage;
        a.download = 'natural-comfort.jpg';
        a.target = '_blank';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        flash('התמונה ירדה — גררו אותה לוואטסאפ', 6000);
      })
      .then(function () { setBusy(false); });
  }

  window.ncShare = {
    init: function (options) {
      for (var k in options) { if (options.hasOwnProperty(k)) cfg[k] = options[k]; }

      btn = typeof cfg.button === 'string'
        ? document.querySelector(cfg.button)
        : cfg.button;

      if (btn) {
        btn.addEventListener('click', share);
        btn.hidden = true;
      }

      if (cfg.logo) {
        loadImage(cfg.logo, true)
          .then(function (img) { logoImg = img; })
          .catch(function () { logoImg = null; }); /* נופל לטקסט */
      }
    },

    /* קוראים לזה ברגע שההדמיה חוזרת מה-AI */
    setImage: function (url, title) {
      currentImage = url;
      currentTitle = title || '';
      if (btn) btn.hidden = !url;
    },

    clear: function () {
      currentImage = null;
      currentTitle = '';
      if (btn) btn.hidden = true;
    },

    share: share
  };
})();
