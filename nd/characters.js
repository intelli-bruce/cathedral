// Notre-Dame avatars: 5 characters built from primitives, plus walk / jump / roll / wave posing.
// Avatars are ~1.6 m tall, origin at the feet, facing -Z when rotation.y = 0.
// Geometries and shared materials are cached at module level; each avatar owns only its accent material.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const TAU = Math.PI * 2;

export const CHARACTERS = [
  { id: 'priest', name: '신부' }, { id: 'nun', name: '수녀' }, { id: 'pilgrim', name: '순례자' },
  { id: 'knight', name: '기사' }, { id: 'chorister', name: '성가대원' },
];
// Top of head / hat per character (metres above the feet). Label sprite: HEAD_Y[id] + 0.3, bubble: HEAD_Y[id] + 0.85.
export const HEAD_Y = { priest: 1.84, nun: 1.76, pilgrim: 1.83, knight: 1.83, chorister: 1.72 };
export const JUMP = { dur: 0.7, height: 1.1 };
export const ROLL = { dur: 0.65, dist: 3.2 };
export const WAVE = { dur: 1.6 };
export const PIVOT = 0.5;   // roll pivot height (body group origin)

// Vertical body offset during a jump: height * 4u(1-u), u = actT / dur.
export function jumpY(actT) {
  if (!(actT > 0) || actT >= JUMP.dur) return 0;
  const u = actT / JUMP.dur;
  return JUMP.height * 4 * u * (1 - u);
}
// Distance travelled since the roll started (0 .. ROLL.dist, decelerating). The integrator moves the root by this.
export function rollDist(actT) {
  if (!(actT > 0)) return 0;
  const u = Math.min(1, actT / ROLL.dur);
  return ROLL.dist * (1 - (1 - u) * (1 - u));
}

// ---------- shared materials ----------
const std = (color, roughness = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, side: THREE.DoubleSide, ...extra });
const M = {
  skin: std('#d9b994', 0.8),
  black: std('#1c1a1f', 0.9),
  linen: std('#f6f3ec', 0.85),
  metal: std('#a9aeb5', 0.42, { metalness: 0.45 }),
  dark: std('#0b0b0d', 0.9),
  red: std('#b31f28', 0.8),
  cassockRed: std('#a8222a', 0.85),
  brown: std('#6b4a2f', 0.9),
  felt: std('#3a2a1f', 0.9),
  wood: std('#7a5634', 0.8),
  hair: std('#3b2a20', 0.9),
  shell: std('#f1e4c6', 0.7),
};
const DEFAULT_ACCENT = { priest: '#5a2f80', nun: '#2c4f9e', pilgrim: '#2f6e45', knight: '#a3262a', chorister: '#c4952f' };

// ---------- geometry helpers ----------
const lathe = (pts, n = 20, ps = 0, pl = TAU) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), n, ps, pl);
const sph = (r, ws = 16, hs = 12, ps = 0, pl = TAU, ts = 0, tl = Math.PI) => new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl);
const cyl = (rt, rb, h, n = 16, open = false, ts = 0, tl = TAU) => new THREE.CylinderGeometry(rt, rb, h, n, 1, open, ts, tl);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const torus = (R, r, rs = 8, ts = 24) => new THREE.TorusGeometry(R, r, rs, ts);
const FLAT = [Math.PI / 2, 0, 0];   // lay a torus flat (ring around the Y axis)

function rAt(prof, y) {
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1], [r1, y1] = prof[i];
    if (y1 > y0 && y >= y0 && y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
  }
  return 0;
}
// A strip of a lathe profile between y0 and y1, pushed out by dr (for stoles, bands that hug the robe).
function band(prof, y0, y1, dr) {
  const pts = [[rAt(prof, y0) + dr, y0]];
  for (const [r, y] of prof) if (y > y0 && y < y1) pts.push([r + dr, y]);
  pts.push([rAt(prof, y1) + dr, y1]);
  return pts;
}
// Merge transformed geometries into one non-indexed BufferGeometry (position + normal only).
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function merge(parts) {
  const pos = [], nor = [];
  let n = 0;
  for (const [g0, t = {}] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0.clone();
    const p = t.p || [0, 0, 0], r = t.r || [0, 0, 0], s = t.s || [1, 1, 1];
    _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2]));
    g.applyMatrix4(_m);
    pos.push(g.attributes.position.array); nor.push(g.attributes.normal.array); n += g.attributes.position.array.length;
    g.dispose(); g0.dispose();
  }
  const P = new Float32Array(n), N = new Float32Array(n);
  let o = 0;
  for (let i = 0; i < pos.length; i++) { P.set(pos[i], o); N.set(nor[i], o); o += pos[i].length; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.computeBoundingSphere();
  return out;
}

