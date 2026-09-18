// Расчёт характеристик персонажа: класс, уровень, атрибуты, экипировка, заточка, комплекты, вес. Без DOM — проверяется юнит-тестами.
import { MOVE_SCALE } from './movement.js';
import { CLASSES, ITEMS, SETS, SLOTS, PROFESSIONS } from './data.js';

export const MAX_ENCH = 16;
export const SAFE_ENCH = 3;
export const ENCH_CHANCE = 0.66; // шанс успеха выше безопасной заточки

// тип слота предмета → id слотов куклы
export const slotsFor = (type) => SLOTS.filter((s) => s.type === type).map((s) => s.id);

// прибавка от заточки: шаг ~6% (оружие) / 5% (остальное), выше +3 — двойной
export function enchValue(it, key, e = 0) {
  const v = it[key] || 0;
  if (!v || !e || (key !== 'patk' && key !== 'matk' && key !== 'pdef' && key !== 'mdef')) return v;
  const step = Math.max(1, Math.round(v * (it.slot === 'weapon' ? 0.06 : 0.05)));
  return v + step * (Math.min(e, SAFE_ENCH) + 2 * Math.max(0, e - SAFE_ENCH));
}

// цена продажи торговцу: трофеи целиком, остальное — 40%; заточка поднимает цену (выше безопасной — вдвое быстрее)
export function sellPrice(it, e = 0) {
  if (!it) return 0;
  const base = Math.round((it.price || 4000) * (it.loot ? 1 : 0.4));
  if (!e || !it.slot || it.grade === 'none') return base;
  const k = 1 + 0.2 * Math.min(e, SAFE_ENCH) + 0.4 * Math.max(0, e - SAFE_ENCH);
  return Math.round(base * k);
}

// какие комплекты собраны полностью
export function activeSets(P) {
  const worn = new Set(Object.values(P.equip).filter(Boolean));
  return Object.entries(SETS).map(([id, st]) => ({ id, ...st, have: st.parts.filter((p) => worn.has(p)).length })).filter((s) => s.have > 0);
}

export function weightOf(P) {
  let w = 0;
  for (const e of P.inv) w += (ITEMS[e.id]?.w || 0) * e.n;
  for (const id of Object.values(P.equip)) if (id) w += ITEMS[id]?.w || 0;
  return Math.round(w * 10) / 10;
}

export function calcStats(P, buffs = [], now = 0) {
  const c = CLASSES[P.cls], L = P.lvl - 1, A = c.attr, B = c.base, G = c.grow;
  const m = (v, ref) => 1 + (v - ref) * 0.01;
  const s = {
    attr: A,
    maxHp: (B.hp + G.hp * L) * m(A.con, 30), maxMp: (B.mp + G.mp * L) * m(A.men, 30),
    patk: (B.patk + G.patk * L) * m(A.str, 30), matk: (B.matk + G.matk * L) * m(A.int, 30),
    pdef: B.pdef + G.pdef * L, mdef: (B.mdef + G.mdef * L) * m(A.men, 30),
    aspd: B.aspd * m(A.dex, 30), speed: B.speed * (1 + (A.dex - 30) * 0.004), crit: B.crit + (A.dex - 30) * 0.002,
    cast: m(A.wit, 20), acc: Math.sqrt(A.dex) * 6 + P.lvl, eva: Math.sqrt(A.dex) * 6 + P.lvl,
    range: ITEMS[P.equip.weapon]?.range ?? c.range, // лук задаёт свою дальность
  };
  // экипировка
  for (const [sl, id] of Object.entries(P.equip)) {
    const it = ITEMS[id]; if (!it) continue;
    const e = P.enc?.[sl] || 0;
    s.patk += enchValue(it, 'patk', e); s.matk += enchValue(it, 'matk', e);
    s.pdef += enchValue(it, 'pdef', e); s.mdef += enchValue(it, 'mdef', e);
    s.maxHp += it.hp || 0; s.maxMp += it.mp || 0; s.crit += it.crit || 0;
  }
  // комплекты
  s.sets = activeSets(P);
  for (const st of s.sets) if (st.have === st.parts.length) {
    const b = st.bonus;
    s.maxHp += b.hp || 0; s.maxMp += b.mp || 0; s.patk += b.patk || 0; s.matk += b.matk || 0;
    s.pdef += b.pdef || 0; s.mdef += b.mdef || 0; s.speed += b.speed || 0; s.crit += b.crit || 0; s.cast += b.cast || 0;
  }
  // профессия: множители и прибавка к дальности
  const pr = PROFESSIONS[P.prof];
  for (const [k, v] of Object.entries(pr?.bonus || {})) s[k] *= v;
  if (pr?.polearmRange && ITEMS[P.equip.weapon]?.polearm) s.range += pr.polearmRange;
  // вес: перегруз больше 70% — медленнее бег и восстановление
  s.load = weightOf(P); s.cap = Math.round(40 + A.con * 1.2);
  s.regen = 1;
  if (s.load > s.cap * 0.7) { s.speed *= 0.6; s.regen = 0.5; }
  for (const b of buffs) if (b.until > now) {
    s[b.stat] *= b.mul;
    for (const [k, v] of Object.entries(b.also || {})) s[k] *= v;
  }
  s.speed *= MOVE_SCALE;
  s.maxHp = Math.round(s.maxHp); s.maxMp = Math.round(s.maxMp);
  return s;
}

