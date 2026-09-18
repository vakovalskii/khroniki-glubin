// Добыча на земле: предметы со столбиком света по редкости, лежат 30 с, мигают перед исчезновением.
// Подбор — кликом (герой подходит) или автоподбором (настройка: монеты/ресурсы/вещи).
// В группе дроп общий: сервер хранит выпавшее и отдаёт тому, кто подобрал первым (ploot/ppick → pdrop/pgot/pgone).
import * as THREE from 'three';
import { ITEMS } from './data.js';
import { rollLoot, rarityOf, RARITY, COINS, GROUND_TTL, BLINK_AT, PICK_R, AUTO_R, AUTO_DEFAULT, wantsAuto, dropKind, scatter } from './loot.js';

const resourceSprites = new Map();
const iconLoader = typeof document !== 'undefined' ? new THREE.TextureLoader() : null;
const SET_KEY = 'l2w-loot';
const G = {
  coin: new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12),
  bag: new THREE.SphereGeometry(0.28, 10, 8),
  chunk: new THREE.IcosahedronGeometry(0.26, 0),
  blade: new THREE.BoxGeometry(0.1, 0.05, 1.1),
  chest: new THREE.BoxGeometry(0.55, 0.4, 0.4),
  ring: new THREE.TorusGeometry(0.2, 0.06, 6, 14),
  flask: new THREE.SphereGeometry(0.2, 10, 8),
  scroll: new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8).rotateZ(Math.PI / 2),
  beam: new THREE.CylinderGeometry(0.16, 0.34, 1, 10, 1, true).translate(0, 0.5, 0),
  disc: new THREE.RingGeometry(0.35, 0.6, 20).rotateX(-Math.PI / 2),
};
const mats = new Map();
const lam = (c) => { const k = `l${c}`; if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.25 })); return mats.get(k); };
const beamMat = {}, discMat = {};
for (const [k, r] of Object.entries(RARITY)) {
  beamMat[k] = new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  discMat[k] = new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
}

// модель предмета по виду
export function itemModel(id) {
  const g = new THREE.Group(), it = ITEMS[id];
  const add = (geo, c, x = 0, y = 0, z = 0, rx = 0, ry = 0) => { const m = new THREE.Mesh(geo, lam(c)); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.castShadow = true; g.add(m); return m; };
  if (id === COINS) { for (let k = 0; k < 4; k++) add(G.coin, 0xffc840, (k % 2) * 0.12 - 0.05, k * 0.065, (k % 3) * 0.05); }
  else if (it.mat && iconLoader) {
    if (!resourceSprites.has(id)) {
      const map = iconLoader.load(`${import.meta.env.BASE_URL}assets/icons/resources/${id}.png`);
      map.colorSpace = THREE.SRGBColorSpace;
      resourceSprites.set(id, new THREE.SpriteMaterial({ map, transparent: true, alphaTest: .05, depthWrite: false }));
    }
    const sprite = new THREE.Sprite(resourceSprites.get(id)); sprite.scale.set(1,1,1); sprite.position.y=.45; g.add(sprite);
  }
  else if (it.slot === 'weapon') { add(G.blade, it.color, 0, 0.05, 0.1); add(G.chest, 0x4a3020, 0, 0.05, -0.5).scale.set(0.5, 0.2, 0.25); }
  else if (['ring', 'ear', 'neck'].includes(it.slot)) add(G.ring, it.color, 0, 0.2, 0, Math.PI / 2 - 0.4);
  else if (it.slot) add(G.chest, it.color);
  else if (it.use === 'hp' || it.use === 'mp') { add(G.flask, it.color, 0, 0.1); add(G.coin, 0x8a6a4a, 0, 0.3).scale.set(0.4, 2, 0.4); }
  else if (it.use) add(G.scroll, it.color, 0, 0.1);
  else if (it.junk) add(G.blade, it.color, 0, 0.05, 0, 0, 0.7);
  else if (it.mat && ['bone', 'fang', 'crystal', 'chitin', 'golem_heart', 'soul_shard', 'orc_totem', 'lich_dust', 'ectoplasm'].includes(id)) add(G.chunk, it.color, 0, 0.12);
  else add(G.bag, it.color, 0, 0.18).scale.set(1.1, 0.8, 1);
  return g;
}

// ctx: scene, heightAt, hero(), P(), dead(), give(id, n) → текст, log, banner, emit, netSend, partyId(), netId(), save()