// ---------- shared part geometries (lazy) ----------
const G = {};
const shared = (k, make) => G[k] || (G[k] = make());
const sleeveGeo = () => shared('sleeve', () => merge([[cyl(0.055, 0.075, 0.5, 10), { p: [0, -0.25, 0] }]]));
const bellSleeveGeo = () => shared('bellSleeve', () => merge([[cyl(0.055, 0.12, 0.44, 12, true), { p: [0, -0.22, 0] }]]));
const handGeo = (y) => shared('hand' + y, () => merge([[sph(0.062, 10, 8), { p: [0, y, 0] }]]));
const headGeo = () => shared('head', () => merge([[sph(0.15), { p: [0, 1.56, 0] }]]));
const hairCap = () => [sph(0.158, 16, 8, 0, TAU, 0, Math.PI * 0.45), { p: [0, 1.565, 0.005], r: [0.45, 0, 0] }];

const CASSOCK = [[0, 0], [0.36, 0], [0.355, 0.05], [0.3, 0.5], [0.255, 0.95], [0.235, 1.22], [0.2, 1.33], [0.09, 1.42], [0, 1.44]];
const HABIT = [[0, 0], [0.4, 0], [0.395, 0.05], [0.33, 0.5], [0.27, 0.95], [0.25, 1.2], [0.2, 1.32], [0.09, 1.42], [0, 1.44]];
const CLOAK = [[0, 0.02], [0.43, 0.02], [0.42, 0.08], [0.35, 0.55], [0.3, 0.98], [0.285, 1.2], [0.22, 1.33], [0.1, 1.42], [0, 1.44]];
const TORSO = [[0, 0.6], [0.25, 0.6], [0.285, 0.68], [0.27, 0.95], [0.285, 1.18], [0.25, 1.32], [0.13, 1.42], [0, 1.44]];

