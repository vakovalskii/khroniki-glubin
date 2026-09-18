// Модели луков и древкового оружия поверх оружия гуманоида (userData.weaponGroup из src/models.js).
// Оружие в группе смотрит вдоль +z (вперёд от кисти), рука опущена вдоль −y.
import * as THREE from 'three';

const G = {
  bow: new THREE.TorusGeometry(0.75, 0.035, 5, 18, Math.PI * 0.9).rotateZ(Math.PI * 0.55).rotateY(-Math.PI / 2),
  string: new THREE.CylinderGeometry(0.008, 0.008, 1.45, 3),
  shaft: new THREE.CylinderGeometry(0.035, 0.035, 3.2, 6).rotateX(Math.PI / 2),
  tip: new THREE.ConeGeometry(0.08, 0.45, 6).rotateX(Math.PI / 2),
  axe: new THREE.BoxGeometry(0.04, 0.42, 0.34),
};
const mats = new Map();
const mat = (c, emissive = 0.12) => {
  const k = `${c}:${emissive}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: emissive }));
  return mats.get(k);
};
const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; return o; };

// L — внешний вид из lookOf(): w (цвет), bow, polearm
export function dressWeapon(obj, L) {
  const g = obj.userData.weaponGroup;
  if (!g || !L || L.w == null || !(L.bow || L.polearm)) return;
  g.clear();
  if (L.bow) {
    // лук держим вертикально, дуга выгнута вперёд, тетива — у кисти
    const bow = mesh(G.bow, mat(L.w), 0, 0.02, 0.1);
    const str = mesh(G.string, mat(0xe8e0c8, 0.3), 0, 0.02, 0.05);
    g.add(bow, str);
  } else {
    // древко вперёд, наконечник; у алебарды (светлое C-оружие) — ещё и лезвие
    g.add(mesh(G.shaft, mat(0x5a3a1a, 0.05), 0, 0, 0.7));
    g.add(mesh(G.tip, mat(L.w, 0.2), 0, 0, 2.5));
    if (L.w === 0x80e0ff) g.add(mesh(G.axe, mat(L.w, 0.2), 0, 0.2, 2.1));
  }
}
