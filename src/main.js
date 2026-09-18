import { createNav } from './nav.js';
import { dressWeapon } from './weapon-models.js';
import { createGroundLootView } from './ground-loot-view.js';
import { buildPet } from './pets-models.js';
import { PETS } from './pets.js';
import { PROFESSIONS, PROF_LVL, SKILL_MAX_LV } from './data.js';
import { migrateGrowth, skillsOf, skillLv, skillAt, profsFor, profError, learnError, skillReqLvl, learnCost } from './growth.js';
import { bonusText, needsEnemy } from './skills.js';
import { attachGuardian } from './guardian-model.js';
import { createCampFx } from './camp-fx.js';
import { spawnDef } from './combat.js';
import { mapOffset } from './map-view.js';
import * as THREE from 'three';
import { CLASSES, SKILLS, ITEMS, MOBS, SHOP, GRADES, SLOTS, SETS, xpToNext, MAX_LEVEL } from './data.js';
import { calcStats, enchValue, wearError, migrate, SAFE_ENCH, ENCH_CHANCE } from './stats.js';
import { buildWorld, heightAt, zoneAt, obstacles, TOWNS, TELEPORTS, CRYPT, DUNGEON, ZONES, MAP } from './world.js';
import { buildMob, buildHero, buildNpc } from './models.js';
import { TEX } from './tex.js';
import { PVP, karmaWashCost } from './pvp.js';

const $ = (id) => document.getElementById(id);
export const MOBILE = new URLSearchParams(location.search).has('touch') || matchMedia('(pointer: coarse)').matches;
if (MOBILE) document.documentElement.classList.add('mob');
const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));

// ================= Рендер =================
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.25 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const SKY = new THREE.Color(0x9cc4e8), CRYPT_SKY = new THREE.Color(0x07060a);
scene.background = SKY.clone(); // перекрывается куполом неба
scene.fog = new THREE.Fog(SKY.clone(), 150, 620);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 2000);
const hemi = new THREE.HemisphereLight(0xdfefff, 0x4a4030, 1.3);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
sun.castShadow = true; sun.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 300 });
scene.add(hemi, sun, sun.target);
// небо: пиксельный купол (градиент, облака, горы), следует за камерой
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), new THREE.MeshBasicMaterial({ map: TEX.sky(), fog: false, depthWrite: false, side: THREE.BackSide }));
skyDome.renderOrder = -1; skyDome.frustumCulled = false; scene.add(skyDome);
scene.background = new THREE.Color(0x8aa4bc);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const { ground, npcs: npcDefs, spawns, camp } = buildWorld(scene);
const campFx = createCampFx(scene, camp, emit);
const nav=createNav(obstacles);
const groundLoot=createGroundLootView(scene,heightAt);let pickUid=null;

// ================= Профиль =================
// Профиль целиком ведёт сервер: клиент только зеркалит authok/you и ничего не хранит локально.
let P = null; // персонаж
function applyProfile(np) {
  const first = !P;
  P = migrateGrowth(migrate(np));
  if (first) return;
  refreshGear(); renderSkills(); if (!$('mentor').hidden) renderMentor();
  if (!$('shop').hidden) renderShop();
  // во время перетаскивания сетку не трогаем — иначе ячейка исчезнет из-под курсора
  if (drag) pendingInv = true; else renderInv();
}
let pendingInv = false;

// ================= Характеристики =================
const buffs = []; // { stat, mul, until }
const stats = () => calcStats(P, buffs, performance.now());
const invCount = (id) => P.inv.find((i) => i.id === id)?.n || 0;
// ================= Персонаж =================
let hero = null;
const heroSt = { moving: false, attackT: 0, casting: false };
function spawnHero() {
  if (hero) { hero.userData.disposeGuardian?.(); scene.remove(hero); }
  hero = buildHero(CLASSES[P.cls]);
  hero.position.set(P.x, heightAt(P.x, P.z), P.z);
  scene.add(hero);
  refreshGear();
  attachGuardian(hero, P);
}
function lookOf() {
  const g = (sl) => ITEMS[P.equip[sl]], w = g('weapon'), a = g('armor');
  return {
    cls: P.cls, lvl: P.lvl, w: w ? w.color : null, staff: !!w?.twoHand && !w?.bow && !w?.polearm, bow: !!w?.bow, polearm: !!w?.polearm, ench: P.enc.weapon || 0,
    body: a && a.grade !== 'none' ? a.color : CLASSES[P.cls].color, robe: !!a?.robe || (P.cls === 'mage' && !a), mat: matKind(a),
    gear: { head: g('head')?.color ?? null, legs: g('legs')?.color ?? null, gloves: g('gloves')?.color ?? null, feet: g('feet')?.color ?? null, shield: g('shield')?.color ?? null, helmKind: g('head')?.set ?? null,
      shieldKind: g('shield') ? (g('shield').grade === 'd' ? 'wood' : 'plate') : null, legKind: matKind(g('legs')) },
  };
}
// вид ткани/брони по комплекту
function matKind(it) {
  if (!it) return 'cloth';
  if (it.set === 'chain') return 'chain';
  if (it.set === 'bone') return 'plate';
  if (it.set === 'leather') return 'leather';
  return 'cloth';
}
function applyLook(obj, L) {
  const u = (v) => (v == null ? undefined : v);
  obj.userData.setWeapon(u(L.w), L.staff, L.ench); dressWeapon(obj,L);
  obj.userData.setBody(L.body ?? CLASSES[L.cls].color, L.robe, L.mat);
  obj.userData.setGear({ head: u(L.gear?.head), legs: u(L.gear?.legs), gloves: u(L.gear?.gloves), feet: u(L.gear?.feet), shield: u(L.gear?.shield), helmKind: L.gear?.helmKind, shieldKind: L.gear?.shieldKind, legKind: L.gear?.legKind });
}
function refreshGear() { applyLook(hero, lookOf()); }

// ================= Мобы =================
// Мобов считает сервер: клиент строит модель по виду из «mobs» и двигает её по снапшотам.
const petViews = new Map();
const mobs = new Map(); // id → { id, def, obj, buf, ... }
const MOB_LABEL_MAX = 20;
function mobSeen(id, kind, spawn = {}) {
  const have = mobs.get(id); if (have) return have;
  if (!MOBS[kind]) return null; const def = spawnDef(MOBS[kind], spawn);
  const obj = buildMob(def); obj.visible = false; scene.add(obj);
  const m = { id, def, obj, isMob: true, radius: (def.size || 1) * 0.9, hp: 100, dead: false, buf: [], a: 0, seen: 0, flash: 0, flashOn: false, dieT: null, st: { moving: false, attackT: 0, hitT: 0 } };
  obj.traverse((o) => { o.userData.mob = m; });
  mobs.set(id, m);
  return m;
}

// ================= NPC =================
const GUARD_LOOK = { cls: 'warrior', lvl: 60, w: 0xd0d8e0, staff: false, ench: 7, body: 0x8090a0, robe: false, mat: 'chain', gear: { head: 0x8090a0, legs: 0x707e8e, gloves: 0x8090a0, feet: 0x606c7a, shield: 0x9098a8, helmKind: 'chain', shieldKind: 'plate', legKind: 'chain' } };
const npcs = npcDefs.map((d) => {
  const obj = d.role === 'guard' ? buildHero(CLASSES.warrior) : buildNpc(d.color);
  if (d.role === 'guard') { applyLook(obj, GUARD_LOOK); obj.scale.setScalar(1.15); }
  obj.position.set(d.x, heightAt(d.x, d.z), d.z);
  obj.traverse((o) => { o.userData.npc = d; });
  scene.add(obj);
  if (d.role !== 'guard') obstacles.push({ x: d.x, z: d.z, r: 0.9 });
  return { ...d, obj, home: new THREE.Vector3(d.x, 0, d.z), st: { moving: false, attackT: 0, casting: false }, cd: 0 };
});
// портал выхода из катакомб и вход у склепа
const cryptDoor = new THREE.Vector3(CRYPT.x, heightAt(CRYPT.x, CRYPT.z), CRYPT.z + 8.5);
const dungeonExit = new THREE.Vector3(DUNGEON.x0 + DUNGEON.cell / 2 - 4, 0, DUNGEON.z0 + DUNGEON.cell / 2 - 4);
{
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.25, 8, 32), new THREE.MeshBasicMaterial({ color: 0x9a70ff }));
  ring.position.copy(dungeonExit).setY(2.4); scene.add(ring);
  const ring2 = ring.clone(); ring2.position.copy(cryptDoor).setY(cryptDoor.y + 3); ring2.material = new THREE.MeshBasicMaterial({ color: 0x6040a0 }); scene.add(ring2);
}

