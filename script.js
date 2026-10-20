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
  const rnd = (a, b) => a + Math.random() * (b - a);
  const N = innerWidth < 760 ? 3600 : 8000;
  const pts = [];

  const inWindow = (x, y, z, wall) => {
    if (wall === 'front') return (Math.abs(x + 0.9) < 0.28 || Math.abs(x - 0.7) < 0.28) && y > 0.4 && y < 0.95;
    if (wall === 'side') return Math.abs(z) < 0.25 && y > 0.4 && y < 0.95;
    return false;
  };
  const add = (x, y, z, k) => pts.push({ x, y, z, k });

  // Kanten: Gebäudehülle, Giebel, Fenster, Tür, Innenwand
  const edges = [
    [-1.6, 0, 1, 1.6, 0, 1], [1.6, 0, 1, 1.6, 0, -1], [1.6, 0, -1, -1.6, 0, -1], [-1.6, 0, -1, -1.6, 0, 1],
    [-1.6, 1.2, 1, 1.6, 1.2, 1], [1.6, 1.2, 1, 1.6, 1.2, -1], [1.6, 1.2, -1, -1.6, 1.2, -1], [-1.6, 1.2, -1, -1.6, 1.2, 1],
    [-1.6, 0, 1, -1.6, 1.2, 1], [1.6, 0, 1, 1.6, 1.2, 1], [1.6, 0, -1, 1.6, 1.2, -1], [-1.6, 0, -1, -1.6, 1.2, -1],
    [-1.7, 1.95, 0, 1.7, 1.95, 0], [-1.7, 1.2, 1.1, -1.7, 1.95, 0], [-1.7, 1.2, -1.1, -1.7, 1.95, 0],
    [1.7, 1.2, 1.1, 1.7, 1.95, 0], [1.7, 1.2, -1.1, 1.7, 1.95, 0],
    [-1.7, 1.2, 1.1, 1.7, 1.2, 1.1], [-1.7, 1.2, -1.1, 1.7, 1.2, -1.1],
    [-1.18, .4, 1, -.62, .4, 1], [-1.18, .95, 1, -.62, .95, 1], [-1.18, .4, 1, -1.18, .95, 1], [-.62, .4, 1, -.62, .95, 1],
    [.42, .4, 1, .98, .4, 1], [.42, .95, 1, .98, .95, 1], [.42, .4, 1, .42, .95, 1], [.98, .4, 1, .98, .95, 1],
    [-.2, 0, 1, -.2, .8, 1], [.2, 0, 1, .2, .8, 1], [-.2, .8, 1, .2, .8, 1],
    [-.35, 0, -1, -.35, 1.2, -1], [-.35, 0, .25, -.35, 1.2, .25], [-.35, 1.2, -1, -.35, 1.2, .25],
    [-.35, 0, .15, 1.6, 0, .15], [-.35, 1.2, .15, 1.6, 1.2, .15]
  ];
  while (pts.length < N * 0.32) {
    const e = edges[Math.floor(Math.random() * edges.length)], t = Math.random(), j = 0.012;
    add(e[0] + (e[3] - e[0]) * t + rnd(-j, j), e[1] + (e[4] - e[1]) * t + rnd(-j, j), e[2] + (e[5] - e[2]) * t + rnd(-j, j), 'edge');
  }

  while (pts.length < N) {
    const r = Math.random();
    if (r < .17) add(rnd(-1.6, 1.6), 0, rnd(-1, 1), 'floor');
    else if (r < .40) {                      // Außenwände
      const w = Math.floor(Math.random() * 4), y = rnd(0, 1.2);
      if (w === 0) { const x = rnd(-1.6, 1.6); if (!inWindow(x, y, 1, 'front')) add(x, y, 1, 'wall'); }
      else if (w === 1) add(rnd(-1.6, 1.6), y, -1, 'wall');
      else { const z = rnd(-1, 1); if (!inWindow(0, y, z, 'side')) add(w === 2 ? -1.6 : 1.6, y, z, 'wall'); }
    }
    else if (r < .50) add(-0.35, rnd(0, 1.2), rnd(-1, 0.25), 'int');
    else if (r < .58) add(rnd(-0.35, 1.6), rnd(0, 1.2), 0.15, 'int');
    else if (r < .74) {                      // Dach
      const side = Math.random() < .5 ? 1 : -1, t = Math.random(), x = rnd(-1.7, 1.7);
      add(x, 1.2 + (1 - t) * 0.75, side * t * 1.1, 'roof');
    }
    else if (r < .80) {                      // Möbel
      const b = [[-1.2, .25, -0.4, .5, .25, .22], [0.5, .22, -0.5, .5, .22, .3], [1.0, .3, .6, .35, .3, .3]][Math.floor(Math.random() * 3)];
      add(b[0] + rnd(-b[3], b[3]), rnd(0, b[4] * 2), b[2] + rnd(-b[5], b[5]), 'furn');
    }
    else if (r < .92) add(rnd(-3.4, 3.4), 0, rnd(-2.2, 2.4), 'ground');
    else {                                   // Bäume
      const tx = Math.random() < .5 ? -2.4 : 2.5, tz = Math.random() < .5 ? -1.2 : 1.4;
      const a = rnd(0, 6.28), rr = rnd(0, .4);
      add(tx + Math.cos(a) * rr, rnd(.5, 1.3), tz + Math.sin(a) * rr, 'tree');
    }
  }
  pts.sort((a, b) => a.x - b.x);

  const cols = { edge: [255, 244, 190], floor: [120, 130, 140], wall: [241, 210, 82], int: [255, 185, 74], roof: [241, 120, 82], furn: [93, 224, 230], ground: [90, 100, 100], tree: [120, 200, 130] };
  const kinds = Object.keys(cols), LV = 5;
  const kindIdx = {}; kinds.forEach((k, i) => { kindIdx[k] = i; });
  pts.forEach(p => { p.ki = kindIdx[p.k]; });
  const styles = kinds.map(k => Array.from({ length: LV }, (_, l) => {
    const a = (k === 'ground' ? 0.35 : 0.85) * (0.15 + 0.85 * (l + 1) / LV);
    return `rgba(${cols[k][0]},${cols[k][1]},${cols[k][2]},${a.toFixed(2)})`;
  }));
  const buckets = kinds.map(() => Array.from({ length: LV }, () => new Float32Array(N * 3)));
  const counts = new Int32Array(kinds.length * LV);
  const laserBuf = new Float32Array(N * 3);

  let W, H, dpr, yaw = -0.6, mx = 0, my = 0, sweep = reduceMotion ? 1 : 0, visible = true, last = 0, lastDraw = 0, scrollP = 0, running = false, hudTick = 0;

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 1.25);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize(); addEventListener('resize', resize);
  hero.addEventListener('pointermove', e => { mx = (e.clientX / innerWidth - .5) * 2; my = (e.clientY / innerHeight - .5) * 2; });
  addEventListener('scroll', () => { scrollP = Math.min(1, scrollY / innerHeight); }, { passive: true });

  function start() { if (!running && visible && !document.hidden) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; start(); }).observe(hero);
  document.addEventListener('visibilitychange', start);

  function frame(t) {
    if (!visible || document.hidden) { running = false; return; }
    requestAnimationFrame(frame);
    if (t - lastDraw < 32) return;            // höchstens etwa 30 Bilder pro Sekunde
    lastDraw = t;
    const dt = Math.min(80, t - last || 33); last = t;
    if (!reduceMotion) { sweep = Math.min(1, sweep + dt / 4200); yaw += dt * 0.00009; }
    const yw = yaw + mx * 0.35 + scrollP * 1.2;
    const pitch = 0.42 + my * 0.08 - scrollP * 0.2;
    const cy = Math.cos(yw), sy = Math.sin(yw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cx = W > 900 ? W * 0.71 : W * 0.5, cyy = H * (W > 900 ? 0.5 : 0.72);
    const scale = Math.min(W, H * 1.3) * (W > 900 ? 0.17 : 0.14);
    const camZ = 10;
    const edge = -3.6 + sweep * 7.2;

    counts.fill(0);
    let laserN = 0, shown = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.x > edge) break;
      shown++;
      const x1 = p.x * cy - p.z * sy, z1 = p.x * sy + p.z * cy;
      const y2 = (p.y - 0.6) * cp - z1 * sp, z2 = (p.y - 0.6) * sp + z1 * cp;
      const f = camZ / (camZ + z2);
      const sx = cx + x1 * scale * f, sy2 = cyy - y2 * scale * f;
      if (edge - p.x < 0.07) { const o = laserN * 3; laserBuf[o] = sx; laserBuf[o + 1] = sy2; laserBuf[o + 2] = 3.4 * f; laserN++; continue; }
      const near = Math.max(0.15, Math.min(1, f * f * 0.85));
      const lv = Math.min(LV - 1, Math.floor(near * LV));
      const b = p.ki * LV + lv, o = counts[b] * 3;
      const buf = buckets[p.ki][lv];
      buf[o] = sx; buf[o + 1] = sy2; buf[o + 2] = 2.1 * f;
      counts[b]++;
    }

    ctx.clearRect(0, 0, W, H);
    for (let k = 0; k < kinds.length; k++) {
      for (let l = 0; l < LV; l++) {
        const n = counts[k * LV + l];
        if (!n) continue;
        ctx.fillStyle = styles[k][l];
        const buf = buckets[k][l];
        for (let j = 0; j < n; j++) { const o = j * 3; ctx.fillRect(buf[o], buf[o + 1], buf[o + 2], buf[o + 2]); }
      }
    }
    if (laserN) {
      ctx.fillStyle = 'rgba(93,224,230,.95)';
      for (let j = 0; j < laserN; j++) { const o = j * 3; ctx.fillRect(laserBuf[o], laserBuf[o + 1], laserBuf[o + 2], laserBuf[o + 2]); }
    }
    if (sweep < 1 || (++hudTick % 15 === 0)) {
      hudPct.textContent = String(Math.round(sweep * 100)).padStart(3, '0');
      hudBar.style.width = sweep * 100 + '%';
      hudPts.textContent = (Math.round(shown * 38.5)).toLocaleString('de-DE');
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
