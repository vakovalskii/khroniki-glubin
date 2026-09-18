// Процедурные модели новых мобов (волна 2): пчела, летучая мышь, медведь, червь, элементаль, крыса,
// гуманоиды со своим силуэтом (разбойник, дриада, орки, ящер, культист) и аура чемпиона.
// Анимация — через userData.anim(t, st, dt): moving, attackT, hitT, casting, stunned, burrowed.
import * as THREE from 'three';
import { TEX } from './tex.js';

const tx = (k) => (k && TEX[k] ? TEX[k]() : null);
const lam = (color, o = {}, kind) => new THREE.MeshLambertMaterial({ color, map: tx(kind), ...o });
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
const add = (color, opacity = 0.8) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sph: new THREE.SphereGeometry(0.5, 12, 8),
  lowSph: new THREE.SphereGeometry(0.5, 7, 5),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
  cone4: new THREE.ConeGeometry(0.5, 1, 4),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  wing: (() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(1, 0.25); s.lineTo(0.85, -0.2); s.lineTo(0.55, -0.05); s.lineTo(0.4, -0.3); s.lineTo(0.15, -0.1); s.lineTo(0, -0.15); return new THREE.ShapeGeometry(s); })(),
  leaf: (() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.35, 0.3, 0, 1); s.quadraticCurveTo(-0.35, 0.3, 0, 0); return new THREE.ShapeGeometry(s); })(),
};
// деталь: геометрия, материал, позиция, масштаб, поворот
function part(geo, m, [x, y, z] = [0, 0, 0], s = 1, r = null) {
  const p = new THREE.Mesh(geo, m);
  p.position.set(x, y, z);
  if (Array.isArray(s)) p.scale.set(...s); else p.scale.setScalar(s);
  if (r) p.rotation.set(...r);
  p.castShadow = true;
  return p;
}
const grp = (x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); return g; };
const eyes = (parent, color, y, z, w = 0.3, s = 0.07) => {
  const m = glow(color);
  parent.add(part(G.box, m, [-w / 2, y, z], [s, s, 0.03]), part(G.box, m, [w / 2, y, z], [s, s, 0.03]));
};
const rnd = () => Math.random() * 6.28;
const ease = (x) => 1 - (1 - x) * (1 - x);

// ================= гуманоидная основа =================
// o: w, h — ширина/высота корпуса, legH — длина ног, arm — длина рук, head — радиус головы, hunch — наклон вперёд, skin, body, legs, robe, bodyKind
function rig(o) {
  const g = new THREE.Group();
  const w = o.w ?? 0.8, h = o.h ?? 0.9, legH = o.legH ?? 0.8, arm = o.arm ?? 0.66, hr = o.head ?? 0.55;
  const bodyM = lam(o.body, {}, o.bodyKind ?? 'leather'), skinM = lam(o.skin ?? 0xe0b090, {}, o.skinKind), legM = lam(o.legs ?? 0x3a3028, {}, 'cloth');
  const hip = legH;
  const upper = grp(0, hip, 0);
  const torso = part(G.box, bodyM, [0, h / 2, 0], [w, h, w * 0.55]);
  const neck = grp(0, h + hr * 0.35, 0);
  const head = part(G.sph, skinM, [0, 0, 0], hr);
  neck.add(head);
  const armL = grp(-w / 2 - 0.12, h - 0.08, 0), armR = grp(w / 2 + 0.12, h - 0.08, 0);
  for (const a of [armL, armR]) {
    a.add(part(G.box, o.bareArms ? skinM : bodyM, [0, -arm / 2, 0], [0.22 * (o.armW ?? 1), arm, 0.22 * (o.armW ?? 1)]));
    a.add(part(G.box, skinM, [0, -arm - 0.06, 0], [0.2 * (o.armW ?? 1), 0.16, 0.2 * (o.armW ?? 1)]));
  }
  const handR = grp(0, -arm - 0.06, 0.06); armR.add(handR);
  const handL = grp(0, -arm - 0.06, 0.06); armL.add(handL);
  upper.add(torso, neck, armL, armR);
  const legL = grp(-w * 0.26, hip, 0), legR = grp(w * 0.26, hip, 0);
  if (o.robe) {
    // мантия-конус вместо ног
    const skirt = part(G.cone, bodyM, [0, hip * 0.5 + 0.05, 0], [w * 1.5, hip + 0.3, w * 1.2]);
    skirt.rotation.y = Math.PI / 8;
    g.add(skirt);
  } else {
    for (const l of [legL, legR]) {
      l.add(part(G.box, legM, [0, -legH / 2, 0], [0.28 * (o.legW ?? 1), legH, 0.3 * (o.legW ?? 1)]));
      l.add(part(G.box, lam(0x2a221c, {}, 'leather'), [0, -legH + 0.04, 0.06], [0.3 * (o.legW ?? 1), 0.12, 0.42]));
    }
    g.add(legL, legR);
  }
  upper.rotation.x = o.hunch ?? 0;
  g.add(upper);
  const off = rnd();
  const R = { g, upper, torso, head, neck, armL, armR, handL, handR, legL, legR, bodyM, skinM, hip, off, hunch: o.hunch ?? 0 };
  // базовая анимация: шаг, дыхание, удар правой, каст двумя руками, отдача, оглушение
  R.anim = (t, st) => {
    const walk = st.moving ? Math.sin(t * 9 + off) : 0, idle = st.moving ? 0 : Math.sin(t * 1.8 + off);
    const hit = st.hitT || 0;
    if (!o.robe) { legL.rotation.x = walk * 0.7; legR.rotation.x = -walk * 0.7; }
    upper.position.y = hip + Math.abs(walk) * 0.06 + idle * 0.015;
    upper.rotation.x = R.hunch + (st.moving ? 0.1 : 0) - hit * 0.3 + (st.stunned ? 0.35 : 0);
    upper.rotation.y = 0;
    neck.rotation.x = -hit * 0.3 + idle * 0.04;
    armL.rotation.set(-walk * 0.6, 0, -0.12 - idle * 0.03);
    armR.rotation.set(walk * 0.6, 0, 0.12 + idle * 0.03);
    if (st.attackT > 0) {
      const k = 1 - Math.min(1, st.attackT);
      if (k < 0.3) { const q = k / 0.3; armR.rotation.x = -2.6 * q; armR.rotation.z = 0.12 + 0.4 * q; upper.rotation.y = 0.4 * q; }
      else { const q = ease((k - 0.3) / 0.7); armR.rotation.x = -2.6 + 3.2 * q; armR.rotation.z = 0.52 - 0.5 * q; upper.rotation.y = 0.4 - 0.8 * q + 0.4 * Math.max(0, q - 0.7) / 0.3; }
      armL.rotation.x = -0.4;
    } else if (st.casting) {
      const s = Math.sin(t * 12) * 0.12;
      armR.rotation.set(-1.9 + s, 0, -0.35); armL.rotation.set(-1.9 - s, 0, 0.35);
    }
  };
  return R;
}

