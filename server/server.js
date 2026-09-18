import { createGroups } from './sim/groups.js';
import { createGroundLoot } from './sim/ground-loot.js';
import { createCompanions } from './sim/companions.js';
import { makeDebuff, makeSlow, makeDot, makeHot, applyEffect, tickEffects, effectMul } from '../src/effects.js';
import { needsEnemy, coneTargets, dashPoint, townOk } from '../src/skills.js';
import { arrowFor, shotFor, shotCost, SHOT_MUL } from '../src/growth.js';
import { skillAt, skillLv, killReward } from '../src/growth.js';
// WS-сервер «Хроник Глубин»: авторитетная симуляция мира.
// Сервер владеет прогрессом, мобами и боем; клиент присылает намерения и рисует результат.
// Запуск: node server/server.js (PORT — 8790, DB — файл SQLite). Прод: systemd realms-ws, nginx /ws.
import { WebSocketServer } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './accounts.js';
import { zoneAt, TOWNS, DUNGEON, CRYPT, heightAt } from '../src/world-core.js';
import { PVP, karmaForPk, karmaWashCost } from '../src/pvp.js';
import { CLASSES, SKILLS, ITEMS } from '../src/data.js';
import { heroDamage, calcDmg, missChance, evaChance, flatDist, clamp } from '../src/sim.js';
import { createMobs } from './sim/mobs.js';
import * as PL from './sim/player.js';

const acc = openDb(process.env.DB || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'realms.db'));

const PORT = Number(process.env.PORT) || 8790;
const VIEW = 220;  // м — кого видно
const NEAR = 60;   // м — канал «Рядом»
const TICK = 100;  // мс — шаг симуляции
// клиент видит мир на ~250 мс в прошлом (снапшот + интерполяция), поэтому по движущейся цели
// его оценка расстояния отстаёт на несколько метров. Допуск, чтобы честные удары не пропадали.
const LAG_M = 4;
// отладочные команды для автотестов: включаются только переменной окружения, в проде их нет
const DEV_CMD = process.env.DEV_CMD === '1';
const CHAT = { all: { cd: 3000 }, trade: { cd: 10000 }, near: { cd: 800 } };
const wss = new WebSocketServer({ port: PORT, maxPayload: 8000 });
const players = new Map();
let seq = 0;

const world = createMobs();
const companions = createCompanions();
const groundLoot=createGroundLoot();
const groups=createGroups(players,(p,m)=>send(p,m));
const cryptDoor = { x: CRYPT.x, z: CRYPT.z + 8.5 };
const dungeonExit = { x: DUNGEON.x0 + DUNGEON.cell / 2, z: DUNGEON.z0 + DUNGEON.cell / 2 };

const num = (v, lim = 1e5) => (Number.isFinite(+v) ? Math.max(-lim, Math.min(lim, +v)) : 0);
const cleanText = (s) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 160);
const send = (p, m) => { if (p.ws.readyState === 1) p.ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };
const d2 = (a, b) => Math.hypot(a.a.x - b.a.x, a.a.z - b.a.z);
const actors = () => [...players.values()].filter((p) => p.key).map((p) => p.a);
// внешний вид: сервер собирает его сам из экипировки — клиент на него не влияет
const matKind = (it) => (!it ? 'cloth' : it.set === 'chain' ? 'chain' : it.set === 'bone' ? 'plate' : it.set === 'leather' ? 'leather' : 'cloth');
function lookOf(P) {
  const g = (sl) => ITEMS[P.equip[sl]], w = g('weapon'), a = g('armor');
  return {
    cls: P.cls, race: P.race || 'human', lvl: P.lvl, w: w ? w.color : null, staff: !!w?.twoHand && !w?.bow && !w?.polearm, bow: !!w?.bow, polearm: !!w?.polearm, ench: P.enc.weapon || 0,
    body: a && a.grade !== 'none' ? a.color : CLASSES[P.cls].color, robe: !!a?.robe || (P.cls === 'mage' && !a), mat: matKind(a),
    gear: { head: g('head')?.color ?? null, legs: g('legs')?.color ?? null, gloves: g('gloves')?.color ?? null, feet: g('feet')?.color ?? null, shield: g('shield')?.color ?? null,
      helmKind: g('head')?.set ?? null, shieldKind: g('shield') ? (g('shield').grade === 'd' ? 'wood' : 'plate') : null, legKind: matKind(g('legs')) },
  };
}
const online = () => [...players.values()].filter((p) => p.key).length;
const broadcast = (m) => { const s = JSON.stringify(m); for (const p of players.values()) if (p.key) send(p, s); };

