// Эффекты на цели: ослабления (debuff/slow), урон со временем (dot), лечение со временем (hot), кража жизни (drain).
// Без DOM — чистые функции, проверяются юнит-тестами. Время — в мс (как performance.now()).
// Эффект: { id, kind: 'debuff'|'dot'|'hot', stat?, mul?, perTick?, tick?, next?, until, from? }

// ослабление характеристики цели (debuff умения или slow выстрела)
export function makeDebuff(id, { stat, mul, dur }, now, from = null) {
  return { id, kind: 'debuff', stat, mul, until: now + dur * 1000, from };
}
// замедление: поле slow умения { mul, dur } → ослабление скорости
export const makeSlow = (id, slow, now, from = null) => makeDebuff(id, { stat: 'speed', mul: slow.mul, dur: slow.dur }, now, from);

// урон со временем: dot { mul, dur, tick } — mul — суммарный множитель атаки за всё время
export function makeDot(id, dot, atk, now, from = null) {
  const ticks = Math.max(1, Math.floor(dot.dur / dot.tick));
  return { id, kind: 'dot', perTick: Math.max(1, Math.round((atk * dot.mul) / ticks)), tick: dot.tick * 1000, next: now + dot.tick * 1000, until: now + dot.dur * 1000, from };
}
// лечение со временем: hot { amount, dur, tick } — amount — доля макс. здоровья цели за тик
export function makeHot(id, hot, maxHp, now, from = null) {
  const tick = hot.tick || 1;
  return { id, kind: 'hot', perTick: Math.max(1, Math.round(maxHp * hot.amount)), tick: tick * 1000, next: now + tick * 1000, until: now + hot.dur * 1000, from };
}

// наложение: одинаковый эффект (тот же id) не стакается — обновляет длительность и силу, фаза тиков сохраняется
export function applyEffect(list, eff) {
  const i = list.findIndex((e) => e.id === eff.id);
  if (i < 0) return [...list, eff];
  const old = list[i];
  const upd = { ...eff, next: old.next ?? eff.next };
  return list.map((e, k) => (k === i ? upd : e));
}

// такт: считает тики с прошлого вызова, убирает истёкшие; { list, dmg, heal }
export function tickEffects(list, now) {
  let dmg = 0, heal = 0;
  const out = [];
  for (const e of list) {
    if (e.tick) {
      let next = e.next, n = 0;
      while (next <= now && next <= e.until) { n++; next += e.tick; }
      if (e.kind === 'dot') dmg += n * e.perTick;
      if (e.kind === 'hot') heal += n * e.perTick;
      if (e.until > now) out.push(n ? { ...e, next } : e);
    } else if (e.until > now) out.push(e);
  }
  return { list: out, dmg, heal };
}

// итоговый множитель характеристики от активных ослаблений
export function effectMul(list, stat, now) {
  let m = 1;
  for (const e of list) if (e.kind === 'debuff' && e.stat === stat && e.until > now) m *= e.mul;
  return m;
}

// кража жизни: сколько лечит нанесённый урон
export const drainHeal = (dmg, drain) => (drain > 0 && dmg > 0 ? Math.round(dmg * drain) : 0);