// ================= гуманоиды =================
function bandit(def) {
  const R = rig({ body: def.color, legs: 0x2a2420, skin: 0xd0a080, w: 0.72, h: 0.85 });
  const dark = lam(0x2a2226, {}, 'cloth');
  // капюшон и маска
  R.neck.add(part(G.cone, dark, [0, 0.28, -0.04], [0.72, 0.75, 0.72]));
  R.neck.add(part(G.box, dark, [0, -0.1, 0.2], [0.5, 0.2, 0.2]));
  eyes(R.neck, 0xffe0a0, 0.04, 0.27, 0.22, 0.05);
  // плащ и пояс с ножами
  R.upper.add(part(G.box, dark, [0, 0.35, -0.24], [0.85, 1.05, 0.06], [0.12, 0, 0]));
  const belt = lam(0x3a2a1a, {}, 'leather');
  R.upper.add(part(G.box, belt, [0, 0.08, 0], [0.76, 0.12, 0.44]));
  const blade = lam(0xc8d0d8, { emissive: 0x303840 });
  for (const hand of [R.handL, R.handR]) {
    hand.add(part(G.box, blade, [0, -0.02, 0.32], [0.05, 0.03, 0.5]));
    hand.add(part(G.box, belt, [0, 0, 0.02], [0.18, 0.06, 0.06]));
  }
  R.g.scale.setScalar(def.size || 1);
  R.g.userData.anim = (t, st) => {
    R.anim(t, st);
    // бросок: левая рука тоже отводится
    if (st.attackT > 0) R.armL.rotation.x = -1.2 * Math.sin(st.attackT * Math.PI);
  };
  return R.g;
}

function dryad(def) {
  const R = rig({ body: def.color, bodyKind: 'bark', skin: 0x8ac070, skinKind: 'bark', w: 0.55, h: 0.95, head: 0.46, robe: true, legH: 0.85, arm: 0.72, armW: 0.8, bareArms: true });
  const leafM = lam(0x3a8a30, { side: THREE.DoubleSide }), bloom = glow(0xffa0e0);
  // волосы-листья
  const hair = grp(0, 0.1, -0.05);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 1.6 - Math.PI * 0.8;
    const l = part(G.leaf, leafM, [Math.sin(a) * 0.2, 0.15, Math.cos(a) * -0.18], [0.45, 0.7, 1], [0.3 - Math.cos(a) * 0.9, a, 0]);
    hair.add(l);
  }
  hair.add(part(G.sph, bloom, [0.18, 0.28, 0.12], 0.12), part(G.sph, bloom, [-0.15, 0.3, 0.1], 0.1));
  R.neck.add(hair);
  eyes(R.neck, 0xc0ffa0, 0.04, 0.23, 0.18, 0.05);
  // юбка из листьев поверх конуса
  const skirt = grp(0, R.hip * 0.55, 0);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; skirt.add(part(G.leaf, leafM, [Math.cos(a) * 0.42, -0.1, Math.sin(a) * 0.42], [0.5, 0.9, 1], [Math.PI, -a + Math.PI / 2, 0.35])); }
  R.g.add(skirt);
  // светящиеся руки
  const orbM = add(0x80ff90, 0.7);
  const orbs = [R.handL, R.handR].map((h) => { const o = part(G.sph, orbM, [0, -0.05, 0], 0.22); h.add(o); return o; });
  R.g.scale.setScalar(def.size || 1);
  R.g.userData.anim = (t, st) => {
    R.anim(t, st);
    // парит: мягкое покачивание
    R.upper.position.y += Math.sin(t * 1.4 + R.off) * 0.05;
    hair.rotation.z = Math.sin(t * 1.3 + R.off) * 0.08;
    const k = st.casting || st.attackT > 0 ? 1.6 : 0.8 + Math.sin(t * 3 + R.off) * 0.2;
    for (const o of orbs) o.scale.setScalar(0.22 * k);
  };
  return R.g;
}