// ================= Эффекты =================
const fx = [];
// пиксельные частицы: по одной системе Points на форму, до 800 частиц в каждой
const PVS = `attribute float size; attribute vec4 pc; varying vec4 vC; uniform float scale;
void main(){ vC = pc; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = max(1.0, size * scale / -mv.z); gl_Position = projectionMatrix * mv; }`;
const PFS = `uniform sampler2D map; varying vec4 vC;
void main(){ vec4 t = texture2D(map, gl_PointCoord); if (t.a < 0.5) discard; gl_FragColor = vec4(vC.rgb * t.rgb, vC.a); }`;
function makePsys(key, additive) {
  const n = 800, geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), pc = new Float32Array(n * 4), size = new Float32Array(n);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('pc', new THREE.BufferAttribute(pc, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: TEX[key]() }, scale: { value: 600 } }, vertexShader: PVS, fragmentShader: PFS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 2; scene.add(pts);
  return { geo, mat, pos, pc, size, parts: [], n };
}
const PS = { spark: makePsys('spark', true), dot: makePsys('dot', true), plus: makePsys('plus', false), flake: makePsys('flake', true), dust: makePsys('dot', false) };
const _c = new THREE.Color();
// kind — форма, o: n, color, speed, up, life, size, grav, spread (радиус появления), ring (разлёт по кругу), swirl
function emit(kind, p, o = {}) {
  const S = PS[kind], n = o.n ?? 8;
  for (let k = 0; k < n && S.parts.length < S.n; k++) {
    const a = Math.random() * Math.PI * 2, sp = (o.speed ?? 4) * (0.5 + Math.random() * 0.5), sr = (o.spread ?? 0.3) * Math.random();
    _c.set(Array.isArray(o.color) ? o.color[k % o.color.length] : o.color ?? 0xffffff);
    const ringK = o.ring ? 1 : Math.random();
    S.parts.push({
      x: p.x + Math.cos(a) * sr, y: p.y + (o.dy ?? 1.2) + (Math.random() - 0.5) * (o.h ?? 0.4), z: p.z + Math.sin(a) * sr,
      vx: Math.cos(a) * sp * ringK, vy: (o.up ?? 2) * (0.6 + Math.random() * 0.8), vz: Math.sin(a) * sp * ringK,
      life: (o.life ?? 0.6) * (0.7 + Math.random() * 0.6), max: 0, size: (o.size ?? 0.35) * (0.7 + Math.random() * 0.6),
      r: _c.r, g: _c.g, b: _c.b, grav: o.grav ?? -6, swirl: o.swirl || 0, cx: p.x, cz: p.z, drag: o.drag ?? 1.5,
    });
    S.parts[S.parts.length - 1].max = S.parts[S.parts.length - 1].life;
  }
}
function updateParticles(dt) {
  const scale = renderer.getPixelRatio() * innerHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
  for (const S of Object.values(PS)) {
    const P2 = S.parts; let w = 0;
    for (let i = 0; i < P2.length; i++) {
      const q = P2[i]; q.life -= dt; if (q.life <= 0) continue;
      const dk = Math.exp(-q.drag * dt);
      q.vx *= dk; q.vz *= dk; q.vy = q.vy * dk + q.grav * dt;
      if (q.swirl) { const dx = q.x - q.cx, dz = q.z - q.cz; q.vx += -dz * q.swirl * dt; q.vz += dx * q.swirl * dt; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const k = q.life / q.max;
      S.pos[w * 3] = q.x; S.pos[w * 3 + 1] = q.y; S.pos[w * 3 + 2] = q.z;
      S.pc[w * 4] = q.r; S.pc[w * 4 + 1] = q.g; S.pc[w * 4 + 2] = q.b; S.pc[w * 4 + 3] = Math.min(1, k * 2);
      S.size[w] = q.size * (0.6 + 0.4 * k);
      P2[w++] = q;
    }
    P2.length = w;
    S.geo.setDrawRange(0, w);
    if (w) { S.geo.attributes.position.needsUpdate = S.geo.attributes.pc.needsUpdate = S.geo.attributes.size.needsUpdate = true; }
    S.mat.uniforms.scale.value = scale;
  }
}
// столб света (уровень, телепорт)
function pillarFx(pos, color, h = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, h, 12, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.copy(pos).add(new THREE.Vector3(0, h / 2, 0)); scene.add(m);
  fx.push({ m, life: 1.2, max: 1.2, pillar: true });
}
function ringFx(pos, radius, color) {
  const m = new THREE.Mesh(new THREE.RingGeometry(radius * 0.8, radius, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide }));
  m.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0)); scene.add(m);
  fx.push({ m, life: 0.5, max: 0.5, grow: true });
}
function flashFx(pos, color, size = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.6 * size, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true }));
  m.position.copy(pos).add(new THREE.Vector3(0, 1.4, 0)); scene.add(m);
  fx.push({ m, life: 0.35, max: 0.35, grow: true });
}
function slashFx(pos, crit) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 16, 1, 0, Math.PI * 0.9), new THREE.MeshBasicMaterial({ color: crit ? 0xffd040 : 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  m.position.copy(pos).add(new THREE.Vector3(0, 1.3, 0)); m.lookAt(camera.position); m.rotateZ(Math.random() * 6.28); scene.add(m);
  fx.push({ m, life: 0.25, max: 0.25, grow: true });
}
const bolts = [];
function boltFx(from, target, color, onHit) {
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.orb(), color, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.scale.setScalar(1.1);
  m.position.copy(from).add(new THREE.Vector3(0, 1.6, 0)); scene.add(m);
  bolts.push({ m, target, onHit, color });
}
function floatText(pos, text, color = '#fff', big = false) {
  const el = document.createElement('div');
  el.className = 'ftext' + (big ? ' big' : ''); el.textContent = text; el.style.color = color;
  $('labels').append(el);
  fx.push({ el, pos: pos.clone().add(new THREE.Vector3(rand(-0.5, 0.5), 2.6, 0)), life: 1.1, max: 1.1 });
}
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.life -= dt; const k = 1 - f.life / f.max;
    if (f.m) { f.m.material.opacity = f.pillar ? (1 - k) * 0.3 : 1 - k; if (f.grow) f.m.scale.setScalar(1 + k * 1.5); if (f.pillar) f.m.scale.set(1 - k * 0.7, 1 + k * 0.3, 1 - k * 0.7); }
    if (f.el && f.follow) { const o = f.follow.position, p = toScreen(_v.copy(o).setY(o.y + 3.6)); f.el.style.transform = `translate(${p.x | 0}px,${p.y | 0}px) translate(-50%,-100%)`; f.el.style.display = p.vis && f.follow.visible !== false ? '' : 'none'; f.el.style.opacity = String(Math.min(1, f.life)); }
    else if (f.el) { f.pos.y += dt * 1.6; const p = toScreen(f.pos); f.el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%)`; f.el.style.opacity = String(1 - k * k); f.el.style.display = p.vis ? '' : 'none'; }
    if (f.life <= 0) { if (f.m) { scene.remove(f.m); f.m.geometry.dispose(); } f.el?.remove(); fx.splice(i, 1); }
  }
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i], tp = b.target.obj.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const d = tp.clone().sub(b.m.position), L = d.length();
    if (L < 0.8 || b.target.dead) { scene.remove(b.m); b.m.material.dispose(); bolts.splice(i, 1); if (!b.target.dead) { b.onHit(); emit('spark', b.target.obj.position, { n: 14, color: [b.color, 0xffffff], speed: 7, up: 3, life: 0.45 }); } continue; }
    b.m.position.addScaledVector(d.normalize(), Math.min(L, dt * 45));
    b.m.material.rotation += dt * 8;
    emit('dot', b.m.position, { n: 2, color: [b.color, 0xffe0a0], speed: 0.6, up: 0.5, life: 0.35, size: 0.3, dy: 0, grav: 0, spread: 0.1 });
  }
}

// стражи: бегут к PK рядом с воротами и бьют, потом возвращаются на пост
function updateGuards(dt, t) {
  for (const g of npcs) {
    if (g.role !== 'guard') continue;
    const o = g.obj.position, dHero = flatDist(o, hero.position), fromPost = Math.hypot(o.x - g.home.x, o.z - g.home.z);
    g.st.moving = false; g.st.attackT = Math.max(0, g.st.attackT - dt * 3); g.cd -= dt;
    const chase = P && P.karma > 0 && !dead && dHero < PVP.guardRange && fromPost < 40;
    const goal = chase ? hero.position : g.home;
    const dist = chase ? dHero : fromPost;
    if (dist > (chase ? 2.2 : 0.5)) {
      const dir = tmp.set(goal.x - o.x, 0, goal.z - o.z).normalize();
      o.x += dir.x * 20 * dt; o.z += dir.z * 20 * dt; o.y = heightAt(o.x, o.z);
      g.obj.rotation.y = Math.atan2(dir.x, dir.z); g.st.moving = true;
    } else if (chase && g.cd <= 0) {
      g.cd = 1.3; g.st.attackT = 1; faceGuard(g); // урон засчитывает сервер
      if (dHero < 3 && !g.warned) { g.warned = true; log('Страж: «Убийца! Взять его!»', 'bad'); }
    }
    if (dHero < 120) g.obj.userData.anim(t, g.st);
  }
}
const faceGuard = (g) => { g.obj.rotation.y = Math.atan2(hero.position.x - g.obj.position.x, hero.position.z - g.obj.position.z); };

// окружение: пыль из-под ног, факелы и туман в катакомбах, фонтаны и врата в городах, рябь воды
let stepT = 0;
const torches = [];
for (let i = 0; i < DUNGEON.n; i++) for (let j = 0; j < DUNGEON.n; j++) if ((i + j) % 3 === 0) torches.push(new THREE.Vector3(DUNGEON.x0 + (i + 0.5) * DUNGEON.cell, 7.3, DUNGEON.z0 + (j + 0.5) * DUNGEON.cell - DUNGEON.cell / 2 + 1.2));
const water = scene.getObjectByName('water');
function ambientFx(dt) {
  const hp = hero.position, inCrypt = hp.x > DUNGEON.x0 - 100;
  stepT -= dt;
  if (heroSt.moving && stepT <= 0 && !inCrypt) { stepT = 0.22; emit('dust', hp, { n: 2, color: zoneAt(hp.x, hp.z).town ? 0xb0a890 : 0x9a8a6a, speed: 0.8, up: 0.8, life: 0.5, size: 0.35, grav: -1, dy: 0.1, spread: 0.3, h: 0 }); }
  if (inCrypt) {
    for (const tp of torches) if (Math.abs(tp.x - hp.x) < 45 && Math.abs(tp.z - hp.z) < 45 && Math.random() < dt * 14) emit('dot', tp, { n: 1, color: [0xff8a20, 0xffd040, 0xff4010], speed: 0.3, up: 1.6, life: 0.5, size: 0.4, grav: 1, dy: 0.4, spread: 0.2, h: 0 });
    if (Math.random() < dt * 6) emit('dust', hp, { n: 1, color: 0x6a6070, speed: 0.2, up: 0.1, life: 3, size: 0.2, grav: 0, dy: 2, spread: 14, h: 4 });
  } else {
    for (const t of TOWNS) {
      if (Math.hypot(t.x - hp.x, t.z - hp.z) > 90) continue;
      const y = heightAt(t.x, t.z);
      if (Math.random() < dt * 20) emit('dot', { x: t.x, y: y + 4.4, z: t.z }, { n: 1, color: [0x9ad0ff, 0xffffff], speed: 1.8, up: 3, life: 0.9, size: 0.3, grav: -7, dy: 0, spread: 0.2, h: 0 });
      if (Math.random() < dt * 8) emit('dot', { x: t.x + 18, y, z: t.z + 16 }, { n: 1, color: [0xa080ff, 0xd0c0ff], speed: 0.2, up: 2, life: 1.5, size: 0.35, grav: 0.3, dy: 0.3, spread: 2.6, swirl: 2, h: 0 });
    }
  }
  if (water?.material.map) water.material.map.offset.x += dt * 0.02;
}

// ================= Лог и сообщения =================
function log(text, cls = '') {
  const el = document.createElement('div'); el.className = `c-sys ${cls}`; el.textContent = text;
  const box = $('syslog');
  box.append(el); while (box.children.length > 60) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
  setTimeout(() => el.classList.add('old'), 9000);
}
function logAppend(el) {
  const box = $('logbox'), stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
  box.append(el); while (box.children.length > 150) box.firstChild.remove();
  if (stick) box.scrollTop = box.scrollHeight;
}
let bannerT = 0;
function banner(text) { $('banner').textContent = text; $('banner').style.opacity = '1'; bannerT = 2.5; }

// ================= Бой =================
let target = null;       // моб или NPC
let attacking = false;   // автоатака цели
let dest = null;         // точка движения
const cds = {};          // кулдауны умений
let cast = null;         // { skill, t, target }
let dead = false;

function levelColor(lv) {
  const diff = lv - P.lvl;
  return diff >= 5 ? '#ff4040' : diff >= 3 ? '#ff9a40' : diff >= -2 ? '#ffffff' : diff >= -5 ? '#80c0ff' : '#80ff80';
}

// Урон, опыт и добычу считает сервер. Клиент шлёт намерение и рисует то, что пришло в ответ.
// цель нужна и серверу: он по ней считает и автоатаку, и умения
function setTarget(t) {
  target = t || null;
  if (t && (t.isMob || t.isPlayer)) netSend({ t: 'atk', id: t.id, kind: t.isPlayer ? 'p' : 'm', hold: 1 });
  else netSend({ t: 'atk', id: null });
}
function attackTarget(t) {
  if (dead || !t) return;
  target = t; attacking = true; pendingSkill = null;
  netSend({ t: 'atk', id: t.id, kind: t.isPlayer ? 'p' : 'm' });
}
function stopAttack() {
  if (!attacking) return;
  attacking = false; pendingSkill = null; netSend({ t: 'atk', id: null });
}
// сервер сообщил о смерти — показываем экран
function die(byName, loss) {
  dead = true; attacking = false; pendingSkill = null; cast = null; dest = null;
  log(`Вас убил ${byName}. Потеряно опыта: ${loss}`, 'bad');
  heroSt.dieT = 0;
  $('death').hidden = false;
}
const respawn = () => netSend({ t: 'respawn' });

function useSkill(id) {
  const sk = SKILLS[id];
  if (!sk || dead || cast) return;
  if (!skillsOf(P).includes(id)) return;
  if (!skillLv(P, id)) return log(`${sk.name}: нужен уровень ${sk.lvl}`, 'bad');
  if ((cds[id] || 0) > performance.now()) return;
  if (needsEnemy(sk)) {
    if (!target || target.dead || !(target.isMob || target.isPlayer)) return log('Нет цели', 'bad');
    // до цели ещё надо дойти: подводим героя, команда уйдёт при сближении
    if (flatDist(hero.position, target.obj.position) > sk.range + target.radius) { dest = null; attacking = true; pendingSkill = id; return; }
  }
  netSend({ t: 'skill', id });
}
let pendingSkill = null;
function faceTo(p) { hero.rotation.y = Math.atan2(p.x - hero.position.x, p.z - hero.position.z); }
const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inTown = () => !!zoneAt(hero.position.x, hero.position.z).town;

function useItem(id) {
  const it = ITEMS[id]; if (!it) return;
  if (it.slot) {
    let idx = P.inv.findIndex((e) => e.id === id && !e.e); if (idx < 0) idx = P.inv.findIndex((e) => e.id === id);
    if (idx >= 0) equipIdx(idx);
  } else if (it.use === 'ench') {
    enchMode = id; sel = null; $('inv').hidden = false;
    log(`${it.name}: выберите ${it.ench === 'w' ? 'оружие' : 'броню или украшение'} в инвентаре`);
    renderInv();
  } else if (it.use && !dead) netSend({ t: 'use', id });
}
const equipIdx = (idx, want) => netSend({ t: 'equip', idx, slot: want });
const unequip = (sl) => netSend({ t: 'unequip', slot: sl });
// усиление: ref = { bag: индекс } | { slot: id }
let enchMode = null;
function enchant(ref) {
  if (!enchMode) return;
  netSend({ t: 'ench', scroll: enchMode, ref });
  if (invCount(enchMode) <= 1) enchMode = null;
  sel = null; renderInv();
}

function teleportTo(x, z) {
  hero.position.set(x, heightAt(x, z), z);
  moveEntity(hero.position, tmp.set(0, 0, 0), 0, 0.6); // вытолкнуть из препятствий
  dest = null; stopAttack(); target = null;
  const inCrypt = x > DUNGEON.x0 - 100;
  scene.background.copy(inCrypt ? CRYPT_SKY : SKY); scene.fog.color.copy(scene.background);
  scene.fog.near = inCrypt ? 20 : 150; scene.fog.far = inCrypt ? 110 : 620;
  hemi.intensity = inCrypt ? 0.35 : 1.3; sun.intensity = inCrypt ? 0.15 : 2.2;
  flashFx(hero.position, 0xa080ff, 1.5); pillarFx(hero.position, 0xa080ff, 8);
  emit('dot', hero.position, { n: 40, color: [0xa080ff, 0xffffff], speed: 1.5, up: 5, life: 1, size: 0.35, grav: -1, spread: 1.3, swirl: 8, dy: 0.1, h: 0.5 });
}


// ================= Сеть: другие игроки, онлайн, чат =================
const net = { ws: null, ok: false, id: 0, online: 0, retry: 1000, lastSt: 0 };
const WS_URL = new URLSearchParams(location.search).get('ws') || (import.meta.env.DEV ? `ws://${location.hostname}:8790` : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
const netSend = (m) => { if (net.ok && (net.authed || m.t === 'auth' || m.t === 'login' || m.t === 'register')) net.ws.send(JSON.stringify(m)); };
const AUTH_KEY = 'l2w-auth';
const loadAuth = () => { try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; } };
let authReq = null; // что отправить при подключении (вход/регистрация со стартового экрана)
function netConnect() {
  const ws = new WebSocket(WS_URL);
  net.ws = ws;
  ws.onopen = () => {
    net.ok = true; net.retry = 1000;
    // переподключение в игре — входим по токену молча
    const au = loadAuth();
    if (P && au?.token) net.ws.send(JSON.stringify({ t: 'auth', token: au.token }));
    else startReady();
  };
  ws.onclose = () => {
    if (net.ws !== ws) return;
    net.ok = false; net.authed = false;
    for (const r of remotes.values()) scene.remove(r.obj);
    remotes.clear();
    if (net.kicked) return;
    if (!P) startReady();
    setTimeout(netConnect, net.retry); net.retry = Math.min(15000, net.retry * 2);
  };
  ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } onNet(m); };
}
const remotes = new Map(); // id → { obj, name, look, to, a, hp, seen, st }
function onNet(m) {
  if (m.t === 'hi') net.online = m.online;
  if (m.t === 'authok') {
    net.id = m.id; net.online = m.online; net.authed = true;
    const au = loadAuth();
    if (m.token) try { localStorage.setItem(AUTH_KEY, JSON.stringify({ name: m.name, token: m.token })); } catch { /* */ }
    else if (au && au.name !== m.name) try { localStorage.setItem(AUTH_KEY, JSON.stringify({ ...au, name: m.name })); } catch { /* */ }
    if (!P) start(m.p);
    else applyProfile(m.p);
  }
  if (m.t === 'autherr') {
    if (P) { log(`Сервер: ${m.reason}`, 'bad'); return; }
    if (m.kind === 'auth') { try { localStorage.removeItem(AUTH_KEY); } catch { /* */ } startReady(); }
    startMsg(m.reason, true);
  }
  if (m.t === 'kicked') { net.kicked = true; log('Вход в этот аккаунт выполнен с другого устройства. Перезагрузите страницу, чтобы вернуться.', 'bad'); banner('Вход с другого устройства'); }
  if (m.t === 'online') net.online = m.n;
  if (m.t === 'look') {
    let r = remotes.get(m.id);
    const cls = m.look?.cls || 'warrior';
    if (r && r.cls !== cls) { scene.remove(r.obj); r = null; }
    if (!r) {
      const obj = buildHero(CLASSES[cls]); obj.visible = false; scene.add(obj);
      r = { id: m.id, obj, cls, isPlayer: true, radius: 0.6, k: 0, dead: false, to: null, a: 0, hp: 100, seen: 0, st: { moving: false, attackT: 0, casting: false } };
      obj.traverse((o) => { o.userData.remote = r; });
      remotes.set(m.id, r);
    }
    r.name = m.name; r.look = m.look;
    if (m.look) applyLook(r.obj, m.look);
  }
  if (m.t === 'snap') {
    const now = performance.now();
    // смещение часов сервера: берём минимальную задержку (самые быстрые пакеты), медленно отпускаем
    const d = Date.now() - (m.ts || Date.now());
    net.off = net.off == null ? d : d < net.off ? d : net.off + (d - net.off) * 0.02;
    const ts = m.ts || Date.now();
    for (const [id, x, y, z, ry, a, hp, k] of m.o) {
      const r = remotes.get(id); if (!r) continue;
      pushSnap(r, ts, x, y, z, ry);
      if (a & 2 && !(r.a & 2)) r.st.attackT = 1;
      r.a = a; r.hp = hp; r.k = k || 0; r.dead = !!(a & 8); r.seen = now; r.obj.visible = true;
    }
    for (const [id, x, y, z, ry, a, hp] of m.m || []) {
      const mb = mobs.get(id); if (!mb) continue;
      pushSnap(mb, ts, x, y, z, ry);
      if (a & 2 && !(mb.a & 2)) mb.st.attackT = 1;
      mb.a = a; mb.hp = hp; mb.dead = !!(a & 8); mb.seen = now;
      if (!mb.obj.visible && !mb.dead) mb.obj.visible = true;
    }
    if (m.me) {
      P.hp = m.me.hp; P.mp = m.me.mp;
      if (dead !== m.me.dead && !m.me.dead) { dead = false; heroSt.dieT = null; hero.rotation.z = 0; $('death').hidden = true; }
    }
  }
  if(m.t === 'party' || m.t === 'pinvited') renderParty(m);
  if(m.t === 'partychat') log(`[Группа] ${m.name}: ${m.text}`);
  if(m.t === 'ground') groundLoot.receive(m.items);
  if (m.t === 'pets') {
    const live=new Set(m.list.map(p=>p.id));
    for(const [id,p] of petViews) if(!live.has(id)) {scene.remove(p.obj);petViews.delete(id);}
    for(const p of m.list) {
      let view=petViews.get(p.id);
      if(!view) {view={obj:buildPet(p.kind),st:{}};view.obj.position.set(p.x,p.y,p.z);scene.add(view.obj);petViews.set(p.id,view);}
      Object.assign(view,p);view.st.moving=p.moving;view.st.speed=p.moving?1:0;view.st.attackT=p.attackT;
    }
    const own=m.list.filter(p=>p.owner===net.id);
    $('petbox').hidden=!own.length;
    $('pet-status').textContent=own.map(p=>`${PETS[p.kind].name}: ${p.hp}%`).join(' · ');
  }
  if (m.t === 'mobs') for (const [id, kind, spawn] of m.n) mobSeen(id, kind, spawn);
  if (m.t === 'you') applyProfile(m.p);
  if (m.t === 'ev') for (const e of m.e) onEvent(e);
  // сервер не принял перемещение — возвращаемся туда, где он нас видит
  if (m.t === 'fix') { hero.position.set(m.x, heightAt(m.x, m.z), m.z); dest = null; }
  if (m.t === 'leave') { const r = remotes.get(m.id); if (r) { scene.remove(r.obj); remotes.delete(m.id); if (target === r) { target = null; stopAttack(); } } }
  if (m.t === 'me') {
    const was = P?.karma || 0;
    if (P) { P.karma = m.karma; P.pk = m.pk; P.pvp = m.pvp; }
    net.flagUntil = performance.now() + (m.flag || 0);
    if (P && m.karma > 0 && !was) { log(`Вы стали PK. Карма: ${m.karma}. Стражи городов атакуют вас, убийство мобов смывает карму.`, 'bad'); banner('Вы стали PK!'); }
    if (P && !m.karma && was) log('Карма очищена', 'good');
  }
  if (m.t === 'pvperr') { log(m.reason, 'bad'); stopAttack(); }
  if (m.t === 'announce') { const el = document.createElement('div'); el.className = 'c-ann'; el.textContent = `[Объявление] ${m.text}`; logAppend(el); if (m.pk !== net.id) banner(m.text); }
  if (m.t === 'washok') { log(`Жрец очистил карму за ${m.cost} мон.`, 'good'); $('priest').hidden = true; }
  if (m.t === 'washerr') log(`Нужно ${m.cost} мон.`, 'bad');
  if (m.t === 'chat') chatAdd(m);
  if (m.t === 'pm') {
    const me = m.from === P?.name;
    lastPm = me ? m.to : m.from;
    chatLine('pm', m.from, m.text, { me, to: m.to });
    if (chatTab === 'pm') setChatTab('pm');
    if (!me) { $('chtabs').querySelector('[data-tab=pm]').classList.add('flash'); setTimeout(() => $('chtabs').querySelector('[data-tab=pm]')?.classList.remove('flash'), 1500); }
  }
  if (m.t === 'pmerr') log(`${m.to}: ${m.reason}`, 'bad');
  if (m.t === 'chatwait') log(`${CH_NAME[m.ch]}: можно писать через ${Math.ceil(m.wait / 1000)} с`, 'bad');
}
// ---- интерполяция сетевых существ: рисуем их на 150 мс в прошлом ----
const netTime = () => Date.now() - (net.off || 0) - 150;
function pushSnap(r, ts, x, y, z, ry) {
  r.buf ??= [];
  const last = r.buf[r.buf.length - 1];
  // телепорт или первое появление — без интерполяции
  if (!r.obj.visible || (last && Math.hypot(last.x - x, last.z - z) > 30)) { r.buf.length = 0; r.obj.position.set(x, y, z); r.obj.rotation.y = ry; }
  r.buf.push({ t: ts, x, y, z, r: ry });
  if (r.buf.length > 30) r.buf.shift();
}
function lerpEntity(r, rt, dt) {
  const B = r.buf; if (!B?.length) return;
  const o = r.obj;
  while (B.length > 2 && B[1].t <= rt) B.shift();
  const a = B[0], b = B[1];
  let x, y, z, ang;
  if (b && rt >= a.t) {
    const span = Math.max(1, b.t - a.t), k = Math.min((rt - a.t) / span, 1 + 250 / span);
    x = a.x + (b.x - a.x) * k; y = a.y + (b.y - a.y) * Math.min(k, 1); z = a.z + (b.z - a.z) * k;
    let dr = b.r - a.r; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); ang = a.r + dr * Math.min(k, 1);
  } else { x = a.x; y = a.y; z = a.z; ang = a.r; }
  if (!r.dead) o.position.set(x, y, z); else o.position.set(x, o.position.y, z);
  let dr = ang - o.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); o.rotation.y += dr * Math.min(1, dt * 15);
}

