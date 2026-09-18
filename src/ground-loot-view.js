import * as THREE from 'three';
import { itemModel } from './drop-models.js';
import { rarityOf, RARITY } from './loot.js';
export function createGroundLootView(scene, heightAt) {
  const list=new Map(), rayTargets=[];
  const ringGeo=new THREE.RingGeometry(.3,.55,20).rotateX(-Math.PI/2);
  function receive(items) {
    const live=new Set(items.map(d=>d.uid));
    for(const [uid,d] of list)if(!live.has(uid)){scene.remove(d.obj);d.ring.material.dispose();list.delete(uid);}
    for(const data of items){let d=list.get(data.uid);if(!d){const obj=itemModel(data.id);const ring=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:RARITY[rarityOf(data.id)].color,transparent:true,opacity:.7,side:THREE.DoubleSide}));obj.add(ring);ring.position.y=.08;d={obj,ring};obj.traverse(o=>o.userData.groundLoot=data.uid);scene.add(obj);list.set(data.uid,d);}Object.assign(d,data);d.obj.position.set(d.x,heightAt(d.x,d.z)+.2,d.z);}
    rayTargets.splice(0,rayTargets.length,...[...list.values()].map(d=>d.obj));
  }
  function update(t) {for(const d of list.values()){d.obj.rotation.y=t*.45;d.obj.visible=d.left>5||Math.floor(t*6)%2===0;}}
  return {list,rayTargets,receive,update};
}