// орки: warrior — топор, archer — лук и колчан, shaman — посох с черепом и перья, chief — рогатый шлем, плащ, тесак
function orc(def) {
  const v = def.variant || 'warrior';
  const chief = v === 'chief', shaman = v === 'shaman';
  const R = rig({ body: chief ? 0x5a2a1a : shaman ? 0x6a5030 : 0x5a4028, legs: 0x3a2a1a, skin: def.color, w: chief ? 1.15 : 1.05, h: 0.95, head: 0.58, legH: 0.72, arm: 0.78, armW: 1.4, legW: 1.3, hunch: shaman ? 0.25 : 0.18, bareArms: true, robe: shaman });
  const skin = R.skinM, bone = lam(0xeee6cc, {}, 'bone'), iron = lam(0x707880, {}, 'plate'), wood = lam(0x5a3a1a, {}, 'bark'), hide = lam(0x7a5a3a, {}, 'fur');
  // голова: челюсть, клыки, уши, брови
  R.neck.add(part(G.box, skin, [0, -0.2, 0.12], [0.5, 0.22, 0.34]));
  R.neck.add(part(G.cone, bone, [-0.15, -0.05, 0.28], [0.07, 0.2, 0.07]), part(G.cone, bone, [0.15, -0.05, 0.28], [0.07, 0.2, 0.07]));
  R.neck.add(part(G.cone4, skin, [-0.32, 0.05, 0], [0.1, 0.35, 0.12], [0, 0, 1.2]), part(G.cone4, skin, [0.32, 0.05, 0], [0.1, 0.35, 0.12], [0, 0, -1.2]));
  R.neck.add(part(G.box, lam(0x2a3a20), [0, 0.12, 0.25], [0.46, 0.07, 0.08]));
  eyes(R.neck, chief ? 0xff4020 : 0xffd040, 0.05, 0.27, 0.22, 0.06);
  // плечи и пояс
  const padM = v === 'warrior' || chief ? iron : hide;
  R.upper.add(part(G.sph, padM, [-0.62, 0.86, 0], [0.5, 0.35, 0.5]), part(G.sph, padM, [0.62, 0.86, 0], [0.5, 0.35, 0.5]));
  R.upper.add(part(G.box, lam(0x3a2a1a, {}, 'leather'), [0, 0.08, 0], [1.1, 0.16, 0.62]));
  if (v === 'warrior' || chief) {
    for (const s of [-1, 1]) R.upper.add(part(G.cone, bone, [s * 0.62, 1.12, 0], [0.1, 0.3, 0.1]));
  }
  if (v === 'warrior') {
    // топор
    R.handR.add(part(G.cyl, wood, [0, 0, 0.45], [0.07, 1.1, 0.07], [Math.PI / 2, 0, 0]));
    R.handR.add(part(G.box, iron, [0, 0.18, 0.9], [0.06, 0.45, 0.32]));
    R.handL.add(part(G.box, wood, [-0.1, -0.1, 0.05], [0.08, 0.7, 0.55])); // деревянный щит
    R.handL.add(part(G.sph, bone, [-0.16, -0.1, 0.05], [0.12, 0.2, 0.18]));
  } else if (v === 'archer') {
    const bow = grp(0, 0, 0.1);
    bow.add(part(G.cyl, wood, [0, 0.45, 0], [0.05, 0.6, 0.05], [0.35, 0, 0]), part(G.cyl, wood, [0, -0.45, 0], [0.05, 0.6, 0.05], [-0.35, 0, 0]));
    bow.add(part(G.box, glow(0xd0c8b0), [0, 0, -0.12], [0.01, 1.4, 0.01]));
    R.handL.add(bow);
    const quiver = part(G.cyl, hide, [0.22, 0.6, -0.36], [0.22, 0.75, 0.22], [0.3, 0, -0.3]);
    for (let i = 0; i < 4; i++) quiver.add(part(G.box, lam(0xd04020), [(i - 1.5) * 0.18, 0.55, 0], [0.12, 0.2, 0.04]));
    R.upper.add(quiver);
    R.neck.add(part(G.box, lam(0xa02018, {}, 'cloth'), [0, 0.1, 0], [0.62, 0.1, 0.62])); // повязка
  } else if (shaman) {
    // посох с черепом, перья, маска
    R.handR.add(part(G.cyl, wood, [0, 0.4, 0.1], [0.06, 1.9, 0.06]));
    R.handR.add(part(G.sph, bone, [0, 1.4, 0.1], [0.3, 0.3, 0.34]));
    const gem = part(G.ico, add(0x70ffd0, 0.9), [0, 1.62, 0.1], 0.22);
    R.handR.add(gem);
    const feathers = grp(0, 0.3, -0.1);
    for (let i = 0; i < 5; i++) feathers.add(part(G.cone4, lam([0xd04020, 0xe0c040, 0x3080d0][i % 3]), [(i - 2) * 0.1, 0.25, 0], [0.08, 0.6, 0.02], [-0.3, 0, (i - 2) * 0.25]));
    R.neck.add(feathers);
    R.neck.add(part(G.box, bone, [0, 0.02, 0.29], [0.4, 0.3, 0.05]));
    // бусы из костей
    for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.2; R.upper.add(part(G.sph, bone, [Math.sin(a) * 0.45, 0.72 - Math.cos(a) * 0.12, 0.3], 0.1)); }
    R.gem = gem;
  } else if (chief) {
    // рогатый шлем, плащ, двуручный тесак
    R.neck.add(part(G.sph, iron, [0, 0.08, -0.02], [0.68, 0.5, 0.68]));
    R.neck.add(part(G.box, iron, [0, 0.02, 0.25], [0.08, 0.3, 0.1])); // наносник
    for (const s of [-1, 1]) R.neck.add(part(G.cone, bone, [s * 0.36, 0.3, 0], [0.12, 0.6, 0.12], [0, 0, -s * 0.9]));
    R.upper.add(part(G.box, lam(0x8a1a12, { side: THREE.DoubleSide }, 'cloth'), [0, 0.3, -0.36], [1.2, 1.5, 0.05], [0.18, 0, 0]));
    R.handR.add(part(G.cyl, wood, [0, 0, 0.3], [0.08, 0.7, 0.08], [Math.PI / 2, 0, 0]));
    R.handR.add(part(G.box, iron, [0, 0.12, 1.1], [0.07, 0.55, 1.1]));
    R.upper.add(part(G.sph, bone, [0, 0.55, 0.32], [0.3, 0.3, 0.2])); // череп на груди
  }
  R.g.scale.setScalar(def.size || 1);
  R.g.userData.anim = (t, st) => {
    R.anim(t, st);
    if (v === 'archer' && !st.moving) { R.armL.rotation.set(-1.45, 0.2, 0); if (st.attackT > 0) R.armR.rotation.set(-1.4, 0, -0.4 * st.attackT); }
    if (R.gem) { R.gem.rotation.y = t * 2; R.gem.scale.setScalar(0.22 * (st.casting ? 1.5 + Math.sin(t * 14) * 0.2 : 1)); }
    if (chief && st.casting) { R.armR.rotation.set(-2.8, 0, 0.2); R.armL.rotation.set(-2.8, 0, -0.2); }
  };
  return R.g;
}