// ---- события боя: сервер сообщает, что произошло, клиент это рисует ----
const objOf = (e) => (e.m != null ? mobs.get(e.m) : e.p != null ? remotes.get(e.p) : null);
function onEvent(e) {
  if(e.k==='mob_fx'){const p=new THREE.Vector3(e.x,heightAt(e.x,e.z),e.z);ringFx(p,e.r||3,e.color||0x9050ff);if(e.text)banner(e.text);return;}
  if(e.k==='stun'){heroSt.stunUntil=performance.now()+e.sec*1000;heroSt.stunned=true;dest=null;return;}
  if (e.k === 'msg') return log(e.text, e.cls);
  if (e.k === 'cd') { cds[e.id] = performance.now() + e.cd * 1000; return; }
  if (e.k === 'hit' || e.k === 'miss') {
    const t = objOf(e); if (!t) return;
    const mine = !e.by;
    if (mine) { heroSt.attackT = 1; heroSt.combatUntil = performance.now() + 6000; }
    if (e.k === 'miss') return floatText(t.obj.position, 'Промах', '#aaaaaa');
    if (t.isMob) { t.flash = 0.12; t.st.hitT = 1; }
    emit('spark', t.obj.position, { n: e.crit ? 16 : 6, color: e.crit ? [0xffd040, 0xffffff] : [0xffffff, 0xffc080], speed: e.crit ? 8 : 5, up: 3, life: 0.4, size: e.crit ? 0.5 : 0.35, dy: 1.2 * (t.def?.size || 1) });
    floatText(t.obj.position, e.crit ? `${e.dmg}!` : String(e.dmg), mine ? (e.crit ? '#ffd040' : '#ffffff') : '#ffd0a0', e.crit);
    if (mine && P.cls !== 'mage') slashFx(t.obj.position, e.crit);
    return;
  }
  if (e.k === 'hurt') {
    heroSt.combatUntil = performance.now() + 6000;
    heroSt.hitT = 1;
    if (e.dodge) return floatText(hero.position, 'Уклонение', '#a0c0ff');
    emit('spark', hero.position, { n: 6, color: [0xff4040, 0xffa0a0], speed: 4, up: 2, life: 0.35 });
    floatText(hero.position, String(e.dmg), '#ff6060', !!e.crit);
    // отвечаем тому, кто бьёт, если стоим без цели
    if (!target) setTarget(e.fromP != null ? remotes.get(e.fromP) : mobs.get(e.from));
    return;
  }
  if (e.k === 'mdie') {
    const t = mobs.get(e.m); if (!t) return;
    t.dead = true; t.dieT = 0;
    emit('dust', t.obj.position, { n: 18, color: [0x8a8070, 0xb0a890], speed: 3, up: 1, life: 1, size: 0.6, grav: -1, dy: 0.5, spread: 1 });
    if (target === t) stopAttack();
    return;
  }
  if (e.k === 'kill') {
    log(`${e.name} повержен. Опыт +${e.xp}, монеты +${e.coins}`, 'good');
    if (e.boss) banner(`${e.name} повержен!`);
    return;
  }
  if (e.k === 'loot') {
    const it = ITEMS[e.id]; if (!it) return;
    log(`Получено: ${it.name}`, it.rare ? 'rare' : 'loot');
    if (it.rare) banner(`Редкая добыча: ${it.name}!`);
    return;
  }
  if (e.k === 'lvl') {
    hero.userData.levelUp?.({ ...heroSt, inCombat: performance.now() < (heroSt.combatUntil || 0) });
    banner(`Новый уровень: ${e.lvl}`); log(`Уровень повышен до ${e.lvl}!`, 'rare');
    ringFx(hero.position, 4, 0xffe070); pillarFx(hero.position, 0xffe070, 14);
    emit('spark', hero.position, { n: 60, color: [0xffe070, 0xffffff, 0xffb040], speed: 2, up: 9, life: 1.4, size: 0.4, grav: -2, spread: 1.4, swirl: 3, dy: 0.2, h: 1 });
    for (const id of CLASSES[P.cls].skills) if (SKILLS[id].lvl === e.lvl) log(`Изучено умение: ${SKILLS[id].name}`, 'good');
    return;
  }
  if (e.k === 'heal') {
    const col = e.kind === 'hp' ? '#60ff90' : '#6090ff';
    floatText(hero.position, `+${e.amount}`, col);
    emit('plus', hero.position, { n: e.skill ? 24 : 10, color: e.kind === 'hp' ? [0x60ff90, 0xc0ffd0] : [0x70a0ff, 0xc0d8ff], speed: 1, up: 3, life: 1.1, size: 0.45, grav: 0.5, spread: 1, dy: 0.3, h: 1.2 });
    if (e.skill) ringFx(hero.position, 2.5, SKILLS[e.skill].color);
    return;
  }
  if (e.k === 'cast') { cast = { id: e.id, t: e.t, total: e.t }; heroSt.casting = true; dest = null; return; }
  if (e.k === 'buff') {
    if (e.id === 'battle_cry') { heroSt.skillPulse = (heroSt.skillPulse || 0) + 1; heroSt.skillAnimation = 'Skill01'; }
    const sk = SKILLS[e.id];
    buffs.push({ stat: sk.stat, mul: sk.mul, until: performance.now() + e.dur * 1000, name: sk.name });
    ringFx(hero.position, 3, sk.color);
    emit('spark', hero.position, { n: 30, color: [sk.color, 0xffd0a0], speed: 2, up: 5, life: 0.9, size: 0.35, grav: -3, spread: 1, swirl: 6, dy: 0.2 });
    log(`${sk.name}: сила атаки +${Math.round((sk.mul - 1) * 100)}% на ${e.dur} с`, 'good');
    return;
  }
  if (e.k === 'cast_fx') {
    const sk = SKILLS[e.id], t = e.to ? objOf({ m: e.to.m, p: e.to.p }) : null;
    if (sk.kind === 'aoe') {
      const src = e.by != null ? remotes.get(e.by)?.obj.position : hero.position;
      if (!src) return;
      ringFx(src, sk.radius, sk.color);
      emit(sk.school === 'm' ? 'flake' : 'spark', src, { n: 70, color: sk.school === 'm' ? [0x80d0ff, 0xffffff] : [0xffd060, 0xffffff], speed: sk.radius * 2.2, up: 1.5, life: 0.6, size: 0.45, grav: -2, drag: 2.5, ring: true, dy: 0.8, spread: 0.5 });
    } else if (t) {
      if (sk.school === 'm') { const src = e.by != null ? remotes.get(e.by)?.obj.position : hero.position; if (src) boltFx(src, t, sk.color, () => flashFx(t.obj.position, sk.color)); }
      else flashFx(t.obj.position, sk.color);
    }
    return;
  }
  if (e.k === 'ench') {
    if (e.ok) { ringFx(hero.position, 2.2, e.color); flashFx(hero.position, e.color, 1.5); emit('spark', hero.position, { n: 40, color: [e.color, 0xffffff, 0xffe070], speed: 3, up: 6, life: 1, size: 0.4, grav: -4, spread: 0.6, swirl: 5 }); }
    else { flashFx(hero.position, 0x606060, 2); emit('dust', hero.position, { n: 30, color: [0x707070, 0x90e0ff], speed: 4, up: 3, life: 1.2, size: 0.5, grav: -5 }); }
    return;
  }
  if (e.k === 'dead') return die(e.by, e.loss);
  if (e.k === 'move') return teleportTo(e.x, e.z);
}