// попытки входа: не больше 12 в минуту с адреса (в автотестах лимит поднимают)
const TRY_MAX = Number(process.env.AUTH_TRIES) || 12;
const tries = new Map();
const tooMany = (ip) => {
  const now = Date.now(), t = tries.get(ip) || { n: 0, at: now };
  if (now - t.at > 60_000) { t.n = 0; t.at = now; }
  tries.set(ip, t);
  return ++t.n > TRY_MAX;
};
setInterval(() => { const now = Date.now(); for (const [ip, t] of tries) if (now - t.at > 60_000) tries.delete(ip); }, 60_000);

const store = (p) => { if (p.key && p.a) acc.store(p.key, PL.profileOf(p.a)); };

wss.on('connection', (ws, req) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const p = { id: ++seq, ws, name: null, key: null, a: null, known: new Set(), knownMobs: new Set(), lastChat: {}, stN: 0, stT: 0 };
  players.set(p.id, p);
  send(p, { t: 'hi', online: online() });
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'auth' || m.t === 'login' || m.t === 'register') return onAuth(p, m, ip);
    if (!p.key) return;
    const a = p.a, now = Date.now();
    switch (m.t) {
      case 'logout': if (m.token) acc.logout(m.token); return;
      // положение по-прежнему ведёт клиент — но сервер проверяет скорость
      case 'st': {
        if (now - p.stT > 1000) { p.stT = now; p.stN = 0; }
        if (++p.stN > 25) return;
        const x = num(m.x), z = num(m.z);
        if (a.dead || now < (a.stunUntil || 0)) { send(p, { t: 'fix', x: a.x, z: a.z }); return; }
        const s = PL.statsOf(a, now), dt = Math.min(1, (now - (a.stAt || now)) / 1000) + 0.15;
        if (now > (a.warpUntil || 0) && flatDist(a, { x, z }) > s.speed * 1.8 * dt + 2) {
          send(p, { t: 'fix', x: a.x, z: a.z }); // рывок быстрее бега — возвращаем назад
          return;
        }
        if(flatDist(a,{x,z})>.1 && a.sitting) { a.sitting=false; a.dirty=true; }
        a.stAt = now; a.x = x; a.z = z; a.y = num(m.y, 1e4); a.r = num(m.r, 10); a.anim = num(m.a, 255) | 0;
        checkDoors(p, a);
        return;
      }
      // выбор цели и автоатака: hold — просто взять на прицел, не нападая
      case 'pinvite': case 'paccept': case 'pdecline': case 'pleave': case 'pkick': case 'plead': case 'pchat': groups.handle(a,m,now); return;
      case 'atk': {
        if (a.dead) return;
        if (m.id == null) { a.attacking = false; a.target = null; return; }
        a.target = m.kind === 'p' ? { p: m.id | 0 } : { m: m.id | 0 };
        a.attacking = !m.hold;
        return;
      }
      case 'pick': groundLoot.pick(a, m.uid | 0, now); return;
      case 'sit': PL.cmdSit(a, now); return;
      case 'petfollow': companions.command(a.id, !!m.follow); return;
      case 'shots': if (m.school === 'p' || m.school === 'm') { a.P.shots[m.school] = !!m.enabled; a.dirty = true; } return;
      case 'profession': case 'learn': return PL.cmdMentor(a, world.npcs, m.t, String(m.id || ''));
      case 'skill': return onSkill(p, a, String(m.id || ''), now);
      case 'use': return PL.cmdUse(a, String(m.id || ''));
      case 'equip': return PL.cmdEquip(a, m.idx | 0, m.slot);
      case 'unequip': return PL.cmdUnequip(a, String(m.slot || ''));
      case 'buy': return PL.cmdBuy(a, world.npcs, String(m.id || ''), m.n);
      case 'sell': return PL.cmdSell(a, world.npcs, m.idx | 0, m.n);
      case 'ench': return PL.cmdEnch(a, String(m.scroll || ''), m.ref || {});
      case 'tp': { PL.cmdTeleport(a, world.npcs, String(m.id || '')); a.warpUntil = now + 2000; return; }
      case 'respawn': { PL.respawn(a); a.warpUntil = now + 2000; return; }
      case 'dev': {
        if (!DEV_CMD) return;
        if (m.x != null) { PL.place(a, num(m.x), num(m.z)); a.warpUntil = now + 2000; }
        if (m.coins != null) a.P.coins = Math.max(0, num(m.coins, 1e9) | 0);
        if (m.lvl != null) a.P.lvl = clamp(m.lvl | 0, 1, 40);
        if (m.hp != null) a.P.hp = num(m.hp, 1e6);
        if (m.item) PL.addItem(a.P, String(m.item), Math.max(1, m.n | 0));
        if (m.sp != null) a.P.sp=Math.max(0, m.sp|0);
        if (m.xp != null) PL.gainXp(a, num(m.xp, 1e7) | 0);
        a.dirty = true;
        return;
      }
      case 'wash': return onWash(p, a);
      case 'pm': return onPm(p, m);
      case 'chat': return onChat(p, m);
    }
  });
  ws.on('close', () => {
    store(p);
    players.delete(p.id);
    if (p.name) { broadcast({ t: 'leave', id: p.id }); broadcast({ t: 'online', n: online() }); }
    p.key = null;
  });
});

