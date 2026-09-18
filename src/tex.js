// Пиксельные текстуры, нарисованные кодом (без файлов): 16–32 px, ближний фильтр — «пиксельный» вид.
// Большинство — в оттенках серого: цвет даёт материал (color × map), поэтому одна текстура годится для многих цветов.
import * as THREE from 'three';

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const cache = {};

// сгенерированные тайлы 64–128 px (tools/gen-textures.mjs) — если файл есть, берём его вместо процедурного
export const GEN = ['bark', 'bone', 'brick', 'chain', 'cobble', 'dbrick', 'dfloor', 'fur', 'ground', 'house', 'leather', 'leaves', 'plate', 'robe', 'roof', 'roof_blue', 'roof_red',
  'sandstone', 'stone', 't_dirt', 't_forest', 't_grass', 't_rock', 't_sand', 't_snow', 'water', 'wood'];
// цветные тайлы (материал белый, цвет — из текстуры)
export const COLOR_TEX = new Set(['cobble', 'dbrick', 'dfloor', 'roof_blue', 'roof_red', 'sandstone', 'water', 't_dirt', 't_forest', 't_grass', 't_rock', 't_sand', 't_snow']);
// тайл, которого может не быть среди сгенерированных: иначе — процедурная замена
const gen = (name, fallback) => () => (GEN.includes(name) ? make(name) : TEX[fallback]());
const loader = typeof document !== 'undefined' ? new THREE.TextureLoader() : null;
function setup(t, repeat) {
  // Сохраняем детали готовых тайлов без крупных пикселей при приближении.
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function make(name, size, draw, { color = false, repeat = true } = {}) {
  if (cache[name] !== undefined) return cache[name];
  if (GEN.includes(name)) return (cache[name] = loader ? setup(loader.load(`${import.meta.env?.BASE_URL ?? '/'}assets/tex/${name}.png`), true) : null);
  seed = [...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 2147483647 || 1;
  const w = Array.isArray(size) ? size[0] : size, h = Array.isArray(size) ? size[1] : size;
  const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!cv) return (cache[name] = null); // node (юнит-тесты) — без текстур
  cv.width = w; cv.height = h;
  const x = cv.getContext('2d');
  const px = (i, j, v, a = 1) => { // v: 0..1 серый или [r,g,b] 0..255
    x.fillStyle = Array.isArray(v) ? `rgba(${v[0]},${v[1]},${v[2]},${a})` : `rgba(${(v * 255) | 0},${(v * 255) | 0},${(v * 255) | 0},${a})`;
    x.fillRect(((i % w) + w) % w, ((j % h) + h) % h, 1, 1);
  };
  const fill = (v) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(i, j, v + (rnd() - 0.5) * 0.08); };
  draw({ x, px, fill, w, h });
  return (cache[name] = setup(new THREE.CanvasTexture(cv), repeat));
}