// Each spec: body = [[matKey, geometry]] in rig space (feet at y=0); arm = shoulder + rest pose; extras hang off an arm.
const BUILD = {
  priest: () => ({
    body: [
      ['black', merge([[lathe(CASSOCK)], hairCap(),
        [box(0.25, 0.09, 0.25), { p: [0, 1.735, 0.01], r: [0.12, 0, 0] }],          // biretta
        [sph(0.035, 8, 6), { p: [0, 1.8, 0.02] }]])],                              // pompom
      ['linen', merge([[torus(0.098, 0.02, 6, 20), { p: [0, 1.405, 0], r: FLAT }],   // roman collar
        [box(0.055, 0.05, 0.02), { p: [0, 1.39, -0.116] }]])],                      // collar tab
      ['skin', headGeo()],
      ['accent', merge([                                                              // stole
        [lathe(band(CASSOCK, 0.55, 1.36, 0.014), 3, Math.PI - 0.37 - 0.17, 0.34)],
        [lathe(band(CASSOCK, 0.55, 1.36, 0.014), 3, Math.PI + 0.37 - 0.17, 0.34)],
        [torus(0.19, 0.028, 6, 20), { p: [0, 1.335, 0.01], r: FLAT }]])],
    ],
    arm: { x: 0.24, y: 1.3, restX: 0.2, restZR: 0.12, restZL: 0.12, swing: 1, sleeve: sleeveGeo(), sleeveMat: 'black', hand: handGeo(-0.55), handMat: 'skin' },
    left: [], right: [],
  }),
  nun: () => ({
    body: [
      ['black', merge([[lathe(HABIT)],
        [sph(0.194, 16, 8, 0, TAU, 0, Math.PI * 0.42), { p: [0, 1.565, 0.03], r: [0.55, 0, 0] }],   // veil cap
        [cyl(0.175, 0.275, 0.52, 16, true, -1.9, 3.8), { p: [0, 1.36, 0.03] }]])],                  // veil drape (back)
      ['linen', merge([[sph(0.172), { p: [0, 1.555, 0.015] }],                                       // coif
        [lathe([[0.285, 1.12], [0.26, 1.25], [0.2, 1.36], [0.12, 1.45]], 20)]])],                    // wimple bib
      ['skin', merge([[sph(0.145), { p: [0, 1.555, -0.045] }]])],
      ['accent', merge([[torus(rAt(HABIT, 0.95) + 0.012, 0.022, 6, 28), { p: [0, 0.95, 0], r: FLAT }],   // cincture
        [cyl(0.013, 0.013, 0.45, 6), { p: [-0.12, 0.72, -0.292], r: [0.13, 0, 0] }]])],
    ],
    arm: { x: 0.24, y: 1.3, restX: 0.65, restZR: -0.32, restZL: -0.32, swing: 0.35, sleeve: sleeveGeo(), sleeveMat: 'black', hand: handGeo(-0.55), handMat: 'skin' },
    left: [], right: [],
  }),
  pilgrim: () => {
    const arm = { x: 0.25, y: 1.3, restX: 0.25, restZR: 0.12, restZL: 0.3, swing: 0.8, keepLeft: true, sleeve: sleeveGeo(), sleeveMat: 'brown', hand: handGeo(-0.55), handMat: 'skin' };
    const handY = arm.y - 0.55 * Math.cos(arm.restX) * Math.cos(arm.restZL);   // world height of the left hand at rest
    const staffLen = 1.78;
    return {
      body: [
        ['brown', merge([[lathe(CLOAK)],
          [lathe([[0.37, 0.98], [0.345, 1.15], [0.27, 1.32], [0.13, 1.43]], 20)],                    // capelet
          [sph(0.15, 12, 8), { p: [0, 1.43, 0.16], s: [1.15, 0.75, 0.9] }]])],                        // hood, down
        ['felt', merge([[cyl(0.33, 0.33, 0.022, 28), { p: [0, 1.675, 0] }],                          // brim
          [cyl(0.115, 0.14, 0.15, 20), { p: [0, 1.75, 0] }]])],                                       // crown
        ['shell', merge([[sph(0.07, 10, 6, 0, Math.PI), { p: [0, 1.745, -0.128], r: [0, Math.PI, 0], s: [1, 1, 0.4] }],
          [sph(0.085, 10, 6, 0, Math.PI), { p: [0, 1.16, -0.34], r: [0.25, Math.PI, 0], s: [1, 1, 0.4] }]])],
        ['skin', headGeo()],
        ['accent', merge([[torus(rAt(CLOAK, 0.92) + 0.012, 0.032, 6, 28), { p: [0, 0.92, 0], r: FLAT }],   // sash
          [cyl(0.141, 0.141, 0.035, 20, true), { p: [0, 1.705, 0] }]])],                                // hat band
      ],
      arm,
      // staff: counter-rotated so it stands vertical at rest
      left: [['wood', merge([[cyl(0.022, 0.028, staffLen, 8), { p: [0, 0.03 + staffLen / 2 - handY, 0] }]]),
        { p: [0, -0.55, 0], r: [-arm.restX, 0, arm.restZL], order: 'ZYX' }]],
      right: [],
    };
  },
  knight: () => {
    const tab = [[0.325, 0.56], [0.295, 1.34]];
    return {
      body: [
        ['metal', merge([[lathe(TORSO)],
          [cyl(0.08, 0.07, 0.62, 10), { p: [-0.11, 0.35, 0] }], [cyl(0.08, 0.07, 0.62, 10), { p: [0.11, 0.35, 0] }],   // legs
          [box(0.12, 0.08, 0.24), { p: [-0.11, 0.04, -0.04] }], [box(0.12, 0.08, 0.24), { p: [0.11, 0.04, -0.04] }],     // sabatons
          [cyl(0.16, 0.165, 0.3, 20), { p: [0, 1.6, 0] }],                                                            // great helm
          [sph(0.16, 20, 8, 0, TAU, 0, Math.PI / 2), { p: [0, 1.75, 0], s: [1, 0.5, 1] }],
          [sph(0.13, 12, 8, 0, TAU, 0, Math.PI / 2), { p: [-0.27, 1.3, 0], s: [1.1, 0.8, 1.1] }],                     // pauldrons
          [sph(0.13, 12, 8, 0, TAU, 0, Math.PI / 2), { p: [0.27, 1.3, 0], s: [1.1, 0.8, 1.1] }]])],
        ['dark', merge([[cyl(0.166, 0.166, 0.03, 16, true, Math.PI - 0.75, 1.5), { p: [0, 1.65, 0] }]])],          // visor slit
        ['linen', merge([[cyl(0.295, 0.325, 0.78, 20, true, Math.PI - 0.85, 1.7), { p: [0, 0.95, 0] }],            // tabard front
          [cyl(0.295, 0.325, 0.78, 20, true, -0.85, 1.7), { p: [0, 0.95, 0] }]])],                                   // tabard back
        ['red', merge([[box(0.075, 0.44, 0.02), { p: [0, 1.0, -(rAt(tab, 1.0) + 0.012)], r: [0.038, 0, 0] }],
          [cyl(rAt(tab, 1.1) + 0.012, rAt(tab, 1.1) + 0.012, 0.075, 16, true, Math.PI - 0.36, 0.72), { p: [0, 1.1, 0] }]])],
        ['accent', merge([[cyl(0.3, 0.44, 1.26, 20, true, -1.25, 2.5), { p: [0, 0.71, 0.02] }]])],                 // cloak
      ],
      arm: { x: 0.3, y: 1.3, restX: 0.12, restZR: 0.18, restZL: 0.18, swing: 0.9, sleeve: sleeveGeo(), sleeveMat: 'metal', hand: handGeo(-0.55), handMat: 'metal' },
      left: [], right: [],
    };
  },
  chorister: () => ({
    body: [
      ['cassockRed', merge([[lathe(CASSOCK)]])],
      ['linen', merge([[lathe([[0.41, 0.52], [0.39, 0.58], [0.32, 0.9], [0.275, 1.15], [0.25, 1.3], [0.16, 1.4], [0.105, 1.44]], 20)],   // surplice
        [torus(0.115, 0.042, 8, 18), { p: [0, 1.42, 0], r: FLAT, s: [1, 1, 0.7] }]])],                                                   // ruff
      ['hair', merge([hairCap()])],
      ['skin', headGeo()],
    ],
    arm: { x: 0.24, y: 1.3, restX: 0.95, restZR: -0.28, restZL: -0.28, swing: 0.25, sleeve: bellSleeveGeo(), sleeveMat: 'linen', hand: handGeo(-0.5), handMat: 'skin' },
    left: [['accent', merge([[box(0.24, 0.3, 0.045)]]), { p: [0.1, -0.52, -0.04], r: [-0.55, 0, 0] }]],   // songbook
    right: [],
  }),
};
const SPECS = new Map();
const spec = (id) => SPECS.get(id) || (SPECS.set(id, BUILD[id]()), SPECS.get(id));

