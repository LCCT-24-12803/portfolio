/* Engagement layer: interactive Journey, Skills, Certificates, Resume preview and Contact.
   Loaded after site.js and nav-deck.js. Content comes from content.json (site.js publishes it as
   window.PORTFOLIO and fires "portfolio:ready"). */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover:hover) and (pointer:fine)');
const body = document.body;

function toast(msg) {
  const t = $('.toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400);
}
const isOpen = id => { const s = document.getElementById(id); return !!s && s.classList.contains('panel-open'); };
/* run cb every time the section's panel opens */
function onPanelOpen(id, cb) {
  const s = document.getElementById(id); if (!s) return;
  let was = s.classList.contains('panel-open');
  new MutationObserver(() => {
    const now = s.classList.contains('panel-open');
    if (now && !was) cb();
    was = now;
  }).observe(s, { attributes: true, attributeFilter: ['class'] });
}
function countUp(el, to, dur = 900) {
  if (!el) return;
  if (reduced.matches) { el.textContent = to; return; }
  const t0 = performance.now();
  (function f(t) {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(f);
  })(t0);
}
/* pointer tilt: sets --rx / --ry on an element */
function tilt(el, max = 7) {
  if (!el || !finePointer.matches || reduced.matches) return;
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    el.style.setProperty('--rx', (-y * max).toFixed(2) + 'deg'); el.style.setProperty('--ry', (x * max).toFixed(2) + 'deg');
    el.style.setProperty('--mx', ((x + .5) * 100) + '%'); el.style.setProperty('--my', ((y + .5) * 100) + '%');
  });
  el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
}