function updateRemotes(dt, t) {
  const now = performance.now();
  // интерполяция: рисуем чужих на 150 мс в прошлом между двумя снапшотами, при пропуске — по инерции до 250 мс
  const rt = netTime();
  for (const r of remotes.values()) {
    if (now - r.seen > 1500) r.obj.visible = false;
    if (!r.obj.visible || !r.buf?.length) continue;
    const o = r.obj;
    lerpEntity(r, rt, dt);
    r.st.moving = !!(r.a & 1); r.st.casting = !!(r.a & 4);
    r.st.attackT = Math.max(0, r.st.attackT - dt * 3);
    o.rotation.z += ((r.a & 8 ? Math.PI / 2 : 0) - o.rotation.z) * Math.min(1, dt * 8);
    o.userData.anim(t, r.st);
  }
  if (net.ok && t - net.lastSt > 0.1) {
    net.lastSt = t;
    const p = hero.position;
    netSend({ t: 'st', x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), r: +hero.rotation.y.toFixed(2), a: (heroSt.moving ? 1 : 0) | (heroSt.attackT > 0 ? 2 : 0) | (heroSt.casting ? 4 : 0) | (dead ? 8 : 0) });
  }
}
// чат: вкладки фильтруют окно; «+текст» — торговля, «/w Имя текст» или «"Имя текст» — личное, «/r текст» — ответ
const CH_NAME = { all: 'Общий', trade: 'Торговля', near: 'Рядом', pm: 'Личные' };
const CH_TAG = { all: '', trade: '+', near: '', pm: '' };
let chatTab = 'all', lastPm = null;
const unread = {};
const chatSet = (() => { try { return { sys: true, trade: true, near: true, bubbles: true, size: 12, ...JSON.parse(localStorage.getItem('l2w-chat')) }; } catch { return { sys: true, trade: true, near: true, bubbles: true, size: 12 }; } })();
function applyChatSet() {
  try { localStorage.setItem('l2w-chat', JSON.stringify(chatSet)); } catch { /* */ }
  $('syslog').hidden = !chatSet.sys;
  $('logbox').classList.toggle('no-trade', !chatSet.trade);
  $('logbox').classList.toggle('no-near', !chatSet.near);
  $('log').style.fontSize = `${chatSet.size}px`; $('syslog').style.fontSize = `${chatSet.size - 1}px`;
  for (const el of $('chatset').querySelectorAll('[data-set]')) { const k = el.dataset.set; if (el.type === 'checkbox') el.checked = !!chatSet[k]; else el.value = chatSet[k]; }
}
$('chatset').addEventListener('change', (e) => { const el = e.target.closest('[data-set]'); if (!el) return; chatSet[el.dataset.set] = el.type === 'checkbox' ? el.checked : +el.value; applyChatSet(); });
$('chatgear').addEventListener('click', () => { $('chatset').hidden = !$('chatset').hidden; });
applyChatSet();
function chatLine(ch, from, text, { me = false, to = null } = {}) {
  const el = document.createElement('div');
  el.className = `c-${ch}${me ? ' me' : ''}`;
  const who = document.createElement('b');
  const peer = to && me ? to : from;
  who.textContent = ch === 'pm' ? (me ? `-> ${to}: ` : `${from}: `) : `${CH_TAG[ch]}${from}: `;
  who.dataset.name = peer;
  el.append(who, document.createTextNode(text));
  logAppend(el);
  if (ch !== chatTab && ch !== 'all' && !me) { unread[ch] = (unread[ch] || 0) + 1; renderTabs(); }
}
function chatAdd(m) {
  const me = m.id === net.id;
  chatLine(m.ch, m.from, m.text, { me });
  if (!chatSet.bubbles) return;
  const r = [...remotes.values()].find((x) => x.name === m.from && x.obj.visible);
  if (r || me) bubble(me ? hero : r.obj, m.text);
}
function renderTabs() {
  for (const b of $('chtabs').querySelectorAll('[data-tab]')) {
    const t = b.dataset.tab;
    b.classList.toggle('on', t === chatTab);
    b.textContent = t === 'all' ? 'Все' : CH_NAME[t];
    if (unread[t]) { const i = document.createElement('i'); i.textContent = unread[t]; b.append(i); }
  }
}
function setChatTab(tab) {
  chatTab = tab; unread[tab] = 0; $('logbox').dataset.tab = tab;
  renderTabs();
  $('chatin').placeholder = tab === 'pm' ? (lastPm ? `Личное для ${lastPm}` : '/w Имя текст') : `${CH_NAME[tab]}${MOBILE ? '' : ' — Enter; «+» торговля, /w Имя — личное'}`;
  $('logbox').scrollTop = 1e9;
}
$('chtabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setChatTab(b.dataset.tab); });
// клик по имени — написать лично
$('logbox').addEventListener('click', (e) => {
  const n = e.target.closest('b[data-name]')?.dataset.name;
  if (!n || n === P?.name) return;
  $('chatin').value = `/w ${n} `; $('chatin').focus();
});
function whisper(to, text) {
  if (!to || !text) return log('Формат: /w Имя текст', 'bad');
  netSend({ t: 'pm', to, text });
}
function sendChat() {
  let text = $('chatin').value.trim(); $('chatin').value = '';
  if (!text) return;
  if (!net.ok) return log('Нет связи с сервером', 'bad');
  let mm;
  if ((mm = text.match(/^\/(?:w|ш|л)\s+(\S+)\s+([\s\S]+)/i)) || (mm = text.match(/^"(\S+)\s+([\s\S]+)/))) return whisper(mm[1], mm[2]);
  if ((mm = text.match(/^\/(?:r|о)\s+([\s\S]+)/i))) return whisper(lastPm, mm[1]);
  if (chatTab === 'pm') return lastPm ? whisper(lastPm, text) : log('Кому? Напишите /w Имя текст', 'bad');
  let ch = CH_NAME[chatTab] && chatTab !== 'pm' ? chatTab : 'all';
  if (text.startsWith('+')) { ch = 'trade'; text = text.slice(1).trim(); }
  if (text) netSend({ t: 'chat', ch, text });
}
$('chatin').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') { sendChat(); if (!MOBILE) $('chatin').blur(); }
  if (e.key === 'Escape') $('chatin').blur();
});
$('chatin').addEventListener('focus', () => { for (const k in keys) keys[k] = false; $('log').classList.add('open'); });
$('chatin').addEventListener('blur', () => { if (!MOBILE) $('log').classList.remove('open'); });
$('chatsend').addEventListener('pointerdown', (e) => { e.preventDefault(); sendChat(); });
$('chatclose').addEventListener('pointerdown', (e) => { e.preventDefault(); $('chatin').blur(); $('log').classList.remove('open'); });
$('logbox').addEventListener('click', () => { if (MOBILE && !$('log').classList.contains('open')) { $('log').classList.add('open'); $('logbox').scrollTop = 1e9; } });
if (MOBILE && window.visualViewport) {
  const fit = () => { const vv = visualViewport; $('log').style.bottom = $('log').classList.contains('open') ? `${Math.max(0, innerHeight - vv.height - vv.offsetTop) + 6}px` : ''; };
  visualViewport.addEventListener('resize', fit); visualViewport.addEventListener('scroll', fit);
  new MutationObserver(fit).observe($('log'), { attributes: true, attributeFilter: ['class'] });
}
// реплика над головой
function bubble(obj, text) {
  const el = document.createElement('div'); el.className = 'bubble'; el.textContent = text.length > 60 ? text.slice(0, 57) + '…' : text;
  $('labels').append(el);
  fx.push({ el, follow: obj, life: 5, max: 5 });
}

const nameColor = (k) => ['#ffffff', '#d890ff', '#ff4a4a'][k || 0];
const myStatus = () => (P?.karma > 0 ? 2 : net.flagUntil > performance.now() ? 1 : 0);

// ================= Ввод =================
const keys = {};
const cam = { yaw: Math.PI, pitch: 0.55, dist: 18 };
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let rmb = false, lastX = 0, lastY = 0;
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
function pickAt(cx, cy) {
  ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const dropHit=ray.intersectObjects(groundLoot.rayTargets,true)[0];
  if(dropHit){const uid=dropHit.object.userData.groundLoot,d=groundLoot.list.get(uid);if(d){pickUid=uid;dest=new THREE.Vector3(d.x,heightAt(d.x,d.z),d.z);stopAttack();return;}}

  const pickables = [...[...mobs.values()].filter((m) => !m.dead && m.obj.visible && flatDist(m.obj.position, hero.position) < 120).map((m) => m.obj), ...npcs.map((n) => n.obj), ...[...remotes.values()].filter((r) => r.obj.visible).map((r) => r.obj)];
  let hit = ray.intersectObjects(pickables, true)[0];
  // на телефоне палец толще модели — ищем ближайшего к точке касания моба в радиусе 36 px
  if (!hit && MOBILE) {
    let best = null, bd = 36;
    for (const m of mobs.values()) if (!m.dead && m.obj.visible && flatDist(m.obj.position, hero.position) < 80) { const p = toScreen(_v.copy(m.obj.position).setY(m.obj.position.y + 1)); const d = Math.hypot(p.x - cx, p.y - cy); if (p.vis && d < bd) { bd = d; best = m; } }
    if (best) hit = { object: best.obj };
  }
  if (hit) {
    const m = hit.object.userData.mob || hit.object.userData.remote, n = hit.object.userData.npc;
    if (m) { if (target === m) { attackTarget(m); dest = null; } else setTarget(m); }
    if (n) { setTarget(null); target = npcs.find((x) => x.id === n.id); dest = null; talkTo = target; }
    return;
  }
  const g = ray.intersectObject(ground)[0];
  let p = g?.point;
  // катакомбы: пол — плоскость y=0
  if (hero.position.x > DUNGEON.x0 - 100) { const t = -ray.ray.origin.y / ray.ray.direction.y; if (t > 0) p = ray.ray.at(t, new THREE.Vector3()); }
  if (p) { dest = p.clone(); stopAttack(); talkTo = null; clickMark(p); }
}
// касания: тап — выбор/ходьба, один палец — орбита, два — щипок-зум и орбита
let orbDX = 0, orbDY = 0, zoomAcc = 0;
const touches = new Map();
let touchDrag = false, pinch0 = 0, mid0 = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!P) return;
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* */ }
    if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); mid0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; touchDrag = true; }
    else touchDrag = false;
    return;
  }
  if (e.button === 2) { rmb = true; lastX = e.clientX; lastY = e.clientY; return; }
  if (e.button !== 0 || dead) return;
  pickAt(e.clientX, e.clientY);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  const t = touches.get(e.pointerId); if (!t) return;
  const px = t.x, py = t.y; t.x = e.clientX; t.y = e.clientY;
  if (touches.size === 1) {
    if (Math.hypot(t.x - t.x0, t.y - t.y0) > 10) touchDrag = true;
    if (touchDrag) { orbDX += (t.x - px) * 1.4; orbDY += (t.y - py) * 1.4; }
  } else if (touches.size === 2) {
    const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (pinch0 > 0 && d > 0) zoomAcc += Math.log(pinch0 / d);
    orbDX += (mid.x - mid0.x) * 1.4; orbDY += (mid.y - mid0.y) * 1.4;
    pinch0 = d; mid0 = mid;
  }
});
const touchEnd = (e) => {
  const t = touches.get(e.pointerId); if (!t) return;
  touches.delete(e.pointerId);
  if (!touchDrag && touches.size === 0 && e.type === 'pointerup' && performance.now() - t.t0 < 450 && !dead) pickAt(t.x, t.y);
  if (touches.size === 0) touchDrag = false;
};
renderer.domElement.addEventListener('pointerup', touchEnd);
renderer.domElement.addEventListener('pointercancel', touchEnd);
addEventListener('pointerup', (e) => { if (e.button === 2) rmb = false; });
addEventListener('pointermove', (e) => {
  if (!rmb) return;
  cam.yaw += (e.clientX - lastX) * 0.006; cam.pitch = THREE.MathUtils.clamp(cam.pitch - (e.clientY - lastY) * 0.005, -0.35, 1.5);
  lastX = e.clientX; lastY = e.clientY;
});
// трекпад: два пальца — орбита, щипок (приходит как Ctrl+колесо) — зум; колесо мыши — зум
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  const k = e.deltaMode === 1 ? 16 : 1;
  const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
  if (e.ctrlKey) zoomAcc += e.deltaY * k * 0.01;
  else if (mouseWheel) zoomAcc += e.deltaY * k * 0.0012;
  else { orbDX += e.deltaX * k; orbDY += e.deltaY * k; }
}, { passive: false });
// накопленные дельты расходуем плавно — события трекпада приходят пачками
function applyCamInput(dt) {
  const kk = 1 - Math.exp(-dt * 22);
  const dx = orbDX * kk, dy = orbDY * kk, dz = zoomAcc * kk;
  orbDX -= dx; orbDY -= dy; zoomAcc -= dz;
  cam.yaw += dx * 0.005;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch - dy * 0.004, -0.35, 1.5);
  cam.dist = THREE.MathUtils.clamp(cam.dist * Math.exp(dz), 4, 70);
}
// Safari: щипок приходит жестами
let gs = 1;
addEventListener('gesturestart', (e) => { e.preventDefault(); gs = e.scale; });
addEventListener('gesturechange', (e) => { e.preventDefault(); zoomAcc += Math.log(gs / e.scale); gs = e.scale; });
addEventListener('keydown', (e) => {
  if (!P || e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  const map = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4 };
  if (e.code in map) useSkill(skillsOf(P)[map[e.code] + (e.shiftKey ? 5 : 0)]);
  if (e.code === 'Digit6') useItem('potion_hp');
  if (e.code === 'Digit7') useItem('potion_mp');
  if (e.code === 'KeyV') { cam.yaw = hero.rotation.y + Math.PI; cam.pitch = 0.55; cam.dist = 18; }
  if (e.code === 'Enter') { e.preventDefault(); $('chatin').focus(); return; }
  if (e.code === 'KeyI') toggle('inv');
  if (e.code === 'KeyC') toggle('char');
  if (e.code === 'KeyM') toggle('bigmap');
  if (e.code === 'KeyP') toggle('pwin');
  if (e.code === 'KeyX') netSend({t:'sit'});
  if (e.code === 'Tab') { e.preventDefault(); nextTarget(); }
  if (e.code === 'KeyF' && target?.isMob) { attackTarget(target); dest = null; }
  if (e.code === 'Escape') { for (const id of ['inv', 'char', 'shop', 'tp', 'bigmap', 'priest', 'mentor']) $(id).hidden = true; enchMode = null; setTarget(null); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
function nextTarget() {
  const list = [...mobs.values()].filter((m) => !m.dead && m.obj.visible && flatDist(m.obj.position, hero.position) < 40).sort((a, b) => flatDist(a.obj.position, hero.position) - flatDist(b.obj.position, hero.position));
  if (!list.length) return;
  const i = list.indexOf(target); setTarget(list[(i + 1) % list.length]);
}
let talkTo = null;
const marker = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.8, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x80ffb0, transparent: true }));
scene.add(marker); marker.visible = false;
function clickMark(p) { marker.position.copy(p).add(new THREE.Vector3(0, 0.2, 0)); marker.visible = true; marker.material.opacity = 1; }
const selRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.2, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5050, transparent: true, opacity: 0.8 }));
scene.add(selRing);

