// Дроп без DOM: розыгрыш добычи моба, редкость, виды для автоподбора, лимиты для сервера. Проверяется юнит-тестами.
// Таблица моба: coins [мин, макс]; mats [[id, шанс, мин, макс]]; loot { chance, items: [[id, вес]] } или массив таких групп.
import { ITEMS, MOBS } from './data.js';
import { levelPenalty } from './growth.js';
import { CHAMPION, ELITE } from './combat.js';

export const COINS = 'coins';
// подсветка на земле: белый / зелёный / синий / золотой
export const RARITY = {
  common: { name: 'обычное', color: 0xf0f0f0, css: '#e8e8e8', beam: 2.2 },
  uncommon: { name: 'необычное', color: 0x40ff60, css: '#60ff80', beam: 3 },
  rare: { name: 'редкое', color: 0x3a90ff, css: '#6ab4ff', beam: 4 },
  epic: { name: 'легендарное', color: 0xffb820, css: '#ffc840', beam: 6 },
};
export const GROUND_TTL = 30; // с — лежит на земле
export const BLINK_AT = 5;    // с до исчезновения — мигает
export const PICK_R = 2.2;    // м — подбор кликом
export const AUTO_R = 9;      // м — автоподбор в группе (в одиночку — сразу)
export const DROP_MUL = { elite: ELITE.reward, champion: CHAMPION.drop };
// лимиты на один предмет (сервер режет по ним)
export const MAX_DROP_N = 20;
export const MAX_DROP_COINS = Math.max(...Object.values(MOBS).map((m) => m.coins[1])) * Math.max(CHAMPION.reward, ELITE.reward);
export const MAX_DROP_ITEMS = 12; // позиций за одно убийство
// осколок души — со всех мобов, 0.5–2% по уровню
export const shardChance = (lvl) => Math.min(0.02, 0.005 + lvl * 0.0006);

export function rarityOf(id) {
  if (id === COINS) return 'common';
  const it = ITEMS[id];
  if (!it) return 'common';
  if (it.rarity) return it.rarity;
  if (it.rare || it.grade === 'b') return 'epic';
  if (it.grade === 'c') return 'rare';
  if (it.grade === 'd') return 'uncommon';
  return 'common';
}
// вид для автоподбора: монеты, ресурсы (и мусор на продажу), вещи (снаряжение и расходники)
export function dropKind(id) {
  if (id === COINS) return 'coins';
  const it = ITEMS[id];
  return it?.mat || it?.junk || it?.loot ? 'mats' : 'items';
}
export const AUTO_DEFAULT = { coins: true, mats: true, items: false };
export const wantsAuto = (set, id) => !!({ ...AUTO_DEFAULT, ...set })[dropKind(id)];

// множитель шанса: элита ×3, чемпион ×5, штраф за мобов слабее героя (как у опыта)
export function dropMul(def, heroLvl) {
  const k = def.champion ? DROP_MUL.champion : def.elite ? DROP_MUL.elite : 1;
  return k * levelPenalty(heroLvl, def.lvl);
}
const groups = (loot) => (!loot ? [] : Array.isArray(loot) ? loot : [loot]);
export function pickWeighted(items, r) {
  const sum = items.reduce((a, [, w]) => a + w, 0);
  let x = r * sum;
  for (const [id, w] of items) { x -= w; if (x < 0) return id; }
  return items[items.length - 1][0];
}
const count = (lo = 1, hi = lo, r) => lo + Math.floor(r * (hi - lo + 1));

// розыгрыш: [{ id, n }] — монеты, ресурсы, осколок, по одной вещи из каждой группы; одинаковые — вместе
export function rollLoot(def, heroLvl, rnd = Math.random) {
  if (def.noLoot) return [];
  const mul = dropMul(def, heroLvl);
  const out = [];
  const put = (id, n) => { const e = out.find((x) => x.id === id); if (e) e.n += n; else out.push({ id, n }); };
  const coins = count(def.coins[0], def.coins[1], rnd());
  if (coins > 0) put(COINS, coins);
  for (const [id, ch, lo, hi] of def.mats || []) if (rnd() < Math.min(1, ch * mul)) put(id, count(lo, hi, rnd()));
  if (!def.boss && rnd() < Math.min(1, shardChance(def.lvl) * mul)) put('soul_shard', 1);
  for (const g of groups(def.loot)) if (rnd() < Math.min(1, g.chance * mul)) put(pickWeighted(g.items, rnd()), 1);
  return out;
}

// ожидаемая добыча (для баланса и тестов): монеты и цена продажи ресурсов/мусора за убийство
export function lootValue(def, heroLvl = def.lvl) {
  const mul = dropMul(def, heroLvl);
  let v = (def.coins[0] + def.coins[1]) / 2;
  for (const [id, ch, lo = 1, hi = lo] of def.mats || []) v += Math.min(1, ch * mul) * ((lo + hi) / 2) * (ITEMS[id].price || 0);
  if (!def.boss) v += Math.min(1, shardChance(def.lvl) * mul) * ITEMS.soul_shard.price;
  for (const g of groups(def.loot)) {
    const sum = g.items.reduce((a, [, w]) => a + w, 0);
    for (const [id, w] of g.items) { const it = ITEMS[id]; v += Math.min(1, g.chance * mul) * (w / sum) * (it.loot ? it.price : Math.round((it.price || 0) * 0.4)); }
  }
  return Math.round(v);
}

// разброс по земле: позиции вокруг точки смерти
export function scatter(i, n, r = 1.4) {
  if (n <= 1) return { dx: 0, dz: 0 };
  const a = (i / n) * Math.PI * 2 + 0.6, rr = r * (0.7 + ((i * 37) % 10) / 30);
  return { dx: Math.cos(a) * rr, dz: Math.sin(a) * rr };
}

// проверка одной позиции от клиента (сервер): id существует, число в пределах
export function cleanDrop(it) {
  if (!it || typeof it.id !== 'string') return null;
  if (it.id !== COINS && !Object.hasOwn(ITEMS, it.id)) return null;
  const max = it.id === COINS ? MAX_DROP_COINS : MAX_DROP_N;
  const n = Math.floor(Number(it.n));
  if (!(n >= 1 && n <= max)) return null;
  return { id: it.id, n };
}
