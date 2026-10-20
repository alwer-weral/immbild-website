// Mobile-Menü
const nav = document.getElementById('nav');
const toggle = document.querySelector('.nav-toggle');
toggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', open);
});
nav.addEventListener('click', e => {
  if (e.target.tagName === 'A') {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', false);
  }
});

// Vorher/Nachher-Regler
const compare = document.getElementById('compare');
const beforeWrap = document.getElementById('beforeWrap');
const handle = document.getElementById('handle');

function setPos(percent) {
  const p = Math.max(0, Math.min(100, percent));
  beforeWrap.style.width = p + '%';
  handle.style.left = p + '%';
  handle.setAttribute('aria-valuenow', Math.round(p));
}
function fromEvent(e) {
  const rect = compare.getBoundingClientRect();
  setPos(((e.clientX - rect.left) / rect.width) * 100);
}
let dragging = false;
compare.addEventListener('pointerdown', e => { dragging = true; compare.setPointerCapture(e.pointerId); fromEvent(e); });
compare.addEventListener('pointermove', e => { if (dragging) fromEvent(e); });
compare.addEventListener('pointerup', () => { dragging = false; });
handle.addEventListener('keydown', e => {
  const now = Number(handle.getAttribute('aria-valuenow'));
  if (e.key === 'ArrowLeft') setPos(now - 5);
  if (e.key === 'ArrowRight') setPos(now + 5);
});
setPos(50);

// Galerie-Filter
const chips = document.querySelectorAll('.chip');
const figures = document.querySelectorAll('#grid figure');
chips.forEach(chip => chip.addEventListener('click', () => {
  chips.forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  const f = chip.dataset.filter;
  figures.forEach(fig => {
    const show = f === 'alle' || fig.dataset.kind === f;
    fig.classList.toggle('hide', !show);
    if (show) { fig.classList.remove('pop'); void fig.offsetWidth; fig.classList.add('pop'); }
  });
}));

// Einblenden beim Scrollen
const targets = document.querySelectorAll('.block > *, .hero-text');
targets.forEach(el => el.classList.add('reveal'));
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.12 });
  targets.forEach(el => io.observe(el));
} else {
  targets.forEach(el => el.classList.add('in'));
}

// Formular: per fetch an Netlify Forms, ohne Seitenwechsel
const form = document.getElementById('form');
const msg = document.getElementById('msg');
form.addEventListener('submit', async e => {
  e.preventDefault();
  msg.textContent = 'Wird gesendet …';
  try {
    const body = new URLSearchParams(new FormData(form)).toString();
    const res = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!res.ok) throw new Error(res.status);
    form.reset();
    msg.textContent = 'Danke! Die Anfrage ist angekommen.';
  } catch (err) {
    msg.textContent = 'Das Senden hat nicht geklappt. Bitte später noch einmal versuchen.';
  }
});
