// Общие для сервера и клиента объекты лагеря; геометрия описана данными.
// центр, радиус частокола, радиус зоны, высота площадки
export const CAMP = { id: 'orccamp', name: 'Орочий лагерь', x: 180, z: -100, r: 50, zr: 86, y: 3.6, lv: '15–25' };
const GATES = [0, Math.PI]; // восток (к пустоши) и запад (к лесу)
const GATE_HALF = 0.1; // полуширина проёма, рад (~5 м)
export const PACK_R = 5.5; // стая — в этом радиусе от своего костра
// стоянки: угол и радиус от центра; состав — мобы стаи
const W = 'orc_warrior', A = 'orc_archer', S = 'orc_shaman';
export const PITCHES = [
  { id: 'p1', a: 30, r: 31, mobs: [W, W, A, A, S] },
  { id: 'p2', a: 90, r: 31, mobs: [W, W, W, A, S] },
  { id: 'p3', a: 150, r: 31, mobs: [W, A, A, S, W], champion: 3 }, // шаман стаи — чемпион
  { id: 'p4', a: 210, r: 31, mobs: [W, W, A, S, A, W] },
  { id: 'p5', a: 270, r: 31, mobs: [W, W, A, A, S] },
  { id: 'p6', a: 330, r: 31, mobs: [W, A, W, S, A, W] },
  { id: 'gw', a: 180, r: 60, mobs: [W, A, W, A], outside: true }, // дозор у западных ворот
  { id: 'ge', a: 0, r: 60, mobs: [W, A, W, S], outside: true },   // дозор у восточных ворот
];
export const CHIEF = { id: 'chief', a: 0, r: 0, mobs: ['orc_chief', W, W, A, S], elite: [0, 1] };
export const CAMP_CHAMPION = 'Кровавый Шаман Гхул';

const rad = (d) => (d * Math.PI) / 180;
const at = (a, r) => ({ x: CAMP.x + Math.cos(a) * r, z: CAMP.z + Math.sin(a) * r });

