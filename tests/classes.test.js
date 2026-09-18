// Юнит-тесты профессий воина и мага (Копейщик, Лучник, Некромант, Друид), луков и стрел, эффектов и питомцев
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, SKILLS, ITEMS, SHOP, PROFESSIONS, PROF_LVL } from '../src/data.js';
import { calcStats, equipFromBag, wearError, weaponKind, migrate } from '../src/stats.js';
import * as G from '../src/growth.js';
import * as E from '../src/effects.js';
import * as PT from '../src/pets.js';

const hero = (cls, lvl = 30, extra = {}) => G.migrateGrowth(migrate({ cls, lvl, xp: 0, inv: [], equip: {}, enc: {}, ...extra }));
const give = (P, id) => { P.inv.push({ id, n: 1 }); return P.inv.length - 1; };

test('базовые классы — только воин и маг', () => {
  assert.deepEqual(Object.keys(CLASSES).sort(), ['mage', 'warrior']);
});

test('профессии: по четыре у воина и мага, у магов 3–6 умений', () => {
  const ids = (cls) => G.profsFor({ cls }).map((p) => p.id).sort();
  assert.deepEqual(ids('warrior'), ['archer', 'berserker', 'knight', 'pikeman']);
  assert.deepEqual(ids('mage'), ['druid', 'healer', 'necromancer', 'sorcerer']);
  for (const [id, p] of Object.entries(PROFESSIONS)) {
    for (const s of p.skills) assert.ok(SKILLS[s]?.lvl >= PROF_LVL, `${id}: ${s}`);
    for (const k of Object.keys(p.bonus)) assert.ok(k in calcStats(hero(p.base, PROF_LVL)), `${id}: бонус ${k}`);
  }
  assert.equal(PROFESSIONS.druid.skills.length, 5);
  assert.deepEqual(PROFESSIONS.archer.skills, ['aimed_shot', 'swift_feet', 'entangle_shot', 'arrow_rain']);
  const W = hero('warrior', PROF_LVL);
  assert.match(G.changeProf(W, 'necromancer'), /недоступна/);
  assert.equal(G.changeProf(W, 'archer'), null);
  assert.deepEqual(G.skillsOf(W), [...CLASSES.warrior.skills, ...PROFESSIONS.archer.skills]);
  assert.match(G.changeProf(W, 'pikeman'), /уже Лучник/);
  const N = hero('mage', PROF_LVL - 1);
  assert.match(G.changeProf(N, 'necromancer'), /с 20 уровня/);
  N.lvl = PROF_LVL;
  assert.equal(G.changeProf(N, 'necromancer'), null);
});

test('виды оружия и флаги', () => {
  for (const id of ['bow_novice', 'bow_short', 'bow_crystal']) { const it = ITEMS[id]; assert.equal(weaponKind(it), 'bow', id); assert.ok(it.twoHand && it.range === 20, id); }
  for (const id of ['spear_long', 'halberd_crystal']) { assert.equal(weaponKind(ITEMS[id]), 'polearm', id); assert.ok(ITEMS[id].twoHand, id); }
  assert.deepEqual(['bow_novice', 'bow_short', 'bow_crystal', 'spear_long', 'halberd_crystal'].map((id) => ITEMS[id].grade), ['none', 'd', 'c', 'd', 'c']);
  assert.equal(weaponKind(ITEMS.staff_oak), 'staff');
  assert.equal(weaponKind(ITEMS.sword_long), 'sword');
  assert.equal(weaponKind(ITEMS.shield_wood), null);
  for (const id of ['bow_short', 'bow_crystal', 'spear_long', 'halberd_crystal', 'arrow_none', 'arrow_d', 'arrow_c']) assert.ok(SHOP.includes(id), `нет в магазине ${id}`);
});