export const TEX = {
  roof_red: gen('roof_red', 'roof'), roof_blue: gen('roof_blue', 'roof'), sandstone: gen('sandstone', 'stone'),
  dbrick: gen('dbrick', 'brick'), dfloor: gen('dfloor', 'cobble'),
  t_grass: gen('t_grass', 'ground'), t_forest: gen('t_forest', 'ground'), t_sand: gen('t_sand', 'ground'),
  t_dirt: gen('t_dirt', 'ground'), t_rock: gen('t_rock', 'stone'), t_snow: gen('t_snow', 'ground'),
  // земля: крапинки, камушки, травинки
  ground: () => make('ground', 16, ({ px, fill }) => {
    fill(0.86);
    for (let k = 0; k < 40; k++) px(rnd() * 16 | 0, rnd() * 16 | 0, 0.7 + rnd() * 0.12);
    for (let k = 0; k < 14; k++) { const i = rnd() * 16 | 0, j = rnd() * 16 | 0; px(i, j, 1); px(i, j - 1, 0.95); }
    for (let k = 0; k < 4; k++) { const i = rnd() * 16 | 0, j = rnd() * 16 | 0; px(i, j, 0.62); px(i + 1, j, 0.68); }
  }),
  // кирпич: ряды по 4 px, шов светлее
  brick: () => make('brick', 16, ({ px }) => {
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const row = j >> 2, off = row % 2 ? 4 : 0, mortar = j % 4 === 3 || (i + off) % 8 === 7;
      px(i, j, mortar ? 0.55 : 0.82 + ((row * 7 + ((i + off) >> 3) * 13) % 5) * 0.035 + (rnd() - 0.5) * 0.06);
    }
  }),
  // брусчатка: неровные камни с тёмными швами
  cobble: () => make('cobble', 16, ({ px }) => {
    const c = [];
    for (let k = 0; k < 10; k++) c.push([rnd() * 16, rnd() * 16, 0.75 + rnd() * 0.2]);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      let d1 = 99, d2 = 99, v = 0;
      for (const [cx, cy, cv] of c) for (const [ox, oy] of [[0, 0], [16, 0], [-16, 0], [0, 16], [0, -16]]) {
        const d = Math.hypot(i - cx - ox, j - cy - oy);
        if (d < d1) { d2 = d1; d1 = d; v = cv; } else if (d < d2) d2 = d;
      }
      px(i, j, d2 - d1 < 1.1 ? 0.5 : v + (rnd() - 0.5) * 0.05);
    }
  }),
  // черепица: чешуя рядами
  roof: () => make('roof', 16, ({ px }) => {
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const row = j >> 2, off = row % 2 ? 2 : 0, lx = (i + off) % 4, ly = j % 4;
      const edge = ly === 3 || (ly === 2 && (lx === 0 || lx === 3));
      px(i, j, edge ? 0.5 : 0.9 - ly * 0.05 + (rnd() - 0.5) * 0.05);
    }
  }),
  // фахверк: штукатурка, тёмные балки, окна
  house: () => make('house', 32, ({ px }) => {
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
      let v = 0.95 + (rnd() - 0.5) * 0.06;
      if (j < 2 || i < 2 || j === 16 || (j > 16 && (i + j) % 16 === 0) || (j < 16 && (i - j + 32) % 16 === 0)) v = 0.42 + rnd() * 0.05;
      if (i >= 8 && i <= 13 && j >= 5 && j <= 11) v = i === 8 || i === 13 || j === 5 || j === 11 ? 0.42 : j === 8 || i === 10 || i === 11 ? 0.42 : 0.22 + (j < 8 ? 0.08 : 0);
      px(i, j, v);
    }
  }),
  wood: () => make('wood', 16, ({ px }) => {
    for (let i = 0; i < 16; i++) { const base = 0.72 + ((i >> 4) % 2) * 0.05 + rnd() * 0.08; for (let j = 0; j < 16; j++) px(i, j, i % 4 === 3 ? 0.5 : base + Math.sin(j * 0.9 + i) * 0.04); }
  }),
  bark: () => make('bark', 16, ({ px }) => {
    for (let i = 0; i < 16; i++) { const b = 0.7 + rnd() * 0.15; for (let j = 0; j < 16; j++) px(i, j, (i + (j >> 3)) % 4 === 0 ? 0.5 : b + (rnd() - 0.5) * 0.08); }
  }),
  leaves: () => make('leaves', 16, ({ px, fill }) => {
    fill(0.72);
    for (let k = 0; k < 22; k++) { const i = rnd() * 16 | 0, j = rnd() * 16 | 0, v = 0.85 + rnd() * 0.15; px(i, j, v); px(i + 1, j, v); px(i, j + 1, v - 0.05); }
    for (let k = 0; k < 14; k++) px(rnd() * 16 | 0, rnd() * 16 | 0, 0.5);
  }),
  stone: () => make('stone', 16, ({ px, fill }) => {
    fill(0.82);
    for (let k = 0; k < 3; k++) { let i = rnd() * 16 | 0, j = rnd() * 16 | 0; for (let s = 0; s < 7; s++) { px(i, j, 0.52); i += rnd() < 0.5 ? 1 : 0; j += 1; } }
    for (let k = 0; k < 18; k++) px(rnd() * 16 | 0, rnd() * 16 | 0, 0.95);
  }),
  water: () => make('water', 16, ({ px, fill }) => {
    fill(0.85);
    for (let k = 0; k < 7; k++) { const i = rnd() * 16 | 0, j = rnd() * 16 | 0; for (let s = 0; s < 4; s++) px(i + s, j, 1); }
  }),
  // одежда и броня
  chain: () => make('chain', 16, ({ px }) => {
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) { const a = (i + ((j >> 1) % 2) * 2) % 4, b = j % 2; px(i, j, a === 0 ? 0.62 : b ? 0.82 : 0.97); }
    for (let i = 0; i < 16; i++) { px(i, 0, 0.5); px(i, 15, 0.7); }
  }),
  plate: () => make('plate', 16, ({ px }) => {
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) px(i, j, j % 8 === 7 ? 0.5 : j % 8 === 0 ? 1 : (i === 3 || i === 12) && j % 8 === 3 ? 0.55 : 0.85 - (j % 8) * 0.02);
  }),
  leather: () => make('leather', 16, ({ px, fill }) => {
    fill(0.8);
    for (let j = 1; j < 16; j += 3) { px(2, j, 1); px(13, j, 1); }
    for (let i = 0; i < 16; i++) { px(i, 9, 0.5); px(i, 10, 0.62); }
    px(7, 9, 1); px(8, 9, 1); px(7, 10, 0.9); px(8, 10, 0.9);
  }),
  cloth: () => make('cloth', 8, ({ px }) => {
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) px(i, j, (i + j) % 2 ? 0.86 : 0.78 + rnd() * 0.05);
  }),
  robe: () => make('robe', 16, ({ px }) => {
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) px(i, j, (i + j) % 2 ? 0.85 : 0.8);
    for (let i = 0; i < 16; i++) { px(i, 14, 1); px(i, 13, [255, 214, 120]); px(i, 15, 0.55); if (i % 4 === 1) px(i, 12, [255, 214, 120]); }
    for (let j = 0; j < 12; j++) px(8, j, 0.62);
  }),
  // лицо: на сфере «вперёд» (+z) — это u = 0.25
  face: () => make('face', [32, 16], ({ px, fill }) => {
    fill(0.97);
    for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) px(i, j, 0.35 + rnd() * 0.05); // волосы
    for (let i = 0; i < 32; i++) if (i < 3 || i > 12) px(i, 4, 0.4);
    const c = 8;
    px(c - 3, 7, 0.15); px(c + 2, 7, 0.15); px(c - 3, 8, 0.15); px(c + 2, 8, 0.15);
    px(c - 4, 6, 0.45); px(c - 3, 6, 0.45); px(c + 2, 6, 0.45); px(c + 3, 6, 0.45);
    px(c - 1, 11, 0.55); px(c, 11, 0.55); px(c - 1, 9, 0.85);
  }, { repeat: false }),
  fur: () => make('fur', 16, ({ px, fill }) => {
    fill(0.8);
    for (let k = 0; k < 40; k++) { const i = rnd() * 16 | 0, j = rnd() * 16 | 0, v = rnd() < 0.5 ? 0.62 : 0.97; px(i, j, v); px(i + 1, j + 1, v); }
  }),
  bone: () => make('bone', 16, ({ px, fill }) => {
    fill(0.9);
    for (let j = 0; j < 16; j += 4) for (let i = 0; i < 16; i++) px(i, j, 0.62);
    for (let k = 0; k < 8; k++) px(rnd() * 16 | 0, rnd() * 16 | 0, 0.7);
  }),
  // частицы и снаряды
  spark: () => make('spark', 8, ({ x }) => {
    x.fillStyle = '#fff'; x.fillRect(3, 0, 2, 8); x.fillRect(0, 3, 8, 2); x.fillRect(2, 2, 4, 4);
  }, { repeat: false }),
  dot: () => make('dot', 8, ({ x }) => {
    x.fillStyle = '#fff'; x.fillRect(2, 1, 4, 6); x.fillRect(1, 2, 6, 4);
  }, { repeat: false }),
  plus: () => make('plus', 8, ({ x }) => {
    x.fillStyle = '#fff'; x.fillRect(3, 1, 2, 6); x.fillRect(1, 3, 6, 2);
  }, { repeat: false }),
  flake: () => make('flake', 8, ({ px }) => {
    for (let k = 0; k < 8; k++) { px(k, k, 1); px(7 - k, k, 1); px(3, k, 1); px(k, 3, 1); }
  }, { repeat: false }),
  orb: () => make('orb', 16, ({ px }) => {
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const d = Math.hypot(i - 7.5, j - 7.5);
      if (d < 3) px(i, j, 1); else if (d < 5.5) px(i, j, 0.85, 1); else if (d < 7.5 && (i + j) % 2) px(i, j, 0.7, 0.7);
    }
  }, { repeat: false }),
  // небо: градиент, пиксельные облака, горы на горизонте
  sky: () => make('sky', [256, 64], ({ x, w, h }) => {
    const top = [58, 110, 190], hor = [196, 222, 240];
    for (let j = 0; j < h; j++) {
      const k = Math.pow(j / (h - 1), 1.6), band = Math.floor(k * 10) / 10; // ступенчатый градиент
      const c = top.map((t, i) => Math.round(t + (hor[i] - t) * band));
      x.fillStyle = `rgb(${c})`; x.fillRect(0, j, w, 1);
    }
    for (let n = 0; n < 16; n++) {
      const cx = rnd() * w, cy = 14 + rnd() * 26, len = 10 + rnd() * 26;
      for (let s = 0; s < len; s += 2) {
        const hh = Math.round(2 + Math.sin((s / len) * Math.PI) * (3 + rnd() * 2));
        x.fillStyle = '#f4f8ff'; x.fillRect(Math.round(cx + s) % w, Math.round(cy - hh), 2, hh);
        x.fillStyle = '#c8d6ea'; x.fillRect(Math.round(cx + s) % w, Math.round(cy), 2, 1);
      }
    }
    let y = 58;
    for (let i = 0; i < w; i++) { y += (rnd() - 0.5) * 2; y = Math.max(54, Math.min(62, y)); x.fillStyle = '#8aa4bc'; x.fillRect(i, Math.round(y), 1, h - Math.round(y)); }
  }, { repeat: false }),
};

// UV по мировым координатам (проекция на грань по нормали): текстура не растягивается на больших объектах
export function worldUV(geo, scale = 0.5) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