function lizard(def) {
  const R = rig({ body: 0x8a6a3a, bodyKind: 'leather', skin: def.color, skinKind: 'fur', legs: def.color, w: 0.72, h: 0.9, head: 0.42, hunch: 0.35, legH: 0.85, bareArms: true });
  const skin = R.skinM, belly = lam(0xd0c080), wood = lam(0x5a3a1a, {}, 'bark'), iron = lam(0xa0a8b0, {}, 'plate');
  // вытянутая морда, гребень, хвост
  R.neck.add(part(G.box, skin, [0, -0.08, 0.35], [0.3, 0.22, 0.55]));
  R.neck.add(part(G.box, belly, [0, -0.2, 0.3], [0.26, 0.06, 0.48]));
  for (let i = 0; i < 4; i++) R.neck.add(part(G.cone4, lam(0xc04020), [0, 0.28 - i * 0.02, -0.05 - i * 0.14], [0.05, 0.28 - i * 0.04, 0.12]));
  eyes(R.neck, 0xffe020, 0.08, 0.3, 0.34, 0.07);
  R.upper.add(part(G.box, belly, [0, 0.45, 0.2], [0.5, 0.7, 0.06]));
  const tail = grp(0, R.hip + 0.05, -0.25);
  const segs = [];
  let parent = tail;
  for (let i = 0; i < 5; i++) {
    const s = grp(0, 0, i ? -0.3 : 0);
    s.add(part(G.cone, skin, [0, 0, -0.18], [0.3 - i * 0.05, 0.4, 0.3 - i * 0.05], [-Math.PI / 2, 0, 0]));
    parent.add(s); parent = s; segs.push(s);
  }
  tail.rotation.x = 0.35;
  R.g.add(tail);
  // длинное копьё двумя руками
  const spear = grp(0, 0, 0);
  spear.add(part(G.cyl, wood, [0, 0, 0.6], [0.05, 2.6, 0.05], [Math.PI / 2, 0, 0]));
  spear.add(part(G.cone4, iron, [0, 0, 2.05], [0.14, 0.45, 0.06], [Math.PI / 2, 0, 0]));
  R.handR.add(spear);
  R.g.scale.setScalar(def.size || 1);
  R.g.userData.anim = (t, st) => {
    R.anim(t, st);
    segs.forEach((s, i) => { s.rotation.y = Math.sin(t * (st.moving ? 8 : 2) + R.off - i * 0.6) * 0.18; });
    // укол вперёд вместо рубящего удара
    if (st.attackT > 0) { const q = Math.sin(st.attackT * Math.PI); R.armR.rotation.set(-1.5, 0, 0.1); R.armL.rotation.set(-1.4, 0, -0.3); R.upper.position.z = q * 0.35; spear.position.z = q * 0.6; }
    else { R.armR.rotation.x = Math.min(R.armR.rotation.x, -0.9); R.upper.position.z = 0; spear.position.z = 0; }
  };
  return R.g;
}