test('ограничения надевания: луки только Лучнику, древковое любому воину', () => {
  const W = hero('warrior'), M = hero('mage'), A = hero('warrior', 30, { prof: 'archer' }), K = hero('warrior', 30, { prof: 'knight' });
  for (const id of ['bow_novice', 'bow_short', 'bow_crystal']) {
    assert.equal(wearError(A, ITEMS[id]), null, `лучник: ${id}`);
    for (const P of [W, K, M, hero('mage', 30, { prof: 'archer' })]) assert.equal(wearError(P, ITEMS[id]), 'Луки — только для Лучника', `${P.cls}/${P.prof}: ${id}`);
  }
  for (const id of ['spear_long', 'halberd_crystal']) {
    for (const P of [W, A, ...G.profsFor(W).map((p) => hero('warrior', 30, { prof: p.id }))]) assert.equal(wearError(P, ITEMS[id]), null, `${P.prof}: ${id}`);
    assert.match(wearError(M, ITEMS[id]), /только воин/);
  }
  assert.match(wearError(W, ITEMS.staff_oak), /Воин не владеет посохом/);
  assert.match(wearError(A, ITEMS.robe_mystic), /мантии/);
  assert.equal(wearError(M, ITEMS.staff_oak), null);
  assert.match(wearError(hero('warrior', 5, { prof: 'archer' }), ITEMS.bow_short), /уровень 8/);
  // лук и щит вместе не носятся
  equipFromBag(A, give(A, 'shield_wood'));
  assert.equal(equipFromBag(A, give(A, 'bow_crystal')), null);
  assert.equal(A.equip.shield, null); assert.equal(A.equip.weapon, 'bow_crystal');
  equipFromBag(A, give(A, 'shield_wood'));
  assert.equal(A.equip.weapon, null, 'щит снял лук');
  // копьё снимает щит
  const W2 = hero('warrior');
  equipFromBag(W2, give(W2, 'shield_wood'));
  assert.equal(equipFromBag(W2, give(W2, 'spear_long')), null);
  assert.equal(W2.equip.shield, null);
});

test('дальность: лук задаёт 20, копейщик +2 только с древковым', () => {
  const A = hero('warrior', 25, { prof: 'archer' });
  const w0 = calcStats(hero('warrior', 25));
  assert.equal(calcStats(A).range, CLASSES.warrior.range, 'без лука — дальность класса');
  equipFromBag(A, give(A, 'bow_short'));
  assert.equal(calcStats(A).range, 20);
  const pk = hero('warrior', 25, { prof: 'pikeman' });
  assert.equal(calcStats(pk).range, w0.range);
  assert.ok(calcStats(pk).patk > w0.patk * 1.07);
  equipFromBag(pk, give(pk, 'spear_long'));
  assert.equal(calcStats(pk).range, w0.range + 2);
  const kn = hero('warrior', 25, { prof: 'knight' });
  equipFromBag(kn, give(kn, 'spear_long'));
  assert.equal(calcStats(kn).range, w0.range, 'страж без прибавки');
});

test('бонусы профессий', () => {
  const w0 = calcStats(hero('warrior', 25)), ar = calcStats(hero('warrior', 25, { prof: 'archer' }));
  assert.ok(ar.patk > w0.patk * 1.04 && ar.crit > w0.crit && ar.speed > w0.speed && ar.eva > w0.eva && ar.pdef < w0.pdef);
  const m0 = calcStats(hero('mage', 25));
  const ne = calcStats(hero('mage', 25, { prof: 'necromancer' }));
  assert.ok(ne.matk > m0.matk * 1.05 && ne.maxHp > m0.maxHp);
  const dr = calcStats(hero('mage', 25, { prof: 'druid' }));
  assert.ok(dr.maxHp > m0.maxHp * 1.07 && dr.mdef > m0.mdef && dr.matk > m0.matk);
  // чистый боевой маг бьёт сильнее гибридов
  const so = calcStats(hero('mage', 25, { prof: 'sorcerer' }));
  assert.ok(so.matk > ne.matk && ne.matk > dr.matk);
});

test('бафф с дополнительными множителями (also): Дар леса', () => {
  const P = hero('mage', 25, { prof: 'druid' });
  const s0 = calcStats(P);
  const sk = G.skillAt('forest_gift', 1);
  const s1 = calcStats(P, [{ stat: sk.stat, mul: sk.mul, also: sk.also, until: 10 }], 0);
  assert.ok(Math.abs(s1.pdef - s0.pdef * sk.mul) < 1e-9);
  assert.ok(s1.maxHp > s0.maxHp * 1.1);
  assert.equal(calcStats(P, [{ stat: sk.stat, mul: sk.mul, also: sk.also, until: 10 }], 20).maxHp, s0.maxHp, 'истёкший бафф');
  assert.equal(SKILLS.forest_gift.dur, 60);
});

