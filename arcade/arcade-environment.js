/*
 * Cybernetic Arcade — 3D environment (phase 1) + interactive digital core (phase 2)
 * -------------------------------------------------------------
 * Self-contained Three.js scene. No portfolio content, no UI, no network calls.
 *
 *   import { mountArcadeEnvironment } from './arcade-environment.js';
 *   const env = mountArcadeEnvironment(containerElement, { quality: 'auto' });
 *   env.dispose();
 *
 * Quality tiers: 'high' (desktop) and 'low' (phones / coarse pointers).
 * A tiny adaptive governor lowers resolution / bloom if the frame rate drops.
 * `prefers-reduced-motion: reduce` renders a single still frame with no parallax.
 */
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createDigitalCore } from './arcade-core.js';
import { createProjectsStation } from './projects-station.js';
import { createProjectsPortal } from './projects-portal.js';

/* ------------------------------------------------------------------ palette */
const RED = new THREE.Color('#ff1f3d');
const CYAN = new THREE.Color('#1fe3ff');
const VOID = 0x010204;
// HDR boosts so red and cyan carry comparable luminance into the bloom pass.
const hdr = (c, k) => c.clone().multiplyScalar(k);
const RED_HDR = (k = 3.2) => hdr(RED, k);
const CYAN_HDR = (k = 1.7) => hdr(CYAN, k);

const HERO_POS = new THREE.Vector3(0, 2.7, -3.2);
// Phase 5C: Frame 2 of the corridor is the Projects portal; the Projects chamber lies beyond the last frame.
const PORTAL_Z = -17, CHAMBER_Z = -32;

/* ------------------------------------------------------------------ helpers */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function detectTier(requested) {
  if (requested === 'high' || requested === 'low') return requested;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600 || window.innerWidth < 820;
  return coarse || small ? 'low' : 'high';
}

const TIERS = {
  high: {
    dprCap: 2, bloom: true, reflectorScale: 0.75, reflectorSamples: 4, msaa: 4,
    particles: 900, trails: 48, frames: 7, slabsPerSide: 6, floaters: 14, panels: 4,
  },
  low: {
    dprCap: 1.5, bloom: false, reflectorScale: 0.5, reflectorSamples: 0, msaa: 0,
    particles: 260, trails: 18, frames: 5, slabsPerSide: 3, floaters: 7, panels: 2,
  },
};

/* Shared GLSL snippets */
const GLSL_OUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

/* ----------------------------------------------------------------- env map  */
// Tiny procedural studio: red strip left, cyan strip right, faint top light.
// Gives the dark metal slabs and frames believable red/cyan glints.
function buildEnvironmentMap(renderer) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x000000);
  const panel = (color, k, w, h, pos) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(k), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  panel(RED, 5.0, 16, 7, [-13, 3, 1]);
  panel(CYAN, 3.2, 16, 7, [13, 3, 1]);
  panel(CYAN, 1.4, 24, 3, [0, 11, -9]);
  panel(RED, 1.2, 24, 3, [0, 11, 9]);
  panel(new THREE.Color('#9fb7c4'), 0.35, 30, 4, [0, 12, 0]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(s, 0.035);
  pmrem.dispose();
  s.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return rt;
}

/* ------------------------------------------------------------ shader pieces */
function holoMaterial(color, uTime, { rim = 1.4, base = 0.04, scan = 0.25 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime, uColor: { value: color.clone() },
      uRim: { value: rim }, uBase: { value: base }, uScan: { value: scan },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = cameraPosition - wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform float uRim, uBase, uScan;
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float s = 1.0 - uScan * (0.5 + 0.5 * sin(vW.y * 55.0 - uTime * 2.5));
        float a = (uBase + f * uRim * 0.45) * s;
        gl_FragColor = vec4(uColor * (0.45 + f * 1.4), a);
        ${GLSL_OUT}
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

function lineMaterial(color, opacity = 0.9) {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
}

/* Glossy black floor: a Reflector (true planar reflection) + a dark gloss/grid veil. */
function buildFloor(uTime, tier, size) {
  const group = new THREE.Group();
  const reflector = new Reflector(new THREE.PlaneGeometry(260, 260), {
    color: new THREE.Color(0x8a8f99),
    textureWidth: Math.max(2, Math.floor(size.w * tier.dpr * tier.reflectorScale)),
    textureHeight: Math.max(2, Math.floor(size.h * tier.dpr * tier.reflectorScale)),
    clipBias: 0.003,
    multisample: tier.reflectorSamples,
  });
  reflector.rotation.x = -Math.PI / 2;
  group.add(reflector);

  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 260),
    new THREE.ShaderMaterial({
      uniforms: { uTime, uRed: { value: RED.clone() }, uCyan: { value: CYAN.clone() } },
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uRed; uniform vec3 uCyan;
        varying vec3 vW;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p){
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
        }
        float gridLine(vec2 p, float size, float px){
          vec2 q = p / size;
          vec2 w = fwidth(q);
          vec2 g = abs(fract(q - 0.5) - 0.5) / max(w, vec2(1e-5));
          float l = 1.0 - min(min(g.x, g.y) / px, 1.0);
          float fade = 1.0 - smoothstep(0.25, 0.7, max(w.x, w.y));
          return l * fade;
        }
        void main(){
          vec2 p = vW.xz;
          float dCam = length(vW - cameraPosition);
          float far = smoothstep(12.0, 78.0, dCam);
          // Lower alpha = more of the reflection shows through (glossier).
          float alpha = mix(0.52, 0.985, far);
          float scuff = (vnoise(p * 1.4) - 0.5) * 0.10 + (vnoise(p * 7.0) - 0.5) * 0.05;
          alpha = clamp(alpha + scuff * (1.0 - far), 0.0, 1.0);

          float g1 = gridLine(p, 1.0, 0.9);
          float g2 = gridLine(p, 4.0, 1.2);
          float sweep = pow(0.5 + 0.5 * sin(p.y * 0.11 + uTime * 0.75), 7.0);
          vec3 gridCol = mix(uRed, uCyan, smoothstep(-8.0, 8.0, p.x));
          float atten = exp(-dCam * 0.028);
          vec3 rgb = gridCol * (g1 * 0.022 + g2 * 0.09) * (1.0 + 2.2 * sweep) * atten;

          // Soft light pools cast by the two key lights.
          rgb += uRed  * exp(-pow(length(p - vec2(-5.0, -3.0)) / 7.0, 2.0)) * 0.030;
          rgb += uCyan * exp(-pow(length(p - vec2( 5.0, -3.0)) / 7.0, 2.0)) * 0.030;

          gl_FragColor = vec4(rgb, alpha);
          ${GLSL_OUT}
        }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  }));
  veil.rotation.x = -Math.PI / 2;
  veil.position.y = 0.004;
  veil.renderOrder = 1;
  group.add(veil);

  return { group, reflector, veil };
}