function cultist(def) {
  const R = rig({ body: def.color, bodyKind: 'robe', skin: 0x9a9a9a, w: 0.7, h: 1.0, head: 0.46, robe: true, legH: 0.85, arm: 0.72 });
  const robe = R.bodyM, trim = lam(0xb08030, { emissive: 0x201000 });
  // глубокий капюшон с тьмой и глазами
  R.neck.add(part(G.cone, robe, [0, 0.2, -0.04], [0.8, 1.0, 0.8]));
  R.neck.add(part(G.sph, glow(0x05030a), [0, 0, 0.1], [0.55, 0.55, 0.5]));
  eyes(R.neck, 0xc070ff, 0.02, 0.36, 0.2, 0.07);
  R.upper.add(part(G.box, trim, [0, 0.5, 0.2], [0.14, 0.95, 0.04]));
  R.upper.add(part(G.cyl, trim, [0, 0.05, 0], [0.78, 0.08, 0.5]));
  // посох с черепом и сферой
  const staff = lam(0x2a1a2a, {}, 'bark');
  R.handR.add(part(G.cyl, staff, [0, 0.35, 0.1], [0.05, 2.0, 0.05]));
  R.handR.add(part(G.sph, lam(0xd8d0b8, {}, 'bone'), [0, 1.35, 0.1], [0.26, 0.26, 0.3]));
  const orb = part(G.sph, add(0xb060ff, 0.85), [0, 1.62, 0.1], 0.2);
  R.handR.add(orb);
  // книга на поясе
  R.upper.add(part(G.box, lam(0x4a1a1a, {}, 'leather'), [0.42, 0.1, 0.15], [0.12, 0.36, 0.28]));
  R.g.scale.setScalar(def.size || 1);
  R.g.userData.anim = (t, st) => {
    R.anim(t, st);
    orb.scale.setScalar(0.2 * (st.casting ? 1.8 + Math.sin(t * 16) * 0.3 : 1 + Math.sin(t * 3) * 0.1));
    R.upper.position.y += Math.sin(t * 1.2 + R.off) * 0.04;
  };
  return R.g;
}

// ================= звери и существа =================
function bee(def) {
  const g = new THREE.Group(), body = grp(0, 1.7, 0);
  const yel = lam(def.color, {}, 'fur'), blk = lam(0x1a1a14, {}, 'fur');
  body.add(part(G.sph, yel, [0, 0, -0.35], [0.55, 0.5, 0.75]));
  body.add(part(G.sph, blk, [0, 0, -0.22], [0.57, 0.52, 0.16]), part(G.sph, blk, [0, 0, -0.48], [0.5, 0.46, 0.14]));
  body.add(part(G.sph, blk, [0, 0.02, 0.12], [0.34, 0.32, 0.36]));
  body.add(part(G.sph, blk, [0, 0.05, 0.38], 0.28));
  body.add(part(G.cone, blk, [0, -0.02, -0.8], [0.08, 0.28, 0.08], [-Math.PI / 2, 0, 0]));
  eyes(body, 0xff3010, 0.1, 0.5, 0.2, 0.08);
  for (const s of [-1, 1]) body.add(part(G.cyl, blk, [s * 0.08, 0.28, 0.45], [0.02, 0.3, 0.02], [0.5, 0, s * 0.4]));
  const wm = add(0xe8f4ff, 0.55);
  const wings = [-1, 1].map((s) => { const w = grp(s * 0.12, 0.22, 0.05); w.add(part(G.wing, wm, [0, 0, 0], [s * 0.8, 0.9, 1], [-Math.PI / 2, 0, 0])); body.add(w); return w; });
  const legs = [];
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const l = part(G.box, blk, [s * 0.18, -0.22, 0.2 - i * 0.14], [0.03, 0.26, 0.03], [0.4, 0, s * 0.5]); body.add(l); legs.push(l); }
  g.add(body);
  g.add(part(G.cyl, glow(0x000000, 0.25), [0, 0.03, 0], [0.7, 0.01, 0.7])); // тень-пятно
  g.scale.setScalar(def.size || 1);
  const off = rnd();
  g.userData.anim = (t, st) => {
    const f = Math.sin(t * 60 + off);
    wings[0].rotation.z = 0.2 + f * 0.6; wings[1].rotation.z = -0.2 - f * 0.6;
    body.position.y = 1.7 + Math.sin(t * 3 + off) * 0.18 - (st.stunned ? 0.9 : 0);
    body.position.x = Math.sin(t * 2.1 + off) * 0.12;
    body.rotation.x = st.moving ? 0.25 : 0;
    // укол жалом: корпус подгибается
    const a = st.attackT > 0 ? Math.sin(st.attackT * Math.PI) : 0;
    body.rotation.x += -a * 0.9; body.position.z = a * 0.3;
    body.rotation.z = -(st.hitT || 0) * 0.5;
  };
  return g;
}