function addMesh(parent, geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// -> { g (root: place/rotate), body (animated), setAccent(hex), dispose() }
export function makeAvatar(charId, accentHex) {
  const id = BUILD[charId] ? charId : 'pilgrim';
  const sp = spec(id);
  const accent = new THREE.MeshStandardMaterial({ color: accentHex || DEFAULT_ACCENT[id], roughness: 0.8, side: THREE.DoubleSide });
  const mat = (k) => (k === 'accent' ? accent : M[k]);
  const g = new THREE.Group(); g.name = 'avatar:' + id;
  const body = new THREE.Group(); body.position.y = PIVOT; g.add(body);
  const rig = new THREE.Group(); rig.position.y = -PIVOT; body.add(rig);
  for (const [k, geo] of sp.body) addMesh(rig, geo, mat(k));
  const arms = [];
  for (const s of [1, -1]) {   // +1 = right (+X), -1 = left
    const arm = new THREE.Group(); arm.position.set(s * sp.arm.x, sp.arm.y, 0);
    addMesh(arm, sp.arm.sleeve, M[sp.arm.sleeveMat]);
    addMesh(arm, sp.arm.hand, mat(sp.arm.handMat));
    for (const [k, geo, t] of (s > 0 ? sp.right : sp.left)) {
      const m = addMesh(arm, geo, mat(k));
      if (t.order) m.rotation.order = t.order;
      m.position.set(...t.p); m.rotation.set(...t.r);
    }
    rig.add(arm); arms.push(arm);
  }
  const av = {
    id, g, body, rig, arms, accent,
    _c: sp.arm,
    _a: { phase: 0, moving: 0, jumpT: 0, lift: 0, rollAng: 0, rollT: 0, wave: 0 },
    setAccent(hex) { accent.color.set(hex); },
    dispose() { accent.dispose(); g.removeFromParent(); },
  };
  poseAvatar(av, IDLE, 0, 0);
  return av;
}
const IDLE = { speed: 0, act: null, actT: 0, waveT: -1 };

// state = { speed (m/s), act: null|'jump'|'roll', actT (s since act start), waveT (-1 or s) }. No allocation per call.
export function poseAvatar(av, state, dt, t) {
  const a = av._a, c = av._c;
  dt = dt > 0 ? Math.min(dt, 0.1) : 0;
  const st = state || IDLE;
  const speed = st.speed > 0 ? st.speed : 0;
  const act = st.act, at = st.actT > 0 ? st.actT : 0;
  const waveT = st.waveT >= 0 ? st.waveT : -1;
  const kMove = 1 - Math.exp(-dt * 9), kBack = 1 - Math.exp(-dt * 12);

  a.moving += (Math.min(1, Math.max(0, (speed - 0.2) / 2.6)) - a.moving) * kMove;
  a.phase = (a.phase + dt * Math.min(speed, 6) * 2.6) % (TAU * 64);

  // jump: lift + slight tuck, then ease back
  if (act === 'jump' && at < JUMP.dur) { a.jumpT = Math.sin(Math.PI * at / JUMP.dur); a.lift = jumpY(at); }
  else { a.jumpT -= a.jumpT * kBack; a.lift -= a.lift * kBack; }

  // roll: forward somersault 0 -> -2π around the pivot, tucked while inverted
  if (act === 'roll' && at < ROLL.dur) {
    const u = at / ROLL.dur;
    a.rollAng = -TAU * u * u * (3 - 2 * u);
    a.rollT = Math.min(1, Math.sin(Math.PI * u) * 2.4);
  } else {
    if (a.rollAng !== 0) {
      let r = a.rollAng % TAU;
      if (r < -Math.PI) r += TAU; else if (r > Math.PI) r -= TAU;
      a.rollAng = Math.abs(r) < 1e-4 ? 0 : r - r * kBack;
    }
    a.rollT = Math.max(a.rollT - a.rollT * kBack, Math.min(1, Math.abs(a.rollAng) / 0.5));   // stay tucked while still rotated
  }

  // wave: right hand up, little hops (same feel as cathedral.html)
  let hop = 0, up = 0;
  if (waveT >= 0) {
    hop = Math.abs(Math.sin(waveT * Math.PI * 2.6)) * 0.22 * Math.max(0, 1 - waveT / 1.4);
    up = Math.max(0, 1 - Math.max(0, waveT - 1.2) / 0.4);
  }
  a.wave += (up - a.wave) * (1 - Math.exp(-dt * 16));

  const rt = a.rollT, jt = a.jumpT;
  const bob = Math.abs(Math.sin(a.phase)) * 0.05 * a.moving;
  av.body.position.y = PIVOT + (bob + hop) * (1 - rt) + a.lift + 0.1 * rt;
  av.body.rotation.x = a.rollAng - 0.08 * a.moving * (1 - rt);
  // tuck: squash the rig around an anchor height (pivot for the roll, chest for the jump)
  const sy = 1 - 0.6 * rt - 0.12 * jt, sxz = 1 - 0.18 * rt + 0.04 * jt;
  const w = rt + jt, A = w > 1e-4 ? (PIVOT * rt + 1.3 * jt) / w : PIVOT;
  av.rig.scale.set(sxz, sy, sxz);
  av.rig.position.y = A - PIVOT - A * sy;

  const sw = Math.sin(a.phase) * 0.6 * c.swing * a.moving;
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    let rx = c.restX + sw * s, rz = s * (s > 0 ? c.restZR : c.restZL);
    rx += 0.4 * jt; rz += s * 0.5 * jt;
    if (s > 0 || !c.keepLeft) { rx += (1.15 - rx) * rt; rz += (-s * 0.1 - rz) * rt; }   // hug knees (staff hand stays put)
    if (s > 0 && a.wave > 0.001) { const h = a.wave; rx += (0.1 - rx) * h; rz += (2.6 + Math.sin(t * 14) * 0.3 - rz) * h; }
    av.arms[i].rotation.set(rx, 0, rz);
  }
}
