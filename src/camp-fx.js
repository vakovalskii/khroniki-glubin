// Оживление лагеря орков: колыхание пламени (шейдер), свет от ближайших костров, искры и дым.
// Ламп всегда LIGHTS штук (число источников не меняется — шейдеры не пересобираются); дальние костры светятся только цветом.
import * as THREE from 'three';

export const LIGHTS = 4;
const FX_R = 60;     // м — дальше костры не искрят
const LIGHT_R = 70;  // м — дальше свет гасим

export function createCampFx(scene, camp, emit) {
  const uTime = camp.flameMesh.userData.uTime;
  const lights = Array.from({ length: LIGHTS }, () => {
    const l = new THREE.PointLight(0xff8a30, 0, 26, 1.6);
    scene.add(l);
    return l;
  });
  const fires = camp.fires;
  const order = fires.map((f, i) => i);
  let sortT = 0;

  function update(dt, t, p) {
    uTime.value = t;
    // ближайшие костры (пересчёт раз в 0.3 с)
    sortT -= dt;
    if (sortT <= 0) {
      sortT = 0.3;
      order.sort((a, b) => dist2(fires[a], p) - dist2(fires[b], p));
    }
    for (let k = 0; k < LIGHTS; k++) {
      const f = fires[order[k]], l = lights[k];
      const d = Math.sqrt(dist2(f, p));
      if (d > LIGHT_R) { l.intensity = 0; continue; }
      l.position.set(f.x, f.y + (f.torch ? 0.3 : 1), f.z);
      const base = f.big ? 90 : f.torch ? 25 : 55;
      l.distance = f.big ? 34 : f.torch ? 16 : 26;
      // мерцание и плавное затухание на краю
      l.intensity = base * (0.82 + 0.12 * Math.sin(t * 13 + k * 2.1) + 0.06 * Math.sin(t * 29 + k)) * Math.min(1, (LIGHT_R - d) / 15);
    }
    for (const f of fires) {
      if (Math.abs(f.x - p.x) > FX_R || Math.abs(f.z - p.z) > FX_R) continue;
      const rate = f.big ? 26 : f.torch ? 5 : 14;
      if (Math.random() < dt * rate) emit('dot', f, { n: 1, color: [0xff8a20, 0xffd040, 0xff4010], speed: 0.5, up: f.torch ? 1.4 : 2.6, life: f.torch ? 0.5 : 0.9, size: f.big ? 0.5 : 0.4, grav: 1.2, dy: f.torch ? 0 : -0.3, spread: f.big ? 0.9 : f.torch ? 0.15 : 0.5, h: 0 });
      if (!f.torch && Math.random() < dt * (f.big ? 5 : 2.5)) emit('dust', f, { n: 1, color: [0x9a948c, 0x7a7670], speed: 0.3, up: 1.6, life: 2.2, size: f.big ? 0.8 : 0.55, grav: 0.3, dy: 1.2, spread: 0.4, h: 0, drag: 0.5 });
    }
  }
  return { update, lights };
}
const dist2 = (f, p) => (f.x - p.x) ** 2 + (f.z - p.z) ** 2;