function onAuth(p, m, ip) {
  if (p.key) return;
  if (m.t !== 'auth' && tooMany(ip)) return send(p, { t: 'autherr', reason: 'Слишком много попыток, подождите минуту' });
  const r = m.t === 'auth' ? acc.byToken(m.token) : m.t === 'login' ? acc.login(m.name, m.pass) : acc.register(m.name, m.pass, m.cls);
  if (r.err) return send(p, { t: 'autherr', reason: r.err, kind: m.t });
  // тот же аккаунт с другого устройства — старое соединение закрываем
  for (const q of players.values()) if (q !== p && q.key === r.key) { store(q); send(q, { t: 'kicked' }); q.key = null; q.ws.close(); }
  p.key = r.key; p.name = r.name;
  const P = PL.loadChar(r.name, r.save);
  p.a = PL.newActor(p.id, r.name, P);
  p.a.karma = Math.max(0, r.save?.karma | 0); p.a.pk = r.save?.pk | 0;
  p.a.look = lookOf(P);
  send(p, { t: 'authok', id: p.id, name: r.name, token: r.token, p: PL.profileOf(p.a), online: online() });
  sendMe(p.a);
  broadcast({ t: 'online', n: online() });
}

// переходы в катакомбы и обратно
function checkDoors(p, a) {
  if (a.x < DUNGEON.x0 - 100 && flatDist(a, cryptDoor) < 2.2) {
    PL.place(a, dungeonExit.x + 6, dungeonExit.z + 6); a.warpUntil = Date.now() + 2000;
    PL.say(a, 'Вы спустились в катакомбы. Здесь нежить нападает первой.', 'bad');
  } else if (a.x > DUNGEON.x0 - 100 && flatDist(a, dungeonExit) < 2) {
    PL.place(a, cryptDoor.x, cryptDoor.z + 5); a.warpUntil = Date.now() + 2000;
    PL.say(a, 'Вы выбрались на поверхность.');
  }
}

// ===== бой =====
const mobOf = (ref) => (ref?.m != null ? world.byId.get(ref.m) : null);
const actorOf = (ref) => (ref?.p != null ? players.get(ref.p)?.a : null);
const targetPos = (ref) => mobOf(ref) || actorOf(ref);
const targetRadius = (ref) => (ref?.m != null ? world.radiusOf(mobOf(ref)) : 0.6);
const alive = (t) => t && !t.dead;

// урон мобу от игрока; событие видят все вокруг
function damageMob(a, mb, dmg, crit, now) {
  a.combatUntil=now+6000;a.sitting=false;
  dmg = heroDamage(dmg, a.P.lvl, mb.def.lvl);
  const died = world.hit(mb, dmg, a);
  pushNear(a, { k: 'hit', m: mb.id, dmg, crit });
  if (!died) return;
  const topId = world.kill(mb, now);
  const winner = players.get(topId)?.a || a;
  const rw = world.rewardFor(mb, winner.P.lvl);
  for(const share of groups.reward(winner,mb)){ PL.gainXp(share.a,share.xp);share.a.P.sp=(share.a.P.sp||0)+share.sp;share.a.dirty=true; }
  winner.P.coins += rw.coins;
  winner.P.kills++;
  groundLoot.spawn(winner,mb,rw.drops,now);
  winner.out.push({ k: 'kill', mob: mb.kind, name: mb.def.name, xp: rw.xp, coins: rw.coins, boss: !!mb.def.boss });
  winner.dirty = true;
  // убийство моба смывает карму PK
  if (winner.karma > 0) { winner.karma = Math.max(0, winner.karma - Math.max(1, Math.ceil(rw.xp / PVP.karmaPerXp))); sendMe(winner); }
  pushNear(a, { k: 'mdie', m: mb.id });
  for (const q of players.values()) if (q.a && q.a.target?.m === mb.id) { q.a.attacking = false; }
}