/* Instanced light trails: ribbons that stream along the floor and through the air. */
function buildTrails(count, uTime, rand) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.instanceCount = count;

  const lane = new Float32Array(count);
  const y = new Float32Array(count);
  const speed = new Float32Array(count);
  const offset = new Float32Array(count);
  const len = new Float32Array(count);
  const width = new Float32Array(count);
  const color = new Float32Array(count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    let x;
    do { x = (rand() * 2 - 1) * 13; } while (Math.abs(x) < 1.6);
    const aerial = rand() < 0.3;
    lane[i] = x;
    y[i] = aerial ? 0.7 + rand() * 6.0 : 0.03;
    const dir = rand() < 0.72 ? 1 : -1;
    speed[i] = dir * (aerial ? 3 + rand() * 7 : 5 + rand() * 11);
    offset[i] = rand() * 200;
    len[i] = aerial ? 3 + rand() * 7 : 2.5 + rand() * 7;
    width[i] = aerial ? 0.03 + rand() * 0.02 : 0.035 + rand() * 0.04;
    const redSide = x < 0;
    const pickRed = rand() < 0.7 ? redSide : !redSide;
    tmp.copy(pickRed ? RED_HDR(2.6) : CYAN_HDR(1.5));
    color.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geo.setAttribute('aLane', new THREE.InstancedBufferAttribute(lane, 1));
  geo.setAttribute('aY', new THREE.InstancedBufferAttribute(y, 1));
  geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speed, 1));
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offset, 1));
  geo.setAttribute('aLen', new THREE.InstancedBufferAttribute(len, 1));
  geo.setAttribute('aWidth', new THREE.InstancedBufferAttribute(width, 1));
  geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(color, 3));

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uZ0: { value: -75 }, uSpan: { value: 95 } },
    vertexShader: /* glsl */ `
      uniform float uTime, uZ0, uSpan;
      attribute float aLane, aY, aSpeed, aOffset, aLen, aWidth;
      attribute vec3 aColor;
      varying float vT; varying float vAcross; varying vec3 vCol; varying float vFade; varying float vDist;
      void main(){
        float t = position.y + 0.5;                 // 0 = head, 1 = tail
        float head = uZ0 + mod(aOffset + uTime * aSpeed, uSpan);
        float z = head - sign(aSpeed) * t * aLen;
        vec3 wp = vec3(aLane, aY, z);
        vec3 toCam = cameraPosition - wp;
        vec3 lat = cross(vec3(0.0, 0.0, 1.0), toCam);
        float l = length(lat);
        lat = l > 1e-3 ? lat / l : vec3(1.0, 0.0, 0.0);
        wp += lat * position.x * aWidth;
        vT = t; vAcross = position.x * 2.0; vCol = aColor;
        vDist = length(toCam);
        vFade = smoothstep(uZ0, uZ0 + 16.0, head) * (1.0 - smoothstep(uZ0 + uSpan - 12.0, uZ0 + uSpan, head));
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vT; varying float vAcross; varying vec3 vCol; varying float vFade; varying float vDist;
      void main(){
        float along = pow(1.0 - vT, 2.3);
        float across = 1.0 - pow(abs(vAcross), 2.0);
        float a = along * across * vFade * exp(-vDist * 0.017);
        vec3 c = vCol * (0.55 + 1.3 * pow(1.0 - vT, 6.0));
        gl_FragColor = vec4(c, a);
        ${GLSL_OUT}
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}

/* Sparse drifting particles. */
function buildParticles(count, uTime, uPR, rand) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4); // phase, speed, size, tint
  const col = new Float32Array(count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rand() * 2 - 1) * 24;
    pos[i * 3 + 1] = rand() * 14;
    pos[i * 3 + 2] = -62 + rand() * 72;
    seed[i * 4] = rand() * Math.PI * 2;
    seed[i * 4 + 1] = 0.08 + rand() * 0.28;
    seed[i * 4 + 2] = 0.6 + rand() * 1.6;
    seed[i * 4 + 3] = rand();
    const r = rand();
    if (r < 0.42) tmp.copy(RED_HDR(1.4));
    else if (r < 0.84) tmp.copy(CYAN_HDR(0.9));
    else tmp.set('#b8c7d1').multiplyScalar(0.7);
    col.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uPR },
    vertexShader: /* glsl */ `
      uniform float uTime, uPR;
      attribute vec4 aSeed; attribute vec3 aColor;
      varying vec3 vCol; varying float vA;
      void main(){
        vec3 p = position;
        p.y = mod(p.y + uTime * aSeed.y, 14.0);
        p.x += sin(uTime * 0.21 + aSeed.x) * 0.55;
        p.z += cos(uTime * 0.17 + aSeed.x * 1.7) * 0.45;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.65 + 0.35 * sin(uTime * (0.8 + aSeed.w * 1.6) + aSeed.x * 6.0);
        vA = tw * smoothstep(0.0, 0.6, p.y) * (1.0 - smoothstep(10.0, 14.0, p.y)) * exp(-(-mv.z) * 0.016);
        vCol = aColor;
        gl_PointSize = clamp(aSeed.z * uPR * (26.0 / max(-mv.z, 0.5)), 1.0, 9.0 * uPR);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol; varying float vA;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c) * 2.0;
        float a = pow(1.0 - clamp(d, 0.0, 1.0), 2.0) * vA * 0.9;
        gl_FragColor = vec4(vCol, a);
        ${GLSL_OUT}
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 4;
  return pts;
}

