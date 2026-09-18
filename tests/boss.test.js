// Правила боссов без DOM: node --test tests/boss.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phaseAt, createBoss, resetBoss, bossTick, bossAspd, addHate, healHate, dropHate, topHate, inCircle, farthest, ringPoints } from '../src/boss.js';
import { BOSS, MOBS } from '../src/data.js';

const P = BOSS.lich.phases;
const run = (b, frac, sec, step = 0.1) => { const ev = []; for (let t = 0; t < sec - 1e-9; t += step) ev.push(...bossTick(b, frac, step)); return ev; };
const types = (ev, t) => ev.filter((e) => e.type === t);

test('фазы Короля-лича: 100–70, 70–35, ниже 35', () => {
  assert.ok(MOBS.lich.boss && BOSS.lich);
  assert.equal(phaseAt(1, P), 0);
  assert.equal(phaseAt(0.71, P), 0);
  assert.equal(phaseAt(0.7, P), 0, 'ровно 70% — ещё первая');
  assert.equal(phaseAt(0.69, P), 1);
  assert.equal(phaseAt(0.36, P), 1);
  assert.equal(phaseAt(0.34, P), 2);
  assert.equal(phaseAt(0, P), 2);
});

test('фаза 1: теневой залп по таймеру, без призыва и кругов', () => {
  const b = createBoss('lich');
  const ev = run(b, 1, 20);
  assert.equal(types(ev, 'phase').length, 1);
  assert.equal(types(ev, 'summon').length, 0);
  assert.equal(types(ev, 'doom').length, 0);
  const v = types(ev, 'volley');
  assert.ok(v.length >= 2 && v.length <= 3, `залпов ${v.length}`);
  assert.equal(v[0].n, 3);
  assert.equal(bossAspd(b), 1);
});

test('фаза 2: призыв трёх скелетов один раз, круг гибели с телеграфом', () => {
  const b = createBoss('lich');
  run(b, 1, 1);
  let ev = run(b, 0.6, 25);
  const s = types(ev, 'summon');
  assert.equal(s.length, 1, 'призыв один раз');
  assert.equal(s[0].mob, 'skeleton'); assert.equal(s[0].n, 3);
  const d = types(ev, 'doom');
  assert.ok(d.length >= 2, `кругов ${d.length}`);
  assert.ok(d[0].delay >= 1 && d[0].r > 0, 'телеграф и радиус');
  assert.equal(types(ev, 'volley').length, 0, 'залп только в первой фазе');
  // подлечился и снова ниже 70% — повторного призыва нет
  ev = [...run(b, 0.9, 2), ...run(b, 0.6, 5)];
  assert.equal(types(ev, 'summon').length, 0);
  assert.equal(b.phase, 1, 'фазы не откатываются');
});

test('фаза 3: ярость ×1.5 и ледяная тюрьма', () => {
  const b = createBoss('lich');
  const ev = run(b, 0.2, 15);
  assert.equal(b.phase, 2);
  assert.equal(bossAspd(b), 1.5);
  const p = types(ev, 'prison');
  assert.ok(p.length >= 1 && p[0].sec === 1.5 && p[0].delay > 0);
  assert.equal(types(ev, 'summon').length, 0, 'прыжок сразу в третью фазу — без призыва второй');
});

test('сброс: босс снова начинает с первой фазы и снова призывает', () => {
  const b = createBoss('lich');
  run(b, 0.6, 1); addHate(b, 'hero', 100);
  resetBoss(b);
  assert.equal(b.phase, -1); assert.equal(b.hate.size, 0);
  run(b, 1, 0.2);
  assert.equal(types(run(b, 0.6, 0.2), 'summon').length, 1);
});

test('ненависть: урон и лечение, цель — у кого больше', () => {
  const b = createBoss('lich');
  assert.equal(topHate(b), null);
  addHate(b, 'hero', 300);
  assert.equal(topHate(b), 'hero', 'одиночка — герой');
  addHate(b, 'tank', 250);
  healHate(b, 'healer', 400); // 200
  assert.equal(topHate(b), 'hero');
  addHate(b, 'tank', 100);
  assert.equal(topHate(b), 'tank');
  healHate(b, 'healer', 600); // +300 = 500
  assert.equal(topHate(b), 'healer', 'лечение тоже злит');
  addHate(b, 'hero', -50); addHate(b, 'hero', NaN);
  assert.equal(b.hate.get('hero'), 300, 'отрицательное и NaN не меняют');
  dropHate(b, 'healer');
  assert.equal(topHate(b), 'tank');
});

test('геометрия: круг, дальняя цель, точки призыва', () => {
  assert.ok(inCircle({ x: 3, z: 4 }, { x: 0, z: 0 }, 5));
  assert.ok(!inCircle({ x: 3, z: 4.1 }, { x: 0, z: 0 }, 5));
  assert.equal(farthest({ x: 0, z: 0 }, [{ id: 'a', x: 5, z: 0 }, { id: 'b', x: 0, z: 9 }, { id: 'c', x: 1, z: 1 }]).id, 'b');
  assert.equal(farthest({ x: 0, z: 0 }, []), null);
  const pts = ringPoints({ x: 10, z: 10 }, 3, 4);
  assert.equal(pts.length, 3);
  for (const q of pts) assert.ok(Math.abs(Math.hypot(q.x - 10, q.z - 10) - 4) < 1e-9);
});
