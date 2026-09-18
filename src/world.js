import { CAMP_SHAPES, flameMesh } from './camp-render.js';
// Рендер мира: рельеф, вода, слитая геометрия построек. Расстановка и вся математика — в world-core.js.
import * as THREE from 'three';
import { TEX, worldUV, COLOR_TEX } from './tex.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAP, DUNGEON, buildProps, fbm, smooth, heightAt, zoneAt } from './world-core.js';

// ядро реэкспортим — остальной код и тесты импортируют мир из одного места
export * from './world-core.js';

const mat = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const MATS = {};
// kind — пиксельная текстура поверхности (см. tex.js), scale — плиток на метр
const KIND_SCALE = { brick: 0.25, cobble: 0.2, roof: 0.4, roof_red: 0.22, roof_blue: 0.22, house: 0.2, wood: 0.4, bark: 0.3, leaves: 0.15, stone: 0.16, sandstone: 0.14, dbrick: 0.2, dfloor: 0.12, plain: 0.5 };
// цветной тайл — материал белый (цвет из текстуры)
const M = (c, kind = 'plain') => (MATS[c + kind] ||= mat(COLOR_TEX.has(kind) ? 0xffffff : c, TEX[kind] ? { map: TEX[kind]() } : {}));

const SHAPES = {
  ...Object.fromEntries(Object.entries(CAMP_SHAPES).map(([key, geo]) => ['camp_' + key, geo])),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone4: new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cone: new THREE.ConeGeometry(0.5, 1, 7),
  ico: new THREE.IcosahedronGeometry(1, 0),
};

