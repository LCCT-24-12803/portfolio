/*
 * Cybernetic Arcade — Projects station (phase 4B, station 1)
 * -------------------------------------------------------------
 * A real in-scene holographic console: hexagonal emitter pedestal on the floor, a faint projection
 * beam, and a curved, chamfered holo-panel floating above it (with a ghost echo layer and a scale
 * ruler). It uses the same Three.js instance, palette and GLSL output chunks as the rest of the scene.
 *
 *   const station = createProjectsStation({ THREE, palette, uTime, tier, glslOut, baseUrl, onDirty });
 *   scene.add(station.group);
 *   station.setProjects(content.projects);        // nothing is shown until real projects arrive
 *   station.layout({ aspect, chamber:{x,z} });    // on resize: places the station in the Projects chamber
 *   station.update({ t, dt, camera, pointer, still });
 *   station.hit(camera, x, y) / station.press(camera, x, y)    // NDC, y up
 *   station.frame(out) / station.setFocus(k) / station.activate() / station.reveal()  // walkthrough: world frame, focus 0…1, sweep, boot
 *
 * Content rules: title, description and stack come from content.json verbatim. An image block is
 * drawn only if the project really has `img` / `imgs` and the file loads; a link button only if
 * `link` is a usable http(s) address. Nothing is invented.
 */

const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

// Logical canvas sizes (drawn at 1.5–2× for sharpness) and world sizes of the panel.
const MODES = {
  landscape: { w: 1000, h: 720, W: 4.6, pad: 46, title: 54, desc: 32, lh: 1.5, label: 19, chip: 22, btn: 64, img: 150 },
  portrait:  { w: 760,  h: 540, W: 3.7, pad: 36, title: 46, desc: 27, lh: 1.46, label: 18, chip: 20, btn: 72, img: 110 },
};

const normLink = (s) => {
  s = String(s || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; }
};
const picsOf = (p) => ((p.imgs && p.imgs.length) ? p.imgs : (p.img ? [p.img] : [])).filter((x) => typeof x === 'string' && x.trim());

