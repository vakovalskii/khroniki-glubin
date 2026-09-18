// Правила боя без DOM: node --test tests/combat.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regenMul, sitError, autoShotSchool, COMBAT_REGEN, REST_REGEN, TOWN_REGEN } from '../src/combat.js';

test('восстановление: сидя ×3, в бою ×0.3, в городе ×4', () => {
  assert.equal(regenMul({}), 1);
  assert.equal(regenMul({ sitting: true }), REST_REGEN);
  assert.equal(regenMul({ combat: true }), COMBAT_REGEN);
  assert.equal(regenMul({ town: true }), TOWN_REGEN);
  assert.equal(regenMul({ town: true, sitting: true }), TOWN_REGEN * REST_REGEN);
  // в бою отдых не помогает
  assert.equal(regenMul({ sitting: true, combat: true }), COMBAT_REGEN);
});

test('сесть нельзя в бою, при касте, оглушённым и мёртвым', () => {
  assert.equal(sitError({}), null);
  assert.match(sitError({ combat: true }), /бою/);
  assert.ok(sitError({ casting: true }));
  assert.ok(sitError({ stunned: true }));
  assert.ok(sitError({ dead: true }));
});

test('автоатака тратит только заряд духа и только если он включён', () => {
  assert.equal(autoShotSchool({ cls: 'mage', shots: { m: true } }), null);
  assert.equal(autoShotSchool({ cls: 'mage', shots: { p: true, m: true } }), 'p');
  assert.equal(autoShotSchool({ cls: 'warrior', shots: {} }), null);
  assert.equal(autoShotSchool({ cls: 'warrior' }), null);
});

import { eliteDef, ELITE, mobSpread, socialAllies, rangedAction, RANGED } from '../src/combat.js';
import { MOBS } from '../src/data.js';

test('элита: ×2.5 HP, ×1.4 урон, крупнее, награда больше', () => {
  const e = eliteDef(MOBS.orc);
  assert.equal(e.hp, Math.round(MOBS.orc.hp * 2.5));
  assert.equal(e.patk, Math.round(MOBS.orc.patk * 1.4));
  assert.ok(e.elite && e.size > MOBS.orc.size && e.xp === MOBS.orc.xp * ELITE.reward);
  assert.equal(MOBS.orc.elite, undefined, 'исходный моб не изменён');
});

test('разброс урона мобов ±15%', () => {
  assert.equal(mobSpread(0), 0.85);
  assert.equal(mobSpread(0.5), 1);
  assert.ok(Math.abs(mobSpread(1) - 1.15) < 1e-9);
});

const mk = (id, x, o = {}) => ({ id, def: MOBS[id], dead: false, state: 'idle', obj: { position: { x, z: 0 } }, ...o });
test('социальные: сородичи в 12 м вступаются, чужие и дальние — нет', () => {
  const a = mk('goblin', 0), list = [a, mk('goblin', 5), mk('goblin_archer', 10), mk('goblin', 20), mk('wolf', 3), mk('goblin', 4, { dead: true }), mk('goblin', 2, { state: 'return' })];
  const got = socialAllies(a, list);
  assert.deepEqual(got.map((m) => m.obj.position.x), [5, 10]);
  assert.deepEqual(socialAllies(mk('rabbit', 0), [mk('rabbit', 1)]), [], 'кролики не социальные');
  for (const id of ['wolf', 'goblin', 'orc', 'skeleton']) assert.ok(MOBS[id].social, id);
});

test('лучник: подходит, стреляет, отступает при сближении', () => {
  const st = { retreatT: 0, retreatCd: 0 };
  assert.equal(rangedAction(30, {}, st), 'approach');
  assert.equal(rangedAction(14, {}, st), 'shoot');
  assert.equal(rangedAction(3, {}, st), 'flee');
  assert.equal(rangedAction(3, {}, { retreatT: 0, retreatCd: 2 }), 'shoot', 'на перезарядке отступления стреляет в упор');
  assert.equal(rangedAction(9, {}, { retreatT: 1, retreatCd: 4 }), 'retreat');
  assert.equal(rangedAction(RANGED.min + 1, {}, { retreatT: 1, retreatCd: 4 }), 'shoot', 'отошёл — стреляет');
  for (const id of ['goblin_archer', 'skeleton_archer']) assert.ok(MOBS[id]?.ranged, id);
});

