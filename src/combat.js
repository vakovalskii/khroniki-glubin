// Правила боя без DOM: отдых, режим боя, заряды автоатаки. main.js только применяет.

import { MOVE_SCALE } from './movement.js';

// ===== отдых и режим боя =====
export const COMBAT_TIME = 6;     // с — после нанесения или получения урона герой «в бою»
export const TOWN_REGEN = 4;      // в городе восстановление быстрее
export const REST_REGEN = 3;      // сидя (вне боя)
export const COMBAT_REGEN = 0.3;  // в бою

// множитель восстановления HP/MP
export function regenMul({ town = false, sitting = false, combat = false } = {}) {
  let k = town ? TOWN_REGEN : 1;
  if (combat) k *= COMBAT_REGEN;
  else if (sitting) k *= REST_REGEN;
  return k;
}

// почему нельзя сесть (null — можно)
export function sitError({ dead = false, combat = false, casting = false, stunned = false } = {}) {
  if (dead) return 'Вы мертвы';
  if (combat) return 'Нельзя отдыхать в бою';
  if (casting) return 'Нельзя отдыхать во время чтения заклинания';
  if (stunned) return 'Вы оглушены';
  return null;
}

// ===== заряды автоатаки =====
// обычная атака любого класса (и посохом мага) тратит только заряд духа — и только если включён его автозаряд.
// Заряд магии (shots.m) тратится лишь магическими умениями.
export const autoShotSchool = (P) => (P?.shots?.p ? 'p' : null);

// ===== мобы =====
// элита: крупнее, живучее, сильнее, награда больше
export const ELITE = { hp: 2.5, atk: 1.4, size: 1.3, reward: 3 };
export function eliteDef(def) {
  return {
    ...def, elite: true,
    hp: Math.round(def.hp * ELITE.hp), patk: Math.round(def.patk * ELITE.atk),
    xp: def.xp * ELITE.reward, coins: def.coins.map((c) => c * ELITE.reward),
    size: (def.size || 1) * ELITE.size,
  };
}
// разброс и крит ударов мобов
export const MOB_SPREAD = 0.3;  // ±15%
export const MOB_CRIT = 0.08;
export const mobSpread = (r) => 1 - MOB_SPREAD / 2 + r * MOB_SPREAD;
export const mobCrit = (def) => def.crit ?? MOB_CRIT;

// социальные мобы: сородичи в радиусе вступаются
export const SOCIAL_R = 12;
export const famOf = (m) => m.def.fam || m.id;
export function socialAllies(m, list, r = SOCIAL_R) {
  if (!m.def.social) return [];
  const p = m.obj.position, f = famOf(m);
  return list.filter((o) => o !== m && !o.dead && o.def.social && famOf(o) === f
    && o.state !== 'chase' && o.state !== 'return'
    && Math.hypot(o.obj.position.x - p.x, o.obj.position.z - p.z) <= r);
}

// дальнобойщик: держит дистанцию min..max, при сближении отступает (не чаще раза в fleeCd)
export const RANGED = { min: 12, max: 16, flee: 7, fleeT: 1.4, fleeCd: 5, cd: 2.4 };
export function rangedAction(d, rg, st) {
  const R = { ...RANGED, ...rg };
  if (st.retreatT > 0 && d < R.min) return 'retreat';
  if (d < R.flee && st.retreatCd <= 0) return 'flee';
  if (d > R.max) return 'approach';
  return 'shoot';
}

// ===== чемпионы: редкие именные мобы зоны =====
export const CHAMPION = { hp: 3, atk: 1.3, size: 1.25, reward: 4, drop: 5, respawn: 600 };
export function championDef(def, name) {
  return {
    ...def, champion: true, elite: false, name: name || def.name, baseName: def.name,
    hp: Math.round(def.hp * CHAMPION.hp), patk: Math.round(def.patk * CHAMPION.atk),
    xp: def.xp * CHAMPION.reward, coins: def.coins.map((c) => c * CHAMPION.reward),
    size: (def.size || 1) * CHAMPION.size, respawn: CHAMPION.respawn,
  };
}
// вариант моба для спавна: { elite, champion: 'Имя' }
export const spawnDef = (def, o = {}) => (o.champion ? championDef(def, typeof o.champion === 'string' ? o.champion : null) : o.elite ? eliteDef(def) : def);

