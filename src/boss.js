// Боссы без DOM: фазы по здоровью, умения по таймерам, таблица ненависти.
// bossTick возвращает события — main.js их исполняет (снаряды, круги, призыв, баннер).
import { BOSS } from './data.js';

const ABILITIES = ['volley', 'doom', 'prison'];

// номер фазы по доле здоровья
export function phaseAt(frac, phases) {
  let k = 0;
  for (let i = 1; i < phases.length; i++) if (frac < phases[i].from) k = i;
  return k;
}

export function createBoss(id) {
  const cfg = BOSS[id];
  return cfg ? { id, cfg, phase: -1, cds: {}, summoned: new Set(), hate: new Map() } : null;
}

// сброс при возврате домой и смерти
export function resetBoss(b) {
  b.phase = -1; b.cds = {}; b.summoned.clear(); b.hate.clear();
}

export const phaseOf = (b) => b.cfg.phases[b.phase] || null;
export const bossAspd = (b) => phaseOf(b)?.aspd ?? 1;

// шаг босса: фазы только вперёд (подлечившийся босс не повторяет призыв)
export function bossTick(b, frac, dt) {
  const ev = [];
  const ph = phaseAt(frac, b.cfg.phases);
  if (ph > b.phase) {
    b.phase = ph;
    const P = phaseOf(b);
    ev.push({ type: 'phase', phase: ph, name: P.name, title: P.title });
    b.cds = {};
    for (const k of ABILITIES) if (P[k]) b.cds[k] = P[k].first ?? P[k].cd;
    if (P.summon && !b.summoned.has(ph)) { b.summoned.add(ph); ev.push({ type: 'summon', ...P.summon }); }
    return ev; // умения — со следующего шага
  }
  const P = phaseOf(b);
  for (const k of ABILITIES) {
    if (!P?.[k]) continue;
    b.cds[k] -= dt;
    if (b.cds[k] <= 0) { b.cds[k] = P[k].cd; ev.push({ type: k, ...P[k] }); }
  }
  return ev;
}

// ===== ненависть =====
export function addHate(b, who, n) {
  if (!(n > 0)) return;
  b.hate.set(who, (b.hate.get(who) || 0) + n);
}
// лечение генерирует ненависть у всех боссов, которые уже враждуют с группой
export const healHate = (b, who, heal) => addHate(b, who, heal * (b.cfg.hateHeal ?? 0.5));
export const dropHate = (b, who) => b.hate.delete(who);
export function topHate(b) {
  let best = null, v = -Infinity;
  for (const [k, x] of b.hate) if (x > v) { v = x; best = k; }
  return best;
}

// ===== геометрия умений =====
export const inCircle = (p, c, r) => Math.hypot(p.x - c.x, p.z - c.z) <= r;
// самая дальняя цель от босса (list: { id, x, z })
export function farthest(from, list) {
  let best = null, bd = -1;
  for (const t of list) { const d = Math.hypot(t.x - from.x, t.z - from.z); if (d > bd) { bd = d; best = t; } }
  return best;
}
// точки призыва вокруг босса
export function ringPoints(c, n, r) {
  return Array.from({ length: n }, (_, i) => ({ x: c.x + Math.cos((i / n) * Math.PI * 2) * r, z: c.z + Math.sin((i / n) * Math.PI * 2) * r }));
}
