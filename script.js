const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(hover: none)').matches;

/* ---------- Header, Menü ---------- */
const header = $('#header');
const nav = $('#nav');
const toggle = $('.nav-toggle');
addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 30), { passive: true });
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
  const hudPct = $('#hudPct'), hudBar = $('#hudBar'), hudPts = $('#hudPts');
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

  let W, H, rs, img, buf32, yaw = -0.55, mx = 0, my = 0, sweep = reduceMotion ? 1 : 0, visible = true, last = 0, lastDraw = 0, scrollP = 0, running = false, hudTick = 0;

  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
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
  const used = () => { if (tip) tip.classList.add('used'); };
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

  /* Zeichnung: Wände, Dachhöhenlinien und Maße aus echten Scan-Daten (zeichnung.json) */
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
          pts.push([a[0] + (b[0] - a[0]) * u + rand() * 0.06 * e, a[1] + (b[1] - a[1]) * u + rand() * 0.06 * e, a[2] + (b[2] - a[2]) * u + rand() * 0.04 * e]);
        }
        return pts;
      };
      j.walls.sort((p, q) => Math.min(p[0], p[2]) - Math.min(q[0], q[2]));
      for (const s of j.walls) {
        walls.push(wob([s[0], s[1], F], [s[2], s[3], F]), wob([s[0], s[1], T], [s[2], s[3], T]));
        walls.push([[s[0], s[1], F], [s[0], s[1], T]], [[s[2], s[3], F], [s[2], s[3], T]]);
      }
      j.roof.sort((p, q) => Math.min(p[0], p[3]) - Math.min(q[0], q[3]));
      draw = { walls, roof: j.roof, dims: j.dims };
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
    const ink = look === 'papier' ? '#14171c' : '#f2f7ff', accent = look === 'papier' ? '#d92b22' : '#ffd23f', halo = look === 'papier' ? '#f3f0e6' : '#0b2f5b';
    const rWalls = Math.min(1, mp / 0.5), rRoof = Math.max(0, Math.min(1, (mp - 0.3) / 0.5)), rDims = Math.max(0, (mp - 0.78) / 0.22);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Wände (Grundriss und Wandhöhe), zeichnen sich von links nach rechts
    const nW = draw.walls.length, shownW = rWalls * nW;
    ctx.beginPath();
    for (let i = 0; i < nW && i < shownW; i++) {
      const pts = draw.walls[i], frac = Math.min(1, shownW - i), last = Math.max(1, Math.ceil((pts.length - 1) * frac));
      let p = P(pts[0][0], pts[0][1], pts[0][2]); ctx.moveTo(p[0], p[1]);
      for (let k = 1; k <= last && k < pts.length; k++) { p = P(pts[k][0], pts[k][1], pts[k][2]); ctx.lineTo(p[0], p[1]); }
    }
    ctx.strokeStyle = ink; ctx.globalAlpha = 0.95; ctx.lineWidth = Math.max(1, 2.0 * rs); ctx.stroke();
    // Dach als Höhenlinien; sie lösen sich beim Hineinzoomen von oben nach unten auf
    if (rRoof > 0) {
      const nR = draw.roof.length, shownR = rRoof * nR;
      ctx.beginPath();
      for (let i = 0; i < nR && i < shownR; i++) {
        const s = draw.roof[i];
        if (s[2] > zc) continue;
        const a = P(s[0], s[1], s[2]), b = P(s[3], s[4], s[5]);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      }
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.9 * Math.min(1, Math.max(0, (zc - 3.6) / 2)); ctx.lineWidth = Math.max(1, 1.5 * rs); ctx.stroke();
    }
    // Maßlinien mit Zahlen
    if (rDims > 0) {
      ctx.globalAlpha = rDims; ctx.strokeStyle = accent; ctx.fillStyle = accent; ctx.lineWidth = Math.max(1, 1.3 * rs);
      ctx.font = '600 ' + Math.round(V.wide ? 12 * rs + 2 : 8.5 * rs + 1) + 'px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center';
      ctx.beginPath();
      for (const d of draw.dims) {
        const a = P(d.p[0], d.p[1], d.p[2]), b = P(d.q[0], d.q[1], d.q[2]);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * 6 * rs, ny = dx / L * 6 * rs;
        ctx.moveTo(a[0] - nx, a[1] - ny); ctx.lineTo(a[0] + nx, a[1] + ny);
        ctx.moveTo(b[0] - nx, b[1] - ny); ctx.lineTo(b[0] + nx, b[1] + ny);
      }
      ctx.stroke();
      for (const d of draw.dims) {
        const a = P(d.p[0], d.p[1], d.p[2]), b = P(d.q[0], d.q[1], d.q[2]);
        const mx2 = (a[0] + b[0]) / 2, my2 = (a[1] + b[1]) / 2 - 7 * rs, label = d.label;
        ctx.lineWidth = 4 * rs; ctx.strokeStyle = halo; ctx.strokeText(label, mx2, my2);
        ctx.fillText(label, mx2, my2);
      }
    }
    ctx.restore();
  }

  /* Schalter Scan | Zeichnung */
  const viewBtns = $$('.view-switch button');
  viewBtns.forEach(b => b.addEventListener('click', () => {
    morphAuto = false; mpTarget = b.dataset.view === 'zeichnung' ? 1 : 0; used();
    if (mpTarget === 1) loadDrawing();
  }));
  let lastView = '';
  function syncView() {
    const v = mpTarget === 1 ? 'zeichnung' : 'scan';
    if (v === lastView) return; lastView = v;
    viewBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  }

  function frame(t) {
    if (!visible || document.hidden) { running = false; return; }
    requestAnimationFrame(frame);
    if (!cloud || t - lastDraw < 32) return;  // höchstens etwa 30 Bilder pro Sekunde
    lastDraw = t;
    const dt = Math.min(80, t - last || 33); last = t;
    if (!reduceMotion) { sweep = Math.min(1, sweep + dt / 5200); yaw += dt * 0.00007; }

    const c = cloud, real = c.real;
    const half = real ? EA : 10;
    scrollP = scrollProgress();
    zoomT = 1 + (ZMAX - 1) * scrollP;
    if (scrollP > 0.03) used();
    zoom += (zoomT - zoom) * 0.22;
    hero.classList.toggle('zoomed', zoomT > 1.25);
    const yw = yaw + dragYaw + mx * 0.35 + scrollP * 1.1;
    const pitch = Math.max(0.3, Math.min(1.5, (real ? 1.08 : 0.5) + dragPitch + my * 0.08 - scrollP * 0.25));
    const look = document.documentElement.dataset.look === 'blaupause' ? 'blaupause' : 'papier';
    const paper = look === 'papier';
    if (real && !draw) loadDrawing();
    if (sweep >= 1 && morphAuto && mpTarget === 0 && draw && !reduceMotion) { if (!morphWait) morphWait = t; if (t - morphWait > 1200) mpTarget = 1; }
    mp += Math.max(-1, Math.min(1, (mpTarget - mp) * 4)) * dt / 3800;
    mp = Math.max(0, Math.min(1, mp));
    const wide = W > 900;
    Object.assign(V, {
      cx: (wide ? W * 0.71 : W * 0.5) * rs, cyy: (wide ? H * 0.54 : 235) * rs,
      scale: Math.min(W, H * 1.3) * (wide ? perM : perMsmall) * rs * (real ? 1 : 2.2) * zoom,
      cy: Math.cos(yw), sy: Math.sin(yw), cp: Math.cos(pitch), sp: Math.sin(pitch),
      cw: canvas.width, ch: canvas.height, rs, wide, real, paper, blue: !paper, mp
    });
    const edge = -half + sweep * 2 * half;

    // Überblick: etwa 45 % der Punkte; beim Heranzoomen kommen die übrigen dazu
    const blend = dichte === 'voll' ? 1 : dichte === 'grob' ? 0 : Math.max(0, Math.min(1, (zoom - 1) / 0.8));
    V.blend = blend;
    // Puppenhaus: ab etwa 1,3-fachem Zoom öffnen sich die Dächer von oben nach unten
    const open = real && dichte !== 'zu' ? Math.max(0, Math.min(1, (zoom - 1.3) / 0.9)) : 0;
    const zc = 12 - open * (12 - 2.55);
    if (real && !inner && (zoomT > 1.05 || (wide && sweep >= 1 && !saveData))) loadInner();

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

/* ---------- Rundgang-Viewer ---------- */
const stage = $('#stage'), poster = $('#poster'), frameEl = $('#frame'), posterTitle = $('#posterTitle');
let current = $('.vt.active').dataset.id;
function resetViewer() {
  frameEl.hidden = true; frameEl.removeAttribute('src'); poster.hidden = false;
}
$$('.vt').forEach(btn => btn.addEventListener('click', () => {
  $$('.vt').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
  btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
  current = btn.dataset.id; posterTitle.textContent = btn.dataset.title;
  resetViewer();
}));
$('#play').addEventListener('click', () => {
  frameEl.src = `https://my.matterport.com/show/?m=${encodeURIComponent(current)}&play=1&qs=1`;
  frameEl.hidden = false; poster.hidden = true;
});

/* ---------- Zielgruppen ---------- */
const who = [
  { t: 'Makler', p: 'Ein Rundgang macht aus einem Inserat eine Besichtigung, die nie ausfällt. Interessenten kommen vorbereitet und die Termine werden weniger, aber besser.', l: ['Vorqualifizierte Interessenten', 'Auch für Auswärtige und Kapitalanleger', 'Mehr Aufmerksamkeit im Portal und im Exposé'] },
  { t: 'Eigentümer', p: 'Wer verkaufen oder vermieten möchte, zeigt sein Objekt von der besten Seite und muss nicht jeden Interessenten persönlich durchführen.', l: ['Weniger Besichtigungen im eigenen Zuhause', 'Ein Link, den jeder weiterleiten kann', 'Dauerhaft abrufbar'] },
  { t: 'Vermieter und Unterkünfte', p: 'Monteurhäuser, Ferienwohnungen und Gästezimmer verkaufen sich über Vertrauen. Gäste sehen vorab, wie es wirklich aussieht.', l: ['Weniger Rückfragen vor der Buchung', 'Ehrlicher Eindruck von Zimmern und Ausstattung', 'Einbindbar auf der eigenen Website'] },
  { t: 'Gewerbe und Hotels', p: 'Büros, Praxen, Läden und Häuser mit Gastronomie lassen sich als digitaler Zwilling präsentieren, planen und dokumentieren.', l: ['Flächen online vermieten', 'Bestand und Raumaufteilung dokumentieren', 'Erster Eindruck für Kunden und Gäste'] },
  { t: 'Architekten', p: 'Der Scan hält den Bestand fest, bevor geplant, umgebaut oder saniert wird. Maße lassen sich später am Rechner prüfen.', l: ['Bestandsaufnahme als digitaler Zwilling', 'Abstimmung mit Bauherren ohne Vor-Ort-Termin', 'Ergänzend Architekturfotografie'] }
];
const whoBody = $('#whoBody');
function showWho(i) {
  const w = who[i];
  $('#whoTitle').textContent = w.t; $('#whoText').textContent = w.p;
  $('#whoList').innerHTML = w.l.map(x => `<li>${x}</li>`).join('');
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

/* ---------- Konfigurator ---------- */
const state = { type: 'Wohnung', size: 120, wants: new Set(['3D-Rundgang']) };
const sizeIn = $('#cfgSize'), sizeOut = $('#cfgSizeOut'), summary = $('#cfgSummary');
function plain() {
  const w = [...state.wants];
  const list = w.length ? w.slice(0, -1).join(', ') + (w.length > 1 ? ' und ' : '') + w.slice(-1) : 'noch keine Leistung gewählt';
  return { w, list };
}
function renderCfg() {
  sizeOut.textContent = state.size >= 1500 ? '1.500 m² und mehr' : state.size + ' m²';
  const { list } = plain();
  summary.innerHTML = `Ich plane ein Projekt für <mark>${state.type}</mark> mit etwa <mark>${state.size >= 1500 ? '1.500 m² und mehr' : state.size + ' m²'}</mark> und wünsche <mark>${list}</mark>.`;
}
$$('#cfgType .pill').forEach(b => b.addEventListener('click', () => {
  $$('#cfgType .pill').forEach(x => x.classList.remove('active')); b.classList.add('active'); state.type = b.dataset.v; renderCfg();
}));
$$('#cfgWants .pill').forEach(b => b.addEventListener('click', () => {
  b.classList.toggle('active');
  b.classList.contains('active') ? state.wants.add(b.dataset.v) : state.wants.delete(b.dataset.v); renderCfg();
}));
sizeIn.addEventListener('input', () => { state.size = +sizeIn.value; renderCfg(); });
$('#cfgGo').addEventListener('click', () => {
  const { list } = plain();
  const size = state.size >= 1500 ? 'mehr als 1.500 m²' : state.size + ' m²';
  $('#msgField').value = `Hallo immbild.,\n\nich plane ein Projekt: ${state.type}, ca. ${size}.\nGewünscht: ${list}.\n\nMeine Fragen und Wünsche:\n`;
});
renderCfg();

/* ---------- Formular ---------- */
const form = $('#form'), msg = $('#msg');
form.addEventListener('submit', async e => {
  e.preventDefault();
  msg.textContent = 'Wird gesendet …';
  try {
    const res = await fetch('/', { method: 'POST', body: new FormData(form) });
    if (!res.ok) throw new Error(res.status);
    form.reset();
    msg.textContent = 'Danke! Ihre Anfrage ist angekommen. Wir melden uns persönlich.';
  } catch (err) {
    msg.textContent = 'Das Senden hat nicht geklappt. Bitte schreiben Sie uns direkt an bastian.a.werner@immbild.de.';
  }
});

/* ---------- Darstellung: Papier oder Nacht ---------- */
(function look() {
  const root = document.documentElement;
  const btns = $$('.look button');
  const themeMeta = $('meta[name="theme-color"]');
  function apply(mode) {
    root.dataset.look = mode === 'blaupause' ? 'blaupause' : 'papier';
    btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.look === root.dataset.look)));
    if (themeMeta) themeMeta.setAttribute('content', mode === 'blaupause' ? '#0b2f5b' : '#f3f0e6');
  }
  apply(root.dataset.look === 'blaupause' ? 'blaupause' : 'papier');
  btns.forEach(b => b.addEventListener('click', () => {
    apply(b.dataset.look);
    try { localStorage.setItem('look', b.dataset.look); } catch (e) {}
  }));
  const d = $('#tbDate');
  if (d) d.textContent = new Date().toLocaleDateString('de-DE', { month: '2-digit', year: 'numeric' });
})();