// урон игроку от моба
function damagePlayer(mb, a, now) {
  a.combatUntil=now+6000;a.sitting=false;
  if (a.dead) return;
  const s = PL.statsOf(a, now);
  if (Math.random() < evaChance(mb.def.lvl, s.eva)) return a.out.push({ k: 'hurt', dodge: true });
  const { d } = calcDmg(mb.def.patk * (mb.powerBuff?.until > now ? mb.powerBuff.mul : 1) * effectMul(mb.effects || [], 'patk', now), mb.def.ranged?.school === 'm' ? s.mdef : s.pdef, 1, 0.05);
  a.P.hp -= d;
  if(mb.def.stun && Math.random()<mb.def.stun.chance){a.stunUntil=now+mb.def.stun.sec*1000;a.cast=null;a.out.push({k:'stun',sec:mb.def.stun.sec});}
  a.out.push({ k: 'hurt', dmg: d, from: mb.id });
  if (a.P.hp <= 0) { PL.killPlayer(a, mb.def.name); onPlayerDied(a, null); }
}

// PvP: сервер сам считает урон по защите жертвы
function damageActor(a, v, atk, mul, school, critChance, now) {
  if (v.dead || a.dead) return;
  if (PL.inTown(a) || PL.inTown(v)) return PL.say(a, 'В городе сражаться нельзя', 'bad');
  const vs = PL.statsOf(v, now);
  const { d, crit } = calcDmg(atk, school === 'm' ? vs.mdef : vs.pdef, mul, critChance);
  v.P.hp -= d; v.dirty = true;
  v.hitBy.set(a.id, now);
  // напал на белого — флаг (у PK флаг не нужен, он и так красный)
  if (status(v) === 0 && a.karma <= 0) { const was = flagged(a); a.flagUntil = now + PVP.flagMs; if (!was) sendMe(a); }
  pushNear(a, { k: 'hit', p: v.id, dmg: d, crit });
  v.out.push({ k: 'hurt', dmg: d, fromP: a.id, name: a.name });
  if (v.P.hp <= 0) { PL.killPlayer(v, a.name, a.karma > 0); onPlayerDied(v, a); }
}

function onSkill(p, a, id, now) {
  const err = PL.skillError(a, id, now);
  if (err) return PL.say(a, err, 'bad');
  const sk = skillAt(id, skillLv(a.P, id)), s = PL.statsOf(a, now);
  if (needsEnemy(sk)) {
    const t = targetPos(a.target);
    if (!alive(t)) return PL.say(a, 'Нет цели', 'bad');
    if (flatDist(a, t) > sk.range + targetRadius(a.target) + LAG_M) return PL.say(a, 'Цель слишком далеко', 'bad');
  }
  if (sk.needBow && !PL.takeItem(a.P, arrowFor(a.P.equip.weapon))) return PL.say(a, 'Нет подходящих стрел', 'bad');
  a.P.mp -= sk.mp; a.cds[id] = now + sk.cd * 1000; a.dirty = true;
  a.out.push({ k: 'cd', id, cd: sk.cd });
  if (sk.cast) { a.cast = { id, t: sk.cast / s.cast, target: a.target }; a.out.push({ k: 'cast', id, t: sk.cast / s.cast }); return; }
  applySkill(a, id, a.target, now);
}