/* ═════════ Lightbox (certificates + resume). Esc closes it first; the next Esc leaves the card ═════════ */
const Lightbox = (() => {
  const el = document.createElement('div');
  el.className = 'lightbox'; el.hidden = true;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Document viewer');
  el.innerHTML = '<div class="lb-top"><span class="lb-count"></span><span class="lb-title"></span><span class="lb-actions"><a class="lb-open" target="_blank" rel="noopener">OPEN ORIGINAL ↗</a><button type="button" class="lb-zoom">ZOOM IN</button><button type="button" class="lb-close" aria-label="Close viewer">ESC ✕</button></span></div><button type="button" class="lb-prev" aria-label="Previous">←</button><div class="lb-stage"><img alt=""></div><button type="button" class="lb-next" aria-label="Next">→</button>';
  body.appendChild(el);
  const img = $('img', el), stage = $('.lb-stage', el), count = $('.lb-count', el), title = $('.lb-title', el),
        openA = $('.lb-open', el), zoomB = $('.lb-zoom', el), prevB = $('.lb-prev', el), nextB = $('.lb-next', el), closeB = $('.lb-close', el);
  let items = [], i = 0, opener = null, zoomed = false, shown = false;

  function setZoom(z) {
    zoomed = z; el.classList.toggle('zoomed', z); zoomB.textContent = z ? 'FIT TO SCREEN' : 'ZOOM IN';
    if (!z) stage.scrollTo(0, 0);
  }
  function show(n) {
    i = (n + items.length) % items.length; const it = items[i];
    setZoom(false);
    el.classList.remove('loaded'); img.src = it.src; img.alt = it.alt || it.title || '';
    img.onload = () => {
      el.classList.add('loaded');
      el.style.setProperty('--zw', img.naturalHeight > img.naturalWidth ? '100%' : '165%');
    };
    count.textContent = items.length > 1 ? `${pad(i + 1)} / ${pad(items.length)}` : '';
    title.textContent = it.title || '';
    openA.href = it.open || it.src;
    el.classList.toggle('single', items.length < 2);
    if (items.length > 1) { new Image().src = items[(i + 1) % items.length].src; new Image().src = items[(i - 1 + items.length) % items.length].src; }
  }
  function open(list, index = 0, from = null) {
    items = list; opener = from || document.activeElement;
    el.hidden = false; void el.offsetWidth; el.classList.add('on'); shown = true;
    body.classList.add('has-overlay'); show(index); closeB.focus({ preventScroll: true });
  }
  function close() {
    if (!shown) return; shown = false;
    el.classList.remove('on'); body.classList.remove('has-overlay');
    setTimeout(() => { if (!shown) el.hidden = true; }, reduced.matches ? 0 : 260);
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }
  closeB.addEventListener('click', close);
  zoomB.addEventListener('click', () => setZoom(!zoomed));
  prevB.addEventListener('click', () => show(i - 1));
  nextB.addEventListener('click', () => show(i + 1));
  img.addEventListener('click', () => setZoom(!zoomed));
  stage.addEventListener('click', e => { if (e.target === stage) close(); });
  /* capture phase: runs before nav-deck's handler, so Esc / arrows belong to the viewer while it is open */
  document.addEventListener('keydown', e => {
    if (!shown) return;
    const k = e.key;
    if (k === 'Escape' || k === 'Esc') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    else if (k === 'ArrowRight' && items.length > 1) { e.preventDefault(); e.stopImmediatePropagation(); show(i + 1); }
    else if (k === 'ArrowLeft' && items.length > 1) { e.preventDefault(); e.stopImmediatePropagation(); show(i - 1); }
    else if (k === 'Tab') {                                   // keep focus inside the dialog
      const f = $$('button:not([disabled]),a[href]', el).filter(x => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, true);
  return { open, close };
})();

/* ═════════ About ═════════ */
function about() {
  const t = $('#typer-text'); if (!t) return;
  const words = ['BSIT student', 'PHP + MySQL builder', 'UI/UX and graphic designer', 'student council PRO', 'networking learner'];
  t.textContent = words[0];
  tilt($('.profile-frame'), 6);
  if (reduced.matches) return;
  let w = 0, c = words[0].length, del = false;
  (function tick() {
    if (!isOpen('about') || document.hidden) { setTimeout(tick, 700); return; }
    const word = words[w];
    t.textContent = word.slice(0, c);
    if (!del && c === word.length) { del = true; setTimeout(tick, 1500); return; }
    if (del && c === 0) { del = false; w = (w + 1) % words.length; }
    c += del ? -1 : 1;
    setTimeout(tick, del ? 26 : 55);
  })();
}

/* ═════════ Journey ═════════ */
function journey(d) {
  const items = d.timeline || [], root = $('#timeline'); if (!root || !items.length) return;
  const n = items.length;
  root.innerHTML =
    '<ol class="j-rail" role="tablist" aria-orientation="vertical" aria-label="Journey milestones" data-own-arrows><span class="j-line" aria-hidden="true"><i></i></span>' +
    items.map((x, i) => `<li role="presentation"><button type="button" class="j-node" role="tab" id="jt-${i}" aria-controls="j-stage" data-i="${i}"><span class="j-dot" aria-hidden="true"></span><span class="j-when">${esc(x.when)}</span><span class="j-name">${esc(x.title)}</span></button></li>`).join('') +
    '</ol>' +
    '<article class="j-stage" id="j-stage" role="tabpanel" aria-live="polite"><div class="j-bar" aria-hidden="true"><i></i></div><span class="j-ghost" aria-hidden="true"></span><div class="j-kicker"><span class="j-step"></span><span class="j-when2"></span></div><h3 class="j-title"></h3><p class="j-text"></p><div class="j-tags"></div><div class="j-ctrl"><button type="button" class="j-prev" aria-label="Previous milestone">←</button><button type="button" class="j-next" aria-label="Next milestone">→</button><button type="button" class="j-play" aria-pressed="true">AUTOPLAY ON</button><span class="j-hint">↑ ↓ TO BROWSE</span></div></article>';

  const stats = $('#j-stats');
  if (stats) {
    stats.innerHTML =
      `<div><b data-to="${n}">0</b><span>MILESTONES</span></div><div><b data-to="${(d.projects || []).length}">0</b><span>PROJECTS</span></div><div><b data-to="${(d.certs || []).length}">0</b><span>CERTIFICATES</span></div><div class="j-status"><i></i><span>${esc((d.status || 'Open to OJT / internship').toUpperCase())}</span></div>`;
  }

  const nodes = $$('.j-node', root), stage = $('.j-stage', root), bar = $('.j-bar i', root), line = $('.j-line i', root),
        playB = $('.j-play', root), DUR = 6000;
  let idx = 0, playing = false,,  elapsed = 0, hovering = false, dir = 1;
  if (reduced.matches) { playB.hidden = true; $('.j-bar', root).hidden = true; }

  function set(i, { user = false, from = idx } = {}) {
    i = (i + n) % n; dir = i >= from ? 1 : -1; idx = i; elapsed = 0;
    if (user && playing) setPlay(false);
    const x = items[i];
    nodes.forEach((b, j) => {
      b.classList.toggle('active', j === i); b.classList.toggle('passed', j < i);
      b.setAttribute('aria-selected', String(j === i)); b.tabIndex = j === i ? 0 : -1;
    });
    root.style.setProperty('--p', n > 1 ? i / (n - 1) : 1);
    $('.j-ghost', stage).textContent = pad(i + 1);
    $('.j-step', stage).textContent = `STEP ${pad(i + 1)} / ${pad(n)}`;
    $('.j-when2', stage).textContent = x.when;
    $('.j-title', stage).textContent = x.title;
    $('.j-text', stage).textContent = x.text;
    $('.j-tags', stage).innerHTML = String(x.tags || '').split(',').map(t => t.trim()).filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('');
    stage.setAttribute('aria-labelledby', 'jt-' + i);
    stage.dataset.dir = dir > 0 ? 'down' : 'up';
    stage.classList.remove('swap'); void stage.offsetWidth; stage.classList.add('swap');
    bar.style.transform = 'scaleX(0)';
    const rail = $('.j-rail', root);                                 // mobile: keep the active node in view in the horizontal rail
    if (rail.scrollWidth > rail.clientWidth) rail.scrollTo({ left: nodes[i].offsetLeft - rail.clientWidth / 2 + nodes[i].offsetWidth / 2, behavior: reduced.matches ? 'auto' : 'smooth' });
  }
  function setPlay(on) {
    playing = on; playB.setAttribute('aria-pressed', String(on)); playB.textContent = on ? 'AUTOPLAY ON' : 'AUTOPLAY OFF';
    root.classList.toggle('is-playing', on); if (!on) bar.style.transform = 'scaleX(0)';
  }
  nodes.forEach((b, j) => {
    b.addEventListener('click', () => set(j, { user: true }));
    b.addEventListener('keydown', e => {
      const k = e.key; let t = -1;
      if (k === 'ArrowDown' || k === 'ArrowRight') t = idx + 1; else if (k === 'ArrowUp' || k === 'ArrowLeft') t = idx - 1;
      else if (k === 'Home') t = 0; else if (k === 'End') t = n - 1;
      if (t < 0) return; e.preventDefault(); set(t, { user: true }); nodes[idx].focus();
    });
  });
  $('.j-prev', root).addEventListener('click', () => set(idx - 1, { user: true }));
  $('.j-next', root).addEventListener('click', () => set(idx + 1, { user: true }));
  playB.addEventListener('click', () => { setPlay(!playing); elapsed = 0; });
  root.addEventListener('pointerenter', () => { hovering = true; });
  root.addEventListener('pointerleave', () => { hovering = false; });
  /* ↑ / ↓ browse milestones anywhere in the Journey card on wide screens */
  document.addEventListener('keydown', e => {
    if (!isOpen('journey') || body.classList.contains('has-overlay') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!matchMedia('(min-width:900px)').matches || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName || '')) return;
    if (e.target.closest && e.target.closest('.j-rail')) return;          // the rail handles its own keys
    if (e.key === 'ArrowDown') { e.preventDefault(); set(idx + 1, { user: true }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); set(idx - 1, { user: true }); }
  });
  /* autoplay clock: only advances while the card is open, visible and not being hovered */
  setInterval(() => {
    if (!playing || !isOpen('journey') || hovering || document.hidden) return;
    elapsed += 100; bar.style.transform = `scaleX(${Math.min(1, elapsed / DUR)})`;
    if (elapsed >= DUR) set(idx + 1);
  }, 100);
  onPanelOpen('journey', () => {
    set(0, { from: 0 }); setPlay(!reduced.matches);
    $$('#j-stats b').forEach(b => countUp(b, Number(b.dataset.to)));
  });
  set(0, { from: 0 }); setPlay(!reduced.matches);
  $$('#j-stats b').forEach(b => { b.textContent = b.dataset.to; });
}

/* ═════════ Skills ═════════ */
function skills(d) {
  const g = d.skills || [], grid = $('#skills-grid'), fil = $('#skill-filter'); if (!grid) return;
  grid.innerHTML = g.map((x, i) =>
    `<article class="skill-card" data-g="${i}"><span class="card-index">${pad(i + 1)} / TOOLSET</span><h3>${esc(x.title)}</h3><span class="skill-count">${(x.items || []).length} SKILLS</span><ul>${(x.items || []).map((v, k) => `<li style="--k:${k}">${esc(v)}</li>`).join('')}</ul></article>`).join('');
  if (fil) {
    const short = t => String(t).split(' ')[0];
    fil.innerHTML = '<span class="sf-label">HIGHLIGHT</span><button type="button" class="active" data-f="all" aria-pressed="true">All</button>' +
      g.map((x, i) => `<button type="button" data-f="${i}" aria-pressed="false">${esc(short(x.title))}</button>`).join('');
    fil.addEventListener('click', e => {
      const b = e.target.closest('button[data-f]'); if (!b) return;
      const f = b.dataset.f;
      $$('button[data-f]', fil).forEach(x => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-pressed', String(on)); });
      $$('.skill-card', grid).forEach(c => c.classList.toggle('dim', f !== 'all' && c.dataset.g !== f));
    });
  }
  /* spotlight follows the cursor */
  grid.addEventListener('pointermove', e => {
    const c = e.target.closest('.skill-card'); if (!c || e.pointerType !== 'mouse') return;
    const r = c.getBoundingClientRect(); c.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%'); c.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
  });
  const belt = $('#tool-belt'), tools = d.tools || [];
  if (belt && tools.length) {
    const seq = tools.map(t => `<span class="belt-cat">${esc(String(t.title).toUpperCase())}</span>` + (t.items || []).map(v => `<span class="belt-item">${esc(v)}</span>`).join('')).join('');
    belt.innerHTML = `<span class="belt-label">TOOL BELT</span><div class="belt-window"><div class="belt-track">${seq}<span class="belt-gap" aria-hidden="true"></span>${seq.replace(/class="belt-/g, 'aria-hidden="true" class="belt-')}</div></div>`;
  }
}

/* ═════════ Certificates ═════════ */
function certs(d) {
  const c = d.certs || [], grid = $('#certificate-grid'), path = $('#cert-path'); if (!grid) return;
  const list = c.map(x => ({ src: x.img, title: x.title, alt: 'Certificate: ' + x.title, open: String(x.img).split('?')[0] }));
  grid.innerHTML = c.map((x, i) =>
    `<article class="cert-card" data-i="${i}" style="--n:${i}"><button type="button" class="cert-open" data-i="${i}" aria-label="View certificate: ${esc(x.title)}"><img src="${esc(x.img)}" alt="${esc(x.title)}" loading="lazy"></button><h3>${esc(x.title)}</h3><p>${esc(x.group || 'CERTIFICATE')}</p></article>`).join('');
  if (path) {
    path.innerHTML = `<div class="cp-head"><span>CISCO NETWORKING ACADEMY</span><b><em id="cp-count">0</em> / ${c.length} COURSES COMPLETED</b></div><ol class="cp-steps" style="--cols:${c.length}">${c.map((x, i) => `<li style="--i:${i}"><button type="button" data-i="${i}" aria-label="Open certificate ${i + 1}: ${esc(x.title)}"><span class="cp-n">${pad(i + 1)}</span><span class="cp-t">${esc(x.title)}</span></button></li>`).join('')}</ol>`;
    $('#cp-count').textContent = c.length;
    path.addEventListener('pointerover', e => { const b = e.target.closest('button[data-i]'); $$('.cert-card', grid).forEach(k => k.classList.toggle('hl', !!b && k.dataset.i === b.dataset.i)); });
    path.addEventListener('pointerleave', () => $$('.cert-card', grid).forEach(k => k.classList.remove('hl')));
    path.addEventListener('focusin', e => { const b = e.target.closest('button[data-i]'); $$('.cert-card', grid).forEach(k => k.classList.toggle('hl', !!b && k.dataset.i === b.dataset.i)); });
    path.addEventListener('focusout', () => $$('.cert-card', grid).forEach(k => k.classList.remove('hl')));
    path.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) Lightbox.open(list, Number(b.dataset.i), b); });
    onPanelOpen('certificates', () => { path.classList.remove('run'); void path.offsetWidth; path.classList.add('run'); countUp($('#cp-count'), c.length, 1100); });
  }
  grid.addEventListener('click', e => { const b = e.target.closest('.cert-open') || (e.target.closest('.cert-card') && e.target.closest('.cert-card').querySelector('.cert-open')); if (b) Lightbox.open(list, Number(b.dataset.i), b); });
  $$('.cert-card', grid).forEach(k => tilt(k, 4));
}

