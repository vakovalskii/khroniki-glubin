import { mobAbilities } from './mob-abilities.js';
import { createNav } from '../../src/nav.js';
import { obstacles } from '../../src/world-core.js';
// Мобы на сервере: спавн из мира, ИИ, урон, смерть, добыча, респавн.
// Клиент получает их готовыми в снапшоте и только рисует.
import { MOBS } from '../../src/data.js';
import { buildProps } from '../../src/world-core.js';
import { newMob, mobStep, mobRadius, xpForKill, rollCoins, rollDrops, flatDist } from '../../src/sim.js';

export function createMobs() {
  const { spawns, npcs } = buildProps();
  const list = spawns.map((sp, i) => newMob(i + 1, sp));
  const byId = new Map(list.map((m) => [m.id, m]));
  const nav=createNav(obstacles); let seq=list.length;
  const abilities=mobAbilities(list,(kind,x,z,parent)=>{const m=newMob(++seq,{mob:kind,x,z});m.summoner=parent.id;m.def={...m.def,noLoot:true,xp:0,coins:[0,0]};m.respawnAt=Infinity;m.target=parent.target;m.state='chase';list.push(m);byId.set(m.id,m);});

  // один шаг мира: ИИ всех мобов. onHit — «моб бьёт игрока», решает вызывающий.
  const tick = (dt, players, now, onHit, fx=()=>{}) => {
    const ctx = { players, now, onHit, nav };
    for (const m of [...list]) { mobStep(m, ctx, dt); abilities.tick(m,dt,now,players,onHit,fx); }
    abilities.tickZones(now,players,onHit);
    for(let i=list.length-1;i>=0;i--){const m=list[i];if(m.summoner&&(m.dead||byId.get(m.summoner)?.state!=='chase')){list.splice(i,1);byId.delete(m.id);}}
  };

  // урон мобу. by — актёр игрока; возвращает true, если моб умер.
  const hit = (m, dmg, by) => {
    if (m.dead) return false;
    m.hp -= dmg;abilities.hit(m,by.id,dmg);
    if(m.def.social)for(const o of list)if(o!==m&&!o.dead&&o.def.social&&o.def.fam===m.def.fam&&flatDist(o,m)<12&&o.state!=='return'){o.state='chase';o.target=by.id;}
    m.hitBy.set(by.id, (m.hitBy.get(by.id) || 0) + dmg);
    if (m.state !== 'chase') { m.state = 'chase'; m.target = by.id; }
    return m.hp <= 0;
  };

  // смерть моба: опыт и добыча — тому, кто нанёс больше урона
  const kill = (m, now) => {
    m.dead = true; m.hp = 0; m.state = 'dead'; m.target = null;
    m.respawnAt = m.summoner ? Infinity : now + (m.def.respawn || 25) * 1000; m.diedAt = now;
    let top = null, best = 0;
    for (const [id, d] of m.hitBy) if (d > best) { best = d; top = id; }
    m.hitBy.clear();
    return top;
  };

  const rewardFor = (m, lvl) => ({
    xp: xpForKill(m.def, lvl),
    coins: rollCoins(m.def),
    drops: rollDrops(m.def),
  });

  // кого видно игроку: живые и недавно умершие (чтобы клиент доиграл падение)
  const snapshotFor = (a, view, now) => {
    const o = [];
    for (const m of list) {
      if (flatDist(m, a) > view) continue;
      if (m.dead && now > m.diedAt + 4000) continue;
      o.push([m.id, +m.x.toFixed(2), +m.y.toFixed(2), +m.z.toFixed(2), +m.r.toFixed(2),
        (m.moving ? 1 : 0) | (m.attackT > 0 ? 2 : 0) | (m.dead ? 8 : 0),
        Math.max(0, Math.round((m.hp / m.def.hp) * 100))]);
    }
    return o;
  };

  return { list, byId, npcs, tick, hit, kill, rewardFor, snapshotFor, radiusOf: (m) => mobRadius(m.def), defs: MOBS };
}