test('элитные спавны: по паре на каждую зону и в катакомбах, лучники есть', async () => {
  const THREE = await import('three');
  const { buildWorld, zoneAt, ZONES } = await import('../src/world.js');
  const { spawns } = buildWorld(new THREE.Scene());
  for (const z of [...ZONES.map((x) => x.id), 'crypt']) {
    const n = spawns.filter((s) => s.elite && zoneAt(s.x, s.z).id === z).length;
    assert.equal(n, 2, `элит в ${z}: ${n}`);
  }
  assert.ok(!spawns.some((s) => s.elite && MOBS[s.mob].boss), 'босс не элита');
  assert.ok(spawns.filter((s) => s.mob === 'goblin_archer').length >= 4, 'мало гоблинов-лучников');
  assert.ok(spawns.some((s) => s.mob === 'skeleton_archer' && zoneAt(s.x, s.z).id === 'crypt'), 'нет скелетов-лучников в катакомбах');
});

import { castError } from '../src/casting.js';
const castContext = { skill: { kind: 'dmg', range: 24 }, target: { def: {}, radius: 1 }, distance: 20 };
test('завершение каста: погибшая, исчезнувшая или ушедшая цель отменяет удар', () => {
  assert.equal(castError(castContext), null);
  assert.ok(castError({ ...castContext, target: null }));
  assert.ok(castError({ ...castContext, target: { ...castContext.target, dead: true } }));
  assert.ok(castError({ ...castContext, targetAvailable: false }));
  assert.ok(castError({ ...castContext, distance: 25.1 }));
  assert.equal(castError({ ...castContext, distance: 25 }), null);
});
test('завершение каста: смерть, оглушение и мирная зона запрещают удар', () => {
  for (const flag of ['dead', 'stunned', 'town']) assert.ok(castError({ ...castContext, [flag]: true }), flag);
  assert.ok(castError({ ...castContext, target: { isPlayer: true }, targetTown: true }));
});
test('в городе разрешены лечение и бафф, но запрещено умение по площади', () => {
  for (const kind of ['heal', 'buff']) assert.equal(castError({ skill: { kind }, town: true }), null);
  assert.ok(castError({ skill: { kind: 'aoe' }, town: true }));
});

test('каст после слияния профессий: мирные умения в городе, целевая площадь требует цель', () => {
  for (const kind of ['heal', 'buff', 'hot', 'summon']) assert.equal(castError({ skill: { kind }, town: true }), null);
  assert.equal(castError({ skill: { kind: 'aoe', around: 'target', range: 20 }, target: null }), 'Нет цели');
});


import { heroDamage } from '../src/combat.js';
test('исходящий PvE-урон ниже; разница +4 и +6 уровней ощутима, ноль не наносит урон', () => {
  assert.equal(heroDamage(100, 10, 10), 65);
  assert.equal(heroDamage(100, 10, 14), 50);
  assert.equal(heroDamage(100, 10, 16), 39);
  assert.equal(heroDamage(0, 10, 10), 0);
  assert.ok(heroDamage(100, 10, 20) < heroDamage(100, 10, 16));
});

import { mapOffset } from '../src/map-view.js';
test('миникарта: вперёд на экране всегда вверх при любом повороте камеры', () => {
  for (const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5]) {
    const [x,y]=mapOffset(-Math.sin(yaw),-Math.cos(yaw),yaw);
    assert.ok(Math.abs(x)<1e-8 && y < -.999);
    const [rx,ry]=mapOffset(Math.cos(yaw),-Math.sin(yaw),yaw);
    assert.ok(rx>.999 && Math.abs(ry)<1e-8);
  }
});

import { leashDistance, recoverMobHp } from '../src/combat.js';
test('длинное преследование и постепенное восстановление только дома после паузы', () => {
 assert.equal(leashDistance({}),180); assert.equal(leashDistance({boss:true}),140);
 const m={hp:20,def:{hp:100},state:'return',recoverAfter:5000};
 recoverMobHp(m,10,10000,20);assert.equal(m.hp,20);
 m.state='idle';recoverMobHp(m,1,4000,0);assert.equal(m.hp,20);
 recoverMobHp(m,1,6000,0);assert.equal(m.hp,22);
 m.state='chase';recoverMobHp(m,5,9000,0);assert.equal(m.hp,22);
});
