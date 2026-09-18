// Юнит-тесты данных и генерации мира: npm run test:unit
import { test } from 'node:test';
import { sliceGeometry, pivotOf, RIG } from '../src/glb.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { CLASSES, SKILLS, ITEMS, MOBS, SHOP, xpToNext, MAX_LEVEL } from '../src/data.js';
import { buildWorld, heightAt, zoneAt, obstacles, TOWNS, TELEPORTS, ZONES, DUNGEON, dungeonCells, dungeonWalls, CRYPT } from '../src/world.js';

const world = buildWorld(new THREE.Scene());
const blocked = (x, z, r = 0.6) => obstacles.find((o) => Math.hypot(x - o.x, z - o.z) < o.r + r);

test('опыт растёт с уровнем', () => {
  for (let l = 1; l < MAX_LEVEL; l++) assert.ok(xpToNext(l + 1) > xpToNext(l), `уровень ${l}`);
});

test('ссылки в данных валидны', () => {
  for (const [id, c] of Object.entries(CLASSES)) for (const s of c.skills) assert.ok(SKILLS[s], `${id}: нет умения ${s}`);
  for (const [id, m] of Object.entries(MOBS)) {
    for (const d of Object.keys(m.drops || {})) assert.ok(ITEMS[d], `${id}: нет предмета ${d}`);
    assert.ok(m.hp > 0 && m.xp > 0 && m.coins[0] <= m.coins[1], `${id}: характеристики`);
  }
  for (const id of SHOP) { assert.ok(ITEMS[id], `магазин: ${id}`); assert.ok(ITEMS[id].price > 0, `магазин: цена ${id}`); }
  for (const z of ZONES) for (const [m] of z.mobs || []) assert.ok(MOBS[m], `${z.id}: нет моба ${m}`);
});

test('у каждого класса есть умение первого уровня', () => {
  for (const [id, c] of Object.entries(CLASSES)) assert.ok(c.skills.some((s) => SKILLS[s].lvl === 1), id);
});

test('города — мирные зоны и ровные', () => {
  for (const t of TOWNS) {
    assert.ok(zoneAt(t.x, t.z).town, t.id);
    assert.ok(Math.abs(heightAt(t.x + 30, t.z) - heightAt(t.x - 30, t.z)) < 0.5, `${t.id} ровный`);
  }
});

test('телепорты и NPC не в стенах', () => {
  for (const t of TELEPORTS) assert.ok(!blocked(t.x, t.z), `телепорт ${t.id} в препятствии`);
  for (const n of world.npcs) assert.ok(!obstacles.some((o) => Math.hypot(n.x - o.x, n.z - o.z) < o.r * 0.9), `NPC ${n.id} в препятствии`);
});

test('точки возрождения и выход из катакомб свободны', () => {
  for (const t of TOWNS) assert.ok(!blocked(t.x, t.z - 12), `возрождение ${t.id}`);
  assert.ok(!blocked(CRYPT.x, CRYPT.z + 13.5), 'выход из катакомб');
});

test('спавны: мобы существуют, не в городах, не под водой, не в стенах', () => {
  assert.ok(world.spawns.length > 100, `мало спавнов: ${world.spawns.length}`);
  for (const s of world.spawns) {
    assert.ok(MOBS[s.mob], s.mob);
    assert.ok(!zoneAt(s.x, s.z).town, `${s.mob} в городе`);
    if (s.x < DUNGEON.x0) assert.ok(heightAt(s.x, s.z) > -6, `${s.mob} под водой`);
  }
  const stuck = world.spawns.filter((s) => blocked(s.x, s.z, 0.2));
  assert.ok(stuck.length <= world.spawns.length * 0.1, `в препятствиях ${stuck.length}`);
  assert.equal(world.spawns.filter((s) => MOBS[s.mob].boss).length, 1, 'ровно один босс');
});

test('в каждой зоне есть мобы', () => {
  for (const z of ZONES) assert.ok(world.spawns.some((s) => zoneAt(s.x, s.z).id === z.id), z.id);
});