function applySkill(a, id, ref, now) {
  const sk = skillAt(id, skillLv(a.P, id)), s = PL.statsOf(a, now);
  if (a.dead || now < (a.stunUntil || 0) || PL.inTown(a) && !townOk(sk)) return;
  if (sk.kind === 'summon') { if (companions.summon(a, sk.pet, s, now)) pushNear(a, {k:'cast_fx',id}); return; }
  if (sk.kind === 'hot') { const ally=actorOf(ref),who=ally&&!ally.dead&&groups.members(a).includes(ally)&&flatDist(a,ally)<30?ally:a;who.effects = applyEffect(who.effects || [], makeHot(id, sk.hot, PL.statsOf(who,now).maxHp, now, a.id)); return; }
  if (sk.kind === 'debuff' || sk.kind === 'dot') {
    const t = targetPos(ref); if (!alive(t) || flatDist(a,t)>sk.range+targetRadius(ref)+LAG_M || PL.inTown(a)) return;
    if(ref.p != null) { PL.say(a,'Для этого эффекта выберите моба'); return; }
    t.effects = applyEffect(t.effects || [], sk.kind === 'dot' ? makeDot(id, sk.dot, s.matk, now, a.id) : makeDebuff(id, sk, now, a.id));
    world.hit(t,0,a);a.combatUntil=now+6000;
    pushNear(a,{k:'cast_fx',id,to:ref}); return;
  }
  if (sk.kind === 'dmg') {
    const t = targetPos(ref);
    if (!alive(t) || flatDist(a, t) > sk.range + targetRadius(ref) + LAG_M + 2) return;
    const atk = sk.school === 'm' ? s.matk : s.patk, crit = Math.random() < s.crit + 0.05 ? 1 : 0;
    pushNear(a, { k: 'cast_fx', id, to: ref });
    if (ref.m != null) {
      if(sk.dash) { const pos=dashPoint(a,t,2+world.radiusOf(t),sk.range); if(pos) { PL.place(a,pos.x,pos.z); a.warpUntil=now+500; } }
      const r = calcDmg(atk, t.def.pdef * (sk.school === 'm' ? 0.8 : 1), sk.mul * charge(a,sk.school,sk.mp), crit);
      damageMob(a,t,r.d,r.crit,now);
      if(sk.stun) t.stunUntil=now+sk.stun*1000;
      if(sk.slow) t.effects=applyEffect(t.effects||[],makeSlow(id,sk.slow,now,a.id));
      if(sk.drain) { const heal=Math.round(heroDamage(r.d,a.P.lvl,t.def.lvl)*sk.drain); a.P.hp=Math.min(s.maxHp,a.P.hp+heal);a.dirty=true;a.out.push({k:'heal',kind:'hp',amount:heal,skill:id}); }
    }
    else damageActor(a, t, atk, sk.mul, sk.school, crit, now);
    a.attacking = true;
  } else if (sk.kind === 'heal') {
    const ally=actorOf(ref), recipient=ally&&!ally.dead&&groups.members(a).includes(ally)&&flatDist(a,ally)<30?ally:a;
    const amt = Math.round(PL.statsOf(recipient,now).maxHp * sk.amount);
    recipient.P.hp = Math.min(PL.statsOf(recipient,now).maxHp, recipient.P.hp + amt); recipient.dirty = true;
    recipient.out.push({ k: 'heal', kind: 'hp', amount: amt, skill: id });
  } else if (sk.kind === 'buff') {
    pushNear(a,{k:'remote_skill',id});
    for(const who of (sk.target==='party'?groups.members(a).filter(b=>!b.dead&&flatDist(a,b)<30):[a])){for (const [stat,mul] of Object.entries({[sk.stat]:sk.mul,...sk.also})) who.buffs.push({ stat, mul, until: now + sk.dur * 1000, name: sk.name });who.out.push({ k: 'buff', id, dur: sk.dur });who.dirty=true;}
  } else if (sk.kind === 'aoe') {
    const atk = sk.school === 'm' ? s.matk : s.patk;
    let n = 0;
    pushNear(a, { k: 'cast_fx', id });
    const center = sk.around === 'target' ? targetPos(ref) : a;
    if(!center || sk.around === 'target' && flatDist(a,center)>sk.range+targetRadius(ref)+LAG_M) return;
    const candidates = world.list.filter(m=>!m.dead);
    const selected = sk.cone ? new Set(coneTargets(a,a.r,candidates.map(m=>({x:m.x,z:m.z,r:world.radiusOf(m)})),{radius:sk.radius,cone:sk.cone,maxTargets:sk.maxTargets}).map(i=>candidates[i])) : null;
    const shot = charge(a,sk.school,sk.mp);
    for (const mb of world.list) {
      if (mb.dead || flatDist(mb, center) > sk.radius + world.radiusOf(mb) || selected && !selected.has(mb)) continue;
      const r = calcDmg(atk, mb.def.pdef * (sk.school === 'm' ? 0.8 : 1), sk.mul * shot, s.crit);
      damageMob(a, mb, r.d, r.crit, now); n++;
    }
    // по площади задеваем только флагнутых и PK (или того, кого бьём)
    for (const v of actors()) {
      if (v === a || v.dead || flatDist(v, a) > sk.radius + 0.6) continue;
      if (status(v) === 0 && a.target?.p !== v.id) continue;
      damageActor(a, v, atk, sk.mul, sk.school, Math.random() < s.crit ? 1 : 0, now); n++;
    }
    if (!n) PL.say(a, `${sk.name}: никого рядом`);
  }
}

