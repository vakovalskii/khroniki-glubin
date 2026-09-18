import { applyModel, MODEL_OF } from './glb.js';
// Процедурные модели: персонаж, мобы, NPC.
// У каждой модели userData.anim(t, st, dt): процедурная анимация со смешиванием состояний.
// st: moving, speed (0..1), attackT/hitT (1→0), casting, sitting, stunned, dieT (null | секунды после смерти),
//     для NPC — look/lookX/lookZ (куда повернуть голову).
// Всё, что меняется от кадра к кадру, — внутри модели (группа rig), group.rotation.y остаётся за игрой.
import * as THREE from 'three';
import { TEX } from './tex.js';
import { MOB_SHAPES } from './mob-models.js';
import { stepTurn, damp, clamp01, smooth01, spring, angDiff } from './anim.js';

const tx = (k) => (k && TEX[k] ? TEX[k]() : null);
const lam = (color, o = {}, kind) => new THREE.MeshLambertMaterial({ color, map: tx(kind), ...o });
const part = (geo, m, x = 0, y = 0, z = 0) => { const p = new THREE.Mesh(geo, m); p.position.set(x, y, z); p.castShadow = true; return p; };
const grp = (x = 0, y = 0, z = 0, ...kids) => { const g = new THREE.Group(); g.position.set(x, y, z); if (kids.length) g.add(...kids); return g; };
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sph: new THREE.SphereGeometry(0.5, 12, 8),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
  caps: new THREE.CapsuleGeometry(0.35, 0.8, 4, 8),
};
const skin = lam(0xe0b090, {}, 'face');
const GOLD_OPTS = { color: 0xe0b040, emissive: 0x402800 };
// звёздочки оглушения: общий материал без emissive (вспышка попадания его не трогает)
const STAR = new THREE.MeshBasicMaterial({ color: 0xffe060 });
STAR.userData.noFade = true;
// конус мантии: радиус 0.55 внизу (y = 0.30), сужается на 0.55 за 1.5 м
const coneR = (y) => 0.55 * (1 - (y - 0.3) / 1.5) + 0.012;
const TRIM_GEO = [[0.3, 0.4], [0.47, 0.5]].map(([a, b]) => new THREE.CylinderGeometry(coneR(b), coneR(a), b - a, 8, 1, true).translate(0, (a + b) / 2, 0));
const setMap = (m, kind) => { const t = tx(kind); if (m.map !== t) { m.map = t; m.needsUpdate = true; } };
const mix = (a, b, w) => a + (b - a) * w;
const easeOut = (x) => 1 - (1 - x) * (1 - x);
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x));
const TAU = Math.PI * 2;

// anim(t, st, dt): сначала доводим плавный поворот (turnTo), потом поза
// userData.st — последнее состояние (для автотестов); userData.pose — подмена состояния (раскадровка)
const withTurn = (g) => {
  const f = g.userData.anim;
  g.userData.anim = (t, st, dt = 1 / 60) => {
    const u = g.userData;
    u.st = st;
    stepTurn(g, dt);
    f(u.pose ? u.pose.t ?? t : t, u.pose || st, dt < 0 ? 0 : dt > 0.1 ? 0.1 : dt);
  };
  return g;
};

// ---------- общее для всех моделей ----------
// Состояние смешивания: скорость, фаза шага, веса наложений, пружина отдачи
function newBlend(g) {
  return { g, sp: 0, ph: Math.random() * TAU, atk: 0, cast: 0, sit: 0, stun: 0, hit: { x: 0, v: 0 }, lastHit: 0, stepN: 0, dead: false, fade: 1, mats: null, off: Math.random() * TAU, D: { u: 0, f: 0, b: 0, buckle: 0, fade: 1, sink: 0, w: 0 } };
}
// обновить веса по st; freq(sp) — частота шага в рад/с
function blend(S, st, dt, freqMin, freqMax) {
  const goal = st.moving ? (st.speed ?? 1) : 0;
  S.sp = damp(S.sp, goal > 1 ? 1 : goal, 10, dt);
  if (S.sp < 0.002 && !st.moving) S.sp = 0;
  S.ph += dt * (freqMin + (freqMax - freqMin) * S.sp) * (S.sp > 0.02 ? 1 : 0);
  // шаги (для пыли из-под ног): смена полупериода фазы
  const n = Math.floor((S.ph + Math.PI / 2) / Math.PI);
  if (n !== S.stepN) { S.stepN = n; if (S.sp > 0.55) S.g.userData.steps = (S.g.userData.steps || 0) + 1; }
  const h = st.hitT || 0;
  if (h > S.lastHit + 0.05) S.hit.v += 7; // новый удар — толчок пружины
  S.lastHit = h;
  spring(S.hit, dt);
  S.atk = damp(S.atk, st.attackT > 0 ? 1 : 0, 18, dt);
  S.cast = damp(S.cast, st.casting ? 1 : 0, 10, dt);
  S.sit = damp(S.sit, st.sitting && !st.moving ? 1 : 0, 5, dt);
  S.stun = damp(S.stun, st.stunned ? 1 : 0, 8, dt);
  // поворот → крен в сторону поворота (только на ходу)
  const yv = S.g.userData.yawVel || 0;
  S.roll = Math.max(-0.18, Math.min(0.18, -yv * 0.035 * S.sp));
}
// прозрачность всей модели (затухание после смерти); материалы собираем один раз на смерть
function setFade(S, op) {
  if (op === S.fade) return;
  if (!S.mats) {
    S.mats = [];
    S.g.traverse((o) => { const m = o.material; if (m && !m.userData.noFade && !S.mats.includes(m)) { m.userData.op0 ??= m.opacity; m.userData.tr0 ??= m.transparent; S.mats.push(m); } });
  }
  for (const m of S.mats) {
    const tr = op < 0.999 || m.userData.tr0;
    if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
    m.opacity = m.userData.op0 * op;
  }
  S.fade = op;
  if (op >= 1) S.mats = null;
}
// смерть: dieT → { f: 0..1 падение (с отскоком), fade: 1..0 }. Мобы затухают, игроки лежат.
const FALL_AT = 0.28, FALL_T = 0.55, FADE_AT = 1.3, FADE_T = 1.0;
function deathK(S, st, rig, ownFade = false) {
  const d = st.dieT;
  if (d == null) {
    if (S.dead) { S.dead = false; setFade(S, 1); rig.visible = true; }
    return null;
  }
  S.dead = true;
  const u = clamp01((d - FALL_AT) / FALL_T);
  const f = u * u; // падение с ускорением
  const b = d > FALL_AT + FALL_T ? Math.exp(-(d - FALL_AT - FALL_T) * 9) * Math.sin((d - FALL_AT - FALL_T) * 24) : 0; // отскок
  const buckle = smooth01(0, FALL_AT, d);
  let fade = 1;
  if (S.g.userData.fadeOnDeath && !ownFade) {
    fade = 1 - smooth01(FADE_AT, FADE_AT + FADE_T, d);
    setFade(S, Math.max(0, fade));
    rig.visible = fade > 0.01;
  }
  const D = S.D;
  D.u = u; D.f = f; D.b = b; D.buckle = buckle; D.fade = fade; D.sink = 1 - fade; D.w = smooth01(0, 0.12, d);
  return D;
}
// звёздочки над головой
function makeStars(y) {
  const g = grp(0, y, 0);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(G.box, STAR); const a = (i / 3) * TAU;
    s.position.set(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35); s.scale.setScalar(0.12); s.rotation.set(0.6, a, 0.6);
    g.add(s);
  }
  g.visible = false;
  return g;
}
function animStars(stars, S, t) {
  stars.visible = S.stun > 0.05 && !S.dead;
  if (!stars.visible) return;
  stars.rotation.y = t * 4;
  stars.position.y = stars.userData.y0 + Math.sin(t * 5) * 0.05;
  stars.scale.setScalar(S.stun);
}
function starsAt(rig, y) { const s = makeStars(y); s.userData.y0 = y; rig.add(s); return s; }

