/* Aufmaßzeichnung: Außenansicht aus der Punktwolke als Stiftzeichnung.
   Zeichnet aus aufmass.json (Dachflächen als Messzellen mit Ebenen, Wände, Grat- und Kehllinien, Höhenschraffur)
   eine Axonometrie mit verdeckten Kanten. Reines JavaScript auf einem <canvas>, keine Bibliothek.
   Sichtbarkeit: kleiner Tiefenpuffer; Kanten werden nur dort gezeichnet, wo sie nicht verdeckt sind. */
(function () {
  'use strict';
  var RAD = Math.PI / 180;

  function comma(v, d) { return v.toFixed(d).replace('.', ','); }
  var LIGHT = (function () { var v = [-.55, -.6, .6], n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; })();

  function convexHull(P) {
    var pts = P.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var cross = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }, lo = [], up = [], i;
    for (i = 0; i < pts.length; i++) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop(); lo.push(pts[i]); }
    for (i = pts.length - 1; i >= 0; i--) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], pts[i]) <= 0) up.pop(); up.push(pts[i]); }
    lo.pop(); up.pop(); return lo.concat(up);
  }
  function clipConvexLine(p0, p1, poly) {      // Strecke gegen konvexes Polygon (gegen den Uhrzeigersinn)
    var t0 = 0, t1 = 1, dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length], ex = b[0] - a[0], ey = b[1] - a[1];
      var num = ex * (p0[1] - a[1]) - ey * (p0[0] - a[0]), den = ex * dy - ey * dx;
      if (Math.abs(den) < 1e-12) { if (num < 0) return null; continue; }
      var t = -num / den; if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
      if (t0 > t1) return null;
    }
    return [[p0[0] + t0 * dx, p0[1] + t0 * dy], [p0[0] + t1 * dx, p0[1] + t1 * dy]];
  }

  /* ---------- Szene aus den Daten ---------- */
  function buildScene(data) {
    var tris = [], edges = [], hatch = [], dims = [];
    var mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9, mxz = -1e9, mnz = 1e9;
    function bound(p) { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]); mnz = Math.min(mnz, p[2]); mxz = Math.max(mxz, p[2]); }
    function tri(a, b, c, bi) { tris.push([a, b, c, bi]); }
    function edge(pts, cls, grp, bi) { pts.forEach(bound); edges.push({ pts: pts, cls: cls, grp: grp, bi: bi, id: edges.length + 1 }); }

    data.buildings.forEach(function (b, bi) {
      var C = b.cell, g = b.grid, rows = g.rows, P = b.planes;
      // Dachfläche aus Messzellen
      for (var r = 0; r < rows.length; r++) {
        var iy = g.iy1 - r, row = rows[r];
        for (var c = 0; c < row.length; c++) {
          var pl = P[+row[c]], ix = g.ix0 + c, x0 = ix * C, x1 = x0 + C, y0 = iy * C, y1 = y0 + C;
          var z = function (x, y) { return pl[0] * x + pl[1] * y + pl[2]; };
          var A = [x0, y0, z(x0, y0)], B = [x1, y0, z(x1, y0)], D = [x1, y1, z(x1, y1)], E = [x0, y1, z(x0, y1)];
          tri(A, B, D, bi); tri(A, D, E, bi);
        }
      }
      // Wände
      b.walls.forEach(function (w) { w.q.forEach(function (q) { tri(q[0], q[1], q[2], bi); tri(q[0], q[2], q[3], bi); }); });
      if (b.loggia) {
        b.loggia.quads.forEach(function (q) { tri(q.p[0], q.p[1], q.p[2], bi); tri(q.p[0], q.p[2], q.p[3], bi); });
        b.loggia.boxes.forEach(function (bx) {
          var X = bx.x, Y = bx.y, Z = bx.z, v = function (x, y, z) { return [X[x], Y[y], Z[z]]; };
          [[0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1], [0, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1], [0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1], [1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1], [0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1]].forEach(function (f) {
            var a = v(f[0], f[1], f[2]), c = v(f[3], f[4], f[5]), d = v(f[6], f[7], f[8]), e = v(f[9], f[10], f[11]);
            tri(a, c, d, bi); tri(a, d, e, bi);
          });
          for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) { edge([v(0, i, j), v(1, i, j)], 'p', 2, bi); edge([v(i, 0, j), v(i, 1, j)], 'p', 2, bi); edge([v(i, j, 0), v(i, j, 1)], 'p', 2, bi); }
        });
        b.loggia.quads.forEach(function (q) { if (q.k === 'rueck' || q.k === 'ost') edge(q.p.concat([q.p[0]]), 'w', 2, bi); });
        b.loggia.lines.forEach(function (l) { edge(l, 'o', 2, bi); });
      }
      // Schornsteine
      (b.chimneys || []).forEach(function (ch) {
        var xa = ch.x[0], xb = ch.x[1], ya = ch.y[0], yb = ch.y[1], z0 = ch.base, z1 = ch.top;
        var q = [[xa, ya], [xb, ya], [xb, yb], [xa, yb]];
        for (var k = 0; k < 4; k++) {
          var p = q[k], n = q[(k + 1) % 4];
          tri([p[0], p[1], z0], [n[0], n[1], z0], [n[0], n[1], z1], bi); tri([p[0], p[1], z0], [n[0], n[1], z1], [p[0], p[1], z1], bi);
        }
        tri([xa, ya, z1], [xb, ya, z1], [xb, yb, z1], bi); tri([xa, ya, z1], [xb, yb, z1], [xa, yb, z1], bi);
        for (var k2 = 0; k2 < 4; k2++) { edge([[q[k2][0], q[k2][1], z0], [q[k2][0], q[k2][1], z1]], 'w', 3, bi); edge([[q[k2][0], q[k2][1], z1], [q[(k2 + 1) % 4][0], q[(k2 + 1) % 4][1], z1]], 'w', 3, bi); }
      });

      // Linien
      var gz0 = b.ground, x0b = b.x[0], x1b = b.x[1], y0b = b.y[0], y1b = b.y[1];
      var base = [[x0b, y0b, gz0], [x1b, y0b, gz0], [x1b, y1b, gz0], [x0b, y1b, gz0]];
      for (var k3 = 0; k3 < 4; k3++) edge([base[k3], base[(k3 + 1) % 4]], 'g', 1, bi);            // Fußlinie
      b.walls.forEach(function (w) {
        edge(w.top, 'w', 2, bi);                                                                  // Wandoberkante
        var q0 = w.q[0], ql = w.q[w.q.length - 1];
        if (w.side === 'W') edge([ql[1], ql[2]], 'w', 2, bi); else edge([q0[0], q0[3]], 'w', 2, bi);   // Ecken (SW, SO, NO, NW)
      });
      (b.extras || []).forEach(function (e) { edge(e.p, e.c, e.c === 'p' ? 1 : 2, bi); });                // Fenster, Türen, Vorbau, Terrasse
      b.outline.forEach(function (o) { edge(o, 'r', 3, bi); });                                 // Dachrand
      b.lines.forEach(function (l) { edge([[l[0], l[1], l[2]], [l[3], l[4], l[5]]], 'k', 3, bi); }); // Grat, Walm, Kehle
      b.hatch.forEach(function (h) {
        var pl = P[h[0]], lit = (-pl[0] * LIGHT[0] - pl[1] * LIGHT[1] + LIGHT[2]) / Math.hypot(pl[0], pl[1], 1);
        hatch.push({ lit: lit, a: [h[1], h[2], h[3]], b: [h[4], h[5], h[6]], bi: bi, n: hatch.length });
      });
      // Schattenseiten der Wände: senkrechte Striche
      var NORM = { S: [0, -1], E: [1, 0], N: [0, 1], W: [-1, 0] };
      b.walls.forEach(function (w) {
        var nl = NORM[w.side], lit = nl[0] * LIGHT[0] + nl[1] * LIGHT[1];
        if (lit > .15) return;
        w.q.forEach(function (q) {
          var Ls = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]);
          for (var s = .22; s < Ls - .1; s += .45) {
            var u = s / Ls, px = q[0][0] + (q[1][0] - q[0][0]) * u, py = q[0][1] + (q[1][1] - q[0][1]) * u, zb = q[0][2], zt = q[3][2] + (q[2][2] - q[3][2]) * u;
            hatch.push({ lit: -1, wall: true, a: [px, py, zb], b: [px, py, zb + (zt - zb) * .55], bi: bi, n: hatch.length });
          }
        });
      });
      // Schlagschatten: Fußabdruck, vom Licht weg verschoben, mit Strichen parallel zur Schattenkante
      var eaveH = 99, ridgeH = 0; b.outline.forEach(function (o) { o.forEach(function (p) { eaveH = Math.min(eaveH, p[2]); ridgeH = Math.max(ridgeH, p[2]); }); });
      var lx = -LIGHT[0], ly = -LIGHT[1], ll = Math.hypot(lx, ly), sh = (eaveH - gz0) * .75 * ll / LIGHT[2];
      var sdx = lx / ll * sh, sdy = ly / ll * sh;
      var fp = [[x0b, y0b], [x1b, y0b], [x1b, y1b], [x0b, y1b]], pts2 = fp.concat(fp.map(function (p) { return [p[0] + sdx, p[1] + sdy]; }));
      var hull = convexHull(pts2), ux = lx / ll, uy = ly / ll, wx = -uy, wy = ux, gap = .32;       // u: Richtung des Schattens, w: quer dazu
      var smin = 1e9, smax = -1e9; hull.forEach(function (p) { var v = p[0] * ux + p[1] * uy; smin = Math.min(smin, v); smax = Math.max(smax, v); });
      for (var sv = smin + gap / 2; sv < smax; sv += gap) {
        var seg = clipConvexLine([ux * sv - wx * 60, uy * sv - wy * 60], [ux * sv + wx * 60, uy * sv + wy * 60], hull);
        if (seg && Math.hypot(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]) > .2) hatch.push({ lit: -2, shadow: true, a: [seg[0][0], seg[0][1], gz0], b: [seg[1][0], seg[1][1], gz0], bi: bi, n: hatch.length });
      }
      // Maße: Länge, Tiefe, Firsthöhe, Traufhöhe
      var gz1 = gz0, topz = 0, eave = 99;
      b.outline.forEach(function (o) { o.forEach(function (p) { topz = Math.max(topz, p[2]); eave = Math.min(eave, p[2]); }); });
      var off = 1.3;
      dims.push({ a: [x0b, y0b - off, gz1], b: [x1b, y0b - off, gz1], ea: [x0b, y0b, gz1], eb: [x1b, y0b, gz1], label: comma(x1b - x0b, 1) + ' m', bi: bi });
      dims.push({ a: [x1b + off, y0b, gz1], b: [x1b + off, y1b, gz1], ea: [x1b, y0b, gz1], eb: [x1b, y1b, gz1], label: comma(y1b - y0b, 1) + ' m', bi: bi });
      dims.push({ a: [x0b - 0.8, y0b - 0.8, gz1], b: [x0b - 0.8, y0b - 0.8, topz], ea: [x0b, y0b, gz1], eb: [x0b, y0b, topz], label: comma(topz - gz1, 1) + ' m', bi: bi, vert: true });
    });

    // Reihenfolge des Aufbaus: Fußlinien, Wände, Dachrand, Grate, Schraffur, Maße
    edges.sort(function (a, b) { return a.grp - b.grp || a.bi - b.bi || a.id - b.id; });
    var t = 0.3;
    edges.forEach(function (e) {
      var L = 0; for (var i = 1; i < e.pts.length; i++) L += Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1], e.pts[i][2] - e.pts[i - 1][2]);
      e.len = L; e.t0 = t; e.dur = Math.max(.18, L / 26); t += e.dur * 0.6;
    });
    var tHatch = t;
    hatch.forEach(function (h, i) { h.t0 = tHatch + i * 0.016; h.dur = .3; });
    var tDims = tHatch + hatch.length * 0.016 + 0.2;
    dims.forEach(function (d, i) { d.t0 = tDims + i * .18; d.dur = .45; });
    var total = tDims + dims.length * .18 + .7;
    hatch.forEach(function (h) { h.a.forEach(function () {}); bound(h.a); bound(h.b); });
    return { tris: tris, edges: edges, hatch: hatch, dims: dims, planes: data.buildings.map(function (b) { return b.planes; }), total: total,
             cx: (mnx + mxx) / 2, cy: (mny + mxy) / 2, cz: (mnz + mxz) / 2, rad: Math.max(mxx - mnx, mxy - mny) / 2, hz: mxz - mnz };
  }

  /* ---------- Zeichnen ---------- */
  function mount(canvas, data, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var S = buildScene(data);
    var reduce = opts.still != null || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    var st = { t: opts.still != null ? opts.still : (reduce ? S.total + 1 : 0), yaw: (opts.yawDeg != null ? opts.yawDeg : 38) * RAD, pitch: (opts.pitchDeg != null ? opts.pitchDeg : 34) * RAD,
               uYaw: 0, uPitch: 0, spin: !reduce, drag: null, visible: false, started: false, zoom: opts.zoom || 1, focus: opts.focus || null };
    var W = 1, H = 1, DPR = 1, k = 1, ox = 0, oy = 0, zw = 1, zh = 1, ZS = .5, zb = new Float32Array(1);
    var colors = readColors();

    function readColors() {
      var cs = getComputedStyle(canvas), g = function (n, d) { var v = cs.getPropertyValue(n).trim(); return v || d; };
      return { ink: g('--wm-ink', '#14171c'), accent: g('--wm-gold', '#d92b22'), muted: g('--wm-muted', '#565a64') };
    }
    function resize() {
      var r = canvas.getBoundingClientRect(); DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
      canvas.width = W * DPR; canvas.height = H * DPR;
      k = Math.min(1.0 * W / (2 * (S.rad + 1.2)), .94 * H / (S.rad * 2 * Math.sin(st.pitch) + S.hz * Math.cos(st.pitch) + 2.6));
      ox = W / 2; oy = H / 2 + H * .03;
      if (opts.layout) { var L = opts.layout(W, H); ox = L.ox; oy = L.oy; k = L.k; }          // eingebettet: Lage und Maßstab bestimmt der Aufrufer
      zw = Math.ceil(W * ZS); zh = Math.ceil(H * ZS); zb = new Float32Array(zw * zh);
      draw();
    }

    var cy_, sy_, cp_, sp_;
    function setView() {
      var yaw = st.yaw + st.uYaw + (st.spin && st.t > S.total ? (st.t - S.total) * 5 * RAD : 0);
      var pitch = Math.max(8 * RAD, Math.min(72 * RAD, st.pitch + st.uPitch));
      cy_ = Math.cos(yaw); sy_ = Math.sin(yaw); cp_ = Math.cos(pitch); sp_ = Math.sin(pitch);
    }
    var projFn = opts.project || null;
    function proj(p) {
      if (projFn) return projFn(p);                           // eingebettet im Hero: gleiche Projektion wie die Punktwolke und das 3D-Modell
      var fc = st.focus || [S.cx, S.cy, S.cz];
      var x = p[0] - fc[0], y = p[1] - fc[1], z = p[2] - fc[2];
      var xr = x * cy_ - y * sy_, yr = x * sy_ + y * cy_;
      var kk = k * st.zoom;
      return [ox + xr * kk, oy - (yr * sp_ + z * cp_) * kk, yr * cp_ - z * sp_];
    }

    function raster(a, b, c) {
      var x0 = a[0] * ZS, y0 = a[1] * ZS, x1 = b[0] * ZS, y1 = b[1] * ZS, x2 = c[0] * ZS, y2 = c[1] * ZS;
      var minx = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxx = Math.min(zw - 1, Math.ceil(Math.max(x0, x1, x2)));
      var miny = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxy = Math.min(zh - 1, Math.ceil(Math.max(y0, y1, y2)));
      var den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      if (Math.abs(den) < 1e-9) return;
      var inv = 1 / den;
      for (var y = miny; y <= maxy; y++) {
        for (var x = minx; x <= maxx; x++) {
          var px = x + .5, py = y + .5;
          var w0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) * inv;
          var w1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) * inv;
          var w2 = 1 - w0 - w1;
          if (w0 < -.02 || w1 < -.02 || w2 < -.02) continue;
          var d = w0 * a[2] + w1 * b[2] + w2 * c[2], i = y * zw + x;
          if (d < zb[i]) zb[i] = d;
        }
      }
    }
    function visible(q, eps) {
      var x = Math.round(q[0] * ZS - .5), y = Math.round(q[1] * ZS - .5);
      if (x < 0 || y < 0 || x >= zw || y >= zh) return true;
      return q[2] <= zb[y * zw + x] + eps;
    }

    // Linienzug als Stift: nur sichtbare Stücke, bis zum Anteil frac, leicht wackelig, zwei Durchgänge
    function pen(pts3, cls, seed, frac, alpha) {
      var pts = pts3.map(proj), samples = [], i, L = 0, EPS = .32;
      for (i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i], seg = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(seg / 2.5));
        for (var s = (i === 1 ? 0 : 1); s <= n; s++) {
          var t = s / n; samples.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
        }
      }
      var upto = Math.floor(samples.length * frac);
      if (upto < 2) return;
      var vis = samples.map(function (q) { return visible(q, EPS); });
      var w = { g: 2.1, w: 1.35, r: 1.9, k: 1.5, o: 1.0, p: 1.5, f: .6 }[cls] || 1.2;
      for (var pass = 0; pass < 2; pass++) {
        ctx.beginPath(); var open = false, acc = 0;
        for (i = 0; i < upto; i++) {
          var q = samples[i];
          if (i > 0) acc += Math.hypot(q[0] - samples[i - 1][0], q[1] - samples[i - 1][1]);
          var j = Math.sin(acc * .045 + seed * 1.7 + pass * 2.1) * .55 + Math.sin(acc * .11 + seed * .6 + pass) * .3;
          var px = q[0] + j * (pass ? .8 : .5), py = q[1] + j * (pass ? -.7 : .6);
          if (vis[i]) { if (!open) { ctx.moveTo(px, py); open = true; } else ctx.lineTo(px, py); } else open = false;
        }
        ctx.lineWidth = pass ? w * .55 : w; ctx.globalAlpha = (pass ? .5 : .95) * alpha; ctx.strokeStyle = cls === 'k' ? colors.accent : colors.ink; ctx.stroke();
      }
    }
    function hatchLine(h, seed, frac, alpha) {
      var a = proj(h.a), b = proj(h.b), seg = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(seg / 3)), upto = Math.floor((n + 1) * frac), open = false;
      ctx.beginPath();
      for (var s = 0; s <= upto && s <= n; s++) {
        var t = s / n, q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        var j = Math.sin(s * .7 + seed) * .35;
        if (visible(q, .3)) { if (!open) { ctx.moveTo(q[0] + j, q[1] - j); open = true; } else ctx.lineTo(q[0] + j, q[1] - j); } else open = false;
      }
      ctx.lineWidth = .7; ctx.globalAlpha = alpha; ctx.strokeStyle = colors.ink; ctx.stroke();
    }
    function line2(p, q, frac, w) {       // gerade Linie, nur die sichtbaren Stücke
      var n = Math.max(2, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 3)), upto = Math.floor(n * frac), open = false;
      ctx.beginPath();
      for (var s = 0; s <= upto; s++) {
        var t = s / n, r = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
        if (visible(r, .35)) { if (!open) { ctx.moveTo(r[0], r[1]); open = true; } else ctx.lineTo(r[0], r[1]); } else open = false;
      }
      ctx.lineWidth = w; ctx.stroke();
    }
    function dimension(d, frac) {
      var a = proj(d.a), b = proj(d.b), ea = proj(d.ea), eb = proj(d.eb);
      ctx.strokeStyle = colors.muted; ctx.fillStyle = colors.muted; ctx.globalAlpha = .9;
      line2(ea, a, Math.min(1, frac * 2), .8); line2(eb, b, Math.min(1, frac * 2), .8); line2(a, b, frac, .9);
      var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      [a, b].forEach(function (p) {
        if (!visible(p, .35) || frac < .5) return;
        ctx.beginPath(); ctx.moveTo(p[0] - dy / L * 4 - dx / L * 4, p[1] + dx / L * 4 - dy / L * 4); ctx.lineTo(p[0] + dy / L * 4 + dx / L * 4, p[1] - dx / L * 4 + dy / L * 4); ctx.lineWidth = .9; ctx.stroke();
      });
      var m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      if (frac > .9 && visible(m, .35)) {
        ctx.font = '11px ui-monospace, "SF Mono", Menlo, monospace'; ctx.textAlign = 'center';
        ctx.save(); ctx.translate(m[0] + (d.vert ? -16 : 0), m[1] + (d.vert ? 3 : 14)); ctx.fillText(d.label, 0, 0); ctx.restore();
      }
    }

    function draw() {
      if (!W) return;
      setView();
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
      zb.fill(Infinity);
      var i, T = st.t;
      for (i = 0; i < S.tris.length; i++) {
        var t3 = S.tris[i]; raster(proj(t3[0]), proj(t3[1]), proj(t3[2]));
      }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      var cap = '';
      for (i = 0; i < S.edges.length; i++) {
        var e = S.edges[i], f = Math.max(0, Math.min(1, (T - e.t0) / e.dur));
        if (f <= 0) continue;
        pen(e.pts, e.cls, e.id, f, 1);
      }
      for (i = 0; i < S.hatch.length; i++) {
        var h = S.hatch[i], hf = Math.max(0, Math.min(1, (T - h.t0) / h.dur));
        if (hf <= 0) continue;
        if (!h.wall && !h.shadow) { if (h.lit > .8 && h.n % 2) continue; }
        hatchLine(h, i * 1.3, hf, h.shadow ? .38 : h.wall ? .5 : (h.lit > .55 ? .34 : .62));
      }
      for (i = 0; i < S.dims.length; i++) {
        var d = S.dims[i], df = Math.max(0, Math.min(1, (T - d.t0) / d.dur));
        if (df > 0) dimension(d, df);
      }
      ctx.globalAlpha = 1;
      var phase = T < S.edges[0].t0 + .1 ? '' : (T < S.total - 1.4 ? 'Aufmaß wird gezeichnet' : 'Außenansicht aus der Punktwolke');
      if (opts.onStage) opts.onStage(phase);
    }

    var last = 0, raf = 0;
    function frame(now) {
      raf = 0; var dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
      if (st.started && !reduce) st.t += dt;
      draw();
      if (st.visible && !reduce) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
    if (opts.external) { /* eingebettet: der Aufrufer zeichnet Bild für Bild */ }
    else if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es.forEach(function (e) { st.visible = e.isIntersecting; if (st.visible) { st.started = true; kick(); } }); }, { threshold: .2 }).observe(canvas);
    } else { st.visible = true; st.started = true; kick(); }

    if (!opts.external) { canvas.style.touchAction = 'pan-y'; canvas.tabIndex = 0; }
    if (!opts.external) canvas.addEventListener('pointerdown', function (e) { st.drag = { x: e.clientX, y: e.clientY, yaw: st.uYaw, pitch: st.uPitch, touch: e.pointerType === 'touch' }; canvas.setPointerCapture(e.pointerId); });
    if (!opts.external) canvas.addEventListener('pointermove', function (e) {
      if (!st.drag) return;
      st.uYaw = st.drag.yaw - (e.clientX - st.drag.x) * .008;
      if (!st.drag.touch) st.uPitch = st.drag.pitch + (e.clientY - st.drag.y) * .006;
      if (reduce || !st.visible) draw();
    });
    var end = function () { st.drag = null; };
    if (!opts.external) { canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); }
    if (!opts.external) canvas.addEventListener('dblclick', function () { st.uYaw = 0; st.uPitch = 0; if (reduce) draw(); });
    if (!opts.external) canvas.addEventListener('keydown', function (e) {
      var m = { ArrowLeft: [-.12, 0], ArrowRight: [.12, 0], ArrowUp: [0, -.08], ArrowDown: [0, .08] }[e.key];
      if (!m) return; e.preventDefault(); st.uYaw += m[0]; st.uPitch += m[1]; if (reduce) draw();
    });
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
    resize();

    return {
      restart: function () { st.t = reduce ? S.total + 1 : 0; st.uYaw = 0; st.uPitch = 0; st.started = true; kick(); draw(); },
      toggleSpin: function () { st.spin = !st.spin; return st.spin; },
      recolor: function () { colors = readColors(); draw(); },
      setTime: function (t) { st.t = t; st.started = false; draw(); },
      setProject: function (fn) { projFn = fn; },
      setCamera: function (yawRad, pitchRad, zoom) { st.yaw = yawRad; st.pitch = pitchRad; st.uYaw = 0; st.uPitch = 0; st.spin = false; if (zoom) st.zoom = zoom; },
      setZoom: function (z, focus) { st.zoom = z; if (focus !== undefined) st.focus = focus; draw(); },
      setView: function (yawDeg, pitchDeg) { st.uYaw = yawDeg * RAD - st.yaw; st.uPitch = pitchDeg * RAD - st.pitch; draw(); },
      total: S.total
    };
  }

  window.Aufmass = { mount: mount };
})();
