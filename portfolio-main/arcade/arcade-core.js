/*
 * Cybernetic Arcade — interactive digital core (phase 2)
 * -------------------------------------------------------------
 * The hero artifact at the centre of the environment. Built with the same Three.js
 * instance, palette and shader conventions as arcade-environment.js; it adds no
 * dependencies and no assets.
 *
 *   const core = createDigitalCore({ THREE, palette, uTime, tier, track, glslOut, heroPos, heroLight, scale });
 *   scene.add(core.group, core.world);
 *   core.update({ t, dt, camera, pointer, still });     // once per frame
 *   core.burst(1);                                       // manual energy burst
 *   core.state.engage                                    // 0 idle … 1 fully engaged (smoothed)
 *
 * Structure (all in hero-local units, group scaled by `scale`):
 *   shell     faceted icosahedral casing: facet tessellation, inset panels, data-block
 *             flicker, a travelling energy pulse, and a cursor lobe that lights facets
 *   spikes    12 radial antennae with node caps at the shell vertices
 *   lattice   counter-rotating geodesic mesh inside the shell
 *   kernel    red dodecahedral energy core + pulsing pit
 *   rings     three gyroscopic instrument rings (dial ticks, segmented arcs, comet head)
 *   halo      flat holographic disc with outward energy pulses
 *   aura      orbiting particles that swell toward the cursor
 *   world     beam pulses climbing from the platform to the core
 *
 * Idle ↔ interactive: one smoothed scalar `engage` (fast attack, slow release)
 * drives every reaction, and all spin speeds are integrated from it, so nothing snaps.
 */

const TAU = Math.PI * 2;

