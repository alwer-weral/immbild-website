/* Freie Projekte: Darstellung Papier/Blaupause und Rundgang-Viewer (Matterport erst nach Klick) */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* Darstellung wie auf der Startseite: tagsüber Papier, nachts Blaupause, bis jemand selbst wählt */
  const root = document.documentElement, btns = $$('button[data-look]'), themeMeta = $('meta[name="theme-color"]');
  function apply(mode) {
    root.dataset.look = mode === 'blaupause' ? 'blaupause' : 'papier';
    btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.look === root.dataset.look)));
    if (themeMeta) themeMeta.setAttribute('content', mode === 'blaupause' ? '#0b2f5b' : '#f3f0e6');
  }
  apply(root.dataset.look);
  btns.forEach(b => b.addEventListener('click', () => { apply(b.dataset.look); if (window.immLook) window.immLook.set(b.dataset.look); }));
  if (window.immLook) setInterval(() => { if (!window.immLook.manual()) { const m = window.immLook.sun(); if (m !== root.dataset.look) apply(m); } }, 60000);

  /* Rundgang-Viewer */
  const frameEl = $('#frame'), poster = $('#poster'), posterTitle = $('#posterTitle'), posterImg = $('#posterImg'), play = $('#play');
  if (!frameEl || !poster) return;
  let current = $('.vt.active').dataset.id;
  function reset() { frameEl.hidden = true; frameEl.removeAttribute('src'); poster.hidden = false; }
  $$('.vt').forEach(btn => btn.addEventListener('click', () => {
    $$('.vt').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
    current = btn.dataset.id; posterTitle.textContent = btn.dataset.title;
    if (posterImg && btn.dataset.img) { posterImg.src = btn.dataset.img; posterImg.alt = btn.dataset.alt || ''; }
    reset();
  }));
  play.addEventListener('click', () => {
    frameEl.src = 'https://my.matterport.com/show/?m=' + encodeURIComponent(current) + '&play=1&qs=1';
    frameEl.hidden = false; poster.hidden = true;
    frameEl.addEventListener('load', () => frameEl.focus(), { once: true });
  });
})();
