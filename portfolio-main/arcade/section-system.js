/* Cybernetic Arcade — portfolio section system (phase 6)
 * Lightweight section destinations. Content comes only from ../content.json.
 * The 3D hub remains the visual shell; sections use a shared portal-like transition.
 */

const SECTIONS = [
  { key: 'about', label: 'About Me', n: '01', className: 'about' },
  { key: 'journey', label: 'My Journey', n: '02', className: 'journey' },
  { key: 'skills', label: 'Skills', n: '03', className: 'skills' },
  { key: 'projects', label: 'Projects', n: '04', className: 'projects' },
  { key: 'certifications', label: 'Certificates', n: '05', className: 'certificates' },
  { key: 'resume', label: 'Resume', n: '06', className: 'resume' },
  { key: 'contact', label: 'Contact', n: '07', className: 'contact' },
];

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (v) => /^https?:\/\//i.test(String(v || '')) ? String(v) : '';
const join = (a, sep = ', ') => Array.isArray(a) ? a.filter(Boolean).join(sep) : String(a || '');

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function sectionBody(key, d) {
  if (key === 'about') {
    const about = Array.isArray(d.about) ? d.about : [];
    const facts = Array.isArray(d.facts) ? d.facts : [];
    const photo = String(d.photo || 'images/profile.jpg').replace(/^\.\//, '');
    return `
      <div class="section-grid section-grid--about">
        <div class="about-profile">
          <div class="about-photo" tabindex="0">
            <div class="about-photo__frame" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
            <div class="about-photo__scan" aria-hidden="true"></div>
            <div class="about-photo__grid" aria-hidden="true"></div>
            <div class="about-photo__hud about-photo__hud--top" aria-hidden="true"><span>BIOMETRIC</span><span>01 / 07</span></div>
            <div class="about-photo__hud about-photo__hud--bottom" aria-hidden="true"><span>PROFILE_NODE</span><span>ONLINE</span></div>
            <img src="../${esc(photo)}" alt="Portrait of ${esc(d.name || 'Precious Micaela A. Alop')}" loading="eager">
            <span class="about-photo__label">IDENTITY VERIFIED</span>
          </div>
          <div class="section-copy section-copy--lead">
            <p class="section-kicker">Identity / profile</p>
            ${about.map((p, i) => `<p class="about-line" style="--i:${i}">${esc(p?.text)}</p>`).join('')}
          </div>
        </div>
        <div class="data-card fact-card">
          <span class="data-card__label">Profile data</span>
          <dl>${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        </div>
      </div>`;
  }
  if (key === 'journey') {
    const items = Array.isArray(d.timeline) ? d.timeline : [];
    return `<div class="timeline">${items.map((x, i) => `
      <article class="timeline__item" style="--i:${i}">
        <div class="timeline__when">${esc(x?.when)}</div>
        <div class="timeline__dot" aria-hidden="true"></div>
        <div class="timeline__body"><h3>${esc(x?.title)}</h3><p>${esc(x?.text)}</p>${x?.tags ? `<span>${esc(x.tags)}</span>` : ''}</div>
      </article>`).join('')}</div>`;
  }
  if (key === 'skills') {
    const groups = Array.isArray(d.skills) ? d.skills : [];
    const tools = Array.isArray(d.tools) ? d.tools : [];
    return `<div class="skill-grid">${groups.map((g, i) => `
      <article class="skill-card" style="--i:${i}"><span class="skill-card__index">${String(i + 1).padStart(2, '0')}</span><h3>${esc(g?.title)}</h3><ul>${(g?.items || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></article>`).join('')}</div>
      <div class="tool-strip"><span>Tools / working knowledge</span>${tools.flatMap((g) => (g?.items || []).map((x) => `<span>${esc(x)}</span>`)).join('')}</div>`;
  }
  if (key === 'projects') {
    const items = Array.isArray(d.projects) ? d.projects : [];
    return `<div class="project-grid">${items.map((p, i) => {
      const link = safeUrl(p?.link);
      return `<article class="project-card" style="--i:${i}">
        <div class="project-card__top"><span>PROJECT ${String(i + 1).padStart(2, '0')}</span><i aria-hidden="true"></i></div>
        <h3>${esc(p?.title)}</h3><p>${esc(p?.desc)}</p>${p?.stack ? `<div class="project-card__stack">${esc(p.stack)}</div>` : ''}
        ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">Open project <span aria-hidden="true">↗</span></a>` : ''}
      </article>`;
    }).join('')}</div>`;
  }
  if (key === 'certifications') {
    const items = Array.isArray(d.certs) ? d.certs : [];
    return `<div class="cert-grid">${items.map((c, i) => `
      <article class="cert-card" style="--i:${i}"><div class="cert-card__scan"></div><div class="cert-card__num">${String(i + 1).padStart(2, '0')}</div>${c?.img ? `<img src="../${esc(c.img)}" alt="${esc(c?.title)} certificate" loading="lazy">` : ''}<div><span>${esc(c?.group)}</span><h3>${esc(c?.title)}</h3>${c?.sub ? `<p>${esc(c.sub)}</p>` : ''}</div></article>`).join('')}</div>`;
  }
  if (key === 'resume') {
    const edu = d.education || {};
    const ojt = d.ojt || {};
    return `<div class="resume-layout">
      <article class="resume-sheet"><div class="resume-sheet__head"><span>CURRICULUM / PROFILE</span><b>06</b></div><h3>${esc(d.name)}</h3><p class="resume-sheet__role">${esc(d.role)}</p><section><span>Education</span><h4>${esc(edu.degree)}</h4><p>${esc(edu.school)}</p><p>${esc(edu.text)}</p></section><section><span>OJT direction</span><h4>${esc(ojt.title)}</h4><p>${esc(ojt.text)}</p></section></article>
      <aside class="resume-side"><div class="data-card"><span class="data-card__label">Availability</span><strong>${esc(d.status || 'Open to OJT / internship')}</strong></div><a class="resume-download" href="../resume.pdf" target="_blank" rel="noopener">Open resume <span aria-hidden="true">↗</span></a></aside>
    </div>`;
  }
  if (key === 'contact') {
    const c = d.contact || {};
    const refs = Array.isArray(d.references) ? d.references : [];
    return `<div class="contact-layout"><div class="contact-signal"><div class="signal-ring"></div><div class="signal-core">SIGNAL</div><p>${esc(d.status || '')}</p></div><div class="contact-list">
      ${c.email ? `<a href="mailto:${esc(c.email)}"><span>Email</span><strong>${esc(c.email)}</strong></a>` : ''}
      ${c.phone ? `<a href="tel:${esc(String(c.phone).replace(/\s+/g, ''))}"><span>Phone</span><strong>${esc(c.phone)}</strong></a>` : ''}
      ${c.location ? `<div><span>Location</span><strong>${esc(c.location)}</strong></div>` : ''}
      ${safeUrl(c.github) ? `<a href="${esc(c.github)}" target="_blank" rel="noopener"><span>GitHub</span><strong>${esc(c.github.replace(/^https?:\/\//, ''))}</strong></a>` : ''}
      ${refs.length ? `<div class="contact-reference"><span>Reference</span>${refs.map((r) => `<strong>${esc(r?.name)}</strong><small>${esc(join([r?.role, r?.org], ' · '))}</small>`).join('')}</div>` : ''}
    </div></div>`;
  }
  return '';
}

export function createSectionSystem({ root = document.documentElement, body = document.body, hud }) {
  let data = null;
  let current = '';
  let previousFocus = null;
  let ready = false;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const layer = el(`<section class="section-view" id="section-view" aria-label="Portfolio section" aria-hidden="true"></section>`);
  layer.innerHTML = `
    <div class="section-view__wash" aria-hidden="true"></div>
    <div class="section-view__fx" aria-hidden="true">
      <i class="section-view__fx-line section-view__fx-line--a"></i>
      <i class="section-view__fx-line section-view__fx-line--b"></i>
      <i class="section-view__fx-ring section-view__fx-ring--a"></i>
      <i class="section-view__fx-ring section-view__fx-ring--b"></i>
      <i class="section-view__fx-flash"></i>
    </div>
    <div class="section-view__shell">
      <div class="section-view__top">
        <div><span class="section-view__eyebrow" id="section-eyebrow">SECTION 01</span><h2 id="section-title">About Me</h2></div>
        <button class="section-view__close" type="button" id="section-close"><span aria-hidden="true">←</span> Back to Core <kbd>Esc</kbd></button>
      </div>
      <div class="section-view__progress" id="section-progress" aria-hidden="true"></div>
      <div class="section-view__body" id="section-body"></div>
      <nav class="section-view__nav" aria-label="Section navigation" id="section-nav"></nav>
      <p class="sr-only" id="section-status" role="status" aria-live="polite"></p>
    </div>`;
  body.append(layer);

  const title = layer.querySelector('#section-title');
  const eyebrow = layer.querySelector('#section-eyebrow');
  const bodyEl = layer.querySelector('#section-body');
  const close = layer.querySelector('#section-close');
  const nav = layer.querySelector('#section-nav');
  const status = layer.querySelector('#section-status');
  const progress = layer.querySelector('#section-progress');

  nav.innerHTML = SECTIONS.map((s) => `<button type="button" data-section="${s.key}" aria-label="Open ${esc(s.label)}"><span>${s.n}</span></button>`).join('');

  function setHudState(key) {
    hud?.querySelectorAll('a[data-key]').forEach((a) => a.classList.toggle('is-current', a.dataset.key === String(SECTIONS.findIndex((s) => s.key === key) + 1)));
  }

  function populate(key) {
    const s = SECTIONS.find((x) => x.key === key);
    if (!s || !data) return false;
    current = key;
    layer.dataset.section = s.className;
    eyebrow.textContent = `SECTION ${s.n} / ${s.label.toUpperCase()}`;
    title.textContent = s.label;
    bodyEl.innerHTML = sectionBody(key, data);
    progress.innerHTML = SECTIONS.map((x) => `<i class="${x.key === key ? 'is-on' : ''}" title="${esc(x.label)}"></i>`).join('');
    setHudState(key);
    status.textContent = `${s.label} section opened.`;
    return true;
  }

  function focusFirst() {
    if (!reduced) requestAnimationFrame(() => close.focus({ preventScroll: true }));
    else close.focus({ preventScroll: true });
  }

  function open(key, { focus = true } = {}) {
    if (!ready || !data || !SECTIONS.some((s) => s.key === key)) return false;
    const wasOpen = !!current;
    if (!populate(key)) return false;
    if (!wasOpen) previousFocus = document.activeElement;
    body.classList.add('is-section');
    layer.setAttribute('aria-hidden', 'false');
    layer.classList.remove('is-closing', 'is-switching', 'is-pulse');
    if (wasOpen) layer.classList.add('is-switching');
    void layer.offsetWidth;
    layer.classList.add('is-open');
    if (!reduced) {
      layer.classList.add('is-pulse');
      setTimeout(() => layer.classList.remove('is-pulse', 'is-switching'), 780);
    }
    if (focus) focusFirst();
    return true;
  }

  function closeView({ restore = true } = {}) {
    if (!current) return;
    layer.classList.remove('is-open');
    layer.classList.add('is-closing');
    body.classList.remove('is-section');
    layer.setAttribute('aria-hidden', 'true');
    status.textContent = 'Back at the core.';
    const f = previousFocus;
    previousFocus = null;
    if (restore && f && typeof f.focus === 'function') setTimeout(() => f.focus({ preventScroll: true }), reduced ? 0 : 220);
    setTimeout(() => layer.classList.remove('is-closing'), reduced ? 0 : 420);
    current = '';
    setHudState('');
  }

  function next(dir) {
    if (!current) return;
    const i = SECTIONS.findIndex((s) => s.key === current);
    const n = (i + dir + SECTIONS.length) % SECTIONS.length;
    open(SECTIONS[n].key);
  }

  close.addEventListener('click', () => closeView());
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-section]');
    if (b) open(b.dataset.section);
  });
  layer.addEventListener('click', (e) => { if (e.target === layer || e.target.classList.contains('section-view__wash')) closeView(); });
  layer.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeView(); }
    if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); next(1); }
    if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); next(-1); }
  });

  function setData(d) { data = d; ready = !!d; }
  function isOpen() { return !!current; }

  return { setData, open, close: closeView, next, isOpen, get current() { return current; }, sections: SECTIONS };
}