// полный экран: где есть API — включаем, на iPhone (Safari без API) — инструкция «На экран Домой»
const STANDALONE = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
function goFullscreen() {
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req) Promise.resolve(req.call(el)).catch(() => { $('fshint').hidden = false; });
  else $('fshint').hidden = false;
}
$('fshint-ok').onclick = () => { $('fshint').hidden = true; };
if (MOBILE && STANDALONE) $('fsbtn').hidden = true;
// обновления: сравниваем номер сборки с version.json на сервере
if (!import.meta.env.DEV) setInterval(async () => {
  try { const v = await (await fetch('version.json', { cache: 'no-store' })).json(); if (v.build !== __BUILD__) $('update').hidden = false; } catch { /* нет сети */ }
}, 60000);
$('update-go').onclick = () => location.reload();

// Кнопки меню (ПК и телефон)
function menuClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || !P) return;
  const a = b.dataset.act;
  if (a === 'attack') { if (target?.isMob && !target.dead) { attackTarget(target); dest = null; } else nextTarget(); }
  if (a === 'next') nextTarget();
  if (a === 'inv') toggle('inv');
  if (a === 'char') toggle('char');
  if (a === 'map') toggle('bigmap');
  if (a === 'party') toggle('pwin');
  if (a === 'cam') { cam.yaw = hero.rotation.y + Math.PI; cam.pitch = 0.55; cam.dist = 18; }
  if (a === 'fs') goFullscreen();
}
$('menu').addEventListener('click', menuClick);
// ================= Телефон: джойстик и кнопки =================
const joy = { x: 0, y: 0 };
if (MOBILE) {
  const pad = $('joy'), knob = pad.firstElementChild;
  let jid = null, cx = 0, cy = 0;
  pad.addEventListener('pointerdown', (e) => { e.preventDefault(); jid = e.pointerId; try { pad.setPointerCapture(jid); } catch { /* синтетическое касание */ } const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; moveJoy(e); });
  const moveJoy = (e) => {
    if (e.pointerId !== jid) return;
    let dx = (e.clientX - cx) / 50, dy = (e.clientY - cy) / 50; const L = Math.hypot(dx, dy); if (L > 1) { dx /= L; dy /= L; }
    joy.x = dx; joy.y = dy; knob.style.transform = `translate(${dx * 38}px,${dy * 38}px)`;
  };
  pad.addEventListener('pointermove', moveJoy);
  const end = (e) => { if (e.pointerId !== jid) return; jid = null; joy.x = joy.y = 0; knob.style.transform = ''; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  $('fsbtn').onclick = goFullscreen;
  $('mbtns').addEventListener('click', menuClick);
  // Safari: не масштабировать страницу
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
}

// ================= Движение =================
function moveEntity(pos, dir, dist, radius) {
  pos.x += dir.x * dist; pos.z += dir.z * dist;
  nav.resolveMove(pos,radius);
  const lim = MAP / 2 - 20;
  if (pos.x < DUNGEON.x0 - 100) { pos.x = THREE.MathUtils.clamp(pos.x, -lim, lim); pos.z = THREE.MathUtils.clamp(pos.z, -lim, lim); }
  pos.y = heightAt(pos.x, pos.z);
}
const tmp = new THREE.Vector3();
function updateHero(dt) {
  const s = stats();
  heroSt.moving = false;heroSt.sitting=!!P.sitting;
  heroSt.attackT = Math.max(0, heroSt.attackT - dt * 3);
  heroSt.stunned=performance.now()<(heroSt.stunUntil||0);
  if (dead || heroSt.stunned) return;
  // полоса каста: время отмеряет сервер, клиент только дорисовывает
  if (cast) {
    cast.t -= dt;
    if (Math.random() < dt * 30) { const col = cast.id === 'escape' ? 0xa080ff : SKILLS[cast.id].color; emit('dot', hero.position, { n: 1, color: [col, 0xffffff], speed: 0.4, up: 1.5, life: 0.6, size: 0.3, grav: 0, spread: 0.9, swirl: 5, dy: 0.4, h: 1.2 }); }
    if (cast.t <= 0) { cast = null; heroSt.casting = false; }
    return;
  }
  // WASD — прямое управление относительно камеры
  const kx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + joy.x, kz = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0) + joy.y;
  if (Math.abs(kx) + Math.abs(kz) > 0.15) {
    dest = null; stopAttack(); talkTo = null; pendingSkill=null;
    const f = new THREE.Vector3(Math.sin(cam.yaw + Math.PI), 0, Math.cos(cam.yaw + Math.PI)), r = new THREE.Vector3(-f.z, 0, f.x);
    const amt = Math.min(1, Math.hypot(kx, kz));
    const dir = f.multiplyScalar(-kz).add(r.multiplyScalar(kx)).normalize();
    moveEntity(hero.position, dir, s.speed * amt * dt, 0.6); hero.rotation.y = Math.atan2(dir.x, dir.z); heroSt.moving = true;
  }
  // разговор с NPC
  if (talkTo) {
    const d = flatDist(hero.position, talkTo.obj.position);
    if (d > 3.5) { stepTo(talkTo.obj.position, s.speed, dt); }
    else { faceTo(talkTo.obj.position); openNpc(talkTo); talkTo = null; }
  }
  // атака: клиент подводит героя в радиус и держит цель, удары отбивает сервер
  if (attacking && (target?.isMob || target?.isPlayer)) {
    if (target.dead) stopAttack();
    else {
      const d = flatDist(hero.position, target.obj.position);
      const skillRange = pendingSkill ? SKILLS[pendingSkill].range : s.range;
      if (d > skillRange + target.radius - 0.6) stepTo(target.obj.position, s.speed, dt); // подходим чуть ближе, чем нужно серверу
      else {
        faceTo(target.obj.position);
        if (pendingSkill) { const id = pendingSkill; pendingSkill = null; useSkill(id); }
      }
    }
  } else if (dest) {
    if (flatDist(hero.position, dest) < 0.6) dest = null;
    else stepTo(dest, s.speed, dt);
  }
}
function stepTo(p, speed, dt) {
  const dir = tmp.set(p.x - hero.position.x, 0, p.z - hero.position.z);
  const L = dir.length(); if (L < 0.01) return;
  dir.divideScalar(L);
  moveEntity(hero.position, dir, Math.min(L, speed * dt), 0.6);
  hero.rotation.y = Math.atan2(dir.x, dir.z); heroSt.moving = true;
}

// мобы приходят снапшотами: интерполируем как других игроков
function updateMobs(dt, t) {
  const now = performance.now(), rt = netTime();
  for (const [id, m] of mobs) {
    if (now - m.seen > 8000) { scene.remove(m.obj); mobs.delete(id); if (target === m) { target = null; stopAttack(); } continue; }
    if (!m.obj.visible) continue;
    lerpEntity(m, rt, dt);
    // вспышка при попадании
    if (m.flash > 0 || m.flashOn) {
      m.flash -= dt;
      const on = m.flash > 0;
      if (on !== m.flashOn) {
        m.flashOn = on;
        m.obj.traverse((o) => { if (!o.material?.emissive) return; o.material.userData.em ??= o.material.emissive.getHex(); o.material.emissive.setHex(on ? 0xaa2010 : o.material.userData.em); });
      }
    }
    m.st.hitT = Math.max(0, (m.st.hitT || 0) - dt * 5);
    m.st.moving = !!(m.a & 1);
    m.st.attackT = Math.max(0, m.st.attackT - dt * 3);
    // падение и уход в землю
    if (m.dead) {
      if (m.dieT == null) m.dieT = 0;
      if (m.dieT < 3) {
        m.dieT += dt;
        const k = Math.min(1, m.dieT * 3.5);
        m.obj.rotation.z = (Math.PI / 2) * k * k;
        if (m.dieT > 1.3) m.obj.position.y -= dt * 1.2 * (m.def.size || 1);
        if (m.dieT > 2.5) m.obj.visible = false;
      }
    } else if (m.dieT != null) { m.dieT = null; m.obj.rotation.z = 0; }
    m.obj.userData.anim(t, m.st);
  }
}

// ================= Экран → подписи =================
const _v = new THREE.Vector3();
function toScreen(p) {
  _v.copy(p).project(camera);
  return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight, vis: _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1 };
}
const labelPool = [];
function updateLabels() {
  const list = [];
  for (const m of mobs.values()) if (!m.dead && m.obj.visible) { const d = flatDist(m.obj.position, hero.position); if (d < 45) list.push({ d, m }); }
  list.sort((a, b) => a.d - b.d);
  const shown = list.slice(0, MOB_LABEL_MAX).map((x) => ({ pos: x.m.obj.position, h: 2.6 * (x.m.def.size || 1) + 0.6, text: `${x.m.def.name} ${x.m.def.lvl}`, color: levelColor(x.m.def.lvl), sel: x.m === target }));
  for (const n of npcs) if (flatDist(n.obj.position, hero.position) < 45) shown.push({ pos: n.obj.position, h: 2.9, text: n.name, color: '#a0e0ff', sel: n === target });
  for (const r of remotes.values()) if (r.obj.visible && flatDist(r.obj.position, hero.position) < 70) shown.push({ pos: r.obj.position, h: 2.9, text: r.name, color: r.k ? nameColor(r.k) : '#b8ffb0', sel: r === target });
  shown.push({ pos: hero.position, h: 2.9, text: P.name, color: nameColor(myStatus()) });
  for (let i = 0; i < Math.max(shown.length, labelPool.length); i++) {
    let el = labelPool[i];
    if (!el) { el = document.createElement('div'); el.className = 'nlabel'; $('labels').append(el); labelPool.push(el); }
    const s = shown[i];
    if (!s) { el.style.display = 'none'; continue; }
    const p = toScreen(_v.copy(s.pos).setY(s.pos.y + s.h));
    if (!p.vis) { el.style.display = 'none'; continue; }
    el.style.display = '';
    if (el._t !== s.text) { el._t = s.text; el.textContent = s.text; }
    el.style.color = s.color; el.classList.toggle('sel', !!s.sel);
    el.style.transform = `translate(${p.x | 0}px,${p.y | 0}px) translate(-50%,-100%)`;
  }
}