// вид оружия: bow — лук (щит с ним не надеть — twoHand), polearm — древковое, staff — посох (прочее двуручное), sword — одноручное
export function weaponKind(it) {
  if (it?.slot !== 'weapon') return null;
  if (it.bow) return 'bow';
  if (it.polearm) return 'polearm';
  return it.twoHand ? 'staff' : 'sword';
}

// можно ли надеть: уровень и ограничения класса
export function wearError(P, it) {
  if (!it?.slot) return 'Это нельзя надеть';
  if (it.lvl && P.lvl < it.lvl) return `${it.name}: нужен уровень ${it.lvl}`;
  const k = weaponKind(it);
  if (k === 'bow' && !(P.cls === 'warrior' && P.prof === 'archer')) return 'Луки — только для Лучника';
  if (k === 'polearm' && P.cls !== 'warrior') return 'Древковым оружием владеет только воин';
  if (k === 'staff' && P.cls === 'warrior') return 'Воин не владеет посохом';
  if (it.robe && P.cls === 'warrior') return 'Воин не носит мантии';
  return null;
}

// надеть предмет из сумки (индекс) в слот; возвращает текст ошибки или null
export function equipFromBag(P, idx, want) {
  const e = P.inv[idx], it = ITEMS[e?.id];
  const err = wearError(P, it); if (err) return err;
  const opts = slotsFor(it.slot);
  if (want && !opts.includes(want)) return 'Сюда это не надеть';
  const sl = want || opts.find((x) => !P.equip[x]) || opts[0];
  P.inv.splice(idx, 1);
  const off = [sl];
  if (sl === 'weapon' && it.twoHand) off.push('shield');
  if (sl === 'shield' && ITEMS[P.equip.weapon]?.twoHand) off.push('weapon');
  if (sl === 'armor' && it.full) off.push('legs');
  if (sl === 'legs' && ITEMS[P.equip.armor]?.full) off.push('armor');
  for (const x of off) unequipSlot(P, x);
  P.equip[sl] = e.id;
  if (e.e) P.enc[sl] = e.e;
  return null;
}

export function unequipSlot(P, sl) {
  const id = P.equip[sl]; if (!id) return;
  const e = P.enc[sl] || 0;
  P.inv.push(e ? { id, n: 1, e } : { id, n: 1 });
  P.equip[sl] = null; delete P.enc[sl];
}

// старые сохранения: слоты и заточка
export function migrate(P) {
  if (!P.equip || typeof P.equip !== 'object' || Array.isArray(P.equip)) P.equip = {};
  if (!P.enc || typeof P.enc !== 'object' || Array.isArray(P.enc)) P.enc = {};
  P.inv = (Array.isArray(P.inv) ? P.inv : []).filter(e => e && Object.hasOwn(ITEMS, e.id) && Number.isSafeInteger(e.n) && e.n > 0);
  for (const [sl, id] of Object.entries(P.equip)) {
    if (!SLOTS.some(s => s.id === sl) || (id && !Object.hasOwn(ITEMS, id))) { delete P.equip[sl]; delete P.enc[sl]; }
  }
  for (const s of SLOTS) if (!(s.id in P.equip)) P.equip[s.id] = null;
  for (const s of SLOTS) if (!P.equip[s.id]) delete P.enc[s.id];
  P.pvp ??= 0;
  return P;
}
