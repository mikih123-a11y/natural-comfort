/* ===========================================================
   Natural Comfort — סליידר "לפני / אחרי"
   שימוש:
     <div class="nc-compare"
          data-before="products/room-before.jpg"
          data-after="products/room-after.jpg"></div>
     <script src="compare.js"></script>

   אופציונלי:
     data-label-before="החדר שלך"
     data-label-after="עם הארון"
     data-start="50"        (מיקום התחלתי באחוזים)
   =========================================================== */

(function () {
  'use strict';

  /* ---------- CSS מוזרק אוטומטית, אין צורך בקובץ נפרד ---------- */
  var CSS = ''
    + '.nc-compare{position:relative;width:100%;overflow:hidden;border-radius:14px;'
    + 'background:#eee;user-select:none;-webkit-user-select:none;touch-action:pan-y;'
    + 'direction:ltr;cursor:ew-resize;line-height:0;box-shadow:0 2px 14px rgba(0,0,0,.08)}'
    + '.nc-compare img{display:block;width:100%;height:auto;pointer-events:none;-webkit-user-drag:none}'
    + '.nc-compare .nc-after{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}'
    + '.nc-compare .nc-clip{position:absolute;inset:0;overflow:hidden;will-change:width}'
    + '.nc-compare .nc-handle{position:absolute;top:0;bottom:0;width:3px;background:#fff;'
    + 'box-shadow:0 0 0 1px rgba(0,0,0,.15);transform:translateX(-50%);will-change:left}'
    + '.nc-compare .nc-grip{position:absolute;top:50%;left:50%;width:44px;height:44px;'
    + 'margin:-22px 0 0 -22px;border-radius:50%;background:#fff;'
    + 'box-shadow:0 2px 10px rgba(0,0,0,.28);display:flex;align-items:center;'
    + 'justify-content:center;gap:5px}'
    + '.nc-compare .nc-grip span{display:block;width:0;height:0;border-top:6px solid transparent;'
    + 'border-bottom:6px solid transparent}'
    + '.nc-compare .nc-grip .nc-l{border-right:7px solid #1a1a1a}'
    + '.nc-compare .nc-grip .nc-r{border-left:7px solid #1a1a1a}'
    + '.nc-compare .nc-tag{position:absolute;top:12px;padding:5px 12px;border-radius:999px;'
    + 'background:rgba(0,0,0,.62);color:#fff;font:600 13px/1.4 system-ui,"Segoe UI",Arial,sans-serif;'
    + 'letter-spacing:.2px;pointer-events:none;direction:rtl;backdrop-filter:blur(4px)}'
    + '.nc-compare .nc-tag-before{right:12px}'
    + '.nc-compare .nc-tag-after{left:12px}'
    + '.nc-compare:focus-visible{outline:3px solid #2b6cb0;outline-offset:3px}'
    + '.nc-compare .nc-hint{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);'
    + 'padding:5px 14px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;'
    + 'font:500 12px/1.4 system-ui,"Segoe UI",Arial,sans-serif;direction:rtl;'
    + 'pointer-events:none;transition:opacity .35s ease}'
    + '.nc-compare.nc-touched .nc-hint{opacity:0}'
    + '@media (prefers-reduced-motion:reduce){.nc-compare .nc-hint{transition:none}}';

  function injectCSS() {
    if (document.getElementById('nc-compare-css')) return;
    var s = document.createElement('style');
    s.id = 'nc-compare-css';
    s.appendChild(document.createTextNode(CSS));
    document.head.appendChild(s);
  }

  function build(el) {
    if (el.dataset.ncReady) return;
    el.dataset.ncReady = '1';

    var beforeSrc = el.getAttribute('data-before');
    var afterSrc = el.getAttribute('data-after');
    if (!beforeSrc || !afterSrc) return;

    var labelBefore = el.getAttribute('data-label-before') || 'לפני';
    var labelAfter = el.getAttribute('data-label-after') || 'אחרי';
    var start = parseFloat(el.getAttribute('data-start'));
    if (isNaN(start)) start = 50;

    el.innerHTML = ''
      + '<img class="nc-base" src="' + beforeSrc + '" alt="' + labelBefore + '">'
      + '<div class="nc-clip"><img class="nc-after" src="' + afterSrc + '" alt="' + labelAfter + '"></div>'
      + '<div class="nc-tag nc-tag-before">' + labelBefore + '</div>'
      + '<div class="nc-tag nc-tag-after">' + labelAfter + '</div>'
      + '<div class="nc-handle"><div class="nc-grip"><span class="nc-l"></span><span class="nc-r"></span></div></div>'
      + '<div class="nc-hint">גררו כדי להשוות</div>';

    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-label', 'השוואה בין ' + labelBefore + ' ל' + labelAfter);
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', '100');

    var clip = el.querySelector('.nc-clip');
    var handle = el.querySelector('.nc-handle');
    var afterImg = el.querySelector('.nc-after');
    var pos = start;
    var dragging = false;

    /* התמונה השנייה חייבת להישאר ברוחב המלא של המכל,
       אחרת החיתוך "מועך" אותה במקום לחשוף אותה בהדרגה */
    function sizeAfter() {
      afterImg.style.width = el.clientWidth + 'px';
      afterImg.style.height = el.clientHeight + 'px';
    }

    function render() {
      clip.style.width = pos + '%';
      handle.style.left = pos + '%';
      el.setAttribute('aria-valuenow', Math.round(pos));
    }

    /* חישוב לפי מיקום אמיתי במסך — לא לפי אחוזים של המסמך.
       זה מה שמונע את השבירה בעמוד RTL. */
    function setFromClientX(clientX) {
      var r = el.getBoundingClientRect();
      if (!r.width) return;
      var p = ((clientX - r.left) / r.width) * 100;
      pos = Math.max(0, Math.min(100, p));
      render();
    }

    function markTouched() { el.classList.add('nc-touched'); }

    function down(e) {
      dragging = true;
      markTouched();
      setFromClientX(e.touches ? e.touches[0].clientX : e.clientX);
      if (!e.touches) e.preventDefault();
    }
    function move(e) {
      if (!dragging) return;
      setFromClientX(e.touches ? e.touches[0].clientX : e.clientX);
      if (e.touches) e.preventDefault();
    }
    function up() { dragging = false; }

    el.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);

    el.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);

    /* מקלדת — חצים. בעמוד RTL הכיוון הוויזואלי נשמר. */
    el.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 10 : 2;
      if (e.key === 'ArrowLeft') { pos = Math.max(0, pos - step); }
      else if (e.key === 'ArrowRight') { pos = Math.min(100, pos + step); }
      else if (e.key === 'Home') { pos = 0; }
      else if (e.key === 'End') { pos = 100; }
      else return;
      e.preventDefault();
      markTouched();
      render();
    });

    afterImg.addEventListener('load', sizeAfter);
    window.addEventListener('resize', sizeAfter);
    if (window.ResizeObserver) new ResizeObserver(sizeAfter).observe(el);

    sizeAfter();
    render();
  }

  function initAll() {
    injectCSS();
    var nodes = document.querySelectorAll('.nc-compare');
    for (var i = 0; i < nodes.length; i++) build(nodes[i]);
  }

  /* חושף פונקציה לשימוש אחרי שההדמיה חוזרת מה-AI */
  window.ncCompare = {
    init: initAll,
    create: function (container, beforeSrc, afterSrc, opts) {
      opts = opts || {};
      injectCSS();
      container.className = 'nc-compare';
      container.setAttribute('data-before', beforeSrc);
      container.setAttribute('data-after', afterSrc);
      if (opts.labelBefore) container.setAttribute('data-label-before', opts.labelBefore);
      if (opts.labelAfter) container.setAttribute('data-label-after', opts.labelAfter);
      container.removeAttribute('data-nc-ready');
      build(container);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