// автоатака: сервер сам отбивает удары, пока цель в радиусе
function autoAttack(a, dt, now) {
  a.atkTimer -= dt;
  if (!a.attacking || a.dead || a.cast || now<(a.stunUntil||0)) return;
  const t = targetPos(a.target);
  if (!alive(t)) { a.attacking = false; return; }
  const s = PL.statsOf(a, now);
  if (flatDist(a, t) > s.range + targetRadius(a.target) + LAG_M) return; // клиент ещё идёт к цели
  if (PL.inTown(a)) { a.attacking = false; return PL.say(a, 'В городе сражаться нельзя', 'bad'); }
  if (a.atkTimer > 0) return;
  const arrow = arrowFor(a.P.equip.weapon);
  if (arrow && !PL.takeItem(a.P, arrow)) { a.attacking=false;return PL.say(a,'Нет подходящих стрел','bad'); }
  const shot=charge(a,'p');
  a.atkTimer = 1 / s.aspd;
  const mage = a.P.cls === 'mage';
  if (a.target.p != null) {
    const crit = Math.random() < s.crit ? 1 : 0;
    damageActor(a, t, mage ? s.matk * 0.6 : s.patk, 1, mage ? 'm' : 'p', crit, now);
    return;
  }
  if (mage) { const r = calcDmg(s.matk * 0.6, t.def.pdef, shot, s.crit); return damageMob(a, t, r.d, r.crit, now); }
  if (Math.random() < missChance(t.def.lvl, s.acc)) return pushNear(a, { k: 'miss', m: t.id });
  const r = calcDmg(s.patk, t.def.pdef, shot, s.crit);
  damageMob(a, t, r.d, r.crit, now);
}

// стражи у ворот бьют PK: позиции постов известны из расстановки мира
const GUARDS = () => world.npcs.filter((n) => n.role === 'guard');
const guards = GUARDS();
function guardsTick(now) {
  for (const a of actors()) {
    if (a.karma <= 0 || a.dead) continue;
    for (const g of guards) {
      if (flatDist(a, g) > PVP.guardRange) continue;
      if (now - (a.guardT || 0) < 1300) break;
      a.guardT = now;
      const s = PL.statsOf(a, now), d = Math.round(s.maxHp * PVP.guardHit);
      a.P.hp -= d; a.dirty = true;
      a.out.push({ k: 'hurt', dmg: d, guard: true });
      if (a.P.hp <= 0) { PL.killPlayer(a, 'Страж'); pkDrop(a, null); }
      break;
    }
  }
}

