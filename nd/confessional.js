// confessional.js -- three oak confessionals for the Notre-Dame page (standalone ES module, THREE passed in).
// Units: metres. x: north(-) / south(+), z: east(-) / west(+).  Facing convention (same as the avatar code):
// an object with rotation.y = ry looks along (-sin ry, -cos ry) in (x, z).
//
// Booth frame (local): u = across the 3.2 m width (right when facing the front), w = depth,
// w = -0.6 is the open front (faces the aisle), w = +0.6 is the back against the chapel wall.
// Layout across u (active side = `side`, +1 or -1):
//   [ decorative cell, curtain closed, solid ][ priest cell, door ][ penitent cell, curtain tied back ]
// A lattice grille sits in each partition at w = 0.15, y = 1.3 (priest <-> penitent).

const H = 2.6;                       // collision height of the walls
const PI = Math.PI;
const R6 = (v) => Math.round(v * 1e6) / 1e6;
const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// side-chapel bays on the nave (bay line k = 7 + 6k; chapel interior between the dividers is [z_k+0.45, z_k+1 - 0.45]).
// x = +-22.65: booth back at |x| = 23.25 (chapel wall inner face 23.3), open front at |x| = 22.05.
export const CONFESSIONAL_SPECS = [
  { id: 'c1', name: '북쪽 고해소 1', x: -22.65, z: 22, ry: -PI / 2, side: 1 },   // north bay 2 (z 19..25)
  { id: 'c2', name: '남쪽 고해소',   x: 22.65,  z: 28, ry: PI / 2,  side: -1 },  // south bay 3 (z 25..31)
  { id: 'c3', name: '북쪽 고해소 2', x: -22.65, z: 40, ry: -PI / 2, side: 1 },   // north bay 5 (z 37..43)
];

// cell limits in local u (before the `side` mirror), w range of the standable part
const PRIEST_U = [-0.5, 0.5], PEN_U = [0.7, 1.5], SEAT_W = [-0.3, 0.6], SEAT_AT_W = 0.15;

// ---------- pure layout (no THREE): seats, zones, collision blocks ----------
export function confessionalLayout(specs = CONFESSIONAL_SPECS) {
  const booths = [], blocks = [];
  for (const sp of specs) {
    const S = sp.side, c = Math.cos(sp.ry), s = Math.sin(sp.ry);
    const toWorld = (u, w) => [R6(sp.x + u * c + w * s), R6(sp.z - u * s + w * c)];
    const rect = (u0, u1, w0, w1) => {
      const a = toWorld(u0, w0), b = toWorld(u1, w1);
      return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) };
    };
    const mir = (a, b) => (S > 0 ? [a, b] : [-b, -a]);          // mirror a u-interval to the active side
    const [px, pz] = toWorld(0, SEAT_AT_W), [qx, qz] = toWorld(S * 1.1, SEAT_AT_W);
    const priestRect = rect(PRIEST_U[0], PRIEST_U[1], SEAT_W[0], SEAT_W[1]);
    const penRect = rect(...mir(PEN_U[0], PEN_U[1]), SEAT_W[0], SEAT_W[1]);
    booths.push({
      id: sp.id, name: sp.name, x: sp.x, z: sp.z, ry: sp.ry,
      seats: {
        priest: { x: px, z: pz, ry: R6(norm(sp.ry - S * PI / 2)), rect: priestRect },     // faces the grille (toward the penitent)
        penitent: { x: qx, z: qz, ry: R6(norm(sp.ry + S * PI / 2)), rect: penRect },
      },
      zone: rect(...mir(-0.5, 1.5), -0.6, 0.6),                                              // priest cell + active penitent cell
      door: { x: toWorld(0, -0.9)[0], z: toWorld(0, -0.9)[1] },                              // a point just outside the priest door
    });
    // walls (0.2 m thick so a sprinting avatar cannot skip over them); the priest door and penitent doorway stay open
    for (const [u0, u1, w0, w1] of [
      [-1.7, 1.7, 0.5, 0.6],                        // back
      [...mir(1.5, 1.7), -0.62, 0.62],              // end wall, active side
      [...mir(0.5, 0.7), -0.62, 0.62],              // partition priest | penitent
      [...mir(-1.7, -0.5), -0.62, 0.62],            // decorative cell, solid (both its partition and end wall)
    ]) blocks.push({ ...rect(u0, u1, w0, w1), h: H });
  }
  const boothAt = (x, z) => booths.find((b) => x >= b.zone.x0 && x <= b.zone.x1 && z >= b.zone.z0 && z <= b.zone.z1) || null;
  const seatAt = (x, z) => {
    for (const b of booths) for (const role of ['priest', 'penitent']) {
      const r = b.seats[role].rect;
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return { booth: b, role };
    }
    return null;
  };
  return { booths, blocks, boothAt, seatAt };
}