function bat(def) {
  const g = new THREE.Group(), body = grp(0, 2.1, 0);
  const fur = lam(def.color, {}, 'fur'), skin = lam(0x5a3a4a, { side: THREE.DoubleSide });
  body.add(part(G.sph, fur, [0, 0, 0], [0.45, 0.5, 0.6]));
  body.add(part(G.sph, fur, [0, 0.12, 0.34], 0.32));
  for (const s of [-1, 1]) body.add(part(G.cone4, fur, [s * 0.1, 0.36, 0.34], [0.12, 0.3, 0.08], [0, 0, -s * 0.25]));
  eyes(body, 0xff2020, 0.16, 0.5, 0.14, 0.05);
  body.add(part(G.cone, lam(0xeeeeee), [-0.04, 0.02, 0.48], [0.03, 0.08, 0.03], [Math.PI, 0, 0]), part(G.cone, lam(0xeeeeee), [0.04, 0.02, 0.48], [0.03, 0.08, 0.03], [Math.PI, 0, 0]));
  const wings = [-1, 1].map((s) => {
    const w = grp(s * 0.15, 0.05, 0);
    w.add(part(G.wing, skin, [0, 0, 0.3], [s * 1.6, 1.4, 1], [-Math.PI / 2, 0, 0]));
    // пальцы крыла
    for (let i = 0; i < 3; i++) w.add(part(G.box, fur, [s * (0.4 + i * 0.35), 0.01, 0.3 - i * 0.12], [0.8, 0.03, 0.03], [0, s * (0.2 + i * 0.25), 0]));
    body.add(w); return w;
  });
  g.add(body);
  g.add(part(G.cyl, glow(0x000000, 0.25), [0, 0.03, 0], [0.9, 0.01, 0.9]));
  g.scale.setScalar(def.size || 1);
  const off = rnd();
  g.userData.anim = (t, st) => {
    const f = Math.sin(t * (st.moving ? 16 : 11) + off);
    wings[0].rotation.z = f * 0.9; wings[1].rotation.z = -f * 0.9;
    body.position.y = 2.1 + f * 0.15 + Math.sin(t * 1.7 + off) * 0.25 - (st.stunned ? 1.3 : 0);
    const a = st.attackT > 0 ? Math.sin(st.attackT * Math.PI) : 0;
    body.position.y -= a * 0.8; body.position.z = a * 0.5; body.rotation.x = a * 0.6 - (st.hitT || 0) * 0.4;
  };
  return g;
}

function bear(def) {
  const g = new THREE.Group(), fur = lam(def.color, {}, 'fur'), dark = lam(0x2a1a10, {}, 'fur'), claw = lam(0xe8e0d0);
  const body = grp(0, 0.85, 0);
  body.add(part(G.box, fur, [0, 0, 0], [1.05, 0.95, 1.7]));
  body.add(part(G.sph, fur, [0, 0.45, 0.35], [1.0, 0.7, 0.9])); // горб
  const head = grp(0, 0.35, 1.0);
  head.add(part(G.box, fur, [0, 0, 0], [0.62, 0.55, 0.55]));
  head.add(part(G.box, lam(0x8a6a4a, {}, 'fur'), [0, -0.1, 0.35], [0.32, 0.26, 0.32]));
  head.add(part(G.box, glow(0x0a0a0a), [0, -0.02, 0.52], [0.12, 0.08, 0.02]));
  head.add(part(G.sph, dark, [-0.27, 0.32, -0.05], 0.2), part(G.sph, dark, [0.27, 0.32, -0.05], 0.2));
  eyes(head, 0x201008, 0.1, 0.28, 0.3, 0.06);
  // пасть
  const jaw = part(G.box, lam(0x6a2020), [0, -0.24, 0.3], [0.28, 0.06, 0.3]);
  head.add(jaw);
  body.add(head);
  const legs = [];
  for (const [x, z] of [[-0.36, 0.6], [0.36, 0.6], [-0.36, -0.6], [0.36, -0.6]]) {
    const l = grp(x, 0, z);
    l.add(part(G.box, fur, [0, -0.45, 0], [0.34, 0.9, 0.38]));
    l.add(part(G.box, claw, [0, -0.86, 0.2], [0.3, 0.06, 0.12]));
    body.add(l); legs.push(l);
  }
  g.add(body);
  g.scale.setScalar(def.size || 1);
  const off = rnd();
  g.userData.anim = (t, st) => {
    const w = st.moving ? Math.sin(t * 7 + off) : 0;
    legs.forEach((l, i) => { l.rotation.x = w * (i === 0 || i === 3 ? 0.55 : -0.55); });
    body.position.y = 0.85 + Math.abs(w) * 0.05 + Math.sin(t * 1.5 + off) * 0.015;
    body.rotation.x = 0; body.position.z = 0;
    head.rotation.set(Math.sin(t * 1.2 + off) * 0.05, Math.sin(t * 0.7 + off) * 0.15, 0);
    jaw.position.y = -0.24;
    // удар: встаёт на дыбы и бьёт лапами
    if (st.attackT > 0) {
      const k = 1 - st.attackT, up = k < 0.45 ? ease(k / 0.45) : 1 - ease((k - 0.45) / 0.55);
      body.rotation.x = -up * 0.95; body.position.y += up * 0.55;
      legs[0].rotation.x = -up * 1.6; legs[1].rotation.x = -up * 1.2 + (k > 0.45 ? 1.4 * (1 - up) : 0);
      jaw.position.y = -0.24 - up * 0.12;
    }
    body.rotation.z = -(st.hitT || 0) * 0.12 + (st.stunned ? Math.sin(t * 5) * 0.08 : 0);
  };
  return g;
}

