// Модели питомцев: на основе процедурных моделей мобов (src/models.js), свои цвета и метка союзника под ногами.
import * as THREE from 'three';
import { buildMob } from './models.js';
import { PETS } from './pets.js';

// вид модели и цвета: скелет — костяной гуманоид с призрачным клинком, волк — светлый зверь с голубыми глазами, древень — зелёный
const LOOK = {
  skeleton_pet: { shape: 'humanoid', color: 0xe0dcc8, weapon: 0x60ffb0, eyes: null },
  wolf_pet: { shape: 'beast', color: 0xd8d4c8, eyes: 0x60c8ff },
  treant_pet: { shape: 'tree', color: 0x5aa03a, eyes: 0x90ff70 },
};
const RING = new THREE.RingGeometry(0.75, 0.9, 24).rotateX(-Math.PI / 2);

export function buildPet(petId) {
  const d = PETS[petId], L = LOOK[petId] || { shape: d.shape, color: d.color };
  const g = buildMob({ shape: L.shape, color: L.color, size: d.size });
  if (L.weapon != null) g.userData.setWeapon?.(L.weapon, false, 5);
  if (L.eyes != null) {
    // глаза у моделей мобов — светящиеся полоски: перекрашиваем в цвет союзника
    g.traverse((o) => {
      const m = o.material;
      if (m?.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity >= 0.6) { o.material = m.clone(); o.material.color.setHex(L.eyes); o.material.emissive.setHex(L.eyes); }
    });
  }
  // зелёное кольцо под ногами — свой
  const ring = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color: 0x60ff90, transparent: true, opacity: 0.55, depthWrite: false }));
  ring.position.y = 0.08 / (g.scale.x || 1); ring.scale.setScalar(1 / (g.scale.x || 1) * d.size);
  ring.renderOrder = 2;
  g.add(ring);
  g.userData.petRing = ring;
  return g;
}
