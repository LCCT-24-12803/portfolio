import { mountArcadeEnvironment } from './arcade-environment.js';
import { createSectionSystem } from './section-system.js';

const params = new URLSearchParams(location.search);
const container = document.getElementById('arcade');
const root = document.documentElement;
const hud = document.getElementById('hud');
const hudToggle = document.getElementById('hud-toggle');
const sections = createSectionSystem({ root, body: document.body, hud });

// Optional preview switches:  ?quality=low|high   ?static=1   ?clean=1   ?debug=1   ?identity=0
const env = mountArcadeEnvironment(container, {
  quality: params.get('quality') || 'auto',
  forceStatic: params.get('static') === '1' ? true : undefined,
  adaptive: params.get('adaptive') !== '0',
  baseUrl: new URL('../content.json', location.href).href,
  // The core reports how engaged it is (0…1); the identity area borrows it for a faint glow.
  onEngage: (e) => root.style.setProperty('--core-engage', e.toFixed(3)),
  // The environment reports the portal traversal state: hub | docking | docked | returning.
  onDock: (s) => handleDock(s),
});

container.addEventListener('arcade:ready', () => document.body.classList.add('is-ready'), { once: true });

if (params.get('clean') === '1') document.body.classList.add('is-clean');
addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('is-clean');
});
if (params.get('debug') === '1') window.__arcade = env;

/* ---- content (../content.json, read-only) ----------------------------------------------------
   One fetch feeds both the identity area and the Projects station. If it can't be read, the identity
   area stays hidden and the station never appears — nothing is invented. */
const firstSentence = (t) => {
  const s = String(t || '').trim();
  const m = s.match(/^.+?[.!?](?=\s|$)/);
  return (m ? m[0] : s).trim();
};
const contentUrl = new URL('../content.json', location.href).href;
fetch(contentUrl, { cache: 'no-cache' })
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((d) => {
    if (!d) return;
    if (params.get('identity') !== '0' && d.name) {
      document.getElementById('identity-name').textContent = d.name;
      document.getElementById('identity-role').textContent = d.role || '';
      document.getElementById('identity-intro').textContent = firstSentence(d.intro);
      document.getElementById('identity').hidden = false;
    }
    sections.setData(d);
    if (params.get('section')) sections.open(params.get('section'), { focus: false });
    if (params.get('station') !== '0' && env.station && Array.isArray(d.projects)) initProjectsStation(d.projects);
  })
  .catch(() => { /* leave the area hidden */ });

/* ---- Projects station (phase 4B) ---------------------------------------------------------------
   The 3D panel is aria-hidden with the rest of the scene, so the same content is mirrored in a
   visually hidden list for screen readers. ← / → switch projects. */
function initProjectsStation(list) {
  const st = env.station;
  st.setProjects(list);
  if (!st.count) return;
  const sr = document.getElementById('station-sr');
  const ul = sr.querySelector('ul'); const live = sr.querySelector('[aria-live]');
  const frag = document.createDocumentFragment();
  list.filter((p) => p && p.title).forEach((p) => {
    const li = document.createElement('li');
    const h = document.createElement('h3'); h.textContent = p.title; li.append(h);
    if (p.desc) { const d = document.createElement('p'); d.textContent = p.desc; li.append(d); }
    if (p.stack) { const s = document.createElement('p'); s.textContent = 'Stack: ' + p.stack; li.append(s); }
    if (p.link && /^https?:\/\//i.test(p.link)) { const a = document.createElement('a'); a.href = p.link; a.textContent = 'Open ' + p.title; a.rel = 'noopener'; a.target = '_blank'; li.append(a); }
    frag.append(li);
  });
  ul.replaceChildren(frag);
  sr.hidden = false;
  st.onSelect = (i, p, n) => { live.textContent = `Project ${i + 1} of ${n}: ${p.title}`; };
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (env.dock?.state !== 'docked') return;           // the station only exists inside the Projects chamber
    if (e.key === 'ArrowRight') st.next(); else if (e.key === 'ArrowLeft') st.prev();
  });
}

/* ---- navigation HUD + section destinations (phase 6) -------------------------------
   HUD links, 1–7, and touch all open the same responsive section destinations. The old
   real hrefs remain in the markup as a no-JS fallback; JS intercepts normal activation. */
hud.addEventListener('pointerdown', (e) => e.stopPropagation());
const closeHud = () => { hud.classList.remove('is-open'); hudToggle.setAttribute('aria-expanded', 'false'); };
hudToggle.addEventListener('click', () => { const o = hud.classList.toggle('is-open'); hudToggle.setAttribute('aria-expanded', o); });

hud.querySelectorAll('a[data-key]').forEach((a) => {
  a.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const key = Number(a.dataset.key);
    const section = sections.sections[key - 1];
    if (section && sections.open(section.key)) { e.preventDefault(); closeHud(); }
  });
});

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeHud();
    if (sections.isOpen()) { e.preventDefault(); sections.close(); return; }
    if (env.dock?.active) { e.preventDefault(); env.dock.exit(); }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (sections.isOpen()) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 7) {
    const section = sections.sections[n - 1];
    if (section && sections.open(section.key)) { e.preventDefault(); closeHud(); }
  }
});

// The Projects portal remains a real 3D entrance. Once the portal chamber is reached,
// the Back control returns to the hub; the HUD/key route above uses the faster section view.
const dockBack = document.getElementById('dock-back');
dockBack.addEventListener('pointerdown', (e) => e.stopPropagation());
dockBack.addEventListener('click', () => env.dock?.exit());

function handleDock(s) {
  const inFocus = s === 'docking' || s === 'docked';
  document.body.classList.toggle('is-dock', inFocus);
  document.body.classList.toggle('is-docked', s === 'docked');
  const status = document.getElementById('dock-status');
  if (s === 'docking') status.textContent = 'Entering the Projects portal.';
  else if (s === 'docked') status.textContent = 'Projects chamber. Use the project controls, or press Escape to return.';
  else if (s === 'returning') status.textContent = 'Returning to the core.';
  else status.textContent = 'Back at the core.';
}