// ---------- geometry helpers ----------
function mergeGeos(THREE, list) {
  let count = 0; for (const g of list) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2); let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count; g.dispose();
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  m.computeBoundingSphere(); return m;
}
function grainTexture(THREE, base, seed) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  let r = seed; const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 128, v = rnd() < 0.5 ? 0 : 255;
    g.strokeStyle = `rgba(${v},${v},${v},${0.03 + rnd() * 0.09})`; g.lineWidth = 0.6 + rnd() * 2.2;
    g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + rnd() * 8 - 4, 85, x + rnd() * 8 - 4, 170, x + rnd() * 6 - 3, 256); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function plaqueTexture(THREE) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#3a2314'; g.fillRect(0, 0, 512, 160);
  g.strokeStyle = '#c99a3c'; g.lineWidth = 5; g.strokeRect(10, 10, 492, 140);
  g.strokeStyle = 'rgba(201,154,60,0.5)'; g.lineWidth = 1.5; g.strokeRect(20, 20, 472, 120);
  g.fillStyle = '#e6bd5c'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 84px "Noto Serif KR","Apple SD Gothic Neo","Malgun Gothic",serif';
  g.fillText('고해소', 256, 84);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------- the module's main entry ----------
export function buildConfessionals(THREE, scene, opts = {}) {
  const layout = confessionalLayout(opts.specs || CONFESSIONAL_SPECS);
  const specs = opts.specs || CONFESSIONAL_SPECS;
  const woodMat = opts.woodMat || new THREE.MeshLambertMaterial({ map: grainTexture(THREE, '#8a5a30', 7), color: '#ffffff' });
  const darkWoodMat = opts.darkWoodMat || new THREE.MeshLambertMaterial({ map: grainTexture(THREE, '#442a16', 19), color: '#ffffff' });
  const curtainMat = new THREE.MeshLambertMaterial({ color: '#6a1018', side: THREE.DoubleSide });
  const plaqueMap = plaqueTexture(THREE);
  const plaqueMat = new THREE.MeshBasicMaterial({ map: plaqueMap, color: plaqueMap ? '#ffffff' : '#c99a3c' });

  const oak = [], dark = [], curtain = [], plaque = [];
  const Mt = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const Me = (rx, ry, rz) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));

  for (const sp of specs) {
    const S = sp.side;
    const F = Mt(sp.x, 0, sp.z).multiply(Me(0, sp.ry, 0));
    const putM = (list, geo, local) => { const g = geo.index ? geo.toNonIndexed() : geo; if (g !== geo) geo.dispose(); g.applyMatrix4(F.clone().multiply(local)); list.push(g); };
    const put = (list, geo, u, y, w, rx = 0, ry = 0, rz = 0) => putM(list, geo, Mt(u, y, w).multiply(Me(rx, ry, rz)));
    // box centred at (u, y, w) of size (du, dy, dw); u is already mirrored by the caller through U()
    const U = (u) => S * u;
    const bx = (list, u, y, w, du, dy, dw, rx = 0, ry = 0, rz = 0) => put(list, new THREE.BoxGeometry(du, dy, dw), u, y, w, rx, ry, rz);
    const span = (list, u, y0, y1, w0, w1, du) => bx(list, u, (y0 + y1) / 2, (w0 + w1) / 2, du, y1 - y0, w1 - w0);

    // carcass
    bx(dark, 0, 0.06, 0, 3.3, 0.12, 1.26);                              // plinth
    bx(oak, 0, 1.2, 0.56, 3.2, 2.4, 0.08);                               // back
    for (const e of [-1, 1]) span(oak, e * 1.56, 0.12, 2.3, -0.6, 0.6, 0.08);   // end walls
    // partitions with the grille opening (w 0.15 +- 0.2, y 1.1 .. 1.5)
    for (const e of [-1, 1]) {
      const u = e * 0.6;
      span(oak, u, 0.12, 1.1, -0.6, 0.6, 0.08); span(oak, u, 1.5, 2.4, -0.6, 0.6, 0.08);
      span(oak, u, 1.1, 1.5, -0.6, -0.05, 0.08); span(oak, u, 1.1, 1.5, 0.35, 0.6, 0.08);
      // grille: frame + diamond lattice
      bx(dark, u, 1.515, 0.15, 0.1, 0.03, 0.46); bx(dark, u, 1.085, 0.15, 0.1, 0.03, 0.46);
      bx(dark, u, 1.3, 0.15 - 0.215, 0.1, 0.4, 0.03); bx(dark, u, 1.3, 0.15 + 0.215, 0.1, 0.4, 0.03);
      for (let k = -3; k <= 3; k++) {
        const c = k * 0.1, L = Math.SQRT2 * (0.4 - Math.abs(c));
        bx(dark, u, 1.3 + c / 2, 0.15 - c / 2, 0.03, 0.018, L, -PI / 4, 0, 0);   // rising diagonal
        bx(dark, u, 1.3 + c / 2, 0.15 + c / 2, 0.03, 0.018, L, PI / 4, 0, 0);    // falling diagonal
      }
    }
    // roofs: wings at 2.33, priest cell at 2.43 with a gable and a cross
    for (const e of [-1, 1]) bx(dark, e * 1.1, 2.33, 0, 1.2, 0.06, 1.32);
    bx(dark, 0, 2.43, 0, 1.5, 0.06, 1.34);
    const tilt = Math.atan2(0.22, 0.72), len = Math.hypot(0.72, 0.22);
    bx(dark, -0.36, 2.46 + 0.11 + 0.01, 0, len, 0.05, 1.34, 0, 0, tilt);
    bx(dark, 0.36, 2.46 + 0.11 + 0.01, 0, len, 0.05, 1.34, 0, 0, -tilt);
    const ped = new THREE.Shape(); ped.moveTo(-0.72, 0); ped.lineTo(0.72, 0); ped.lineTo(0, 0.22); ped.closePath();
    put(oak, new THREE.ShapeGeometry(ped), 0, 2.46, -0.63, 0, PI, 0);       // front pediment, faces the aisle
    bx(dark, 0, 2.93, -0.45, 0.05, 0.46, 0.05); bx(dark, 0, 3.01, -0.45, 0.24, 0.05, 0.05);   // cross
    // front: pilasters, lintels, sign
    for (const e of [-1, 1]) { span(dark, e * 0.6, 0.12, 2.4, -0.67, -0.57, 0.14); span(dark, e * 1.55, 0.12, 2.28, -0.67, -0.57, 0.14); }
    span(oak, 0, 2.0, 2.4, -0.63, -0.57, 1.06);                              // priest lintel
    for (const e of [-1, 1]) span(oak, e * 1.08, 1.98, 2.3, -0.63, -0.57, 0.86);   // penitent headers
    put(plaque, new THREE.PlaneGeometry(0.92, 0.3), 0, 2.2, -0.645, 0, PI, 0);
    // priest door, leaf swung open on the decorative side
    const leaf = Mt(U(-0.54), 1.05, -0.64).multiply(Me(0, S * 1.1, 0)).multiply(Mt(S * 0.25, 0, 0));
    putM(oak, new THREE.BoxGeometry(0.5, 1.86, 0.04), leaf);
    for (const dy of [-0.45, 0.45]) putM(dark, new THREE.BoxGeometry(0.34, 0.62, 0.05), leaf.clone().multiply(Mt(0, dy, 0)));
    // priest bench, penitent kneeler + arm ledge
    bx(oak, 0, 0.22, 0.38, 0.95, 0.44, 0.36); bx(dark, 0, 0.46, 0.38, 0.99, 0.04, 0.4);
    bx(dark, U(1.1), 0.2, 0.1, 0.56, 0.16, 0.44); bx(curtain, U(1.1), 0.295, 0.1, 0.52, 0.035, 0.4);
    bx(dark, U(0.76), 0.98, 0.15, 0.2, 0.04, 0.55);
    // curtains: decorative cell closed, active cell tied back to the end wall; valances over both
    const drape = (list, width, height, waves, amp, u, y, w) => {
      const g = new THREE.PlaneGeometry(width, height, waves * 6, 1), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, amp * Math.sin((p.getX(i) / width + 0.5) * waves * 2 * PI));
      g.computeVertexNormals(); put(list, g, u, y, w, 0, PI, 0);
    };
    drape(curtain, 0.86, 1.8, 7, 0.035, U(-1.1), 1.04, -0.55);
    drape(curtain, 0.3, 1.8, 3, 0.05, U(1.35), 1.04, -0.55);
    for (const e of [-1, 1]) bx(curtain, U(e * 1.1), 1.94, -0.57, 0.88, 0.08, 0.04);
    bx(dark, U(-1.1), 1.99, -0.58, 0.9, 0.02, 0.02);
  }

  const mk = (list, mat, name) => {
    const m = new THREE.Mesh(mergeGeos(THREE, list), mat); m.name = name; m.frustumCulled = false;
    m.userData.confessional = true; scene.add(m); return m;
  };
  const meshes = [mk(oak, woodMat, 'confessional-oak'), mk(dark, darkWoodMat, 'confessional-dark'), mk(curtain, curtainMat, 'confessional-curtain'), mk(plaque, plaqueMat, 'confessional-sign')];
  return {
    booths: layout.booths, blocks: layout.blocks, boothAt: layout.boothAt, seatAt: layout.seatAt,
    meshes,
    dispose() { for (const m of meshes) { scene.remove(m); m.geometry.dispose(); } },
  };
}