// скорость бега моба: speed — множитель вида (пчёлы, крысы быстрее)
export const MOB_SPEED = 12 * MOVE_SCALE;
export const mobSpeed = (def) => MOB_SPEED * (def.speed ?? 1) * (def.boss ? 0.8 : 1);
// дистанция удара ближнего боя: reach — прибавка (копьё, червь)
export const mobReach = (m) => 2 + m.radius + (m.def.reach || 0);

// ===== способности мобов (общие правила, main.js только исполняет) =====
// def.abil: [{ kind: 'heal'|'buff'|'raise'|'fire', cd, first?, r, ... }]
export function initAbil(def) {
  return (def.abil || []).map((a) => ({ ...a, t: a.first ?? a.cd * 0.5 }));
}
// такт таймеров: готовые способности (таймер ≤ 0) остаются готовыми, пока их не применят
export function abilTick(list, dt) {
  for (const a of list) a.t -= dt;
  return list.filter((a) => a.t <= 0);
}
export const abilUsed = (a) => { a.t = a.cd; };
// не удалось применить (нет цели) — пробуем снова чуть позже
export const abilRetry = (a, sec = 0.7) => { a.t = sec; };

// союзник для лечения: свой род (или любой моб при a.any), в радиусе, здоровье ниже порога — самый раненый
export function healTarget(m, list, a) {
  const p = m.obj.position, f = famOf(m);
  let best = null, bf = a.below ?? 0.7;
  for (const o of list) {
    if (o.dead || o.hidden || (!a.any && famOf(o) !== f)) continue;
    if (Math.hypot(o.obj.position.x - p.x, o.obj.position.z - p.z) > a.r) continue;
    const fr = o.hp / o.def.hp;
    if (fr < bf) { bf = fr; best = o; }
  }
  return best;
}
// союзники для усиления: свой род, в бою, в радиусе, ещё не усилены
export function buffTargets(m, list, a, now) {
  const p = m.obj.position, f = famOf(m);
  return list.filter((o) => !o.dead && famOf(o) === f && o.state === 'chase'
    && !(o.buff?.until > now)
    && Math.hypot(o.obj.position.x - p.x, o.obj.position.z - p.z) <= a.r);
}
// множитель атаки моба от усилений
export const mobAtkMul = (m, now) => (m.buff?.until > now ? m.buff.mul : 1);

// зарытый моб (червь): выныривает, когда герой близко, зарывается, когда далеко
export const BURROW = { emerge: 8, hide: 14 };
export function burrowAction(d, burrowed, b = BURROW) {
  if (burrowed && d <= b.emerge) return 'emerge';
  if (!burrowed && d > b.hide) return 'hide';
  return null;
}

// горящая земля: { x, z, r, until, next, tick } — сколько тиков урона получил стоящий в круге
export function patchTicks(pt, p, now) {
  let n = 0;
  while (pt.next <= now && pt.next <= pt.until) {
    if (Math.hypot(p.x - pt.x, p.z - pt.z) <= pt.r) n++;
    pt.next += pt.tick * 1000;
  }
  return n;
}

// Только исходящий PvE-урон героя и его питомцев. Урон мобов не меняется.
export function heroDamage(raw, heroLevel, mobLevel) {
  if (!(raw > 0)) return 0;
  const gap = Math.max(0, mobLevel - heroLevel - 2);
  return Math.max(1, Math.round(raw * 0.65 * Math.max(0.25, 0.88 ** gap)));
}

export const leashDistance = (def) => def.boss ? 140 : 180;
export function recoverMobHp(m, dt, now, homeDistance) {
  if (m.dead || !['idle','wander'].includes(m.state) || homeDistance > 8 || now < (m.recoverAfter || 0)) return;
  m.hp = Math.min(m.def.hp, m.hp + m.def.hp * .02 * dt);
}