// ---------- гуманоид ----------
// тело, голова, руки (плечо + предплечье, правая — с оружием), ноги (бедро + голень); шлем, перчатки, сапоги, щит — по экипировке
const HIP_Y = 0.8;
const AP = { aRx: 0, aRz: 0, eR: 0, aLx: 0, aLz: 0, eL: 0, uX: 0, uY: 0, pz: 0, wX: 0, lL: 0, lR: 0 }; // поза атаки (без аллокаций в кадре)
function humanoid(color, { robe = false, scale = 1, weaponColor = 0xa0a0a0, staff = false, skull = false, bodyKind = 'cloth', heavy = false, glow = 0x80c8ff } = {}) {
  const g = new THREE.Group();
  const rig = new THREE.Group();
  const upper = grp(0, HIP_Y, 0); // корпус вращается вокруг таза
  const body = lam(color, {}, robe ? 'robe' : bodyKind);
  const torso = part(G.box, body, 0, 1.25 - HIP_Y, 0);
  const setTorso = (r) => {
    torso.geometry = r ? G.cone : G.box;
    if (r) torso.scale.set(1.1, 1.5, 1.1); else torso.scale.set(0.8, 0.9, 0.45);
    torso.userData.sx = torso.scale.x; torso.userData.sz = torso.scale.z;
    torso.position.y = (r ? 1.05 : 1.25) - HIP_Y;
    legL.visible = legR.visible = !r;
    trim.visible = r;
    isRobe = r;
  };
  let isRobe = robe;
  // золотая кайма по низу мантии (повторяет конус)
  const gold = new THREE.MeshLambertMaterial(GOLD_OPTS);
  const trim = grp(0, -HIP_Y, 0, part(TRIM_GEO[0], gold), part(TRIM_GEO[1], gold));
  // голова и шлем поворачиваются вместе
  const headG = grp(0, 2.0 - HIP_Y, 0);
  const head = part(G.sph, skull ? lam(0xeeeadc, {}, 'bone') : skin.clone(), 0, 0, 0); head.scale.setScalar(0.55);
  headG.add(head);
  // ноги: бедро → колено → голень и стопа
  const legM = lam(0x3a3028, {}, 'cloth'), footM = lam(0x2a221c, {}, 'leather');
  const mkLeg = (x) => {
    const hip = grp(x, HIP_Y, 0), knee = grp(0, -0.4, 0);
    const th = part(G.box, legM, 0, -0.2, 0); th.scale.set(0.28, 0.42, 0.3);
    const sh = part(G.box, legM, 0, -0.2, 0); sh.scale.set(0.26, 0.42, 0.28);
    const f = part(G.box, footM, 0, -0.36, 0.06); f.scale.set(0.3, 0.14, 0.42);
    knee.add(sh, f); hip.add(th, knee); hip.userData.knee = knee;
    return hip;
  };
  const legL = mkLeg(-0.2), legR = mkLeg(0.2);
  const kneeL = legL.userData.knee, kneeR = legR.userData.knee;
  // руки: плечо → локоть → предплечье и кисть
  const handM = lam(0xe0b090);
  const glowM = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  glowM.userData.noFade = true;
  const mkArm = (x) => {
    const sh = grp(x, 1.6 - HIP_Y, 0), el = grp(0, -0.33, 0);
    const a = part(G.box, body, 0, -0.165, 0); a.scale.set(0.22, 0.36, 0.22);
    const fa = part(G.box, body, 0, -0.165, 0); fa.scale.set(0.2, 0.34, 0.2);
    const h = part(G.box, handM, 0, -0.37, 0); h.scale.set(0.2, 0.16, 0.2);
    const gl = new THREE.Mesh(G.sph, glowM); gl.position.y = -0.4; gl.scale.setScalar(0.4); gl.visible = false;
    el.add(fa, h, gl); sh.add(a, el); sh.userData.el = el; sh.userData.glow = gl;
    return sh;
  };
  const armL = mkArm(-0.55), armR = mkArm(0.55);
  const elL = armL.userData.el, elR = armR.userData.el;
  // шлем / капюшон
  const helm = grp(0, 0, 0); helm.visible = false;
  const helmM = lam(0x808080, {}, 'plate');
  const cap = part(G.sph, helmM, 0, 0.06, 0); cap.scale.set(0.62, 0.5, 0.62);
  const brim = part(G.cyl, helmM, 0, -0.02, 0); brim.scale.set(0.66, 0.06, 0.66);
  const hat = part(G.cone, helmM, 0, 0.45, 0); hat.scale.set(0.6, 0.7, 0.6);
  helm.add(cap, brim, hat);
  headG.add(helm);
  // щит
  const shield = part(G.box, lam(0x808080, {}, 'plate'), -0.16, -0.12, 0.05); shield.scale.set(0.08, 0.75, 0.6); shield.visible = false;
  elL.add(shield);
  // оружие
  const weapon = grp(0, -0.39, 0.1); elR.add(weapon);
  let isStaffW = staff;
  const setWeapon = (wc, isStaff, ench = 0) => {
    weapon.clear();
    isStaffW = !!isStaff;
    if (wc === null || wc === undefined) return;
    const glowK = ench >= 4 ? Math.min(1.6, 0.4 + (ench - 4) * 0.15) : 0.15;
    const wm = lam(wc, { emissive: ench >= 4 ? 0xffffff : wc, emissiveIntensity: ench >= 4 ? glowK * 0.35 : 0.15 });
    let blade;
    if (isStaff) { const st = part(G.cyl, lam(0x5a3a1a, {}, 'bark'), 0, 0, 0.5); st.scale.set(0.08, 2.2, 0.08); st.rotation.x = Math.PI / 2; weapon.add(st); blade = part(G.sph, wm, 0, 0, 1.6); blade.scale.setScalar(0.3); }
    else { blade = part(G.box, wm, 0, 0, 0.75); blade.scale.set(0.08, 0.05, 1.4); const h = part(G.box, lam(0x4a3a2a), 0, 0, 0); h.scale.set(0.35, 0.08, 0.08); weapon.add(h); }
    weapon.add(blade);
    // заточка +7 и выше — светящийся ореол
    if (ench >= 7) {
      const aura = new THREE.Mesh(blade.geometry, new THREE.MeshBasicMaterial({ color: ench >= 12 ? 0xff60ff : ench >= 10 ? 0xffa030 : 0x60c0ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      aura.position.copy(blade.position); aura.scale.copy(blade.scale).multiply(new THREE.Vector3(isStaff ? 1.6 : 3.2, isStaff ? 1.6 : 4, isStaff ? 1.6 : 1.08));
      aura.userData.aura = true; weapon.add(aura);
    }
  };
  setWeapon(weaponColor, staff);
  setTorso(robe);
  upper.add(torso, trim, headG, armL, armR);
  const stars = starsAt(rig, 2.55);
  rig.add(upper, legL, legR);
  g.add(rig);
  g.scale.setScalar(scale);
  g.userData.setWeapon = setWeapon; g.userData.weaponGroup = weapon; // лук/древковое — src/weapon-models.js
  g.userData.setBody = (c, r, kind) => { body.color.setHex(c); if (r !== undefined) setTorso(r); setMap(body, r ? 'robe' : kind || bodyKind); };
  g.userData.setGear = ({ head: hc, legs, gloves, feet, shield: sc, helmKind, shieldKind, legKind }) => {
    setMap(helmM, helmKind === 'apprentice' || helmKind === 'mystic' ? 'cloth' : helmKind === 'leather' ? 'leather' : 'plate');
    setMap(shield.material, shieldKind || 'plate');
    setMap(legM, legKind || 'cloth');
    setMap(handM, gloves != null ? (legKind === 'chain' || legKind === 'plate' ? 'plate' : 'leather') : null);
    helm.visible = hc !== undefined; if (hc !== undefined) helmM.color.setHex(hc);
    const soft = helmKind === 'apprentice' || helmKind === 'mystic';
    cap.visible = true; brim.visible = soft; hat.visible = soft;
    legM.color.setHex(legs ?? 0x3a3028);
    handM.color.setHex(gloves ?? 0xe0b090);
    footM.color.setHex(feet ?? 0x2a221c);
    shield.visible = sc !== undefined; if (sc !== undefined) shield.material.color.setHex(sc);
  };

  const S = newBlend(g);
  const shake = { x: 0, v: 0 };
  let lastStep = 0, look = 0, lookTw = 0;
  g.userData.anim = (t, st, dt) => {
    blend(S, st, dt, heavy ? 4.5 : 5, heavy ? 8 : 11.5);
    const sp = S.sp, run = smooth01(0.45, 0.95, sp), mv = clamp01(sp * 2.5), idle = 1 - mv;
    const ph = S.ph, sn = Math.sin(ph), cs = Math.cos(ph), off = S.off;
    const br = Math.sin(t * 1.9 + off); // дыхание
    // тяжёлый шаг голема: тряска на каждом шаге
    if (heavy && (g.userData.steps || 0) !== lastStep) { lastStep = g.userData.steps; shake.v -= 2.5; }
    const sk = heavy ? spring(shake, dt, 260, 18) : 0;

    // ---- база: покой ↔ шаг ↔ бег ----
    const A = mv * mix(0.45, 0.85, run) * (heavy ? 0.8 : 1);
    let lLx = sn * A, lRx = -sn * A, lLz = 0, lRz = 0;
    const kb = mix(0.35, 1.25, run);
    let kL = mv * (0.08 + kb * Math.max(0, -cs)), kR = mv * (0.08 + kb * Math.max(0, cs));
    const Aa = mv * mix(0.4, 0.85, run) * (heavy ? 0.6 : 1);
    let aLx = -sn * Aa, aRx = sn * Aa;
    let aLz = -0.08 - idle * (0.02 + br * 0.015), aRz = 0.08 + idle * (0.02 + br * 0.015);
    let eL = -(0.12 + 1.0 * run) * mv - idle * 0.12, eR = eL;
    let uX = mv * (0.05 + 0.17 * run) + (heavy ? 0.06 : 0), uY = sn * mv * (0.07 + 0.08 * run), uZ = 0;
    let rigY = mv * ((heavy ? 0.1 : mix(0.035, 0.08, run)) * (Math.abs(cs) - 0.5)) + idle * br * 0.008 + sk * 0.06;
    let rigX = 0, rigZ = S.roll + sn * mv * (heavy ? 0.07 : 0.025) + idle * Math.sin(t * 0.47 + off) * 0.012 + sk * 0.02, rigPz = 0, rigPy = 0;
    let hX = -uX * 0.6 + idle * br * 0.02, hY = idle * Math.sin(t * 0.31 + off) * Math.sin(t * 0.13 + off * 2) * 0.35, hZ = 0;
    let wX = 0, glowOp = 0;
    const breathe = 1 + idle * br * 0.018;

    // ---- голова к собеседнику (NPC) ----
    if (st.look) {
      const rel = angDiff(g.rotation.y, Math.atan2(st.lookX - g.position.x, st.lookZ - g.position.z));
      lookTw = damp(lookTw, 1, 4, dt);
      look = damp(look, Math.max(-1.9, Math.min(1.9, rel)), 5, dt);
    } else { lookTw = damp(lookTw, 0, 3, dt); look = damp(look, 0, 3, dt); }
    if (lookTw > 0.001) {
      const lh = Math.max(-1.1, Math.min(1.1, look)), lu = (look - lh) * 0.8;
      hY = mix(hY, lh, lookTw); uY += lu * lookTw; hX -= 0.06 * lookTw;
    }

    // ---- атака: замах → удар → возврат ----
    if (S.atk > 0.001) {
      const k = 1 - Math.min(1, Math.max(0, st.attackT || 0));
      const a = AP;
      a.aRx = 0; a.aRz = 0.1; a.eR = -0.2; a.aLx = -0.3; a.aLz = -0.2; a.eL = -0.5; a.uX = 0.05; a.uY = 0; a.pz = 0; a.wX = 0; a.lL = 0; a.lR = 0;
      if (!isStaffW) {
        // меч: диагональный удар сверху
        if (k < 0.3) { const q = easeOut(k / 0.3); a.aRx = -2.6 * q; a.aRz = mix(0.1, 0.55, q); a.eR = mix(-0.2, -0.7, q); a.wX = 0.95 * q; a.uY = 0.5 * q; a.uX = mix(0.05, -0.06, q); a.lL = -0.25 * q; a.lR = 0.2 * q; }
        else if (k < 0.55) { const q = easeInOut((k - 0.3) / 0.25); a.aRx = mix(-2.6, -0.25, q); a.aRz = mix(0.55, -0.35, q); a.eR = mix(-0.7, -0.08, q); a.uY = mix(0.5, -0.5, q); a.uX = mix(-0.06, 0.24, q); a.pz = 0.18 * q; a.wX = mix(0.95, -0.25, q); a.lL = mix(-0.25, -0.45, q); a.lR = mix(0.2, 0.35, q); }
        else { const q = smooth01(0, 1, (k - 0.55) / 0.45); a.aRx = mix(-0.25, 0, q); a.aRz = mix(-0.35, 0.1, q); a.eR = mix(-0.08, -0.2, q); a.uY = mix(-0.5, 0, q); a.uX = mix(0.24, 0.05, q); a.pz = 0.18 * (1 - q); a.wX = -0.25 * (1 - q); a.lL = -0.45 * (1 - q); a.lR = 0.35 * (1 - q); }
      } else {
        // посох: отвести назад → выпад вперёд, навершие на цель
        a.aLx = -0.9; a.aLz = 0.35; a.eL = -0.9;
        if (k < 0.3) { const q = easeOut(k / 0.3); a.aRx = mix(0, 0.45, q); a.eR = mix(-0.2, -1.5, q); a.wX = mix(0, 1.2, q); a.uY = 0.35 * q; a.uX = mix(0.05, -0.1, q); a.lR = 0.2 * q; }
        else if (k < 0.5) { const q = easeInOut((k - 0.3) / 0.2); a.aRx = mix(0.45, -1.45, q); a.eR = mix(-1.5, 0, q); a.wX = mix(1.2, 1.45, q); a.uY = mix(0.35, -0.3, q); a.uX = mix(-0.1, 0.25, q); a.pz = 0.15 * q; a.lL = -0.35 * q; a.lR = mix(0.2, 0.3, q); }
        else { const q = smooth01(0, 1, (k - 0.5) / 0.5); a.aRx = mix(-1.45, 0, q); a.eR = mix(0, -0.2, q); a.wX = 1.45 * (1 - q); a.uY = -0.3 * (1 - q); a.uX = mix(0.25, 0.05, q); a.pz = 0.15 * (1 - q); a.lL = -0.35 * (1 - q); a.lR = 0.3 * (1 - q); }
        glowOp = Math.max(glowOp, (k > 0.3 && k < 0.8 ? Math.sin(((k - 0.3) / 0.5) * Math.PI) : 0) * 0.8);
      }
      const w = S.atk, still = w * (1 - mv);
      aRx = mix(aRx, a.aRx, w); aRz = mix(aRz, a.aRz, w); eR = mix(eR, a.eR, w);
      aLx = mix(aLx, a.aLx, w); aLz = mix(aLz, a.aLz, w); eL = mix(eL, a.eL, w);
      uX = mix(uX, a.uX + mv * 0.15, w); uY = mix(uY, a.uY, w); wX = mix(wX, a.wX, w);
      rigPz += a.pz * still;
      lLx = mix(lLx, a.lL, still); lRx = mix(lRx, a.lR, still); kL = mix(kL, 0.25, still); kR = mix(kR, 0.3, still);
      rigY -= 0.05 * still;
    }
    // ---- каст: руки вверх, свечение в ладонях ----
    if (S.cast > 0.001) {
      const w = S.cast * (1 - S.atk), wv = Math.sin(t * 6), wv2 = Math.cos(t * 5);
      aRx = mix(aRx, -2.35 + wv * 0.12, w); aRz = mix(aRz, -0.35 + wv2 * 0.08, w); eR = mix(eR, -0.35, w);
      aLx = mix(aLx, -2.35 - wv * 0.12, w); aLz = mix(aLz, 0.35 - wv2 * 0.08, w); eL = mix(eL, -0.35, w);
      uX = mix(uX, -0.1, w); hX = mix(hX, -0.25, w); wX = mix(wX, 1.0, w);
      lLz = mix(lLz, -0.08, w * (1 - mv)); lRz = mix(lRz, 0.08, w * (1 - mv));
      rigY += w * 0.03 * Math.sin(t * 3);
      glowOp = Math.max(glowOp, S.cast * (0.55 + 0.3 * Math.sin(t * 14)));
    }
    // ---- сидит на земле: колени вверх, руки на коленях ----
    if (S.sit > 0.001) {
      const w = S.sit;
      lLx = mix(lLx, -2.0, w); lRx = mix(lRx, -2.0, w); lLz = mix(lLz, -0.28, w); lRz = mix(lRz, 0.28, w);
      kL = mix(kL, 1.75, w); kR = mix(kR, 1.75, w);
      aLx = mix(aLx, -0.75, w); aRx = mix(aRx, -0.75, w); eL = mix(eL, -0.55, w); eR = mix(eR, -0.55, w);
      aLz = mix(aLz, -0.25, w); aRz = mix(aRz, 0.25, w);
      uX = mix(uX, 0.12 + br * 0.02, w); uY = mix(uY, 0, w); hX = mix(hX, -0.05, w); wX = mix(wX, 1.1, w);
      rigY = mix(rigY, -(isRobe ? 0.55 : 0.62), w);
    }
    // ---- оглушение: шатается, руки висят ----
    if (S.stun > 0.001) {
      const w = S.stun, s1 = Math.sin(t * 3.2), c1 = Math.cos(t * 3.2);
      uZ += s1 * 0.13 * w; uX = mix(uX, 0.15 + c1 * 0.07, w);
      hZ += Math.sin(t * 3.2 + 1) * 0.22 * w; hX = mix(hX, 0.2, w);
      aLx = mix(aLx, 0.1 + s1 * 0.2, w); aRx = mix(aRx, 0.1 - s1 * 0.2, w); eL = mix(eL, -0.1, w); eR = mix(eR, -0.1, w);
      aLz = mix(aLz, -0.2 - c1 * 0.1, w); aRz = mix(aRz, 0.2 - c1 * 0.1, w);
      kL = mix(kL, 0.3, w); kR = mix(kR, 0.3, w); lLx = mix(lLx, -0.15, w); lRx = mix(lRx, -0.15, w);
      rigY -= 0.08 * w; rigZ += s1 * 0.04 * w;
    }
    // ---- отдача при попадании (пружина) ----
    const hit = S.hit.x;
    uX -= hit * 0.35; hX -= hit * 0.35; rigPz -= hit * 0.08;
    aLz -= hit * 0.3; aRz += hit * 0.3;

    // ---- смерть: колени подгибаются → падение на спину → отскок; мобы затухают ----
    const D = deathK(S, st, rig);
    if (D) {
      const w = D.w, bu = D.buckle, f = D.f;
      const lx = mix(-0.5 * bu, -0.15, f), kk = mix(0.95 * bu, 0.12, f);
      lLx = mix(lLx, lx, w); lRx = mix(lRx, lx + 0.1 * f, w); lLz = mix(lLz, -0.15 * f, w); lRz = mix(lRz, 0.15 * f, w);
      kL = mix(kL, kk, w); kR = mix(kR, kk + 0.15 * f, w);
      uX = mix(uX, mix(0.3 * bu, -0.1, f), w); uY = mix(uY, 0, w); uZ *= 1 - w;
      aLx = mix(aLx, mix(0.2 * bu, -0.35, f), w); aRx = mix(aRx, mix(0.2 * bu, -0.2, f), w);
      aLz = mix(aLz, -1.15 * f, w); aRz = mix(aRz, 1.0 * f, w); eL = mix(eL, -0.2, w); eR = mix(eR, -0.35, w);
      hX = mix(hX, mix(0.45 * bu, -0.35, f), w); hY = mix(hY, 0.3 * f, w); hZ *= 1 - w;
      // лёжа чуть приподнят (-1.47, а не -π/2): на склоне тело не уходит в землю
      rigX = -1.47 * f + D.b * 0.14;
      rigY = mix(rigY, mix(-0.28 * bu, 0.3, f) - D.sink * 0.35, w); rigZ *= 1 - w; rigPz *= 1 - w;
      glowOp = 0;
    }

    // ---- применяем ----
    rig.position.set(0, rigY + rigPy, rigPz);
    rig.rotation.set(rigX, 0, rigZ);
    legL.rotation.set(lLx, 0, lLz); legR.rotation.set(lRx, 0, lRz);
    kneeL.rotation.x = kL; kneeR.rotation.x = kR;
    upper.rotation.set(uX, uY, uZ);
    armL.rotation.set(aLx, 0, aLz); armR.rotation.set(aRx, 0, aRz);
    elL.rotation.x = eL; elR.rotation.x = eR;
    headG.rotation.set(hX, hY, hZ);
    weapon.rotation.x = wX;
    torso.scale.x = torso.userData.sx * breathe; torso.scale.z = torso.userData.sz * breathe;
    const gl = glowOp > 0.01, gs = 0.36 + 0.06 * Math.sin(t * 17);
    armL.userData.glow.visible = armR.userData.glow.visible = gl;
    if (gl) { glowM.opacity = glowOp; armL.userData.glow.scale.setScalar(gs); armR.userData.glow.scale.setScalar(gs); }
    animStars(stars, S, t);
    const fade = S.fade;
    for (const a of weapon.children) if (a.userData.aura) a.material.opacity = (0.25 + Math.sin(t * 4) * 0.1) * fade;
  };
  return g;
}

// ---------- зверь (волк, кабан): рысь ↔ галоп, выпад ----------
const TROT = [0, 0.5, 0.5, 0], GALLOP = [0, 0.12, 0.55, 0.68]; // доли цикла: ПЛ, ПП, ЗЛ, ЗП
function beast(color, size) {
  const g = new THREE.Group(), rig = new THREE.Group(), m = lam(color, {}, 'fur');
  const body = part(G.box, m, 0, 0.7, 0); body.scale.set(0.7, 0.6, 1.4);
  const headG = grp(0, 0.9, 0.55);
  const head = part(G.box, m, 0, 0.05, 0.3); head.scale.set(0.5, 0.45, 0.6);
  const eyes = part(G.box, lam(0xff3020, { emissive: 0xff2010, emissiveIntensity: 0.6 }), 0, 0.12, 0.61); eyes.scale.set(0.35, 0.06, 0.02);
  const snout = part(G.box, m, 0, -0.06, 0.66); snout.scale.set(0.3, 0.22, 0.2);
  headG.add(head, eyes, snout);
  const tail = grp(0, 0.88, -0.68); const tp = part(G.box, m, 0, 0, -0.28); tp.scale.set(0.12, 0.12, 0.55); tail.add(tp);
  const legs = [];
  for (const [x, z] of [[-0.25, 0.5], [0.25, 0.5], [-0.25, -0.5], [0.25, -0.5]]) {
    const l = grp(x, 0.45, z), low = grp(0, -0.22, 0);
    const p = part(G.box, m, 0, -0.11, 0); p.scale.set(0.16, 0.24, 0.16);
    const p2 = part(G.box, m, 0, -0.11, 0); p2.scale.set(0.14, 0.24, 0.14);
    low.add(p2); l.add(p, low); l.userData.low = low; legs.push(l); rig.add(l);
  }
  const stars = starsAt(rig, 1.55);
  rig.add(body, headG, tail);
  g.add(rig);
  g.scale.setScalar(size);
  const S = newBlend(g);
  g.userData.anim = (t, st, dt) => {
    blend(S, st, dt, 6, 15);
    const sp = S.sp, run = smooth01(0.4, 0.9, sp), mv = clamp01(sp * 2.5), idle = 1 - mv, ph = S.ph, off = S.off;
    const br = Math.sin(t * 2.1 + off);
    const A = mv * mix(0.45, 0.8, run);
    let rigX = mv * run * Math.sin(ph) * 0.13, rigY = mv * mix(0.02, 0.09, run) * (0.5 + 0.5 * Math.sin(ph - 0.6)), rigPz = 0, rigZ = S.roll;
    let hX = idle * Math.sin(t * 1.3 + off) * 0.05 + mv * run * Math.cos(ph) * 0.1, hY = idle * Math.sin(t * 0.4 + off) * Math.sin(t * 0.23) * 0.45;
    let front = 0;
    for (let i = 0; i < 4; i++) {
      const p = ph + mix(TROT[i], GALLOP[i], run) * TAU, s = Math.sin(p);
      legs[i].rotation.x = s * A + (i < 2 ? front : 0);
      // колено сгибается при выносе ноги вперёд
      legs[i].userData.low.rotation.x = mv * Math.max(0, -Math.cos(p)) * (i < 2 ? -0.9 : 0.9);
    }
    tail.rotation.set(mix(-0.55, -0.1, run) + idle * br * 0.03, Math.sin(t * (5 + 7 * sp) + off) * mix(0.35, 0.12, run), 0);
    // выпад: присесть назад → бросок вперёд с укусом → назад
    if (S.atk > 0.001) {
      const k = 1 - Math.min(1, Math.max(0, st.attackT || 0));
      let pz, py, px, hx, fr;
      if (k < 0.35) { const q = easeOut(k / 0.35); pz = -0.18 * q; py = -0.1 * q; px = 0.08 * q; hx = 0.3 * q; fr = -0.2 * q; }
      else if (k < 0.6) { const q = easeInOut((k - 0.35) / 0.25); pz = mix(-0.18, 0.5, q); py = mix(-0.1, 0.06, q); px = mix(0.08, -0.22, q); hx = mix(0.3, -0.55, q); fr = mix(-0.2, -0.7, q); }
      else { const q = smooth01(0, 1, (k - 0.6) / 0.4); pz = 0.5 * (1 - q); py = 0.06 * (1 - q); px = -0.22 * (1 - q); hx = -0.55 * (1 - q); fr = -0.7 * (1 - q); }
      const w = S.atk;
      rigPz += pz * w; rigY += py * w; rigX = mix(rigX, px, w); hX = mix(hX, hx, w);
      legs[0].rotation.x += fr * w; legs[1].rotation.x += fr * w;
    }
    // оглушение: качается, голова опущена
    if (S.stun > 0.001) { const w = S.stun; rigZ += Math.sin(t * 3) * 0.1 * w; hX = mix(hX, 0.35, w); hY += Math.sin(t * 2.3) * 0.25 * w; rigY -= 0.06 * w; }
    const hit = S.hit.x;
    rigPz -= hit * 0.2; hX -= hit * 0.35; rigX -= hit * 0.12;
    body.scale.y = 0.6 * (1 + idle * br * 0.03);
    // смерть: заваливается на бок, лапы дёргаются
    const D = deathK(S, st, rig);
    if (D) {
      const w = D.w;
      rigZ = mix(rigZ, 1.5708 * D.f + D.b * 0.12, w); rigX *= 1 - w; rigPz *= 1 - w;
      rigY = mix(rigY, 0.3 * D.f - 0.1 * D.buckle * (1 - D.f) - D.sink * 0.3, w);
      hX = mix(hX, -0.2 * D.f, w); hY *= 1 - w;
      const tw = Math.exp(-(st.dieT || 0) * 3) * Math.sin((st.dieT || 0) * 30) * 0.3;
      for (let i = 0; i < 4; i++) { legs[i].rotation.x = mix(legs[i].rotation.x, (i % 2 ? 0.25 : -0.15) + tw * (i < 2 ? 1 : -1), w); legs[i].userData.low.rotation.x *= 1 - w; }
    }
    rig.position.set(0, rigY, rigPz);
    rig.rotation.set(rigX, 0, rigZ);
    headG.rotation.set(hX, hY, 0);
    animStars(stars, S, t);
  };
  return g;
}

// ---------- зверёк (кролик): прыжки со сжатием ----------
function critter(color, size) {
  const g = new THREE.Group(), rig = new THREE.Group(), m = lam(color, {}, 'fur');
  const bodyG = grp(0, 0.35, 0);
  const body = part(G.sph, m, 0, 0, 0); body.scale.set(0.6, 0.55, 0.8);
  bodyG.add(body);
  const headG = grp(0, 0.2, 0.35);
  const head = part(G.sph, m, 0, 0, 0); head.scale.setScalar(0.38);
  const earL = grp(-0.08, 0.14, -0.05), earR = grp(0.08, 0.14, -0.05);
  const e1 = part(G.box, m, 0, 0.16, 0); e1.scale.set(0.07, 0.35, 0.05); earL.add(e1);
  const e2 = part(G.box, m, 0, 0.16, 0); e2.scale.set(0.07, 0.35, 0.05); earR.add(e2);
  const tail = part(G.sph, lam(0xf0ece0, {}, 'fur'), 0, 0.05, -0.4); tail.scale.setScalar(0.18);
  headG.add(head, earL, earR);
  bodyG.add(headG, tail);
  const stars = starsAt(rig, 1.15);
  rig.add(bodyG);
  g.add(rig);
  g.scale.setScalar(size);
  const S = newBlend(g);
  const ear = { x: 0, v: 0 };
  let prevY = 0;
  g.userData.anim = (t, st, dt) => {
    blend(S, st, dt, 7, 14);
    const mv = clamp01(S.sp * 3), idle = 1 - mv, off = S.off;
    const u = (((S.ph % Math.PI) + Math.PI) % Math.PI) / Math.PI; // 0..1 — один прыжок
    const air = Math.sin(u * Math.PI);
    let y = mv * air * mix(0.18, 0.4, S.sp);
    const land = mv * Math.pow(1 - air, 6); // сжатие у земли
    let px = -mv * Math.cos(u * Math.PI) * 0.28, pz = 0, rz = S.roll;
    let hX = idle * (Math.sin(t * 0.9 + off) > 0.8 ? 0.25 : 0), hY = idle * Math.sin(t * 0.5 + off) * 0.4;
    // атака: боднуть
    if (S.atk > 0.001) {
      const k = 1 - Math.min(1, Math.max(0, st.attackT || 0));
      const back = k < 0.35 ? easeOut(k / 0.35) : 1 - smooth01(0.35, 0.55, k);
      const fwd = k < 0.35 ? 0 : k < 0.55 ? easeInOut((k - 0.35) / 0.2) : 1 - smooth01(0.55, 1, k);
      pz += (-0.12 * back + 0.4 * fwd) * S.atk; px += (-0.2 * back + 0.35 * fwd) * S.atk; y += 0.12 * fwd * S.atk;
    }
    if (S.stun > 0.001) { rz += Math.sin(t * 4) * 0.15 * S.stun; hY += Math.sin(t * 3) * 0.3 * S.stun; }
    const hit = S.hit.x;
    pz -= hit * 0.15; px -= hit * 0.25;
    // уши отстают на прыжке (пружина от вертикальной скорости)
    const vy = dt > 0 ? (y - prevY) / dt : 0; prevY = y;
    ear.v -= vy * dt * 2;
    const ex = spring(ear, dt, 90, 7);
    const tw = idle * (Math.sin(t * 0.7 + off) > 0.96 ? Math.sin(t * 40) * 0.3 : 0);
    earL.rotation.set(-0.15 + ex, 0, -0.15 + tw); earR.rotation.set(-0.15 + ex, 0, 0.15);
    const br = 1 + idle * Math.sin(t * 5 + off) * 0.03;
    const sq = 1 - land * 0.28 + mv * air * 0.1;
    body.scale.set(0.6 * br / Math.sqrt(sq), 0.55 * sq, 0.8 / Math.sqrt(sq));
    head.position.y = idle * Math.sin(t * 18) * 0.006;
    const D = deathK(S, st, rig);
    let ry = 0;
    if (D) { const w = D.w; rz = mix(rz, 1.5708 * D.f + D.b * 0.15, w); px *= 1 - w; pz *= 1 - w; y = mix(y, 0.12 * D.f - D.sink * 0.2, w); hX = mix(hX, 0.3, w); ry = 0; }
    rig.position.set(0, ry + y, pz);
    rig.rotation.set(px, 0, rz);
    headG.rotation.set(hX, hY, 0);
    animStars(stars, S, t);
  };
  return g;
}

// ---------- паук / скорпион: ноги волной, два «треножника» ----------
function spider(color, size) {
  const g = new THREE.Group(), rig = new THREE.Group(), m = lam(color, {}, 'fur');
  const bodyG = grp(0, 0.6, -0.3);
  const body = part(G.sph, m, 0, 0, 0); body.scale.set(1.0, 0.7, 1.2); bodyG.add(body);
  const head = part(G.sph, m, 0, 0.55, 0.45); head.scale.setScalar(0.5);
  const eyes = part(G.box, lam(0xff3020, { emissive: 0xff2010, emissiveIntensity: 0.7 }), 0, 0.62, 0.69); eyes.scale.set(0.22, 0.05, 0.02);
  rig.add(bodyG, head, eyes);
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1, k = i % 4;
    const hip = grp(side * 0.3, 0.6, 0.3 - k * 0.3), knee = grp(side * 0.7, 0, 0);
    const fe = part(G.box, m, side * 0.35, 0, 0); fe.scale.set(0.72, 0.08, 0.08);
    const ti = part(G.box, m, side * 0.6, 0, 0); ti.scale.set(1.2, 0.07, 0.07);
    knee.add(ti); hip.add(fe, knee);
    hip.userData = { side, k, yaw: side * (k - 1.5) * 0.32, grpA: (side < 0) === (k % 2 === 0), knee };
    legs.push(hip); rig.add(hip);
  }
  const stars = starsAt(rig, 1.35);
  g.add(rig);
  g.scale.setScalar(size);
  const S = newBlend(g);
  g.userData.anim = (t, st, dt) => {
    blend(S, st, dt, 9, 20);
    const mv = clamp01(S.sp * 2.5), idle = 1 - mv, ph = S.ph, off = S.off;
    let rX = 0, rY = mv * Math.abs(Math.sin(ph)) * 0.04 + idle * Math.sin(t * 1.5 + off) * 0.01, rZ = S.roll, pz = 0;
    let rear = 0, stab = 0;
    if (S.atk > 0.001) {
      const k = 1 - Math.min(1, Math.max(0, st.attackT || 0));
      rear = (k < 0.4 ? easeOut(k / 0.4) : 1 - smooth01(0.4, 0.6, k)) * S.atk;
      stab = (k < 0.4 ? 0 : k < 0.6 ? easeInOut((k - 0.4) / 0.2) : 1 - smooth01(0.6, 1, k)) * S.atk;
      rX = -0.35 * rear + 0.12 * stab; pz = 0.25 * stab; rY += 0.12 * rear;
    }
    if (S.stun > 0.001) { rZ += Math.sin(t * 3) * 0.08 * S.stun; rX += Math.cos(t * 3) * 0.05 * S.stun; }
    const hit = S.hit.x;
    rX -= hit * 0.15; pz -= hit * 0.15;
    const D = deathK(S, st, rig);
    const curl = D ? smooth01(0, 0.6, st.dieT) : 0;
    for (const l of legs) {
      const u = l.userData, p = ph + (u.grpA ? 0 : Math.PI), s = u.side;
      const swing = Math.sin(p) * 0.28 * mv, lift = Math.max(0, -Math.cos(p)) * 0.4 * mv;
      const fid = idle * Math.sin(t * 2.2 + u.k * 1.7 + s) * 0.05;
      let yaw = u.yaw + swing * -s + fid, lz = s * (0.5 + lift), kz = -s * 1.4;
      if (u.k < 2) { lz += s * (rear * 0.9 - stab * 0.2); yaw -= s * rear * 0.3; }
      if (curl > 0) { lz = mix(lz, s * 1.1, curl); kz = mix(kz, -s * 2.5, curl); yaw = mix(yaw, u.yaw * 0.6, curl); }
      l.rotation.set(0, yaw, lz);
      u.knee.rotation.z = kz;
    }
    body.scale.set(1.0, 0.7 * (1 + idle * Math.sin(t * 2 + off) * 0.04), 1.2);
    if (D) { const w = D.w; rX *= 1 - w; pz *= 1 - w; rY = mix(rY, -0.35 * curl - D.sink * 0.3, w); rZ = mix(rZ, D.b * 0.05, w); }
    rig.position.set(0, rY, pz);
    rig.rotation.set(rX, 0, rZ);
    animStars(stars, S, t);
  };
  return g;
}

// ---------- древень: медленное качание, удар ветвями ----------
function tree(color, size) {
  const g = new THREE.Group(), rig = new THREE.Group();
  const bark = lam(0x4a3020, {}, 'bark');
  const trunk = part(G.cyl, bark, 0, 1.3, 0); trunk.scale.set(0.9, 2.6, 0.9);
  const crownG = grp(0, 2.4, 0);
  const crown = part(G.cone, lam(color, {}, 'leaves'), 0, 1.0, 0); crown.scale.set(2.2, 2.6, 2.2); crownG.add(crown);
  const branch = lam(0x4a3020);
  const armL = grp(-0.3, 1.8, 0), armR = grp(0.3, 1.8, 0);
  const bl = part(G.box, branch, -0.6, 0, 0); bl.scale.set(1.2, 0.2, 0.2); armL.add(bl);
  const brr = part(G.box, branch, 0.6, 0, 0); brr.scale.set(1.2, 0.2, 0.2); armR.add(brr);
  const eyes = part(G.box, lam(0xffe060, { emissive: 0xffd040, emissiveIntensity: 0.8 }), 0, 2.1, 0.46); eyes.scale.set(0.5, 0.08, 0.02);
  const stars = starsAt(rig, 5.0);
  rig.add(trunk, crownG, armL, armR, eyes);
  g.add(rig);
  g.scale.setScalar(size * 0.8);
  const S = newBlend(g);
  g.userData.anim = (t, st, dt) => {
    blend(S, st, dt, 3.2, 6.5);
    const mv = clamp01(S.sp * 2.5), idle = 1 - mv, ph = S.ph, off = S.off;
    const sw = Math.sin(t * 0.8 + off), sw2 = Math.sin(t * 0.8 + off - 0.7);
    let rZ = idle * sw * 0.025 + mv * Math.sin(ph) * 0.09, rX = mv * 0.06, rY = mv * Math.abs(Math.cos(ph)) * 0.12, pz = 0;
    let cZ = idle * sw2 * 0.05 - mv * Math.sin(ph - 0.8) * 0.08, cX = -mv * 0.05 + idle * Math.cos(t * 0.6 + off) * 0.02;
    let aL = -0.1 + idle * sw * 0.08 + mv * Math.sin(ph) * 0.25, aR = 0.1 - idle * sw * 0.08 + mv * Math.sin(ph) * 0.25;
    let aLy = 0, aRy = 0;
    if (S.atk > 0.001) {
      const k = 1 - Math.min(1, Math.max(0, st.attackT || 0));
      const up = k < 0.4 ? easeOut(k / 0.4) : 1 - smooth01(0.4, 0.58, k);
      const slam = k < 0.4 ? 0 : k < 0.58 ? easeInOut((k - 0.4) / 0.18) : 1 - smooth01(0.58, 1, k);
      const w = S.atk;
      aL = mix(aL, -1.0 * up + 0.7 * slam, w); aR = mix(aR, 1.0 * up - 0.7 * slam, w);
      aLy = mix(0, -0.9 * slam - 0.3 * up, w); aRy = mix(0, 0.9 * slam + 0.3 * up, w);
      rX += (-0.1 * up + 0.2 * slam) * w; pz += 0.25 * slam * w; cX += (-0.08 * up + 0.15 * slam) * w;
    }
    if (S.stun > 0.001) { rZ += Math.sin(t * 2) * 0.06 * S.stun; cZ += Math.sin(t * 2 - 1) * 0.12 * S.stun; }
    const hit = S.hit.x;
    rX -= hit * 0.12; cZ += hit * 0.2; cX -= hit * 0.15;
    const D = deathK(S, st, rig);
    if (D) { const w = D.w; rZ = mix(rZ, 1.5708 * D.f + D.b * 0.08, w); rX *= 1 - w; pz *= 1 - w; rY = mix(rY, 0.4 * D.f - D.sink * 0.5, w); cZ = mix(cZ, 0.3 * D.f, w); }
    rig.position.set(0, rY, pz);
    rig.rotation.set(rX, 0, rZ);
    crownG.rotation.set(cX, 0, cZ);
    armL.rotation.set(0, aLy, aL); armR.rotation.set(0, aRy, aR);
    animStars(stars, S, t);
  };
  return g;
}

// ---------- голем: гуманоид с тяжёлым шагом и тряской ----------
function golem(color, size) {
  const g = humanoid(color, { scale: size * 0.8, weaponColor: color, bodyKind: 'stone', heavy: true });
  g.userData.setWeapon(0x6a5a4a, false);
  return g;
}

// ---------- призрак: парит, шлейф отстаёт ----------
function ghost(color, size) {
  const g = new THREE.Group(), rig = new THREE.Group();
  const m = lam(color, { transparent: true, opacity: 0.55, emissive: color, emissiveIntensity: 0.5 });
  const bodyG = grp(0, 2.2, 0);
  const body = part(G.cone, m, 0, -1.0, 0); body.scale.set(1.1, 2.2, 1.1); body.rotation.x = Math.PI; bodyG.add(body);
  const head = part(G.sph, m, 0, 2.3, 0); head.scale.setScalar(0.8);
  const eyes = part(G.box, lam(0x000000), 0, 2.35, 0.36); eyes.scale.set(0.4, 0.08, 0.02);
  const wm = lam(color, { transparent: true, opacity: 0.3, emissive: color, emissiveIntensity: 0.6, depthWrite: false });
  const wisps = [];
  for (let i = 0; i < 3; i++) { const w = part(G.sph, wm, 0, 0.5, 0); w.scale.setScalar(0.5 - i * 0.12); w.castShadow = false; wisps.push(w); rig.add(w); }
  const stars = starsAt(rig, 3.2);
  rig.add(bodyG, head, eyes);
  g.add(rig);
  g.scale.setScalar(size * 0.8);
  const S = newBlend(g);
  let trail = 0;
  g.userData.anim = (t, st, dt) => {
    blend(S, st, dt, 4, 6);
    const mv = clamp01(S.sp * 2), off = S.off;
    trail = damp(trail, mv, 3, dt);
    const fl = Math.sin(t * 2 + off) * 0.2;
    let y = fl, rX = mv * 0.28, rZ = Math.sin(t * 1.1 + off) * 0.05 + S.roll, pz = 0, sc = 1;
    let bX = -trail * 0.35 + Math.sin(t * 1.7 + off) * 0.06, bZ = Math.sin(t * 1.3 + off + 1) * 0.08;
    if (S.atk > 0.001) {
      const k = 1 - Math.min(1, Math.max(0, st.attackT || 0));
      const back = k < 0.35 ? easeOut(k / 0.35) : 1 - smooth01(0.35, 0.55, k);
      const fwd = k < 0.35 ? 0 : k < 0.55 ? easeInOut((k - 0.35) / 0.2) : 1 - smooth01(0.55, 1, k);
      pz += (-0.3 * back + 0.9 * fwd) * S.atk; rX += (-0.2 * back + 0.35 * fwd) * S.atk; sc += 0.12 * fwd * S.atk; y += 0.2 * back * S.atk;
    }
    if (S.stun > 0.001) { rZ += Math.sin(t * 3) * 0.12 * S.stun; y -= 0.2 * S.stun; }
    const hit = S.hit.x;
    pz -= hit * 0.3; rX -= hit * 0.2; sc += hit * 0.08;
    let fadeLift = 0;
    const D = deathK(S, st, rig, true);
    if (D) {
      // рассеивается: поднимается, расплывается и гаснет (без падения)
      const d = st.dieT || 0;
      fadeLift = d * 1.4; sc += d * 0.5; rX *= 1 - D.w;
      if (g.userData.fadeOnDeath) { const op = Math.max(0, 1 - smooth01(0.1, 1.4, d)); setFade(S, op); rig.visible = op > 0.01; }
    }
    rig.position.set(0, y + fadeLift, pz);
    rig.rotation.set(rX, 0, rZ);
    rig.scale.set(sc, sc * (1 + Math.sin(t * 3 + off) * 0.02), sc);
    bodyG.rotation.set(bX, 0, bZ);
    head.position.y = 2.3 + Math.sin(t * 2 + off - 0.4) * 0.05;
    eyes.position.y = head.position.y + 0.05;
    for (let i = 0; i < 3; i++) {
      const w = wisps[i], lag = i + 1;
      w.position.set(Math.sin(t * 2.5 - lag * 0.9 + off) * 0.25 * (0.4 + trail), 0.7 - lag * 0.18 + Math.sin(t * 2 - lag * 0.5 + off) * 0.1, -trail * lag * 0.55 - 0.1);
    }
    animStars(stars, S, t);
  };
  return g;
}

export function buildMob(def) {
  let g;
  if (MOB_SHAPES[def.shape]) {
    const rig = MOB_SHAPES[def.shape](def), animate = rig.userData.anim;
    g = new THREE.Group(); g.add(rig);
    const S = newBlend(g);
    g.userData.anim = (t, st, dt) => {
      animate(t, st, dt);
      const D = deathK(S, st, rig);
      rig.rotation.z = D ? -Math.PI * 0.48 * D.f + D.b * 0.08 : 0;
      if (g.userData.aura) g.userData.aura.visible = !D;
    };
  } else g = mobModel(def);
  g.userData.fadeOnDeath = true;
  return withTurn(g);
}
function mobModel(def) {
  const s = def.size || 1;
  switch (def.shape) {
    case 'critter': return critter(def.color, s);
    case 'beast': return beast(def.color, s);
    case 'spider': return spider(def.color, s);
    case 'tree': return tree(def.color, s);
    case 'golem': return golem(def.color, s);
    case 'ghost': return ghost(def.color, s);
    default: return humanoid(def.color, { scale: s, skull: def.color === 0xe0dcc8 || def.boss, robe: def.boss, staff: def.boss, weaponColor: def.boss ? 0xa050ff : 0x9a9a9a, bodyKind: def.color === 0xe0dcc8 ? 'bone' : 'leather', glow: def.boss ? 0xb070ff : 0x80c8ff });
  }
}

export function buildHero(cls) {
  const root = withTurn(humanoid(cls.color, { robe: cls?.name === 'Маг', staff: cls?.name === 'Маг', weaponColor: 0xa0a0a0 }));
  if (MODEL_OF[cls?.name]) applyModel(root, MODEL_OF[cls.name]);
  return root;
}

export function buildNpc(color) {
  const g = humanoid(color, { robe: true });
  g.userData.setWeapon(null); // NPC без оружия
  return withTurn(g);
}