test('стрелы: arrowFor по грейду лука, не лук — null', () => {
  assert.equal(G.arrowFor('bow_novice'), 'arrow_none');
  assert.equal(G.arrowFor('bow_short'), 'arrow_d');
  assert.equal(G.arrowFor('bow_crystal'), 'arrow_c');
  assert.equal(G.arrowFor('sword_long'), null);
  assert.equal(G.arrowFor('spear_long'), null);
  assert.equal(G.arrowFor(null), null);
  assert.equal(G.arrowFor('nope'), null);
  assert.equal(G.ARROW_COST, 1);
  for (const [id, it] of Object.entries(ITEMS)) if (it.use === 'arrow') assert.ok(it.price > 0 && it.stack && it.w > 0, id);
  assert.equal(G.shotFor('bow_short', 'p'), 'shot_d');
});

test('новые умения: поля, требования к оружию, цена', () => {
  for (const id of ['aimed_shot', 'arrow_rain', 'entangle_shot']) assert.ok(SKILLS[id].needBow, id);
  assert.ok(!SKILLS.swift_feet.needBow);
  for (const id of ['wide_sweep', 'lunge']) assert.ok(SKILLS[id].needPolearm, id);
  for (const id of ['trap', 'deadly_shot', 'eagle_eye']) assert.equal(SKILLS[id], undefined, id);
  assert.equal(SKILLS.wide_sweep.cone, 100); assert.equal(SKILLS.wide_sweep.maxTargets, 4);
  assert.equal(SKILLS.lunge.range, 6);
  assert.deepEqual(SKILLS.entangle_shot.slow, { mul: 0.5, dur: 4 });
  assert.equal(SKILLS.curse_weakness.kind, 'debuff'); assert.equal(SKILLS.curse_weakness.mul, 0.75);
  assert.equal(SKILLS.fear_shackles.stat, 'speed'); assert.equal(SKILLS.fear_shackles.mul, 0.6);
  assert.equal(SKILLS.curse_decay.kind, 'dot'); assert.ok(SKILLS.curse_decay.dot.mul > 0 && SKILLS.curse_decay.dot.tick > 0);
  assert.equal(SKILLS.blood_harvest.drain, 0.3); assert.equal(SKILLS.life_steal.drain, 0.6);
  assert.ok(SKILLS.life_steal.mul < SKILLS.blood_harvest.mul && SKILLS.life_steal.lvl === 26);
  assert.equal(SKILLS.raise_skeleton.lvl, 24);
  assert.equal(SKILLS.nature_thorns.school, 'm');
  assert.equal(SKILLS.renewal.kind, 'hot'); assert.ok(SKILLS.renewal.hot.amount > 0);
  assert.equal(SKILLS.awaken_treant.lvl, 28);
  for (const id of ['raise_skeleton', 'call_wolf', 'awaken_treant']) { assert.equal(SKILLS[id].kind, 'summon'); assert.ok(PT.PETS[SKILLS[id].pet], id); assert.equal(SKILLS[id].cast, PT.SUMMON_CAST); }
  // рост с уровнем умения: проклятие сильнее (множитель ниже), тлен и обновление сильнее
  assert.equal(G.skillAt('curse_weakness', 1).mul, 0.75);
  assert.ok(G.skillAt('curse_weakness', 5).mul < 0.75);
  assert.ok(G.skillAt('curse_decay', 5).dot.mul > SKILLS.curse_decay.dot.mul);
  assert.equal(G.skillAt('curse_decay', 5).dot.tick, SKILLS.curse_decay.dot.tick);
  // требования к оружию
  const A = hero('warrior', 30, { prof: 'archer' });
  assert.equal(G.skillGearError(A, SKILLS.aimed_shot), 'Нужен лук');
  assert.equal(G.skillGearError(A, SKILLS.swift_feet), null);
  equipFromBag(A, give(A, 'bow_short'));
  assert.equal(G.skillGearError(A, SKILLS.aimed_shot), null);
  const W = hero('warrior', 30, { prof: 'pikeman' });
  assert.equal(G.skillGearError(W, SKILLS.lunge), 'Нужно древковое оружие');
  assert.equal(G.skillGearError(W, SKILLS.shield_bash), 'Нужен щит');
  equipFromBag(W, give(W, 'halberd_crystal'));
  assert.equal(G.skillGearError(W, SKILLS.wide_sweep), null);
  assert.equal(G.skillGearError(W, SKILLS.power_strike), null);
  // изучение: SP и уровень
  const N = hero('mage', 21, { prof: 'necromancer', sp: 0 });
  assert.equal(G.skillLv(N, 'curse_weakness'), 0);
  assert.match(G.learnSkill(N, 'curse_weakness'), /нужно \d+ SP/);
  N.sp = G.learnCost('curse_weakness', 1);
  assert.equal(G.learnSkill(N, 'curse_weakness'), null);
  assert.equal(N.sp, 0);
  N.sp = 1e6;
  assert.match(G.learnSkill(N, 'raise_skeleton'), /нужен уровень 24/);
  assert.match(G.learnSkill(N, 'call_wolf'), /недоступно/);
  assert.ok(G.learnCost('awaken_treant', 1) > G.learnCost('call_wolf', 1), 'позднее умение дороже');
});