const tilt = (shape, rx, rz) => ({ shape, rx, rz });
// сторона площадки: B — вёдра мира (add/use), addObs(x, z, r, {h, climb}); возвращает спавны, костры, пламя
export function buildCamp(B, addObs, heightAt) {
  const hy = (x, z) => heightAt(x, z);
  const fires = [];
  const flame = [];   // [geo, color, x, y, z, sx, sy, sz, seed]
  const spawns = [];

  // ---- частокол ----
  const n = Math.round((2 * Math.PI * CAMP.r) / 0.95);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (GATES.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < GATE_HALF)) continue;
    const x = CAMP.x + Math.cos(a) * CAMP.r, z = CAMP.z + Math.sin(a) * CAMP.r, y = hy(x, z);
    const h = 5.2 + ((i * 7) % 5) * 0.25;
    B.use('bark');
    B.add('camp_log', 0x5a4028, x, y + h / 2 - 0.4, z, 0, 1, h, 1);
    B.add('camp_tip', 0x6a4a2a, x, y + h - 0.4 + 0.45, z, 0, 1, 0.9, 1);
    // поперечины изнутри
    if (i % 4 === 0) {
      const ai = a + Math.PI / 2, xi = CAMP.x + Math.cos(a) * (CAMP.r - 0.55), zi = CAMP.z + Math.sin(a) * (CAMP.r - 0.55);
      B.use('wood'); B.add('camp_box', 0x6a4a2a, xi, y + 2.4, zi, -ai + Math.PI / 2, 0.18, 0.3, 4.2);
      B.add('camp_box', 0x6a4a2a, xi, y + 3.9, zi, -ai + Math.PI / 2, 0.18, 0.3, 4.2);
    }
    // колья наружу и черепа на некоторых
    if (i % 3 === 0) {
      const xo = CAMP.x + Math.cos(a) * (CAMP.r + 1.2), zo = CAMP.z + Math.sin(a) * (CAMP.r + 1.2), yo = hy(xo, zo);
      const rot = -a - Math.PI / 2; // наклон — от центра
      B.use('bark'); B.add('camp_stake', 0x7a5a3a, xo, yo - 0.3, zo, rot);
      B.use('plain'); B.add('camp_stakeTip', 0xc8b898, xo, yo - 0.3, zo, rot);
    }
    if (i % 2 === 0) addObs(x, z, 0.95);
  }
  // ---- ворота: башни-столбы, перекладина, черепа, знамёна ----
  for (const g of GATES) {
    for (const s of [-1, 1]) {
      const a = g + s * (GATE_HALF + 0.03);
      const { x, z } = at(a, CAMP.r), y = hy(x, z);
      B.use('bark'); B.add('camp_log', 0x4a3420, x, y + 4.2, z, 0, 1.9, 9.4, 1.9);
      B.add('camp_tip', 0x4a3420, x, y + 9.6, z, 0, 1.9, 1.4, 1.9);
      B.use('plain'); B.add('camp_ico', 0xe8e0c8, x + Math.cos(g) * 0.9, y + 7.6, z + Math.sin(g) * 0.9, 0, 0.42, 0.38, 0.42);
      B.add('camp_cone', 0xe8e0c8, x + Math.cos(g) * 0.9 - 0.35, y + 8.1, z + Math.sin(g) * 0.9, 0, 0.14, 0.7, 0.14);
      B.add('camp_cone', 0xe8e0c8, x + Math.cos(g) * 0.9 + 0.35, y + 8.1, z + Math.sin(g) * 0.9, 0, 0.14, 0.7, 0.14);
      addObs(x, z, 1.4);
      // знамя
      B.use('plain'); B.add('camp_box', 0x8a1a12, x + Math.cos(g) * 1.1, y + 5.2, z + Math.sin(g) * 1.1, -g + Math.PI / 2, 1.3, 2.6, 0.06);
      // факел у ворот
      flame.push(['camp_cone', 0xff8a20, x + Math.cos(g) * 1.2 - Math.sin(g) * 0, y + 6.6, z + Math.sin(g) * 1.2, 0.35, 0.9, 0.35, a * 3]);
    }
    const c = at(g, CAMP.r), y = hy(c.x, c.z);
    B.use('bark'); B.add('camp_box', 0x4a3420, c.x, y + 8.4, c.z, -g, 1.0, 0.7, 11.5);
    fires.push({ x: c.x + Math.cos(g) * 1.2, y: y + 6.8, z: c.z + Math.sin(g) * 1.2, torch: true });
  }
  // ---- вышки ----
  for (const d of [45, 135, 225, 315]) {
    const { x, z } = at(rad(d), CAMP.r - 5), y = hy(x, z);
    B.use('bark');
    for (const [ox, oz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) B.add('camp_cyl', 0x5a4028, x + ox, y + 3.5, z + oz, 0, 0.45, 7, 0.45);
    B.use('wood'); B.add('camp_box', 0x7a5a3a, x, y + 7, z, 0, 4.2, 0.35, 4.2);
    for (const [ox, oz, sx, sz] of [[0, -2, 4.2, 0.15], [0, 2, 4.2, 0.15], [-2, 0, 0.15, 4.2], [2, 0, 0.15, 4.2]]) B.add('camp_box', 0x6a4a2a, x + ox, y + 7.7, z + oz, 0, sx, 1.1, sz);
    B.use('bark'); for (const [ox, oz] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) B.add('camp_cyl', 0x5a4028, x + ox, y + 8.9, z + oz, 0, 0.2, 3.4, 0.2);
    B.use('roof'); B.add('camp_cone4', 0x8a6a3a, x, y + 11.4, z, 0, 3.9, 2.4, 3.9);
    addObs(x, z, 2.6);
    fires.push({ x, y: y + 8.4, z, torch: true });
    flame.push(['camp_cone', 0xff8a20, x + 1.9, y + 8.1, z + 1.9, 0.3, 0.8, 0.3, d]);
  }

  // ---- шатры ----
  const tent = (x, z, s, rot, big = false) => {
    const y = hy(x, z);
    B.use('fur'); B.add('camp_cone', big ? 0x6a4028 : 0x8a6a48, x, y + 2.3 * s, z, rot, 7 * s, 4.6 * s, 7 * s);
    B.use('plain'); B.add('camp_box', 0x1a120c, x + Math.cos(rot) * 2.95 * s, y + 0.9 * s, z + Math.sin(rot) * 2.95 * s, -rot, 0.08, 1.8 * s, 1.5 * s); // вход
    // шесты сверху
    B.use('bark');
    for (let k = 0; k < 3; k++) B.add(tilt('camp_pole', 0.25 * Math.cos(k * 2.1), 0.25 * Math.sin(k * 2.1)), 0x4a3420, x, y + 4.8 * s, z, 0, s, s, s);
    // полосы краски
    B.use('plain'); B.add('camp_cyl', big ? 0xa01810 : 0x6a2a1a, x, y + 1.2 * s, z, 0, 5.6 * s, 0.25 * s, 5.6 * s);
    addObs(x, z, 3.1 * s);
    if (big) {
      for (const k of [-1, 1]) {
        B.use('plain'); B.add('camp_cone', 0xece4cc, x + k * 2.2 * s, y + 5.3 * s, z, 0, 0.35, 2.2, 0.35);
        B.add('camp_box', 0x9a1a10, x + k * 3.6 * s, y + 3 * s, z + 3.3 * s, 0, 0.1, 3.5, 1.2);
        B.use('bark'); B.add('camp_cyl', 0x4a3420, x + k * 3.6 * s, y + 3.2 * s, z + 3.1 * s, 0, 0.18, 6.4, 0.18);
      }
    }
  };
  for (const d of [60, 120, 240, 300]) { const p = at(rad(d), 41); tent(p.x, p.z, 1, rad(d + 180)); }
  for (const d of [60, 120, 240]) { const p = at(rad(d + 4), 19); tent(p.x, p.z, 0.8, rad(d + 180)); }
  { const p = at(rad(270), 14); tent(p.x, p.z, 1.35, rad(90), true); } // шатёр вождя

  // ---- костры ----
  const fire = (x, z, big = false, a0 = 0, m = 5) => {
    const y = hy(x, z), s = big ? 1.6 : 1;
    B.use('stone');
    for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; B.add('camp_ico', 0x6a6660, x + Math.cos(a) * 1.15 * s, y + 0.15, z + Math.sin(a) * 1.15 * s, a, 0.35 * s, 0.28 * s, 0.35 * s); }
    B.use('bark');
    for (let k = 0; k < 3; k++) B.add(tilt('camp_lie', 0, 0.25), 0x3a2618, x, y + 0.3, z, k * 1.05, 0.55 * s, 0.6, 0.6);
    // угли и пламя — в огненный меш
    flame.push(['camp_cyl', 0xff5010, x, y + 0.22, z, 1.5 * s, 0.1, 1.5 * s, null]);
    const seed = x * 0.37 + z * 0.11;
    flame.push(['camp_cone', 0xff5a10, x, y + 1.05 * s, z, 1.3 * s, 1.9 * s, 1.3 * s, seed]);
    flame.push(['camp_cone', 0xffa020, x + 0.25 * s, y + 0.95 * s, z - 0.1, 0.8 * s, 1.5 * s, 0.8 * s, seed + 2]);
    flame.push(['camp_cone', 0xffe070, x - 0.1, y + 0.8 * s, z + 0.15, 0.5 * s, 1.1 * s, 0.5 * s, seed + 4]);
    addObs(x, z, 1.4 * s);
    // скамьи-брёвна
    B.use('bark');
    for (const k of [0, 2]) {
      const a = a0 + ((k + 0.5) / m) * Math.PI * 2; // скамьи — между местами мобов
      const bx = x + Math.cos(a) * 3.1 * s, bz = z + Math.sin(a) * 3.1 * s;
      B.add('camp_lie', 0x5a3a22, bx, hy(bx, bz) + 0.25, bz, -a + Math.PI / 2, 1, 1, 1);
      addObs(bx, bz, 0.9, { h: 0.55, climb: true });
    }
    fires.push({ x, y: y + 1.2 * s, z, big });
  };
  // ---- тотем ----
  const totem = (x, z, k) => {
    const y = hy(x, z), cols = [0x8a3a1a, 0x3a6a8a, 0x8a7a2a, 0x4a7a3a];
    B.use('wood');
    for (let j = 0; j < 4; j++) B.add('camp_box', cols[(j + k) % 4], x, y + 0.7 + j * 1.35, z, k * 0.7 + j * 0.3, 1.1 - j * 0.08, 1.25, 1.1 - j * 0.08);
    B.use('plain');
    for (let j = 0; j < 4; j++) { B.add('camp_box', 0x100804, x, y + 0.95 + j * 1.35, z, k * 0.7 + j * 0.3, 1.14 - j * 0.08, 0.12, 0.5); } // глаза-прорези
    B.use('wood'); B.add('camp_box', 0x6a4a2a, x, y + 4.6, z, k * 0.7 + 0.9, 3.0, 0.25, 0.5); // крылья
    B.use('plain'); B.add('camp_ico', 0xece4cc, x, y + 6.0, z, 0, 0.55, 0.5, 0.6);
    B.add('camp_cone', 0xece4cc, x - 0.55, y + 6.5, z, 0, 0.2, 1.1, 0.2); B.add('camp_cone', 0xece4cc, x + 0.55, y + 6.5, z, 0, 0.2, 1.1, 0.2);
    B.add('camp_box', 0xff3a10, x, y + 6.05, z + 0.5, 0, 0.35, 0.08, 0.05); // горящие глаза
    addObs(x, z, 0.9);
  };
  // ---- клетка ----
  const cage = (x, z, rot) => {
    const y = hy(x, z);
    B.use('wood'); B.add('camp_box', 0x4a3420, x, y + 0.15, z, rot, 2.6, 0.3, 2.6); B.add('camp_box', 0x4a3420, x, y + 2.25, z, rot, 2.7, 0.25, 2.7);
    B.use('plain');
    for (let k = 0; k < 12; k++) {
      const t = (k / 12) * 4, side = Math.floor(t), f = t - side - 0.5;
      const lx = [f * 2.4, 1.2, -f * 2.4, -1.2][side], lz = [-1.2, f * 2.4, 1.2, -f * 2.4][side];
      const c = Math.cos(rot), sn = Math.sin(rot);
      B.add('camp_bar', 0x3a3a40, x + lx * c + lz * sn, y + 1.2, z - lx * sn + lz * c, 0, 1, 1, 1);
    }
    B.add('camp_ico', 0xe8e0c8, x + 0.3, y + 0.45, z - 0.2, 0.5, 0.3, 0.2, 0.25);
    addObs(x, z, 1.8);
  };
  // ---- бочки, стойки с оружием, сушилки шкур, кости ----
  const barrels = (x, z, k) => {
    B.use('wood');
    for (let j = 0; j < 3; j++) {
      const bx = x + Math.cos(j * 2.1 + k) * 0.8, bz = z + Math.sin(j * 2.1 + k) * 0.8, y = hy(bx, bz);
      B.add('camp_cyl', 0x7a5030, bx, y + 0.6, bz, 0, 1.0, 1.2, 1.0);
      B.use('plain'); B.add('camp_cyl', 0x3a3a3a, bx, y + 0.95, bz, 0, 1.04, 0.08, 1.04); B.add('camp_cyl', 0x3a3a3a, bx, y + 0.25, bz, 0, 1.04, 0.08, 1.04); B.use('wood');
    }
    addObs(x, z, 1.5, { h: 1.2, climb: true });
  };
  const rack = (x, z, rot) => {
    const y = hy(x, z), c = Math.cos(rot), s = Math.sin(rot);
    B.use('wood'); B.add('camp_box', 0x5a3a22, x, y + 1.6, z, rot, 2.6, 0.18, 0.18); B.add('camp_box', 0x5a3a22, x, y + 0.6, z, rot, 2.6, 0.18, 0.18);
    for (const k of [-1.2, 1.2]) B.add('camp_box', 0x4a3020, x + k * c, y + 1, z - k * s, rot, 0.18, 2, 0.18);
    for (let k = 0; k < 4; k++) {
      const o = -0.9 + k * 0.6;
      B.use('bark'); B.add('camp_cyl', 0x6a4a2a, x + o * c, y + 1.4, z - o * s, 0, 0.1, 2.8, 0.1);
      B.use('plain'); B.add('camp_cone4', 0x9098a0, x + o * c, y + 3.0, z - o * s, rot, 0.25, 0.5, 0.08);
    }
    addObs(x, z, 1.3);
  };
  const hides = (x, z, rot) => {
    const y = hy(x, z), c = Math.cos(rot), s = Math.sin(rot);
    B.use('bark'); for (const k of [-1.3, 1.3]) B.add('camp_cyl', 0x4a3420, x + k * c, y + 1.3, z - k * s, 0, 0.16, 2.6, 0.16);
    B.add('camp_box', 0x4a3420, x, y + 2.5, z, rot, 2.8, 0.14, 0.14);
    B.use('fur'); B.add('camp_box', 0x9a7a52, x, y + 1.6, z, rot, 2.1, 1.7, 0.06);
    addObs(x, z, 1.4);
  };
  const bones = (x, z) => {
    const y = hy(x, z);
    B.use('plain');
    for (let k = 0; k < 5; k++) B.add('camp_box', 0xe0d8c0, x + Math.cos(k * 1.3) * 0.5, y + 0.12 + k * 0.05, z + Math.sin(k * 1.3) * 0.5, k * 0.9, 1.1, 0.12, 0.14);
    B.add('camp_ico', 0xe8e0c8, x, y + 0.35, z, 0.3, 0.3, 0.26, 0.3);
  };

  // стоянки со стаями
  const packs = [...PITCHES, CHIEF];
  for (const p of packs) {
    const a = rad(p.a), c = at(a, p.r);
    Object.assign(p, c);
    fire(c.x, c.z, p === CHIEF, a, p.mobs.length);
    const m = p.mobs.length;
    p.mobs.forEach((mob, i) => {
      const ranged = mob === 'orc_archer' || mob === 'orc_shaman';
      const big = p === CHIEF, aa = (i / m) * Math.PI * 2 + a, rr = (ranged ? 4.8 : 3.6) + (big ? 0.8 : 0);
      spawns.push({
        mob, x: c.x + Math.cos(aa) * rr, z: c.z + Math.sin(aa) * rr, camp: p.id, wander: 1.5,
        elite: p.elite?.includes(i) || false, champion: p.champion === i ? CAMP_CHAMPION : undefined,
      });
    });
    if (p.outside) continue;
    // тотем и утварь у каждой внутренней стоянки
    const t = at(a + 0.2, p.r + 6.5); totem(t.x, t.z, packs.indexOf(p));
    const b = at(a - 0.28, p.r + 5.5); barrels(b.x, b.z, packs.indexOf(p));
  }
  // тотемы у ворот, клетки, стойки, сушилки, кости
  for (const g of GATES) for (const s of [-1, 1]) { const t = at(g + s * 0.2, CAMP.r - 5); totem(t.x, t.z, s + 2); }
  for (const d of [195, 345]) { const p = at(rad(d), 17); cage(p.x, p.z, rad(d)); }
  for (const d of [100, 250]) { const p = at(rad(d), 45.5); rack(p.x, p.z, rad(d) + Math.PI / 2); }
  for (const d of [80, 290]) { const p = at(rad(d), 44); hides(p.x, p.z, rad(d) + Math.PI / 2); }
  for (const d of [15, 110, 170, 240, 320]) { const p = at(rad(d), 24); bones(p.x, p.z); }

  return { spawns, fires, flame, packs };
}

