// Геометрия и правила применения умений в бою. Без DOM и three — проверяется юнит-тестами.
import { SKILLS } from './data.js';

// умению нужна цель-враг: удар, ослабление, урон со временем, площадь вокруг цели
export const needsEnemy = (sk) => sk.kind === 'dmg' || sk.kind === 'debuff' || sk.kind === 'dot' || (sk.kind === 'aoe' && sk.around === 'target');
// умение на союзника (себя или члена группы)
export const isSupport = (sk) => sk.kind === 'heal' || sk.kind === 'buff' || sk.kind === 'hot';
// мирные умения можно применять в городе
export const townOk = (sk) => isSupport(sk) || sk.kind === 'summon';

// цели в конусе перед героем: yaw — поворот героя (направление (sin yaw, cos yaw)), cone — угол в градусах
// list: [{ x, z, r }]; возвращает индексы, ближние первыми, не больше maxTargets
export function coneTargets(origin, yaw, list, { radius, cone = 360, maxTargets = Infinity }) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), half = (cone * Math.PI) / 360;
  const out = [];
  list.forEach((t, i) => {
    const dx = t.x - origin.x, dz = t.z - origin.z, d = Math.hypot(dx, dz), r = t.r || 0;
    if (d > radius + r) return;
    if (cone < 360 && d > 0.01) {
      // запас на размер цели: край крупного моба может попасть в конус
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d)));
      if (ang > half + Math.atan2(r, d)) return;
    }
    out.push({ i, d });
  });
  return out.sort((a, b) => a.d - b.d).slice(0, maxTargets).map((o) => o.i);
}

// точка рывка: остановиться в stop м от цели (не дальше maxDist от старта); null — уже рядом
export function dashPoint(from, to, stop, maxDist = Infinity) {
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
  const go = Math.min(d - stop, maxDist);
  if (go <= 0.2) return null;
  return { x: from.x + (dx / d) * go, z: from.z + (dz / d) * go, dist: go };
}

// значки эффектов для интерфейса: [{ id, name, color, left, kind }] (left — целые секунды)
export function effectIcons(list = [], now = 0) {
  return list.filter((e) => e.until > now).map((e) => ({
    id: e.id, kind: e.kind, name: SKILLS[e.id]?.name || e.id, color: SKILLS[e.id]?.color ?? 0xffffff, left: Math.ceil((e.until - now) / 1000),
  }));
}

// подписи характеристик (бонусы профессий, баффы) — полный словарь, неизвестный ключ выводится как есть
export const STAT_LABELS = {
  maxHp: 'Здоровье', maxMp: 'Мана', hp: 'Здоровье', mp: 'Мана', patk: 'Физ. атака', matk: 'Маг. атака', pdef: 'Физ. защита', mdef: 'Маг. защита',
  crit: 'Крит. шанс', cast: 'Скорость каста', speed: 'Скорость', eva: 'Уклонение', acc: 'Точность', aspd: 'Скор. атаки', range: 'Дальность', regen: 'Восстановление',
};
export const statLabel = (k) => STAT_LABELS[k] || k;

// строка бонусов профессии: «Физ. атака +5%, Физ. защита −10%»
export const bonusText = (bonus = {}) => Object.entries(bonus).map(([k, v]) => `${statLabel(k)} ${v >= 1 ? '+' : '−'}${Math.round(Math.abs(v - 1) * 100)}%`).join(', ');

// раскладка панели умений: клавиши (1–5, затем Shift+1–5), страницы на телефоне по PAGE умений
export const SKILL_PAGE = 5;
export const skillKey = (i) => (i < SKILL_PAGE ? String(i + 1) : i < SKILL_PAGE * 2 ? `⇧${i - SKILL_PAGE + 1}` : '');
// индекс умения по клавише: digit 1–5, shift
export const skillIndex = (digit, shift) => (digit >= 1 && digit <= SKILL_PAGE ? digit - 1 + (shift ? SKILL_PAGE : 0) : -1);