// ---- эффекты ----
test('эффекты: ослабление и замедление, без стака', () => {
  const sk = G.skillAt('curse_weakness', 1);
  let L = E.applyEffect([], E.makeDebuff('curse_weakness', sk, 0, 7));
  assert.equal(E.effectMul(L, 'patk', 1000), 0.75);
  assert.equal(E.effectMul(L, 'speed', 1000), 1);
  // повтор того же проклятия — не стакается, длительность обновляется
  L = E.applyEffect(L, E.makeDebuff('curse_weakness', sk, 10_000, 8));
  assert.equal(L.length, 1);
  assert.equal(E.effectMul(L, 'patk', 15_000), 0.75);
  assert.equal(L[0].until, 22_000);
  // другое ослабление складывается
  L = E.applyEffect(L, E.makeSlow('entangle_shot', SKILLS.entangle_shot.slow, 10_000));
  L = E.applyEffect(L, E.makeDebuff('fear_shackles', SKILLS.fear_shackles, 10_000));
  assert.equal(L.length, 3);
  assert.ok(Math.abs(E.effectMul(L, 'speed', 11_000) - 0.5 * 0.6) < 1e-9);
  assert.equal(E.effectMul(L, 'speed', 14_000), 0.6, 'опутывание (4 с) истекло, оковы (6 с) ещё действуют');
  assert.equal(E.effectMul(L, 'speed', 16_000), 1, 'замедления истекли');
  const t = E.tickEffects(L, 16_500);
  assert.deepEqual(t.list.map((e) => e.id), ['curse_weakness']);
  assert.equal(t.dmg, 0); assert.equal(t.heal, 0);
  assert.equal(E.tickEffects(t.list, 22_000).list.length, 0);
});

test('эффекты: урон со временем тикает, суммарно = mul × атака, обновление без лишних тиков', () => {
  const dot = SKILLS.curse_decay.dot; // 12 с, тик 2 с → 6 тиков
  const d = E.makeDot('curse_decay', dot, 100, 0);
  assert.equal(d.perTick, Math.round((100 * dot.mul) / 6));
  let L = [d], total = 0;
  let r = E.tickEffects(L, 1999); assert.equal(r.dmg, 0); L = r.list;
  r = E.tickEffects(L, 2000); assert.equal(r.dmg, d.perTick); total += r.dmg; L = r.list;
  r = E.tickEffects(L, 7000); assert.equal(r.dmg, 2 * d.perTick); total += r.dmg; L = r.list; // 4 и 6 с
  // обновление в 7 с: фаза сохраняется (следующий тик — 8 с), срок до 19 с
  L = E.applyEffect(L, E.makeDot('curse_decay', dot, 100, 7000));
  assert.equal(L.length, 1); assert.equal(L[0].next, 8000); assert.equal(L[0].until, 19_000);
  r = E.tickEffects(L, 100_000); total += r.dmg;
  assert.equal(r.list.length, 0);
  // 2,4,6 + 8,10,…,18 = 3 + 6 тиков
  assert.equal(total, 9 * d.perTick);
  assert.ok(Math.abs(6 * d.perTick - 100 * dot.mul) <= 6, 'сумма за полный срок');
});