// ===== PvP: флаг, PK, карма =====
const flagged = (a) => a.flagUntil > Date.now();
const status = (a) => (a.karma > 0 ? 2 : flagged(a) ? 1 : 0); // 0 — белый, 1 — фиолетовый, 2 — красный
const sendMe = (a) => { const p = players.get(a.id); if (p) send(p, { t: 'me', karma: a.karma, pk: a.pk, pvp: a.P.pvp, flag: Math.max(0, a.flagUntil - Date.now()) }); };
function onPlayerDied(v, killer) {
  const now = Date.now();
  if (!killer || !(now - (v.hitBy.get(killer.id) || 0) < 10_000)) { v.hitBy.clear(); return; }
  v.hitBy.clear();
  const victimWasRed = v.karma > 0, victimFlag = flagged(v);
  if (victimWasRed || victimFlag) {
    killer.P.pvp++; killer.dirty = true;
    if (victimWasRed) broadcast({ t: 'announce', text: `${killer.name} победил PK ${v.name}` });
  } else {
    killer.pk++; killer.karma += karmaForPk(killer.pk); killer.flagUntil = 0;
    broadcast({ t: 'announce', text: `${killer.name} убил ${v.name} и стал PK! Зона: ${zoneAt(killer.x, killer.z).name}`, pk: killer.id });
  }
  sendMe(killer);
  // с умершего PK падает вещь — достаётся убийце
  if (victimWasRed) pkDrop(v, killer);
}
// PK умер: с шансом теряет вещь; убийце-игроку она достаётся
function pkDrop(v, killer) {
  if (Math.random() > PVP.dropChance) return;
  const P = v.P;
  const bag = P.inv.map((e, i) => ({ i, e })).filter(({ e }) => !ITEMS[e.id].loot || Math.random() < 0.3);
  const worn = Object.entries(P.equip).filter(([, id]) => id && ITEMS[id].grade !== 'none');
  let item = null;
  if (worn.length && Math.random() < 0.35) {
    const [sl, id] = worn[Math.floor(Math.random() * worn.length)];
    item = { id, n: 1, e: P.enc[sl] || 0 }; P.equip[sl] = null; delete P.enc[sl];
  } else if (bag.length) {
    const { i, e } = bag[Math.floor(Math.random() * bag.length)];
    item = { ...e }; P.inv.splice(i, 1);
  }
  if (!item) return;
  v.dirty = true;
  PL.say(v, `Вы потеряли: ${ITEMS[item.id].name}${item.n > 1 ? ` ×${item.n}` : ''}`, 'bad');
  if (!killer) return;
  PL.addItem(killer.P, item.id, item.n, item.e);
  killer.dirty = true;
  PL.say(killer, `Вы подобрали с ${v.name}: ${ITEMS[item.id].name}`, 'rare');
  broadcast({ t: 'announce', text: `С PK ${v.name} упала вещь — её подобрал ${killer.name}` });
}
function onWash(p, a) {
  if (a.karma <= 0) return;
  const cost = karmaWashCost(a.karma);
  if (!world.npcs.some((n) => n.role === 'priest' && flatDist(a, n) < 8)) return PL.say(a, 'Жрец далеко', 'bad');
  if (a.P.coins < cost) return send(p, { t: 'washerr', cost });
  a.P.coins -= cost; a.karma = 0; a.dirty = true;
  sendMe(a); send(p, { t: 'washok', cost });
}

// ===== чат =====
function onPm(p, m) {
  const text = cleanText(m.text);
  if (!text || Date.now() - (p.lastPm || 0) < 400) return;
  p.lastPm = Date.now();
  const key = String(m.to || '').trim().toLowerCase();
  let q = null;
  for (const x of players.values()) if (x.key === key) q = x;
  if (!q) return send(p, { t: 'pmerr', to: String(m.to || '').slice(0, 16), reason: 'не в сети' });
  const msg = JSON.stringify({ t: 'pm', from: p.name, to: q.name, text });
  send(q, msg);
  if (q !== p) send(p, msg);
}
function onChat(p, m) {
  const ch = CHAT[m.ch] ? m.ch : 'all';
  const text = cleanText(m.text);
  if (!text) return;
  const wait = (p.lastChat[ch] || 0) + CHAT[ch].cd - Date.now();
  if (wait > 0) return send(p, { t: 'chatwait', ch, wait });
  p.lastChat[ch] = Date.now();
  const s = JSON.stringify({ t: 'chat', ch, from: p.name, id: p.id, text });
  for (const q of players.values()) {
    if (!q.key) continue;
    if (ch === 'near' && q !== p && (!q.a || !p.a || d2(p, q) > NEAR)) continue;
    send(q, s);
  }
}

// событие видят все рядом: у себя — всегда, у соседей — если близко
function pushNear(a, e) {
  a.out.push(e);
  for (const p of players.values()) if (p.a && p.a !== a && flatDist(p.a, a) < VIEW) p.a.out.push({ ...e, by: a.id });
}

