// Юнит-тесты применения умений в бою: конус, рывок, значки эффектов, подписи бонусов, клавиши панели
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS, PROFESSIONS } from '../src/data.js';
import * as S from '../src/skills.js';
import { makeDebuff, makeDot } from '../src/effects.js';

test('цели умения: враг, союзник, город', () => {
  for (const id of ['power_strike', 'curse_weakness', 'curse_decay', 'arrow_rain']) assert.ok(S.needsEnemy(SKILLS[id]), id);
  for (const id of ['whirlwind', 'wide_sweep', 'heal', 'forest_gift', 'call_wolf']) assert.ok(!S.needsEnemy(SKILLS[id]), id);
  for (const id of ['heal', 'renewal', 'blessing', 'forest_gift']) assert.ok(S.isSupport(SKILLS[id]), id);
  assert.ok(S.townOk(SKILLS.call_wolf) && !S.townOk(SKILLS.wide_sweep));
});

test('конус: только перед героем, ближние первыми, не больше maxTargets', () => {
  const o = { x: 0, z: 0 }, yaw = 0; // смотрит в +z
  const list = [
    { x: 0, z: 3 }, // прямо
    { x: 2, z: 2 }, // 45°
    { x: 3, z: 0 }, // 90° — вне конуса 100°
    { x: 0, z: -3 }, // сзади
    { x: 0, z: 9 }, // далеко
    { x: -1, z: 1.5 }, // ближний слева в конусе
    { x: 2.6, z: 1.6, r: 1.5 }, // 58°, но крупный — край попадает
  ];
  const hit = S.coneTargets(o, yaw, list, { radius: 5.5, cone: 100, maxTargets: 4 });
  assert.deepEqual(hit, [5, 1, 0, 6]);
  assert.equal(S.coneTargets(o, yaw, list, { radius: 5.5, cone: 100, maxTargets: 2 }).length, 2);
  // поворот: смотрит в +x — теперь попадает правый
  assert.ok(S.coneTargets(o, Math.PI / 2, list, { radius: 5.5, cone: 100 }).includes(2));
  // без конуса — круг
  assert.equal(S.coneTargets(o, yaw, list, { radius: 5.5 }).length, 6);
});

test('рывок: останавливается у цели, не дальше предела', () => {
  const p = S.dashPoint({ x: 0, z: 0 }, { x: 0, z: 6 }, 1.5);
  assert.ok(Math.abs(p.z - 4.5) < 1e-9 && p.x === 0 && Math.abs(p.dist - 4.5) < 1e-9);
  assert.equal(S.dashPoint({ x: 0, z: 0 }, { x: 0, z: 1.6 }, 1.5), null);
  assert.equal(S.dashPoint({ x: 0, z: 0 }, { x: 20, z: 0 }, 1, 6).x, 6);
});

test('значки эффектов: имя, цвет, оставшиеся секунды, истёкшие скрыты', () => {
  const list = [makeDebuff('curse_weakness', SKILLS.curse_weakness, 0), makeDot('curse_decay', SKILLS.curse_decay.dot, 100, 0), { id: 'x', kind: 'debuff', until: 50 }];
  const ic = S.effectIcons(list, 1500);
  assert.equal(ic.length, 2);
  assert.deepEqual(ic[0], { id: 'curse_weakness', kind: 'debuff', name: 'Проклятие слабости', color: SKILLS.curse_weakness.color, left: 11 });
  assert.equal(ic[1].left, 11);
});

test('подписи бонусов всех профессий без undefined', () => {
  for (const [id, p] of Object.entries(PROFESSIONS)) {
    const t = S.bonusText(p.bonus);
    assert.ok(t && !t.includes('undefined'), `${id}: ${t}`);
    for (const k of Object.keys(p.bonus)) assert.ok(S.STAT_LABELS[k], `${id}: нет подписи ${k}`);
  }
  assert.equal(S.bonusText(PROFESSIONS.archer.bonus), 'Физ. атака +5%, Крит. шанс +15%, Скорость +5%, Уклонение +10%, Физ. защита −10%');
  assert.equal(S.statLabel('zzz'), 'zzz');
});

test('клавиши панели: 1–5, затем Shift+1–5', () => {
  assert.deepEqual([0, 4, 5, 9, 10].map(S.skillKey), ['1', '5', '⇧1', '⇧5', '']);
  assert.equal(S.skillIndex(1, false), 0);
  assert.equal(S.skillIndex(4, true), 8);
  assert.equal(S.skillIndex(6, false), -1);
  // самый длинный набор (некромант: 3 + 6) помещается в клавиши
  assert.ok(3 + PROFESSIONS.necromancer.skills.length <= S.SKILL_PAGE * 2);
});
