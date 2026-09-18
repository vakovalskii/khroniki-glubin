// Дроп (src/loot.js): таблицы мобов, розыгрыш, редкость, множители элиты/чемпиона, штраф за слабых, лимиты.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, MOBS } from '../src/data.js';
import { rollLoot, rarityOf, dropKind, wantsAuto, dropMul, shardChance, cleanDrop, scatter, pickWeighted, lootValue, COINS, MAX_DROP_COINS, MAX_DROP_N, DROP_MUL } from '../src/loot.js';
import { eliteDef, championDef } from '../src/combat.js';

// детерминированный генератор
const seeded = (seed = 1) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const groupsOf = (loot) => (!loot ? [] : Array.isArray(loot) ? loot : [loot]);

test('таблицы дропа всех мобов в новом формате и ссылаются на предметы', () => {
  for (const [id, m] of Object.entries(MOBS)) {
    assert.equal(m.drops, undefined, `${id}: старый формат drops`);
    for (const [it, ch, lo = 1, hi = lo] of m.mats || []) {
      assert.ok(ITEMS[it]?.mat, `${id}: ${it} не ресурс`);
      assert.ok(ch > 0 && ch <= 1 && lo >= 1 && lo <= hi, `${id}: ${it} шанс/число`);
    }
    for (const g of groupsOf(m.loot)) {
      assert.ok(g.chance > 0 && g.chance <= 1 && g.items.length, `${id}: группа`);
      for (const [it, w] of g.items) assert.ok(ITEMS[it] && w > 0, `${id}: ${it}`);
    }
    if (!m.noLoot && !m.boss) assert.ok((m.mats?.length || 0) + groupsOf(m.loot).length > 0, `${id}: ничего не роняет`);
  }
});

test('новые ресурсы и мусор на продажу', () => {
  for (const id of ['hide_thick', 'fang', 'silk', 'chitin', 'golem_heart', 'orc_totem', 'lich_dust', 'soul_shard']) assert.ok(ITEMS[id]?.mat && ITEMS[id].price > 0 && ITEMS[id].stack, id);
  for (const id of ['broken_sword', 'orc_amulet']) assert.ok(ITEMS[id]?.junk && ITEMS[id].loot && ITEMS[id].price > 0, id);
  // каждый ресурс откуда-то падает
  for (const [id, it] of Object.entries(ITEMS)) if (it.mat && id !== 'soul_shard') assert.ok(Object.values(MOBS).some((m) => m.mats?.some(([x]) => x === id)), `${id} ниоткуда не падает`);
});

test('редкость: белый — обычное, зелёный — D, синий — C, золотой — B и редкое', () => {
  assert.equal(rarityOf(COINS), 'common');
  assert.equal(rarityOf('pelt'), 'common');
  assert.equal(rarityOf('gloves_leather'), 'uncommon');
  assert.equal(rarityOf('helm_chain'), 'rare');
  assert.equal(rarityOf('armor_bone'), 'epic');
  assert.equal(rarityOf('soul_shard'), 'rare');
  assert.equal(rarityOf('lich_dust'), 'epic');
});

test('автоподбор: по умолчанию монеты и ресурсы, вещи — вручную', () => {
  assert.deepEqual([dropKind(COINS), dropKind('fang'), dropKind('broken_sword'), dropKind('potion_hp'), dropKind('sword_long')], ['coins', 'mats', 'mats', 'items', 'items']);
  assert.ok(wantsAuto({}, COINS) && wantsAuto({}, 'pelt') && !wantsAuto({}, 'helm_chain'));
  assert.ok(wantsAuto({ items: true }, 'helm_chain') && !wantsAuto({ coins: false }, COINS));
});

test('розыгрыш: монеты в пределах, одна вещь из группы, одинаковые — вместе, noLoot пуст', () => {
  const rnd = seeded(7);
  for (let k = 0; k < 2000; k++) {
    const out = rollLoot(MOBS.orc_chief, 25, rnd);
    const c = out.find((x) => x.id === COINS);
    assert.ok(c && c.n >= 150 && c.n <= 300);
    assert.equal(new Set(out.map((x) => x.id)).size, out.length, 'повтор id');
    const eq = out.filter((x) => MOBS.orc_chief.loot[0].items.some(([id]) => id === x.id));
    assert.equal(eq.length, 1, 'из группы вождя — ровно одна вещь');
    assert.ok(out.find((x) => x.id === 'orc_totem').n >= 1);
  }
  assert.deepEqual(rollLoot(MOBS.risen_skeleton, 20, rnd), []);
  const lich = rollLoot(MOBS.lich, 28, seeded(3));
  assert.ok(lich.some((x) => ITEMS[x.id]?.set === 'bone' || x.id === 'sword_dragon' || x.id === 'ear_lich'), 'босс без вещи');
  assert.ok(lich.some((x) => x.id === 'lich_dust'));
});

