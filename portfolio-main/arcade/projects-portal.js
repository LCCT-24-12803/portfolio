/*
 * Cybernetic Arcade — Projects portal + chamber (phase 5C)
 * -------------------------------------------------------------
 * The Projects destination is no longer a panel beside the core. Frame 2 of the existing frame corridor (z ≈ −17) is
 * the PROJECTS PORTAL, and the corridor leads on to a dedicated chamber at z ≈ −80 where the Projects station lives.
 *
 *   const portal = createProjectsPortal({ THREE, palette, uTime, tier, track, glslOut, heroPos, makeFrame, mats, darkMetal, geo, ... });
 *   scene.add(portal.portal, portal.chamber);
 *   portal.update({ u, dt, time, hover, still });   // u: 0 (hub) → 1 (in the chamber); everything is derived from u,
 *                                                   // so travelling back is the exact reverse
 *   portal.hit(camera, x, y)                        // NDC, y up: is the pointer over the portal opening?
 *
 * Nothing here owns the camera; the environment's rig does. This module only owns the things that live in the scene:
 *   - the portal membrane (dormant outline → charge → expanding energy membrane → dissolves as the camera crosses it)
 *   - the "PROJECTS" label on the portal and the energy link from the core to the portal
 *   - the chamber: back frame, nave monoliths, hex floor inlay, and two lights that fade up on arrival
 */

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createProjectsPortal({
  THREE, palette, uTime, tier, track, glslOut, heroPos,
  makeFrame, mats, darkMetal,
  portalZ, chamberZ, frameW, frameH, frameT, frameD,
}) {
  const { RED, CYAN, RED_HDR, CYAN_HDR } = palette;
  const low = tier.name === 'low';

  /* ================================================================ portal (on Frame 2) */
  const openW = frameW - frameT, openH = frameH;
  const portal = new THREE.Group();
  portal.position.set(0, openH / 2, portalZ);

  const U = {
    uTime, uCharge: { value: 0 }, uOpen: { value: 0 }, uHover: { value: 0 },
    uSize: { value: new THREE.Vector2(openW, openH) },
    uRed: { value: RED_HDR(1.5) }, uCyan: { value: CYAN_HDR(1.15) },
  };
  const membraneMat = track(new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vViewZ;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vViewZ = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uCharge, uOpen, uHover; uniform vec2 uSize; uniform vec3 uRed, uCyan;
      varying vec2 vUv; varying float vViewZ;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }
      void main(){
        vec2 hs = 0.5 * uSize;
        vec2 p = (vUv - 0.5) * uSize;
        vec2 q = p / hs;                                          // -1…1 across the opening
        float dEdge = min(hs.x - abs(p.x), hs.y - abs(p.y));       // distance to the nearest edge, world units
        vec3 grad = mix(uRed, uCyan, smoothstep(-0.9, 0.9, q.x));

        // dormant: a thin inset outline with a slow travelling pulse, a soft inner halo, faint scan lines
        float line = exp(-pow((dEdge - 0.2) / 0.032, 2.0));
        float halo = exp(-max(dEdge - 0.2, 0.0) * 1.7) * 0.2;
        float ang = atan(q.y, q.x);
        float travel = pow(0.5 + 0.5 * sin(ang * 2.0 - uTime * 1.3), 5.0);
        float scan = (0.5 + 0.5 * sin(p.y * 26.0 - uTime * 0.9)) * 0.022;
        float live = 0.55 + 0.45 * uCharge + 0.35 * uHover;
        vec3 rgb = grad * (line * (0.8 + travel * 1.5) + halo * 0.5 + scan * 0.6) * live * (1.0 + uCharge * 1.4);
        float alpha = scan * 0.5;

        // membrane: an energy front expanding from the centre of the opening
        float r = length(q);
        float front = uOpen * 1.72;
        float inside = 1.0 - smoothstep(front - 0.1, front, r);
        float flare = exp(-pow((r - front) / 0.07, 2.0)) * smoothstep(0.0, 0.05, uOpen) * (1.0 - smoothstep(0.92, 1.0, uOpen) * 0.6);
        // swirl, turning faster toward the centre
        float sw = r * 3.4 - uTime * 0.9;
        vec2 sq = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * q;
        float n = vnoise(sq * 3.2 + vec2(0.0, uTime * 0.35)) * 0.65 + vnoise(sq * 8.0 - uTime * 0.2) * 0.35;
        float core = exp(-r * 2.2);
        vec3 mem = mix(uRed, uCyan, smoothstep(0.25, 0.75, n)) * (0.18 + 0.9 * n + core * 1.1);
        rgb += mem * inside * 0.5 + grad * flare * 3.0;
        alpha = max(alpha, inside * 0.94);                          // a dark veil: the chamber is not seen through it
        // The bright rim stays on the frame while the membrane is open.
        rgb += grad * line * uOpen * 1.2;

        // dissolve as the camera reaches the plane, from either side (also keeps the plane clear of the near clip)
        float fade = smoothstep(0.5, 7.0, vViewZ);
        gl_FragColor = vec4(rgb * fade, alpha * fade);
        ${glslOut}
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  }));
  const membrane = new THREE.Mesh(track(new THREE.PlaneGeometry(openW, openH)), membraneMat);
  membrane.renderOrder = 3;
  portal.add(membrane);

  /* label: "PROJECTS ›" in the head of the opening — real text on a canvas, nothing else invented */
  const lab = document.createElement('canvas');
  lab.width = 1024; lab.height = 160;
  const lx = lab.getContext('2d');
  lx.font = '600 64px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  lx.textAlign = 'center'; lx.textBaseline = 'middle';
  if ('letterSpacing' in lx) lx.letterSpacing = '16px';
  lx.shadowColor = 'rgba(31,227,255,.9)'; lx.shadowBlur = 18;
  lx.fillStyle = '#e8fbff';
  lx.fillText('PROJECTS', 500, 82);
  lx.shadowBlur = 0; lx.fillStyle = '#ff5a72';
  lx.fillText('›', 928, 82);
  const labTex = track(new THREE.CanvasTexture(lab));
  labTex.colorSpace = THREE.SRGBColorSpace;
  const labelMat = track(new THREE.MeshBasicMaterial({ map: labTex, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending, toneMapped: false }));
  const label = new THREE.Mesh(track(new THREE.PlaneGeometry(4.6, 4.6 * 160 / 1024)), labelMat);
  label.position.set(0, openH / 2 - 1.05, 0.02);
  label.renderOrder = 4;
  portal.add(label);

  /* energy link: core → portal, only while the portal is charging */
  const portalCenter = new THREE.Vector3(0, openH / 2, portalZ);
  const linkDir = portalCenter.clone().sub(heroPos);
  const linkLen = linkDir.length();
  const linkMat = track(new THREE.MeshBasicMaterial({ color: CYAN_HDR(1.8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  const link = new THREE.Mesh(track(new THREE.CylinderGeometry(0.03, 0.03, linkLen, 8, 1, true)), linkMat);
  link.position.copy(heroPos).addScaledVector(linkDir, 0.5);
  link.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), linkDir.clone().normalize());
  link.renderOrder = 3;

  /* ================================================================ chamber (z ≈ −80) */
  const chamber = new THREE.Group();
  chamber.visible = false;
  // The corridor's own frames lead in. Low tier only draws five of them in the hub, so the last ones join the chamber.
  chamber.add(makeFrame(chamberZ - 12));                          // back frame
  // nave monoliths: dark slabs with one edge light, mirroring the hub's skyline
  const slabs = [
    [-1, 9.6, -73.5, 7.0, 1.3, 1.6], [-1, 11.2, -81.5, 9.6, 1.5, 2.0], [-1, 9.0, -88.5, 6.2, 1.2, 1.6],
    [1, 9.9, -74.5, 8.2, 1.4, 1.8], [1, 11.0, -82.5, 6.6, 1.3, 1.6], [1, 9.2, -89.0, 9.0, 1.5, 1.8],
  ];
  const slabGeos = [];
  for (const [side, x, z, h, w, d] of slabs) {
    const g = track(new THREE.BoxGeometry(w, h, d)); slabGeos.push(g);
    const s = new THREE.Mesh(g, darkMetal); s.position.set(side * x, h / 2, z); chamber.add(s);
    const hs = h * 0.7;
    const e = new THREE.Mesh(track(new THREE.BoxGeometry(0.055, hs, 0.055)), side < 0 ? mats.stripRed : mats.stripCyan);
    e.position.set(side * x - side * (w / 2), 0.3 + hs / 2, z + d / 2); chamber.add(e);
  }
  // hex floor inlay centred under the station (echoes the pedestal's hexagon)
  const hexMat = (c) => track(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, toneMapped: false }));
  [[3.5, 0.045, RED_HDR(2.6)], [5.4, 0.03, CYAN_HDR(1.5)], [7.6, 0.02, RED_HDR(1.5)]].forEach(([r, wd, c]) => {
    const m = new THREE.Mesh(track(new THREE.RingGeometry(r - wd, r + wd, 6)), hexMat(c));
    m.rotation.set(-Math.PI / 2, 0, Math.PI / 6); m.position.set(0, 0.024, chamberZ); chamber.add(m);
  });
  // a long light line from the gate to the pedestal
  const runway = new THREE.Mesh(track(new THREE.PlaneGeometry(0.05, 9)), hexMat(CYAN_HDR(1.2)));
  runway.rotation.x = -Math.PI / 2; runway.position.set(0, 0.026, chamberZ + 8.5); chamber.add(runway);

  // Two lights that are always in the scene (so the light count never changes and nothing recompiles); only intensity moves.
  const lightR = new THREE.PointLight(RED, 0, 0, 2); lightR.position.set(-5.5, 5.2, chamberZ + 2);
  const lightC = new THREE.PointLight(CYAN, 0, 0, 2); lightC.position.set(5.5, 5.2, chamberZ + 2);
  const LIGHT_K = low ? 38 : 56;

  /* ================================================================ per-frame */
  let chamberShown = false;
  function update({ u, hover = 0, still = false }) {
    const charge = smooth(0.0, 0.12, u);
    const open = smooth(0.08, 0.4, u);
    U.uCharge.value = charge; U.uOpen.value = open; U.uHover.value = hover;
    membrane.visible = u < 0.62;
    // label: visible in the dormant hub (brighter on hover), gone as the membrane takes over
    labelMat.opacity = (0.62 + 0.3 * hover) * (1 - smooth(0.0, 0.1, u)) * (still ? 1 : 0.9 + 0.1 * Math.sin(uTime.value * 1.6));
    label.visible = labelMat.opacity > 0.01;
    // core → portal link
    linkMat.opacity = 0.75 * charge * (1 - open) + 0.25 * charge * open * (1 - smooth(0.4, 0.5, u));
    link.visible = linkMat.opacity > 0.01;
    // chamber: built into the scene once the membrane hides the far end of the corridor
    const show = u > 0.3;
    chamber.visible = show;
    chamberShown = show;
    const arrive = smooth(0.6, 1.0, u);
    lightR.intensity = LIGHT_K * arrive; lightC.intensity = LIGHT_K * arrive;
  }

  const ray = new THREE.Raycaster(); const v2 = new THREE.Vector2();
  function hit(camera, x, y) {
    if (!membrane.visible) return false;
    portal.updateMatrixWorld(true);
    v2.set(x, y); ray.setFromCamera(v2, camera);
    return ray.intersectObject(membrane, false).length > 0;
  }

  return {
    portal, link, chamber, lights: [lightR, lightC], update, hit,
    // Phones are far from the portal and the screen is narrow: a larger label keeps the entrance legible.
    layout({ portrait }) { label.scale.setScalar(portrait ? 1.7 : 1); label.position.y = openH / 2 - (portrait ? 1.3 : 1.05); },
    get chamberShown() { return chamberShown; },
    chamberZ,
    dispose() { /* geometries/materials are registered with the environment's track() */ },
  };
}
