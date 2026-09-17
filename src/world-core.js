// Ядро мира без three.js: рельеф, зоны, расстановка построек, препятствия, спавны.
// Формы передаются наружу через «эмиттер» B — клиент строит из них меши, сервер берёт пустышку.
// Всё, что нужно и клиенту, и серверу (heightAt/zoneAt/obstacles/spawns), живёт здесь.

// ---------- шум ----------
export function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x, y) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += a * vnoise(x * f, y * f); a *= 0.5; f *= 2; } return s; };
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export const MAP = 1600; // сторона карты, м
export const DUNGEON = { x0: 2200, z0: -200, cell: 18, n: 11 }; // катакомбы — отдельная площадка за краем карты

export const TOWNS = [
  { id: 'harbor', name: 'Светлая Гавань', x: -430, z: 400, r: 95, color: 0xd8cfb8 },
  { id: 'ford', name: 'Каменный Брод', x: 430, z: -400, r: 95, color: 0xb8a890 },
];

// зоны: круги с уровнем и мобами; первая подходящая по расстоянию
export const ZONES = [
  { id: 'meadow', name: 'Солнечные луга', x: -300, z: 250, r: 320, lv: '1–9', mobs: [['rabbit', 14], ['wolf', 12], ['goblin', 10], ['boar', 8]], ground: [0.36, 0.55, 0.24] },
  { id: 'forest', name: 'Сумрачный лес', x: 20, z: 10, r: 300, lv: '10–17', mobs: [['treant', 10], ['orc', 10], ['spider', 9]], ground: [0.16, 0.3, 0.14] },
  { id: 'waste', name: 'Выжженная пустошь', x: 360, z: -120, r: 330, lv: '18–25', mobs: [['scorpion', 12], ['golem', 9]], ground: [0.66, 0.55, 0.36] },
];
export const CRYPT = { x: 150, z: 250 }; // вход в катакомбы в лесу

export function zoneAt(x, z) {
  if (x > DUNGEON.x0 - 100) return { id: 'crypt', name: 'Катакомбы', lv: '18–28' };
  for (const t of TOWNS) if (Math.hypot(x - t.x, z - t.z) < t.r + 20) return { id: t.id, name: t.name, town: true, lv: 'мирная зона' };
  let best = null, bd = Infinity;
  for (const zn of ZONES) { const d = Math.hypot(x - zn.x, z - zn.z) / zn.r; if (d < bd) { bd = d; best = zn; } }
  return best;
}

export function heightAt(x, z) {
  if (x > DUNGEON.x0 - 100) return 0;
  let h = fbm(x * 0.006, z * 0.006) * 34 - 12;
  h += Math.pow(fbm(x * 0.02 + 5, z * 0.02), 2) * 6;
  // края карты — горы
  const edge = Math.max(Math.abs(x), Math.abs(z)) / (MAP / 2);
  h += smooth(0.82, 1.0, edge) * 90;
  // пустошь ровнее
  const w = ZONES[2]; h = lerp(h, h * 0.35 + 2, smooth(w.r, w.r * 0.5, Math.hypot(x - w.x, z - w.z)));
  // города — ровные площадки
  for (const t of TOWNS) { const d = Math.hypot(x - t.x, z - t.z); h = lerp(4, h, smooth(t.r, t.r + 60, d)); }
  // площадка у склепа
  h = lerp(heightAtBase(CRYPT.x, CRYPT.z), h, smooth(14, 30, Math.hypot(x - CRYPT.x, z - CRYPT.z)));
  return h;
}
function heightAtBase(x, z) { return fbm(x * 0.006, z * 0.006) * 34 - 12; }

// препятствия: круги {x,z,r}
export const obstacles = [];
const addObs = (x, z, r) => obstacles.push({ x, z, r });

// эмиттер-пустышка: сервер строит расстановку, но не геометрию
export const nullEmitter = { add() {}, use() {} };