function rat(def) {
  const g = new THREE.Group(), fur = lam(def.color, {}, 'fur'), pink = lam(0xd89090);
  const body = grp(0, 0.5, 0);
  body.add(part(G.sph, fur, [0, 0, -0.1], [0.7, 0.55, 1.25]));
  const head = grp(0, 0.08, 0.6);
  head.add(part(G.cone, fur, [0, 0, 0.2], [0.42, 0.62, 0.42], [Math.PI / 2, 0, 0]));
  head.add(part(G.sph, pink, [0, 0, 0.52], 0.08));
  head.add(part(G.cyl, pink, [-0.18, 0.22, -0.05], [0.24, 0.03, 0.24], [Math.PI / 2, 0, 0]), part(G.cyl, pink, [0.18, 0.22, -0.05], [0.24, 0.03, 0.24], [Math.PI / 2, 0, 0]));
  head.add(part(G.box, lam(0xf0e8c0), [0, -0.12, 0.42], [0.08, 0.1, 0.03]));
  eyes(head, 0xff2020, 0.1, 0.24, 0.2, 0.05);
  body.add(head);
  const tail = grp(0, 0, -0.7), tsegs = [];
  let parent = tail;
  for (let i = 0; i < 6; i++) { const s = grp(0, 0, i ? -0.22 : 0); s.add(part(G.cyl, pink, [0, 0, -0.11], [0.07 - i * 0.008, 0.24, 0.07 - i * 0.008], [Math.PI / 2, 0, 0])); parent.add(s); parent = s; tsegs.push(s); }
  body.add(tail);
  const legs = [];
  for (const [x, z] of [[-0.25, 0.35], [0.25, 0.35], [-0.25, -0.4], [0.25, -0.4]]) { const l = grp(x, -0.15, z); l.add(part(G.box, fur, [0, -0.15, 0], [0.12, 0.32, 0.14])); body.add(l); legs.push(l); }
  // шерсть дыбом на спине
  for (let i = 0; i < 5; i++) body.add(part(G.cone4, lam(0x3a3028, {}, 'fur'), [0, 0.28, 0.2 - i * 0.2], [0.1, 0.22, 0.14], [-0.4, 0, 0]));
  g.add(body);
  g.scale.setScalar(def.size || 1);
  const off = rnd();
  g.userData.anim = (t, st) => {
    const w = st.moving ? Math.sin(t * 16 + off) : 0;
    legs.forEach((l, i) => { l.rotation.x = w * (i === 0 || i === 3 ? 0.8 : -0.8); });
    body.position.y = 0.5 + Math.abs(w) * 0.06;
    tsegs.forEach((s, i) => { s.rotation.y = Math.sin(t * 5 + off - i * 0.7) * 0.3; s.rotation.x = 0.08; });
    head.rotation.y = Math.sin(t * 3 + off) * (st.moving ? 0.05 : 0.25);
    const a = st.attackT > 0 ? Math.sin(st.attackT * Math.PI) : 0;
    head.position.z = 0.6 + a * 0.35; head.rotation.x = -a * 0.4;
    body.rotation.x = -(st.hitT || 0) * 0.3;
  };
  return g;
}

// песчаный червь: сегменты из земли, пасть с зубами; burrowed — под землёй, виден только бугор
function worm(def) {
  const g = new THREE.Group(), skin = lam(def.color, {}, 'fur'), belly = lam(0xd8b888), tooth = lam(0xf0ecd8);
  const mound = part(G.sph, lam(0xa88a5a, {}, 'stone'), [0, 0, 0], [2.2, 0.55, 2.2]);
  g.add(mound);
  const rise = grp(0, 0, 0);
  const segs = [];
  let parent = rise;
  for (let i = 0; i < 6; i++) {
    const s = grp(0, i ? 0.62 : 0, 0);
    const r = 0.62 - i * 0.03;
    s.add(part(G.cyl, i % 2 ? skin : belly, [0, 0.31, 0], [r * 2, 0.66, r * 2]));
    s.add(part(G.cyl, lam(0x7a5a3a), [0, 0.64, 0], [r * 2.08, 0.06, r * 2.08]));
    parent.add(s); parent = s; segs.push(s);
  }
  // голова: пасть-кольцо с зубами
  const headG = grp(0, 0.66, 0);
  headG.add(part(G.cyl, skin, [0, 0.15, 0], [1.2, 0.3, 1.2]));
  headG.add(part(G.cyl, glow(0x3a0a08), [0, 0.31, 0], [0.8, 0.02, 0.8]));
  const teeth = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const tt = part(G.cone, tooth, [Math.cos(a) * 0.46, 0.45, Math.sin(a) * 0.46], [0.1, 0.35, 0.1], [Math.sin(a) * -0.5, 0, Math.cos(a) * 0.5]); headG.add(tt); teeth.push(tt); }
  parent.add(headG);
  rise.rotation.x = 0.25;
  g.add(rise);
  g.scale.setScalar(def.size || 1);
  const off = rnd();
  let up = 0; // 0 — под землёй, 1 — снаружи
  g.userData.anim = (t, st, dt = 0.016) => {
    const want = st.burrowed ? 0 : 1;
    up += Math.sign(want - up) * Math.min(Math.abs(want - up), dt * 2.2);
    rise.position.y = -4.2 * (1 - ease(up));
    rise.visible = up > 0.02;
    mound.scale.set(2.2, 0.55 + (st.burrowed && st.moving ? Math.abs(Math.sin(t * 10)) * 0.25 : Math.sin(t * 2 + off) * 0.05), 2.2);
    segs.forEach((s, i) => { s.rotation.z = Math.sin(t * 2 + off + i * 0.7) * 0.12 * up; s.rotation.x = Math.sin(t * 1.6 + off + i) * 0.06; });
    // укус: изгиб вперёд, пасть раскрывается
    const a = st.attackT > 0 ? Math.sin(st.attackT * Math.PI) : 0;
    rise.rotation.x = 0.25 + a * 0.9 - (st.hitT || 0) * 0.25;
    const open = 0.5 + a * 0.6 + (st.casting ? 0.3 : 0);
    teeth.forEach((tt, i) => { const ang = (i / 8) * Math.PI * 2; tt.rotation.set(Math.sin(ang) * -open, 0, Math.cos(ang) * open); });
  };
  return g;
}

