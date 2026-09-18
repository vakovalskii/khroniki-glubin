// Плавность: сглаживание по dt, поворот по кратчайшему углу, интерполяция снапшотов. Без DOM и three — покрыто юнит-тестами.

// экспоненциальное сглаживание: за 1/rate секунды проходит ~63% пути, не зависит от частоты кадров
export const damp = (cur, goal, rate, dt) => cur + (goal - cur) * (1 - Math.exp(-rate * dt));
// равномерно к цели не быстрее step за вызов
export const approach = (cur, goal, step) => (cur < goal ? Math.min(goal, cur + step) : Math.max(goal, cur - step));
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth01 = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
// кратчайшая разница углов в (-π, π]
export const angDiff = (from, to) => { let d = (to - from) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; else if (d <= -Math.PI) d += Math.PI * 2; return d; };
export const dampAngle = (cur, goal, rate, dt) => cur + angDiff(cur, goal) * (1 - Math.exp(-rate * dt));

// Плавный поворот объекта к yaw. Цель запоминается: если в следующих кадрах turnTo не вызывают,
// поворот доводит anim модели (stepTurn). rate ≈ 12 рад/с — разворот на 180° примерно за 0.25 с.
export function turnTo(obj, yaw, dt = 1 / 60, rate = 12) {
  const u = obj.userData;
  u.yawGoal = yaw; u.yawRate = rate; u.yawDone = true;
  turnStep(obj, dt);
}
export function stepTurn(obj, dt) {
  const u = obj.userData;
  if (u.yawDone) { u.yawDone = false; return; }
  if (u.yawGoal === undefined) { u.yawVel = damp(u.yawVel || 0, 0, 10, dt); return; }
  turnStep(obj, dt);
}
function turnStep(obj, dt) {
  const u = obj.userData, r = obj.rotation;
  const d = angDiff(r.y, u.yawGoal);
  let step = d * (1 - Math.exp(-u.yawRate * dt));
  if (Math.abs(d) < 1e-3) step = d;
  // держим угол в (-π, π], чтобы не копились обороты
  r.y = r.y + step;
  if (r.y > Math.PI) r.y -= Math.PI * 2; else if (r.y <= -Math.PI) r.y += Math.PI * 2;
  // скорость поворота (для крена в повороте), сглаженная
  if (dt > 0) u.yawVel = damp(u.yawVel || 0, step / dt, 10, dt);
  if (step === d) u.yawGoal = undefined;
}

// Буфер снапшотов удалённого игрока: [{ t, x, y, z, r }], время — серверное (мс).
// Рисуем на delay мс в прошлом; если свежего снапшота нет — по инерции не дольше maxExtra мс, дальше стоим.
export const INTERP_DELAY = 100, MAX_EXTRA = 250;
export function sampleSnaps(buf, rt, out, maxExtra = MAX_EXTRA) {
  if (!buf.length) return false;
  let i = 0;
  while (i < buf.length - 2 && buf[i + 1].t <= rt) i++;
  const a = buf[i], b = buf[i + 1];
  if (!b || rt <= a.t) { out.x = a.x; out.y = a.y; out.z = a.z; out.r = a.r; return true; }
  const span = Math.max(1, b.t - a.t);
  const k = Math.min((rt - a.t) / span, 1 + maxExtra / span);
  const kk = Math.min(k, 1);
  out.x = a.x + (b.x - a.x) * k; out.z = a.z + (b.z - a.z) * k;
  out.y = a.y + (b.y - a.y) * kk;
  out.r = a.r + angDiff(a.r, b.r) * kk;
  return true;
}
// Снапшот устарел (сервер повторил прошлое положение, пока клиент молчал)? Первый повтор после движения пропускаем.
export function pushSnap(r, s) {
  const B = r.buf, last = B[B.length - 1], prev = B[B.length - 2];
  if (last && s.x === last.x && s.z === last.z && s.r === last.r && prev && (prev.x !== last.x || prev.z !== last.z) && !r.dupSkip) { r.dupSkip = true; return false; }
  r.dupSkip = false;
  B.push(s);
  if (B.length > 30) B.shift();
  return true;
}
// удаляем снапшоты, которые уже не понадобятся
export function trimSnaps(buf, rt) { while (buf.length > 2 && buf[1].t <= rt) buf.shift(); }

// Пружина (для отдачи и тряски): x'' = -k·x - c·x'
export function spring(s, dt, k = 120, c = 14) {
  s.v += (-k * s.x - c * s.v) * dt;
  s.x += s.v * dt;
  return s.x;
}
