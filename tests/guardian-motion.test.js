import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGuardianMotion, usesGuardian } from '../src/guardian-motion.js';
test('модель только для человека-воина; старый воин без расы совместим', () => {
  assert.ok(usesGuardian({ cls: 'warrior' })); assert.ok(usesGuardian({ cls: 'warrior', race: 'human' }));
  assert.ok(!usesGuardian({ cls: 'mage' })); assert.ok(!usesGuardian({ cls: 'warrior', race: 'elf' }));
});
test('смерть выше атаки, движение выше покоя, две атаки чередуются', () => {
  const m = createGuardianMotion();
  assert.equal(m.step({}, 0).name, 'Idle'); assert.equal(m.step({ moving: true }, 0).name, 'Run');
  assert.equal(m.step({ attackT: 1 }, 0).name, 'Attack'); m.step({ attackT: 0 }, 1);
  assert.equal(m.step({ attackT: 1 }, 0).name, 'Combo');
  assert.equal(m.step({ attackT: 1, dieT: 0, moving: true }, 0).name, 'Death');
  assert.equal(m.step({ dieT: 2 }, 10).name, 'Death'); assert.equal(m.step({}, 0).name, 'Idle');
});
test('танец только на событие уровня вне боя; не ставится в очередь', () => {
  const m = createGuardianMotion({ LevelUp: 2 });
  assert.equal(m.celebrate({ inCombat: true }), false); assert.equal(m.step({}, 0).name, 'Idle');
  assert.equal(m.celebrate({}), true); assert.equal(m.step({}, 0.1).name, 'LevelUp'); assert.equal(m.step({}, 3).name, 'Idle');
});
test('движение, бой и каст прерывают танец без возобновления', () => {
  for (const s of [{ moving: true }, { inCombat: true }, { casting: true }]) {
    const m = createGuardianMotion(); m.celebrate({});
    assert.notEqual(m.step(s, 0).name, 'LevelUp'); assert.equal(m.step({}, 0).name, 'Idle');
  }
});
test('обычный урон не запускает сильное отбрасывание и не сбивает атаку', () => {
  const m = createGuardianMotion();
  m.step({ attackT: 1 }, 0);
  assert.equal(m.step({ attackT: 0.9, hitT: 1 }, 0.01).name, 'Attack');
  assert.equal(m.step({ casting: true, hitT: 1 }, 0.01).name, 'Skill01');
});

test('темп ног следует фактическому пути, а не нажатию кнопки', () => {
  const m = createGuardianMotion();
  const run = m.step({ moving: true, travelSpeed: 6.5 }, 0);
  assert.equal(run.name, 'Run'); assert.ok(run.rate > 1.3 && run.rate < 1.5);
  assert.equal(m.step({ moving: true, travelSpeed: 0 }, 0).name, 'Idle');
  const walk = m.step({ moving: true, travelSpeed: 1.89 }, 0);
  assert.equal(walk.name, 'Walk'); assert.equal(walk.rate, 1);
  const slower = m.step({ moving: true, travelSpeed: 0.945 }, 0);
  assert.equal(slower.rate, 0.5);
});
test('уход после удара сразу включает шаги, не провозит стоящую позу атаки', () => {
  const m = createGuardianMotion(); m.step({ attackT: 1 }, 0);
  assert.equal(m.step({ attackT: 0.9, moving: true, travelSpeed: 6.5 }, 0.016).name, 'Run');
});


test('боевой клич играет Skill01 один раз и не сбивается очередной автоатакой', () => {
  const m = createGuardianMotion({ Skill01: 1.17 });
  const s = { skillPulse: 1, skillAnimation: 'Skill01' };
  assert.equal(m.step(s, 0).name, 'Skill01');
  assert.equal(m.step({ ...s, attackT: 1 }, .1).name, 'Skill01');
  assert.equal(m.step(s, 1.2).name, 'Idle');
  assert.equal(m.step(s, .1).name, 'Idle');
  assert.equal(m.step({ skillPulse: 2, skillAnimation: 'Skill03' }, 0).name, 'Skill03');
});
