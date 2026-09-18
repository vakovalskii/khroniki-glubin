// Юнит-тесты роста персонажа: профессии, SP, уровни умений, группа, заряды
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, SKILLS, ITEMS, MOBS, PROFESSIONS, PROF_LVL, SKILL_MAX_LV } from '../src/data.js';
import { calcStats } from '../src/stats.js';
import * as G from '../src/growth.js';

const hero = (cls, lvl, extra = {}) => G.migrateGrowth({ cls, lvl, inv: [], equip: {}, enc: {}, ...extra });

test('у каждого класса минимум две профессии, ссылки на умения валидны', () => {
  for (const cls of Object.keys(CLASSES)) {
    const ps = G.profsFor({ cls });
    assert.ok(ps.length >= 2, cls);
    for (const p of ps) assert.equal(p.base, cls, `${p.id}: база`);
  }
  for (const [id, p] of Object.entries(PROFESSIONS)) {
    assert.ok(CLASSES[p.base], `${id}: класс ${p.base}`);
    for (const s of p.skills) { assert.ok(SKILLS[s], `${id}: нет умения ${s}`); assert.ok(SKILLS[s].lvl >= PROF_LVL, `${id}: ${s} раньше профессии`); }
  }
});

test('смена профессии: уровень, класс, один раз', () => {
  const P = hero('warrior', PROF_LVL - 1);
  assert.match(G.changeProf(P, 'knight'), /с 20 уровня/);
  P.lvl = PROF_LVL;
  assert.match(G.changeProf(P, 'sorcerer'), /недоступна/);
  assert.equal(G.changeProf(P, 'knight'), null);
  assert.match(G.changeProf(P, 'berserker'), /уже Страж/);
  assert.deepEqual(G.skillsOf(P), [...CLASSES.warrior.skills, 'shield_bash', 'iron_will']);
});

test('бонус профессии попадает в характеристики', () => {
  const a = calcStats(hero('warrior', 25)), b = calcStats(hero('warrior', 25, { prof: 'knight' }));
  assert.ok(b.pdef > a.pdef * 1.14 && b.maxHp > a.maxHp * 1.14);
  const c = calcStats(hero('mage', 25, { prof: 'sorcerer' }));
  assert.ok(c.matk > calcStats(hero('mage', 25)).matk);
});

test('базовое умение открыто с уровнем, умение профессии — только изучением', () => {
  const P = hero('warrior', 22, { prof: 'knight' });
  assert.equal(G.skillLv(P, 'power_strike'), 1);
  assert.equal(G.skillLv(P, 'shield_bash'), 0);
  assert.equal(G.skillLv(hero('warrior', 1), 'whirlwind'), 0);
});

test('изучение умения: SP, уровень персонажа, максимум', () => {
  const P = hero('warrior', 5, { sp: 0 });
  assert.match(G.learnSkill(P, 'power_strike'), /нужно \d+ SP/);
  P.sp = 1e6;
  assert.equal(G.learnSkill(P, 'power_strike'), null);
  assert.equal(G.skillLv(P, 'power_strike'), 2);
  assert.match(G.learnSkill(P, 'power_strike'), /нужен уровень 9/);
  P.lvl = 40;
  while (G.skillLv(P, 'power_strike') < SKILL_MAX_LV) assert.equal(G.learnSkill(P, 'power_strike'), null);
  assert.match(G.learnSkill(P, 'power_strike'), /максимальный/);
  assert.match(G.learnSkill(P, 'fire_bolt'), /недоступно/);
  const spent = 1e6 - P.sp, expect = [2, 3, 4, 5].reduce((a, lv) => a + G.learnCost('power_strike', lv), 0);
  assert.equal(spent, expect);
});

test('сила умения растёт с уровнем, цена растёт', () => {
  for (const id of Object.keys(SKILLS)) {
    const a = G.skillAt(id, 1), b = G.skillAt(id, SKILL_MAX_LV);
    assert.ok(b.mp >= a.mp, id);
    if (a.mul && a.kind === 'debuff') assert.ok(b.mul < a.mul && b.mul > 0, `${id} mul`);
    else if (a.mul) assert.ok(b.mul > a.mul, `${id} mul`);
    if (a.hot) assert.ok(b.hot.amount > a.hot.amount && b.hot.dur === a.hot.dur, `${id} hot`);
    if (a.dot) assert.ok(b.dot.mul > a.dot.mul && b.dot.dur === a.dot.dur, `${id} dot`);
    if (a.amount) assert.ok(b.amount > a.amount && b.amount <= 1, `${id} amount`);
    assert.ok(G.learnCost(id, 3) > G.learnCost(id, 2), `${id} цена`);
  }
  assert.equal(G.skillAt('power_strike', 1).mul, SKILLS.power_strike.mul);
});

test('штраф опыта за слабых мобов', () => {
  assert.equal(G.levelPenalty(10, 8), 1);
  assert.equal(G.levelPenalty(10, 5), 1);
  assert.ok(G.levelPenalty(20, 1) === 0.1);
  const r = G.killReward(3, MOBS.wolf);
  assert.equal(r.xp, MOBS.wolf.xp);
  assert.ok(r.sp > 0);
  assert.ok(G.killReward(30, MOBS.wolf).xp < r.xp);
});

test('группа: бонус за размер, доля по уровню, соло без изменений', () => {
  const rw = { xp: 1000, sp: 100 };
  assert.deepEqual(G.partyShare(rw, [10]), [rw]);
  const two = G.partyShare(rw, [10, 10]);
  assert.equal(two[0].xp, 550); assert.equal(two[0].xp, two[1].xp);
  const mix = G.partyShare(rw, [20, 10]);
  assert.ok(mix[0].xp > mix[1].xp * 3);
  const total = mix.reduce((a, b) => a + b.xp, 0);
  assert.ok(Math.abs(total - 1100) <= 1);
  assert.equal(G.partyShare(rw, Array(9).fill(10)).at(-1).xp, 0);
});

test('заряды подбираются по грейду и школе оружия', () => {
  assert.equal(G.shotFor('sword_novice', 'p'), 'shot_none');
  assert.equal(G.shotFor('sword_long', 'p'), 'shot_d');
  assert.equal(G.shotFor('staff_crystal', 'm'), 'spirit_c');
  assert.equal(G.shotFor('sword_dragon', 'p'), null); // B-грейд зарядов пока нет
  assert.equal(G.shotCost('p'), 1);
  assert.equal(G.shotCost('m', 60), 3);
  for (const [id, it] of Object.entries(ITEMS)) if (it.use === 'shot') assert.ok(it.price > 0 && it.stack, id);
});