function buildTown(t, B, npcs) {
  const y = heightAt(t.x, t.z);
  // стена кольцом из сегментов, 4 ворот
  const segs = 36;
  B.use('brick');
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    if (i % 9 === 0 || i % 9 === 8) continue; // проёмы ворот (стороны света)
    const x = t.x + Math.cos(a) * t.r, z = t.z + Math.sin(a) * t.r;
    B.add('box', 0x9a9088, x, y + 4, z, -a, 2.2, 8, (2 * Math.PI * t.r) / segs + 0.6);
    if (i % 3 === 0) { B.add('cyl', 0x8a8078, x, y + 6, z, 0, 5, 12, 5); B.use('roof_red'); B.add('cone', 0x6a3a2a, x, y + 14, z, 0, 6.5, 5, 6.5); B.use('brick'); addObs(x, z, 3); }
    else addObs(x, z, 2.4);
  }
  // площадь и фонтан
  B.use('cobble');
  B.add('cyl', 0xcfc6b0, t.x, y + 0.1, t.z, 0, 40, 0.3, 40);
  B.use('stone');
  B.add('cyl', 0x8a9aa8, t.x, y + 1, t.z, 0, 8, 2, 8);
  B.add('cyl', 0xd8d0c0, t.x, y + 3, t.z, 0, 1.2, 5, 1.2);
  B.use('plain'); B.add('cyl', 0x4a8ac8, t.x, y + 1.6, t.z, 0, 7, 0.4, 7);
  addObs(t.x, t.z, 4.5);
  // дома по кругу
  const r = (k) => hash(t.x + k, t.z - k);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2, d = 45 + r(i) * 30;
    if (Math.abs(Math.sin(a * 2)) < 0.25) continue; // улицы к воротам
    const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d, w = 8 + r(i + 3) * 6, h = 6 + r(i + 5) * 6;
    B.use('house'); B.add('box', t.color, x, y + h / 2, z, -a, w, h, w * 0.8);
    B.use(i % 2 ? 'roof_red' : 'roof_blue'); B.add('cone4', i % 2 ? 0x8a3a2a : 0x3a4a6a, x, y + h + w * 0.35, z, -a, w * 0.95, w * 0.7, w * 0.85);
    addObs(x, z, w * 0.62);
  }
  // храм — точка возрождения
  B.use('brick'); B.add('box', 0xeeeae0, t.x, y + 7, t.z - 26, 0, 16, 14, 12);
  B.use('roof'); B.add('cone4', 0xc8a040, t.x, y + 19, t.z - 26, 0, 16, 10, 12);
  addObs(t.x, t.z - 26, 9);
  // NPC
  npcs.push({ id: t.id + ':gk', town: t.id, role: 'gatekeeper', name: 'Хранитель врат', x: t.x + 12, z: t.z + 10, color: 0x9040d0 });
  npcs.push({ id: t.id + ':shop', town: t.id, role: 'merchant', name: 'Торговец', x: t.x - 12, z: t.z + 10, color: 0xd09030 });
  npcs.push({ id: t.id + ':priest', town: t.id, role: 'priest', name: 'Жрец', x: t.x, z: t.z - 16, color: 0xf0e8d0 });
  // стражи снаружи у четырёх ворот — нападают на PK
  for (let g = 0; g < 4; g++) {
    const a = (g / 4) * Math.PI * 2 - Math.PI / 36, d = t.r + 6; // проёмы ворот — сегменты 8 и 0 (±5°)
    const cx = t.x + Math.cos(a) * d, cz = t.z + Math.sin(a) * d, px = -Math.sin(a) * 5, pz = Math.cos(a) * 5;
    for (const k of [-1, 1]) npcs.push({ id: `${t.id}:guard${g}${k}`, town: t.id, role: 'guard', name: 'Страж', x: cx + px * k, z: cz + pz * k, color: 0x8090a0 });
  }
  // врата телепорта — светящееся кольцо
  B.use('stone'); B.add('cyl', 0x6a5aa0, t.x + 18, y + 0.3, t.z + 16, 0, 6, 0.6, 6);
}

