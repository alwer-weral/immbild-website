/* immbild: anonyme Verhaltensmessung.
   Kein Cookie, kein Speicher auf dem Gerät des Besuchers, keine IP-Adresse, keine feste Kennung.
   Eine Zufallskennung (pv) gilt nur für diesen einen Seitenaufruf und verschwindet mit ihm.
   Es werden nie eingegebene Texte erfasst, nur dass ein Feld benutzt wurde.
   Der Schlüssel unten ist der öffentliche Supabase-Schlüssel: Er darf nur Zeilen eintragen, nicht lesen. */
(function () {
  'use strict';
  try {
    var ENDPUNKT = 'https://obxulmldmxajugnidycf.supabase.co/rest/v1/ux_events';
    var SCHLUESSEL = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ieHVsbWxkbXhhanVnbmlkeWNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4NDg3MDUsImV4cCI6MjEwNzQyNDcwNX0.cFvyNCY63KZ4EnqiLAs_Oli_2XOCWWdsPpP1jJ-Zqvk';
    var SITE_ID = '5ff93de0-9873-4800-b358-8c4141cff83b';
    var MAX_EREIGNISSE = 400;      // Obergrenze je Seitenaufruf, schützt die Datenbank
    var FLUSH_MS = 4000;

    /* ---------- Wer nicht gemessen wird ---------- */
    var dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
    if (dnt) return;
    // Eigene Geräte: einmal ?intern=1 aufrufen, dann misst dieses Gerät nicht mehr. ?intern=0 hebt es auf.
    try {
      var qi = new URLSearchParams(location.search).get('intern');
      if (qi === '1') localStorage.setItem('immbild_intern', '1');
      if (qi === '0') localStorage.removeItem('immbild_intern');
      if (localStorage.getItem('immbild_intern') === '1') return;
    } catch (e) { /* Speicher gesperrt: dann eben messen */ }

    var host = location.hostname;
    var istTest = !/(^|\.)immbild\.de$/.test(host);   // localhost, Vorschau, netlify.app

    /* ---------- Grundzustand ---------- */
    var t0 = performance.now();
    var pv = (function () {
      var a = new Uint8Array(10), s = '';
      (crypto || window.msCrypto).getRandomValues(a);
      for (var i = 0; i < a.length; i++) s += (a[i] % 36).toString(36);
      return s;
    })();
    var seq = 0, gesamt = 0, queue = [], timer = null, laeuft = false;
    var pfad = (location.pathname || '/').slice(0, 200);

    var zaehler = { klick: 0, wut: 0, zug: 0, rad: 0, fehler: 0 };
    var maxScroll = 0, aktivMs = 0, letzteAktion = performance.now(), letzterTick = performance.now();
    var lcp = null, cls = 0;

    function jetzt() { return Math.round(performance.now() - t0); }
    function kurz(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) : s; }
    function sicher(fn) { return function () { try { return fn.apply(this, arguments); } catch (e) { } }; }
    function rund1(n) { return Math.round(n * 10) / 10; }

    /* ---------- Ereignis aufnehmen und senden ---------- */
    function ereignis(typ, ziel, extra) {
      if (gesamt >= MAX_EREIGNISSE) return;
      extra = extra || {};
      // Alle Zeilen eines Pakets brauchen dieselben Schlüssel (Vorgabe der Schnittstelle), fehlende Werte sind null.
      var z = {
        site_id: SITE_ID, pv: pv, seq: seq++, t_ms: Math.min(jetzt(), 86399999),
        type: typ, path: pfad, target: null, x: null, y: null, val: null, data: null, ist_test: istTest
      };
      if (ziel != null && ziel !== '') z.target = kurz(ziel, 120);
      if (extra.x != null) z.x = Math.max(0, Math.min(100, rund1(extra.x)));
      if (extra.y != null) z.y = Math.max(0, Math.min(100, rund1(extra.y)));
      if (extra.val != null && isFinite(extra.val)) z.val = Math.round(extra.val * 100) / 100;
      if (extra.data) z.data = extra.data;
      queue.push(z); gesamt++;
      if (queue.length >= 20) senden(); else plane();
    }
    function plane() { if (!timer) timer = setTimeout(function () { timer = null; senden(); }, FLUSH_MS); }
    function senden() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!queue.length || laeuft) { if (queue.length) plane(); return; }
      var paket = queue.splice(0, 40);
      laeuft = true;
      try {
        fetch(ENDPUNKT, {
          method: 'POST', keepalive: true, mode: 'cors', credentials: 'omit',
          headers: { 'Content-Type': 'application/json', apikey: SCHLUESSEL, Authorization: 'Bearer ' + SCHLUESSEL, Prefer: 'return=minimal' },
          body: JSON.stringify(paket)
        }).then(function (r) {
          laeuft = false;
          // 409 = schon gespeichert (Doppelsendung), 4xx sonst = nicht reparierbar: verwerfen. Nur Netz-/Serverfehler erneut versuchen.
          if (r.status >= 500) { queue = paket.concat(queue); plane(); }
          else if (queue.length) plane();
        }, function () {
          laeuft = false; queue = paket.concat(queue).slice(0, 80); plane();
        });
      } catch (e) { laeuft = false; }
    }

    /* ---------- Beschriftung von Klickzielen (nie Eingabetexte) ---------- */
    function beschrifte(el) {
      var tag = el.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        return tag + ':' + (el.name || el.id || el.type || '');
      }
      var t = el.getAttribute('data-track') || el.id || el.getAttribute('aria-label') || '';
      if (!t) t = el.innerText || el.textContent || '';
      t = kurz(t, 60);
      if (!t) t = tag + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '');
      return t;
    }
    function ziellinks(a) {
      var h = a.getAttribute('href') || '';
      if (/^mailto:/i.test(h)) return 'mailto';
      if (/^tel:/i.test(h)) return 'tel';
      try {
        var u = new URL(h, location.href);
        return (u.host === location.host ? '' : u.host) + u.pathname + (u.hash || '');
      } catch (e) { return ''; }
    }

    /* ---------- Seitenaufruf ---------- */
    sicher(function () {
      var w = innerWidth, h = innerHeight;
      var ref = '(direkt)';
      if (document.referrer) {
        try {
          var rh = new URL(document.referrer).hostname.replace(/^www\./, '');
          ref = rh === host.replace(/^www\./, '') ? '(intern)' : rh;
        } catch (e) { ref = '(unbekannt)'; }
      }
      var q = new URLSearchParams(location.search);
      var utm = [q.get('utm_source'), q.get('utm_medium'), q.get('utm_campaign')].filter(Boolean).join('|');
      var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      ereignis('pageview', pfad, {
        data: {
          ver: 1, w: Math.round(w / 10) * 10, h: Math.round(h / 10) * 10,
          dev: w < 768 ? 'mobile' : (w < 1100 ? 'tablet' : 'desktop'),
          touch: (navigator.maxTouchPoints || 0) > 0, lang: kurz(navigator.language || '', 12),
          dpr: Math.round((window.devicePixelRatio || 1) * 10) / 10,
          dark: !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches),
          still: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
          net: navigator.connection && navigator.connection.effectiveType || undefined,
          nav: nav && nav.type || undefined, look: document.documentElement.dataset.look || undefined,
          ref: ref, utm: utm ? kurz(utm, 80) : undefined, bot: navigator.webdriver === true
        }
      });
    })();

    /* ---------- Aktivität und aktive Zeit ---------- */
    function aktion() { letzteAktion = performance.now(); }
    ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(function (n) {
      addEventListener(n, aktion, { passive: true, capture: true });
    });
    var imBild = {};    // Abschnitt -> { sichtbar, summe }
    setInterval(sicher(function () {
      var n = performance.now(), dt = n - letzterTick; letzterTick = n;
      if (document.visibilityState !== 'visible' || dt > 3000) return;   // Tab im Hintergrund oder Rechner geschlafen
      if (n - letzteAktion < 5000) aktivMs += dt;
      if (n - letzteAktion < 30000) {
        for (var k in imBild) if (imBild[k].sichtbar) imBild[k].summe += dt;
      }
    }), 1000);

    /* ---------- Scrolltiefe ---------- */
    var marken = [10, 25, 50, 75, 90, 100], markeIdx = 0, scrollWartet = false;
    function scrollPruefen() {
      scrollWartet = false;
      var d = document.documentElement, hoehe = Math.max(d.scrollHeight, document.body ? document.body.scrollHeight : 0);
      if (!hoehe) return;
      var pct = Math.min(100, Math.round(((window.pageYOffset || d.scrollTop || 0) + innerHeight) / hoehe * 100));
      if (pct > maxScroll) maxScroll = pct;
      while (markeIdx < marken.length && maxScroll >= marken[markeIdx]) {
        ereignis('scroll', String(marken[markeIdx]), { val: marken[markeIdx] });
        markeIdx++;
      }
    }
    addEventListener('scroll', function () {
      if (!scrollWartet) { scrollWartet = true; requestAnimationFrame(sicher(scrollPruefen)); }
    }, { passive: true });
    setTimeout(sicher(scrollPruefen), 800);

    /* ---------- Abschnitte: wie lange im Bild ---------- */
    function abschnittAbschliessen(id) {
      var a = imBild[id];
      if (a && a.summe >= 500) { ereignis('section', id, { val: Math.round(a.summe) }); }
      if (a) a.summe = 0;
    }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(sicher(function (liste) {
        liste.forEach(function (e) {
          var id = e.target.id || e.target.getAttribute('data-track') || 'abschnitt';
          var a = imBild[id] || (imBild[id] = { sichtbar: false, summe: 0 });
          var zaehlt = e.isIntersecting && (e.intersectionRatio >= 0.4 || e.intersectionRect.height >= innerHeight * 0.4);
          if (zaehlt && !a.sichtbar) { a.sichtbar = true; }
          else if (!zaehlt && a.sichtbar) { a.sichtbar = false; abschnittAbschliessen(id); }
        });
      }), { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] });
      var abschn = document.querySelectorAll('section[id], section[data-track], footer[id]');
      for (var i = 0; i < abschn.length; i++) io.observe(abschn[i]);
    }

    /* ---------- Klicks ---------- */
    var letzteKlicks = [];
    document.addEventListener('click', sicher(function (e) {
      var t = e.target; if (!t || !t.closest) return;
      var el = t.closest('a,button,summary,[role=tab],[role=button],.pill,label,select,input,textarea') || t;
      var d = document.documentElement;
      var br = Math.max(d.scrollWidth, innerWidth), ho = Math.max(d.scrollHeight, innerHeight);
      var x = e.pageX != null ? e.pageX / br * 100 : null, y = e.pageY != null ? e.pageY / ho * 100 : null;
      var tag = el.tagName.toLowerCase();
      var daten = { k: tag };
      if (tag === 'a') { var h = ziellinks(el); if (h) daten.href = h; }
      zaehler.klick++;
      var name = beschrifte(el);
      ereignis('click', name, { x: x, y: y, data: daten });
      // Wutklick: drei Klicks binnen 1 s nahe beieinander
      var n = performance.now();
      letzteKlicks.push({ t: n, x: e.clientX, y: e.clientY });
      letzteKlicks = letzteKlicks.filter(function (c) { return n - c.t < 1000; });
      if (letzteKlicks.length >= 3) {
        var c0 = letzteKlicks[0];
        var nah = letzteKlicks.every(function (c) { return Math.abs(c.x - c0.x) < 50 && Math.abs(c.y - c0.y) < 50; });
        if (nah) { zaehler.wut++; ereignis('rage', name, { x: x, y: y }); letzteKlicks = []; }
      }
      // Wer die Seite gleich verlässt (Link nach außen, Mail, Telefon): sofort senden
      if (tag === 'a') senden();
    }), true);

    /* ---------- Konfigurator ---------- */
    var cfgTimer = null;
    function cfgFlaeche(wert) {
      clearTimeout(cfgTimer);
      cfgTimer = setTimeout(sicher(function () { ereignis('cfg', 'flaeche', { val: +wert }); }), 700);
    }
    document.addEventListener('click', sicher(function (e) {
      var p = e.target.closest && e.target.closest('#cfgType .pill, #cfgWants .pill');
      if (!p) return;
      var art = p.closest('#cfgType') ? 'objekt' : 'wunsch';
      setTimeout(sicher(function () {
        var an = p.getAttribute('aria-pressed') === 'true' || /\b(on|active|sel)\b/.test(p.className);
        ereignis('cfg', art, { data: { wert: kurz(p.textContent, 50), an: an } });
      }), 0);
    }), true);
    var sl = document.getElementById('cfgSize'), nu = document.getElementById('cfgSizeNum');
    if (sl) sl.addEventListener('input', function () { cfgFlaeche(sl.value); });
    if (nu) nu.addEventListener('change', function () { cfgFlaeche(nu.value); });

    /* ---------- Formular: nur welche Felder benutzt werden, nie was drinsteht ---------- */
    var felder = {};
    function feldname(el) {
      if (!el || !el.form || !el.name) return null;
      if (el.type === 'hidden' || el.type === 'password' || el.name === 'bot-field') return null;
      return el.name;
    }
    document.addEventListener('focusin', sicher(function (e) {
      var n = feldname(e.target); if (!n || felder[n]) return;
      felder[n] = true; ereignis('field', n, { data: { a: 'focus' } });
    }));
    document.addEventListener('focusout', sicher(function (e) {
      var n = feldname(e.target); if (!n) return;
      var l = (e.target.type === 'file') ? (e.target.files ? e.target.files.length : 0) : String(e.target.value || '').length;
      var stufe = l === 0 ? 0 : (l <= 10 ? 1 : (l <= 50 ? 2 : 3));
      ereignis('field', n, { val: stufe, data: { a: 'blur', f: l > 0 } });
    }));
    function feldWert(id) { var el = document.getElementById(id); return el ? kurz(el.value, 100) : undefined; }
    var formEl = document.getElementById('form');
    if (formEl) {
      formEl.addEventListener('submit', sicher(function () {
        ereignis('form', 'submit', { data: { obj: feldWert('fObjekt'), fl: feldWert('fFlaeche'), w: feldWert('fWunsch'), pr: feldWert('fPreis') } });
        senden();
      }), true);
      var msg = document.getElementById('msg');
      if (msg && 'MutationObserver' in window) {
        new MutationObserver(sicher(function () {
          var s = msg.textContent || '';
          if (/^Danke/.test(s)) { ereignis('form', 'ok'); senden(); }
          else if (/^Das Senden hat nicht geklappt/.test(s)) { ereignis('form', 'fehler'); senden(); }
        })).observe(msg, { childList: true, characterData: true, subtree: true });
      }
    }

    /* ---------- Hero: Ziehen und Zoomrad zählen ---------- */
    var hero = document.getElementById('top');
    if (hero) {
      hero.addEventListener('pointerdown', function () { zaehler.zug++; }, { passive: true });
      hero.addEventListener('wheel', function () { zaehler.rad++; }, { passive: true });
    }

    /* ---------- Technik: Ladezeit, Layoutsprünge, Fehler ---------- */
    try {
      new PerformanceObserver(function (l) { var e = l.getEntries(); lcp = Math.round(e[e.length - 1].startTime); })
        .observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(function (l) {
        l.getEntries().forEach(function (e) { if (!e.hadRecentInput) cls += e.value; });
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (e) { /* Browser kann das nicht */ }
    addEventListener('load', function () {
      setTimeout(sicher(function () {
        var n = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
        if (!n) return;
        ereignis('perf', 'laden', { val: Math.round(n.loadEventEnd), data: { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd) } });
      }), 500);
    });
    addEventListener('error', sicher(function (e) {
      if (zaehler.fehler++ >= 5) return;
      var quelle = '';
      try { quelle = new URL(e.filename || '', location.href).pathname; } catch (x) { }
      ereignis('err', e.message || 'Fehler', { data: { src: kurz(quelle, 80), z: e.lineno } });
    }));

    /* ---------- Ende und Sichtbarkeit ---------- */
    var letztesEnde = 0;
    function ende() {
      var n = performance.now();
      if (n - letztesEnde < 800) return;
      letztesEnde = n;
      for (var k in imBild) { if (imBild[k].sichtbar) abschnittAbschliessen(k); }
      ereignis('end', 'ende', {
        val: jetzt(),
        data: {
          act: Math.round(aktivMs), scr: maxScroll, clk: zaehler.klick, wut: zaehler.wut,
          zug: zaehler.zug, rad: zaehler.rad, lcp: lcp, cls: Math.round(cls * 1000) / 1000
        }
      });
      senden();
    }
    document.addEventListener('visibilitychange', sicher(function () {
      if (document.visibilityState === 'hidden') { ereignis('vis', 'hidden'); ende(); }
      else { letzterTick = performance.now(); ereignis('vis', 'visible'); }
    }));
    addEventListener('pagehide', sicher(ende));
  } catch (e) { /* Die Messung darf die Seite nie stören */ }
})();
