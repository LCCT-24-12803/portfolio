const canvas = document.getElementById('particles');
const ctx = canvas?.getContext('2d');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let particles = [];
let raf = 0;

function resize() {
  if (!canvas || !ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const count = innerWidth < 640 ? 28 : 64;
  particles = Array.from({length: count}, () => ({
    x: Math.random() * innerWidth,
    y: Math.random() * innerHeight,
    r: Math.random() * 1.5 + .35,
    vx: (Math.random() - .5) * .22,
    vy: (Math.random() - .5) * .2,
    a: Math.random() * .45 + .12,
    hue: Math.random() > .5 ? 187 : 350
  }));
}
function draw() {
  if (!ctx) return;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy;
    if (p.x < -5) p.x = innerWidth + 5;
    if (p.x > innerWidth + 5) p.x = -5;
    if (p.y < -5) p.y = innerHeight + 5;
    if (p.y > innerHeight + 5) p.y = -5;
    ctx.beginPath();
    ctx.fillStyle = `hsla(${p.hue}, 100%, 68%, ${p.a})`;
    ctx.shadowBlur = 10;
    ctx.shadowColor = `hsla(${p.hue}, 100%, 65%, .55)`;
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  raf = requestAnimationFrame(draw);
}
if (canvas && ctx) {
  resize();
  if (!reduceMotion) draw();
  addEventListener('resize', resize, {passive:true});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (!reduceMotion) draw();
  });
}

const enter = document.getElementById('enter-world');
let leaving = false;
enter?.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || reduceMotion) return;
  event.preventDefault();
  if (leaving) return;
  leaving = true;
  document.body.classList.add('is-leaving'); // fade to black, then red/cyan flash (intro.css)
  window.setTimeout(() => { window.location.href = enter.href; }, 900);
});
// Back from world.html (bfcache): clear the transition so the intro is usable again.
addEventListener('pageshow', (e) => {
  if (e.persisted) { leaving = false; document.body.classList.remove('is-leaving'); }
});
