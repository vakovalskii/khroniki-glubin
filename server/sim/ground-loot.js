import { ITEMS } from '../../src/data.js';
import { GROUND_TTL, scatter } from '../../src/loot.js';
import { flatDist } from '../../src/sim.js';
import { addItem } from './player.js';
export function createGroundLoot() {
  const list = new Map(); let seq=0;
  const allowed=(d,a)=>d.owner===a.id || d.party && d.party===a.party;
  return {
    list,
    spawn(owner, mob, ids, now) {
      const grouped=new Map(); for(const id of ids) grouped.set(id,(grouped.get(id)||0)+1);
      let i=0; for(const [id,n] of grouped) { const off=scatter(i++,grouped.size); const d={uid:++seq,id,n,owner:owner.id,party:owner.party||null,x:mob.x+off.dx,z:mob.z+off.dz,until:now+GROUND_TTL*1000};list.set(d.uid,d); }
    },
    pick(a,uid,now) {
      const d=list.get(uid);if(!d||a.dead||now>=d.until||!allowed(d,a)||flatDist(a,d)>3)return false;
      list.delete(uid);addItem(a.P,d.id,d.n);a.dirty=true;a.out.push({k:'loot',id:d.id,n:d.n});return true;
    },
    tick(actors,now) {for(const [uid,d] of list){if(now>=d.until){list.delete(uid);continue;}for(const a of actors)if(ITEMS[d.id]?.mat&&flatDist(a,d)<3&&this.pick(a,uid,now))break;}},
    snapshot(a,now) {return [...list.values()].filter(d=>allowed(d,a)&&flatDist(a,d)<150).map(d=>({...d,left:Math.max(0,(d.until-now)/1000)}));}
  };
}