// ================= Интерфейс =================
const bar = (id, v, max, text) => { $(id).firstElementChild.style.width = `${Math.max(0, Math.min(100, (v / max) * 100))}%`; $(id).lastElementChild.textContent = text ?? `${Math.round(v)} / ${Math.round(max)}`; };
function renderHud() {
  const s = stats();
  $('pname').textContent = `${P.name} · ${CLASSES[P.cls].name}`;
  $('plvl').textContent = P.lvl;
  bar('hpbar', P.hp, s.maxHp); bar('mpbar', P.mp, s.maxMp);
  const need = xpToNext(P.lvl); bar('xpbar', P.xp, need, P.lvl >= MAX_LEVEL ? 'максимум' : `${((P.xp / need) * 100).toFixed(1)}%`);
  $('coins').textContent = P.coins.toLocaleString('ru');
  const z = zoneAt(hero.position.x, hero.position.z);
  $('zone').textContent = `${z.name} · ${z.lv}`;
  $('online').textContent = net.ok ? `Онлайн: ${net.online}` : 'Нет связи с сервером';
  if (target) {
    $('target').hidden = false;
    if (target.isMob) { $('tname').textContent = `${target.def.name}`; $('tname').style.color = levelColor(target.def.lvl); $('tlvl').textContent = `ур. ${target.def.lvl}${target.def.aggro ? ' · агрессивный' : ''}`; bar('tbar', target.hp, 100, `${target.hp}%`); $('tbar').hidden = false; }
    else if (target.isPlayer) { $('tname').textContent = target.name; $('tname').style.color = nameColor(target.k); $('tlvl').textContent = `ур. ${target.look?.lvl || '?'} · ${['игрок', 'флаг PvP', 'PK'][target.k || 0]}`; bar('tbar', target.hp, 100, `${target.hp}%`); $('tbar').hidden = false; }
    else { $('tname').textContent = target.name; $('tname').style.color = '#a0e0ff'; $('tlvl').textContent = 'NPC'; $('tbar').hidden = true; }
  } else $('target').hidden = true;
  $('stats').textContent = `Физ. атака ${Math.round(s.patk)} · Маг. атака ${Math.round(s.matk)} · Физ. защ. ${Math.round(s.pdef)} · Маг. защ. ${Math.round(s.mdef)}`;
  // кулдауны
  const now = performance.now();
  for (const el of document.querySelectorAll('#skills .slot[data-skill]')) {
    const id = el.dataset.skill, left = Math.max(0, (cds[id] || 0) - now) / 1000;
    el.querySelector('.cd').style.height = `${(left / SKILLS[id].cd) * 100}%`;
    el.classList.toggle('locked', !skillLv(P, id));
  }
  for (const el of document.querySelectorAll('#skills .slot[data-item]')) el.querySelector('.n').textContent = invCount(el.dataset.item);
  $('castbar').hidden = !cast;
  if (cast) { const total = cast.total || 3; $('castbar').firstElementChild.style.width = `${(1 - cast.t / total) * 100}%`; $('castbar').lastElementChild.textContent = cast.id === 'escape' ? 'Свиток возврата' : SKILLS[cast.id].name; }
  $('buffs').innerHTML = buffs.filter((b) => b.until > now).map((b) => `<span>${b.name} ${Math.ceil((b.until - now) / 1000)}с</span>`).join('');
}
let skillPage = 0;
function renderSkills() {
  const all = skillsOf(P), pages = Math.ceil(all.length / 5);
  skillPage = Math.min(skillPage, pages - 1);
  const c = { skills: MOBILE ? all.slice(skillPage * 5, skillPage * 5 + 5) : all };
  $('skills').classList.toggle('many', !MOBILE && all.length > 5);
  $('skills').innerHTML = c.skills.map((id, i) => `<div class="slot" data-skill="${id}" title="${SKILLS[id].name} · мана ${SKILLS[id].mp} · перезарядка ${SKILLS[id].cd} с · с ${SKILLS[id].lvl} ур.">${png(id) ? `<i class="ico">${png(id)}</i>` : `<i style="background:#${SKILLS[id].color.toString(16).padStart(6, '0')}"></i>`}<b>${i + 1}</b><small>${SKILLS[id].name}</small><div class="cd"></div></div>`).join('')
    + `<button class="slot" data-attack title="Обычная атака (F)"><b>F</b><small>Атака</small></button>` + (MOBILE && pages > 1 ? `<button class="slot" data-page><small>Умения ${skillPage + 1}/${pages} ⇅</small></button>` : '')
    + ['potion_hp', 'potion_mp'].map((id, i) => `<div class="slot" data-item="${id}" title="${ITEMS[id].name}">${png(id) ? `<i class="ico">${png(id)}</i>` : `<i style="background:#${ITEMS[id].color.toString(16).padStart(6, '0')};border-radius:50%"></i>`}<b>${i + 6}</b><small>${ITEMS[id].name}</small><span class="n"></span></div>`).join('');
}
$('skills').addEventListener('click', (e) => {
  const s = e.target.closest('.slot'); if (!s) return;
  if (s.hasAttribute('data-page')) { skillPage = (skillPage + 1) % Math.ceil(skillsOf(P).length / 5); return renderSkills(); }
  if (s.hasAttribute('data-attack')) { if (!target) nextTarget(); if (target) attackTarget(target); return; }
  if (s.dataset.skill) useSkill(s.dataset.skill); else useItem(s.dataset.item);
});
// ---- иконки предметов (SVG, цвет — цвет предмета) ----
const ICON = {
  sword: '<path d="M19 2l3 3-11 11-3-3z"/><path d="M6 12l6 6-2 2-1.5-1.5L5 22l-2-2 3.5-3.5L5 15z"/>',
  staff: '<circle cx="17" cy="6" r="4"/><path d="M14.5 9l1.8 1.8L5.5 21.6 3.7 19.8z"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>',
  head: '<path d="M4 16c0-6 3.6-10 8-10s8 4 8 10v2h-3v-4h-2v5H9v-5H7v4H4z"/>',
  hat: '<path d="M12 2l5 10 5 3v2H2v-2l5-3z"/>',
  armor: '<path d="M8 3l4 2 4-2 5 4-3 3v11H6V10L3 7z"/>',
  robe: '<path d="M9 2h6l2 6 4 14H3L7 8z"/>',
  legs: '<path d="M6 3h12l-1 18h-4l-1-10-1 10H7z"/>',
  gloves: '<path d="M7 21V12L4.5 8.5 6 7.5 9 10V4h2v6h1V3h2v7h1V5h2v10l-2 6z"/>',
  feet: '<path d="M7 3h6v11l7 3v4H4v-4l3-2z"/>',
  neck: '<path d="M5 2c0 7 3 11 7 11s7-4 7-11h-2c0 5-2 9-5 9S7 7 7 2z"/><path d="M12 13l4 4-4 5-4-5z"/>',
  ear: '<circle cx="12" cy="5" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9l4.5 6.5L12 22l-4.5-6.5z"/>',
  ring: '<circle cx="12" cy="14" r="6.5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M8.5 6L12 2l3.5 4L12 8.5z"/>',
  potion: '<path d="M10 2h4v5l5 6c1.5 4.5-1.5 9-7 9s-8.5-4.5-7-9l5-6z"/>',
  scroll: '<path d="M7 2h11a3 3 0 010 6h-2v11a3 3 0 01-3 3H5a3 3 0 010-6h2V5a3 3 0 00-1-3z"/>',
  loot: '<path d="M12 2l7 7-7 13-7-13z"/>',
};
const iconKind = (it) => it.slot === 'weapon' ? (it.twoHand ? 'staff' : 'sword') : it.slot === 'armor' ? (it.robe ? 'robe' : 'armor') : it.slot === 'head' ? (it.set === 'apprentice' || it.set === 'mystic' ? 'hat' : 'head')
  : it.slot || (it.use === 'hp' || it.use === 'mp' ? 'potion' : it.use ? 'scroll' : 'loot');
for (const [k, v] of Object.entries(ITEMS)) v.id ||= k; // иконка предмета ищется по его id
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
// нарисованные иконки (tools/gen-icons.mjs); чего нет в списке — рисуем векторным значком, как раньше
const PNG = new Set();
fetch('assets/icons/index.json').then((r) => r.json()).then((a) => { a.forEach((id) => PNG.add(id)); if (P) renderSkills(); }).catch(() => { /* нет иконок — не беда */ });
const png = (id) => (PNG.has(id) ? `<img class="png" src="assets/icons/${id}.png" alt="">` : null);
const icon = (it) => (it.mat ? `<img class="png" src="assets/icons/resources/${it.id}.png" alt="${it.name}">` : png(it.id)) || `<svg viewBox="0 0 24 24" fill="currentColor" style="color:${hex(it.color)}">${ICON[iconKind(it)]}</svg>`;
const sw = (c, it) => it ? `<i class="sw ico">${icon(it)}</i>` : `<i class="sw" style="background:${hex(c)}"></i>`;
const STAT_NAMES = { patk: 'Физ. атака', matk: 'Маг. атака', pdef: 'Физ. защита', mdef: 'Маг. защита', hp: 'Здоровье', mp: 'Мана', crit: 'Крит. шанс', speed: 'Скорость', cast: 'Скорость каста' };
const fmtBonus = (k, v) => `${STAT_NAMES[k]} ${v > 0 ? '+' : ''}${k === 'crit' || k === 'cast' ? Math.round(v * 100) + '%' : v}`;
const itemDesc = (it, e = 0) => [it.patk && `физ. атака ${enchValue(it, 'patk', e)}`, it.matk && `маг. атака ${enchValue(it, 'matk', e)}`, it.pdef && `физ. защ. ${enchValue(it, 'pdef', e)}`, it.mdef && `маг. защ. ${enchValue(it, 'mdef', e)}`,
  it.mp && `мана +${it.mp}`, it.crit && `крит +${Math.round(it.crit * 100)}%`, it.lvl && `с ${it.lvl} ур.`, it.grade && `грейд ${GRADES[it.grade]}`].filter(Boolean).join(' · ');
