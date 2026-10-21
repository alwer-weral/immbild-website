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
    return { n: N, X, Y, Z, C, real: false };
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
    const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n), C = new Uint8Array(n * 3);
    for (let k = 0; k < n; k++) {
      const o = 4 + idx[k] * 9;
      X[k] = dv.getInt16(o, true) / 100; Y[k] = dv.getInt16(o + 2, true) / 100; Z[k] = dv.getInt16(o + 4, true) / 100;
      C[k * 3] = dv.getUint8(o + 6); C[k * 3 + 1] = dv.getUint8(o + 7); C[k * 3 + 2] = dv.getUint8(o + 8);
    }
    return { n, X, Y, Z, C, real: true };
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
  addEventListener('scroll', () => { scrollP = Math.min(1, scrollY / innerHeight); }, { passive: true });

  /* Steuerung: Mausrad zoomt, Ziehen dreht, zwei Finger zoomen */
  let zoom = 1, zoomT = 1, dragYaw = 0, dragPitch = 0;
  const ZMAX = 2.6, tip = $('.cloud-tip');
  const clampZ = v => Math.max(1, Math.min(ZMAX, v));
  const used = () => { if (tip) tip.classList.add('used'); };
  if (tip && matchMedia('(hover: none)').matches) tip.textContent = 'Zwei Finger: zoomen · Wischen: drehen';
  hero.addEventListener('wheel', e => {
    if (e.ctrlKey || scrollY > 2) return;
    // Oben auf der Seite: Rollen nach oben zoomt hinein, nach unten zuerst hinaus, danach scrollt die Seite normal
    if (e.deltaY < 0 || zoomT > 1.001) { e.preventDefault(); zoomT = clampZ(zoomT * Math.exp(-e.deltaY * 0.0018)); used(); }
  }, { passive: false });
  const ptrs = new Map(); let pinch0 = 0, zoom0 = 1;
  hero.addEventListener('pointerdown', e => {
    if (e.button > 0 || e.target.closest('a, button, input')) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = zoomT; }
  });
  hero.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) { ptrs.delete(e.pointerId); return; }
    if (ptrs.size === 2) {
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...ptrs.values()];
      if (pinch0) zoomT = clampZ(zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch0);
      used(); return;
    }
    dragYaw += (e.clientX - p.x) * 0.006;
    dragPitch = Math.max(-0.7, Math.min(0.45, dragPitch + (e.clientY - p.y) * 0.004));
    p.x = e.clientX; p.y = e.clientY; used();
  });
  const endPtr = e => { ptrs.delete(e.pointerId); };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => hero.addEventListener(ev, endPtr));
  $('#zoomIn')?.addEventListener('click', () => { zoomT = clampZ(zoomT * 1.4); used(); });
  $('#zoomOut')?.addEventListener('click', () => { zoomT = clampZ(zoomT / 1.4); used(); });

  function start() { if (!running && visible && !document.hidden) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; start(); }).observe(hero);
  document.addEventListener('visibilitychange', start);

  // Erst die echte Wolke laden (höchstens 3,5 Sekunden), sonst das gebaute Haus zeigen
  const giveUp = new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 3500));
  Promise.race([loadReal(), giveUp])
    .then(c => { EA = 21; EB = 13.5; camZ = 80; zMid = 2.2; cloud = c; })
    .catch(() => { cloud = buildHouse(); });

  function frame(t) {
    if (!visible || document.hidden) { running = false; return; }
    requestAnimationFrame(frame);
    if (!cloud || t - lastDraw < 32) return;  // höchstens etwa 30 Bilder pro Sekunde
    lastDraw = t;
    const dt = Math.min(80, t - last || 33); last = t;
    if (!reduceMotion) { sweep = Math.min(1, sweep + dt / 5200); yaw += dt * 0.00007; }

    const c = cloud, real = c.real;
    const half = real ? EA : 10;
    zoom += (zoomT - zoom) * 0.22;
    hero.classList.toggle('zoomed', zoomT > 1.25);
    const yw = yaw + dragYaw + mx * 0.35 + scrollP * 1.1;
    const pitch = Math.max(0.3, Math.min(1.5, (real ? 1.08 : 0.5) + dragPitch + my * 0.08 - scrollP * 0.25));
    const cy = Math.cos(yw), sy = Math.sin(yw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const wide = W > 900;
    const cx = (wide ? W * 0.71 : W * 0.5) * rs, cyy = (wide ? H * 0.54 : 235) * rs;
    const scale = Math.min(W, H * 1.3) * (wide ? perM : perMsmall) * rs * (real ? 1 : 2.2) * zoom;
    const edge = -half + sweep * 2 * half;
    const cw = canvas.width, ch = canvas.height;

    buf32.fill(0);
    const X = c.X, Y = c.Y, Z = c.Z, C = c.C, n = c.n;
    let shown = 0;
    for (let i = 0; i < n; i++) {
      const x = X[i];
      if (x > edge) break;
      shown++;
      const y = Y[i], z = Z[i];
      const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
      const up = (z - zMid) * cp + y1 * sp, depth = y1 * cp - (z - zMid) * sp;
      const f = camZ / (camZ + depth);
      const px = (cx + x1 * scale * f) | 0, py = (cyy - up * scale * f) | 0;
      if (px < 0 || py < 0 || px >= cw - 3 || py >= ch - 3) continue;
      const laser = edge - x < 0.6;
      let r, g, b, a;
      if (laser) { r = 93; g = 224; b = 230; a = 255; }
      else {
        const rr = Math.sqrt((x / EA) * (x / EA) + (y / EB) * (y / EB));
        const fade = real ? Math.max(0, Math.min(1, (1 - rr) * 3.2)) : 1;
        const shade = Math.max(0.5, Math.min(1.15, 0.62 + (f - 0.85) * 1.5)) * (real ? 1.7 : 1);
        r = Math.min(255, C[i * 3] * shade); g = Math.min(255, C[i * 3 + 1] * shade); b = Math.min(255, C[i * 3 + 2] * shade);
        a = fade * 235;
        if (a < 6) continue;
      }
      const s = Math.max(1, Math.round((laser ? 3.6 : (wide ? 3 : 1.9)) * (1 + (zoom - 1) * 0.8) * f * rs));
      const col = (a << 24) | (b << 16) | (g << 8) | r;
      for (let oy = 0; oy < s; oy++) { const row = (py + oy) * cw + px; for (let ox = 0; ox < s; ox++) buf32[row + ox] = col; }
    }
    ctx.putImageData(img, 0, 0);
    if (sweep < 1 || (++hudTick % 15 === 0)) {
      hudPct.textContent = String(Math.round(sweep * 100)).padStart(3, '0');
      hudBar.style.width = sweep * 100 + '%';
      hudPts.textContent = Math.round(shown / n * (real ? REAL_POINTS : 340000)).toLocaleString('de-DE');
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