export function createDigitalCore({ THREE, palette, uTime, uPR, tier, track, glslOut, heroPos, heroLight, scale = 0.88, rand }) {
  const { RED, CYAN, RED_HDR, CYAN_HDR } = palette;
  const low = tier.name === 'low';

  /* ---- shared uniforms: one object drives every material in the core ---- */
  const U = {
    uTime,
    uEngage: { value: 0 },
    uBurstAge: { value: 99 },
    uBurstK: { value: 0 },
    uPtr: { value: new THREE.Vector3(0, 0, 1) },   // world-space direction centre → cursor
    uCenter: { value: heroPos.clone() },
    uFront: { value: -9 },                          // idle energy front (hero-local y)
    uFrontK: { value: 0 },
    uPhase: { value: 0 },                           // integrated spin phase (speeds up when engaged)
    uPR,
  };

  const group = new THREE.Group();
  group.position.copy(heroPos);
  group.scale.setScalar(scale);

  /* ============================================================== SHELL */
  const shellR = 1.35;
  const shellGeo = track(new THREE.IcosahedronGeometry(shellR, 0));
  {
    // Per-face data: barycentric coords (tessellation / inset panels) + a face id.
    const n = shellGeo.getAttribute('position').count;
    const bary = new Float32Array(n * 3);
    const face = new Float32Array(n);
    for (let i = 0; i < n; i++) { bary[i * 3 + (i % 3)] = 1; face[i] = Math.floor(i / 3); }
    shellGeo.setAttribute('aBary', new THREE.BufferAttribute(bary, 3));
    shellGeo.setAttribute('aFace', new THREE.BufferAttribute(face, 1));
  }
  const shellMat = track(new THREE.ShaderMaterial({
    uniforms: { ...U, uColor: { value: CYAN_HDR(1.25) }, uHot: { value: new THREE.Color('#bdf6ff').multiplyScalar(1.5) }, uWarm: { value: RED_HDR(1.6) } },
    vertexShader: /* glsl */ `
      attribute vec3 aBary; attribute float aFace;
      varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vB; varying float vF;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = cameraPosition - wp.xyz;
        vB = aBary; vF = aFace;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uEngage, uBurstAge, uBurstK, uFront, uFrontK;
      uniform vec3 uColor, uHot, uWarm, uPtr, uCenter;
      varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vB; varying float vF;
      float hash(float n){ return fract(sin(n * 127.1 + 31.7) * 43758.5453); }
      void main(){
        vec3 N = normalize(vN); vec3 V = normalize(vV);
        float fres = pow(1.0 - abs(dot(N, V)), 2.2);

        // facet tessellation: 3×3 triangular grid + an inset panel outline
        float edge = min(vB.x, min(vB.y, vB.z));
        float we = max(fwidth(edge), 1e-4);
        float inset = 1.0 - smoothstep(0.0, we * 1.4, abs(edge - 0.16));
        vec3 g3 = vB * 3.0;
        vec3 gd = abs(fract(g3 - 0.5) - 0.5) / max(fwidth(g3), vec3(1e-4));
        float grid = (1.0 - min(min(gd.x, gd.y), gd.z)) * smoothstep(0.16, 0.2, edge);
        grid = clamp(grid, 0.0, 1.0);

        // data blocks: each face blinks on its own slow cycle (only ~half the faces take part)
        float ph = fract(uTime * 0.22 + hash(vF));
        float blink = smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.08, 0.5, ph)) * step(0.5, hash(vF * 3.1));

        // vertical energy front (idle pulse) + the burst front (faster, on interaction)
        float y = vW.y - uCenter.y;
        float pf = exp(-pow((y - uFront) * 2.6, 2.0)) * uFrontK;
        float bfront = mix(-1.7, 1.7, clamp(uBurstAge * 1.7, 0.0, 1.0));
        float bf = exp(-pow((y - bfront) * 2.2, 2.0)) * uBurstK * (1.0 - smoothstep(0.55, 0.62, uBurstAge * 1.0));

        // cursor lobe: facets facing the cursor energise
        vec3 dir = normalize(vW - uCenter);
        float lobe = pow(max(dot(dir, uPtr), 0.0), 5.0) * uEngage;
        float facet = pow(max(dot(N, uPtr), 0.0), 7.0) * uEngage;

        float energy = pf * 0.7 + bf * 1.0 + lobe * 0.6 + facet * 0.45;
        float emit = 0.02 + fres * 0.5
                   + (inset * 0.32 + grid * 0.075) * (0.55 + 0.55 * uEngage)
                   + blink * (0.2 + 0.25 * uEngage)
                   + energy * 0.34;
        vec3 c = uColor * (0.5 + fres * 1.3);
        c = mix(c, uWarm, clamp(bf * 0.55, 0.0, 0.7));
        c = mix(c, uHot, clamp(energy * 0.55 + blink * 0.2, 0.0, 0.6));
        gl_FragColor = vec4(c, clamp(emit, 0.0, 1.0));
        ${glslOut}
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  }));
  const shellMesh = new THREE.Mesh(shellGeo, shellMat);
  shellMesh.renderOrder = 3;

  const edgeMat = track(new THREE.LineBasicMaterial({ color: CYAN_HDR(1.9), transparent: true, opacity: 0.95, depthWrite: false }));
  const shellEdges = new THREE.LineSegments(track(new THREE.EdgesGeometry(shellGeo)), edgeMat);
  shellEdges.renderOrder = 3;

  /* spikes + node caps at the 12 shell vertices */
  const verts = [];
  {
    const p = shellGeo.getAttribute('position'); const seen = new Set();
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const k = v.toArray().map((x) => x.toFixed(3)).join();
      if (!seen.has(k)) { seen.add(k); verts.push(v); }
    }
  }
  const spikeGeo = track(new THREE.BufferGeometry());
  {
    const a = [];
    verts.forEach((v) => {
      const d = v.clone().normalize();
      const s = v.clone().addScaledVector(d, 0.07), e = v.clone().addScaledVector(d, 0.34);
      a.push(s.x, s.y, s.z, e.x, e.y, e.z);
    });
    spikeGeo.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
  }
  const spikeMat = track(new THREE.LineBasicMaterial({ color: CYAN_HDR(1.1), transparent: true, opacity: 0.8, depthWrite: false }));
  const spikes = new THREE.LineSegments(spikeGeo, spikeMat);
  spikes.renderOrder = 3;
  const nodeGeo = track(new THREE.OctahedronGeometry(0.052, 0));
  const nodeMat = track(new THREE.MeshBasicMaterial({ color: CYAN_HDR(2.4) }));
  const nodes = new THREE.InstancedMesh(nodeGeo, nodeMat, verts.length);
  {
    const m = new THREE.Matrix4();
    verts.forEach((v, i) => { m.setPosition(v.clone().normalize().multiplyScalar(shellR + 0.4)); nodes.setMatrixAt(i, m); });
  }
  const shell = new THREE.Group();
  shell.add(shellMesh, shellEdges, spikes, nodes);

  /* ============================================================ LATTICE */
  const latticeGeo = track(new THREE.IcosahedronGeometry(0.98, 1));
  const latticeMat = track(new THREE.LineBasicMaterial({ color: new THREE.Color().copy(CYAN_HDR(0.8)).lerp(RED_HDR(1.4), 0.45), transparent: true, opacity: low ? 0.2 : 0.26, depthWrite: false }));
  const lattice = new THREE.LineSegments(track(new THREE.EdgesGeometry(latticeGeo, 8)), latticeMat);
  lattice.renderOrder = 3;

  /* ============================================================= KERNEL */
  const kernelGeo = track(new THREE.DodecahedronGeometry(0.62, 0));
  const kernelEdgeMat = track(new THREE.LineBasicMaterial({ color: RED_HDR(3.4), transparent: true, opacity: 0.95, depthWrite: false }));
  const kernelEdges = new THREE.LineSegments(track(new THREE.EdgesGeometry(kernelGeo)), kernelEdgeMat);
  kernelEdges.renderOrder = 3;
  const kernelFillMat = track(new THREE.ShaderMaterial({
    uniforms: { uTime, uEngage: U.uEngage, uColor: { value: RED_HDR(2.2) } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uEngage; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float s = 1.0 - 0.25 * (0.5 + 0.5 * sin(vW.y * 55.0 - uTime * 2.5));
        float beat = 0.5 + 0.5 * sin(uTime * 1.4);
        float a = (0.05 + 0.03 * beat + f * 0.7 + uEngage * 0.08) * s;
        gl_FragColor = vec4(uColor * (0.45 + f * 1.4 + uEngage * 0.5), a);
        ${glslOut}
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  }));
  const kernelFill = new THREE.Mesh(kernelGeo, kernelFillMat);
  kernelFill.renderOrder = 3;
  const pitMat = track(new THREE.MeshBasicMaterial({ color: RED_HDR(5), fog: false }));
  const pit = new THREE.Mesh(track(new THREE.IcosahedronGeometry(0.16, 2)), pitMat);
  const kernel = new THREE.Group();
  kernel.add(kernelFill, kernelEdges);

  /* ============================================================== RINGS */
  // Flat bands whose pattern lives in the shader: hairline, dial ticks, segmented arcs, comet head.
  function ringMaterial({ inner, outer, color, line = 0.5, ticks = 0, major = 0, arcs = 0, arcFill = 0.7, comet = 1, dir = 1, opacity = 1 }) {
    return track(new THREE.ShaderMaterial({
      uniforms: {
        uPhase: U.uPhase, uEngage: U.uEngage, uBurstAge: U.uBurstAge, uBurstK: U.uBurstK,
        uColor: { value: color.clone() }, uInner: { value: inner }, uOuter: { value: outer },
        uLine: { value: line }, uTicks: { value: ticks }, uMajor: { value: major },
        uArcs: { value: arcs }, uArcFill: { value: arcFill }, uComet: { value: comet }, uDir: { value: dir }, uOpacity: { value: opacity },
      },
      vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uPhase, uEngage, uBurstAge, uBurstK, uInner, uOuter, uLine, uTicks, uMajor, uArcs, uArcFill, uComet, uDir, uOpacity;
        uniform vec3 uColor; varying vec2 vP;
        void main(){
          float r = length(vP);
          float u = atan(vP.y, vP.x) / 6.2831853 + 0.5;
          float band = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
          float fu = fwidth(u);

          float hair = (1.0 - smoothstep(0.0, 0.16, abs(band - 0.5))) * uLine;

          float tk = 0.0;
          if (uTicks > 0.0) {
            float x = u * uTicks;
            float d = abs(fract(x) - 0.5);
            float w = fu * uTicks * 1.2 + 0.05;
            float mark = smoothstep(0.5 - w, 0.5, d);
            float majorMark = uMajor > 0.0 ? smoothstep(0.5 - w / uMajor, 0.5, abs(fract(x / uMajor) - 0.5)) : 0.0;
            float shortBand = step(0.55, band);
            tk = max(mark * shortBand, majorMark) * 0.9;
          }

          float arc = 0.0;
          if (uArcs > 0.0) {
            float s = fract(u * uArcs);
            float aw = fu * uArcs * 1.0 + 0.01;
            arc = smoothstep(0.0, aw, s) * (1.0 - smoothstep(uArcFill - aw, uArcFill, s));
            arc *= 1.0 - smoothstep(0.0, 0.5, abs(band - 0.5) * 2.0 - 0.15);
          }

          // comet: bright head with a long trailing fade, direction set per ring
          float hd = fract(uPhase * uDir - u * uDir);
          float cm = pow(1.0 - hd, 9.0) * uComet;

          float burst = uBurstK * exp(-uBurstAge * 2.2) * (1.0 - exp(-uBurstAge * 16.0));
          float lum = hair * 0.55 + tk * 0.75 + arc * 0.85 + cm * (arc * 1.4 + hair * 1.0 + 0.0) + burst * 0.5 * (hair + arc);
          lum *= 0.85 + 0.9 * uEngage;
          vec3 c = uColor * (0.7 + cm * 1.4 + burst * 0.8);
          gl_FragColor = vec4(c, clamp(lum, 0.0, 1.0) * uOpacity);
          ${glslOut}
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
  }
  const ringDefs = [
    // dial ring — fine ticks, longer marks every 6th, slow comet
    { inner: 2.2, outer: 2.46, color: CYAN_HDR(1.9), line: 0.55, ticks: 96, major: 6, comet: 0.9, dir: 1, tilt: [1.15, 0, 0.2], prec: 0.07 },
    // outer arc ring — six segmented arcs, red
    { inner: 2.86, outer: 3.04, color: RED_HDR(3.0), line: 0.25, arcs: 6, arcFill: 0.7, comet: 1.0, dir: -1, tilt: [0.55, 0.3, -0.6], prec: -0.05 },
    // inner fine ring — dense hairline ticks, dim cyan
    { inner: 1.72, outer: 1.88, color: CYAN_HDR(1.0), line: 0.45, ticks: 180, major: 0, comet: 0.6, dir: 1, tilt: [-0.4, 0.9, 0.5], prec: 0.1, opacity: 0.8 },
  ];
  const ringSegs = low ? 160 : 256;
  const rings = new THREE.Group();
  const ringMeshes = ringDefs.map((d) => {
    const mesh = new THREE.Mesh(track(new THREE.RingGeometry(d.inner, d.outer, ringSegs, 1)), ringMaterial(d));
    mesh.renderOrder = 3;
    mesh.rotation.set(...d.tilt);
    mesh.userData = d;
    rings.add(mesh);
    return mesh;
  });

  /* =============================================================== HALO */
  // Flat projection disc under the core: faint radar rings + idle and burst pulses travelling outward.
  const haloMat = track(new THREE.ShaderMaterial({
    uniforms: { ...U, uColor: { value: CYAN_HDR(1.3) }, uWarm: { value: RED_HDR(2.0) }, uPulse: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uEngage, uBurstAge, uBurstK, uPulse; uniform vec3 uColor, uWarm; varying vec2 vUv;
      void main(){
        float d = length(vUv - 0.5) * 10.0;                 // local units
        float fade = smoothstep(5.0, 1.6, d) * smoothstep(0.9, 1.5, d);
        float rr = abs(fract(d * 1.6) - 0.5);
        float lines = smoothstep(0.47, 0.5, rr) * 0.07;
        // idle pulse (phase integrated on the CPU so engagement can speed it up smoothly)
        float p = fract(uPulse);
        float rp = 1.5 + p * 3.2;
        float idle = exp(-pow((d - rp) * 2.6, 2.0)) * pow(1.0 - p, 1.6) * 0.5;
        // burst pulse
        float rb = 1.4 + uBurstAge * 4.6;
        float bur = exp(-pow((d - rb) * 2.2, 2.0)) * exp(-uBurstAge * 1.7) * uBurstK;
        float a = (lines * (0.6 + uEngage) + idle * (0.7 + 0.6 * uEngage) + bur * 0.9) * fade;
        vec3 c = mix(uColor, uWarm, clamp(bur * 0.6, 0.0, 0.7));
        gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
        ${glslOut}
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  }));
  const halo = new THREE.Mesh(track(new THREE.PlaneGeometry(10, 10)), haloMat);
  halo.rotation.x = -Math.PI / 2;
  halo.renderOrder = 2;

  /* ============================================================== AURA   */
  const auraCount = low ? 64 : 170;
  const auraGeo = track(new THREE.BufferGeometry());
  {
    const pos = new Float32Array(auraCount * 3);              // unused by the shader, required by Points
    const seed = new Float32Array(auraCount * 4);             // radius, phase, speed, size
    const orient = new Float32Array(auraCount * 2);           // inclination, node
    const col = new Float32Array(auraCount * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < auraCount; i++) {
      seed[i * 4] = 1.75 + Math.pow(rand(), 1.4) * 1.7;
      seed[i * 4 + 1] = rand() * TAU;
      seed[i * 4 + 2] = (0.06 + rand() * 0.14) * (rand() < 0.25 ? -1 : 1);
      seed[i * 4 + 3] = 0.7 + rand() * 1.5;
      orient[i * 2] = (rand() - 0.5) * 2.2;
      orient[i * 2 + 1] = rand() * TAU;
      const r = rand();
      if (r < 0.4) tmp.copy(RED_HDR(1.5)); else if (r < 0.85) tmp.copy(CYAN_HDR(1.0)); else tmp.set('#cfe4ee').multiplyScalar(0.8);
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    auraGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    auraGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    auraGeo.setAttribute('aOrient', new THREE.BufferAttribute(orient, 2));
    auraGeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  }
  const auraMat = track(new THREE.ShaderMaterial({
    uniforms: { ...U },
    vertexShader: /* glsl */ `
      uniform float uTime, uPR, uEngage, uBurstAge, uBurstK, uPhase; uniform vec3 uPtr;
      attribute vec4 aSeed; attribute vec2 aOrient; attribute vec3 aColor;
      varying vec3 vCol; varying float vA;
      void main(){
        float kick = uBurstK * exp(-uBurstAge * 2.4) * (1.0 - exp(-uBurstAge * 14.0));
        float R = aSeed.x * (1.0 + 0.09 * uEngage) + kick * 0.9;
        float ang = aSeed.y + uPhase * aSeed.z * 6.2831853;
        vec3 p = vec3(cos(ang), 0.0, sin(ang)) * R;
        p.y += sin(ang * 2.0 + aSeed.y * 3.0) * 0.16 * R * 0.5;
        float ci = cos(aOrient.x), si = sin(aOrient.x);       // inclination about X
        p = vec3(p.x, p.y * ci - p.z * si, p.y * si + p.z * ci);
        float cn = cos(aOrient.y), sn = sin(aOrient.y);       // node about Y
        p = vec3(p.x * cn + p.z * sn, p.y, -p.x * sn + p.z * cn);
        // swell toward the cursor
        float al = max(dot(normalize(p), uPtr), 0.0);
        float pull = pow(al, 4.0) * uEngage;
        p += uPtr * pull * 0.85;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.6 + 0.4 * sin(uTime * (0.9 + aSeed.w) + aSeed.y * 5.0);
        vA = tw * (0.42 + 0.5 * uEngage + pull * 0.5 + kick * 0.4) * exp(-(-mv.z) * 0.012);
        vCol = aColor * (1.0 + pull * 0.8);
        gl_PointSize = clamp(aSeed.w * uPR * (1.0 + 0.5 * uEngage + pull) * (30.0 / max(-mv.z, 0.5)), 1.0, 8.0 * uPR);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol; varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(1.0 - clamp(d, 0.0, 1.0), 2.0) * vA;
        gl_FragColor = vec4(vCol, a);
        ${glslOut}
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const aura = new THREE.Points(auraGeo, auraMat);
  aura.frustumCulled = false;
  aura.renderOrder = 4;

  /* ================================================================ assemble */
  group.add(halo, lattice, kernel, pit, shell, rings, aura);

  /* ============================================================ BEAM PULSES */
  // World-space rings that climb the beam from the platform to the core.
  const world = new THREE.Group();
  const platformTop = 0.22;
  const beamLen = heroPos.y - platformTop;
  const beamRingGeo = track(new THREE.TorusGeometry(0.17, 0.007, 6, 48));
  const beamRings = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(beamRingGeo, track(new THREE.MeshBasicMaterial({ color: CYAN_HDR(1.8), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })));
    m.rotation.x = Math.PI / 2;
    m.position.set(heroPos.x, platformTop, heroPos.z);
    m.renderOrder = 3;
    world.add(m);
    return m;
  });

  /* ================================================================= state */
  const state = {
    engage: 0, near: 0, over: 0, still: false,
    ptr: new THREE.Vector3(0, 0, 1),
    tiltX: 0, tiltZ: 0,
    spin: 0, spinL: 0, spinR: 0, ringSpin: [0, 0, 0], beamPhase: 0, haloPhase: 0, uPhase: 0,
    burstT: 99, armed: true, lastBurst: -9, sinceBurst: 99, hold: 0,
  };
  const baseCols = {
    edge: edgeMat.color.clone(), spike: spikeMat.color.clone(), node: nodeMat.color.clone(),
    kEdge: kernelEdgeMat.color.clone(), pit: pitMat.color.clone(), lattice: latticeMat.color.clone(),
  };
  const lightBase = { intensity: heroLight.intensity, color: heroLight.color.clone() };
  const lightHot = new THREE.Color('#9ff3ff');

  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3();
  const R_CORE = shellR * scale;                              // world radius of the shell
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // Closest approach (world units) of the cursor ray to the core centre. Leaves the ray in _o/_d and the
  // closest point in _p so callers can derive the cursor direction from the same numbers.
  function rayDist(camera, px, py) {
    group.getWorldPosition(_c);
    _o.copy(camera.position);
    _d.set(px, py, 0.5).unproject(camera).sub(_o).normalize();
    const along = Math.max(0, _q.copy(_c).sub(_o).dot(_d));
    _p.copy(_o).addScaledVector(_d, along);
    return _p.distanceTo(_c);
  }
  // 0…1: how squarely a screen point (NDC, y up) sits on the core. Used for taps, which can
  // begin and end between two frames.
  function probe(camera, px, py) {
    camera.updateMatrixWorld();
    return 1 - smooth(R_CORE * 0.9, R_CORE * 1.3, rayDist(camera, px, py));
  }
  // Keep the core engaged for a moment (touch has no hover to hold it open).
  function hold(seconds) { state.hold = Math.max(state.hold, seconds); }

  function burst(k = 1) {
    state.burstT = 0;
    U.uBurstK.value = k;
  }

  // Idle phase constants (so reduced-motion stills can be computed from time alone).
  const PULSE_PERIOD = 6.5;

  function update({ t, dt, camera, pointer, still = false }) {
    state.still = still;

    /* ---- proximity: closest approach of the cursor ray to the core centre ---- */
    let target = 0;
    group.getWorldPosition(_c);
    U.uCenter.value.copy(_c);
    if (!still && pointer && pointer.active) {
      const dist = rayDist(camera, pointer.x, pointer.y);
      state.near = 1 - smooth(R_CORE * 1.25, R_CORE * 4.0, dist);
      state.over = 1 - smooth(R_CORE * 0.9, R_CORE * 1.3, dist);
      target = Math.min(1, state.near * 0.55 + state.over * 0.5);
      // direction centre → cursor point (on the near side of the shell when over it)
      _q.copy(_p).sub(_c);
      if (dist < R_CORE) { _q.addScaledVector(_d, -Math.sqrt(Math.max(0, R_CORE * R_CORE - dist * dist))); }
      if (_q.lengthSq() > 1e-6) state.ptr.lerp(_q.normalize(), 1 - Math.exp(-dt * 7));
      state.ptr.normalize();
      // soft burst when the cursor first lands on the core (hysteresis so jitter can't retrigger)
      if (state.over < 0.2) state.armed = true;
      if (state.armed && state.over > 0.65 && state.sinceBurst > 1.2) { burst(0.55); state.armed = false; }
    } else {
      state.near = 0; state.over = 0;
    }

    /* ---- engage: quick attack, slow release, eased ---- */
    if (still) {
      state.engage = 0;
    } else {
      if (state.hold > 0) { state.hold -= dt; target = Math.max(target, 0.75); }
      const rate = target > state.engage ? 5.0 : 1.5;
      state.engage += (target - state.engage) * (1 - Math.exp(-dt * rate));
    }
    const e = state.engage;
    const ee = e * e * (3 - 2 * e);                          // eased copy for visuals
    U.uEngage.value = ee;
    U.uPtr.value.copy(state.ptr);

    /* ---- burst clock ---- */
    if (still) { state.burstT = 99; } else { state.burstT += dt; state.sinceBurst = state.burstT; }
    U.uBurstAge.value = state.burstT;
    if (state.burstT > 4) U.uBurstK.value = 0;

    /* ---- integrated motion (speeds ease with engagement; nothing is a function of t alone) ---- */
    if (still) {
      state.spin = t * 0.12; state.spinL = t; state.uPhase = t * 0.16;
      state.ringSpin = [t * 0.07, -t * 0.05, t * 0.1]; state.beamPhase = t * 0.2; state.haloPhase = t / PULSE_PERIOD;
      state.tiltX = 0; state.tiltZ = 0;
    } else {
      const sp = 1 + ee * 2.2;
      state.spin += dt * 0.12 * (1 + ee * 1.5);
      state.spinL += dt * (1 + ee * 1.2);
      state.uPhase += dt * 0.16 * sp;
      for (let i = 0; i < 3; i++) state.ringSpin[i] += dt * ringDefs[i].prec * (1 + ee * 2.4);
      state.beamPhase += dt * 0.2 * (1 + ee * 1.6);
      state.haloPhase += (dt / PULSE_PERIOD) * (1 + ee * 1.1);
      // the shell leans toward the cursor
      const k = 1 - Math.exp(-dt * 3.2);
      state.tiltX += (-state.ptr.y * 0.22 * ee - state.tiltX) * k;
      state.tiltZ += (state.ptr.x * 0.22 * ee - state.tiltZ) * k;
    }

    /* ---- transforms ---- */
    shell.rotation.set(Math.sin(t * 0.17) * 0.12 + state.tiltX, state.spin, state.tiltZ);
    lattice.rotation.set(state.spinL * 0.13, -state.spin * 1.6, state.spinL * 0.05);
    kernel.rotation.set(-state.spinL * 0.31, -state.spinL * 0.23, 0);
    const beat = 1 + Math.sin(t * 1.4) * 0.05 + ee * 0.1;
    pit.scale.setScalar(beat);
    kernel.scale.setScalar(1 + ee * 0.04);
    ringMeshes.forEach((m, i) => {
      const d = m.userData;
      m.rotation.x = d.tilt[0] + (i === 2 ? state.ringSpin[2] * 1.3 : 0) + Math.sin(t * 0.3 + i) * 0.03;
      m.rotation.y = d.tilt[1] + (i === 2 ? 0 : state.ringSpin[i]);
      m.scale.setScalar(1 + ee * 0.035 * (i + 1) + burstKick() * 0.05 * (i + 1));
    });
    group.position.y = heroPos.y + Math.sin(t * 0.55) * 0.09;
    U.uPhase.value = state.uPhase;

    /* ---- idle energy front climbing the shell ---- */
    const fp = (still ? t : t) / PULSE_PERIOD;
    const cyc = fp - Math.floor(fp);
    U.uFront.value = -1.7 + cyc * 3.4;
    U.uFrontK.value = Math.sin(Math.PI * Math.min(1, cyc * 1.15));
    haloMat.uniforms.uPulse.value = state.haloPhase;

    /* ---- light + colour response ---- */
    heroLight.intensity = lightBase.intensity + Math.sin(t * 1.4) * 2 + ee * 13 + burstKick() * 12;
    heroLight.color.copy(lightBase.color).lerp(lightHot, ee * 0.45);
    const kScale = 1 + ee * 0.45 + burstKick() * 0.5;
    edgeMat.color.copy(baseCols.edge).multiplyScalar(1 + ee * 0.3 + burstKick() * 0.4);
    spikeMat.color.copy(baseCols.spike).multiplyScalar(1 + ee * 0.7);
    spikeMat.opacity = 0.7 + ee * 0.3;
    nodeMat.color.copy(baseCols.node).multiplyScalar(1 + ee * 0.6 + burstKick() * 0.6);
    kernelEdgeMat.color.copy(baseCols.kEdge).multiplyScalar(kScale);
    pitMat.color.copy(baseCols.pit).multiplyScalar(kScale);
    latticeMat.opacity = (low ? 0.2 : 0.26) + ee * 0.22;

    /* ---- beam pulses ---- */
    beamRings.forEach((m, i) => {
      const ph = (state.beamPhase + i / 3) % 1;
      m.position.y = platformTop + ph * beamLen * 0.92;
      const s = 0.55 + 0.45 * Math.sin(Math.PI * ph);
      m.scale.setScalar(s);
      m.material.opacity = (0.12 + ee * 0.5) * Math.sin(Math.PI * ph);
    });
  }

  function burstKick() {
    const a = state.burstT;
    return U.uBurstK.value * Math.exp(-a * 2.4) * (1 - Math.exp(-a * 14));
  }

  return { group, world, update, burst, probe, hold, state, uniforms: U, dispose() {} };
}