const SLOT_NAMES = { weapon: 'оружие', shield: 'щит', head: 'шлем', armor: 'доспех', legs: 'поножи', gloves: 'перчатки', feet: 'сапоги', neck: 'ожерелье', ear: 'серьга', ring: 'кольцо' };
function cellHtml(it, n, e, attrs, extra = '') {
  return `<div class="cell g-${it.grade || 'x'} ${it.rare ? 'rare' : ''} ${extra}" ${attrs}>${icon(it)}${e ? `<b class="en">+${e}</b>` : ''}${n > 1 ? `<span class="cnt">${n}</span>` : ''}${it.grade && it.grade !== 'none' ? `<span class="gr">${GRADES[it.grade]}</span>` : ''}</div>`;
}
// подсказка по предмету
function itemInfo(it, e, where) {
  const lines = [`<b class="nm ${it.rare ? 'rare' : ''}">${e ? `+${e} ` : ''}${it.name}</b>`];
  if (it.slot) lines.push(`<small>${SLOT_NAMES[it.slot]}${it.twoHand ? ', двуручное' : ''}${it.robe ? ', мантия' : ''}${it.full ? ' (закрывает поножи)' : ''}</small>`);
  const d = itemDesc(it, e); if (d) lines.push(`<small>${d}</small>`);
  if (it.use === 'hp' || it.use === 'mp') lines.push(`<small>восстанавливает ${it.amount} ${it.use === 'hp' ? 'здоровья' : 'маны'}</small>`);
  if (it.use === 'ench') lines.push(`<small>до +${SAFE_ENCH} — без риска, дальше шанс ${Math.round(ENCH_CHANCE * 100)}%, при неудаче вещь рассыпается в кристаллы</small>`);
  if (it.use === 'escape') lines.push('<small>через 3 с переносит в город возрождения</small>');
  if (it.loot) lines.push('<small>трофей — продать торговцу</small>');
  if (it.set) {
    const st = SETS[it.set], worn = new Set(Object.values(P.equip));
    lines.push(`<small class="set">${st.name}: ${st.parts.map((x) => `<span class="${worn.has(x) ? 'on' : ''}">${ITEMS[x].name}</span>`).join(', ')}<br>Полный комплект: ${Object.entries(st.bonus).map(([k, v]) => fmtBonus(k, v)).join(', ')}</small>`);
  }
  const err = it.slot && where !== 'slot' ? wearError(P, it) : null;
  if (err && it.slot) lines.push(`<small class="bad">${err}</small>`);
  lines.push(`<small>вес ${it.w || 0}</small>`);
  return lines.join('');
}
let sel = null; // { bag: i } | { slot: id }
function renderInv() {
  if (!P) return;
  const s = stats();
  $('doll').innerHTML = SLOTS.map((sl) => {
    const id = P.equip[sl.id], it = ITEMS[id];
    const on = sel?.slot === sl.id ? 'sel' : '';
    const blocked = !id && ((sl.id === 'shield' && ITEMS[P.equip.weapon]?.twoHand) || (sl.id === 'legs' && ITEMS[P.equip.armor]?.full));
    return it ? cellHtml(it, 1, P.enc[sl.id], `data-slot="${sl.id}" title="${it.name}"`, on)
      : `<div class="cell empty ${blocked ? 'blocked' : ''}" data-slot="${sl.id}"><em>${sl.name}</em></div>`;
  }).join('');
  const N = Math.max(30, Math.ceil((P.inv.length + 1) / 6) * 6);
  let h = '';
  for (let i = 0; i < N; i++) { const e = P.inv[i]; h += e ? cellHtml(ITEMS[e.id], e.n, e.e, `data-bag="${i}"`, sel?.bag === i ? 'sel' : '') : '<div class="cell empty" data-bag="-1"></div>'; }
  $('inv-grid').innerHTML = h;
  // выбранный предмет
  let info = '';
  if (enchMode) info = `<div class="ench">${ITEMS[enchMode].name} (${invCount(enchMode)}): нажмите на ${ITEMS[enchMode].ench === 'w' ? 'оружие' : 'броню или украшение'}. <button data-cmd="noench">Отмена</button></div>`;
  else if (sel) {
    const e = sel.slot ? { id: P.equip[sel.slot], e: P.enc[sel.slot] } : P.inv[sel.bag];
    const it = ITEMS[e?.id];
    if (it) {
      const btns = sel.slot ? '<button data-cmd="off">Снять</button>'
        : [it.slot && '<button data-cmd="on">Надеть</button>', it.use && '<button data-cmd="use">Использовать</button>', !it.rare && '<button data-cmd="drop">Выбросить</button>'].filter(Boolean).join('');
      info = itemInfo(it, e.e || 0, sel.slot ? 'slot' : 'bag') + `<div class="btns">${btns}</div>`;
    } else sel = null;
  }
  $('inv-info').innerHTML = info || `<small>${MOBILE ? 'Нажмите на предмет, чтобы увидеть описание.' : 'Двойной щелчок — надеть или использовать, перетаскивание — на куклу и обратно.'}</small>`;
  $('inv-info').classList.toggle('on', !!info);
  const k = s.load / s.cap;
  $('wbar').firstElementChild.style.width = `${Math.min(100, k * 100)}%`;
  $('wbar').firstElementChild.style.background = k > 0.7 ? 'linear-gradient(#e04a3a,#8a1a12)' : 'linear-gradient(#a0a0a0,#505050)';
  $('wbar').lastElementChild.textContent = `Вес ${s.load} / ${s.cap}${k > 0.7 ? ' — перегруз' : ''}`;
  $('inv-coins').textContent = `${P.coins.toLocaleString('ru')} мон.`;
  if (!$('char').hidden) renderChar();
}
function renderChar() {
  const s = stats(), c = CLASSES[P.cls], A = s.attr;
  const r = (k, v, hint = '') => `<div class="st" title="${hint}"><span>${k}</span><b>${v}</b></div>`;
  const need = xpToNext(P.lvl);
  $('char-body').innerHTML = `
    <div class="chead"><div class="lv">${P.lvl}</div><div><b>${P.name}</b><small>${PROFESSIONS[P.prof]?.name || c.name} · ${TOWNS.find((t) => t.id === P.home)?.name || ''}</small></div></div>
    ${r('Здоровье', `${Math.round(P.hp)} / ${s.maxHp}`)}${r('Мана', `${Math.round(P.mp)} / ${s.maxMp}`)}${r('Опыт', P.lvl >= MAX_LEVEL ? 'максимум' : `${P.xp} / ${need} (${((P.xp / need) * 100).toFixed(1)}%)`)}
    <h4>Основные</h4>
    <div class="attrs">${r('СИЛ', A.str, 'Сила — физическая атака')}${r('ЛОВ', A.dex, 'Ловкость — скорость атаки, крит, точность, уклонение, бег')}${r('ВЫН', A.con, 'Выносливость — здоровье, переносимый вес')}${r('ИНТ', A.int, 'Интеллект — магическая атака')}${r('МДР', A.wit, 'Мудрость — скорость каста')}${r('ДУХ', A.men, 'Дух — мана, магическая защита')}</div>
    <h4>Боевые</h4>
    <div class="cols">
      ${r('Физ. атака', Math.round(s.patk))}${r('Маг. атака', Math.round(s.matk))}
      ${r('Физ. защита', Math.round(s.pdef))}${r('Маг. защита', Math.round(s.mdef))}
      ${r('Точность', Math.round(s.acc))}${r('Уклонение', Math.round(s.eva))}
      ${r('Крит. шанс', `${(s.crit * 100).toFixed(1)}%`)}${r('Скор. атаки', s.aspd.toFixed(2))}
      ${r('Скор. каста', `${Math.round(s.cast * 100)}%`)}${r('Скорость', Math.round(s.speed))}
      ${r('Дальность', s.range)}${r('Вес', `${s.load} / ${s.cap}`)}
    </div>
    <h4>Автозаряды</h4><button data-shot="p">Физические: ${P.shots?.p ? 'вкл' : 'выкл'}</button> <button data-shot="m">Магические: ${P.shots?.m ? 'вкл' : 'выкл'}</button>
    <h4>Прочее</h4>
    <div class="cols">${r('Убито мобов', P.kills)}${r('Карма', `<span style="color:${P.karma > 0 ? '#ff6060' : 'inherit'}">${P.karma || 0}</span>`)}${r('PvP', P.pvp || 0)}${r('PK', P.pk || 0)}</div>
    ${s.sets.length ? `<h4>Комплекты</h4>${s.sets.map((st) => `<div class="st"><span>${st.name} ${st.have}/${st.parts.length}</span><b class="${st.have === st.parts.length ? 'good' : ''}">${Object.entries(st.bonus).map(([k, v]) => fmtBonus(k, v)).join(', ')}</b></div>`).join('')}` : ''}`;
}
// выбор, двойной щелчок, перетаскивание
const refOf = (el) => el?.dataset.slot ? { slot: el.dataset.slot } : el?.dataset.bag !== undefined ? { bag: +el.dataset.bag } : null;
const hasItem = (ref) => ref && (ref.slot ? !!P.equip[ref.slot] : ref.bag >= 0 && !!P.inv[ref.bag]);
function activate(ref) {
  if (ref.slot) return unequip(ref.slot);
  const e = P.inv[ref.bag], it = ITEMS[e.id];
  if (it.slot) equipIdx(ref.bag); else if (it.use) useItem(e.id);
}
let drag = null;
// перерисовка инвентаря, отложенная на время перетаскивания
$('inv').addEventListener('pointerdown', (e) => {
  const cell = e.target.closest('.cell'); const ref = refOf(cell);
  if (!hasItem(ref) || enchMode) return;
  e.preventDefault(); // иначе браузер начнёт своё перетаскивание иконки и оборвёт жест (pointercancel)
  drag = { ref, x: e.clientX, y: e.clientY, el: null, cell };
});
addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.el && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) {
    drag.el = drag.cell.cloneNode(true); drag.el.classList.add('ghost'); document.body.append(drag.el);
  }
  if (drag.el) drag.el.style.transform = `translate(${e.clientX - 22}px,${e.clientY - 22}px)`;
});
addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag; drag = null;
  if (!d.el) { if (pendingInv) { pendingInv = false; renderInv(); } return; }
  d.el.remove();
  const over = refOf(document.elementFromPoint(e.clientX, e.clientY)?.closest('.cell'));
  const onGrid = document.elementFromPoint(e.clientX, e.clientY)?.closest('#inv-grid');
  if (d.ref.bag !== undefined && over?.slot) equipIdx(d.ref.bag, over.slot);
  else if (d.ref.slot && (onGrid || over?.bag !== undefined)) unequip(d.ref.slot);
  else if (d.ref.slot && over?.slot && over.slot !== d.ref.slot && P.equip[d.ref.slot] && d.ref.slot.slice(0, -1) === over.slot.slice(0, -1)) {
    const a = d.ref.slot, b = over.slot; [P.equip[a], P.equip[b]] = [P.equip[b], P.equip[a]]; [P.enc[a], P.enc[b]] = [P.enc[b], P.enc[a]];
    for (const x of [a, b]) if (!P.enc[x]) delete P.enc[x];
    renderInv();
  }
  d.cell.dataset.dragged = '1'; setTimeout(() => delete d.cell.dataset.dragged, 0);
  if (pendingInv) { pendingInv = false; renderInv(); }
});
$('inv').addEventListener('click', (e) => {
  const cmd = e.target.closest('[data-cmd]')?.dataset.cmd;
  if (cmd) {
    if (cmd === 'noench') enchMode = null;
    else if (sel && hasItem(sel)) {
      if (cmd === 'off') unequip(sel.slot);
      if (cmd === 'on') equipIdx(sel.bag);
      if (cmd === 'use') useItem(P.inv[sel.bag].id);
      if (cmd === 'drop') { netSend({ t: 'sell', idx: sel.bag, n: 1 }); sel = null; }
    }
    return renderInv();
  }
  const cell = e.target.closest('.cell'); if (!cell || cell.dataset.dragged) return;
  const ref = refOf(cell);
  if (!hasItem(ref)) { sel = null; return renderInv(); }
  if (enchMode) return enchant(ref);
  sel = ref; renderInv();
});
$('inv').addEventListener('dblclick', (e) => { const ref = refOf(e.target.closest('.cell')); if (hasItem(ref) && !enchMode) activate(ref); });
function toggle(id) {
  $(id).hidden = !$(id).hidden;
  if (id === 'inv') { if ($(id).hidden) enchMode = null; sel = null; renderInv(); }
  if (id === 'char' && !$(id).hidden) renderChar();
  if (id === 'bigmap') drawMap($('bigmap-cv'), 1);
}
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => { b.closest('.win').hidden = true; });
for (const b of document.querySelectorAll('[data-open]')) b.addEventListener('click', () => toggle(b.dataset.open));

function openNpc(n) {
  if (n.role === 'mentor') { renderMentor(); $('mentor').hidden = false; }
  if (n.role === 'merchant') { renderShop('buy'); $('shop').hidden = false; }
  if (n.role === 'priest') {
    const k = P.karma || 0, cost = karmaWashCost(k);
    $('priest-body').innerHTML = k > 0 ? `<p>Твоя карма: <b style="color:#ff6060">${k}</b>. Могу очистить её за <b>${cost}</b> мон. Или смой её сам — убивая чудовищ.</p><button id="wash" ${P.coins < cost ? 'disabled' : ''}>Очистить карму (${cost} мон.)</button>`
      : '<p>Твоя душа чиста. Помни: в городе сражаться нельзя, а за его стенами убийство невинных делает тебя PK.</p>';
    $('priest').hidden = false;
  }
  if (n.role === 'guard') log(`${n.name}: «Проходи. PK в город не пускаем.»`);
  if (n.role === 'gatekeeper') {
    $('tp-list').innerHTML = TELEPORTS.map((t) => `<button data-tp="${t.id}" ${P.coins < t.cost ? 'disabled' : ''}><b>${t.name}</b><span>${t.cost ? `${t.cost} мон.` : 'бесплатно'}</span></button>`).join('');
    $('tp').hidden = false;
  }
}
$('tp').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tp]'); if (!b) return;
  if (P.coins < TELEPORTS.find((x) => x.id === b.dataset.tp).cost) return;
  netSend({ t: 'tp', id: b.dataset.tp }); $('tp').hidden = true;
});
let shopTab = 'buy';
function renderShop(tab = shopTab) {
  shopTab = tab;
  for (const b of document.querySelectorAll('#shop [data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
  if (tab === 'buy') $('shop-list').innerHTML = SHOP.map((id) => { const it = ITEMS[id]; return `<div class="row">${sw(it.color, it)}<div><b>${it.name}</b><small>${itemDesc(it)}${it.slot ? ` · ${SLOT_NAMES[it.slot]}` : ''}</small></div><button data-buy="${id}" ${P.coins < it.price ? 'disabled' : ''}>${it.price} мон.</button></div>`; }).join('');
  else $('shop-list').innerHTML = P.inv.filter((e) => ITEMS[e.id].price || ITEMS[e.id].rare).map((e) => { const it = ITEMS[e.id], pr = Math.round((it.price || 4000) * (it.loot ? 1 : 0.4)); return `<div class="row">${sw(it.color, it)}<div><b>${e.e ? `+${e.e} ` : ''}${it.name}${e.n > 1 ? ` ×${e.n}` : ''}</b></div><button data-sell="${e.id}">+${pr}</button>${e.n > 1 ? `<button data-sellall="${e.id}">все</button>` : ''}</div>`; }).join('') || '<small>нечего продать</small>';
  $('shop-coins').textContent = `${P.coins.toLocaleString('ru')} монет`;
}
$('shop').addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]'); if (t) return renderShop(t.dataset.tab);
  const b = e.target.closest('[data-buy]');
  if (b) netSend({ t: 'buy', id: b.dataset.buy, n: 1 });
  const s = e.target.closest('[data-sell],[data-sellall]');
  if (s) {
    const id = s.dataset.sell || s.dataset.sellall;
    const idx = P.inv.findIndex((e) => e.id === id);
    if (idx >= 0) netSend({ t: 'sell', idx, n: s.dataset.sellall ? P.inv[idx].n : 1 });
  }
});
setInterval(() => { if (P && !$('char').hidden) renderChar(); }, 500);
$('respawn').onclick = respawn;
$('priest').addEventListener('click', (e) => { if (e.target.id === 'wash') netSend({ t: 'wash' }); });