function buildNature(B) {
  // деревья: густо в лесу, реже на лугах; камни в пустоши
  let placed = 0;
  for (let i = 0; i < 9000 && placed < 2600; i++) {
    const x = (hash(i, 1) - 0.5) * MAP * 0.95, z = (hash(i, 2) - 0.5) * MAP * 0.95;
    const zn = zoneAt(x, z); if (zn.town) continue;
    if (TOWNS.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + 30)) continue;
    if (Math.hypot(x - CRYPT.x, z - CRYPT.z) < 30) continue;
    if (TELEPORTS.some((t) => Math.hypot(x - t.x, z - t.z) < 14)) continue; // точки прибытия свободны
    const h = heightAt(x, z); if (h < -5 || h > 55) continue;
    const p = hash(i, 3);
    if (zn.id === 'forest' && p < 0.75) {
      const s = 1 + hash(i, 4) * 1.2;
      B.use('bark'); B.add('cyl', 0x4a3020, x, h + 3 * s, z, 0, 0.9 * s, 6 * s, 0.9 * s);
      B.use('leaves'); B.add('cone', p < 0.4 ? 0x1f4a24 : 0x2a5a2a, x, h + 9 * s, z, 0, 7 * s, 11 * s, 7 * s);
      addObs(x, z, 1.2 * s); placed++;
    } else if (zn.id === 'meadow' && p < 0.12) {
      const s = 1 + hash(i, 4);
      B.use('bark'); B.add('cyl', 0x5a3a22, x, h + 2 * s, z, 0, 0.8 * s, 4 * s, 0.8 * s);
      B.use('leaves'); B.add('ico', 0x3a7a30, x, h + 5.5 * s, z, 0, 3.2 * s, 2.8 * s, 3.2 * s);
      addObs(x, z, 1 * s); placed++;
    } else if (zn.id === 'waste' && p < 0.1) {
      const s = 1.5 + hash(i, 4) * 3;
      B.use('sandstone'); B.add('ico', 0x8a7050, x, h + s * 0.4, z, p * 30, s, s * 0.7, s * 1.2);
      addObs(x, z, s * 0.9); placed++;
    }
  }
}

function buildCrypt(B) {
  const y = heightAt(CRYPT.x, CRYPT.z);
  B.use('brick');
  B.add('box', 0x5a5560, CRYPT.x, y + 5, CRYPT.z, 0, 14, 10, 14);
  B.use('roof'); B.add('cone4', 0x3a3540, CRYPT.x, y + 14, CRYPT.z, 0, 15, 8, 15);
  B.use('plain'); B.add('box', 0x0a0a10, CRYPT.x, y + 3, CRYPT.z + 7.05, 0, 4, 6, 0.3); // проём
  addObs(CRYPT.x, CRYPT.z, 7.5);
}

// лабиринт катакомб: генерация проходов (DFS), стены — препятствия
export const dungeonCells = [];
export const dungeonWalls = new Set(); // заполняется при генерации — для тестов проходимости
function buildDungeon(B) {
  const { x0, z0, cell, n } = DUNGEON;
  const vis = Array.from({ length: n }, () => Array(n).fill(false));
  const walls = new Set(); // "x,z,dir" dir: e/s
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { walls.add(`${i},${j},e`); walls.add(`${i},${j},s`); }
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const stack = [[0, 0]]; vis[0][0] = true;
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const nb = [[1, 0, 'e'], [-1, 0, 'w'], [0, 1, 's'], [0, -1, 'n']].filter(([di, dj]) => vis[i + di]?.[j + dj] === false);
    if (!nb.length) { stack.pop(); continue; }
    const [di, dj, d] = nb[Math.floor(rnd() * nb.length)];
    if (d === 'e') walls.delete(`${i},${j},e`); if (d === 'w') walls.delete(`${i - 1},${j},e`);
    if (d === 's') walls.delete(`${i},${j},s`); if (d === 'n') walls.delete(`${i},${j - 1},s`);
    vis[i + di][j + dj] = true; stack.push([i + di, j + dj]);
  }
  // лишние проходы — меньше тупиков
  for (let k = 0; k < n * 2; k++) { const i = Math.floor(rnd() * (n - 1)), j = Math.floor(rnd() * n); walls.delete(`${i},${j},e`); }
  for (const w of walls) dungeonWalls.add(w);
  const size = n * cell;
  B.use('dfloor'); B.add('box', 0x3a3438, x0 + size / 2, -0.5, z0 + size / 2, 0, size, 1, size);
  const wall = (x, z, sx, sz) => {
    B.use('dbrick'); B.add('box', 0x5a5460, x, 4, z, 0, sx, 8, sz);
    // препятствия — цепочка кругов вдоль стены
    const len = Math.max(sx, sz), steps = Math.ceil(len / 2.5);
    for (let s = 0; s <= steps; s++) { const t = s / steps - 0.5; addObs(x + (sx > sz ? t * sx : 0), z + (sz > sx ? t * sz : 0), 1.6); }
  };
  wall(x0 + size / 2, z0, size, 1.5); wall(x0 + size / 2, z0 + size, size, 1.5);
  wall(x0, z0 + size / 2, 1.5, size); wall(x0 + size, z0 + size / 2, 1.5, size);
  for (const w of walls) {
    const [i, j, d] = w.split(','); const ci = +i, cj = +j;
    if (d === 'e' && ci < n - 1) wall(x0 + (ci + 1) * cell, z0 + (cj + 0.5) * cell, 1.5, cell + 1.5);
    if (d === 's' && cj < n - 1) wall(x0 + (ci + 0.5) * cell, z0 + (cj + 1) * cell, cell + 1.5, 1.5);
  }
  // колонны и факелы в клетках
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const cx = x0 + (i + 0.5) * cell, cz = z0 + (j + 0.5) * cell;
    dungeonCells.push({ x: cx, z: cz, i, j });
    if ((i + j) % 3 === 0) B.use('plain'), B.add('cyl', 0xff8a30, cx, 7.5, cz - cell / 2 + 1.2, 0, 0.5, 1, 0.5);
  }
}

