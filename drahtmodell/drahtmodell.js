/* Drahtmodell: ein Wohnhaus, aus Bauzeichnungen (M 1:100) nachgerechnet.
   Reines JavaScript, ohne Bibliothek, ohne Build. Zeichnet auf ein <canvas>.
   Einbinden:  <canvas data-drahtmodell></canvas>  +  <script src="drahtmodell.js" defer></script>
   Maße in Metern. X nach rechts, Y nach hinten (im Grundriss nach oben), Z nach oben.
   Alle Maße sind aus den Zeichnungen berechnet bzw. geschätzt, keine Vermessung. */
(function () {
  'use strict';

  var RAD = Math.PI / 180;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var ease = function (t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ---------- Maße ---------- */
  var W = 14.04, DEP = 13.5;                 // Hauskörper: Breite x Tiefe
  var Z_KG = -2.75, Z_EG = 0, Z_OG = 2.75;   // Geschossebenen
  var EAVE_Z = 3.35, RIDGE_Z = 7.4;          // Traufe (Dachkante) und First
  var OV_E = 0.5, OV_G = 0.4;                // Dachüberstand Traufe / Giebel

  function roofZ(y) {
    var half = DEP / 2 + OV_E;
    return y <= DEP / 2
      ? EAVE_Z + (RIDGE_Z - EAVE_Z) * (y + OV_E) / half
      : EAVE_Z + (RIDGE_Z - EAVE_Z) * (DEP + OV_E - y) / half;
  }

  // Wintergarten: regelmäßiges Achteck an der Rückseite
  var OC = [4.70, 13.94], OR = 2.28;
  var oct = [];
  for (var k = 0; k < 8; k++) {
    var a = (22.5 + 45 * k) * RAD;
    oct.push([OC[0] + OR * Math.cos(a), OC[1] + OR * Math.sin(a)]);
  }
  var ERKER = [[W, 6.7], [15.54, 7.6], [15.54, 9.2], [W, 10.1]];
  var BACK_R = [[W, 12.8], [12.5, 14.3], [10.0, 14.3], [8.8, 13.5], [oct[0][0], 13.5]];

  function foot(niche) {
    var front = niche
      ? [[0, 0], [3.7, 0], [5.8, 1.5], [9.0, 1.5], [10.3, 0], [W, 0]]
      : [[0, 0], [W, 0]];
    return front.concat(ERKER, BACK_R, [oct[0], oct[1], oct[2], oct[3], [oct[3][0], 13.5], [0, 13.5]]);
  }

  /* ---------- Modell in Bauabschnitten ---------- */
  // Stil: k Keller (gestrichelt), w Wand, r Dach, a Akzent, f fein
  function buildModel() {
    var stages = [];
    function stage(label, dur) { var s = { label: label, dur: dur, prisms: [], segs: [] }; stages.push(s); return s; }
    function seg(s, a, b, st) { s.segs.push({ a: a, b: b, s: st }); }
    function line(s, pts, st) { for (var i = 0; i < pts.length - 1; i++) seg(s, pts[i], pts[i + 1], st); }
    function p3(p, z) { return [p[0], p[1], z]; }

    // 1 Keller
    var kg = stage('Kellergeschoss · −2,75 m', 1.7);
    kg.prisms.push({ poly: foot(false), z0: Z_KG, z1: Z_EG, s: 'k', closed: true });

    // 2 Erdgeschoss mit Wintergarten und Erker
    var eg = stage('Erdgeschoss · ±0,00 m', 1.7);
    eg.prisms.push({ poly: foot(true), z0: Z_EG, z1: Z_OG, s: 'w', closed: true });
    eg.prisms.push({ poly: ERKER, z0: Z_OG, z1: 4.7, s: 'a', closed: true });
    var w5 = [[oct[0][0], 13.5], oct[0], oct[1], oct[2], oct[3], [oct[3][0], 13.5]];
    line(eg, w5.map(function (p) { return p3(p, 1.35); }), 'f');       // Fensterband Wintergarten

    // 3 Garage und Außentreppe
    var an = stage('Doppelgarage und Außentreppe', 1.5);
    var gx0 = 12.18, gx1 = 18.54, gy0 = 0, gy1 = -6, ge = 2.65, gr = 3.45;
    an.prisms.push({ poly: [[gx0, gy0], [gx1, gy0], [gx1, gy1], [gx0, gy1]], z0: 0, z1: ge, s: 'w', closed: true });
    [gx0, gx1].forEach(function (x) {
      line(an, [[x, 0, ge], [x, -1.5, gr], [x, -3, ge], [x, -4.5, gr], [x, -6, ge]], 'w');
    });
    seg(an, [gx0, -1.5, gr], [gx1, -1.5, gr], 'w');
    seg(an, [gx0, -4.5, gr], [gx1, -4.5, gr], 'w');
    seg(an, [gx0, -3, ge], [gx1, -3, ge], 'w');
    [-1.5, -4.5].forEach(function (yc) {                                // zwei Tore an der Westseite
      line(an, [[gx0, yc - 1.2, 0], [gx0, yc - 1.2, 2.1], [gx0, yc + 1.2, 2.1], [gx0, yc + 1.2, 0]], 'f');
    });
    // Treppe: 15 Stufen 18,3 / 26, Podest, zweite Treppe nach hinten
    var sx0 = -1.15, sx1 = 0, run = 14 * .26, rise = 15 * .183, py0 = run, py1 = 7.9, by1 = py1 + run;
    for (var i = 0; i < 15; i++) { var y = i * .26, z = (i + 1) * .183; seg(an, [sx0, y, z], [sx1, y, z], 'f'); }
    for (var j = 1; j < 15; j++) { var y2 = py1 + j * .26, z2 = rise - j * .183; seg(an, [sx0, y2, z2], [sx1, y2, z2], 'f'); }
    [sx0, sx1].forEach(function (x) {
      seg(an, [x, 0, 0], [x, run, rise], 'w');
      seg(an, [x, py1, rise], [x, by1, 0], 'w');
    });
    line(an, [[sx0, py0, rise], [sx0, py1, rise], [sx1, py1, rise]], 'w');
    line(an, [[sx0, py0, rise], [sx1, py0, rise]], 'f');
    // Geländer
    line(an, [[sx0, 0, 1], [sx0, py0, rise + 1], [sx0, py1, rise + 1], [sx0, by1, 1]], 'f');
    [[0, 1], [py0, rise + 1], [py1, rise + 1], [by1, 1]].forEach(function (q) { seg(an, [sx0, q[0], q[1] - 1], [sx0, q[0], q[1]], 'f'); });

    // 4 Obergeschoss (Wände unter dem Dach, Giebelwände)
    var og = stage('Obergeschoss · +2,75 m', 1.5);
    var wallTop = roofZ(0);
    og.prisms.push({ poly: [[0, 0], [W, 0], [W, DEP], [0, DEP]], z0: Z_OG, z1: wallTop, s: 'w', closed: true });
    [0, W].forEach(function (x) { line(og, [[x, 0, wallTop], [x, DEP / 2, RIDGE_Z], [x, DEP, wallTop]], 'w'); });

    // 5 Dach: Satteldach 28°
    var ro = stage('Satteldach · 28° · First +7,40 m', 2.0);
    var x0 = -OV_G, x1 = W + OV_G, yF = -OV_E, yB = DEP + OV_E, ym = DEP / 2;
    line(ro, [[x0, yF, EAVE_Z], [x1, yF, EAVE_Z], [x1, yB, EAVE_Z], [x0, yB, EAVE_Z], [x0, yF, EAVE_Z]], 'r');
    line(ro, [[x0, yF, EAVE_Z], [x0, ym, RIDGE_Z], [x1, ym, RIDGE_Z], [x1, yF, EAVE_Z]], 'r');
    line(ro, [[x0, yB, EAVE_Z], [x0, ym, RIDGE_Z]], 'r');
    line(ro, [[x1, yB, EAVE_Z], [x1, ym, RIDGE_Z]], 'r');
    for (var bx = x0 + .72; bx < x1 - .3; bx += .72) {                 // Stehfalz-Bahnen
      seg(ro, [bx, yF, EAVE_Z], [bx, ym, RIDGE_Z], 'rf');
      seg(ro, [bx, ym, RIDGE_Z], [bx, yB, EAVE_Z], 'rf');
    }
    // Giebel-Gaube über dem Eingang
    var dxl = 5.95, dxm = 7.45, dxr = 8.95, dy = -.05, dz = roofZ(dy), da = 5.3, dy2 = (da - EAVE_Z) / ((RIDGE_Z - EAVE_Z) / (DEP / 2 + OV_E)) - OV_E;
    line(ro, [[dxl, dy, dz], [dxm, dy, da], [dxr, dy, dz], [dxl, dy, dz]], 'r');
    line(ro, [[dxl, dy, dz], [dxm, dy2, da], [dxr, dy, dz]], 'r');
    seg(ro, [dxm, dy, da], [dxm, dy2, da], 'r');

    // 6 Aufbauten: Wintergarten-Pyramide, Erkerdach, Schornsteine
    var au = stage('Wintergarten, Erker, Schornsteine', 1.6);
    var apex = [OC[0], OC[1], 4.7];
    oct.forEach(function (o) { seg(au, [o[0], o[1], Z_OG], apex, 'a'); });
    var ea = [14.9, 8.4, 5.7];
    ERKER.forEach(function (e) { seg(au, [e[0], e[1], 4.7], ea, 'a'); });
    function chimney(xa, xb, ya, yb, zb, zt) {
      var c = [[xa, ya], [xb, ya], [xb, yb], [xa, yb]];
      au.prisms.push({ poly: c, z0: zb, z1: zt, s: 'w', closed: true });
    }
    chimney(2.7, 3.3, 5.1, 5.7, 6.5, 7.8);
    chimney(8.4, 9.8, 9.85, 11.2, 5.0, 6.6);

    // 7 Fenster und Türen: nur Umrisse, abgelesen aus den Ansichten
    var op = stage('Fenster und Türen', 2.4);
    // fac: Wandstück von P0 nach P1; a = X-Wert (bei senkrechter Wand der Y-Wert) entlang der Wand
    function fac(P0, P1) {
      var dx = P1[0] - P0[0], dy = P1[1] - P0[1], byX = Math.abs(dx) > 1e-6;
      var a0 = byX ? P0[0] : P0[1], a1 = byX ? P1[0] : P1[1];
      return function (a, z) { var t = (a - a0) / (a1 - a0); return [P0[0] + dx * t, P0[1] + dy * t, z]; };
    }
    // kind: r Rechteck, a Rundbogen, t Dreieck, d Doppeltür
    function hole(f, aa, bb, z0, z1, kind) {
      var A = f(aa, z0), B = f(bb, z0), mid = (aa + bb) / 2, i;
      if (kind === 't') { line(op, [f(aa, z0), f(mid, z1), f(bb, z0), f(aa, z0)], 'o'); return; }
      if (kind === 'a') {
        var r = Math.hypot(B[0] - A[0], B[1] - A[1]) / 2, zs = z1 - r, pts = [f(aa, z0)];
        for (i = 0; i <= 6; i++) { var ph = Math.PI * i / 6; pts.push(f(mid - (mid - aa) * Math.cos(ph), zs + r * Math.sin(ph))); }
        pts.push(f(bb, z0), f(aa, z0));
        line(op, pts, 'o'); return;
      }
      line(op, [f(aa, z0), f(aa, z1), f(bb, z1), f(bb, z0), f(aa, z0)], 'o');
      if (kind === 'd') seg(op, f(mid, z0), f(mid, z1), 'o');
    }
    var fFront = fac([0, 0], [3.7, 0]), fNiche = fac([5.8, 1.5], [9.0, 1.5]);
    var fDiagL = fac([3.7, 0], [5.8, 1.5]), fDiagR = fac([10.3, 0], [9.0, 1.5]);
    var fWest = fac([0, 0], [0, DEP]), fEast = fac([W, 0], [W, 12.8]), fErker = fac([15.54, 7.6], [15.54, 9.2]);
    var fBackL = fac([0, DEP], [oct[3][0], DEP]), fBackM = fac([8.8, DEP], [oct[0][0], DEP]);
    var fBump = fac([12.5, 14.3], [10.0, 14.3]), fChamE = fac([W, 12.8], [12.5, 14.3]), fChamW = fac([8.8, DEP], [10.0, 14.3]);
    // Vorderseite
    hole(fFront, 1.0, 1.9, 1.2, 2.35, 'a');  hole(fFront, 2.85, 3.77, 1.2, 2.35, 'a');
    hole(fNiche, 6.4, 8.4, 0, 2.2, 'd');
    hole(fDiagL, 4.35, 5.15, 1.25, 1.95, 't'); hole(fDiagR, 9.25, 10.05, 1.25, 1.95, 't');
    // Westgiebel (Seite mit Außentreppe)
    hole(fWest, 7.97, 8.9, 3.8, 5.2, 'a');   hole(fWest, 9.0, 9.96, 3.8, 5.2, 'a');
    seg(op, fWest(7.85, 3.4), fWest(10.1, 3.4), 'f');                    // Blumenkasten
    hole(fWest, 4.7, 5.66, 2.75, 5.2, 'a');                              // Tür zum Podest
    hole(fWest, 7.97, 8.5, 0.94, 2.2, 'r');
    hole(fWest, 2.4, 4.4, 1.25, 2.1, 't');   hole(fWest, 2.6, 4.3, 3.7, 4.3, 't');
    // Ostgiebel
    hole(fEast, 2.2, 3.1, 1.15, 2.55, 'a');
    hole(fEast, 2.8, 4.5, 4.1, 4.9, 't');    hole(fEast, 5.24, 6.92, 4.1, 4.9, 't');
    hole(fEast, 4.3, 6.5, 1.15, 2.5, 't');
    hole(fErker, 7.95, 8.85, 0.15, 4.4, 'r');                            // hohes Erkerfenster
    [1.5, 2.9].forEach(function (z) { seg(op, fErker(7.95, z), fErker(8.85, z), 'o'); });
    // Rückseite
    hole(fChamE, 12.96, 13.71, 0.1, 2.4, 'a'); hole(fBump, 10.3, 12.0, 0.1, 2.5, 'a');
    hole(fChamW, 8.85, 9.45, 0.1, 2.4, 'a');   hole(fBackM, 8.35, 7.15, 0.1, 2.4, 'a');
    hole(fBackL, 0.96, 2.28, 0.1, 2.4, 'a');
    // Dachfenster: Gaubenfenster vorn, zwei Glasflächen im Rückdach neben dem Wintergarten
    var gy = dy;                                                         // Gaube sitzt auf Y = dy
    line(op, [[6.3, gy, 3.75], [dxm, gy, 5.0], [8.6, gy, 3.75], [6.3, gy, 3.75]], 'o');
    seg(op, [dxm, gy, 3.75], [dxm, gy, 5.0], 'o');
    function roofPane(xa, xb, za, zb) {                                  // Rechteck auf der Rückdachfläche
      var ya = backY(za), yt = backY(zb);
      line(op, [[xa, ya, za], [xb, ya, za], [xb, yt, zb], [xa, yt, zb], [xa, ya, za]], 'o');
    }
    function backY(z) { return DEP + OV_E - (z - EAVE_Z) / ((RIDGE_Z - EAVE_Z) / (DEP / 2 + OV_E)); }
    roofPane(2.75, 3.95, 3.45, 4.3);
    roofPane(4.05, 4.55, 3.95, 4.4);
    // Wintergarten: Pfosten der Glaswand
    [[[oct[0][0], DEP], oct[0]], [oct[0], oct[1]], [oct[1], oct[2]], [oct[2], oct[3]], [oct[3], [oct[3][0], DEP]]].forEach(function (e, n) {
      var cuts = (n === 0 || n === 4) ? [.5] : [1 / 3, 2 / 3];
      cuts.forEach(function (c) { var x = lerp(e[0][0], e[1][0], c), y = lerp(e[0][1], e[1][1], c); seg(op, [x, y, 0.05], [x, y, Z_OG], 'f'); });
    });

    // Längen für Teil-Zeichnung vorberechnen
    stages.forEach(function (s) {
      s.len = 0;
      s.segs.forEach(function (g) { g.l = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1], g.b[2] - g.a[2]); s.len += g.l; });
    });
    return stages;
  }

  /* ---------- Darstellung ---------- */
  var STYLE = {
    k:  { c: 'cyan', a: .6,  w: 1,   dash: [5, 5] },
    w:  { c: 'ink',  a: .92, w: 1.4 },
    r:  { c: 'gold', a: .98, w: 1.5 },
    rf: { c: 'gold', a: .34, w: .8 },
    a:  { c: 'cyan', a: .95, w: 1.2 },
    f:  { c: 'ink',  a: .34, w: .9 },
    o:  { c: 'ink',  a: .7,  w: 1 },
    g:  { c: 'ink',  a: .13, w: .8 }
  };

  function readColors(el) {
    var cs = getComputedStyle(el);
    var get = function (n, d) { var v = cs.getPropertyValue(n).trim(); return v || d; };
    return { ink: get('--wm-ink', '#f3f1ea'), gold: get('--wm-gold', '#f1d252'), cyan: get('--wm-cyan', '#5de0e6') };
  }

  function mount(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var stages = buildModel();
    var still = opts.still != null;                      // Standbild zu festem Zeitpunkt (Test, Vorschaubild)
    var reduce = still || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    var colors = readColors(canvas);

    // Zeitplan
    var starts = [], t0 = .35, overlap = .25;
    stages.forEach(function (s, i) { starts.push(t0); t0 += s.dur - overlap; });
    var TB = t0 + overlap + .4;                          // Ende des Aufbaus

    var st = {
      t: still ? opts.still : reduce ? TB + 1 : 0, spin: !reduce, spinDeg: opts.yawDeg || 0,
      uYaw: 0, uPitch: 0, drag: null, started: false, visible: false, stageIdx: -1
    };
    var W_, H_, DPR = 1, k = 1, cx = 0, cy = 0;
    var CX = 8.5, CY = 5, CZ = 1, DIST = 80, R = 16;
    var yaw = 0, pitch = 0;

    function resize() {
      var r = canvas.getBoundingClientRect();
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W_ = Math.max(1, Math.round(r.width)); H_ = Math.max(1, Math.round(r.height));
      canvas.width = W_ * DPR; canvas.height = H_ * DPR;
      k = Math.min(W_ / 25, H_ / 20);
      cx = W_ / 2; cy = H_ / 2 + H_ * .02;
      draw();
    }

    function proj(p) {
      var x = p[0] - CX, y = p[1] - CY, z = p[2] - CZ;
      var cs = Math.cos(yaw), sn = Math.sin(yaw);
      var x1 = x * cs - y * sn, y1 = x * sn + y * cs;
      var cp = Math.cos(pitch), sp = Math.sin(pitch);
      var v = z * cp + y1 * sp, w = y1 * cp - z * sp;
      var f = DIST / (DIST + w);
      return [cx + k * x1 * f, cy - k * v * f, w];
    }

    function stroke(a, b, style, fade) {
      var A = proj(a), B = proj(b), S = STYLE[style];
      var w = (A[2] + B[2]) / 2;
      var depth = .45 + .55 * clamp(1 - (w + R) / (2 * R), 0, 1);
      ctx.globalAlpha = S.a * depth * (fade == null ? 1 : fade);
      ctx.strokeStyle = colors[S.c];
      ctx.lineWidth = S.w;
      ctx.setLineDash(S.dash || []);
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
    }

    function lerp3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

    var pen = null;

    function drawPrism(pr, p) {
      var n = pr.poly.length, ec = pr.closed ? n : n - 1, i;
      var e1 = clamp(p / .35, 0, 1), e2 = ease(clamp((p - .35) / .65, 0, 1));
      var zt = pr.z0 + (pr.z1 - pr.z0) * e2;
      var total = 0, ls = [];
      for (i = 0; i < ec; i++) { var A = pr.poly[i], B = pr.poly[(i + 1) % n]; var l = Math.hypot(B[0] - A[0], B[1] - A[1]); ls.push(l); total += l; }
      var left = e1 * total;
      for (i = 0; i < ec && left > 0; i++) {
        var a = pr.poly[i], b = pr.poly[(i + 1) % n], f = Math.min(1, left / ls[i]);
        var pa = [a[0], a[1], pr.z0], pb = [b[0], b[1], pr.z0];
        stroke(pa, f < 1 ? lerp3(pa, pb, f) : pb, pr.s);
        left -= ls[i];
      }
      if (e2 > 0) {
        pr.poly.forEach(function (q) { stroke([q[0], q[1], pr.z0], [q[0], q[1], zt], pr.s); });
        for (i = 0; i < ec; i++) {
          var c = pr.poly[i], d = pr.poly[(i + 1) % n];
          stroke([c[0], c[1], zt], [d[0], d[1], zt], pr.s);
        }
      }
    }

    function drawStage(s, p) {
      if (p <= 0) return;
      s.prisms.forEach(function (pr) { drawPrism(pr, p); });
      var sp = s.prisms.length ? clamp((p - .3) / .7, 0, 1) : p;
      var left = sp * s.len;
      for (var i = 0; i < s.segs.length && left > 0; i++) {
        var g = s.segs[i];
        if (left >= g.l) { stroke(g.a, g.b, g.s); left -= g.l; }
        else { var e = lerp3(g.a, g.b, left / g.l); stroke(g.a, e, g.s); if (p < 1) pen = e; left = 0; }
      }
    }

    function drawGround(fade) {
      if (fade <= 0) return;
      var step = 3, x, y;
      for (x = -6; x <= 24; x += step) for (y = -9; y < 21; y += step) {
        var d = Math.hypot(x - 8.5, y + step / 2 - 5) / 17;
        if (d < 1) stroke([x, y, 0], [x, y + step, 0], 'g', (1 - d * d) * fade);
      }
      for (y = -9; y <= 21; y += step) for (x = -6; x < 24; x += step) {
        var e = Math.hypot(x + step / 2 - 8.5, y - 5) / 17;
        if (e < 1) stroke([x, y, 0], [x + step, y, 0], 'g', (1 - e * e) * fade);
      }
    }

    function camera() {
      var tb = clamp(st.t / TB, 0, 1), e = ease(tb);
      var basePitch = lerp(88, 31, e) * RAD;
      var baseYaw = lerp(0, -38, e) * RAD + st.spinDeg * RAD;
      yaw = baseYaw + st.uYaw;
      pitch = clamp(basePitch + st.uPitch, 6 * RAD, 90 * RAD);
    }

    function draw() {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W_, H_);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      camera();
      pen = null;
      drawGround(clamp(st.t / 1.2, 0, 1));
      var cur = -1;
      stages.forEach(function (s, i) {
        var p = clamp((st.t - starts[i]) / s.dur, 0, 1);
        if (p > 0) cur = i;
        drawStage(s, p);
      });
      if (cur !== st.stageIdx) { st.stageIdx = cur; if (opts.onStage) opts.onStage(cur >= 0 ? stages[cur].label : '', cur, stages.length); }
      if (pen) {
        var P = proj(pen);
        ctx.setLineDash([]);
        ctx.globalAlpha = .25; ctx.fillStyle = colors.gold; ctx.beginPath(); ctx.arc(P[0], P[1], 7, 0, 6.283); ctx.fill();
        ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(P[0], P[1], 2.2, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Takt
    var last = 0, raf = 0;
    function frame(now) {
      raf = 0;
      var dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
      if (st.started && !reduce) {
        st.t += dt;
        if (st.t > TB && st.spin && !st.drag) st.spinDeg += 7 * dt;
      }
      draw();
      if (st.visible && !reduce) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }

    // Sichtbarkeit: Animation erst starten, wenn man sie sieht
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          st.visible = e.isIntersecting;
          if (st.visible) { st.started = true; kick(); }
        });
      }, { threshold: .25 }).observe(canvas);
    } else { st.visible = true; st.started = true; kick(); }

    // Bedienung: ziehen = drehen
    canvas.style.touchAction = 'pan-y';
    canvas.addEventListener('pointerdown', function (e) {
      st.drag = { x: e.clientX, y: e.clientY, yaw: st.uYaw, pitch: st.uPitch, touch: e.pointerType === 'touch' };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!st.drag) return;
      st.uYaw = st.drag.yaw + (e.clientX - st.drag.x) * .008;
      if (!st.drag.touch) st.uPitch = st.drag.pitch + (e.clientY - st.drag.y) * .006;
      if (reduce || !st.visible) draw();
    });
    var endDrag = function () { st.drag = null; if (reduce) draw(); };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('dblclick', function () { st.uYaw = 0; st.uPitch = 0; if (reduce) draw(); });
    canvas.tabIndex = 0;
    canvas.addEventListener('keydown', function (e) {
      var m = { ArrowLeft: [-.12, 0], ArrowRight: [.12, 0], ArrowUp: [0, -.08], ArrowDown: [0, .08] }[e.key];
      if (!m) return;
      e.preventDefault(); st.uYaw += m[0]; st.uPitch += m[1]; if (reduce) draw();
    });

    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
    resize();

    return {
      restart: function () { st.t = reduce ? TB + 1 : 0; st.spinDeg = 0; st.uYaw = 0; st.uPitch = 0; st.stageIdx = -1; st.started = true; kick(); draw(); },
      toggleSpin: function () { st.spin = !st.spin; return st.spin; },
      stats: function () { return { stages: stages.length, segments: stages.reduce(function (n, s) { return n + s.segs.length + s.prisms.length; }, 0), duration: TB }; },
      setTime: function (t) { st.t = t; st.started = false; draw(); },
      recolor: function () { colors = readColors(canvas); draw(); },
      setView: function (yawDeg, pitchDeg) { st.spinDeg = yawDeg; st.uPitch = pitchDeg * RAD; draw(); }
    };
  }

  window.Drahtmodell = { mount: mount };
  document.addEventListener('DOMContentLoaded', function () {
    var c = document.querySelector('canvas[data-drahtmodell]');
    if (c && !c.dataset.manual) window.drahtmodellInstance = mount(c);
  });
})();
