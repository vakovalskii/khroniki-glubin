import { partyShare, killReward, PARTY_MAX, PARTY_RANGE } from '../../src/growth.js';
import { flatDist } from '../../src/sim.js';
export function createGroups(players, send) {
  let seq=0;const groups=new Map(),invites=new Map();
  const actors=()=>[...players.values()].map(p=>p.a).filter(Boolean);
  const notify=(id,m)=>{const p=players.get(id);if(p)send(p,m);};
  function members(a) {const group=groups.get(a.party);return group?[...group.members].map(id=>players.get(id)?.a).filter(Boolean):[a];}
  function sync(g){for(const id of g.members)notify(id,{t:'party',id:g.id,leader:g.leader,members:[...g.members].map(id=>players.get(id)?.a).filter(Boolean).map(a=>({id:a.id,name:a.name,lvl:a.P.lvl}))});}
  function leave(a){const g=groups.get(a.party);a.party=null;notify(a.id,{t:'party',id:null,members:[]});if(!g)return;g.members.delete(a.id);if(!g.members.size){groups.delete(g.id);return;}if(g.leader===a.id)g.leader=g.members.values().next().value;sync(g);}
  function handle(a,m,now){
    if(m.t==='pinvite'){
      const b=actors().find(b=>b.name===String(m.name));let g=groups.get(a.party);
      if(!b||b===a||b.party||g&&g.leader!==a.id||g?.members.size>=PARTY_MAX)return true;
      if(invites.get(b.id)?.until>now)return true;
      invites.set(b.id,{from:a.id,until:now+30000});notify(b.id,{t:'pinvited',from:a.id,name:a.name});return true;
    }
    if(m.t==='paccept'){
      const invite=invites.get(a.id);invites.delete(a.id);if(!invite||invite.until<now||a.party)return true;
      const leader=players.get(invite.from)?.a;if(!leader)return true;let g=groups.get(leader.party);
      if(g&&(g.leader!==leader.id||g.members.size>=PARTY_MAX))return true;
      if(!g){g={id:++seq,leader:leader.id,members:new Set([leader.id])};groups.set(g.id,g);leader.party=g.id;}
      g.members.add(a.id);a.party=g.id;sync(g);return true;
    }
    if(m.t==='pdecline'){invites.delete(a.id);return true;}
    if(m.t==='pleave'){leave(a);return true;}
    if(m.t==='pkick'||m.t==='plead'){const g=groups.get(a.party),b=players.get(m.id)?.a;if(g?.leader!==a.id||!b||b.party!==a.party)return true;if(m.t==='pkick')leave(b);else {g.leader=b.id;sync(g);}return true;}
    if(m.t==='pchat'){if(now<(a.partyChatAt||0))return true;a.partyChatAt=now+500;const text=String(m.text||'').replace(/[\u0000-\u001f]/g,' ').slice(0,160);if(text)for(const b of members(a))notify(b.id,{t:'partychat',name:a.name,text});return true;}
    return false;
  }
  function reward(winner,mob){const near=members(winner).filter(a=>!a.dead&&flatDist(a,mob)<=PARTY_RANGE);if(!near.length)near.push(winner);const rewards=partyShare(killReward(winner.P.lvl,mob.def),near.map(a=>a.P.lvl));return near.map((a,i)=>({a,...rewards[i]}));}
  function cleanup(){for(const g of groups.values()){const before=g.members.size;for(const id of g.members)if(!players.has(id))g.members.delete(id);if(!g.members.size){groups.delete(g.id);continue;}if(!g.members.has(g.leader)){g.leader=g.members.values().next().value;}if(g.members.size!==before)sync(g);}for(const [id,v]of invites)if(v.until<Date.now()||!players.has(id))invites.delete(id);}
  return{handle,members,reward,cleanup};
}
