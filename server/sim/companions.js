// Питомцы существуют на сервере. Клиенты получают только снимки и команды хозяина.
import { PETS, petStats, petLimit } from '../../src/pets.js';
import { heightAt, zoneAt } from '../../src/world-core.js';
import { flatDist, moveEntity, calcDmg } from '../../src/sim.js';
let nextId = -1;
export function createCompanions() {
  const list = new Map();
  function summon(owner, kind, stats, now) {
    if (!petLimit(owner.P.prof, kind)) return false;
    for (const [id, p] of list) if (p.owner === owner.id && PETS[p.kind].group === PETS[kind].group) list.delete(id);
    const s = petStats(kind, { lvl: owner.P.lvl, matk: stats.matk });
    const p = { id: nextId--, owner: owner.id, kind, s, hp: s.maxHp, x: owner.x + 2, z: owner.z, y: owner.y, r: 0, moving: false, attackT: 0, cd: 0, follow: false, pet: true, until: PETS[kind].dur ? now + PETS[kind].dur * 1000 : Infinity };
    list.set(p.id, p); return true;
  }
  function tick(dt, now, actors, world, damage) {
    for (const [id, p] of list) {
      const owner = actors.find(a => a.id === p.owner);
      if (!owner || owner.dead || p.hp <= 0 || now >= p.until) { list.delete(id); continue; }
      p.moving = false; p.attackT = Math.max(0, p.attackT-dt*3); p.cd -= dt;
      const enemy = !zoneAt(owner.x,owner.z).town && !p.follow && world.byId.get(owner.target?.m);
      let dest = owner;
      if (flatDist(p, owner) > 40) { p.x=owner.x+2; p.z=owner.z; }
      if (enemy && !enemy.dead && flatDist(enemy, owner) <= 25) {
        dest = enemy;
        if (flatDist(p, enemy) <= p.s.range + world.radiusOf(enemy)) {
          if (p.cd <= 0) { p.cd=1/p.s.aspd; p.attackT=1; damage(owner, enemy, calcDmg(p.s.patk, enemy.def.pdef).d, false, now); if(p.s.taunt && !enemy.dead) { enemy.target=p.id; enemy.state='chase'; } }
          dest = null;
        }
      } else if(flatDist(p, owner) < 3) dest = null;
      if(dest) { const dx=dest.x-p.x,dz=dest.z-p.z,d=Math.hypot(dx,dz)||1; moveEntity(p,dx/d,dz/d,Math.min(Math.max(0,d-2),p.s.speed*dt),0.5); p.r=Math.atan2(dx,dz); p.moving=true; }
      p.y=heightAt(p.x,p.z);
    }
  }
  return { list, summon, tick, command(owner, follow) { for(const p of list.values()) if(p.owner===owner) p.follow=follow; }, snapshot(a) { return [...list.values()].filter(p=>flatDist(p,a)<220).map(p=>({id:p.id,owner:p.owner,kind:p.kind,x:p.x,y:p.y,z:p.z,r:p.r,hp:Math.round(p.hp/p.s.maxHp*100),moving:p.moving,attackT:p.attackT})); } };
}
