// Юнит-тесты плавности: node --test tests/anim.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { damp, angDiff, turnTo, stepTurn, sampleSnaps, pushSnap, trimSnaps, spring } from '../src/anim.js';

const obj = (y = 0) => ({ rotation: { y }, userData: {} });

test('damp не зависит от частоты кадров', () => {
  let a = 0, b = 0;
  for (let i = 0; i < 60; i++) a = damp(a, 1, 5, 1 / 60);
  for (let i = 0; i < 20; i++) b = damp(b, 1, 5, 1 / 20);
  assert.ok(Math.abs(a - b) < 1e-9);
  assert.ok(a > 0.99 && a < 1);
});

test('angDiff — кратчайший путь через ±π', () => {
  assert.ok(Math.abs(angDiff(3, -3) - (2 * Math.PI - 6)) < 1e-9);
  assert.ok(Math.abs(angDiff(-3, 3) + (2 * Math.PI - 6)) < 1e-9);
  assert.ok(Math.abs(angDiff(0, 7 * Math.PI)) - Math.PI < 1e-9);
});

test('turnTo поворачивает плавно и по кратчайшему углу', () => {
  const o = obj(3);
  turnTo(o, -3, 1 / 60);
  // первый кадр: не мгновенно, но в сторону +π
  assert.ok(o.rotation.y > 3 || o.rotation.y < -3, `ушёл не туда: ${o.rotation.y}`);
  assert.ok(Math.abs(angDiff(o.rotation.y, -3)) > 0.05);
  for (let i = 0; i < 60; i++) turnTo(o, -3, 1 / 60);
  assert.ok(Math.abs(angDiff(o.rotation.y, -3)) < 0.01);
  assert.ok(o.rotation.y <= Math.PI && o.rotation.y > -Math.PI);
});

test('после одного turnTo поворот доводит stepTurn, без двойного шага в том же кадре', () => {
  const o = obj(0);
  turnTo(o, 1.5, 1 / 60);
  const y1 = o.rotation.y;
  stepTurn(o, 1 / 60); // тот же кадр — пропуск
  assert.equal(o.rotation.y, y1);
  for (let i = 0; i < 90; i++) stepTurn(o, 1 / 60);
  assert.ok(Math.abs(o.rotation.y - 1.5) < 0.001);
  assert.equal(o.userData.yawGoal, undefined);
});

test('sampleSnaps: интерполяция, инерция не дольше 250 мс, до первого — первый', () => {
  const B = [{ t: 0, x: 0, y: 0, z: 0, r: 0 }, { t: 100, x: 10, y: 1, z: 0, r: 1 }];
  const o = {};
  sampleSnaps(B, 50, o); assert.equal(o.x, 5); assert.equal(o.y, 0.5);
  sampleSnaps(B, -20, o); assert.equal(o.x, 0);
  sampleSnaps(B, 200, o); assert.equal(o.x, 20); assert.equal(o.y, 1);
  sampleSnaps(B, 1000, o); assert.equal(o.x, 35);
  assert.equal(sampleSnaps([], 0, o), false);
});

test('sampleSnaps + trimSnaps: выбирает нужный отрезок', () => {
  const B = [0, 100, 200, 300].map((t) => ({ t, x: t / 10, y: 0, z: 0, r: 0 }));
  const o = {};
  sampleSnaps(B, 250, o); assert.equal(o.x, 25);
  trimSnaps(B, 250); assert.equal(B[0].t, 200);
  sampleSnaps(B, 250, o); assert.equal(o.x, 25);
});

test('pushSnap пропускает один устаревший повтор, но принимает остановку', () => {
  const r = { buf: [] };
  pushSnap(r, { t: 0, x: 0, y: 0, z: 0, r: 0 });
  pushSnap(r, { t: 100, x: 1, y: 0, z: 0, r: 0 });
  assert.equal(pushSnap(r, { t: 200, x: 1, y: 0, z: 0, r: 0 }), false);
  assert.equal(pushSnap(r, { t: 300, x: 1, y: 0, z: 0, r: 0 }), true);
  assert.equal(r.buf.length, 3);
});

test('spring затухает', () => {
  const s = { x: 0, v: 6 };
  let peak = 0;
  for (let i = 0; i < 120; i++) peak = Math.max(peak, spring(s, 1 / 60));
  assert.ok(peak > 0.2 && Math.abs(s.x) < 0.01);
});
