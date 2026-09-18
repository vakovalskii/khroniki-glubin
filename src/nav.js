// Навигация без DOM: сетка препятствий-кругов, скольжение, видимость, поиск пути A*.
// Круг: { x, z, r, h, climb } — climb-круги (мелкие камни) не блокируют, а поднимают по куполу.
const K = 8192, B = 4096; // числовой ключ ячейки
export function createNav(list, { cell = 8 } = {}) {
  const grid = new Map();
  const ci = (v) => Math.floor(v / cell);
  const cellsBox = (x0, z0, x1, z1, fn) => {
    for (let i = ci(x0), i1 = ci(x1); i <= i1; i++) for (let j = ci(z0), j1 = ci(z1); j <= j1; j++) fn((i + B) * K + j + B);
  };
  const index = (o) => cellsBox(o.x - o.r, o.z - o.r, o.x + o.r, o.z + o.r, (k) => { let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(o); });
  for (const o of list) index(o);
  // обход кругов, чьи ячейки пересекают квадрат вокруг точки (круги могут повторяться)
  const each = (x, z, rad, fn) => {
    for (let i = ci(x - rad), i1 = ci(x + rad); i <= i1; i++) for (let j = ci(z - rad), j1 = ci(z + rad); j <= j1; j++) {
      const a = grid.get((i + B) * K + j + B); if (!a) continue;
      for (const o of a) if (fn(o)) return true;
    }
    return false;
  };
  const insert = (o) => { if (!list.includes(o)) list.push(o); index(o); };
  const remove = (o) => {
    const k = list.indexOf(o); if (k >= 0) list.splice(k, 1);
    cellsBox(o.x - o.r, o.z - o.r, o.x + o.r, o.z + o.r, (key) => { const a = grid.get(key); const n = a ? a.indexOf(o) : -1; if (n >= 0) a.splice(n, 1); });
  };
  const queryNear = (x, z, radius) => {
    const out = new Set();
    each(x, z, radius, (o) => { if (Math.hypot(x - o.x, z - o.z) < o.r + radius) out.add(o); });
    return [...out];
  };
  const blockedAt = (x, z, radius) => each(x, z, radius, (o) => !o.climb && Math.hypot(x - o.x, z - o.z) < o.r + radius);
  // выталкивание из блокирующих (касательная часть шага сохраняется — скольжение), возврат — подъём над землёй
  const resolveMove = (pos, radius) => {
    for (let it = 0; it < 2; it++) each(pos.x, pos.z, radius, (o) => {
      if (o.climb) return;
      const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz), min = o.r + radius;
      if (d >= min) return;
      if (d < 1e-4) pos.x = o.x + min; else { pos.x = o.x + dx / d * min; pos.z = o.z + dz / d * min; }
    });
    let off = 0;
    each(pos.x, pos.z, 0, (o) => {
      if (!o.climb) return;
      const d = Math.hypot(pos.x - o.x, pos.z - o.z);
      if (d < o.r) off = Math.max(off, o.h * Math.sqrt(1 - (d / o.r) ** 2));
    });
    return off;
  };
  // отрезок свободен от блокирующих кругов (с учётом радиуса сущности)
  const lineClear = (ax, az, bx, bz, radius) => {
    const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz, st = cell / 2;
    const n = Math.max(1, Math.ceil(Math.sqrt(L2) / st)), pad = radius + cell / 4;
    const hit = (o) => {
      if (o.climb) return false;
      const t = L2 > 0 ? Math.min(1, Math.max(0, ((o.x - ax) * vx + (o.z - az) * vz) / L2)) : 0;
      return Math.hypot(ax + vx * t - o.x, az + vz * t - o.z) < o.r + radius;
    };
    for (let k = 0; k <= n; k++) if (each(ax + vx * k / n, az + vz * k / n, pad, hit)) return false;
    return true;
  };
  // A* по решётке step; результат — сглаженный список точек без стартовой, последняя = to; null — пути нет
  const findPath = (from, to, radius, { step = 1.5, margin = 30, maxNodes = 4000 } = {}) => {
    const ox = Math.min(from.x, to.x) - margin, oz = Math.min(from.z, to.z) - margin;
    const W = Math.ceil((Math.abs(from.x - to.x) + margin * 2) / step) + 1, H = Math.ceil((Math.abs(from.z - to.z) + margin * 2) / step) + 1;
    const N = W * H, pass = new Int8Array(N), g = new Float32Array(N), par = new Int32Array(N), state = new Uint8Array(N);
    const inflate = radius + step / 3; // запас: отрезок между соседними свободными центрами не задевает круг
    const free = (i, j) => {
      if (i < 0 || j < 0 || i >= W || j >= H) return false;
      const k = j * W + i;
      if (!pass[k]) pass[k] = blockedAt(ox + i * step, oz + j * step, inflate) ? 2 : 1;
      return pass[k] === 1;
    };
    const near = (x, z) => {
      const i0 = Math.round((x - ox) / step), j0 = Math.round((z - oz) / step);
      if (free(i0, j0)) return j0 * W + i0;
      let best = -1, bd = Infinity;
      for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) {
        const i = i0 + di, j = j0 + dj, d = di * di + dj * dj;
        if (d < bd && free(i, j)) { bd = d; best = j * W + i; }
      }
      return best;
    };
    const s = near(from.x, from.z), e = near(to.x, to.z);
    if (s < 0 || e < 0) return null;
    const ei = e % W, ej = (e / W) | 0;
    const hf = (i, j) => { const dx = Math.abs(i - ei), dz = Math.abs(j - ej); return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    // бинарная куча (ленивое удаление)
    const hk = [], hv = [];
    const push = (k, f) => {
      let n = hk.length; hk.push(k); hv.push(f);
      while (n > 0) { const p = (n - 1) >> 1; if (hv[p] <= f) break; hk[n] = hk[p]; hv[n] = hv[p]; n = p; }
      hk[n] = k; hv[n] = f;
    };
    const pop = () => {
      const top = hk[0], lk = hk.pop(), lv = hv.pop(), len = hk.length;
      if (len) {
        let n = 0;
        for (;;) { let c = 2 * n + 1; if (c >= len) break; if (c + 1 < len && hv[c + 1] < hv[c]) c++; if (hv[c] >= lv) break; hk[n] = hk[c]; hv[n] = hv[c]; n = c; }
        hk[n] = lk; hv[n] = lv;
      }
      return top;
    };
    g[s] = 0; par[s] = -1; state[s] = 1; push(s, hf(s % W, (s / W) | 0));
    let found = false, count = 0;
    while (hk.length) {
      const k = pop();
      if (state[k] === 2) continue;
      state[k] = 2;
      if (k === e) { found = true; break; }
      if (++count > maxNodes) return null;
      const i = k % W, j = (k / W) | 0;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj;
        if (!free(a, b)) continue;
        if (di && dj && !(free(i + di, j) && free(i, j + dj))) continue; // без срезания углов
        const nk = b * W + a;
        if (state[nk] === 2) continue;
        const ng = g[k] + (di && dj ? Math.SQRT2 : 1);
        if (state[nk] === 1 && ng >= g[nk]) continue;
        g[nk] = ng; par[nk] = k; state[nk] = 1;
        push(nk, ng + hf(a, b));
      }
    }
    if (!found) return null;
    const pts = [];
    for (let k = e; k !== s && k >= 0; k = par[k]) pts.push({ x: ox + (k % W) * step, z: oz + ((k / W) | 0) * step });
    pts.reverse();
    if (pts.length) pts[pts.length - 1] = { x: to.x, z: to.z }; else pts.push({ x: to.x, z: to.z });
    // сглаживание: от текущей точки — к самой дальней видимой по цепочке
    const out = [];
    let cx = from.x, cz = from.z;
    for (let k = 0; k < pts.length;) {
      let j = k;
      while (j + 1 < pts.length && lineClear(cx, cz, pts[j + 1].x, pts[j + 1].z, radius)) j++;
      out.push(pts[j]); cx = pts[j].x; cz = pts[j].z; k = j + 1;
    }
    return out;
  };
  return { insert, remove, queryNear, blockedAt, resolveMove, lineClear, findPath };
}
