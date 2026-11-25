/* ===========================================================================
   Epistemic Resonance — page behaviour.

   Three small things: draw the mark's geometry at page scale, run the
   neighbour tabs, and light the rail node for the section you are in.
   No libraries; nothing here is required for the page to be readable.
   ========================================================================= */
(function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- 1. the two antiphase waves, and the nodes where they cross --------- */
  function drawWave(svg) {
    var W = 1200, H = 160, mid = H / 2, amp = 56;
    var lobes = 8;                      // half-periods across the full width
    var step = 4;

    function path(sign) {
      var d = '', x;
      for (x = 0; x <= W; x += step) {
        var y = mid - sign * amp * Math.sin((x / W) * lobes * Math.PI);
        d += (x === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(2);
      }
      return d;
    }

    [['w-ink', 1], ['w-grey', -1]].forEach(function (pair) {
      var p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', path(pair[1]));
      p.setAttribute('class', pair[0]);
      svg.appendChild(p);
      if (!reduce) {
        var len = p.getTotalLength();
        p.style.setProperty('--len', len);
      }
    });

    // the crossings: where the two waves meet is where a critique attaches.
    for (var k = 0; k <= lobes; k++) {
      var c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('cx', (k * W / lobes).toFixed(1));
      c.setAttribute('cy', mid);
      c.setAttribute('r', 11);
      if (!reduce) c.style.setProperty('--d', (0.55 + k * 0.07).toFixed(2) + 's');
      else c.style.opacity = 1;
      svg.appendChild(c);
    }
  }

  var wave = document.getElementById('wave');
  if (wave) { try { drawWave(wave); } catch (e) { wave.remove(); } }

  /* --- 2. neighbour tabs -------------------------------------------------- */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));

  function select(tab) {
    tabs.forEach(function (t) {
      var panel = document.getElementById(t.getAttribute('aria-controls'));
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.setAttribute('tabindex', on ? '0' : '-1');
      if (panel) panel.hidden = !on;
    });
  }

  tabs.forEach(function (tab, i) {
    tab.setAttribute('tabindex', tab.getAttribute('aria-selected') === 'true' ? '0' : '-1');
    tab.addEventListener('click', function () { select(tab); });
    tab.addEventListener('keydown', function (ev) {
      var d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      ev.preventDefault();
      var next = tabs[(i + d + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  });

  /* --- 3. rail: light the node for the section in view -------------------- */
  var links = Array.prototype.slice.call(document.querySelectorAll('.rail a'));
  if (links.length && 'IntersectionObserver' in window) {
    var byId = {};
    links.forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      byId[id] = a.parentElement;
    });

    var seen = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { seen[e.target.id] = e.isIntersecting; });
      var active = null;
      Object.keys(byId).forEach(function (id) {
        if (!active && seen[id]) active = id;
      });
      links.forEach(function (a) {
        a.parentElement.classList.toggle('is-active', a.getAttribute('href') === '#' + active);
      });
    }, { rootMargin: '-72px 0px -62% 0px', threshold: 0 });

    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }
})();