// расстановка мира: заполняет obstacles/dungeonCells/dungeonWalls и возвращает NPC и точки спавна.
// B — эмиттер форм (клиент даёт свой, сервер — nullEmitter). Считается один раз на процесс.
let props = null;
export function buildProps(B = nullEmitter) {
  if (props) return props;
  const npcs = [];
  for (const t of TOWNS) buildTown(t, B, npcs);
  buildNature(B);
  buildCrypt(B);
  buildDungeon(B);
  const spawns = [];
  for (const zn of ZONES) for (const [mob, count] of zn.mobs) for (let k = 0; k < count; k++) {
    for (let tries = 0; tries < 30; tries++) {
      const a = hash(k * 13 + zn.x, mob.length * 7 + tries) * Math.PI * 2, d = Math.sqrt(hash(k, tries + zn.z)) * zn.r * 0.85;
      const x = zn.x + Math.cos(a) * d, z = zn.z + Math.sin(a) * d;
      if (zoneAt(x, z).id !== zn.id || heightAt(x, z) < -5 || heightAt(x, z) > 45) continue;
      if (TOWNS.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + 40)) continue;
      spawns.push({ mob, x, z }); break;
    }
  }
  const undead = ['skeleton', 'skeleton', 'ghoul', 'wraith'];
  dungeonCells.forEach((c, k) => { if (c.i + c.j > 1 && k % 2 === 0) spawns.push({ mob: undead[k % undead.length], x: c.x + 3, z: c.z - 2 }); });
  const last = dungeonCells[dungeonCells.length - 1];
  spawns.push({ mob: 'lich', x: last.x, z: last.z });
  props = { npcs, spawns };
  return props;
}

// точки телепорта
export const TELEPORTS = [
  { id: 'harbor', name: 'Светлая Гавань', x: TOWNS[0].x + 18, z: TOWNS[0].z + 22, cost: 0 },
  { id: 'ford', name: 'Каменный Брод', x: TOWNS[1].x + 18, z: TOWNS[1].z + 22, cost: 0 },
  { id: 'meadow', name: 'Солнечные луга (1–9)', x: -260, z: 180, cost: 20 },
  { id: 'forest', name: 'Сумрачный лес (10–17)', x: -20, z: 60, cost: 50 },
  { id: 'waste', name: 'Выжженная пустошь (18–25)', x: 300, z: -160, cost: 100 },
  { id: 'crypt', name: 'Катакомбы (18–28)', x: DUNGEON.x0 + DUNGEON.cell / 2, z: DUNGEON.z0 + DUNGEON.cell / 2, cost: 150 },
];

// столкновения: круговые препятствия. Общая для клиента и сервера проверка шага.
export function blockedAt(x, z, r = 0) {
  for (const o of obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r + r) return o;
  return null;
}
