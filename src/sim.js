// Правила симуляции: урон, промахи, опыт, дроб, ИИ мобов, цены, заточка.
// Без DOM и three.js — один и тот же код считает бой на сервере и проверяется юнит-тестами.
// Случайность приходит аргументом rng, чтобы тесты были повторяемы.
import { MOBS, ITEMS, MAX_LEVEL, xpToNext } from './data.js';
import { MAX_ENCH, SAFE_ENCH, ENCH_CHANCE } from './stats.js';
import { heightAt, obstacles, MAP, DUNGEON } from './world-core.js';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const rand = (a, b, rng = Math.random) => a + rng() * (b - a);
export const irand = (a, b, rng = Math.random) => Math.floor(rand(a, b + 1, rng));

// ---------- бой ----------
export function calcDmg(atk, def, mul = 1, crit = 0, rng = Math.random) {
  let d = atk * mul * (70 / (70 + def)) * rand(0.9, 1.1, rng) * 3;
  const isCrit = rng() < crit; if (isCrit) d *= 2;
  return { d: Math.max(1, Math.round(d)), crit: isCrit };
}
// шанс промахнуться по мобу и шанс увернуться от моба — зеркальные формулы
export const missChance = (mobLvl, acc) => clamp(0.06 + (mobLvl + 33 - acc) * 0.01, 0.01, 0.3);
export const evaChance = (mobLvl, eva) => clamp(0.05 + (eva - (mobLvl + 33)) * 0.01, 0.02, 0.3);

export const MOB_ATK_CD = (def) => (def.boss ? 1.4 : 1.8);
export const MOB_SPEED = (def) => 12 * (def.boss ? 0.8 : 1);
export const mobRadius = (def) => (def.size || 1) * 0.9;

// опыт с понижением за мобов сильно ниже игрока
export function xpForKill(mobDef, heroLvl) {
  const diff = mobDef.lvl - heroLvl;
  return Math.round(mobDef.xp * (diff < -5 ? Math.max(0.1, 1 + (diff + 5) * 0.15) : 1));
}
export const rollCoins = (mobDef, rng = Math.random) => irand(mobDef.coins[0], mobDef.coins[1], rng);
export function rollDrops(mobDef, rng = Math.random) {
  const out = [];
  for (const [id, ch] of Object.entries(mobDef.drops || {})) if (rng() < ch) out.push(id);
  return out;
}
export const xpLossOnDeath = (lvl, isPk) => Math.round(xpToNext(lvl) * (isPk ? 0.12 : 0.04));

// Урон только игрока по мобу; PvP и входящий урон не меняются.
export function heroDamage(raw, heroLevel, mobLevel) {
  if (!(raw > 0)) return 0;
  const gap = Math.max(0, mobLevel - heroLevel - 2);
  return Math.max(1, Math.round(raw * 0.65 * Math.max(0.25, 0.88 ** gap)));
}
export const leashDistance = (def) => def.boss ? 140 : 180;