export function createProjectsStation({ THREE, palette, uTime, tier, glslOut, baseUrl = location.href, onDirty = () => {} }) {
  const { RED_HDR, CYAN_HDR } = palette;
  const low = tier.name === 'low';
  const group = new THREE.Group();
  group.visible = false;

  /* ================================================================ data */
  let projects = [];
  let index = 0;
  let mode = 'landscape';
  let onSelect = null;

  function setProjects(list) {
    projects = (Array.isArray(list) ? list : [])
      .filter((p) => p && typeof p.title === 'string' && p.title.trim())
      .map((p) => ({
        title: p.title.trim(),
        desc: String(p.desc || '').trim(),
        stack: String(p.stack || '').split(',').map((s) => s.trim()).filter(Boolean),
        link: normLink(p.link),
        pics: picsOf(p).map((s) => { try { const u = new URL(s.trim(), baseUrl); return /^(https?:|data:|blob:)/.test(u.protocol) ? u.href : ''; } catch { return ''; } }).filter(Boolean),
        image: null, imageState: 'idle',
      }));
    for (const p of projects) p.host = p.link ? new URL(p.link).host.replace(/^www\./, '') : '';
    index = 0;
    if (!projects.length) { group.visible = false; return; }
    group.visible = true;
    state.boot = state.still ? 1 : 0;
    ensureImage(projects[0]);
    redraw();
    onDirty();
  }

  function ensureImage(p) {
    if (!p || p.imageState !== 'idle' || !p.pics.length) return;
    p.imageState = 'loading';
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.decoding = 'async';
    im.onload = () => { p.image = im; p.imageState = 'ready'; if (projects[index] === p) { redraw(); onDirty(); } };
    im.onerror = () => { p.imageState = 'failed'; };
    im.src = p.pics[0];
  }

  /* ============================================================ canvas content */
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const CS = low ? 1.5 : 2;
  let texture = null;
  const regions = [];
  let hover = '';

  const chamfer = (x, y, w, h, c) => {
    ctx.beginPath();
    ctx.moveTo(x + c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + c);
    ctx.closePath();
  };
  const spaced = (px) => { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; };
  function wrap(text, maxW, maxLines) {
    const words = text.split(/\s+/).filter(Boolean); const lines = []; let line = ''; let truncated = false;
    for (const wd of words) {
      const test = line ? line + ' ' + wd : wd;
      if (!line || ctx.measureText(test).width <= maxW) { line = test; continue; }
      if (lines.length === maxLines - 1) { truncated = true; break; }
      lines.push(line); line = wd;
    }
    if (line) lines.push(line);
    if (truncated) {
      let l = lines[lines.length - 1].replace(/[\s,.;:]+$/, '');
      while (l.length > 1 && ctx.measureText(l + '…').width > maxW) l = l.slice(0, -1).replace(/\s+$/, '');
      lines[lines.length - 1] = l + '…';
    }
    return lines;
  }

  function redraw() {
    if (!projects.length) return;
    const M = MODES[mode];
    if (canvas.width !== Math.round(M.w * CS) || canvas.height !== Math.round(M.h * CS)) {
      canvas.width = Math.round(M.w * CS); canvas.height = Math.round(M.h * CS);
    }
    const { w, h, pad } = M;
    const p = projects[index];
    ctx.setTransform(CS, 0, 0, CS, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = 'alphabetic';
    regions.length = 0;
    const innerW = w - pad * 2;

    /* header */
    ctx.fillStyle = '#ff1f3d'; ctx.fillRect(pad, pad + 2, 12, 12);
    ctx.fillStyle = '#1fe3ff'; ctx.font = `600 ${M.label}px ${MONO}`; spaced(4);
    ctx.textAlign = 'left'; ctx.fillText('PROJECTS', pad + 24, pad + 16);
    const pad2 = (n) => String(n).padStart(2, '0');
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(190,216,226,.6)';
    ctx.fillText(` / ${pad2(projects.length)}`, w - pad, pad + 16);
    const tail = ctx.measureText(` / ${pad2(projects.length)}`).width;
    ctx.fillStyle = '#ff5468'; ctx.fillText(pad2(index + 1), w - pad - tail, pad + 16);
    spaced(0); ctx.textAlign = 'left';

    /* footer: prev · numbered tabs · next (laid out first so the body knows how much room it has) */
    const n = projects.length;
    const showTabs = n > 1 && n <= 8;
    const items = n > 1 ? (showTabs ? n + 2 : 2) : 0;
    const gap = 8;
    const bw = items ? Math.min(M.btn * 1.5, (innerW - gap * (items - 1)) / items) : 0;
    const bh = M.btn;
    const footY = h - pad - bh;
    if (items) {
      let x = pad;
      const defs = [{ type: 'prev' }];
      if (showTabs) for (let i = 0; i < n; i++) defs.push({ type: 'tab', i });
      defs.push({ type: 'next' });
      const total = bw * items + gap * (items - 1); x = pad + (innerW - total) / 2 * 0; // left aligned
      defs.forEach((d) => {
        const key = d.type + (d.i ?? '');
        const active = d.type === 'tab' && d.i === index;
        const hv = hover === key;
        regions.push({ x, y: footY, w: bw, h: bh, type: d.type, i: d.i, key });
        chamfer(x, footY, bw, bh, 12);
        ctx.fillStyle = active ? 'rgba(255,31,61,.26)' : hv ? 'rgba(31,227,255,.18)' : 'rgba(6,16,24,.7)';
        ctx.fill();
        ctx.lineWidth = active ? 2.5 : 1.5;
        ctx.strokeStyle = active ? '#ff3a55' : hv ? '#7df1ff' : 'rgba(31,227,255,.42)';
        ctx.stroke();
        ctx.fillStyle = active ? '#fff' : hv ? '#fff' : 'rgba(150,226,240,.9)';
        const cx = x + bw / 2, cy = footY + bh / 2;
        if (d.type === 'tab') {
          ctx.font = `600 ${M.label + 3}px ${MONO}`; ctx.textAlign = 'center';
          ctx.fillText(pad2(d.i + 1), cx, cy + 7); ctx.textAlign = 'left';
        } else {
          const s = d.type === 'prev' ? -1 : 1;
          ctx.beginPath(); ctx.moveTo(cx - s * 7, cy - 13); ctx.lineTo(cx + s * 7, cy); ctx.lineTo(cx - s * 7, cy + 13);
          ctx.lineWidth = 3.5; ctx.lineJoin = 'miter'; ctx.strokeStyle = ctx.fillStyle; ctx.stroke();
        }
        x += bw + gap;
      });
    }

    /* stack chips + link button, stacked upward from the footer */
    let floor = (items ? footY : h - pad) - 24;
    if (p.link) {
      const lh = 58, lw = Math.min(innerW, 380);
      const y = floor - lh; const key = 'link'; const hv = hover === key;
      regions.push({ x: pad, y, w: lw, h: lh, type: 'link', key });
      chamfer(pad, y, lw, lh, 14);
      ctx.fillStyle = hv ? 'rgba(255,31,61,.34)' : 'rgba(255,31,61,.16)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = hv ? '#ff7a8c' : '#ff3a55'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `700 ${M.label + 2}px ${MONO}`; spaced(3);
      ctx.fillText('OPEN PROJECT', pad + 22, y + lh / 2 + 7);
      const tw = ctx.measureText('OPEN PROJECT').width;
      spaced(0);
      // outbound arrow
      const ax = pad + 22 + tw + 20, ay = y + lh / 2;
      ctx.beginPath(); ctx.moveTo(ax - 8, ay + 8); ctx.lineTo(ax + 8, ay - 8); ctx.moveTo(ax - 2, ay - 8); ctx.lineTo(ax + 8, ay - 8); ctx.lineTo(ax + 8, ay + 2);
      ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.font = `500 ${M.label - 1}px ${MONO}`; ctx.fillStyle = 'rgba(205,228,236,.78)';
      const hostMax = innerW - lw - 18;
      if (hostMax > 80) { let t = p.host; while (t.length > 3 && ctx.measureText(t).width > hostMax) t = t.slice(0, -1); ctx.fillText(t, pad + lw + 18, y + lh / 2 + 6); }
      floor = y - 20;
    }
    if (p.stack.length) {
      ctx.font = `600 ${M.chip}px ${MONO}`; spaced(1);
      const ch = M.chip + 18, cg = 10;
      const rows = []; let row = [], rw = 0;
      p.stack.forEach((s) => {
        const cw = ctx.measureText(s).width + 30;
        if (row.length && rw + cw + cg > innerW) { rows.push(row); row = []; rw = 0; }
        row.push({ s, cw }); rw += cw + cg;
      });
      if (row.length) rows.push(row);
      const shown = rows.slice(0, 2);
      const totalH = shown.length * ch + (shown.length - 1) * cg;
      let y = floor - totalH;
      shown.forEach((r) => {
        let x = pad;
        r.forEach(({ s, cw }) => {
          chamfer(x, y, cw, ch, 9);
          ctx.fillStyle = 'rgba(31,227,255,.09)'; ctx.fill();
          ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(31,227,255,.55)'; ctx.stroke();
          ctx.fillStyle = '#bff6ff'; ctx.fillText(s, x + 15, y + ch / 2 + M.chip * 0.34);
          x += cw + cg;
        });
        y += ch + cg;
      });
      spaced(0);
      floor -= totalH + 18;
      ctx.font = `600 ${M.label - 3}px ${MONO}`; spaced(4); ctx.fillStyle = '#ff5468';
      ctx.fillText('STACK', pad, floor - 2); spaced(0);
      floor -= M.label + 10;
    }

    /* title, rule, optional image, description */
    let y = pad + 40;
    ctx.fillStyle = '#f4fbfd'; ctx.font = `650 ${M.title}px ${SANS}`;
    const tl = wrap(p.title, innerW, 2);
    tl.forEach((l, i) => ctx.fillText(l, pad, y + M.title * 0.86 + i * M.title * 1.1));
    y += tl.length * M.title * 1.1 + 14;
    const g = ctx.createLinearGradient(pad, 0, pad + 170, 0); g.addColorStop(0, '#ff1f3d'); g.addColorStop(1, '#1fe3ff');
    ctx.fillStyle = g; ctx.fillRect(pad, y, 170, 4);
    ctx.fillStyle = 'rgba(31,227,255,.22)'; ctx.fillRect(pad + 178, y + 1, innerW - 178, 2);
    y += 24;

    if (p.image && p.imageState === 'ready') {
      const bwid = innerW, bhei = M.img;
      const room = floor - y - M.desc * M.lh * 2 - 16;
      if (room >= bhei * 0.6) {
        const hh = Math.min(bhei, room);
        ctx.save(); chamfer(pad, y, bwid, hh, 14); ctx.clip();
        const ir = p.image.width / p.image.height, br = bwid / hh;
        let sw = p.image.width, sh = p.image.height, sx = 0, sy = 0;
        if (ir > br) { sw = sh * br; sx = (p.image.width - sw) / 2; } else { sh = sw / br; sy = (p.image.height - sh) / 2; }
        ctx.drawImage(p.image, sx, sy, sw, sh, pad, y, bwid, hh);
        ctx.fillStyle = 'rgba(1,10,16,.22)'; ctx.fillRect(pad, y, bwid, hh);
        ctx.restore();
        chamfer(pad, y, bwid, hh, 14); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(31,227,255,.6)'; ctx.stroke();
        if (p.pics.length > 1) {
          ctx.font = `600 ${M.label - 2}px ${MONO}`; ctx.textAlign = 'right'; ctx.fillStyle = '#bff6ff';
          ctx.fillText(`1 / ${p.pics.length}`, pad + bwid - 14, y + hh - 12); ctx.textAlign = 'left';
        }
        y += hh + 20;
      }
    }

    if (p.desc) {
      ctx.fillStyle = 'rgba(214,232,240,.93)'; ctx.font = `400 ${M.desc}px ${SANS}`;
      const lineH = M.desc * M.lh;
      const maxLines = Math.max(1, Math.floor((floor - y) / lineH));
      wrap(p.desc, innerW, maxLines).forEach((l, i) => ctx.fillText(l, pad, y + M.desc * 0.92 + i * lineH));
    }

    if (texture) texture.needsUpdate = true;
  }

  /* ================================================================ geometry */
  const U = {
    uTime, uBoot: { value: 0 }, uHover: { value: 0 }, uSwitch: { value: 0 },
    uFocus: { value: 0 }, uAct: { value: 0 },   // walkthrough: focus 0…1, one-shot activation sweep 0…1
    uSize: { value: new THREE.Vector2(MODES.landscape.W, MODES.landscape.W * MODES.landscape.h / MODES.landscape.w) },
    uTex: { value: null },
    uRed: { value: RED_HDR(1.0) }, uCyan: { value: palette.CYAN_HDR(1.0) },
  };

  const CHAMFER_GLSL = /* glsl */ `
    float chamferEdge(vec2 p, vec2 size, float c, out bool cut){
      float a = p.x + (size.y - p.y), b = (size.x - p.x) + p.y;
      cut = (a < c || b < c);
      float dch = min(a - c, b - c) * 0.7071;
      return min(min(min(p.x, size.x - p.x), min(p.y, size.y - p.y)), dch);
    }`;
  const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

  const panelMat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; uniform float uTime, uBoot, uHover, uSwitch, uFocus, uAct; uniform vec2 uSize; uniform vec3 uRed, uCyan;
      varying vec2 vUv;
      float hash(float n){ return fract(sin(n * 127.1 + 31.7) * 43758.5453); }
      ${CHAMFER_GLSL}
      void main(){
        vec2 p = vUv * uSize;
        bool cut; float dEdge = chamferEdge(p, uSize, 0.3, cut);
        if (cut) discard;

        // boot: the panel is drawn upward from its base by a bright scan line
        float f = uBoot * 1.2;
        float vis = 1.0 - smoothstep(f - 0.12, f, vUv.y);
        if (vis < 0.002) discard;
        float scanGlow = exp(-pow((vUv.y - (f - 0.07)) * 26.0, 2.0)) * (1.0 - step(0.999, uBoot));

        // switch: a short horizontal glitch with a hint of chromatic split
        float tick = floor(uTime * 18.0);
        float row = floor(vUv.y * 30.0);
        float g = step(0.62, hash(row * 3.1 + tick)) * uSwitch;
        vec2 uv = vec2(vUv.x + (hash(row + tick) - 0.5) * 0.07 * g, vUv.y);
        vec4 tx = texture2D(uTex, uv);
        if (uSwitch > 0.01) {
          float ca = 0.005 * uSwitch;
          tx.r = texture2D(uTex, uv + vec2(ca, 0.0)).r;
          tx.b = texture2D(uTex, uv - vec2(ca, 0.0)).b;
          tx.a *= 1.0 - 0.45 * g;
        }

        // glass body
        vec3 glass = vec3(0.004, 0.012, 0.02) + mix(uRed * 0.04, uCyan * 0.055, vUv.x);
        float scan = (0.5 + 0.5 * sin(vUv.y * uSize.y * 95.0 - uTime * 1.2)) * 0.03;
        float sweep = exp(-pow((fract(uTime * 0.11) - (1.0 - vUv.y)) * 10.0, 2.0)) * 0.1;
        vec3 col = glass + uCyan * (scan * 0.5 + sweep);
        float a = 0.8;
        col = mix(col, tx.rgb * 0.92, tx.a);
        a = max(a, tx.a);

        // frame: red→cyan edge line, thicker corner brackets, faint inner glow
        float line = 1.0 - smoothstep(0.006, 0.018, dEdge);
        vec2 q = min(p, uSize - p);
        float br = (1.0 - smoothstep(0.03, 0.045, dEdge)) * (1.0 - smoothstep(0.45, 0.55, max(q.x, q.y)));
        vec3 fc = mix(uRed * 2.2, uCyan * 1.8, smoothstep(0.0, 1.0, vUv.x));
        float flick = 0.93 + 0.07 * sin(uTime * 3.1 + vUv.x * 6.0);
        col += fc * (line * 0.8 + br * 1.1) * flick * (1.0 + uHover * 0.45 + uFocus * 0.5);
        col += fc * 0.1 * (1.0 - smoothstep(0.0, 0.22, dEdge));
        col += uCyan * scanGlow * 1.5;
        // activation: one bright band sweeps up the panel when the camera starts docking, then the frame stays lit
        float actBand = exp(-pow((vUv.y - (uAct * 1.35 - 0.15)) * 9.0, 2.0)) * step(0.0005, uAct);
        col += (uCyan * 1.5 + uRed * 0.5) * actBand * (0.35 + 0.65 * (0.5 + 0.5 * sin(vUv.x * 40.0 + uTime * 6.0)));
        col *= 1.0 + uFocus * 0.08;
        a = max(a, max(line, max(br, max(scanGlow, actBand * 0.6))));
        gl_FragColor = vec4(col, a * vis);
        ${glslOut}
      }`,
    transparent: true, depthWrite: false, side: THREE.FrontSide,
  });

  const ghostMat = new THREE.ShaderMaterial({
    uniforms: { ...U, uColor: { value: RED_HDR(1.5) }, uOpacity: { value: 0.5 } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform float uTime, uBoot, uOpacity; uniform vec2 uSize; uniform vec3 uColor; varying vec2 vUv;
      ${CHAMFER_GLSL}
      void main(){
        vec2 p = vUv * uSize;
        bool cut; float dEdge = chamferEdge(p, uSize, 0.3, cut);
        if (cut) discard;
        float vis = 1.0 - smoothstep(uBoot * 1.2 - 0.12, uBoot * 1.2, vUv.y);
        float line = 1.0 - smoothstep(0.004, 0.014, dEdge);
        float hatch = step(0.5, fract((p.x + p.y) * 6.0 - uTime * 0.15)) * 0.05 * (1.0 - smoothstep(0.0, 0.5, dEdge));
        gl_FragColor = vec4(uColor * (line * 0.9 + hatch * 3.0), (line * 0.55 + hatch) * uOpacity * vis);
        ${glslOut}
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
  });

  function bentPlane(W, H) {
    const g = new THREE.PlaneGeometry(W, H, 32, 1);
    const pos = g.getAttribute('position'); const R = 9;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, R - Math.sqrt(R * R - x * x)); }
    g.computeVertexNormals();
    return g;
  }

  const panelGroup = new THREE.Group();
  const panel = new THREE.Mesh(bentPlane(1, 1), panelMat);
  panel.renderOrder = 5;
  const ghost = new THREE.Mesh(panel.geometry, ghostMat);
  ghost.position.z = -0.2; ghost.scale.setScalar(1.045); ghost.renderOrder = 4;
  panelGroup.add(ghost, panel);

  // scale ruler along the panel's right edge + corner nodes
  const rulerMat = new THREE.LineBasicMaterial({ color: RED_HDR(1.6), transparent: true, opacity: 0.7, depthWrite: false });
  const ruler = new THREE.LineSegments(new THREE.BufferGeometry(), rulerMat);
  ruler.renderOrder = 5;
  const nodeMat = new THREE.MeshBasicMaterial({ color: CYAN_HDR(2.2) });
  const nodeGeo = new THREE.OctahedronGeometry(0.05, 0);
  const nodes = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(nodeGeo, nodeMat); panelGroup.add(m); return m; });
  panelGroup.add(ruler);

  /* pedestal, beam, ground pulse (landscape only) */
  const pedestal = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x040507, metalness: 1, roughness: 0.3 });
  const baseGeo = new THREE.CylinderGeometry(0.78, 0.95, 0.2, 6);
  const base = new THREE.Mesh(baseGeo, metal); base.position.y = 0.1; base.rotation.y = Math.PI / 6;
  const topGeo = new THREE.CylinderGeometry(0.5, 0.64, 0.12, 6);
  const top = new THREE.Mesh(topGeo, metal); top.position.y = 0.26; top.rotation.y = Math.PI / 6;
  const hexEdgeA = new THREE.LineSegments(new THREE.EdgesGeometry(baseGeo), new THREE.LineBasicMaterial({ color: RED_HDR(2.6) }));
  hexEdgeA.position.copy(base.position); hexEdgeA.rotation.copy(base.rotation);
  const hexEdgeB = new THREE.LineSegments(new THREE.EdgesGeometry(topGeo), new THREE.LineBasicMaterial({ color: CYAN_HDR(1.8) }));
  hexEdgeB.position.copy(top.position); hexEdgeB.rotation.copy(top.rotation);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.3, 6), new THREE.MeshBasicMaterial({ color: CYAN_HDR(1.5), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  lens.rotation.x = -Math.PI / 2; lens.position.y = 0.33; lens.rotation.z = Math.PI / 6;
  const groundMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uFocus: U.uFocus, uColor: { value: CYAN_HDR(1.3) }, uWarm: { value: RED_HDR(2.0) } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform float uTime, uFocus; uniform vec3 uColor, uWarm; varying vec2 vUv;
      void main(){
        float d = length(vUv - 0.5) * 2.0 * 2.4;
        float fade = smoothstep(2.4, 1.0, d) * smoothstep(0.7, 1.1, d);
        float ph = fract(uTime * 0.18);
        float pulse = exp(-pow((d - (1.0 + ph * 1.35)) * 4.2, 2.0)) * (1.0 - ph);
        float ring = smoothstep(0.47, 0.5, abs(fract(d * 2.2) - 0.5)) * 0.06;
        gl_FragColor = vec4(mix(uColor, uWarm, 0.25) , (pulse * 0.5 + ring) * fade * (1.0 + uFocus * 1.6));
        ${glslOut}
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 4.8), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.012; ground.renderOrder = 2;

  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uFocus: U.uFocus, uColor: { value: CYAN_HDR(1.5) } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform float uTime, uFocus; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        float h = vUv.y;                                       // 0 at the pedestal, 1 at the panel
        float e = abs(fract(vUv.x * 6.0) - 0.5) * 2.0;
        float hair = smoothstep(0.9, 1.0, e);
        float bands = 0.5 + 0.5 * sin(h * 46.0 - uTime * 1.8);
        float a = (pow(1.0 - h, 1.25) * 0.14 + hair * 0.34 * (1.0 - h * 0.6)) * (0.72 + 0.28 * bands);
        gl_FragColor = vec4(uColor, a * (1.0 + uFocus * 1.1));
        ${glslOut}
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  let beam = null;
  const hexPts = []; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; hexPts.push(Math.cos(a), 0, Math.sin(a)); }
  const hexGeo = new THREE.BufferGeometry(); hexGeo.setAttribute('position', new THREE.Float32BufferAttribute(hexPts, 3));
  const pulses = [0, 1].map(() => {
    const m = new THREE.LineLoop(hexGeo, new THREE.LineBasicMaterial({ color: CYAN_HDR(1.8), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.renderOrder = 4; return m;
  });
  pedestal.scale.set(0.8, 1, 0.8);
  pedestal.add(base, top, hexEdgeA, hexEdgeB, lens, ground, ...pulses);
  group.add(pedestal, panelGroup);

  /* ================================================================ layout */
  let elev = 3.0;            // panel centre height above the floor
  let beamTop = 1.2, beamR0 = 0.42, beamR1 = 0.9;
  let curSize = { W: 4.6, H: 3.3 };

  function applyMode(next) {
    mode = next;
    const M = MODES[mode];
    const W = M.W, H = W * M.h / M.w;
    curSize = { W, H };
    const g = bentPlane(W, H);
    panel.geometry.dispose?.(); panel.geometry = g; ghost.geometry = g;
    U.uSize.value.set(W, H);
    // ruler (outside the right edge) and corner nodes
    const pts = []; const rx = W / 2 + 0.2;
    const n = 20;
    for (let i = 0; i <= n; i++) { const y = -H / 2 + 0.3 + (H - 0.6) * i / n; const len = i % 5 === 0 ? 0.16 : 0.08; const z = 9 - Math.sqrt(81 - rx * rx); pts.push(rx, y, z, rx + len, y, z); }
    ruler.geometry.dispose(); ruler.geometry = new THREE.BufferGeometry(); ruler.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const zc = (x) => 9 - Math.sqrt(81 - x * x);
    nodes[0].position.set(W / 2, H / 2, zc(W / 2)); nodes[1].position.set(-W / 2, -H / 2, zc(W / 2));
    nodes[2].position.set(W / 2, -H / 2, zc(W / 2)); nodes[3].position.set(-W / 2, H / 2 - 0.3, zc(W / 2));
    nodes[3].visible = false;
    pedestal.visible = mode === 'landscape';
    ruler.visible = mode === 'landscape';
    // new texture for the new canvas size
    texture?.dispose();
    canvas.width = 2; canvas.height = 2;
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = low ? 2 : 8;
    texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
    U.uTex.value = texture;
    redraw();
  }

  function buildBeam() {
    if (beam) { group.remove(beam); beam.geometry.dispose(); }
    const hgt = Math.max(0.2, beamTop - 0.32);
    beam = new THREE.Mesh(new THREE.CylinderGeometry(beamR1, beamR0, hgt, 6, 1, true), beamMat);
    beam.position.y = 0.32 + hgt / 2; beam.rotation.y = Math.PI / 6; beam.renderOrder = 3;
    pedestal.add(beam);
  }

  // Place the station inside the Projects chamber (phase 5C). It is a destination, not an overlay: centred on the corridor's
  // axis at `chamber.z`, facing back down the corridor toward the arriving camera. The hub never shows it.
  // Landscape: a large panel on its hex pedestal. Phones: a 1× panel without pedestal, floating a little lower so the
  // camera (which frames it from the panel's own size) leaves the top controls clear.
  function layout({ aspect, chamber = { x: 0, z: -80 } }) {
    const next = aspect < 0.9 ? 'portrait' : 'landscape';
    if (next !== mode || !texture) applyMode(next);
    if (mode === 'landscape') {
      const s = 1.5;
      group.scale.setScalar(s);
      elev = 3.05 / s;
      beamTop = elev - curSize.H / 2;
    } else {
      group.scale.setScalar(1);
      elev = 2.5;
      beamTop = elev - curSize.H / 2;
    }
    group.position.set(chamber.x, 0, chamber.z);
    group.rotation.y = 0;
    panelGroup.position.set(0, elev, 0);
    if (mode === 'landscape') buildBeam();
    panelBase = elev;
  }
  let panelBase = elev;

  /* ============================================================ interaction */
  const state = { boot: 0, sw: 0, hoverMix: 0, still: false, focus: 0, act: 0, pulse: 0, over: false };
  const ray = new THREE.Raycaster(); const v2 = new THREE.Vector2();

  function pick(camera, x, y) {
    if (!group.visible || !projects.length) return null;
    group.updateMatrixWorld(true);
    v2.set(x, y); ray.setFromCamera(v2, camera);
    const hit = ray.intersectObject(panel, false)[0];
    if (!hit || !hit.uv) return null;
    const M = MODES[mode]; const cx = hit.uv.x * M.w, cy = (1 - hit.uv.y) * M.h;
    const r = regions.find((q) => cx >= q.x && cx <= q.x + q.w && cy >= q.y && cy <= q.y + q.h);
    return { panel: true, region: r || null };
  }
  function setHover(key) {
    if (key === hover) return;
    hover = key; redraw(); onDirty();
  }

  function select(i) {
    if (!projects.length) return;
    const n = projects.length; const next = ((i % n) + n) % n;
    if (next === index) return;
    index = next;
    ensureImage(projects[index]);
    state.sw = state.still ? 0 : 1;
    redraw(); onDirty();
    if (onSelect) onSelect(index, projects[index], n);
  }

  function hit(camera, x, y) { const r = pick(camera, x, y); return !!(r && r.panel); }
  function press(camera, x, y) {
    const r = pick(camera, x, y);
    if (!r) return false;
    const q = r.region;
    if (q) {
      if (q.type === 'tab') select(q.i);
      else if (q.type === 'prev') select(index - 1);
      else if (q.type === 'next') select(index + 1);
      else if (q.type === 'link' && projects[index].link) window.open(projects[index].link, '_blank', 'noopener,noreferrer');
    }
    return true;
  }

  let cursorOut = false;
  function update({ t, dt, camera, pointer, still = false, interactive = true }) {
    state.still = still;
    if (!group.visible) return false;
    if (still) { state.boot = 1; state.sw = 0; state.hoverMix = 0; state.act = 0; }
    else {
      if (state.act > 0) state.act = state.act + dt / 1.25 >= 1 ? 0 : state.act + dt / 1.25;
      state.boot = Math.min(1, state.boot + dt / 1.5);
      state.sw = Math.max(0, state.sw - dt * 2.6);
    }
    U.uBoot.value = state.boot * state.boot * (3 - 2 * state.boot);
    U.uSwitch.value = state.sw;

    let over = false, clickable = false;
    if (!still && pointer && pointer.active) {
      const r = pick(camera, pointer.x, pointer.y);
      over = !!r;
      // Before the camera has docked, the whole panel is one big "go there" target and the tabs don't highlight.
      clickable = !!(r && (interactive ? r.region : true));
      setHover(r && r.region && interactive ? r.region.key : '');
    } else if (hover) setHover('');
    state.hoverMix += ((over ? 1 : 0) - state.hoverMix) * (1 - Math.exp(-dt * 6));
    U.uHover.value = state.hoverMix;
    U.uAct.value = state.act;
    state.over = over;
    cursorOut = clickable;

    // ambient motion
    panelGroup.position.y = panelBase + (still ? 0 : Math.sin(t * 0.6) * 0.05);
    const F = state.focus;
    // focus: the echo layer separates from the panel (depth), the panel swells a touch, everything glows brighter
    ghost.position.z = -0.2 - 0.14 * F + (still ? 0 : Math.sin(t * 0.8) * 0.03);
    panelGroup.scale.setScalar(1 + 0.035 * F);
    ghostMat.uniforms.uOpacity.value = (still ? 0.5 : 0.42 + 0.12 * Math.sin(t * 2.3 + Math.sin(t * 0.7) * 2)) * (1 + 0.5 * F);
    rulerMat.opacity = 0.55 + 0.2 * Math.sin(t * 1.7);
    nodes.forEach((m, i) => { m.rotation.y = t * 0.8 + i; m.rotation.x = t * 0.5; });
    lens.material.opacity = 0.65 + 0.2 * Math.sin(t * 1.9);
    if (pedestal.visible) {
      const bt = beamTop;
      if (!still) state.pulse += dt * (0.22 + 0.45 * F);
      pulses.forEach((m, i) => {
        const ph = still ? 0.5 : ((state.pulse + i / 2) % 1);
        const k = Math.sin(Math.PI * ph);
        const r = beamR0 + (beamR1 - beamR0) * ph;
        m.position.y = 0.34 + ph * Math.max(0.1, bt - 0.34);
        m.scale.setScalar(r * 0.98);
        m.material.opacity = 0.5 * k * state.boot * (1 + F);
      });
    }
    return cursorOut;
  }

  /* ---- walkthrough hooks (driven by the environment's camera rig) ---- */
  const _c = new THREE.Vector3();
  // World-space frame of the panel: centre, facing yaw, and its on-screen size in world units.
  function frame(out) {
    group.updateMatrixWorld(true);
    out.center = (out.center || new THREE.Vector3()).copy(_c.set(0, panelBase, 0)).applyMatrix4(group.matrixWorld);
    out.yaw = group.rotation.y;
    out.w = curSize.W * group.scale.x; out.h = curSize.H * group.scale.x;
    return out;
  }
  function setFocus(k) { state.focus = k; U.uFocus.value = k; }
  function activate() { if (!state.still) state.act = 0.0001; }
  // Called when the chamber is built in: the panel boots up again as the camera approaches.
  function reveal() { state.boot = state.still ? 1 : 0; state.sw = 0; }

  function dispose() {
    texture?.dispose();
    panel.geometry.dispose(); ruler.geometry.dispose(); beam?.geometry.dispose();
    [panelMat, ghostMat, groundMat, beamMat, rulerMat, nodeMat, metal].forEach((m) => m.dispose());
  }

  return {
    group, setProjects, layout, update, hit, press, select, dispose, frame, setFocus, activate, reveal,
    next: () => select(index + 1), prev: () => select(index - 1),
    set onSelect(fn) { onSelect = fn; },
    get count() { return projects.length; },
    get current() { return projects[index] || null; },
    get index() { return index; },
    get over() { return state.over; },
  };
}