/* ═════════ Resume ═════════ */
function resume(d) {
  const g = $('#resume-glance');
  if (g) {
    const ed = d.education || {}, rows = [
      ['EDUCATION', String(ed.degree || 'BS Information Technology').replace(/^College\s*-\s*/i, '')],
      ['SCHOOL', ed.school || 'La Consolacion College Tanauan'],
      ['PROJECTS', `${(d.projects || []).length} web systems and sites`],
      ['TRAINING', `${(d.certs || []).length} Cisco Networking Academy courses`],
      ['STATUS', d.status || 'Open to OJT / internship']
    ];
    g.innerHTML = rows.map(r => `<div><dt>${r[0]}</dt><dd>${esc(r[1])}</dd></div>`).join('');
  }
}
function resumeStatic() {
  const open = from => Lightbox.open([{ src: 'assets/resume-preview.jpg', title: 'Resume · page 1 of 1', alt: 'Resume, page 1 of 1', open: 'resume.pdf' }], 0, from);
  const paper = $('#resume-paper'), zb = $('#resume-zoom');
  if (paper) { paper.addEventListener('click', () => open(paper)); tilt(paper, 5); }
  if (zb) zb.addEventListener('click', () => open(zb));
}

/* ═════════ Projects: autoplay progress, swipe, tilt ═════════ */
function projects() {
  const show = $('#project-showcase'), stage = $('#project-stage'); if (!show || !stage) return;
  const controls = $('.project-controls', show);
  const bar = document.createElement('div'); bar.className = 'project-progress'; bar.setAttribute('aria-hidden', 'true'); bar.innerHTML = '<i></i>';
  controls.parentNode.insertBefore(bar, controls);
  const restart = () => { bar.classList.remove('run'); void bar.offsetWidth; bar.classList.add('run'); };
  new MutationObserver(restart).observe(stage, { childList: true });
  ['mouseenter', 'focusin'].forEach(ev => show.addEventListener(ev, () => bar.classList.add('paused')));
  ['mouseleave', 'focusout'].forEach(ev => show.addEventListener(ev, e => { if (ev === 'focusout' && show.contains(e.relatedTarget)) return; bar.classList.remove('paused'); restart(); }));
  restart();
  let sx = 0, sy = 0, down = false;
  stage.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; down = true; sx = e.clientX; sy = e.clientY; });
  stage.addEventListener('pointerup', e => {
    if (!down) return; down = false; const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) $(dx < 0 ? '#project-next' : '#project-prev').click();
  });
  stage.addEventListener('pointercancel', () => { down = false; });
  if (finePointer.matches && !reduced.matches) {
    stage.addEventListener('pointermove', e => {
      const v = e.target.closest('.project-visual'); if (!v) return;
      const r = v.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      v.style.setProperty('--rx', (-y * 5).toFixed(2) + 'deg'); v.style.setProperty('--ry', (x * 6).toFixed(2) + 'deg');
    });
    stage.addEventListener('pointerout', e => { const v = e.target.closest('.project-visual'); if (v) { v.style.setProperty('--rx', '0deg'); v.style.setProperty('--ry', '0deg'); } });
  }
}