// частота выпадения вещи из группы
function rate(def, lvl, n = 20000) {
  const rnd = seeded(11), ids = new Set(groupsOf(def.loot).flatMap((g) => g.items.map(([id]) => id)));
  let hit = 0;
  for (let k = 0; k < n; k++) if (rollLoot(def, lvl, rnd).some((x) => ids.has(x.id))) hit++;
  return hit / n;
}
test('шанс: элита ×3, чемпион ×5, штраф за слабых мобов', () => {
  const base = rate(MOBS.orc_warrior, 19), el = rate(eliteDef(MOBS.orc_warrior), 19), ch = rate(championDef(MOBS.orc_warrior), 19), low = rate(MOBS.orc_warrior, 35);
  assert.ok(Math.abs(base - 0.2) < 0.02, `обычный ${base}`);
  assert.ok(Math.abs(el - 0.6) < 0.03, `элита ${el}`);
  assert.ok(Math.abs(ch - 1) < 0.001, `чемпион ${ch} (шанс не выше 1)`);
  assert.ok(Math.abs(low - 0.2 * 0.1) < 0.01, `герой 35 ур. ${low}`);
  assert.deepEqual([DROP_MUL.elite, DROP_MUL.champion], [3, 5]);
  assert.equal(dropMul(MOBS.wolf, 30), 0.1);
  assert.equal(dropMul(championDef(MOBS.wolf), 3), 5);
});

test('осколок души: 0.5–2% со всех мобов', () => {
  assert.equal(shardChance(1), 0.0056);
  assert.equal(shardChance(40), 0.02);
  const rnd = seeded(5);
  let n = 0; const N = 40000;
  for (let k = 0; k < N; k++) if (rollLoot(MOBS.golem, 23, rnd).some((x) => x.id === 'soul_shard')) n++;
  assert.ok(Math.abs(n / N - shardChance(23)) < 0.004, `осколок ${n / N}`);
});

test('веса, разброс по земле, проверка позиций для сервера', () => {
  assert.equal(pickWeighted([['a', 1], ['b', 3]], 0.2), 'a');
  assert.equal(pickWeighted([['a', 1], ['b', 3]], 0.3), 'b');
  assert.equal(pickWeighted([['a', 1], ['b', 3]], 0.9999), 'b');
  const pts = Array.from({ length: 6 }, (_, i) => scatter(i, 6));
  for (const a of pts) for (const b of pts) if (a !== b) assert.ok(Math.hypot(a.dx - b.dx, a.dz - b.dz) > 0.5, 'предметы слиплись');
  assert.deepEqual(scatter(0, 1), { dx: 0, dz: 0 });
  assert.deepEqual(cleanDrop({ id: 'pelt', n: 2.7 }), { id: 'pelt', n: 2 });
  assert.equal(cleanDrop({ id: 'pelt', n: MAX_DROP_N + 1 }), null);
  assert.deepEqual(cleanDrop({ id: COINS, n: MAX_DROP_COINS }), { id: COINS, n: MAX_DROP_COINS });
  assert.equal(cleanDrop({ id: COINS, n: MAX_DROP_COINS + 1 }), null);
  for (const bad of [null, {}, { id: 'toString', n: 1 }, { id: '__proto__', n: 1 }, { id: 'pelt', n: 0 }, { id: 'pelt', n: 'x' }]) assert.equal(cleanDrop(bad), null, JSON.stringify(bad));
  // лимит монет покрывает любого чемпиона и элиту
  for (const m of Object.values(MOBS)) if (!m.boss) assert.ok(championDef(m).coins[1] <= MAX_DROP_COINS && eliteDef(m).coins[1] <= MAX_DROP_COINS, m.name);
});

test('доход с моба: чемпион богаче обычного, мусор даёт доход низким уровням', () => {
  assert.ok(lootValue(championDef(MOBS.bear)) > lootValue(MOBS.bear) * 3);
  assert.ok(lootValue(MOBS.bandit) > (MOBS.bandit.coins[0] + MOBS.bandit.coins[1]) / 2 + 10, 'разбойник без дохода от мусора');
});


test('начальные звери дают расходники и снаряжение, а не только монеты', () => {
  for (const id of ['rabbit','wolf']) {
    const rnd=seeded(73), seen=new Set();
    for(let k=0;k<500;k++) for(const item of rollLoot(MOBS[id],1,rnd)) seen.add(item.id);
    assert.ok(seen.has('potion_hp'), id);
    assert.ok([...seen].some(key=>ITEMS[key]?.slot), `${id}: нет снаряжения`);
  }
});