test('катакомбы: все клетки достижимы, босс в дальнем углу', () => {
  const n = DUNGEON.n, seen = new Set(['0,0']), q = [[0, 0]];
  const open = (i, j, di, dj) => {
    if (di === 1) return !dungeonWalls.has(`${i},${j},e`);
    if (di === -1) return !dungeonWalls.has(`${i - 1},${j},e`);
    if (dj === 1) return !dungeonWalls.has(`${i},${j},s`);
    return !dungeonWalls.has(`${i},${j - 1},s`);
  };
  while (q.length) {
    const [i, j] = q.shift();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= n || b >= n || seen.has(`${a},${b}`) || !open(i, j, di, dj)) continue;
      seen.add(`${a},${b}`); q.push([a, b]);
    }
  }
  assert.equal(seen.size, n * n);
  assert.equal(dungeonCells.length, n * n);
  const boss = world.spawns.find((s) => MOBS[s.mob].boss);
  assert.ok(boss.x > DUNGEON.x0 + DUNGEON.cell * (n - 1), 'босс в дальнем углу');
});

test('уровни мобов соответствуют зонам', () => {
  const lv = Object.fromEntries(ZONES.map(z => [z.id, z.lv.split('–').map(Number)]));
  for (const z of ZONES) for (const [m] of z.mobs || []) { const l = MOBS[m].lvl; assert.ok(l >= lv[z.id][0] - 1 && l <= lv[z.id][1], `${m} ${l} в ${z.id}`); }
});

// ---- экипировка, комплекты, заточка ----
import { SETS, SLOTS } from '../src/data.js';
import { calcStats, equipFromBag, unequipSlot, enchValue, migrate, weightOf, wearError } from '../src/stats.js';
const hero = (cls = 'warrior', lvl = 30) => migrate({ cls, lvl, xp: 0, inv: [], equip: { weapon: null, armor: null }, kills: 0 });
const give = (P, id) => { P.inv.push({ id, n: 1 }); return P.inv.length - 1; };

test('комплекты и слоты ссылаются на существующие предметы', () => {
  const types = new Set(SLOTS.map((s) => s.type));
  for (const [id, it] of Object.entries(ITEMS)) {
    if (it.slot) assert.ok(types.has(it.slot), `${id}: неизвестный слот ${it.slot}`);
    if (it.set) assert.ok(SETS[it.set]?.parts.includes(id), `${id}: нет в комплекте ${it.set}`);
    assert.ok(typeof it.w === 'number', `${id}: нет веса`);
  }
  for (const [id, st] of Object.entries(SETS)) {
    for (const p of st.parts) assert.equal(ITEMS[p]?.set, id, `${id}: часть ${p}`);
    assert.equal(new Set(st.parts.map((p) => ITEMS[p].slot)).size, st.parts.length, `${id}: две части в одном слоте`);
  }
});

test('экипировка: надеть, снять, парные слоты', () => {
  const P = hero();
  assert.equal(equipFromBag(P, give(P, 'ring_bronze')), null);
  assert.equal(equipFromBag(P, give(P, 'ring_silver')), null);
  assert.equal(P.equip.ring1, 'ring_bronze'); assert.equal(P.equip.ring2, 'ring_silver');
  assert.ok(equipFromBag(P, give(P, 'ear_bronze'), 'ring1'), 'серьга в кольцо');
  unequipSlot(P, 'ring1');
  assert.equal(P.equip.ring1, null); assert.ok(P.inv.some((e) => e.id === 'ring_bronze'));
});

test('двуручное снимает щит, мантия — поножи; ограничения класса', () => {
  const P = hero('mage');
  equipFromBag(P, give(P, 'shield_wood')); equipFromBag(P, give(P, 'legs_leather'));
  equipFromBag(P, give(P, 'staff_oak'));
  assert.equal(P.equip.shield, null); assert.equal(P.equip.weapon, 'staff_oak');
  equipFromBag(P, give(P, 'robe_mystic'));
  assert.equal(P.equip.legs, null); assert.equal(P.equip.armor, 'robe_mystic');
  const W = hero('warrior');
  assert.ok(equipFromBag(W, give(W, 'robe_mystic')), 'воин в мантии');
  assert.ok(equipFromBag(W, give(W, 'staff_oak')), 'воин с посохом');
  const low = hero('warrior', 5);
  assert.ok(equipFromBag(low, give(low, 'helm_chain')), 'уровень не проверен');
});

test('заточка переносится вместе с вещью и растит характеристику', () => {
  const P = hero();
  P.inv.push({ id: 'sword_long', n: 1, e: 5 });
  const before = calcStats(P).patk;
  equipFromBag(P, P.inv.length - 1);
  assert.equal(P.enc.weapon, 5);
  assert.equal(Math.round(calcStats(P).patk - before), enchValue(ITEMS.sword_long, 'patk', 5));
  assert.ok(enchValue(ITEMS.sword_long, 'patk', 5) > enchValue(ITEMS.sword_long, 'patk', 3));
  unequipSlot(P, 'weapon');
  assert.equal(P.inv.at(-1).e, 5);
});