// кладём геометрию в «ведро» по цвету → потом сливаем: весь статичный мир — десяток вызовов отрисовки
function bucketAdder() {
  const buckets = new Map();
  let kind = 'plain';
  const add = (shape, color, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => {
    const g = SHAPES[shape.shape || shape].clone(); if (shape.shape) { g.rotateX(shape.rx); g.rotateZ(shape.rz); } g.scale(sx, sy, sz); if (ry) g.rotateY(ry); g.translate(x, y, z);
    const k = `${color}|${kind}`; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(g.index ? g.toNonIndexed() : g);
  };
  const build = (parent) => {
    for (const [key, list] of buckets) {
      const [c, kd] = key.split('|');
      const geo = worldUV(mergeGeometries(list), KIND_SCALE[kd]);
      const m = new THREE.Mesh(geo, M(+c, kd)); m.castShadow = m.receiveShadow = true; parent.add(m);
    }
  };
  return { add, build, use: (k) => { kind = k; } };
}

// рельеф: 6 цветных тайлов (луг, лес, пустошь, утоптанная земля, скала, снег), веса — в вершинах
const LAYERS = ['t_grass', 't_forest', 't_sand', 't_dirt', 't_rock', 't_snow'];
const ZONE_LAYER = { meadow: 0, forest: 1, waste: 2, orccamp: 3, highlands: 0, marsh: 1 };
function groundWeights(x, z, h, slope) {
  const w = [0, 0, 0, 0, 0, 0];
  // размытие границ зон: несколько точек вокруг, с шумом на краях
  const jx = (fbm(x * 0.02, z * 0.02) - 0.5) * 40, jz = (fbm(z * 0.02 + 9, x * 0.02) - 0.5) * 40;
  for (const [dx, dz] of [[0, 0], [22, 0], [-22, 0], [0, 22], [0, -22]]) {
    const zn = zoneAt(x + dx + jx, z + dz + jz);
    w[zn.town ? 3 : ZONE_LAYER[zn.id] ?? 0] += 0.2;
  }
  // тропинки: пятна земли на лугах и в лесу
  const path = smooth(0.62, 0.7, fbm(x * 0.012 + 3, z * 0.012 - 7));
  const dirt = path * (w[0] + w[1]) * 0.8;
  w[3] += dirt; w[0] *= 1 - path * 0.8; w[1] *= 1 - path * 0.8;
  // склоны и высота — скала, вершины — снег
  const rock = Math.max(smooth(0.35, 0.6, slope), smooth(38, 55, h));
  for (let k = 0; k < 4; k++) w[k] *= 1 - rock;
  w[4] += rock;
  const snow = smooth(72, 86, h);
  for (let k = 0; k < 5; k++) w[k] *= 1 - snow;
  w[5] += snow;
  const sum = w.reduce((a, v) => a + v, 0) || 1;
  return w.map((v) => v / sum);
}
function terrainMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  const maps = LAYERS.map((k) => TEX[k]());
  if (maps.some((t) => !t)) { m.map = TEX.ground(); return m; } // node / нет текстур
  m.onBeforeCompile = (sh) => {
    maps.forEach((t, i) => { sh.uniforms[`tl${i}`] = { value: t }; });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 wa;\nattribute vec3 wb;\nvarying vec3 vWa;\nvarying vec3 vWb;\nvarying vec2 vGp;\nvarying vec3 vTp;\nvarying vec3 vTn;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWa = wa; vWb = wb; vGp = position.xz; vTp = position; vTn = abs(normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tl0; uniform sampler2D tl1; uniform sampler2D tl2; uniform sampler2D tl3; uniform sampler2D tl4; uniform sampler2D tl5;
varying vec3 vWa; varying vec3 vWb; varying vec2 vGp; varying vec3 vTp; varying vec3 vTn;
// скала — трипланарно, чтобы не растягивалась на склонах
vec4 rockTri(float w) {
  if (w < 0.01) return vec4(0.0);
  vec3 b = pow(vTn, vec3(4.0)); b /= b.x + b.y + b.z;
  vec3 p = vTp / 9.0;
  return (texture2D(tl4, p.zy) * b.x + texture2D(tl4, p.xz) * b.y + texture2D(tl4, p.xy) * b.z) * w;
}
vec4 lay(sampler2D t, float w, vec2 uv) { return w > 0.01 ? texture2D(t, uv) * w : vec4(0.0); }`)
      .replace('#include <map_fragment>', `
  vec2 uv = vGp / 7.0;
  // макро-вариация: крупные светлые/тёмные пятна, чтобы не было видно повторов
  float macro = texture2D(tl0, vGp / 173.0 + 0.37).g;
  vec4 tc = lay(tl0, vWa.x, uv) + lay(tl1, vWa.y, uv) + lay(tl2, vWa.z, uv) + lay(tl3, vWb.x, uv) + rockTri(vWb.y) + lay(tl5, vWb.z, uv);
  tc.rgb *= 0.82 + macro * 0.36;
  diffuseColor *= vec4(tc.rgb, 1.0);`);
  };
  return m;
}

function buildTerrain(scene) {
  const seg = 220, geo = new THREE.PlaneGeometry(MAP + 400, MAP + 400, seg, seg).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal, wa = new Float32Array(pos.count * 3), wb = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i);
    const w = groundWeights(x, z, h, 1 - nrm.getY(i));
    wa.set(w.slice(0, 3), i * 3); wb.set(w.slice(3), i * 3);
    // лёгкая вариация яркости, цвет — из тайлов
    const n = 0.85 + fbm(x * 0.05, z * 0.05) * 0.3;
    col.set([n, n, n], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('wa', new THREE.BufferAttribute(wa, 3));
  geo.setAttribute('wb', new THREE.BufferAttribute(wb, 3));
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 6, pos.getZ(i) / 6);
  const m = new THREE.Mesh(geo, terrainMaterial());
  m.receiveShadow = true; m.name = 'ground';
  scene.add(m);
  // вода в низинах
  const wmap = TEX.water(); if (wmap) { wmap.repeat.set((MAP + 400) / 12, (MAP + 400) / 12); }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(MAP + 400, MAP + 400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: wmap ? 0xd8ecf4 : 0x3a6a9a, transparent: true, opacity: 0.85, map: wmap }));
  water.position.y = -6.5; water.name = 'water'; scene.add(water);
  return m;
}

export function buildWorld(scene) {
  const B = bucketAdder();
  const ground = buildTerrain(scene);
  const { npcs, spawns, camp } = buildProps(B);
  camp.flameMesh = flameMesh(camp.flame); scene.add(camp.flameMesh);
  B.build(scene);
  // факелы катакомб — тёплый свет
  const { x0, z0, cell, n } = DUNGEON;
  for (let k = 0; k < 6; k++) { const l = new THREE.PointLight(0xff9040, 60, 70, 1.5); l.position.set(x0 + ((k % 3) + 0.5) * (n * cell / 3), 7, z0 + ((k / 3 | 0) + 0.5) * (n * cell / 2)); scene.add(l); }
  return { ground, npcs, spawns, camp };
}
