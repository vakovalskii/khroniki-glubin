import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
export const CAMP_SHAPES = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  log: new THREE.CylinderGeometry(0.42, 0.46, 1, 7),
  tip: new THREE.ConeGeometry(0.42, 1, 7),
  cone: new THREE.ConeGeometry(0.5, 1, 9),
  cone4: new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4),
  ico: new THREE.IcosahedronGeometry(1, 0),
  lie: new THREE.CylinderGeometry(0.28, 0.3, 2.6, 7).rotateZ(Math.PI / 2), // бревно-скамья
  stake: new THREE.CylinderGeometry(0.1, 0.14, 3.2, 6).translate(0, 1.6, 0).rotateX(-0.75), // кол наружу
  stakeTip: new THREE.ConeGeometry(0.1, 0.5, 6).translate(0, 3.45, 0).rotateX(-0.75),
  pole: new THREE.CylinderGeometry(0.07, 0.07, 3.2, 5),
  bar: new THREE.CylinderGeometry(0.05, 0.05, 1.8, 5),
};
// пламя: слитые конусы с цветом вершин; шейдер колышет вершины по времени (uniform uTime)
export function flameMesh(list) {
  const geos = [];
  for (const [geo, color, x, y, z, sx, sy, sz, seed] of list) {
    const g = CAMP_SHAPES[geo.replace('camp_', '')].clone().toNonIndexed();
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g.scale(sx, sy, sz); g.translate(x, y, z);
    const n = g.attributes.position.count, col = new Float32Array(n * 3), fs = new Float32Array(n), fb = new Float32Array(n);
    const c = new THREE.Color(color), base = y - sy / 2;
    for (let i = 0; i < n; i++) { c.toArray(col, i * 3); fs[i] = seed ?? 0; fb[i] = seed === null ? 1e4 : base; } // угли не колышутся
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('fseed', new THREE.BufferAttribute(fs, 1));
    g.setAttribute('fbase', new THREE.BufferAttribute(fb, 1));
    geos.push(g);
  }
  const geo = mergeGeometries(geos);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const uTime = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float fseed;\nattribute float fbase;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  if (fbase < 9999.0) {
    float hk = max(0.0, position.y - fbase);
    float fl = 0.82 + 0.28 * sin(uTime * 11.0 + fseed * 3.1) + 0.12 * sin(uTime * 23.0 + fseed);
    transformed.y = fbase + hk * fl;
    transformed.x += sin(uTime * 7.0 + fseed + position.y * 3.0) * 0.12 * hk;
    transformed.z += cos(uTime * 6.0 + fseed * 1.7 + position.y * 2.6) * 0.12 * hk;
  }`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'campFlames'; mesh.renderOrder = 2; mesh.frustumCulled = false;
  mesh.userData.uTime = uTime;
  return mesh;
}