// огненный элементаль: светящееся ядро, вращающиеся камни, языки пламени
function elemental(def) {
  const bog = def.variant === 'bog';
  const g = new THREE.Group(), core = grp(0, 1.9, 0);
  const coreM = glow(bog ? 0xb5ffcd : 0xffa030), shell = add(def.color, 0.3), rock = lam(0x3a2a24, { emissive: bog ? 0x164b38 : 0x401000 }, 'stone');
  const heart = part(G.ico, coreM, [0, 0, 0], 0.7);
  core.add(heart, part(G.sph, shell, [0, 0, 0], 1.35));
  const flames = [];
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const f = part(G.cone, add(bog ? (i % 2 ? 0x459d82 : 0x98e4aa) : (i % 2 ? 0xff5010 : 0xffa020), 0.75), [Math.cos(a) * 0.35, 0.6, Math.sin(a) * 0.35], [0.4, 1.3, 0.4], [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3]); core.add(f); flames.push(f); }
  const orbit = grp(0, 0, 0), rocks = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const r = part(G.ico, rock, [Math.cos(a) * 1.2, Math.sin(a * 2) * 0.35, Math.sin(a) * 1.2], 0.38 + (i % 3) * 0.1); orbit.add(r); rocks.push(r); }
  core.add(orbit);
  // кулаки
  const fists = [-1, 1].map((s) => { const f = part(G.ico, rock, [s * 1.25, -0.2, 0.3], 0.5); core.add(f); return f; });
  g.add(core);
  g.add(part(G.cyl, add(bog ? 0x60bd98 : 0xff6010, 0.35), [0, 0.05, 0], [2.4, 0.02, 2.4]));
  g.scale.setScalar(def.size || 1);
  const off = rnd();
  g.userData.anim = (t, st) => {
    core.position.y = 1.9 + Math.sin(t * 2 + off) * 0.15;
    orbit.rotation.y = t * (st.casting ? 3 : 1.2); orbit.rotation.z = Math.sin(t * 0.8) * 0.2;
    heart.rotation.set(t, t * 1.3, 0);
    const pulse = 1 + Math.sin(t * 7 + off) * 0.08 + (st.casting ? 0.25 : 0);
    heart.scale.setScalar(0.7 * pulse);
    flames.forEach((f, i) => { f.scale.y = 1.3 * (0.8 + Math.abs(Math.sin(t * 9 + i * 1.7)) * 0.5); });
    const a = st.attackT > 0 ? Math.sin(st.attackT * Math.PI) : 0;
    fists[0].position.z = 0.3 + a * 1.1; fists[1].position.z = 0.3 + a * 0.4;
    core.rotation.x = -(st.hitT || 0) * 0.3 + a * 0.2;
    for (const r of rocks) r.rotation.x += 0.02;
  };
  return g;
}

// реестр форм: models.js берёт отсюда, если формы нет у себя
export const MOB_SHAPES = { bee, bat, bear, rat, worm, elemental, bandit, dryad, orc, lizard, cultist };

// аура чемпиона: пульсирующее кольцо под ногами (искры вокруг — src/mobai.js)
export function addAura(g, color = 0x4aa0ff) {
  const s = g.scale.x || 1;
  const aura = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.3, 40).rotateX(-Math.PI / 2), add(color, 0.85));
  const inner = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.62, 6).rotateX(-Math.PI / 2), add(0xc0e0ff, 0.7));
  aura.add(ring, inner);
  aura.position.y = 0.08;
  if (s < 1) aura.scale.setScalar(1 / s); // мелким — кольцо не меньше метра
  for (const o of [ring, inner]) o.castShadow = false;
  g.add(aura);
  const base = g.userData.anim;
  g.userData.anim = (t, st, dt) => {
    base?.(t, st, dt);
    const k = 1 + Math.sin(t * 3) * 0.08;
    ring.scale.set(k, 1, k);
    ring.material.opacity = 0.65 + Math.sin(t * 3) * 0.2;
    inner.rotation.y = t * 1.5;
  };
  g.userData.aura = aura;
  return aura;
}