/* ═════════ Contact ═════════ */
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  return new Promise((res, rej) => {
    const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;top:0';
    document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
    t.remove(); ok ? res() : rej(new Error('copy failed'));
  });
}
function contact(d) {
  const c = d.contact || {}, EMAIL = (c.email || 'mypreciousme09@gmail.com').trim();
  const ENDPOINT = 'https://formsubmit.co/ajax/' + (c.formEndpoint || EMAIL);        // optional FormSubmit alias in content.json: contact.formEndpoint

  const cp = $('#copy-email');
  if (cp) cp.addEventListener('click', () => copyText(EMAIL).then(() => { cp.textContent = 'COPIED ✓'; cp.classList.add('ok'); toast('Email address copied'); setTimeout(() => { cp.textContent = 'COPY'; cp.classList.remove('ok'); }, 1800); }).catch(() => toast('Press Ctrl+C to copy: ' + EMAIL)));

  const faq = $('#faq');
  if (faq && (d.faq || []).length) {
    faq.innerHTML = '<span class="faq-label">QUICK ANSWERS</span>' + d.faq.map(x => `<details><summary>${esc(x.q)}<i aria-hidden="true">+</i></summary><p>${esc(x.a)}</p></details>`).join('');
    faq.addEventListener('toggle', e => { if (e.target.open) $$('details', faq).forEach(o => { if (o !== e.target) o.open = false; }); }, true);
  }

  const form = $('#email-form'); if (!form) return;
  const note = $('#email-form-note'), btn = $('button[type=submit]', form), label = $('.btn-label', btn), fb = $('#form-fallback'), fbA = $('#fallback-mailto'),
        sent = $('#form-sent'), msg = form.elements.message, counter = $('#char-count');
  const DEFAULT_NOTE = note.textContent;
  let lastSent = 0;
  const setNote = (text, kind = '') => { note.className = 'form-note' + (kind ? ' ' + kind : ''); note.textContent = text; };
  const upd = () => { counter.textContent = `${msg.value.length} / ${msg.maxLength}`; counter.classList.toggle('near', msg.value.length > msg.maxLength * .9); };
  msg.addEventListener('input', upd);
  const chips = $$('.topic-chips button', form);
  chips.forEach(b => b.addEventListener('click', () => {
    const was = chips.find(x => x.classList.contains('on'));
    if (!msg.value.trim() || (was && msg.value === was.dataset.topic)) msg.value = b.dataset.topic;
    chips.forEach(x => x.classList.toggle('on', x === b)); upd(); msg.focus(); msg.setSelectionRange(msg.value.length, msg.value.length);
  }));
  $$('input,textarea', form).forEach(f => f.addEventListener('input', () => { f.classList.remove('bad'); if (note.classList.contains('error')) { setNote(DEFAULT_NOTE); fb.hidden = true; } }));

  const mailto = (name, reply, message) => {
    const bodyTxt = (message + `\n\n— ${name} (${reply})`).slice(0, 1500);
    return `mailto:${EMAIL}?subject=${encodeURIComponent('Portfolio inquiry from ' + name)}&body=${encodeURIComponent(bodyTxt)}`;
  };
  $('#send-another').addEventListener('click', () => { form.classList.remove('sent'); sent.hidden = true; chips.forEach(x => x.classList.remove('on')); upd(); setNote(DEFAULT_NOTE); form.elements.name.focus(); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (form.elements._honey.value) { form.classList.add('sent'); sent.hidden = false; return; }          // bots fill the hidden field: pretend success
    const name = form.elements.name.value.trim(), reply = form.elements.reply.value.trim(), message = msg.value.trim();
    $$('input,textarea', form).forEach(f => f.classList.toggle('bad', !f.checkValidity() || !f.value.trim()));
    if (!name || !message || !form.elements.reply.checkValidity() || !reply) { setNote('Please fill in your name, a valid email and a message.', 'error'); const first = $('.bad', form); if (first) first.focus(); return; }
    if (Date.now() - lastSent < 15000) { setNote('Message already sent. Please wait a few seconds before sending another.', 'error'); return; }
    fbA.href = mailto(name, reply, message); fb.hidden = true;

    if (location.protocol === 'file:') {
      setNote('The form cannot send from a file opened on this computer. Use the live site, or send it with your email app below.', 'error'); fb.hidden = false; return;
    }
    btn.disabled = true; form.classList.add('sending'); label.textContent = 'Sending…'; setNote('Sending your message…');
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ _subject: 'Portfolio inquiry from ' + name, _template: 'table', _captcha: 'false', name, email: reply, message })
      });
      let data = null; try { data = await res.json(); } catch (_) { /* not JSON, e.g. an HTML page */ }
      /* Count it as sent only when FormSubmit explicitly says so. Its answer is JSON with success as the
         STRING "true" / "false", so compare as text. HTML, an error status or a missing flag all mean "not sent". */
      const flag = data && data.success !== undefined ? String(data.success).toLowerCase() : '';
      if (!res.ok || !data || !['true', 'yes', '1'].includes(flag)) throw new Error((data && data.message) || ('HTTP ' + res.status + (data ? '' : ' (unexpected reply)')));
      if (/activat/i.test(String(data.message || ''))) console.warn('[contact] FormSubmit needs one-time activation. Click the link in the email sent to ' + EMAIL + ' (check Spam).');
      lastSent = Date.now(); form.reset(); chips.forEach(x => x.classList.remove('on')); upd();
      form.classList.add('sent'); sent.hidden = false; setNote(DEFAULT_NOTE);
    } catch (err) {
      console.error('[contact] send failed:', err);
      setNote(err.name === 'AbortError' ? 'This is taking too long. You can try again, or send it with your email app.' : 'Your message could not be sent automatically. Your text is still here: try again, or send it with your email app.', 'error');
      fb.hidden = false;
    } finally {
      clearTimeout(timer); btn.disabled = false; form.classList.remove('sending'); label.textContent = 'Send message';
    }
  });
  upd();
}

/* the custom cursor should react to every interactive element, including ones rendered later */
function cursorDelegation() {
  const cur = $('.motion-cursor'); if (!cur) return;
  document.addEventListener('pointerover', e => { cur.classList.toggle('active', !!(e.target.closest && e.target.closest('a,button,summary,.cert-card,.project-thumb,.lb-stage img,[role=button]'))); });
}

/* ═════════ Boot ═════════ */
about(); resumeStatic(); projects(); cursorDelegation();
let booted = false;
function boot(d) {
  if (booted || !d) return; booted = true;
  journey(d); skills(d); certs(d); resume(d); contact(d);
}
if (window.PORTFOLIO) boot(window.PORTFOLIO);
document.addEventListener('portfolio:ready', e => boot(e.detail));
})();
