// offering.js - purely virtual offering boxes ("헌금함") for the Notre-Dame page.
// Presentation only: no networking, no counter, no UI, and no money of any kind.
// Units are metres (x: north - / south +, z: east - / west +).

const MAX_COINS = 12;      // pooled coin meshes
const MAX_SPARKS = 30;     // pooled sparkle points (one Points object)
const MAX_CANDLES = 6;     // pooled floating candles
const SLOT_Y = 1.085;      // height of the coin slot above the floor
const CANDLE_SECONDS = 20;

// Default placement. ry turns the box's front (local +z) toward (sin ry, cos ry).
const PLACEMENT = [
  { id: 'o1', name: '정문 헌금함', x: 2.4, z: 58, ry: -Math.PI / 2 },  // beside the central aisle, facing it
  { id: 'o2', name: '촛불 헌금함', x: 10.6, z: -8.4, ry: -1.0 },       // next to the votive stand, facing the candles
];

// "오늘 함께 드린 헌금 1,234번" - counts offerings, never money.
export function formatTotal(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return '오늘 함께 드린 헌금 ' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '번';
}

export function buildOffering(THREE, scene, opts) {
  opts = opts || {};
  const woodMat = opts.woodMat || new THREE.MeshLambertMaterial({ color: '#6a4327' });
  const goldMat = opts.goldMat || new THREE.MeshStandardMaterial({ color: '#c99a3c', roughness: 0.35, metalness: 0.6, emissive: '#3a2608', emissiveIntensity: 0.7 });
  const onLand = typeof opts.onLand === 'function' ? opts.onLand : null;  // optional hook: (box, kind) when a coin lands

  // ---------- textures ----------
  const canvasTex = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const glowTex = canvasTex(64, 64, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,240,190,0.85)');
    r.addColorStop(0.6, 'rgba(255,200,90,0.25)'); r.addColorStop(1, 'rgba(255,200,90,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  });
  const signTex = canvasTex(256, 96, (g, w, h) => {
    const rr = (x, y, ww, hh, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath(); };
    rr(4, 4, w - 8, h - 8, 18); g.fillStyle = 'rgba(40,24,14,0.88)'; g.fill();
    g.lineWidth = 4; g.strokeStyle = '#d9ab4a'; g.stroke();
    g.fillStyle = '#f3d27a'; g.font = '700 52px "Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('헌금함', w / 2, h / 2 + 3);
  });

  // ---------- shared geometry / materials ----------
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const darkMat = new THREE.MeshBasicMaterial({ color: '#0a0604' });
  const coinGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.012, 18);
  const coinMat = new THREE.MeshStandardMaterial({ color: '#ffd45c', roughness: 0.28, metalness: 0.55, emissive: '#a06a14', emissiveIntensity: 0.9 });
  const waxMat = new THREE.MeshLambertMaterial({ color: '#f1e6cc' });
  const waxGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.16, 8);
  const flameMat = new THREE.SpriteMaterial({ map: glowTex, color: '#ffc468', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
  const slotGlowMat = new THREE.SpriteMaterial({ map: glowTex, color: '#ffd27a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });

  function part(group, mat, x, y, z, sx, sy, sz) {
    const m = new THREE.Mesh(unit, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); group.add(m); return m;
  }

  // ---------- the boxes (about 0.62 x 0.46 x 1.09 m) ----------
  const boxes = [], blocks = [], boxState = [];
  for (const p of PLACEMENT) {
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = p.ry;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(g, woodMat, sx * 0.26, 0.23, sz * 0.18, 0.05, 0.46, 0.05);  // legs
    part(g, woodMat, 0, 0.48, 0, 0.58, 0.04, 0.43);              // stand top
    part(g, woodMat, 0, 0.76, 0, 0.54, 0.52, 0.40);              // body
    part(g, goldMat, 0, 0.6, 0, 0.552, 0.03, 0.412);             // lower brass band
    part(g, goldMat, 0, 0.93, 0, 0.552, 0.03, 0.412);            // upper brass band
    part(g, woodMat, 0, 1.045, 0, 0.62, 0.05, 0.46);             // lid
    part(g, goldMat, 0, 1.073, 0, 0.27, 0.012, 0.10);            // brass slot plate
    part(g, darkMat, 0, 1.0795, 0, 0.19, 0.003, 0.02);           // the slot
    part(g, goldMat, 0, 0.8, 0.205, 0.22, 0.08, 0.012);          // small brass plaque (front)
    part(g, darkMat, 0, 0.8, 0.2115, 0.15, 0.008, 0.002);        // engraved line on the plaque
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTex, transparent: true, fog: false, toneMapped: false }));
    sign.scale.set(0.78, 0.29, 1); sign.position.set(p.x, 1.62, p.z); sign.renderOrder = 5;
    const glow = new THREE.Sprite(slotGlowMat.clone()); glow.scale.set(0.55, 0.55, 1); glow.position.set(p.x, SLOT_Y + 0.02, p.z);
    scene.add(g, sign, glow);
    // axis-aligned footprint of the rotated box, for the integrator's collision list
    const c = Math.abs(Math.cos(p.ry)), s = Math.abs(Math.sin(p.ry));
    const hx = 0.31 * c + 0.23 * s, hz = 0.31 * s + 0.23 * c;
    blocks.push({ x0: p.x - hx, x1: p.x + hx, z0: p.z - hz, z1: p.z + hz, h: 1.1 });
    boxes.push({ id: p.id, name: p.name, x: p.x, z: p.z, slot: { x: p.x, y: SLOT_Y, z: p.z } });
    boxState.push({ sign, glow, glowT: 0, phase: Math.random() * 6 });
  }
  const boxIndex = (id) => { for (let i = 0; i < boxes.length; i++) if (boxes[i].id === id) return i; return -1; };

  // ---------- pooled coins ----------
  const coins = [];
  for (let i = 0; i < MAX_COINS; i++) {
    const mesh = new THREE.Mesh(coinGeo, coinMat); mesh.visible = false; scene.add(mesh);
    coins.push({ mesh, on: false, t: 0, dur: 1, sx: 0, sy: 0, sz: 0, ex: 0, ey: 0, ez: 0, arc: 0, spin: 0, spark: 0, box: 0, kind: 0, spinOff: 0 });
  }
  let coinNext = 0;

  // ---------- pooled sparkles (one Points object) ----------
  const sPos = new Float32Array(MAX_SPARKS * 3), sCol = new Float32Array(MAX_SPARKS * 3);
  const sVel = new Float32Array(MAX_SPARKS * 3), sLife = new Float32Array(MAX_SPARKS), sMax = new Float32Array(MAX_SPARKS);
  for (let i = 0; i < MAX_SPARKS; i++) sPos[i * 3 + 1] = -100;
  const sGeo = new THREE.BufferGeometry();
  const sPosAttr = new THREE.BufferAttribute(sPos, 3), sColAttr = new THREE.BufferAttribute(sCol, 3);
  sPosAttr.setUsage(THREE.DynamicDrawUsage); sColAttr.setUsage(THREE.DynamicDrawUsage);
  sGeo.setAttribute('position', sPosAttr); sGeo.setAttribute('color', sColAttr);
  const sMat = new THREE.PointsMaterial({ map: glowTex, size: 0.1, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false });
  const sparks = new THREE.Points(sGeo, sMat); sparks.frustumCulled = false; sparks.renderOrder = 6; scene.add(sparks);
  let sparkNext = 0;
  function emit(x, y, z, vx, vy, vz, life) {
    const i = sparkNext; sparkNext = (sparkNext + 1) % MAX_SPARKS;   // ring buffer: reuses the oldest
    sPos[i * 3] = x; sPos[i * 3 + 1] = y; sPos[i * 3 + 2] = z;
    sVel[i * 3] = vx; sVel[i * 3 + 1] = vy; sVel[i * 3 + 2] = vz;
    sLife[i] = sMax[i] = life;
  }

  // ---------- pooled floating candles ----------
  const candles = [];
  for (let i = 0; i < MAX_CANDLES; i++) {
    const wax = new THREE.Mesh(waxGeo, waxMat), flame = new THREE.Sprite(flameMat);
    wax.visible = false; flame.visible = false; flame.renderOrder = 6; scene.add(wax, flame);
    candles.push({ wax, flame, on: false, t: 0, x: 0, y: 0, z: 0, phase: i * 1.7 });
  }
  let candleCount = 0;
  function lightCandle(bi) {
    let pick = candles[0];
    for (const c of candles) { if (!c.on) { pick = c; break; } if (c.t > pick.t) pick = c; }  // free one, else the oldest
    const k = candleCount++, a = k * 1.2566 + bi, r = 0.62 + (k % 2) * 0.12;
    pick.on = true; pick.t = 0;
    pick.x = boxes[bi].x + Math.cos(a) * r; pick.z = boxes[bi].z + Math.sin(a) * r; pick.y = 1.22 + (k % 3) * 0.1;
    pick.wax.visible = true; pick.flame.visible = true;
  }

  // ---------- public: dropCoin / nearBox / update / playClink ----------
  function dropCoin(boxId, fromPos, kind) {
    const bi = boxIndex(boxId); if (bi < 0) return;
    const b = boxes[bi], c = coins[coinNext]; coinNext = (coinNext + 1) % MAX_COINS;  // reuse oldest if all busy
    if (fromPos) { c.sx = fromPos.x; c.sy = fromPos.y; c.sz = fromPos.z; } else { c.sx = b.x; c.sy = SLOT_Y + 0.8; c.sz = b.z + 0.6; }
    c.ex = b.slot.x; c.ey = b.slot.y + 0.01; c.ez = b.slot.z;
    const dx = c.ex - c.sx, dz = c.ez - c.sz, dist = Math.sqrt(dx * dx + dz * dz);
    c.dur = Math.min(0.9, Math.max(0.5, 0.45 + dist * 0.12));
    c.arc = 0.3 + Math.min(0.5, dist * 0.12);
    c.t = 0; c.on = true; c.spark = 0; c.box = bi; c.kind = kind === 'candle' ? 1 : 0;
    c.spinOff = (coinNext * 1.3) % 6.28; c.mesh.visible = true;
    c.mesh.position.set(c.sx, c.sy, c.sz);
  }

  function nearBox(x, z, r) {
    r = r === undefined ? 1.6 : r;
    let best = null, bd = r * r;
    for (let i = 0; i < boxes.length; i++) {
      const dx = x - boxes[i].x, dz = z - boxes[i].z, d = dx * dx + dz * dz;
      if (d <= bd) { bd = d; best = boxes[i]; }
    }
    return best;
  }

  let clock = 0;
  function update(dt) {
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;
    clock += dt;

    for (let i = 0; i < MAX_COINS; i++) {
      const c = coins[i]; if (!c.on) continue;
      c.t += dt;
      const u = c.t / c.dur;
      if (u >= 1) {
        c.on = false; c.mesh.visible = false;
        const ex = c.ex, ey = c.ey, ez = c.ez;
        for (let k = 0; k < 9; k++) {   // sparkle burst out of the slot
          const a = k * 0.698 + c.spinOff, sp = 0.25 + (k % 3) * 0.15;
          emit(ex, ey, ez, Math.cos(a) * sp, 0.9 + (k % 4) * 0.25, Math.sin(a) * sp, 0.55 + (k % 3) * 0.12);
        }
        boxState[c.box].glowT = 1;
        if (c.kind === 1) lightCandle(c.box);
        if (onLand) onLand(boxes[c.box], c.kind === 1 ? 'candle' : 'coin');
        continue;
      }
      const m = c.mesh, e = u * u * (3 - 2 * u) * 0.35 + u * 0.65;   // gentle ease
      m.position.x = c.sx + (c.ex - c.sx) * e;
      m.position.z = c.sz + (c.ez - c.sz) * e;
      m.position.y = c.sy + (c.ey - c.sy) * e + c.arc * 4 * e * (1 - e);
      m.rotation.x = c.spinOff + c.t * 16; m.rotation.z = 0.5 + c.t * 3;
      c.spark -= dt;
      if (c.spark <= 0) { c.spark = 0.045; emit(m.position.x, m.position.y, m.position.z, 0, 0.12, 0, 0.4); }   // trail
    }

    // sparkles: gravity, fade by darkening (additive blending)
    for (let i = 0; i < MAX_SPARKS; i++) {
      const j = i * 3;
      if (sLife[i] > 0) {
        sLife[i] -= dt;
        if (sLife[i] <= 0) { sCol[j] = sCol[j + 1] = sCol[j + 2] = 0; sPos[j + 1] = -100; continue; }
        sVel[j + 1] -= 2.4 * dt;
        sPos[j] += sVel[j] * dt; sPos[j + 1] += sVel[j + 1] * dt; sPos[j + 2] += sVel[j + 2] * dt;
        const f = sLife[i] / sMax[i];
        sCol[j] = f; sCol[j + 1] = 0.82 * f; sCol[j + 2] = 0.38 * f;
      }
    }
    sPosAttr.needsUpdate = true; sColAttr.needsUpdate = true;

    for (let i = 0; i < boxState.length; i++) {
      const s = boxState[i];
      s.sign.position.y = 1.62 + Math.sin(clock * 1.6 + s.phase) * 0.03;   // floating sign bob
      if (s.glowT > 0) { s.glowT -= dt * 2.2; if (s.glowT < 0) s.glowT = 0; }
      s.glow.material.opacity = s.glowT; s.glow.visible = s.glowT > 0;
    }

    for (let i = 0; i < MAX_CANDLES; i++) {
      const c = candles[i]; if (!c.on) continue;
      c.t += dt;
      if (c.t >= CANDLE_SECONDS) { c.on = false; c.wax.visible = false; c.flame.visible = false; continue; }
      const fade = Math.min(1, c.t / 0.6, (CANDLE_SECONDS - c.t) / 1.5);   // grow in, shrink out
      const y = c.y + Math.sin(clock * 1.3 + c.phase) * 0.04;
      c.wax.position.set(c.x, y, c.z); c.wax.scale.set(fade, fade, fade);
      const fl = (0.2 + 0.03 * Math.sin(clock * 17 + c.phase * 3)) * fade;
      c.flame.position.set(c.x, y + 0.14 * fade, c.z); c.flame.scale.set(fl, fl, 1);
    }
  }

  function playClink(ctx, dest) {
    if (!ctx || !dest || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    // a coin dropping in: bright metallic ping, then a softer second touch inside the box
    const hits = [[0, 1, 2350], [0.085, 0.5, 1850]];
    for (const [off, amp, f] of hits) {
      for (const [ratio, a, dec] of [[1, 0.22, 0.22], [1.51, 0.12, 0.16], [2.32, 0.07, 0.11], [3.7, 0.03, 0.07]]) {
        const o = ctx.createOscillator(), g = ctx.createGain(), s = t + off;
        o.type = 'sine'; o.frequency.value = f * ratio;
        g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(a * amp, s + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, s + dec);
        o.connect(g); g.connect(dest); o.start(s); o.stop(s + dec + 0.03);
      }
    }
  }

  return { boxes, blocks, nearBox, dropCoin, update, playClink };
}
