// Рост персонажа: профессии, очки умений (SP), уровни умений, штраф опыта, опыт в группе, заряды, стрелы. Без DOM — проверяется юнит-тестами.
import { CLASSES, SKILLS, ITEMS, PROFESSIONS, PROF_LVL, SKILL_MAX_LV, SKILL_LV_STEP } from './data.js';

// ===== профессии =====
export const profsFor = (P) => Object.entries(PROFESSIONS).filter(([, p]) => p.base === P.cls).map(([id, p]) => ({ id, ...p }));

export function profError(P, id) {
  const pr = PROFESSIONS[id];
  if (!pr || pr.base !== P.cls) return 'Эта профессия недоступна вашему классу';
  if (P.prof) return `Вы уже ${PROFESSIONS[P.prof].name}`;
  if (P.lvl < PROF_LVL) return `Смена профессии — с ${PROF_LVL} уровня`;
  return null;
}
export function changeProf(P, id) {
  const err = profError(P, id); if (err) return err;
  P.prof = id;
  return null;
}

// все умения персонажа: базовые класса + профессии
export const skillsOf = (P) => [...CLASSES[P.cls].skills, ...(P.prof ? PROFESSIONS[P.prof].skills : [])];

// ===== уровни умений =====
// уровень умения: 0 — не изучено; базовые умения первого уровня открываются сами с уровнем персонажа
export function skillLv(P, id) {
  const lv = P.skl?.[id] || 0;
  if (lv) return lv;
  return CLASSES[P.cls].skills.includes(id) && P.lvl >= SKILLS[id].lvl ? 1 : 0;
}
// какой уровень персонажа нужен для уровня умения lv
export const skillReqLvl = (id, lv) => SKILLS[id].lvl + (lv - 1) * SKILL_LV_STEP;
// цена в SP за изучение уровня lv
export const learnCost = (id, lv) => Math.round(30 * lv * lv * (1 + SKILLS[id].lvl / 5));

export function learnError(P, id) {
  if (!SKILLS[id] || !skillsOf(P).includes(id)) return 'Это умение вам недоступно';
  const lv = skillLv(P, id) + 1;
  if (lv > SKILL_MAX_LV) return `${SKILLS[id].name}: уже максимальный уровень`;
  const req = skillReqLvl(id, lv);
  if (P.lvl < req) return `${SKILLS[id].name} ${lv}: нужен уровень ${req}`;
  const cost = learnCost(id, lv);
  if ((P.sp || 0) < cost) return `${SKILLS[id].name} ${lv}: нужно ${cost} SP`;
  return null;
}
export function learnSkill(P, id) {
  const err = learnError(P, id); if (err) return err;
  const lv = skillLv(P, id) + 1;
  P.sp -= learnCost(id, lv);
  (P.skl ??= {})[id] = lv;
  return null;
}

// сила умения на уровне: урон/лечение/бафф растут, мана — чуть медленнее
export function skillAt(id, lv = 1) {
  const sk = SKILLS[id], k = Math.max(0, lv - 1);
  const r = { ...sk, id, lv, mp: Math.round(sk.mp * (1 + 0.06 * k)) };
  if (sk.mul && sk.kind !== 'buff' && sk.kind !== 'debuff') r.mul = +(sk.mul * (1 + 0.08 * k)).toFixed(3);
  if (sk.kind === 'buff') r.mul = +(1 + (sk.mul - 1) * (1 + 0.1 * k)).toFixed(3);
  // ослабление цели: множитель уменьшается (0.75 → сильнее), но не ниже 0.3
  if (sk.kind === 'debuff') r.mul = +Math.max(0.3, 1 - (1 - sk.mul) * (1 + 0.1 * k)).toFixed(3);
  if (sk.amount) r.amount = +Math.min(1, sk.amount * (1 + 0.08 * k)).toFixed(3);
  if (sk.hot) r.hot = { ...sk.hot, amount: +(sk.hot.amount * (1 + 0.08 * k)).toFixed(4) };
  if (sk.dot) r.dot = { ...sk.dot, mul: +(sk.dot.mul * (1 + 0.08 * k)).toFixed(3) };
  return r;
}

// требование умения к оружию: текст ошибки или null
export function skillGearError(P, sk) {
  const w = ITEMS[P.equip?.weapon];
  if (sk.needShield && !P.equip?.shield) return 'Нужен щит';
  if (sk.needBow && !w?.bow) return 'Нужен лук';
  if (sk.needPolearm && !w?.polearm) return 'Нужно древковое оружие';
  return null;
}

// ===== опыт и SP за моба =====
// моб намного слабее героя — опыта меньше (с разницы в 6 уровней, до 10%)
export function levelPenalty(heroLvl, mobLvl) {
  const d = heroLvl - mobLvl;
  return d <= 5 ? 1 : Math.max(0.1, 1 - (d - 5) * 0.15);
}
export function killReward(heroLvl, mob) {
  const k = levelPenalty(heroLvl, mob.lvl);
  return { xp: Math.max(1, Math.round(mob.xp * k)), sp: Math.max(0, Math.round((mob.xp / 8) * k)) };
}

// ===== группа =====
export const PARTY_MAX = 7;
export const PARTY_RANGE = 60; // м — кто дальше, не получает доли
// делёж награды: бонус за размер группы, доли по уровню (выше уровень — больше доля)
export function partyShare(reward, lvls) {
  const n = Math.min(lvls.length, PARTY_MAX);
  if (n <= 1) return lvls.map(() => ({ ...reward }));
  const bonus = 1 + 0.1 * (n - 1);
  const w = lvls.map((l, i) => (i < PARTY_MAX ? l * l : 0));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((x) => ({ xp: Math.round((reward.xp * bonus * x) / sum), sp: Math.round((reward.sp * bonus * x) / sum) }));
}

// ===== заряды =====
export const SHOT_MUL = { p: 2, m: 1.8 };
// какой заряд подходит к оружию: школа и грейд совпадают
export function shotFor(weaponId, school) {
  const w = ITEMS[weaponId], g = w?.grade || 'none';
  return Object.keys(ITEMS).find((id) => ITEMS[id].use === 'shot' && ITEMS[id].school === school && ITEMS[id].grade === g) || null;
}
// сколько зарядов тратится: физ. — 1 за удар, маг. — по мане умения
export const shotCost = (school, mp = 0) => (school === 'm' ? Math.max(1, Math.ceil(mp / 20)) : 1);

// ===== стрелы =====
// стрелы к луку: грейд совпадает; не лук — стрелы не нужны (null)
export function arrowFor(weaponId) {
  const w = ITEMS[weaponId];
  if (!w?.bow) return null;
  const g = w.grade || 'none';
  return Object.keys(ITEMS).find((id) => ITEMS[id].use === 'arrow' && ITEMS[id].grade === g) || null;
}
export const ARROW_COST = 1; // стрел за выстрел

// ===== старые сохранения =====
export function migrateGrowth(P) {
  P.sp ??= 0;
  P.skl ??= {};
  P.prof ??= null;
  P.shots ??= {}; // включённые автозаряды: { p: true, m: true }
  return P;
}