// ================= Карта =================
function drawMap(cv, big) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height;
  const inCrypt = hero.position.x > DUNGEON.x0 - 100;
  x.fillStyle = '#10141a'; x.fillRect(0, 0, W, H);
  if (inCrypt && big) {
    const size = DUNGEON.cell * DUNGEON.n, k = W / size;
    x.fillStyle = '#2a2628'; x.fillRect(0, 0, W, H);
    for (const m of mobs.values()) if (!m.dead && m.obj.position.x > DUNGEON.x0 - 100) { x.fillStyle = m.def.boss ? '#c060ff' : '#c04040'; x.fillRect((m.obj.position.x - DUNGEON.x0) * k - 2, (m.obj.position.z - DUNGEON.z0) * k - 2, 4, 4); }
    x.fillStyle = '#9a70ff'; x.fillRect((dungeonExit.x - DUNGEON.x0) * k - 3, (dungeonExit.z - DUNGEON.z0) * k - 3, 6, 6);
    x.fillStyle = '#fff'; x.beginPath(); x.arc((hero.position.x - DUNGEON.x0) * k, (hero.position.z - DUNGEON.z0) * k, 4, 0, 7); x.fill();
    return;
  }
  const scale = big ? W / MAP : W / 300; // мини-карта — окрестность 300 м
  const cx = big ? 0 : hero.position.x, cz = big ? 0 : hero.position.z;
  const yaw = big ? 0 : cam.yaw;
  const P2 = (px, pz) => { const [dx, dz] = mapOffset(px - cx, pz - cz, yaw); return [dx * scale + W / 2, dz * scale + H / 2]; };
  for (const z of ZONES) { const [a, b] = P2(z.x, z.z); x.fillStyle = `rgba(${z.ground.map((v) => (v * 255) | 0).join(',')},0.7)`; x.beginPath(); x.arc(a, b, z.r * scale, 0, 7); x.fill(); }
  for (const t of TOWNS) { const [a, b] = P2(t.x, t.z); x.fillStyle = '#d8cfb8'; x.beginPath(); x.arc(a, b, t.r * scale, 0, 7); x.fill(); if (big) { x.fillStyle = '#fff'; x.font = '12px sans-serif'; x.textAlign = 'center'; x.fillText(t.name, a, b - t.r * scale - 6); } }
  if (big) for (const z of ZONES) { const [a, b] = P2(z.x, z.z); x.fillStyle = '#fff'; x.font = '12px sans-serif'; x.textAlign = 'center'; x.fillText(`${z.name} (${z.lv})`, a, b); }
  { const [a, b] = P2(inCrypt ? dungeonExit.x : CRYPT.x, inCrypt ? dungeonExit.z : CRYPT.z); x.fillStyle = '#9a70ff'; x.fillRect(a - 3, b - 3, 6, 6); if (big) { x.fillStyle = '#c0a0ff'; x.fillText('Склеп', a, b - 8); } }
  if (!big) for (const m of mobs.values()) if (!m.dead && m.obj.visible) { const [a, b] = P2(m.obj.position.x, m.obj.position.z); x.fillStyle = m.def.aggro ? '#ff5050' : '#ffc060'; x.fillRect(a - 1.5, b - 1.5, 3, 3); }
  for (const n of npcs) { const [a, b] = P2(n.x, n.z); x.fillStyle = '#80d0ff'; x.fillRect(a - 2, b - 2, 4, 4); }
  const [a, b] = P2(hero.position.x, hero.position.z);
  x.save(); x.translate(a, b); x.rotate(-hero.rotation.y + Math.PI + yaw);
  x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, -6); x.lineTo(4, 5); x.lineTo(-4, 5); x.fill(); x.restore();
}

// ================= Цикл =================
const clock = new THREE.Clock();
let frame = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (!P) { renderer.render(scene, camera); cam.yaw += dt * 0.05; placeCamera(new THREE.Vector3(TOWNS[0].x, 10, TOWNS[0].z), 60); return; }
  frame++;
  const hx = hero.position.x, hz = hero.position.z;
  updateHero(dt);
  heroSt.travelSpeed = Math.hypot(hero.position.x - hx, hero.position.z - hz) / Math.max(dt, 0.001);
  heroSt.speed = Math.min(1, heroSt.travelSpeed / Math.max(stats().speed, 0.1));
  heroSt.inCombat = performance.now() < (heroSt.combatUntil || 0);
  updateMobs(dt, t);
  for(const p of petViews.values()) {p.obj.position.lerp(new THREE.Vector3(p.x,p.y,p.z),1-Math.exp(-dt*15));p.obj.rotation.y=p.r;p.obj.userData.anim(t,p.st,dt);}

  updateRemotes(dt, t);
  updateGuards(dt, t);
  heroSt.hitT = Math.max(0, (heroSt.hitT || 0) - dt * 5);
  if (heroSt.dieT != null) { heroSt.dieT += dt; const k = Math.min(1, heroSt.dieT * 3.5); hero.rotation.z = (Math.PI / 2) * k * k; }
  hero.userData.anim(t, heroSt, dt);
  campFx.update(dt, t, hero.position);
  groundLoot.update(t);
  if(pickUid!=null){const d=groundLoot.list.get(pickUid);if(!d)pickUid=null;else if(flatDist(hero.position,d)<2.5){netSend({t:'pick',uid:pickUid});pickUid=null;}}

  ambientFx(dt);
  updateFx(dt);
  updateParticles(dt);
  marker.material.opacity = Math.max(0, marker.material.opacity - dt * 1.5); marker.visible = marker.material.opacity > 0;
  selRing.visible = !!target && !target.dead;
  if (selRing.visible) { const o = target.obj.position; selRing.position.set(o.x, o.y + 0.15, o.z); selRing.scale.setScalar(target.radius || 1); selRing.material.color.set(target.isMob ? 0xff5050 : 0x60c0ff); }
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').style.opacity = '0'; }
  applyCamInput(dt);
  placeCamera(hero.position, cam.dist);
  skyDome.position.copy(camera.position);
  sun.position.copy(hero.position).add(new THREE.Vector3(60, 110, 40)); sun.target.position.copy(hero.position);
  updateLabels();
  if (frame % 6 === 0) { renderHud(); drawMap($('minimap'), 0); }
  if (frame % 30 === 0 && !$('bigmap').hidden) drawMap($('bigmap-cv'), 1);
  renderer.render(scene, camera);
}
function placeCamera(p, dist) {
  if (p.x > DUNGEON.x0 - 100) dist = Math.min(dist, 8); // в катакомбах стены близко
  const off = new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(dist);
  camera.position.copy(p).add(off).add(new THREE.Vector3(0, 2, 0));
  // камера не уходит под землю
  const gh = camera.position.x > DUNGEON.x0 - 100 ? 0.5 : heightAt(camera.position.x, camera.position.z) + 1;
  if (camera.position.y < gh + 0.3) camera.position.y = gh + 0.3;
  camera.lookAt(p.x, p.y + 1.8, p.z);
}
loop();

// ================= Старт: вход и регистрация =================
function start(p) {
  P = migrate(p);
  net.started = true;
  $('start').remove();
  document.body.classList.add('ingame'); document.documentElement.classList.add('ingame-root');
  spawnHero();
  teleportTo(P.x, P.z);
  renderSkills(); renderInv(); setChatTab('all');
  log(`Добро пожаловать, ${P.name}! ЛКМ — идти/выбрать цель (второй клик — атака), ПКМ или два пальца — камера, щипок/колесо — зум, V — сброс камеры, 1–5 и Shift+1–5 — умения, F — атака, 6–7 — зелья, P — группа, Tab — цель, I — инвентарь, C — персонаж, M — карта, Enter — чат.`);
  log('Поговорите с Хранителем врат, чтобы перенестись в зону охоты, и с Торговцем — за снаряжением.');
}
function startMsg(text, bad) { const el = $('start-msg'); if (el) { el.textContent = text || ''; el.classList.toggle('bad', !!bad); } }
function startBusy(on) { for (const id of ['start-new', 'start-login', 'start-cont']) if ($(id)) $(id).disabled = on || !net.ok; }
function startReady() {
  if (P || !$('start')) return;
  startBusy(false);
  const au = loadAuth();
  $('start-cont').hidden = !au?.token;
  if (au?.token) $('start-cont').textContent = `Продолжить: ${au.name}`;
  $('start-logout').hidden = !au?.token;
  startMsg(net.ok ? '' : 'Подключение к серверу…');
}
function sendAuth(m) {
  if (!net.ok) return startMsg('Нет связи с сервером, пробуем снова…', true);
  startBusy(true); startMsg('Вход…');
  net.ws.send(JSON.stringify(m));
  setTimeout(() => { if (!P) startBusy(false); }, 1500);
}
let pickCls = 'warrior';
for (const b of document.querySelectorAll('[data-cls]')) b.addEventListener('click', () => { pickCls = b.dataset.cls; for (const x of document.querySelectorAll('[data-cls]')) x.classList.toggle('on', x === b); });
const creds = () => ({ name: $('cname').value.trim(), pass: $('cpass').value });
$('start-new').onclick = () => sendAuth({ t: 'register', ...creds(), cls: pickCls });
$('start-login').onclick = () => sendAuth({ t: 'login', ...creds() });
$('cpass').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('start-login').click(); });
$('start-cont').onclick = () => sendAuth({ t: 'auth', token: loadAuth()?.token });
$('start-logout').onclick = () => {
  const au = loadAuth();
  if (au?.token && net.ok) net.ws.send(JSON.stringify({ t: 'logout', token: au.token }));
  try { localStorage.removeItem(AUTH_KEY); } catch { /* */ }
  startReady();
};
startReady();
netConnect();
// хук для автотестов: dev-сервер или ?test
if (import.meta.env.DEV || location.search.includes('test')) window.__g = { get P() { return P; }, mobs, get hero() { return hero; }, cam, teleportTo, dev: (o) => netSend({ t: 'dev', ...o }), goTo: (x, z) => netSend({ t: 'dev', x, z }), useSkill, joy, useItem, openNpc, equipIdx, unequip, enchant, stats, get enchMode() { return enchMode; }, renderInv, remotes, net, npcs, respawn, netSend, get dead() { return dead; }, get target() { return target; }, set target(v) { setTarget(v); }, attack() { attackTarget(target); } };

function renderMentor() {
  const pr = PROFESSIONS[P.prof];
  let h = `<div class="msp">SP: <b>${P.sp || 0}</b></div><h4>Профессия</h4>`;
  if (pr) h += `<p>Ваша профессия: <b>${pr.name}</b> — ${pr.desc.toLowerCase()}.</p>`;
  else {
    h += `<p>С ${PROF_LVL} уровня можно выбрать путь. Выбор один раз и навсегда.</p><div class="profs">`;
    h += profsFor(P).map((p) => {
      const err = profError(P, p.id);
      const bon = bonusText(p.bonus);
      return `<div class="prof"><b>${p.name}</b><small>${p.desc}</small><small>${bon}</small><small>Умения: ${p.skills.map((id) => `${SKILLS[id].name} (${SKILLS[id].lvl} ур.)`).join(', ')}</small>`
        + `${err ? `<small class="bad">${err}</small>` : ''}<button data-prof="${p.id}" ${err ? `disabled title="${err}"` : ''}>Выбрать</button></div>`;
    }).join('') + '</div>';
  }
  h += '<h4>Умения</h4>' + skillsOf(P).map((id) => {
    const sk = SKILLS[id], lv = skillLv(P, id), nx = lv + 1, err = learnError(P, id);
    const next = nx > SKILL_MAX_LV ? 'максимальный уровень' : `следующий: с ${skillReqLvl(id, nx)} ур., ${learnCost(id, nx)} SP`;
    return `<div class="row" data-skrow="${id}"><i style="background:${hex(sk.color)}"></i><div><b>${sk.name}</b><small>ур. ${lv} / ${SKILL_MAX_LV} · ${next}</small></div>`
      + `<button data-learn="${id}" ${err ? `disabled title="${err}"` : ''}>Изучить</button></div>`;
  }).join('');
  $('mentor-body').innerHTML = h;
}

$('mentor').addEventListener('click', e => {
  const p = e.target.closest('[data-prof]'), l = e.target.closest('[data-learn]');
  if (p) netSend({ t: 'profession', id: p.dataset.prof });
  if (l) netSend({ t: 'learn', id: l.dataset.learn });
});

$('petbox').addEventListener('click',e=>{const b=e.target.closest('[data-petfollow]');if(b)netSend({t:'petfollow',follow:b.dataset.petfollow==='yes'});});

function renderParty(m) {
  const box=$('party-members');
  if(m.t==='pinvited'){$('party-invite').textContent=`${m.name} приглашает в группу`;$('party-reply').hidden=false;$('pwin').hidden=false;return;}
  box.replaceChildren();
  for(const member of m.members){const row=document.createElement('div');row.textContent=`${member.id===m.leader?'★ ':''}${member.name} · ${member.lvl} ур.`;
    if(m.leader===net.id&&member.id!==net.id)for(const [cmd,label]of [['pkick','Исключить'],['plead','Лидер']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>netSend({t:cmd,id:member.id});row.append(b);}box.append(row);}
}
$('party-send').onclick=()=>netSend({t:'pinvite',name:$('party-name').value.trim()});
$('party-leave').onclick=()=>netSend({t:'pleave'});
$('party-accept').onclick=()=>{netSend({t:'paccept'});$('party-reply').hidden=true;};
$('party-decline').onclick=()=>{netSend({t:'pdecline'});$('party-reply').hidden=true;};
$('party-chat-send').onclick=()=>{netSend({t:'pchat',text:$('party-chat').value});$('party-chat').value='';};

function releaseInput(){for(const k of Object.keys(keys))keys[k]=false;joy.x=joy.y=0;rmb=false;touches.clear();pendingSkill=null;}
addEventListener('blur',releaseInput);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseInput();});

$('char-body').addEventListener('click',e=>{const b=e.target.closest('[data-shot]');if(b&&P)netSend({t:'shots',school:b.dataset.shot,enabled:!P.shots?.[b.dataset.shot]});});
