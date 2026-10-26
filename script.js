const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(hover: none)').matches;

/* ---------- Header, Menü ---------- */
const header = $('#header');
const nav = $('#nav');
const toggle = $('.nav-toggle');
addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 30), { passive: true });
/* Papier | Blaupause wandert in den Kopf, sobald die Hero-Leiste aus dem Bild ist */
(function offHero() {
  const top = document.getElementById('top');
  const root = document.documentElement;
  if (!top || !('IntersectionObserver' in window)) { root.classList.add('off-hero'); return; }
  new IntersectionObserver(([e]) => root.classList.toggle('off-hero', !e.isIntersecting)).observe(top);
})();
toggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', open);
  toggle.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
  document.body.style.overflow = open ? 'hidden' : '';
});
nav.addEventListener('click', e => {
  if (e.target.closest('a')) {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', false);
    document.body.style.overflow = '';
  }
});

/* ---------- Punktwolke im Hero ---------- */
(function pointCloud() {
  const canvas = $('#cloud');
  const ctx = canvas.getContext('2d');
  const hero = $('.hero');
  const hudPct = $('#hudPct'), hudBar = $('#hudBar'), hudPts = $('#hudPts'), hudZoom = $('#hudZoom'), hudZoomBar = $('#hudZoomBar');
  const REAL_POINTS = 16386303;            // Punkte des echten Scan-Ausschnitts, nur für die Anzeige
  const rnd = (a, b) => a + Math.random() * (b - a);

  // Datenformat: Meter, Z zeigt nach oben, Mittelpunkt bei 0/0
  let cloud = null;
  let EA = 22, EB = 15, camZ = 70, zMid = 4, perM = 0.0145, perMsmall = 0.022;

  /* Ersatz: gebautes Punktwolken-Haus, falls die echte Wolke nicht lädt */
  function buildHouse() {
    const N = innerWidth < 760 ? 3600 : 9000;
    const X = new Float32Array(N), Y = new Float32Array(N), Z = new Float32Array(N), C = new Uint8Array(N * 3);
    const edges = [
      [-1.6, 0, 1, 1.6, 0, 1], [1.6, 0, 1, 1.6, 0, -1], [1.6, 0, -1, -1.6, 0, -1], [-1.6, 0, -1, -1.6, 0, 1],
      [-1.6, 1.2, 1, 1.6, 1.2, 1], [1.6, 1.2, 1, 1.6, 1.2, -1], [1.6, 1.2, -1, -1.6, 1.2, -1], [-1.6, 1.2, -1, -1.6, 1.2, 1],
      [-1.6, 0, 1, -1.6, 1.2, 1], [1.6, 0, 1, 1.6, 1.2, 1], [1.6, 0, -1, 1.6, 1.2, -1], [-1.6, 0, -1, -1.6, 1.2, -1],
      [-1.7, 1.95, 0, 1.7, 1.95, 0], [-1.7, 1.2, 1.1, -1.7, 1.95, 0], [-1.7, 1.2, -1.1, -1.7, 1.95, 0],
      [1.7, 1.2, 1.1, 1.7, 1.95, 0], [1.7, 1.2, -1.1, 1.7, 1.95, 0], [-1.7, 1.2, 1.1, 1.7, 1.2, 1.1], [-1.7, 1.2, -1.1, 1.7, 1.2, -1.1]
    ];
    const col = { edge: [255, 244, 190], wall: [241, 210, 82], roof: [241, 120, 82], floor: [120, 130, 140] };
    let i = 0;
    const put = (x, y, z, k) => { X[i] = x * 6; Y[i] = z * 6; Z[i] = y * 6; C[i * 3] = col[k][0]; C[i * 3 + 1] = col[k][1]; C[i * 3 + 2] = col[k][2]; i++; };
    while (i < N * 0.35) {
      const e = edges[Math.floor(Math.random() * edges.length)], t = Math.random(), j = .012;
      put(e[0] + (e[3] - e[0]) * t + rnd(-j, j), e[1] + (e[4] - e[1]) * t + rnd(-j, j), e[2] + (e[5] - e[2]) * t + rnd(-j, j), 'edge');
    }
    while (i < N) {
      const r = Math.random();
      if (r < .2) put(rnd(-3.2, 3.2), 0, rnd(-2.2, 2.2), 'floor');
      else if (r < .7) { const w = Math.floor(Math.random() * 4), y = rnd(0, 1.2); w < 2 ? put(rnd(-1.6, 1.6), y, w ? 1 : -1, 'wall') : put(w === 2 ? -1.6 : 1.6, y, rnd(-1, 1), 'wall'); }
      else { const s = Math.random() < .5 ? 1 : -1, t = Math.random(); put(rnd(-1.7, 1.7), 1.2 + (1 - t) * .75, s * t * 1.1, 'roof'); }
    }
    return { n: N, X, Y, Z, C, R: new Uint8Array(N), real: false };
  }

  /* Echte Wolke aus cloud.bin: uint32 Anzahl, dann je Punkt int16 x,y,z (cm) und uint8 r,g,b */
  async function loadReal() {
    const res = await fetch('cloud.bin');
    if (!res.ok) throw new Error(res.status);
    const buf = await res.arrayBuffer();
    const dv = new DataView(buf);
    const total = dv.getUint32(0, true);
    const n = innerWidth < 760 ? Math.floor(total * 0.5) : total;   // Reihenfolge in der Datei ist gemischt, also gleichmäßig ausgedünnt
    const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i;
    const xs = new Float32Array(total);
    for (let i = 0; i < total; i++) xs[i] = dv.getInt16(4 + i * 9, true) / 100;
    idx.sort((a, b) => xs[a] - xs[b]);   // von links nach rechts, für den Scan-Aufbau
    const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n), C = new Uint8Array(n * 3), R = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      const o = 4 + idx[k] * 9;
      R[k] = Math.floor(idx[k] * 256 / total);
      X[k] = dv.getInt16(o, true) / 100; Y[k] = dv.getInt16(o + 2, true) / 100; Z[k] = dv.getInt16(o + 4, true) / 100;
      C[k * 3] = dv.getUint8(o + 6); C[k * 3 + 1] = dv.getUint8(o + 7); C[k * 3 + 2] = dv.getUint8(o + 8);
    }
    return { n, X, Y, Z, C, R, real: true };
  }

  let W, H, rs, shiftX = 0, img, buf32, yaw = -0.55, mx = 0, my = 0, sweep = reduceMotion ? 1 : 0, visible = true, last = 0, lastDraw = 0, scrollP = 0, running = false, hudTick = 0;

  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    if (!W || !H) return;   // Fläche noch nicht sichtbar oder ohne Größe: später erneut versuchen, sonst bricht das ganze Skript ab
    /* Auf breiten Bildschirmen rückt der Text mit dem gemeinsamen Seitenrand nach innen; das Haus rückt ein Stück mit */
    const hi = hero.querySelector('.hero-inner');
    shiftX = hi ? Math.max(0, parseFloat(getComputedStyle(hi).paddingLeft) - 0.06 * W) * 0.6 : 0;
    rs = Math.max(0.6, Math.min(devicePixelRatio || 1, 1.5, 1300 / W));
    canvas.width = Math.round(W * rs); canvas.height = Math.round(H * rs);
    img = ctx.createImageData(canvas.width, canvas.height);
    buf32 = new Uint32Array(img.data.buffer);
  }
  resize(); addEventListener('resize', resize);
  hero.addEventListener('pointermove', e => { mx = (e.clientX / innerWidth - .5) * 2; my = (e.clientY / innerHeight - .5) * 2; });

  /* Steuerung: Scrollen zoomt (die Startansicht bleibt dabei stehen), Ziehen dreht */
  let zoom = 1, zoomT = 1, dragYaw = 0, dragPitch = 0;
  const dichte = new URLSearchParams(location.search).get('dichte');
  const ZMAX = 3.2, tip = $('.cloud-tip'), saveData = !!(navigator.connection && navigator.connection.saveData);
  /* Zoom-Anzeige im Scan-Kasten: 100 % = Startansicht, mit dem Scrollen bis ZMAX */
  let hudZLast = -1;
  const hudZ = () => {
    const v = Math.round(zoom * 100);
    if (v === hudZLast || !hudZoom) return;
    hudZLast = v;
    hudZoom.textContent = String(v).padStart(3, '0');
    hudZoomBar.style.width = Math.max(0, Math.min(1, (zoom - 1) / (ZMAX - 1))) * 100 + '%';
  };
  const used = () => { morphAuto = false; if (tip) tip.classList.add('used'); };      // jede Bedienung beendet die automatische Führung
  if (tip && matchMedia('(hover: none)').matches) tip.textContent = 'Nach unten wischen: ins Haus zoomen · seitlich: drehen';
  const trackLen = () => Math.max(1, hero.offsetHeight - innerHeight);
  const scrollProgress = () => Math.max(0, Math.min(1, scrollY / trackLen()));
  let dragging = null;
  hero.addEventListener('pointerdown', e => {
    if (e.button > 0 || e.target.closest('a, button, input')) return;
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  hero.addEventListener('pointermove', e => {
    if (!dragging || dragging.id !== e.pointerId) return;
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) { dragging = null; return; }
    dragYaw += (e.clientX - dragging.x) * 0.006;
    dragPitch = Math.max(-0.7, Math.min(0.45, dragPitch + (e.clientY - dragging.y) * 0.004));
    dragging.x = e.clientX; dragging.y = e.clientY; used();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => hero.addEventListener(ev, e => { if (dragging && dragging.id === e.pointerId) dragging = null; }));
  /* Pfeiltasten links/rechts drehen das Haus (hoch/runter zoomen über das normale Scrollen) */
  let keyDir = 0;
  const typing = t => t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable);
  addEventListener('keydown', e => {
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.ctrlKey || e.metaKey || typing(e.target) || !visible || scrollY > hero.offsetHeight) return;
    keyDir = e.key === 'ArrowLeft' ? -1 : 1; used(); e.preventDefault();
  });
  addEventListener('keyup', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') keyDir = 0; });
  addEventListener('blur', () => { keyDir = 0; });
  const nudge = dir => { scrollBy({ top: dir * trackLen() * 0.2, behavior: 'smooth' }); used(); };
  $('#zoomIn')?.addEventListener('click', () => nudge(1));
  $('#zoomOut')?.addEventListener('click', () => nudge(-1));

  function start() { if (!running && visible && !document.hidden) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; start(); }).observe(hero);
  document.addEventListener('visibilitychange', start);

  // Erst die echte Wolke laden (höchstens 3,5 Sekunden), sonst das gebaute Haus zeigen
  const giveUp = new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 3500));
  Promise.race([loadReal(), giveUp])
    .then(c => { EA = 21; EB = 13.5; camZ = 80; zMid = 2.2; cloud = c; })
    .catch(() => { cloud = buildHouse(); });

  /* Innenleben: wird nachgeladen, sobald man zoomt (oder auf großen Bildschirmen nach dem Scan-Aufbau) */
  let inner = null, innerLoading = false;
  let mp = 0, mpTarget = 0, morphAuto = true, morphWait = 0;   // Verwandlung Scan (0) -> Zeichnung (1)
  async function loadInner() {
    if (inner || innerLoading) return;
    innerLoading = true;
    try {
      const res = await fetch('innen.bin');
      if (!res.ok) throw new Error(res.status);
      const dv = new DataView(await res.arrayBuffer());
      const total = dv.getUint32(0, true);
      const n = innerWidth < 760 ? Math.floor(total * 0.5) : total;
      const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n), C = new Uint8Array(n * 3);
      for (let k = 0; k < n; k++) {
        const o = 4 + k * 9;
        X[k] = dv.getInt16(o, true) / 100; Y[k] = dv.getInt16(o + 2, true) / 100; Z[k] = dv.getInt16(o + 4, true) / 100;
        C[k * 3] = dv.getUint8(o + 6); C[k * 3 + 1] = dv.getUint8(o + 7); C[k * 3 + 2] = dv.getUint8(o + 8);
      }
      inner = { n, X, Y, Z, C, spacing: 0.09 * (total / n) ** 0.5 };
    } catch (err) { innerLoading = false; }
  }

  /* Zeichnung: Wände, Schraffur, Dachhöhenlinien, Maßketten, Achsen und Koten aus echten Scan-Daten (zeichnung.json) */
  let draw = null, drawLoading = false;
  async function loadDrawing() {
    if (draw || drawLoading) return;
    drawLoading = true;
    try {
      const res = await fetch('zeichnung.json');
      if (!res.ok) throw new Error(res.status);
      const j = await res.json();
      const F = j.floor, T = j.top;
      let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
      const walls = [];
      const wob = (a, b) => {          // Linie in kleine Stücke teilen, jedes Stück leicht wackeln lassen (wie von Hand gezeichnet)
        const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.round(L / 0.8)), pts = [];
        for (let i = 0; i <= n; i++) {
          const u = i / n, e = (i === 0 || i === n) ? 0.4 : 1;
          pts.push([a[0] + (b[0] - a[0]) * u + rand() * 0.05 * e, a[1] + (b[1] - a[1]) * u + rand() * 0.05 * e, a[2] + (b[2] - a[2]) * u + rand() * 0.04 * e]);
        }
        return pts;
      };
      j.walls.sort((p, q) => Math.min(p[0], p[2]) - Math.min(q[0], q[2]));
      for (const s of j.walls) {
        walls.push(wob([s[0], s[1], F], [s[2], s[3], F]), wob([s[0], s[1], T], [s[2], s[3], T]));
        walls.push([[s[0], s[1], F], [s[0], s[1], T]], [[s[2], s[3], F], [s[2], s[3], T]]);
      }
      j.roofpoly.sort((p, q) => Math.min(...p.pts.map(a => a[0])) - Math.min(...q.pts.map(a => a[0])));
      const levels = {};   // Dachflächen je Höhenstufe, damit sich die durchsichtigen Schichten stapeln
      for (const r of j.roofsurf) (levels[r[4]] = levels[r[4]] || []).push(r);
      const surf = Object.keys(levels).map(Number).sort((a, b) => a - b).map(z => ({ z, runs: levels[z].sort((p, q) => p[0] - q[0]) }));
      j.poche.sort((p, q) => p[0] - q[0]);
      j.hatch.sort((p, q) => p[0] - q[0]);
      draw = {
        walls, roofpoly: j.roofpoly, roofsurf: surf, shell: j.shell, top: T, floor: F, poche: j.poche, hatch: j.hatch,
        chains: j.chains, ext: j.ext, axes: j.axes, koten: j.koten, bar: j.bar, section: j.section, north: j.north,
        dims: j.dims.filter(d => d.label.startsWith('First'))
      };
    } catch (err) { drawLoading = false; }
  }

  const V = {};   // Kamera und Maße des aktuellen Bildes
  /* Zeichnet eine Punktmenge. o: { edge, thr, zc, alpha, gain, inner } */
  function plot(c, o) {
    const { cx, cyy, scale, cy, sy, cp, sp, cw, ch, rs, wide, real } = V;
    const X = c.X, Y = c.Y, Z = c.Z, C = c.C, R = c.R, n = c.n;
    let shown = 0;
    for (let i = 0; i < n; i++) {
      const x = X[i];
      if (x > o.edge) break;
      shown++;
      if (R && R[i] >= o.thr) continue;
      const y = Y[i], z = Z[i];
      let cut = 1;
      if (z > o.zc) continue;
      if (z > o.zc - 0.5) cut = (o.zc - z) / 0.5;      // Dach löst sich von oben her auf
      const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
      const up = (z - zMid) * cp + y1 * sp, depth = y1 * cp - (z - zMid) * sp;
      const f = camZ / (camZ + depth);
      const px = (cx + x1 * scale * f) | 0, py = (cyy - up * scale * f) | 0;
      if (px < 0 || py < 0 || px >= cw - 4 || py >= ch - 4) continue;
      const laser = !o.inner && o.edge - x < 0.6;
      let r, g, b, a, s;
      if (laser) { if (V.paper) { r = 217; g = 43; b = 34; } else { r = 255; g = 210; b = 63; } a = 255; s = 3.6 * f * rs; }
      else {
        const rr = Math.sqrt((x / EA) * (x / EA) + (y / EB) * (y / EB));
        const fade = o.inner ? 1 : (real ? Math.max(0, Math.min(1, (1 - rr) * 3.2)) : 1);
        const shade = (V.paper ? 1 : Math.max(0.5, Math.min(1.15, 0.62 + (f - 0.85) * 1.5))) * o.gain;
        if (V.paper) {   // Tinte: Mitteltöne werden dunkel, Weiß bleibt ein heller Graphit-Ton
          r = 150 * Math.pow(C[i * 3] / 255, 1.7); g = 150 * Math.pow(C[i * 3 + 1] / 255, 1.7); b = 150 * Math.pow(C[i * 3 + 2] / 255, 1.7);
        } else {
          r = Math.min(255, C[i * 3] * shade); g = Math.min(255, C[i * 3 + 1] * shade); b = Math.min(255, C[i * 3 + 2] * shade);
        }
        if (V.blue) {   // Blaupause: Linien und Punkte in Weiß- und Hellblau-Tönen
          const v = Math.min(255, (r * 0.3 + g * 0.59 + b * 0.11) * 1.15);
          r = v * 0.62; g = v * 0.9; b = Math.min(255, v * 0.9 + 55);
        }
        if (V.mp > 0) {   // Verwandlung: Farben verblassen zu Graphit, die Wolke tritt zurück
          const lum = r * 0.3 + g * 0.59 + b * 0.11, k = V.mp * 0.85;
          r += (lum - r) * k; g += (lum - g) * k; b += (lum - b) * k;
        }
        a = fade * cut * o.alpha * (1 - V.mp * (o.inner ? 0.6 : (z < 0.75 || z > 2.7 ? 0.94 : 0.8))) * 235;
        if (a < 6) continue;
        s = o.inner ? c.spacing * scale * f * 1.05 : (wide ? 3 : 1.9) * (V.paper ? 1.3 : 1) * (1 + (zoom - 1) * 0.6) * (real ? 1 - 0.3 * V.blend : 1) * f * rs;
      }
      s = Math.max(1, Math.round(s));
      const col = (Math.round(a) << 24) | (b << 16) | (g << 8) | r;
      for (let oy = 0; oy < s; oy++) { const row = (py + oy) * cw + px; for (let ox = 0; ox < s; ox++) buf32[row + ox] = col; }
    }
    return shown;
  }

  function drawLines(zc, look) {
    const { cx, cyy, scale, cy, sy, cp, sp, rs } = V;
    const P = (x, y, z) => {
      const x1 = x * cy - y * sy, y1 = x * sy + y * cy, zz = z - zMid;
      const up = zz * cp + y1 * sp, depth = y1 * cp - zz * sp, f = camZ / (camZ + depth);
      return [cx + x1 * scale * f, cyy - up * scale * f];
    };
    const paper = look === 'papier';
    const ink = paper ? '#14171c' : '#f2f7ff', accent = paper ? '#d92b22' : '#ffd23f', halo = paper ? '#f3f0e6' : '#0b2f5b';
    const clamp01 = v => Math.max(0, Math.min(1, v));
    const rWalls = clamp01(mp / 0.5), rRoof = clamp01((mp - 0.3) / 0.5), rPlan = clamp01((mp - 0.62) / 0.3), rDims = clamp01((mp - 0.78) / 0.22);
    const detail = clamp01((zoom - 1) / 0.6);              // je näher man kommt, desto mehr Maße erscheinen
    const F = draw.floor, u = rs;
    const font = (px, w) => w + ' ' + Math.round(px * rs + 1) + 'px ui-monospace, Menlo, monospace';
    const text = (str, x, y, color, px, weight) => {
      ctx.font = font(px, weight || '600'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4 * u; ctx.strokeStyle = halo; ctx.strokeText(str, x, y);
      ctx.fillStyle = color; ctx.fillText(str, x, y);
    };
    const circle = (x, y, r, color, label) => {
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = halo; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, 1.1 * u); ctx.stroke();
      if (label) text(label, x, y + 0.5 * u, color, wide ? 10 : 8);
    };
    const wide = V.wide;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // 1) Geschnittene Wände am Boden: gefüllt und schraffiert (stärkste Linien der Zeichnung)
    const nP = draw.poche.length, shownP = rWalls * nP;
    ctx.beginPath();
    for (let i = 0; i < nP && i < shownP; i++) {
      const q = draw.poche[i], a = P(q[0], q[1], F), b = P(q[2], q[1], F), c = P(q[2], q[3], F), d = P(q[0], q[3], F);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
    }
    ctx.fillStyle = ink; ctx.globalAlpha = 0.28; ctx.fill();
    ctx.strokeStyle = ink; ctx.globalAlpha = 0.95; ctx.lineWidth = Math.max(1, 1.8 * u); ctx.stroke();
    const nH = draw.hatch.length, shownH = rWalls * nH;
    ctx.beginPath();
    for (let i = 0; i < nH && i < shownH; i++) {
      const h = draw.hatch[i], a = P(h[0], h[1], F), b = P(h[2], h[3], F);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    }
    ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(1, 0.7 * u); ctx.stroke();

    // 2) Wandflächen im Raum (mittlere Linienstärke), zeichnen sich von links nach rechts
    const nW = draw.walls.length, shownW = rWalls * nW;
    ctx.beginPath();
    for (let i = 0; i < nW && i < shownW; i++) {
      const pts = draw.walls[i], frac = Math.min(1, shownW - i), last = Math.max(1, Math.ceil((pts.length - 1) * frac));
      let p = P(pts[0][0], pts[0][1], pts[0][2]); ctx.moveTo(p[0], p[1]);
      for (let k = 1; k <= last && k < pts.length; k++) { p = P(pts[k][0], pts[k][1], pts[k][2]); ctx.lineTo(p[0], p[1]); }
    }
    ctx.strokeStyle = ink; ctx.globalAlpha = 0.6; ctx.lineWidth = Math.max(1, 1.15 * u); ctx.stroke();
    // Hülle: Boden- und Wandkranz mit Eckpfosten, damit die Gebäude als geschlossenes Volumen lesbar sind
    if (rWalls > 0.15) {
      ctx.beginPath();
      for (const s of draw.shell) {
        const [x0, x1] = s.x, [y0, y1] = s.y, T = draw.top;
        for (const z of [F, T]) {
          const a = P(x0, y0, z), b = P(x1, y0, z), c = P(x1, y1, z), d = P(x0, y1, z);
          ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
        }
        for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) { const a = P(x, y, F), b = P(x, y, T); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      }
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.5 * clamp01((rWalls - 0.15) / 0.5); ctx.lineWidth = Math.max(1, 1.2 * u); ctx.stroke();
    }

    // 3) Dach als Höhenlinien (dünn); sie lösen sich beim Hineinzoomen von oben nach unten auf
    if (rRoof > 0) {
      // durchsichtige Dachflächen: jede Höhenstufe ein dünner Schleier, zum First hin wird es dichter
      for (const g of draw.roofsurf) {
        const fade = 0.55 + 0.45 * clamp01((zc - g.z + 0.4) / 1.6);   // beim Zoomen bleibt ein zarter Dachschleier stehen
        const n = Math.ceil(rRoof * g.runs.length);
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const q = g.runs[i], a = P(q[0], q[1], g.z), b = P(q[2], q[1], g.z), c = P(q[2], q[3], g.z), d = P(q[0], q[3], g.z);
          ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
        }
        ctx.fillStyle = ink; ctx.globalAlpha = 0.085 * fade; ctx.fill();
      }
      const nR = draw.roofpoly.length, shownR = rRoof * nR;
      for (let i = 0; i < nR && i < shownR; i++) {
        const r = draw.roofpoly[i];
        const fade = 0.5 + 0.5 * clamp01((zc - r.z + 0.4) / 1.6);     // Dachlinien: nie ganz weg, nur durchsichtiger
        const frac = Math.min(1, shownR - i), last = Math.max(1, Math.ceil((r.pts.length - 1) * frac));
        ctx.beginPath();
        let p = P(r.pts[0][0], r.pts[0][1], r.z); ctx.moveTo(p[0], p[1]);
        for (let k = 1; k <= last && k < r.pts.length; k++) { p = P(r.pts[k][0], r.pts[k][1], r.z); ctx.lineTo(p[0], p[1]); }
        if (r.closed && frac >= 1) { ctx.closePath(); ctx.fillStyle = ink; ctx.globalAlpha = 0.07 * fade; ctx.fill(); }
        ctx.strokeStyle = ink; ctx.globalAlpha = 0.9 * fade; ctx.lineWidth = Math.max(1, 1.8 * u); ctx.stroke();
      }
    }

    // 4) Plan-Elemente: Achsen, Maßketten, Höhenkoten, Schnitt, Maßstabsbalken
    if (rPlan > 0) {
      // Achsraster: Strich-Punkt-Linien mit Kreisen
      ctx.setLineDash([10 * u, 3 * u, 2 * u, 3 * u]); ctx.strokeStyle = ink; ctx.globalAlpha = 0.4 * rPlan; ctx.lineWidth = Math.max(1, 0.8 * u);
      ctx.beginPath();
      for (const a of draw.axes) { const p = P(a.p[0], a.p[1], a.p[2]), q = P(a.q[0], a.q[1], a.q[2]); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = rPlan * (0.6 + 0.4 * detail);
      for (const a of draw.axes) { const p = P(a.p[0], a.p[1], a.p[2]); circle(p[0], p[1], (wide ? 9 : 7) * u + 1, ink, a.label); }
      // Maßhilfslinien
      ctx.strokeStyle = accent; ctx.globalAlpha = rPlan * (0.25 + 0.45 * detail); ctx.lineWidth = Math.max(1, 0.7 * u);
      ctx.beginPath();
      for (const e of draw.ext) { const p = P(e[0], e[1], F), q = P(e[2], e[3], F); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
      ctx.stroke();
      // Schnittlinie A–A
      const sc = draw.section;
      if (sc) {
        const p = P(sc.p[0], sc.p[1], sc.p[2]), q = P(sc.q[0], sc.q[1], sc.q[2]);
        ctx.setLineDash([16 * u, 4 * u, 3 * u, 4 * u]); ctx.strokeStyle = ink; ctx.globalAlpha = 0.7 * rPlan; ctx.lineWidth = Math.max(1, 1.6 * u);
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); ctx.setLineDash([]);
        circle(p[0], p[1], 9 * u + 1, ink, sc.label); circle(q[0], q[1], 9 * u + 1, ink, sc.label);
      }
      // Maßstabsbalken mit Beschriftung
      const bar = draw.bar;
      if (bar) {
        const n = Math.round(bar.len);
        for (let i = 0; i < n; i++) {
          const a = P(bar.o[0] + i, bar.o[1], bar.o[2]), b = P(bar.o[0] + i + 1, bar.o[1], bar.o[2]);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
          ctx.strokeStyle = i % 2 ? halo : ink; ctx.globalAlpha = rPlan; ctx.lineWidth = 5 * u; ctx.stroke();
          ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, 1.1 * u); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
        const a0 = P(bar.o[0], bar.o[1], bar.o[2]), a1 = P(bar.o[0] + bar.len, bar.o[1], bar.o[2]);
        ctx.globalAlpha = rPlan;
        text('0', a0[0], a0[1] + 11 * u, ink, 9); text(Math.round(bar.len) + ' m', a1[0], a1[1] + 11 * u, ink, 9);
        text(bar.caption, (a0[0] + a1[0]) / 2, a0[1] - 14 * u, ink, wide ? 10 : 8, '700');
      }
      // Nordpfeil (nur, wenn die Richtung bekannt ist)
      if (draw.north && bar) {
        const ang = draw.north.angle * Math.PI / 180, bx = bar.o[0] + bar.len + 2.2, by = bar.o[1];
        const a = P(bx, by, F), b = P(bx + Math.sin(ang) * 2.6, by + Math.cos(ang) * 2.6, F);
        ctx.globalAlpha = rPlan; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, 1.6 * u);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, hs = 7 * u;
        ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] - ux * hs * 1.8 - uy * hs * 0.8, b[1] - uy * hs * 1.8 + ux * hs * 0.8);
        ctx.lineTo(b[0] - ux * hs * 1.8 + uy * hs * 0.8, b[1] - uy * hs * 1.8 - ux * hs * 0.8); ctx.closePath(); ctx.fillStyle = ink; ctx.fill();
        circle(a[0], a[1], 4 * u, ink); text('N', b[0] + ux * 11 * u, b[1] + uy * 11 * u, ink, 11, '800');
      }
    }

    // 5) Maßketten mit Schrägstrich-Enden und Zahlen (feine Linien in der Akzentfarbe)
    if (rDims > 0) {
      const tick = 5 * u;
      const items = [];
      for (const d of draw.chains) { if (d.lvl === 1) items.push([d, rDims * (0.55 + 0.45 * detail)]); else items.push([d, rDims]); }
      for (const d of draw.dims) items.push([d, rDims]);
      ctx.strokeStyle = accent; ctx.lineWidth = Math.max(1, 0.95 * u);
      for (const [d, al] of items) {
        const a = P(d.p[0], d.p[1], d.p[2]), b = P(d.q[0], d.q[1], d.q[2]);
        ctx.globalAlpha = al; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
        const sx = (ux - uy) * tick * 0.7, syy = (uy + ux) * tick * 0.7;   // 45°-Schrägstrich
        ctx.moveTo(a[0] - sx, a[1] - syy); ctx.lineTo(a[0] + sx, a[1] + syy);
        ctx.moveTo(b[0] - sx, b[1] - syy); ctx.lineTo(b[0] + sx, b[1] + syy);
        ctx.stroke();
      }
      for (const [d, al] of items) {
        const a = P(d.p[0], d.p[1], d.p[2]), b = P(d.q[0], d.q[1], d.q[2]);
        const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (d.lvl === 1 && dist < 26 * u) continue;   // zu kurze Teilmaße ausblenden
        if (d.label.startsWith('First')) continue;   // die Höhe steht schon in der Kote
        ctx.globalAlpha = al; text(d.label, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 7 * u, accent, wide ? 11 : 8.5);
      }
      // Höhenkoten: kleines Dreieck mit Höhenangabe
      ctx.globalAlpha = rDims;
      for (const k of draw.koten) {
        const p = P(k.p[0], k.p[1], k.p[2]), s = 5 * u;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] - s, p[1] - s * 1.5); ctx.lineTo(p[0] + s, p[1] - s * 1.5); ctx.closePath();
        ctx.fillStyle = accent; ctx.fill();
        ctx.beginPath(); ctx.moveTo(p[0] - s * 3, p[1]); ctx.lineTo(p[0] + s * 3, p[1]); ctx.strokeStyle = accent; ctx.lineWidth = Math.max(1, 0.9 * u); ctx.stroke();
        text(k.label, p[0] - s * 5.2, p[1] - s * 0.4, accent, wide ? 10 : 8);
      }
    }
    ctx.restore();
  }

  /* Real Estate: dichte, undurchsichtige Farbpunkte aus dem Scan, mit der Grafikkarte gezeichnet (WebGL) */
  const glCanvas = $('#realcanvas');
  let gl = null, glProg = null, glPos = null, glCol = null, glCount = 0, glLoading = false, showReal = false;
  const ZS = 0.348294;                   // Höhenversatz: die Aufmaßdaten liegen auf Höhe 0 der Punktwolke, das Modell ab dem tiefsten Punkt
  let showAuf = false, auf = null, aufLoading = null, aufT = 0, aufPlayed = false;      // Aufmaßzeichnung (aufmass/aufmass.js, wird erst bei Bedarf geladen)
  const GL_SPACING = 0.07;     // Abstand der Punkte in Metern (aus dem Export)
  const VS = `
    attribute vec3 aPos; attribute vec3 aCol;
    uniform vec2 uView; uniform vec4 uCam; uniform vec4 uRot; uniform vec3 uMisc; uniform vec2 uEll;
    varying vec3 vCol; varying float vFade;
    void main() {
      vec3 p = aPos * 0.01;
      float z = p.z - uMisc.x;
      float x1 = p.x * uRot.x - p.y * uRot.y;
      float y1 = p.x * uRot.y + p.y * uRot.x;
      float up = z * uRot.z + y1 * uRot.w;
      float depth = y1 * uRot.z - z * uRot.w;
      float f = uCam.w / (uCam.w + depth);
      float px = uCam.x + x1 * uCam.z * f;
      float py = uCam.y - up * uCam.z * f;
      gl_Position = vec4(px / uView.x * 2.0 - 1.0, 1.0 - py / uView.y * 2.0, clamp((depth + 60.0) / 120.0, 0.0, 1.0) * 2.0 - 1.0, 1.0);
      gl_PointSize = clamp(uMisc.y * uCam.z * f * 1.7, 1.5, 14.0);
      float rr = sqrt((p.x / uEll.x) * (p.x / uEll.x) + (p.y / uEll.y) * (p.y / uEll.y));
      vFade = clamp((1.0 - rr) * 3.2, 0.0, 1.0);
      vCol = aCol * uMisc.z;
    }`;
  const FS = `
    precision mediump float;
    varying vec3 vCol; varying float vFade;
    void main() {
      vec2 d = gl_PointCoord - 0.5;
      if (dot(d, d) > 0.25) discard;
      float h = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      if (vFade < h) discard;
      gl_FragColor = vec4(vCol, 1.0);
    }`;
  function initGL() {
    try {
      gl = glCanvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false });
      if (!gl) return false;
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      glProg = gl.createProgram();
      gl.attachShader(glProg, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(glProg, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(glProg);
      if (!gl.getProgramParameter(glProg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(glProg));
      return true;
    } catch (err) { gl = null; return false; }
  }
  async function loadRealGL() {
    if (glCount) return true;
    if (glLoading) return false;
    glLoading = true;
    try {
      const res = await fetch('real.bin');
      if (!res.ok) throw new Error(res.status);
      const dv = new DataView(await res.arrayBuffer());
      const total = dv.getUint32(0, true);
      const n = innerWidth < 760 ? Math.floor(total * 0.5) : total;    // Reihenfolge in der Datei ist gemischt, also gleichmäßig ausgedünnt
      const pos = new Int16Array(n * 3), col = new Uint8Array(n * 3);
      for (let i = 0; i < n; i++) {
        const o = 4 + i * 9;
        pos[i * 3] = dv.getInt16(o, true); pos[i * 3 + 1] = dv.getInt16(o + 2, true); pos[i * 3 + 2] = dv.getInt16(o + 4, true);
        col[i * 3] = dv.getUint8(o + 6); col[i * 3 + 1] = dv.getUint8(o + 7); col[i * 3 + 2] = dv.getUint8(o + 8);
      }
      glPos = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, glPos); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
      glCol = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, glCol); gl.bufferData(gl.ARRAY_BUFFER, col, gl.STATIC_DRAW);
      glCount = n;
      return true;
    } catch (err) { glLoading = false; return false; }
  }
  function drawReal() {
    const w = canvas.width, h = canvas.height;
    if (glCanvas.width !== w || glCanvas.height !== h) { glCanvas.width = w; glCanvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.useProgram(glProg);
    const u = n => gl.getUniformLocation(glProg, n);
    gl.uniform2f(u('uView'), w, h);
    gl.uniform4f(u('uCam'), V.cx, V.cyy, V.scale, camZ);
    gl.uniform4f(u('uRot'), V.cy, V.sy, V.cp, V.sp);
    gl.uniform3f(u('uMisc'), zMid, GL_SPACING, 1.45);
    gl.uniform2f(u('uEll'), EA, EB);
    const a = gl.getAttribLocation(glProg, 'aPos'), b = gl.getAttribLocation(glProg, 'aCol');
    gl.bindBuffer(gl.ARRAY_BUFFER, glPos); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 3, gl.SHORT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, glCol); gl.enableVertexAttribArray(b); gl.vertexAttribPointer(b, 3, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.drawArrays(gl.POINTS, 0, glCount);
  }
  const realBtn = $('.view-switch [data-view="real"]');
  if (!initGL() && realBtn) realBtn.hidden = true;     // ohne WebGL gibt es die Ansicht nicht

  /* Aufmaßzeichnung: Skript und Daten erst laden, wenn man sie braucht */
  const loadScript = src => new Promise((ok, no) => { const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = no; document.head.appendChild(el); });
  function loadAuf() {
    if (auf) return Promise.resolve(true);
    if (aufLoading) return aufLoading;
    aufLoading = (async () => {
      try {
        if (!window.Aufmass) await loadScript('aufmass/aufmass.js');
        const data = await (await fetch('aufmass/aufmass.json')).json();
        auf = window.Aufmass.mount($('#auf'), data, { external: true });
        return true;
      } catch (err) { aufLoading = null; return false; }
    })();
    return aufLoading;
  }
  new MutationObserver(() => { if (auf) auf.recolor(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-look'] });

  /* Schalter Scanner-Punkte | Maße | Aufmaß | 3D-Modell; auto = von der automatischen Führung ausgelöst */
  const viewBtns = $$('.view-switch button');
  const hero2 = hero;
  async function selectView(v, auto) {
    if (!auto) { morphAuto = false; used(); }
    const note = document.getElementById('viewNote');
    if (v === 'real') {
      if (!glCount && note) note.textContent = '3D-Modell wird geladen …';
      if (!(await loadRealGL())) { if (note) note.textContent = 'Das 3D-Modell ist hier gerade nicht verfügbar.'; return false; }
      fadeUntil = performance.now() + 2400;
      showAuf = false; hero2.classList.remove('auf', 'aufdone');
      showReal = true; hero2.classList.add('real'); lastView = '';
      return true;
    }
    if (v === 'aufmass') {
      if (!auf && note) note.textContent = 'Aufmaß wird geladen …';
      if (!(await loadAuf())) { if (note) note.textContent = 'Die Aufmaßzeichnung ist hier gerade nicht verfügbar.'; return false; }
      if (!aufPlayed) { aufT = 0; aufPlayed = true; } else aufT = auf.total + 1;      // beim ersten Mal wird sie gezeichnet, danach steht sie fertig da
      hero2.classList.remove('real'); showReal = false;
      hero2.classList.toggle('aufdone', !(glCount && aufT < auf.total * 0.9));      // war das 3D-Modell eben zu sehen, scheint es beim Zeichnen durch
      fadeUntil = performance.now() + 2400;
      showAuf = true; hero2.classList.add('auf'); lastView = '';
      return true;
    }
    showReal = false; showAuf = false; hero2.classList.remove('real', 'auf', 'aufdone');
    mpTarget = v === 'zeichnung' ? 1 : 0;
    if (mpTarget === 1) loadDrawing();
    lastView = '';
    return true;
  }
  viewBtns.forEach(b => b.addEventListener('click', () => selectView(b.dataset.view, false)));

  /* Automatische Führung: Scanner-Punkte, dann Maße, dann 3D-Modell, zuletzt Aufmaß. Jede Bedienung beendet sie. */
  let guide = 0, guideAt = 0, guideBusy = false;
  let pitchBase = null, fadeUntil = 0;                // fadeUntil: so lange läuft die alte Ansicht bei der langsamen Überblendung mit
  function guideStep(t) {
    if (guideBusy) return;
    if (guide === 0) {
      if (!draw || mpTarget !== 0) return;
      if (!guideAt) guideAt = t;
      if (t - guideAt > 1200) { mpTarget = 1; guide = 1; guideAt = 0; loadRealGL(); loadAuf(); }
    } else if (guide === 1) {
      if (mp < 0.999) return;
      if (!guideAt) guideAt = t;
      if (t - guideAt > 2800) { guideBusy = true; selectView('real', true).then(ok => { guideBusy = false; guideAt = 0; guide = ok ? 2 : 3; }); }
    } else if (guide === 2) {
      if (!guideAt) guideAt = t;
      if (t - guideAt > 4200) { guideBusy = true; selectView('aufmass', true).then(() => { guideBusy = false; guide = 3; }); }
    }
  }
  let lastView = '';
  function syncView() {
    const v = showAuf ? 'aufmass' : showReal ? 'real' : (mpTarget === 1 ? 'zeichnung' : 'scan');
    if (v === lastView) return; lastView = v;
    viewBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    const note = document.getElementById('viewNote');
    if (note) {
      note.classList.remove('swap'); void note.offsetWidth; note.classList.add('swap');
      note.textContent = v === 'scan' ? 'Jeder Punkt ist eine Laser-Messung. Millionen davon ergeben das Modell.' : v === 'zeichnung' ? 'Aus den Messpunkten entsteht der Plan: Wände, Dach und Maße.' : v === 'aufmass' ? 'Daraus wird die Außenansicht gezeichnet, wie ein Aufmaß: Dach, Wände, Fenster und Türen.' : 'So sieht es von oben aus: echte Farben aus dem Scan, nichts durchsichtig.';
    }
  }

  function frame(t) {
    if (!visible || document.hidden) { running = false; return; }
    requestAnimationFrame(frame);
    if (!cloud || t - lastDraw < 32) return;  // höchstens etwa 30 Bilder pro Sekunde
    lastDraw = t;
    const dt = Math.min(80, t - last || 33); last = t;
    if (keyDir) dragYaw += keyDir * dt * 0.0022;
    if (!reduceMotion) { sweep = Math.min(1, sweep + dt / 5200); yaw += dt * 0.00007; }

    const c = cloud, real = c.real;
    const half = real ? EA : 10;
    scrollP = scrollProgress();
    zoomT = 1 + (ZMAX - 1) * scrollP;
    if (scrollP > 0.03) used();
    zoom += (zoomT - zoom) * 0.22;
    hudZ();
    hero.classList.toggle('zoomed', zoomT > 1.25);
    const yw = yaw + dragYaw + mx * 0.35 + scrollP * 1.1;
    const pitchTarget = (showReal || showAuf) ? 0.92 : (real ? 1.08 : 0.5);
    pitchBase = pitchBase === null ? pitchTarget : pitchBase + (pitchTarget - pitchBase) * (1 - Math.exp(-dt / 380));      // die Neigung gleitet beim Wechsel, statt zu springen
    const pitch = Math.max(0.3, Math.min(1.5, pitchBase + dragPitch + my * 0.08 - scrollP * 0.25));
    const look = document.documentElement.dataset.look === 'blaupause' ? 'blaupause' : 'papier';
    const paper = look === 'papier';
    if (real && !draw) loadDrawing();
    if (sweep >= 1 && morphAuto && !reduceMotion) guideStep(t);
    mp += Math.max(-1, Math.min(1, (mpTarget - mp) * 4)) * dt / 3800;
    mp = Math.max(0, Math.min(1, mp));
    const wide = W > 900;
    Object.assign(V, {
      cx: (wide ? W * 0.71 + shiftX : W * 0.5) * rs, cyy: (wide ? H * 0.54 : 235) * rs,
      scale: Math.min(W, H * 1.3) * (wide ? perM : perMsmall) * rs * (real ? 1 : 2.2) * zoom,
      cy: Math.cos(yw), sy: Math.sin(yw), cp: Math.cos(pitch), sp: Math.sin(pitch),
      cw: canvas.width, ch: canvas.height, rs, wide, real, paper, blue: !paper, mp
    });
    const edge = -half + sweep * 2 * half;

    const crossfade = (showReal || showAuf) && performance.now() < fadeUntil;      // bei der Überblendung läuft die alte Ansicht mit gleicher Kamera weiter
    if (showAuf && auf) {                                             // Aufmaß: eigene Fläche, exakt dieselbe Kamera wie das 3D-Modell (Lage, Drehung, Maßstab, Zoom)
      aufT = Math.min(aufT + dt / 1000 * 1.8, auf.total + 1);
      const { cx: pcx, cyy: pcy, scale: psc, cy: pcos, sy: psin, cp: pcp, sp: psp, rs: prs } = V;
      auf.setProject(p => {
        const x1 = p[0] * pcos - p[1] * psin, y1 = p[0] * psin + p[1] * pcos, zz = p[2] + ZS - zMid;
        const up = zz * pcp + y1 * psp, depth = y1 * pcp - zz * psp, f = camZ / (camZ + depth);
        return [(pcx + x1 * psc * f) / prs, (pcy - up * psc * f) / prs, depth];
      });
      auf.setTime(aufT);
      if (glCount) {                                                  // das 3D-Modell läuft unter der Zeichnung mit und bleibt mit etwa 20 % stehen
        drawReal();
        if (aufT >= auf.total * 0.9) hero.classList.add('aufdone');
      }
      if (!crossfade) { syncView(); return; }
    } else if (showReal && glCount) {                                 // 3D-Modell: die dichte Ansicht
      drawReal();
      if (!crossfade) { syncView(); return; }
    }

    // Überblick: etwa 45 % der Punkte; beim Heranzoomen kommen die übrigen dazu
    const blend = dichte === 'voll' ? 1 : dichte === 'grob' ? 0 : Math.max(0, Math.min(1, (zoom - 1) / 0.8));
    V.blend = blend;
    // Puppenhaus: ab etwa 1,3-fachem Zoom öffnen sich die Dächer von oben nach unten
    const open = real && dichte !== 'zu' ? Math.max(0, Math.min(1, (zoom - 1.3) / 0.9)) : 0;
    const zc = 12 - open * (12 - 2.55);
    if (real && !inner && (zoomT > 1.05 || (wide && sweep >= 1 && !saveData))) loadInner();

    if (!buf32) { resize(); if (!buf32) return; }
    buf32.fill(0);
    const shown = plot(c, { edge, thr: real ? 115 + blend * 141 : 256, zc, alpha: 1, gain: paper ? 0.3 : (real ? 1.7 : 1), inner: false });
    if (inner && open > 0.03) plot(inner, { edge: 99, thr: 256, zc: 99, alpha: Math.min(1, open * 1.4), gain: paper ? 0.42 : 1.3, inner: true });
    ctx.putImageData(img, 0, 0);
    if (draw && mp > 0.001) drawLines(zc, look);
    syncView();
    if (sweep < 1 || (++hudTick % 15 === 0)) {
      hudPct.textContent = String(Math.round(sweep * 100)).padStart(3, '0');
      hudBar.style.width = sweep * 100 + '%';
      hudPts.textContent = Math.round(shown / c.n * (real ? REAL_POINTS : 340000)).toLocaleString('de-DE');
    }
  }
  start();
})();

/* ---------- Einblenden, Zähler ---------- */
const io = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (!en.isIntersecting) return;
    en.target.classList.add('in');
    const num = $('[data-count]', en.target);
    if (num) countUp(num);
    io.unobserve(en.target);
  });
}, { threshold: 0.12 });
$$('.reveal').forEach((el, i) => { el.style.transitionDelay = ((i % 4) * 70) + 'ms'; io.observe(el); });