/* Distant horizon glow so the tunnel doesn't end in a flat void. */
function buildBackdrop(uTime) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 110),
    new THREE.ShaderMaterial({
      uniforms: { uTime, uRed: { value: RED.clone() }, uCyan: { value: CYAN.clone() } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uRed; uniform vec3 uCyan; varying vec2 vUv;
        void main(){
          vec2 p = (vUv - vec2(0.5, 0.30)) * vec2(2.6, 1.0);
          float h = exp(-pow(p.y * 5.5, 2.0));                 // horizon band
          float breathe = 0.85 + 0.15 * sin(uTime * 0.35);
          vec3 c = uRed * exp(-pow((p.x + 0.42) * 3.6, 2.0)) + uCyan * exp(-pow((p.x - 0.42) * 3.6, 2.0));
          c += vec3(0.25, 0.3, 0.35) * exp(-pow(p.x * 5.0, 2.0)) * 0.35;
          gl_FragColor = vec4(c * h * 0.02 * breathe, 1.0);
          ${GLSL_OUT}
        }`,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      transparent: true,
    }),
  );
  mesh.position.set(0, 30, -92);
  mesh.renderOrder = -2;
  return mesh;
}

/* Glass "hologram" pane: outline, corner brackets and one slow scan sweep. No content. */
function buildPane(color, uTime, phase) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 4.6),
    new THREE.ShaderMaterial({
      uniforms: { uTime, uColor: { value: color.clone() }, uPhase: { value: phase } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uPhase; uniform vec3 uColor; varying vec2 vUv;
        void main(){
          vec2 uv = vUv;
          vec2 d = min(uv, 1.0 - uv);                              // distance to nearest edge
          float edge = 1.0 - smoothstep(0.0, 0.0065, min(d.x * 0.69, d.y));
          // corner brackets: thicker, short runs near each corner
          float bx = step(d.x, 0.022) * step(d.y, 0.115);
          float by = step(d.y, 0.016) * step(d.x, 0.14);
          float bracket = max(bx, by);
          float lines = (0.5 + 0.5 * sin(uv.y * 210.0 - uTime * 0.6)) * 0.035;
          float sweep = exp(-pow((fract(uTime * 0.09 + uPhase) - uv.y) * 7.0, 2.0)) * 0.16;
          float glass = 0.035 + (1.0 - uv.y) * 0.03;
          float a = edge * 0.55 + bracket * 0.9 + lines + sweep + glass;
          vec3 c = uColor * (0.35 + edge * 1.2 + bracket * 1.6 + sweep * 2.0);
          gl_FragColor = vec4(c, a);
          ${GLSL_OUT}
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
}

/* ================================================================== mount == */
export function mountArcadeEnvironment(container, options = {}) {
  const tierName = detectTier(options.quality);
  const tier = { ...TIERS[tierName], name: tierName, dpr: 1 };
  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = options.forceStatic ?? reducedQuery.matches;

  /* ---- renderer ---- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
  } catch (err) {
    container.classList.add('arcade--fallback');
    return { dispose() {}, tier: tierName, fallback: true };
  }
  renderer.setClearColor(VOID, 1);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  const canvas = renderer.domElement;
  canvas.className = 'arcade__canvas';
  container.prepend(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(VOID, 0.021);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 220);

  const uTime = { value: 0 };
  const uPR = { value: 1 };
  const rand = mulberry32(0xa7ca0de);

  const envRT = buildEnvironmentMap(renderer);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.7;

  const disposables = [];
  const animators = [];
  const track = (o) => { disposables.push(o); return o; };

  /* ---- size / dpr first, floor needs it ---- */
  const size = { w: Math.max(1, container.clientWidth), h: Math.max(1, container.clientHeight) };
  tier.dpr = Math.min(window.devicePixelRatio || 1, tier.dprCap);

  /* ---- lights ---- */
  scene.add(new THREE.HemisphereLight(0x0a1220, 0x000000, 0.25));
  const keyRed = new THREE.PointLight(RED, 85, 0, 2); keyRed.position.set(-8, 5.5, -2);
  const keyCyan = new THREE.PointLight(CYAN, 80, 0, 2); keyCyan.position.set(8, 5.5, -2);
  const heroLight = new THREE.PointLight(CYAN, 18, 0, 2); heroLight.position.copy(HERO_POS);
  const rimLight = new THREE.PointLight(RED, 22, 0, 2); rimLight.position.set(0, 3.5, -14);
  scene.add(keyRed, keyCyan, heroLight, rimLight);

  /* ---- backdrop + floor ---- */
  scene.add(track(buildBackdrop(uTime)));
  const floor = buildFloor(uTime, tier, size);
  scene.add(floor.group);

  /* ---- shared dark metal ---- */
  const darkMetal = track(new THREE.MeshStandardMaterial({
    color: 0x040507, metalness: 1.0, roughness: 0.3, envMapIntensity: 1.0,
  }));
  const darkMetalSoft = track(new THREE.MeshStandardMaterial({
    color: 0x07080b, metalness: 0.85, roughness: 0.42, envMapIntensity: 0.8,
  }));

  /* ============================================================== HERO CORE */
  // The interactive digital core (shell, lattice, kernel, rings, halo, aura) lives in arcade-core.js.
  // It gets its own seeded generator so the rest of the environment's layout is unchanged from phase 1.
  const tf = tier.name === 'low' ? 1.9 : 1; // hairline thickness factor
  const core = createDigitalCore({
    THREE,
    palette: { RED, CYAN, RED_HDR, CYAN_HDR },
    uTime, uPR, tier, track, glslOut: GLSL_OUT,
    heroPos: HERO_POS, heroLight, scale: 0.88,
    rand: mulberry32(0xc0de5eed),
  });
  scene.add(core.group, core.world);

  /* ============================================================ PROJECTS STATION (phase 4B) */
  // In-scene holographic console, shown only inside the Projects chamber. Stays hidden until real project content is handed over via station.setProjects().
  const station = createProjectsStation({
    THREE,
    palette: { RED, CYAN, RED_HDR, CYAN_HDR },
    uTime, tier, glslOut: GLSL_OUT,
    baseUrl: options.baseUrl || location.href,
    onDirty: () => { if (reduced) renderStill(); },
  });
  // (the station is placed inside the Projects chamber, see below — it is never part of the hub scene)

  // Platform + beam under the core (world space, so it sits on the floor).
  const platform = new THREE.Group();
  platform.position.set(HERO_POS.x, 0, HERO_POS.z);
  const disc = new THREE.Mesh(track(new THREE.CylinderGeometry(2.05, 2.2, 0.2, 96)), darkMetal);
  disc.position.y = 0.1;
  const rimRing = new THREE.Mesh(track(new THREE.TorusGeometry(2.08, 0.02 * tf, 8, 160)), track(new THREE.MeshBasicMaterial({ color: RED_HDR(3.2) })));
  rimRing.rotation.x = Math.PI / 2; rimRing.position.y = 0.205;
  const innerRing = new THREE.Mesh(track(new THREE.TorusGeometry(1.35, 0.012 * tf, 8, 140)), track(new THREE.MeshBasicMaterial({ color: CYAN_HDR(1.5) })));
  innerRing.rotation.x = Math.PI / 2; innerRing.position.y = 0.205;
  const beamH = HERO_POS.y - 0.2;
  const beam = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.012, 0.012, beamH, 8, 1, true)),
    track(new THREE.MeshBasicMaterial({ color: CYAN_HDR(1.6), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })),
  );
  beam.position.y = 0.2 + beamH / 2;
  beam.renderOrder = 3;
  platform.add(disc, rimRing, innerRing, beam);
  scene.add(platform);
  const platformBase = {
    rim: rimRing.material.color.clone(), inner: innerRing.material.color.clone(),
    beam: beam.material.color.clone(), beamOpacity: beam.material.opacity,
  };
  // The environment's own response to the core's engagement (platform, beam, floor).
  function reactToCore(e) {
    rimRing.material.color.copy(platformBase.rim).multiplyScalar(1 + e * 0.45);
    innerRing.material.color.copy(platformBase.inner).multiplyScalar(1 + e * 0.7);
    beam.material.color.copy(platformBase.beam).multiplyScalar(1 + e * 0.8);
    beam.material.opacity = platformBase.beamOpacity + e * 0.25;
  }

  // Expanding pulse on the floor around the platform.
  const pulse = new THREE.Mesh(
    track(new THREE.PlaneGeometry(26, 26)),
    track(new THREE.ShaderMaterial({
      uniforms: { uTime, uColor: { value: CYAN_HDR(1.1) }, uEngage: core.uniforms.uEngage, uBurstAge: core.uniforms.uBurstAge, uBurstK: core.uniforms.uBurstK },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uEngage, uBurstAge, uBurstK; uniform vec3 uColor; varying vec2 vUv;
        void main(){
          float d = length(vUv - 0.5) * 26.0;
          float a = 0.0;
          for (int i = 0; i < 2; i++) {
            float r = mod(uTime * 1.0 + float(i) * 4.5, 9.0);
            float ring = exp(-pow((d - r) * 2.6, 2.0)) * pow(1.0 - r / 9.0, 2.0);
            a += ring;
          }
          // interaction burst: one extra ripple leaving the platform
          float rb = 2.2 + uBurstAge * 7.0;
          a += exp(-pow((d - rb) * 1.8, 2.0)) * exp(-uBurstAge * 1.5) * uBurstK * 1.2;
          a *= smoothstep(2.0, 2.6, d) * (0.2 + 0.1 * uEngage);
          gl_FragColor = vec4(uColor, a);
          ${GLSL_OUT}
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })),
  );
  pulse.rotation.x = -Math.PI / 2;
  pulse.position.set(HERO_POS.x, 0.012, HERO_POS.z);
  pulse.renderOrder = 2;
  scene.add(pulse);

  /* ======================================================= TUNNEL OF FRAMES */
  const frameZ = [-10, -17, -25, -34, -44, -55, -67].slice(0, tier.frames);
  const frameW = 13.5, frameH = 8.6, t = 0.34, depth = 0.6;
  const gradStrip = (w, h, d) => {
    const g = new THREE.BoxGeometry(w, h, d, 2, 1, 1);
    const p = g.getAttribute('position');
    const cols = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const k = (p.getX(i) / w) + 0.5;           // 0 left → 1 right
      if (k < 0.5) c.copy(RED_HDR(3.0)).lerp(new THREE.Color(0x050203), k * 2 * 0.92);
      else c.copy(new THREE.Color(0x020405)).lerp(CYAN_HDR(1.7), (k - 0.5) * 2 * 0.92 + 0.08);
      cols.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return g;
  };
  const stripRed = track(new THREE.MeshBasicMaterial({ color: RED_HDR(3.2) }));
  const stripCyan = track(new THREE.MeshBasicMaterial({ color: CYAN_HDR(1.7) }));
  const stripGrad = track(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const sharedBox = (w, h, d) => track(new THREE.BoxGeometry(w, h, d));

  const gBodyV = sharedBox(t, frameH, depth);
  const gBodyH = sharedBox(frameW + t, t, depth);
  const gStripV = sharedBox(0.055, frameH, 0.04);
  const gStripTop = track(gradStrip(frameW, 0.055, 0.04));
  const gFloorLine = track(gradStrip(frameW, 0.02, 0.07));

  const makeFrame = (z) => {
    const g = new THREE.Group();
    g.position.z = z;
    const l = new THREE.Mesh(gBodyV, darkMetal); l.position.set(-frameW / 2, frameH / 2, 0);
    const r = new THREE.Mesh(gBodyV, darkMetal); r.position.set(frameW / 2, frameH / 2, 0);
    const top = new THREE.Mesh(gBodyH, darkMetal); top.position.set(0, frameH + t / 2, 0);
    const sl = new THREE.Mesh(gStripV, stripRed); sl.position.set(-frameW / 2 + t / 2 - 0.03, frameH / 2, depth / 2 + 0.02);
    const sr = new THREE.Mesh(gStripV, stripCyan); sr.position.set(frameW / 2 - t / 2 + 0.03, frameH / 2, depth / 2 + 0.02);
    const st = new THREE.Mesh(gStripTop, stripGrad); st.position.set(0, frameH - 0.02, depth / 2 + 0.02);
    const fl = new THREE.Mesh(gFloorLine, stripGrad); fl.position.set(0, 0.02, 0);
    g.add(l, r, top, sl, sr, st, fl);
    return g;
  };
  frameZ.forEach((z) => scene.add(makeFrame(z)));

  /* ======================================================= PROJECTS PORTAL + CHAMBER (phase 5C) */
  // Frame 2 (z = −17) is the portal. The chamber (z ≈ −80) lies past the corridor's last frame and holds the station.
  const portal = createProjectsPortal({
    THREE, palette: { RED, CYAN, RED_HDR, CYAN_HDR }, uTime, tier, track, glslOut: GLSL_OUT, heroPos: HERO_POS,
    makeFrame, mats: { stripRed, stripCyan }, darkMetal,
    portalZ: PORTAL_Z, chamberZ: CHAMBER_Z, frameW, frameH, frameT: t, frameD: depth,
  });
  scene.add(portal.portal, portal.link, portal.chamber, ...portal.lights);
  // Low tier draws fewer frames in the hub; the remaining corridor frames join the chamber so the traversal is the same.
  [-10, -17, -25, -34, -44, -55, -67].filter((z) => !frameZ.includes(z)).forEach((z) => portal.chamber.add(makeFrame(z)));
  portal.chamber.add(station.group);
  const stripBase = [stripRed, stripCyan, stripGrad].map((m) => m.color.clone());

  /* ================================================== MONOLITHS (side skyline) */
  const slabGeoCache = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < tier.slabsPerSide; k++) {
      const z = -5 - k * (54 / tier.slabsPerSide) - rand() * 4;
      const x = side * (8.6 + rand() * 5.2);
      const h = 3.2 + rand() * 9.5;
      const w = 0.9 + rand() * 1.3;
      const d = 0.9 + rand() * 1.7;
      const geo = track(new THREE.BoxGeometry(w, h, d));
      slabGeoCache.push(geo);
      const slab = new THREE.Mesh(geo, k % 2 ? darkMetal : darkMetalSoft);
      slab.position.set(x, h / 2, z);
      scene.add(slab);
      // Edge light on the inner/front vertical edge.
      const hs = h * (0.35 + rand() * 0.6);
      const y0 = rand() * (h - hs);
      const useOpp = rand() < 0.12;
      const warm = side < 0 ? !useOpp : useOpp;
      const edge = new THREE.Mesh(track(new THREE.BoxGeometry(0.055, hs, 0.055)), warm ? stripRed : stripCyan);
      edge.position.set(x - side * (w / 2), y0 + hs / 2, z + d / 2);
      scene.add(edge);
    }
  }

  /* ============================================================ HOLO PANES  */
  const paneSpots = [
    [-8.4, 3.6, -9, 0.42, RED_HDR(1.5)],
    [8.6, 3.2, -14, -0.42, CYAN_HDR(0.8)],
    [-9.6, 4.4, -22, 0.34, CYAN_HDR(0.7)],
    [9.8, 3.9, -30, -0.34, RED_HDR(1.3)],
  ].slice(0, tier.panels);
  paneSpots.forEach(([x, y, z, ry, col], i) => {
    const pane = buildPane(col, uTime, i * 0.31);
    track(pane.geometry); track(pane.material);
    pane.position.set(x, y, z);
    pane.rotation.y = ry;
    pane.scale.setScalar(0.85);
    pane.renderOrder = 3;
    scene.add(pane);
    animators.push((tm) => { pane.position.y = y + Math.sin(tm * 0.4 + i * 1.7) * 0.12; });
  });

  /* =========================================================== FLOATERS    */
  const shapes = [
    () => new THREE.OctahedronGeometry(1, 0),
    () => new THREE.TetrahedronGeometry(1, 0),
    () => new THREE.IcosahedronGeometry(1, 0),
    () => new THREE.BoxGeometry(1.2, 1.2, 1.2),
    () => new THREE.TorusGeometry(1, 0.03, 6, 64),
  ];
  const holoR = track(holoMaterial(RED_HDR(1.2), uTime, { rim: 1.0, base: 0.006 }));
  const holoC = track(holoMaterial(CYAN_HDR(0.7), uTime, { rim: 1.0, base: 0.006 }));
  const lineR = track(lineMaterial(RED_HDR(3.0), 0.95));
  const lineC = track(lineMaterial(CYAN_HDR(1.7), 0.95));
  for (let i = 0; i < tier.floaters; i++) {
    const idx = Math.floor(rand() * shapes.length);
    const geo = track(shapes[idx]());
    const isRing = idx === 4;
    const red = rand() < 0.5;
    const s = 0.22 + rand() * 0.4;
    let x, z;
    do {
      x = (rand() * 2 - 1) * 11;
      z = -2 - rand() * 42;
    } while (Math.abs(x) < 5.5 && z > -26);
    const y = 0.9 + rand() * 5.2;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.scale.setScalar(s * (z < -20 ? 1.5 : 1));
    if (!isRing) {
      const fill = new THREE.Mesh(geo, red ? holoR : holoC);
      fill.renderOrder = 3;
      g.add(fill);
      const edges = new THREE.LineSegments(track(new THREE.EdgesGeometry(geo)), red ? lineR : lineC);
      edges.renderOrder = 3;
      g.add(edges);
    } else {
      g.add(new THREE.Mesh(geo, track(new THREE.MeshBasicMaterial({ color: red ? RED_HDR(3.0) : CYAN_HDR(1.7) }))));
    }
    scene.add(g);
    const sp = 0.1 + rand() * 0.3, ph = rand() * 6.28, ax = rand() * 6.28;
    animators.push((tm) => {
      g.rotation.set(tm * sp * 0.8 + ax, tm * sp, isRing ? tm * sp * 0.5 : 0);
      g.position.y = y + Math.sin(tm * 0.45 + ph) * 0.22;
    });
  }

  /* ============================================================ TRAILS/DUST */
  scene.add(track(buildTrails(tier.trails, uTime, rand)));
  const particles = buildParticles(tier.particles, uTime, uPR, rand);
  scene.add(track(particles));
  track(particles.geometry);

  /* ============================================================ post-process */
  let composer = null;
  let bloomPass = null;
  function buildComposer() {
    const rt = new THREE.WebGLRenderTarget(size.w, size.h, { type: THREE.HalfFloatType, samples: tier.msaa });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(size.w, size.h), 0.3, 0.42, 0.72);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(tier.dpr);
    composer.setSize(size.w, size.h);
  }
  if (tier.bloom) buildComposer();

  /* ================================================================ layout   */
  const look = new THREE.Vector3(0, 2.2, -8);
  let baseZ = 10;
  let lookY = 2.25;
  let baseFov = 48;
  function layout() {
    size.w = Math.max(1, container.clientWidth);
    size.h = Math.max(1, container.clientHeight);
    const aspect = size.w / size.h;
    const portrait = aspect < 1;
    baseFov = portrait ? 56 : 48;
    camera.fov = baseFov;
    lookY = portrait ? 1.55 : 2.25;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * aspect);
    const need = 4.6 / Math.tan(hfov / 2);
    baseZ = HERO_POS.z + Math.max(12.4, need);
    station.layout({ aspect, chamber: { x: 0, z: CHAMBER_Z } });
    portal.layout({ portrait });

    renderer.setPixelRatio(tier.dpr);
    renderer.setSize(size.w, size.h, false);
    uPR.value = tier.dpr;
    if (composer) { composer.setPixelRatio(tier.dpr); composer.setSize(size.w, size.h); }
    const rt = floor.reflector.getRenderTarget();
    rt.setSize(
      Math.max(2, Math.floor(size.w * tier.dpr * tier.reflectorScale)),
      Math.max(2, Math.floor(size.h * tier.dpr * tier.reflectorScale)),
    );
  }
  layout();

  /* ============================================================== pointer   */
  // x/y: smoothed camera parallax.  tx/ty: raw target.  active: a pointer is actually over the page
  // (false until first move, after the cursor leaves, or after a finger lifts) so the core never
  // reacts to a phantom cursor sitting at the screen centre.
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, active: false };
  function onPointer(e) {
    const r = container.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
    pointer.active = true;
  }
  function onLeave() { pointer.tx = 0; pointer.ty = 0; pointer.active = false; }
  function onDown(e) {
    onPointer(e);
    // A click / tap on the core fires a stronger energy burst. Probed immediately (not from last
    // frame's state) because a tap can start and end between two frames.
    if (!reduced && dock.k === 0 && dock.target === 0 && core.probe(camera, pointer.tx, -pointer.ty) > 0.5) {
      core.burst(1);
      if (e.pointerType !== 'mouse') core.hold(1.4);
    }
  }
  function onUp(e) { if (e.pointerType !== 'mouse') onLeave(); }
  // Hub: a click on the portal opening enters Projects (the core keeps its own burst, and sits in front of the portal).
  // Chamber: the station's tabs / arrows / link activate on click (a real user activation, so the project link may open in a new tab).
  function onClick(e) {
    if (e.target.closest && e.target.closest('.hud, .identity, a, button')) return;
    const r = container.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    camera.updateMatrixWorld();
    if (dock.k === 0 && dock.target === 0) { if (core.probe(camera, x, y) <= 0.5 && portal.hit(camera, x, y)) setDock(1); return; }
    if (dock.k === 1 && dock.target === 1) station.press(camera, x, y);
  }
  window.addEventListener('click', onClick);
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onUp, { passive: true });
  document.addEventListener('pointerleave', onLeave);

  /* ================================================================ portal traversal (phase 5C) */
  // dock.k runs 0 (hub) → 1 (arrived in the Projects chamber). The whole traversal — camera, portal membrane, core
  // reaction, frame glow — is a pure function of dock.k, so travelling back is the exact reverse of travelling in.
  //   0.00–0.14  activation: portal charges, the core reacts, the camera turns to the portal
  //   0.08–0.40  the membrane expands across the opening while the camera arcs around the core and lines up on the axis
  //   0.12–0.92  travel along the corridor (eased: the frames stream past fastest mid-way)
  //   0.78–1.00  the gaze settles on the station and the camera comes to rest in the chamber
  const dock = { k: 0, target: 0, state: 'hub' };
  const DOCK_IN = 1.35, DOCK_OUT = 1.05;                       // seconds
  const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);   // sine in-out: gentle start and stop, and a speed the frames can be read at
  const sstep = (a, b, x) => { const q = Math.min(1, Math.max(0, (x - a) / (b - a))); return q * q * (3 - 2 * q); };
  const _fr = {}, _dPos = new THREE.Vector3(), _dLook = new THREE.Vector3(), _ahead = new THREE.Vector3(), _portalPt = new THREE.Vector3(0, 3.4, PORTAL_Z);
  const ARC_SIDE = 1, ARC_AMP = 3.7, ARC_END_Z = -12;        // the camera swings around the core on this side and is back on the axis by z = −12
  function dockPose() {
    station.frame(_fr);
    const portrait = camera.aspect < 0.9;
    const tanV = Math.tan(THREE.MathUtils.degToRad(baseFov) / 2), tanH = tanV * camera.aspect;
    const dist = Math.max((_fr.w / 2) / (tanH * (portrait ? 0.9 : 0.6)), (_fr.h / 2) / (tanV * (portrait ? 0.5 : 0.62)));
    // centred and square-on: the Projects interface is the primary focus, a touch below its centre
    _dPos.set(_fr.center.x, _fr.center.y - 0.28, _fr.center.z + dist);
    _dLook.copy(_fr.center);
    if (portrait) _dLook.y -= dist * tanV * 0.1;           // keep the panel clear of the top controls
  }
  function syncDockState() {
    const st = dock.k === dock.target ? (dock.target ? 'docked' : 'hub') : (dock.target ? 'docking' : 'returning');
    if (st !== dock.state) {
      const was = dock.state;
      dock.state = st;
      if (st === 'docked' && !reduced) station.activate();                   // the panel's one-shot sweep, on arrival
      if (st === 'hub' && was === 'returning' && !reduced) core.burst(0.6);  // the core greets the return
      options.onDock?.(st);
    }
  }
  function setDock(t) {
    if (t && (!station.count || !station.group.visible)) return false;
    if (dock.target === t) return true;
    dock.target = t;
    if (reduced) { dock.k = t; syncDockState(); renderStill(); return true; }   // reduced motion: snap, no travel
    if (t) { core.burst(1); core.hold(2.2); }                                   // the core reacts as the portal is activated
    syncDockState();
    return true;
  }

  /* ================================================================ render   */
  const camPos = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  let lastFov = 0;
  function updateCamera(time, dt) {
    // advance the traversal progress (reduced motion never animates)
    if (dock.k !== dock.target) {
      if (reduced) dock.k = dock.target;
      else {
        const step = dt / (dock.target ? DOCK_IN : DOCK_OUT);
        dock.k = dock.target ? Math.min(1, dock.k + step) : Math.max(0, dock.k - step);
      }
      syncDockState();
    }
    const u = dock.k;

    const k = 1 - Math.exp(-dt * 2.6);
    pointer.x += (pointer.tx - pointer.x) * k;
    pointer.y += (pointer.ty - pointer.y) * k;
    const amp = reduced ? 0 : 1;
    const hubAmp = amp * (1 - sstep(0, 0.14, u));              // hub parallax + drift hand over to the traversal
    const px = pointer.x * hubAmp, py = pointer.y * hubAmp;
    const drift = hubAmp * (tier.name === 'low' ? 1.6 : 1); // touch devices rely more on idle drift
    camPos.set(
      px * 1.5 + Math.sin(time * 0.13) * 0.32 * drift,
      1.75 - py * 0.45 + Math.sin(time * 0.1) * 0.07 * drift,
      baseZ + Math.cos(time * 0.09) * 0.25 * drift,
    );
    lookTarget.set(px * 0.9, lookY - py * 0.25, look.z);

    let bank = 0, speed = 0;
    if (u > 0) {
      dockPose();
      // gentle life once arrived: slow breathing plus a little pointer parallax
      const live = amp * sstep(0.9, 1, u);
      _dPos.x += (pointer.x * 0.22 + Math.sin(time * 0.21) * 0.07) * live;
      _dPos.y += (-pointer.y * 0.1 + Math.sin(time * 0.17) * 0.035) * live;
      _dLook.x += pointer.x * 0.06 * live;

      const tt = Math.min(1, Math.max(0, (u - 0.12) / 0.8));
      const s = ease(tt);                                      // 0 at the hub → 1 in the chamber
      const hubX = camPos.x, hubY = camPos.y, hubZ = camPos.z;
      // swing out around the core, then line up on the corridor axis before the first frame
      const arcT = Math.min(1, s / Math.max(0.05, (hubZ - ARC_END_Z) / (hubZ - _dPos.z)));
      const arc = Math.sin(Math.PI * arcT);
      camPos.set(
        hubX + (_dPos.x - hubX) * s + ARC_SIDE * ARC_AMP * Math.pow(arc, 1.3),
        hubY + (_dPos.y - hubY) * s + arc * 0.6,
        hubZ + (_dPos.z - hubZ) * s,
      );
      bank = 0.05 * Math.sin(2 * Math.PI * arcT) * (arcT < 1 ? 1 : 0);
      // gaze: hub → the portal → straight down the corridor → the station
      _ahead.set(0, 3.2, camPos.z - 22);
      lookTarget.lerp(_portalPt, sstep(0.03, 0.3, u));
      lookTarget.lerp(_ahead, sstep(0.28, 0.42, u));
      lookTarget.lerp(_dLook, sstep(0.78, 1, u));
      speed = Math.sin(Math.PI * tt);                          // 0 at rest, 1 mid-travel
    }
    camera.up.set(bank, 1, 0).normalize();
    const fov = baseFov * (1 + 0.11 * Math.pow(speed, 1.5));   // the corridor opens up as it streams past
    if (Math.abs(fov - lastFov) > 1e-4) { lastFov = fov; camera.fov = fov; camera.updateProjectionMatrix(); }
    scene.fog.density = 0.021 - 0.008 * speed;                 // see deeper down the corridor while travelling
    // the frames' light strips flare as they go by (shared materials, so the corridor brightens as one)
    stripRed.color.copy(stripBase[0]).multiplyScalar(1 + 0.55 * speed);
    stripCyan.color.copy(stripBase[1]).multiplyScalar(1 + 0.55 * speed);
    stripGrad.color.copy(stripBase[2]).multiplyScalar(1 + 0.55 * speed);
    station.setFocus(sstep(0.7, 1, u));
    camera.position.copy(camPos);
    camera.lookAt(lookTarget);
  }

  let lastEngageOut = -1;
  let portalHover = 0, chamberWas = false;
  function updateCore(time, dt, still) {
    camera.updateMatrixWorld();
    // while the portal charges the core stays fully engaged
    if (!still && dock.target === 1 && dock.k < 0.3) core.hold(0.25);
    core.update({ t: time, dt, camera, pointer: { active: pointer.active && !still, x: pointer.tx, y: -pointer.ty }, still });
    const e = core.state.engage;
    reactToCore(e);
    const live = pointer.active && !still;
    const hub = dock.k === 0 && dock.target === 0;
    const overPortal = live && hub && core.probe(camera, pointer.tx, -pointer.ty) <= 0.5 && portal.hit(camera, pointer.tx, -pointer.ty);
    portalHover += ((overPortal ? 1 : 0) - portalHover) * (1 - Math.exp(-dt * 6));
    portal.update({ u: dock.k, hover: portalHover, still });
    if (portal.chamberShown && !chamberWas) station.reveal();                    // the panel boots up as the chamber comes into being
    chamberWas = portal.chamberShown;
    const inChamber = dock.k === 1 && dock.target === 1;
    const clickable = station.update({ t: time, dt, camera, pointer: { active: live && inChamber, x: pointer.tx, y: -pointer.ty }, still, interactive: inChamber });
    container.style.cursor = overPortal || clickable ? 'pointer' : '';
    // Tell the page (identity area) how engaged the core is — throttled to visible changes.
    if (options.onEngage && Math.abs(e - lastEngageOut) > 0.01) { lastEngageOut = e; options.onEngage(e); }
  }

  function renderFrame() {
    if (composer && bloomPass.enabled) composer.render();
    else renderer.render(scene, camera);
  }

  let raf = 0;
  let last = performance.now();
  let running = false;
  let frames = 0, acc = 0, level = 0;

  // Quality steps the governor walks through, cheapest-visual-loss first.
  const steps = [];
  if (tier.bloom) steps.push(() => { bloomPass.enabled = false; });
  steps.push(() => { tier.dpr = Math.min(tier.dpr, 1.25); tier.reflectorScale = Math.min(tier.reflectorScale, 0.5); layout(); });
  steps.push(() => { tier.dpr = 1; tier.reflectorScale = 0.4; layout(); });
  function degrade() {
    if (level < steps.length) steps[level++]();
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    uTime.value += dt;
    for (let i = 0; i < animators.length; i++) animators[i](uTime.value);
    updateCamera(uTime.value, dt);
    updateCore(uTime.value, dt, false);
    renderFrame();

    // Adaptive governor: only ever steps quality down, never back up.
    frames += 1;
    if (frames > 90) {                       // ignore shader-compile warm-up
      acc += dt;
      if (frames % 90 === 0) {
        const avg = acc / 90; acc = 0;
        if (options.adaptive !== false && avg > 1 / 40) degrade();
      }
    }
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }
  function renderStill() {
    uTime.value = 7.3;
    for (let i = 0; i < animators.length; i++) animators[i](uTime.value);
    updateCamera(uTime.value, 1);
    updateCore(uTime.value, 0, true);
    renderFrame();
  }

  function applyMotionPreference() {
    if (reduced) { stop(); renderStill(); }
    else start();
  }
  const onMotionChange = (e) => { if (options.forceStatic === undefined) { reduced = e.matches; applyMotionPreference(); } };
  reducedQuery.addEventListener?.('change', onMotionChange);

  const ro = new ResizeObserver(() => {
    layout();
    if (reduced) renderStill();
  });
  ro.observe(container);

  const onVisibility = () => {
    if (reduced) return;
    if (document.hidden) stop(); else start();
  };
  document.addEventListener('visibilitychange', onVisibility);

  const onLost = (e) => { e.preventDefault(); stop(); };
  const onRestored = () => { applyMotionPreference(); };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  applyMotionPreference();
  // Let the page know the first real frame is on screen (used for the fade-in).
  requestAnimationFrame(() => requestAnimationFrame(() => {
    container.classList.add('arcade--ready');
    container.dispatchEvent(new CustomEvent('arcade:ready', { bubbles: true }));
  }));

  /* ================================================================ dispose  */
  function dispose() {
    stop();
    ro.disconnect();
    window.removeEventListener('pointermove', onPointer);
    window.removeEventListener('click', onClick);
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    document.removeEventListener('pointerleave', onLeave);
    document.removeEventListener('visibilitychange', onVisibility);
    reducedQuery.removeEventListener?.('change', onMotionChange);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    scene.traverse((o) => {
      o.geometry?.dispose?.();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose?.()); else m?.dispose?.();
    });
    station.dispose();
    floor.reflector.dispose?.();
    envRT.dispose();
    composer?.dispose?.();
    renderer.dispose();
    canvas.remove();
  }

  return {
    dispose,
    tier: tier.name,
    get quality() { return { tier: tier.name, dpr: tier.dpr, level, bloom: !!(bloomPass && bloomPass.enabled), reduced }; },
    renderer, scene, camera, core, station,
    dock: {
      enter: () => setDock(1),
      exit: () => setDock(0),
      get available() { return station.count > 0 && station.group.visible; },
      get active() { return dock.target === 1; },
      get state() { return dock.state; },
    },
  };
}
