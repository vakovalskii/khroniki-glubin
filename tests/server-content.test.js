import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProps, TOWNS } from '../src/world-core.js';
import { newChar, newActor, cmdMentor, skillError } from '../server/sim/player.js';
import { createCompanions } from '../server/sim/companions.js';
import { createGroups } from '../server/sim/groups.js';
import { createGroundLoot } from '../server/sim/ground-loot.js';
import { PROFESSIONS, ITEMS } from '../src/data.js';
import { skillLv, learnCost } from '../src/growth.js';
const npcs=buildProps().npcs,mentor=npcs.find(n=>n.role==='mentor');
function actor(id,cls='warrior'){const a=newActor(id,'Игрок'+id,newChar('Игрок'+id,cls));a.x=mentor.x;a.z=mentor.z;a.P.lvl=30;a.P.sp=100000;return a;}
test('профессии: сервер проверяет расстояние, SP, класс и однократность выбора',()=>{
 for(const [id,def]of Object.entries(PROFESSIONS)){
  const a=actor(1,def.base);a.x+=100;cmdMentor(a,npcs,'profession',id);assert.equal(a.P.prof,null);
  a.x=mentor.x;cmdMentor(a,npcs,'profession',id);assert.equal(a.P.prof,id);
  const skill=def.skills[0];a.P.sp=0;cmdMentor(a,npcs,'learn',skill);assert.equal(skillLv(a.P,skill),0);
  a.P.sp=learnCost(skill,1);cmdMentor(a,npcs,'learn',skill);assert.equal(skillLv(a.P,skill),1);assert.equal(a.P.sp,0);
  const other=Object.keys(PROFESSIONS).find(x=>x!==id);cmdMentor(a,npcs,'profession',other);assert.equal(a.P.prof,id);
 }
});
test('неизученное или требующее оружия умение нельзя применить серверной командой',()=>{
 const a=actor(1);a.x=0;a.z=0;a.P.prof='archer';
 assert.ok(skillError(a,'aimed_shot',100));a.P.skl.aimed_shot=1;assert.match(skillError(a,'aimed_shot',100),/лук/);
 a.P.equip.weapon='bow_short';a.P.mp=10000;assert.equal(skillError(a,'aimed_shot',100),null);
});
test('питомцы: сервер ограничивает профессию и число, смерть хозяина удаляет питомца',()=>{
 const c=createCompanions(),a=actor(1,'mage');
 assert.equal(c.summon(a,'wolf_pet',{matk:50},1000),false);
 a.P.prof='druid';assert.ok(c.summon(a,'wolf_pet',{matk:50},1000));assert.ok(c.summon(a,'treant_pet',{matk:50},1000));assert.equal(c.list.size,1);
 const b=actor(2);c.command(b.id,true);assert.equal([...c.list.values()][0].follow,false);
 a.dead=true;c.tick(.1,2000,[a],{byId:new Map()},()=>assert.fail());assert.equal(c.list.size,0);
});
test('добыча: только владелец или группа рядом, предмет выдаётся один раз',()=>{
 const ground=createGroundLoot(),a=actor(1),b=actor(2);const mob={x:a.x,z:a.z};
 ground.spawn(a,mob,['fang','fang','sword_long'],1000);const drop=[...ground.list.values()].find(d=>d.id==='fang');
 assert.equal(ground.pick(b,drop.uid,1100),false);a.x+=100;assert.equal(ground.pick(a,drop.uid,1100),false);a.x=mob.x;
 assert.ok(ground.pick(a,drop.uid,1100));assert.equal(a.P.inv.find(e=>e.id==='fang').n,2);assert.equal(ground.pick(a,drop.uid,1100),false);
 const other=[...ground.list.values()][0];assert.equal(ground.pick(a,other.uid,32000),false);
});
test('группы: чужой лидер не исключает, награды делятся только между живыми рядом',()=>{
 const a=actor(1),b=actor(2),outsider=actor(3);const players=new Map([a,b,outsider].map(a=>[a.id,{a}]));const messages=[];const g=createGroups(players,(p,m)=>messages.push(m));
 g.handle(a,{t:'pinvite',name:b.name},1000);g.handle(b,{t:'paccept'},1001);assert.ok(a.party&&a.party===b.party);
 g.handle(outsider,{t:'pkick',id:b.id},1100);assert.equal(g.members(a).length,2);
 const mob={x:a.x,z:a.z,def:{lvl:30,xp:100}};assert.equal(g.reward(a,mob).length,2);b.x+=100;assert.equal(g.reward(a,mob).length,1);
 players.delete(a.id);g.cleanup();assert.ok(messages.some(m=>m.t==='party'&&m.leader===b.id));
});
test('новый мир общий для сервера: четыре города и все спавны имеют известный вид',async()=>{
 const {createMobs}=await import('../server/sim/mobs.js');const world=createMobs();assert.equal(TOWNS.length,4);assert.ok(world.list.length>300);assert.ok(world.list.some(m=>m.def.champion));assert.ok(world.list.some(m=>m.def.elite));
 for(const m of world.list)assert.ok(m.def.hp>0);
});