function countUp(el) {
  const to = +el.dataset.count;
  if (reduceMotion) { el.textContent = to; return; }
  const t0 = performance.now(), dur = 1400;
  (function step(t) {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}

/* ---------- Cursor-Licht, Magnet, Kachel-Neigung ---------- */
const glow = $('.cursor-glow');
if (!coarse && !reduceMotion) {
  addEventListener('pointermove', e => {
    glow.style.opacity = 1;
    glow.style.transform = `translate(${e.clientX - 260}px, ${e.clientY - 260}px)`;
  }, { passive: true });
  $$('.magnetic').forEach(b => {
    b.addEventListener('pointermove', e => {
      const r = b.getBoundingClientRect();
      b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .18}px, ${(e.clientY - r.top - r.height / 2) * .28}px)`;
    });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; });
  });
  $$('.tilt').forEach(t => {
    t.addEventListener('pointermove', e => {
      const r = t.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      t.style.setProperty('--mx', x * 100 + '%'); t.style.setProperty('--my', y * 100 + '%');
      t.style.transform = `perspective(900px) rotateX(${(.5 - y) * 5}deg) rotateY(${(x - .5) * 6}deg)`;
    });
    t.addEventListener('pointerleave', () => { t.style.transform = ''; });
  });
}

/* ---------- Drahtmodell im Band „Aus Maßen wird ein Modell" ---------- */
(function wireframe() {
  const band = $('#wmBand'), canvas = $('#wm'), cap = $('#wmCap');
  if (!band || !canvas) return;
  let model = null, loading = false;
  /* Schwache Geräte, Datensparmodus und „weniger Bewegung": nur das fertige Standbild, einmal gezeichnet */
  const weak = reduceMotion || !!(navigator.connection && navigator.connection.saveData)
    || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) || (navigator.deviceMemory && navigator.deviceMemory <= 2);
  function start() {
    if (model || loading) return;
    loading = true;
    const sc = document.createElement('script');
    sc.src = 'drahtmodell/drahtmodell.js';
    sc.onload = () => {
      model = window.Drahtmodell.mount(canvas, weak
        ? { still: 99, yawDeg: 28 }
        : { onStage: l => { cap.textContent = l; } });
      if (weak) cap.textContent = 'Fertiges Modell';
    };
    sc.onerror = () => { loading = false; };
    document.head.appendChild(sc);
  }
  /* Das Skript (etwa 20 KB) wird erst geladen, wenn man dem Band nahe kommt */
  if ('IntersectionObserver' in window) {
    const io2 = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io2.disconnect(); start(); } }, { rootMargin: '700px 0px' });
    io2.observe(band);
  } else start();
  /* Papier <-> Blaupause: Farben neu lesen */
  new MutationObserver(() => { if (model) model.recolor(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-look'] });
})();

/* ---------- Rundgang-Viewer ---------- */
const stage = $('#stage'), poster = $('#poster'), frameEl = $('#frame'), posterTitle = $('#posterTitle'), posterImg = $('#posterImg');
let current = $('.vt.active').dataset.id;
function resetViewer() {
  frameEl.hidden = true; frameEl.removeAttribute('src'); poster.hidden = false;
}
$$('.vt').forEach(btn => btn.addEventListener('click', () => {
  $$('.vt').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
  btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
  current = btn.dataset.id; posterTitle.textContent = btn.dataset.title;
  if (posterImg && btn.dataset.img) { posterImg.src = btn.dataset.img; posterImg.alt = btn.dataset.alt || ''; }
  resetViewer();
}));
$('#play').addEventListener('click', () => {
  frameEl.src = `https://my.matterport.com/show/?m=${encodeURIComponent(current)}&play=1&qs=1`;
  frameEl.hidden = false; poster.hidden = true;
  frameEl.addEventListener('load', () => frameEl.focus(), { once: true });   // Pfeiltasten gehen sofort im Rundgang
});

/* ---------- Zielgruppen ---------- */
const who = [
  { t: 'Makler', p: 'Ein Rundgang macht aus einem Inserat eine Besichtigung, die nie ausfällt. Interessenten kommen vorbereitet und die Termine werden weniger, aber besser.', l: ['Vorqualifizierte Interessenten', 'Auch für Auswärtige und Kapitalanleger', 'Mehr Aufmerksamkeit im Portal und im Exposé'] },
  { t: 'Eigentümer', p: 'Wer verkaufen oder vermieten möchte, zeigt sein Objekt von der besten Seite und muss nicht jeden Interessenten persönlich durchführen.', l: ['Weniger Besichtigungen im eigenen Zuhause', 'Ein Link, den jeder weiterleiten kann', 'Dauerhaft abrufbar'] },
  { t: 'Vermieter und Unterkünfte', p: 'Monteurhäuser, Ferienwohnungen und Gästezimmer verkaufen sich über Vertrauen. Gäste sehen vorab, wie es wirklich aussieht.', l: ['Weniger Rückfragen vor der Buchung', 'Ehrlicher Eindruck von Zimmern und Ausstattung', 'Einbindbar auf der eigenen Website'] },
  { t: 'Gewerbe und Hotels', p: 'Büros, Praxen, Läden und Häuser mit Gastronomie lassen sich als digitaler Zwilling präsentieren, planen und dokumentieren.', l: ['Flächen online vermieten', 'Bestand und Raumaufteilung dokumentieren', 'Erster Eindruck für Kunden und Gäste'] },
  { t: 'Architekten', p: 'Der Scan hält den Bestand fest, bevor geplant, umgebaut oder saniert wird. Maße lassen sich später am Rechner prüfen.', l: ['Bestandsaufnahme als digitaler Zwilling', 'Abstimmung mit Bauherren ohne Vor-Ort-Termin', 'Ergänzend Architekturfotografie'] },
  { t: 'Realer Mehrwert', p: 'Ein digitaler Zwilling zahlt sich aus, für den Verkäufer und für den Makler. Zwei von Matterport veröffentlichte Auswertungen aus den USA zeigen, wie deutlich der Unterschied sein kann.',
    l: ['Schneller verkauft: Objekte mit 3D-Rundgang wurden in der Auswertung der Texas Tech University (143.575 Inserate, vier US-Regionen) bis zu 31 % schneller verkauft. Eine zweite Auswertung mit 700 Inseraten fand 20 % kürzere Vermarktungszeiten.',
        'Mehr Ertrag: Je nach Markt lagen die Verkaufspreise bei 4 bis 9 % höher, in der zweiten Auswertung bei 4,8 %.',
        'Zeit sparen: Interessenten sehen das Objekt vorab am Bildschirm, Makler führen weniger Besichtigungen durch, und der Scan liefert zugleich Maße und Grundriss. Aktuelle Pläne sind eine gute Grundlage für Gespräche mit Bank oder Gutachter.'],
    s: [{ n: 'Matterport, Studien 2020 (US-Märkte)', u: 'https://matterport.com/blog/3d-tours-properties-sell-31-faster-and-higher-price' }] }
];
const whoBody = $('#whoBody');
function showWho(i) {
  const w = who[i];
  $('#whoTitle').textContent = w.t; $('#whoText').textContent = w.p;
  $('#whoList').innerHTML = w.l.map(x => `<li>${x}</li>`).join('');
  const src = $('#whoSrc');
  src.hidden = !w.s;
  src.innerHTML = w.s ? 'Quellen: ' + w.s.map(x => `<a href="${x.u}" target="_blank" rel="noopener noreferrer">${x.n}</a>`).join(' · ') : '';
  whoBody.classList.remove('swap'); void whoBody.offsetWidth; whoBody.classList.add('swap');
}
$$('.wt').forEach(b => b.addEventListener('click', () => {
  $$('.wt').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-selected', 'false'); });
  b.classList.add('active'); b.setAttribute('aria-selected', 'true'); showWho(+b.dataset.i);
}));
showWho(0);

/* ---------- Zeitleiste ---------- */
const timeline = $('#timeline');
function updateTimeline() {
  const r = timeline.getBoundingClientRect();
  const p = (innerHeight * .6 - r.top) / r.height;
  timeline.style.setProperty('--prog', Math.max(0, Math.min(1, p)) * 100 + '%');
}
addEventListener('scroll', updateTimeline, { passive: true }); updateTimeline();

/* ---------- Anfrage: Menü (Projekt zusammenstellen) und Formular in einem Weg ---------- */
const state = { type: 'Wohnung', other: '', size: 120, exact: false, wants: new Set(['3D-Rundgang']), touched: false };
const sizeIn = $('#cfgSize'), numIn = $('#cfgSizeNum');
const otherBox = $('#cfgOther'), otherIn = $('#cfgOtherText');
const fObjekt = $('#fObjekt'), fFlaeche = $('#fFlaeche'), fWunsch = $('#fWunsch'), fSumm = $('#fSumm'), formSum = $('#formSum'), fPreis = $('#fPreis'), priceOut = $('#cfgPrice');
const FORM_HINT = 'Oben können Sie Ihr Projekt zusammenstellen. Oder Sie schreiben uns einfach.';
const esc = t => t.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function plain() {
  const w = [...state.wants];
  const list = w.length ? w.slice(0, -1).join(', ') + (w.length > 1 ? ' und ' : '') + w.slice(-1) : 'noch keine Leistung gewählt';
  return { w, list };
}
/* Preisorientierung (netto): bis 50 m² pauschal 180 €, danach gleichmäßig von Eckpreis zu Eckpreis, über 1.000 m² 1.250 € plus 1,20 € je weiterer m²; auf 5 € gerundet */
const ECK = [[50, 180], [100, 280], [150, 380], [200, 425], [300, 550], [500, 750], [750, 950], [1000, 1250]];
function preis(s) {
  if (s <= ECK[0][0]) return ECK[0][1];
  let p = 1250 + (s - 1000) * 1.2;
  for (let i = 1; i < ECK.length; i++) {
    if (s <= ECK[i][0]) { const [x0, y0] = ECK[i - 1], [x1, y1] = ECK[i]; p = y0 + (y1 - y0) * (s - x0) / (x1 - x0); break; }
  }
  return Math.round(p / 5) * 5;
}
const eur = n => n.toLocaleString('de-DE') + ' €';
function renderCfg() {
  const open = state.size >= 1500 && !state.exact;      // Regler ganz rechts: „und mehr“; eine getippte Zahl gilt genau
  const sizeTxt = open ? '1.500 m² und mehr' : state.size + ' m²';
  if (document.activeElement !== numIn) numIn.value = state.size;
  const type = state.type === 'Sonstiges' && state.other ? `Sonstiges: ${state.other}` : state.type;
  const { w, list } = plain();
  /* Bei „Sonstiges" (Event, Fahrzeug …) gibt es keine Fläche, also auch keinen Richtpreis */
  const preisTxt = state.type === 'Sonstiges' ? '' : `${open ? 'ab ' : ''}${eur(preis(state.size))} netto zzgl. USt.`;
  priceOut.innerHTML = preisTxt ? `Preisorientierung: <b>${preisTxt}</b>` : 'Preis nach Absprache, wir melden uns persönlich.';
  /* Die Auswahl geht nur mit, wenn sie angefasst wurde: als eigene Felder und als Satz in der Anfrage-Mail */
  if (state.touched) {
    fObjekt.value = type; fFlaeche.value = sizeTxt; fWunsch.value = w.join(', '); fPreis.value = preisTxt;
    fSumm.value = `Ich plane ein Projekt für ${type} mit etwa ${sizeTxt} und wünsche ${list}.` + (preisTxt ? ` Angezeigte Preisorientierung: ${preisTxt}` : '');
    formSum.innerHTML = `<b>Ihre Auswahl:</b> ${esc(type)}, ${sizeTxt}, ${list}` + (preisTxt ? `. Preisorientierung: ${preisTxt}` : '');
  } else {
    fObjekt.value = fFlaeche.value = fWunsch.value = fSumm.value = fPreis.value = '';
    formSum.textContent = FORM_HINT;
  }
}
$$('#cfgType .pill').forEach(b => b.addEventListener('click', () => {
  $$('#cfgType .pill').forEach(x => x.classList.remove('active')); b.classList.add('active'); state.type = b.dataset.v; state.touched = true;
  otherBox.hidden = state.type !== 'Sonstiges';          // bei „Sonstiges" öffnet sich ein Feld für die nähere Beschreibung
  if (!otherBox.hidden) otherIn.focus({ preventScroll: true });
  renderCfg();
}));
otherIn.addEventListener('input', () => { state.other = otherIn.value.trim(); state.touched = true; renderCfg(); });
$$('#cfgWants .pill').forEach(b => b.addEventListener('click', () => {
  b.classList.toggle('active');
  b.classList.contains('active') ? state.wants.add(b.dataset.v) : state.wants.delete(b.dataset.v); state.touched = true; renderCfg();
}));
sizeIn.addEventListener('input', () => { state.size = +sizeIn.value; state.exact = false; state.touched = true; renderCfg(); });
/* Die Fläche lässt sich auch tippen; der Regler folgt (bis zu seinen Enden), der Preis rechnet mit der genauen Zahl */
numIn.addEventListener('input', () => {
  const v = Math.min(Math.round(+numIn.value), 10000);
  if (!(v > 0)) return;
  state.size = v; state.exact = true; state.touched = true;
  sizeIn.value = Math.min(Math.max(v, 20), 1500);
  renderCfg();
});
numIn.addEventListener('change', () => { numIn.value = state.size; });
renderCfg();
/* Der Hinweis unter dem Regler öffnet die passende Frage und springt dorthin */
$('#cfgFaqLink').addEventListener('click', e => {
  e.preventDefault();
  const q = $('#faq-preis'); q.open = true; q.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

/* ---------- Formular ---------- */
const form = $('#form'), msg = $('#msg');
form.addEventListener('submit', async e => {
  e.preventDefault();
  msg.textContent = 'Wird gesendet …';
  try {
    const res = await fetch('/', { method: 'POST', body: new FormData(form) });
    if (!res.ok) throw new Error(res.status);
    form.reset();
    renderCfg();
    msg.textContent = 'Danke! Ihre Anfrage ist angekommen. Wir melden uns persönlich.';
  } catch (err) {
    msg.textContent = 'Das Senden hat nicht geklappt. Bitte schreiben Sie uns direkt an bastian.a.werner@immbild.de.';
  }
});

/* ---------- Darstellung: Papier oder Nacht ---------- */
(function look() {
  const root = document.documentElement;
  const btns = $$('button[data-look]');   // nur der Schalter Papier | Blaupause, nicht Scan | Zeichnung
  const themeMeta = $('meta[name="theme-color"]');
  function apply(mode) {
    root.dataset.look = mode === 'blaupause' ? 'blaupause' : 'papier';
    btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.look === root.dataset.look)));
    if (themeMeta) themeMeta.setAttribute('content', mode === 'blaupause' ? '#0b2f5b' : '#f3f0e6');
  }
  apply(root.dataset.look === 'blaupause' ? 'blaupause' : 'papier');
  btns.forEach(b => b.addEventListener('click', () => {
    apply(b.dataset.look);
    if (window.immLook) window.immLook.set(b.dataset.look);
  }));
  /* Automatik: Tag = Papier, Nacht = Blaupause, solange niemand selbst gewählt hat (auch wenn die Seite über den Sonnenuntergang offen bleibt) */
  if (window.immLook) setInterval(() => {
    if (window.immLook.manual()) return;
    const m = window.immLook.sun();
    if (m !== root.dataset.look) apply(m);
  }, 60000);
  const d = $('#tbDate');
  if (d) d.textContent = new Date().toLocaleDateString('de-DE', { month: '2-digit', year: 'numeric' });
})();