// ---------- движение ----------
// сетка препятствий: без неё каждый шаг перебирал бы все 3000+ кругов
const GRID = 24;
let grid = null;
function buildGrid() {
  grid = new Map();
  for (const o of obstacles) {
    const x0 = Math.floor((o.x - o.r) / GRID), x1 = Math.floor((o.x + o.r) / GRID);
    const z0 = Math.floor((o.z - o.r) / GRID), z1 = Math.floor((o.z + o.r) / GRID);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const k = `${i},${j}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(o);
    }
  }
}
let gridFor = -1; // на сколько препятствий построена сетка: мир строится лениво, после импорта
export function obstaclesNear(x, z) {
  if (gridFor !== obstacles.length) { buildGrid(); gridFor = obstacles.length; }
  return grid.get(`${Math.floor(x / GRID)},${Math.floor(z / GRID)}`) || [];
}

// шаг с выталкиванием из препятствий; pos — { x, y, z }, мутируется
export function moveEntity(pos, dirX, dirZ, dist, radius) {
  pos.x += dirX * dist; pos.z += dirZ * dist;
  for (const o of obstaclesNear(pos.x, pos.z)) {
    const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz), min = o.r + radius;
    if (d < min && d > 1e-4) { pos.x = o.x + dx / d * min; pos.z = o.z + dz / d * min; }
  }
  const lim = MAP / 2 - 20;
  if (pos.x < DUNGEON.x0 - 100) { pos.x = clamp(pos.x, -lim, lim); pos.z = clamp(pos.z, -lim, lim); }
  pos.y = heightAt(pos.x, pos.z);
  return pos;
}
export const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------- мобы ----------
export function newMob(id, spawn, rng = Math.random) {
  const def = MOBS[spawn.mob];
  return {
    id, kind: spawn.mob, def,
    home: { x: spawn.x, z: spawn.z },
    x: spawn.x, y: heightAt(spawn.x, spawn.z), z: spawn.z, r: rand(0, 6.28, rng),
    hp: def.hp, recoverAfter: 0, state: 'idle', target: null, atkCd: 0, wanderT: rand(1, 6, rng), dest: null,
    dead: false, respawnAt: 0, diedAt: 0, moving: false, attackT: 0, hitBy: new Map(),
  };
}

// один шаг ИИ моба. ctx: { players: [{id,x,z,dead,inTown}], onHit(mob, player), now }
// Возвращает true, если моб что-то делал (для отладки и тестов).
export function mobStep(m, ctx, dt) {
  if (m.dead) {
    if (ctx.now > m.respawnAt) {
      m.dead = false; m.hp = m.def.hp; m.recoverAfter = 0; m.state = 'idle'; m.target = null;
      m.x = m.home.x; m.z = m.home.z; m.y = heightAt(m.x, m.z); m.hitBy.clear();
    }
    return false;
  }
  m.moving = false;
  m.attackT = Math.max(0, m.attackT - dt * 3);
  const radius = mobRadius(m.def), speed = MOB_SPEED(m.def);
  // цель: та, что уже выбрана, иначе ближайший живой игрок вне города
  const cur = m.target != null ? ctx.players.find((p) => p.id === m.target) : null;
  let near = cur && !cur.dead && !cur.inTown ? cur : null, nd = near ? flatDist(m, near) : Infinity;
  if (!near) {
    m.target = null;
    for (const p of ctx.players) { if (p.dead || p.inTown) continue; const d = flatDist(m, p); if (d < nd) { nd = d; near = p; } }
  }
  if (m.state === 'chase' || m.state === 'return') m.recoverAfter = ctx.now + 5000;
  if (m.state === 'idle' || m.state === 'wander') {
    if (ctx.now >= (m.recoverAfter || 0) && flatDist(m, m.home) <= 8 && !(m.def.aggro && near && nd < 14)) {
      m.hp = Math.min(m.def.hp, m.hp + m.def.hp * 0.02 * dt);
    }
    if (m.def.aggro && near && nd < 14) { m.state = 'chase'; m.target = near.id; }
    m.wanderT -= dt;
    if (m.wanderT <= 0) { m.wanderT = rand(4, 10); m.dest = { x: m.home.x + rand(-12, 12), z: m.home.z + rand(-12, 12) }; m.state = 'wander'; }
    if (m.state === 'wander' && m.dest) {
      const dx = m.dest.x - m.x, dz = m.dest.z - m.z, L = Math.hypot(dx, dz);
      if (L < 0.5) { m.state = 'idle'; m.dest = null; }
      else { moveEntity(m, dx / L, dz / L, Math.min(L, speed * 0.35 * dt), radius); m.r = Math.atan2(dx, dz); m.moving = true; }
    }
  } else if (m.state === 'chase') {
    if (!near || nd > 220 || flatDist(m, m.home) > leashDistance(m.def)) { m.state = 'return'; m.target = null; }
    else {
      m.target = near.id;
      const reach = 2 + radius;
      if (nd > reach) {
        const dx = near.x - m.x, dz = near.z - m.z, L = Math.hypot(dx, dz) || 1;
        moveEntity(m, dx / L, dz / L, speed * dt, radius); m.r = Math.atan2(dx, dz); m.moving = true;
      } else {
        m.r = Math.atan2(near.x - m.x, near.z - m.z);
        m.atkCd -= dt;
        if (m.atkCd <= 0) { m.atkCd = MOB_ATK_CD(m.def); m.attackT = 1; ctx.onHit(m, near); }
      }
    }
  } else if (m.state === 'return') {
    const dx = m.home.x - m.x, dz = m.home.z - m.z, L = Math.hypot(dx, dz);
    if (L < 1) m.state = 'idle';
    else { moveEntity(m, dx / L, dz / L, speed * 1.4 * dt, radius); m.r = Math.atan2(dx, dz); m.moving = true; }
  }
  return true;
}

// ---------- экономика ----------
export const sellPrice = (it) => Math.round((it.price || 4000) * (it.loot ? 1 : 0.4));
export const crystalsFor = (grade, cur) => ({ d: 2, c: 6, b: 15 }[grade] * (cur + 1));
// удачна ли попытка усиления: до SAFE_ENCH — всегда
export const enchSucceeds = (cur, rng = Math.random) => cur < SAFE_ENCH || rng() < ENCH_CHANCE;
export { MAX_ENCH, SAFE_ENCH, ENCH_CHANCE, MAX_LEVEL, xpToNext, ITEMS, MOBS };
