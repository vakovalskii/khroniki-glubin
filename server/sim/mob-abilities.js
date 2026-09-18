import { createBoss, bossTick, addHate, topHate, resetBoss, bossAspd } from '../../src/boss.js';
import { initAbil, abilTick, abilUsed, abilRetry } from '../../src/combat.js';
import { flatDist } from '../../src/sim.js';
export function mobAbilities(list, spawn) {
  const zones=[];
  function init(m){m.abilities=initAbil(m.def);m.bossState=m.def.boss?createBoss(m.kind):null;}
  const eligible=(m,players)=>players.filter(p=>!p.dead&&!p.inTown&&flatDist(p,m)<50);
  function summon(m,kind,n,max=8){const alive=list.filter(o=>o.summoner===m.id&&!o.dead).length;for(let i=0;i<Math.min(n,max-alive);i++)spawn(kind,m.x+Math.cos(i*2.1)*4,m.z+Math.sin(i*2.1)*4,m);}
  function tick(m,dt,now,players,onHit,fx){
    if(!m.abilities)init(m);
    if(m.dead){if(m.bossState)resetBoss(m.bossState);return;}
    if(m.state!=='chase'){m.attackRate=1;if(m.bossState&&m.state==='idle')resetBoss(m.bossState);return;}
    const near=eligible(m,players);if(!near.length)return;
    const target=near.find(p=>p.id===m.target)||near[0];
    for(const a of abilTick(m.abilities,dt)){
      if(a.kind==='heal'){const targets=list.filter(o=>!o.dead&&o.hp<o.def.hp&&flatDist(o,m)<a.r&&(a.any||o.def.fam===m.def.fam)).sort((a,b)=>a.hp/a.def.hp-b.hp/b.def.hp);if(!targets.length){abilRetry(a);continue;}const t=targets[0];t.hp=Math.min(t.def.hp,t.hp+t.def.hp*a.amount);fx(m,{kind:'heal',x:t.x,z:t.z,color:a.color,r:2});}
      else if(a.kind==='buff'){for(const t of list)if(!t.dead&&flatDist(t,m)<a.r&&t.def.fam===m.def.fam)t.powerBuff={mul:a.mul,until:now+a.dur*1000};fx(m,{kind:'buff',x:m.x,z:m.z,r:a.r,color:a.color});}
      else if(a.kind==='raise'){summon(m,a.mob,a.n,a.max);fx(m,{kind:'summon',x:m.x,z:m.z,r:4,color:a.color});}
      else if(a.kind==='fire'){zones.push({m,x:target.x,z:target.z,r:a.r,at:now+a.delay*1000,until:now+(a.delay+a.dur)*1000,tick:a.tick*1000,mul:a.mul});fx(m,{kind:'danger',x:target.x,z:target.z,r:a.r,color:a.color});}
      abilUsed(a);
    }
    if(m.bossState){
      const hated=topHate(m.bossState);if(near.some(p=>p.id===hated))m.target=hated;
      for(const e of bossTick(m.bossState,m.hp/m.def.hp,dt)){
        if(e.type==='phase')m.attackRate=bossAspd(m.bossState);
        if(e.type==='phase')fx(m,{kind:'phase',text:e.name,x:m.x,z:m.z,r:5,color:0x9050ff});
        if(e.type==='summon')summon(m,e.mob,e.n);
        if(e.type==='volley')for(const p of near.slice(0,e.n))onHit({...m,def:{...m.def,patk:m.def.patk*e.mul}},p);
        if(e.type==='doom'||e.type==='prison'){zones.push({m,x:target.x,z:target.z,r:e.r,at:now+e.delay*1000,until:now+e.delay*1000+1,tick:1000,mul:e.mul||.25,stun:e.sec});fx(m,{kind:'danger',x:target.x,z:target.z,r:e.r,color:0x9050ff});}
      }
    }
  }
  function tickZones(now,players,onHit){for(let i=zones.length-1;i>=0;i--){const z=zones[i];if(z.m.dead){zones.splice(i,1);continue;}if(now>=z.at){for(const p of players)if(!p.dead&&!p.inTown&&flatDist(p,z)<z.r)onHit({...z.m,def:{...z.m.def,patk:z.m.def.patk*z.mul,stun:z.stun?{chance:1,sec:z.stun}:null}},p);z.at+=z.tick;}if(now>=z.until)zones.splice(i,1);}}
  return{tick,tickZones,hit(m,by,dmg){if(!m.abilities)init(m);if(m.bossState)addHate(m.bossState,by,dmg);}};
}