test('эффекты: лечение со временем и кража жизни', () => {
  const h = E.makeHot('renewal', SKILLS.renewal.hot, 1000, 0);
  assert.equal(h.perTick, Math.round(1000 * SKILLS.renewal.hot.amount));
  const r = E.tickEffects([h], 60_000);
  assert.equal(r.heal, 10 * h.perTick); assert.equal(r.dmg, 0); assert.equal(r.list.length, 0);
  assert.equal(E.drainHeal(200, SKILLS.blood_harvest.drain), 60);
  assert.equal(E.drainHeal(200, SKILLS.life_steal.drain), 120);
  assert.equal(E.drainHeal(0, 0.6), 0);
  assert.equal(E.drainHeal(100, undefined), 0);
});

// ---- питомцы ----
const owner = (prof, extra = {}) => ({ id: 7, prof, lvl: 25, matk: 100, pos: { x: 0, z: 0 }, ...extra });

test('питомцы: характеристики растут с уровнем и маг. атакой', () => {
  for (const id of Object.keys(PT.PETS)) {
    const a = PT.petStats(id, { lvl: 1, matk: 20 }), b = PT.petStats(id, { lvl: 30, matk: 20 }), c = PT.petStats(id, { lvl: 30, matk: 200 });
    assert.ok(b.maxHp > a.maxHp && b.patk > a.patk && b.pdef > a.pdef, `${id} уровень`);
    assert.ok(c.maxHp > b.maxHp && c.patk > b.patk, `${id} маг. атака`);
  }
  assert.equal(PT.petStats('nope', { lvl: 1 }), null);
  const sk = PT.petStats('skeleton_pet', { lvl: 20, matk: 60 }), wf = PT.petStats('wolf_pet', { lvl: 20, matk: 60 }), tr = PT.petStats('treant_pet', { lvl: 20, matk: 60 });
  assert.ok(wf.speed > sk.speed && sk.speed > tr.speed, 'скорости');
  assert.ok(tr.maxHp > sk.maxHp && sk.maxHp > wf.maxHp, 'здоровье');
  assert.ok(tr.taunt && !wf.taunt && !sk.taunt, 'таунт');
  assert.equal(PT.PETS.skeleton_pet.dur, 120);
  assert.equal(PT.PETS.wolf_pet.dur, 0); assert.equal(PT.PETS.treant_pet.dur, 0);
});

test('питомцы: лимит 1, новый призыв заменяет старого, срок жизни', () => {
  assert.equal(PT.petLimit('necromancer', 'skeleton_pet'), 1);
  assert.equal(PT.petLimit('druid', 'wolf_pet'), 1);
  assert.equal(PT.petLimit('druid', 'skeleton_pet'), 0);
  assert.equal(PT.petLimit('archer', 'wolf_pet'), 0);
  assert.match(PT.summonPet([], 'skeleton_pet', owner('druid')).err, /не умеете/);
  const N = owner('necromancer');
  let r = PT.summonPet([], 'skeleton_pet', N, 1000);
  assert.equal(r.err, null); assert.equal(r.pets.length, 1); assert.deepEqual(r.removed, []);
  const first = r.pets[0];
  assert.equal(first.owner, 7); assert.equal(first.until, 1000 + 120_000); assert.equal(first.hp, first.maxHp);
  r = PT.summonPet(r.pets, 'skeleton_pet', N, 2000);
  assert.equal(r.pets.length, 1); assert.deepEqual(r.removed, [first], 'заменён старый');
  assert.equal(r.pets[0].born, 2000);
  // друид: волк и древень делят один слот
  const D = owner('druid');
  let d = PT.summonPet([], 'wolf_pet', D, 0);
  assert.equal(d.pets[0].until, null, 'зверь бессрочный');
  d = PT.summonPet(d.pets, 'treant_pet', D, 10);
  assert.equal(d.pets.length, 1); assert.equal(d.pets[0].pet, 'treant_pet'); assert.equal(d.removed[0].pet, 'wolf_pet');
  // гибель и истечение
  const list = [...r.pets, { ...d.pets[0], hp: 0 }];
  assert.equal(PT.expirePets(list, 2000 + 119_000).length, 1);
  assert.equal(PT.expirePets(list, 2000 + 120_000).length, 0);
  assert.equal(PT.expirePets(d.pets, 1e12).length, 1, 'зверь живёт без срока');
});