test('полный комплект даёт бонус, неполный — нет', () => {
  const P = hero();
  const parts = SETS.chain.parts;
  for (const p of parts.slice(0, -1)) equipFromBag(P, give(P, p));
  const part = calcStats(P);
  equipFromBag(P, give(P, parts.at(-1)));
  const full = calcStats(P);
  assert.equal(full.maxHp - part.maxHp, SETS.chain.bonus.hp);
  assert.equal(Math.round(full.pdef - part.pdef), ITEMS[parts.at(-1)].pdef + SETS.chain.bonus.pdef);
});

test('перегруз замедляет', () => {
  const P = hero();
  const s0 = calcStats(P);
  P.inv.push({ id: 'bone', n: 1000 });
  assert.ok(weightOf(P) > s0.cap);
  assert.ok(calcStats(P).speed < s0.speed);
});

// --- нарезка сгенерированных моделей на части (src/glb.js) ---
test('нарезка меша: треугольники расходятся по частям и ничего не теряется', () => {
  const rig = { height: 2.4, hip: 0.8, shoulder: 1.6, neck: 1.85, armX: 0.5 };
  // столбик из треугольников по всей высоте и по бокам — грубая «фигура»
  const pts = [];
  const tri = (x, y) => pts.push(x, y, 0, x + 0.05, y, 0, x, y + 0.05, 0);
  for (let y = 0; y < 2.4; y += 0.1) { tri(0, y); tri(-0.8, y); tri(0.8, y); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const parts = sliceGeometry(geo, rig, false);
  const sum = Object.values(parts).reduce((s, g) => s + g.attributes.position.count / 3, 0);
  assert.equal(sum, pts.length / 9, 'треугольники не должны теряться');
  for (const key of ['head', 'torso', 'armL', 'armR', 'legL', 'legR']) assert.ok(parts[key], 'нет части ' + key);
  // мантия: ноги не режем, они уходят в корпус
  const skirt = sliceGeometry(geo, rig, true);
  assert.ok(!skirt.legL && !skirt.legR, 'у мантии ног быть не должно');
});

test('пивоты частей совпадают с суставами процедурного героя', () => {
  assert.deepEqual(pivotOf('head', RIG), [0, RIG.neck, 0]);
  assert.deepEqual(pivotOf('armR', RIG), [RIG.armX, RIG.shoulder, 0]);
  assert.deepEqual(pivotOf('torso', RIG), [0, 0, 0]);
});

// ===== правила симуляции (общие для сервера и клиента) =====
import { calcDmg, missChance, evaChance, xpForKill, rollDrops, rollCoins, sellPrice, crystalsFor, enchSucceeds, mobStep, newMob, moveEntity, flatDist } from '../src/sim.js';
import { SAFE_ENCH, MAX_ENCH } from '../src/stats.js';

// генератор с фиксированным зерном — чтобы тесты не зависели от удачи
const seeded = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test('урон: растёт с атакой, падает от защиты, крит удваивает', () => {
  const r = () => 0.5; // середина разброса, без крита
  const a = calcDmg(100, 0, 1, 0, r).d, b = calcDmg(200, 0, 1, 0, r).d;
  assert.ok(b > a * 1.9 && b < a * 2.1, `удвоение атаки: ${a} → ${b}`);
  assert.ok(calcDmg(100, 200, 1, 0, r).d < a, 'защита не снижает урон');
  const crit = calcDmg(100, 0, 1, 1, () => 0.5);
  assert.ok(crit.crit && crit.d === a * 2, `крит: ${crit.d} вместо ${a * 2}`);
  assert.ok(calcDmg(0.0001, 9999, 1, 0, r).d >= 1, 'урон должен быть хотя бы 1');
});

test('промах и уклонение: в пределах разумного и зависят от уровня', () => {
  for (const lv of [1, 20, 40]) {
    assert.ok(missChance(lv, 30) >= 0.01 && missChance(lv, 30) <= 0.3, 'промах вне границ');
    assert.ok(evaChance(lv, 30) >= 0.02 && evaChance(lv, 30) <= 0.3, 'уклонение вне границ');
  }
  assert.ok(missChance(40, 30) > missChance(1, 30), 'по сильному мобу промахов не больше');
  assert.ok(evaChance(1, 90) > evaChance(40, 30), 'уклонение не растёт от ловкости');
});

test('опыт за моба режется, если моб сильно ниже игрока', () => {
  const mob = MOBS.rabbit;
  assert.equal(xpForKill(mob, mob.lvl), mob.xp, 'за ровню опыт полный');
  assert.equal(xpForKill(mob, mob.lvl - 10), mob.xp, 'за моба выше себя опыт полный');
  const low = xpForKill(mob, mob.lvl + 20);
  assert.ok(low < mob.xp && low >= Math.round(mob.xp * 0.1), `срез опыта: ${low}`);
});

test('добыча и монеты — в границах таблицы моба', () => {
  const mob = MOBS.wolf;
  for (let i = 1; i < 30; i++) {
    const c = rollCoins(mob, seeded(i));
    assert.ok(c >= mob.coins[0] && c <= mob.coins[1], `монеты вне диапазона: ${c}`);
    for (const id of rollDrops(mob, seeded(i))) assert.ok([...(mob.mats || []).map(e => e[0]), ...(Array.isArray(mob.loot) ? mob.loot : [mob.loot]).filter(Boolean).flatMap(g => g.items.map(e => e[0])), 'soul_shard'].includes(id), `выпало не из таблицы: ${id}`);
  }
  assert.deepEqual(rollDrops(mob, () => 0.999), [], 'при неудачном броске ничего не падает');
});

test('цены продажи и кристаллы за неудачную заточку', () => {
  assert.equal(sellPrice(ITEMS.potion_hp), Math.round(ITEMS.potion_hp.price * 0.4), 'товар продаётся за 40%');
  assert.ok(sellPrice(ITEMS.pelt) === ITEMS.pelt.price, 'добыча продаётся по полной цене');
  assert.ok(crystalsFor('b', 5) > crystalsFor('d', 5), 'за грейд B кристаллов больше');
  assert.ok(crystalsFor('c', 9) > crystalsFor('c', 1), 'чем выше заточка, тем больше кристаллов');
});

test('заточка: до безопасного уровня всегда удаётся, дальше — бросок', () => {
  for (let e = 0; e < SAFE_ENCH; e++) assert.ok(enchSucceeds(e, () => 0.999), `+${e} должен пройти без риска`);
  assert.ok(!enchSucceeds(SAFE_ENCH, () => 0.999), 'выше безопасной заточки провал возможен');
  assert.ok(enchSucceeds(MAX_ENCH - 1, () => 0.01), 'удачный бросок должен срабатывать');
});

test('ИИ моба: агрится, возвращается домой без лечения по дороге', () => {
  const m = newMob(1, { mob: 'orc', x: 0, z: 0 }, seeded(3)); // орк агрессивный
  const hit = [];
  const ctx = { now: Date.now(), onHit: (mb, p) => hit.push(p.id), players: [{ id: 7, x: 5, z: 0, dead: false, inTown: false }] };
  mobStep(m, ctx, 0.1);
  assert.equal(m.state, 'chase', 'моб не заметил игрока в 5 м');
  for (let i = 0; i < 60; i++) mobStep(m, ctx, 0.1);
  assert.ok(hit.includes(7), 'моб догнал, но не ударил');
  // игрок ушёл в город — моб возвращается и восстанавливает здоровье
  m.hp = 1;
  ctx.players[0].inTown = true;
  let cameHome = 0;
  for (let i = 0; i < 200 && !cameHome; i++) { mobStep(m, ctx, 0.1); if (m.state !== 'return' && m.state !== 'chase') cameHome = flatDist(m, m.home); }
  assert.ok(cameHome && cameHome < 2, `моб не дошёл до дома: ${cameHome}`);
  assert.equal(m.hp, 1, 'моб не должен лечиться по дороге');
});

test('мирного моба не агрит близкий игрок', () => {
  const m = newMob(2, { mob: 'rabbit', x: 0, z: 0 }, seeded(5));
  assert.ok(!MOBS.rabbit.aggro, 'кролик вдруг стал агрессивным — тест устарел');
  const ctx = { now: Date.now(), onHit: () => assert.fail('мирный моб ударил первым'), players: [{ id: 1, x: 1, z: 1, dead: false, inTown: false }] };
  for (let i = 0; i < 50; i++) mobStep(m, ctx, 0.1);
  assert.notEqual(m.state, 'chase', 'мирный моб погнался за игроком');
});

test('шаг движения не проходит сквозь препятствия', () => {
  const o = obstacles.find((x) => x.r > 2 && x.x < 2000);
  const pos = { x: o.x - o.r - 3, y: 0, z: o.z };
  moveEntity(pos, 1, 0, 20, 0.6); // бежим прямо в центр препятствия
  assert.ok(Math.hypot(pos.x - o.x, pos.z - o.z) >= o.r + 0.5, 'персонаж прошёл сквозь препятствие');
});

test('ядро мира не тянет за собой three.js', async () => {
  const src = fs.readFileSync(new URL('../src/world-core.js', import.meta.url), 'utf8');
  assert.ok(!/from\s+'three/.test(src), 'world-core.js импортирует three');
  const simSrc = fs.readFileSync(new URL('../src/sim.js', import.meta.url), 'utf8');
  assert.ok(!/from\s+'three/.test(simSrc), 'sim.js импортирует three');
  for (const f of ['sim/player.js', 'sim/mobs.js', 'server.js', 'accounts.js']) {
    const s = fs.readFileSync(new URL('../server/' + f, import.meta.url), 'utf8');
    assert.ok(!/from\s+'three/.test(s) && !/world\.js'/.test(s), `server/${f} тянет рендер`);
  }
});

test('новичок начинает в экипировке, которую может носить', async () => {
  const { newChar } = await import('../server/sim/player.js');
  for (const cls of ['warrior', 'mage']) {
    const P = newChar('Новичок', cls);
    assert.ok(P.equip.weapon, `${cls}: начинает без оружия`);
    for (const [sl, id] of Object.entries(P.equip)) {
      if (!id) continue;
      assert.equal(wearError(P, ITEMS[id]), null, `${cls}: не может носить ${id} в слоте ${sl}`);
    }
    // и всё, что лежит в сумке, тоже должно быть применимо сразу
    for (const e of P.inv) {
      const it = ITEMS[e.id];
      assert.ok(it, `${cls}: в сумке несуществующий предмет ${e.id}`);
      if (it.slot) assert.equal(wearError(P, it), null, `${cls}: стартовую вещь ${e.id} нельзя надеть`);
    }
    assert.ok(P.hp > 0 && P.mp > 0 && P.coins > 0, `${cls}: пустые начальные значения`);
  }
});

import { mapOffset } from '../src/map-view.js';
test('миникарта: вперёд и вправо совпадают с экраном при любом повороте камеры', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const forward = mapOffset(-Math.sin(yaw), -Math.cos(yaw), yaw);
    const right = mapOffset(Math.cos(yaw), -Math.sin(yaw), yaw);
    assert.ok(Math.abs(forward[0]) < 1e-8 && forward[1] < -0.99);
    assert.ok(right[0] > 0.99 && Math.abs(right[1]) < 1e-8);
  }
  assert.deepEqual(mapOffset(30, -20, 0), [30, -20]); // большая карта: север сверху
});

import { heroDamage, leashDistance } from '../src/sim.js';
test('PvE: урон героя ниже, высокий уровень моба усиливает штраф', () => {
  assert.equal(heroDamage(100, 10, 10), 65);
  assert.equal(heroDamage(100, 10, 14), 50);
  assert.equal(heroDamage(100, 10, 16), 39);
  assert.equal(heroDamage(0, 10, 10), 0);
});
test('моб: погоня 180 м, возврат без лечения, восстановление после паузы', () => {
  const m = newMob(500, { mob: 'rabbit', x: 0, z: 0 }, seeded(8));
  const ctx = { now: 10000, players: [{ id: 7, x: 105, z: 0, dead: false, inTown: false }], onHit() {} };
  m.hp = m.def.hp / 4; m.state = 'chase'; m.target = 7; m.x = 100;
  mobStep(m, ctx, 0); assert.equal(m.state, 'chase');
  m.x = 181; ctx.players[0].x = 186;
  mobStep(m, ctx, 0); assert.equal(m.state, 'return');
  const hp = m.hp; mobStep(m, ctx, 0.1); assert.equal(m.hp, hp);
  m.x = 0; m.z = 0; m.wanderT = 100;
  mobStep(m, ctx, 0); assert.equal(m.state, 'idle'); assert.equal(m.hp, hp);
  ctx.now = 14999; mobStep(m, ctx, 1); assert.equal(m.hp, hp);
  ctx.now = 15000; mobStep(m, ctx, 1); assert.equal(m.hp, hp + m.def.hp * 0.02);
  m.state = 'chase'; mobStep(m, ctx, 1); assert.equal(m.hp, hp + m.def.hp * 0.02);
  assert.equal(leashDistance({ boss: true }), 140);
});
test('телепорты: новые цены едины для клиента и сервера', () => {
  assert.deepEqual(TELEPORTS.map(t => t.cost), [0, 0, 25, 37, 37, 62, 20, 50, 100, 87, 150]);
});