// ===== главный цикл =====
let last = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min(0.5, (now - last) / 1000); last = now;
  const list = actors();
  // мобы
  const view = list.map((a) => ({ id: a.id, x: a.x, z: a.z, dead: a.dead, inTown: PL.inTown(a) }));
  for(const p of companions.list.values()) view.push({...p,dead:p.hp<=0,inTown:false});
  world.tick(dt, view, now, (mb, pv) => { if(pv.pet) {const pet=companions.list.get(pv.id);if(pet) pet.hp-=calcDmg(mb.def.patk,pet.s.pdef).d;return;} const a = players.get(pv.id)?.a; if (a) damagePlayer(mb, a, now); }, (m,fx)=>{for(const peer of players.values())if(peer.a&&flatDist(peer.a,m)<VIEW)peer.a.out.push({k:'mob_fx',...fx});});
  for(const mb of world.list) if(!mb.dead) for(const eff of [...(mb.effects||[])]) {
    const tick=tickEffects([eff],now); const owner=players.get(eff.from)?.a;
    if(tick.dmg && owner && !owner.dead) damageMob(owner,mb,calcDmg(tick.dmg,mb.def.pdef).d,false,now);
    mb.effects=mb.effects.flatMap(e=>e===eff?tick.list:[e]);
  }
  companions.tick(dt,now,list,world,damageMob);
  groundLoot.tick(list,now);
  groups.cleanup();
  guardsTick(now);
  // игроки
  for (const a of list) {
    PL.regen(a, dt);
    if(!a.dead) { const tick=tickEffects(a.effects||[],now);a.effects=tick.list;if(tick.heal) { a.P.hp=Math.min(PL.statsOf(a,now).maxHp,a.P.hp+tick.heal);a.dirty=true; } }
    if (a.flagUntil && a.flagUntil <= now) { a.flagUntil = 0; sendMe(a); }
    if (a.cast) {
      a.cast.t -= dt;
      if (a.cast.t <= 0) {
        const c = a.cast; a.cast = null;
        if (c.id === 'escape') { const t = TOWNS.find((x) => x.id === a.P.home) || TOWNS[0]; PL.place(a, t.x, t.z - 12); a.warpUntil = now + 2000; }
        else applySkill(a, c.id, c.target, now);
      }
    }
    autoAttack(a, dt, now);
  }
  // рассылка
  for (const p of players.values()) {
    const a = p.a; if (!p.key || !a) continue;
    const o = [];
    for (const q of list) {
      if (q === a || flatDist(a, q) > VIEW) continue;
      if (!p.known.has(q.id)) { p.known.add(q.id); send(p, { t: 'look', id: q.id, name: q.name, look: q.look }); }
      o.push([q.id, +q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2), +q.r.toFixed(2), (q.anim & ~8) | (q.dead ? 8 : 0), Math.round((q.P.hp / PL.statsOf(q, now).maxHp) * 100), status(q)]);
    }
    for (const id of p.known) if (!players.has(id)) p.known.delete(id);
    const mobs = world.snapshotFor(a, VIEW, now);
    // впервые увиденный моб: клиенту нужен его вид, чтобы построить модель
    const fresh = [];
    for (const row of mobs) if (!p.knownMobs.has(row[0])) { p.knownMobs.add(row[0]); fresh.push([row[0], world.byId.get(row[0]).kind, world.byId.get(row[0]).spawn]); }
    if (fresh.length) send(p, { t: 'mobs', n: fresh });
    send(p,{t:'pets',list:companions.snapshot(a)});
    send(p,{t:'ground',items:groundLoot.snapshot(a,now)});
    send(p, { t: 'snap', ts: now, o, m: mobs, me: { hp: Math.round(a.P.hp), mp: Math.round(a.P.mp), x: +a.x.toFixed(2), z: +a.z.toFixed(2), dead: a.dead } });
    if (a.out.length) { send(p, { t: 'ev', e: a.out }); a.out = []; }
    if (a.dirty) {
      a.dirty = false;
      const look = lookOf(a.P);
      if (JSON.stringify(look) !== JSON.stringify(a.look)) {
        a.look = look;
        const s = JSON.stringify({ t: 'look', id: a.id, name: a.name, look });
        for (const q of players.values()) if (q.known.has(a.id)) send(q, s);
      }
      send(p, { t: 'you', p: PL.profileOf(a) });
    }
  }
}, TICK);

// объявления: где сейчас PK
setInterval(() => {
  for (const a of actors()) if (a.karma > 0) broadcast({ t: 'announce', text: `PK ${a.name} (карма ${a.karma}) замечен: ${zoneAt(a.x, a.z).name}`, pk: a.id });
}, PVP.announceMs);
// периодическое сохранение
setInterval(() => { for (const p of players.values()) store(p); }, 30_000);
// пинг, чтобы nginx не рвал простаивающие соединения
setInterval(() => { for (const p of players.values()) if (p.ws.readyState === 1) p.ws.ping(); }, 25000);
console.log(`realms-ws :${PORT}, аккаунтов: ${acc.count()}, мобов: ${world.list.length}`);

function charge(a, school, mp=0) {
  if(!a.P.shots?.[school]) return 1;
  const id=shotFor(a.P.equip.weapon,school), n=shotCost(school,mp);
  if(!id || !PL.takeItem(a.P,id,n)) return 1;
  a.dirty=true;return SHOT_MUL[school];
}