test('питомцы: решения поведения во всех ветках', () => {
  const O = { x: 0, z: 0 };
  const pet = (x, z, target = null) => ({ pos: { x, z }, target });
  const mob = (id, x, z, extra = {}) => ({ id, pos: { x, z }, dead: false, ...extra });
  let r = PT.petDecide(pet(41, 0), O, mob(1, 42, 0), []);
  assert.equal(r.action, 'return'); assert.ok(r.teleport); assert.deepEqual(r.pos, O);
  r = PT.petDecide(pet(30, 0), O, mob(1, 5, 0), []);
  assert.equal(r.action, 'return'); assert.ok(!r.teleport);
  const t = mob(1, 10, 0);
  r = PT.petDecide(pet(2, 0), O, t, []);
  assert.equal(r.action, 'attack'); assert.equal(r.target, t);
  const hitter = mob(2, -5, 0, { hitsOwner: true });
  r = PT.petDecide(pet(2, 0), O, { ...t, dead: true }, [mob(3, 4, 0), hitter]);
  assert.equal(r.action, 'attack'); assert.equal(r.target, hitter);
  assert.equal(PT.petDecide(pet(2, 0), O, t, [hitter]).target, t, 'цель хозяина приоритетнее');
  r = PT.petDecide(pet(2, 0), O, mob(1, 30, 0), [mob(2, 26, 0, { hitsOwner: true })]);
  assert.notEqual(r.action, 'attack', 'за поводком не гонится');
  const old = mob(5, 6, 0);
  r = PT.petDecide(pet(2, 0, 5), O, null, [old]);
  assert.equal(r.action, 'attack'); assert.equal(r.target, old);
  r = PT.petDecide(pet(10, 0), O, null, [mob(3, 4, 0)]);
  assert.equal(r.action, 'follow');
  const dd = Math.hypot(r.pos.x, r.pos.z);
  assert.ok(dd >= 2 && dd <= 3, `дистанция ${dd}`);
  assert.ok(r.pos.x > 0, 'со стороны питомца');
  r = PT.petDecide(pet(2.5, 0), O, null, []);
  assert.equal(r.action, 'idle'); assert.equal(r.target, null);
});

test('опыт за убийство питомцем — хозяину', () => {
  const r = PT.summonPet([], 'wolf_pet', owner('druid', { id: 42 }), 0);
  assert.equal(PT.petKillOwner(r.pets[0]), 42);
  assert.equal(PT.petKillOwner({ id: 9 }), 9);
  assert.equal(PT.petKillOwner(null), null);
});

// ---- баланс: главный удар профессии на 20 и 40 уровне сопоставим с соседями ----
const MAIN = { knight: 'power_strike', berserker: 'cleave', pikeman: 'lunge', archer: 'aimed_shot', sorcerer: 'lightning', healer: 'fire_bolt', necromancer: 'blood_harvest', druid: 'nature_thorns' };
const gear = { knight: ['sword_crystal', 'shield_iron'], berserker: ['sword_crystal'], pikeman: ['halberd_crystal'], archer: ['bow_crystal'], sorcerer: ['staff_crystal'], healer: ['staff_crystal'], necromancer: ['staff_crystal'], druid: ['staff_crystal'] };
export function balanceRow(prof, lvl) {
  const p = PROFESSIONS[prof], P = hero(p.base, lvl, { prof });
  for (const id of gear[prof]) equipFromBag(P, give(P, id));
  const s = calcStats(P), sk = SKILLS[MAIN[prof]], atk = sk.school === 'm' ? s.matk : s.patk;
  return { prof, lvl, s, sk, hit: atk * sk.mul, dps: (atk * sk.mul) / sk.cd };
}
test('баланс: урон главного умения в пределах ±35% от среднего своего класса', () => {
  for (const lvl of [20, 40]) for (const base of ['warrior', 'mage']) {
    const rows = Object.keys(MAIN).filter((k) => PROFESSIONS[k].base === base && k !== 'knight' && k !== 'healer').map((k) => balanceRow(k, lvl));
    const avg = rows.reduce((a, r) => a + r.hit, 0) / rows.length;
    for (const r of rows) assert.ok(r.hit > avg * 0.65 && r.hit < avg * 1.35, `${r.prof} ${lvl}: ${r.hit.toFixed(0)} при среднем ${avg.toFixed(0)}`);
  }
});
