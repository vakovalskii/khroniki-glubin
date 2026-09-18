import { MOVE_SCALE } from './movement.js';
// Питомцы призывателей: характеристики, лимиты призыва, решения поведения. Без DOM и three — проверяется юнит-тестами.

// base — на 1 уровне хозяина, grow — за уровень; dur — секунд жизни (0 — пока не погибнет или хозяин не выйдет)
// group — общий лимит внутри группы; taunt — перетягивает внимание мобов
export const PETS = {
  skeleton_pet: {
    name: 'Скелет-воин', role: 'tank', group: 'skeleton', dur: 120, shape: 'humanoid', color: 0xe0dcc8, size: 1,
    base: { hp: 90, patk: 7, pdef: 40, mdef: 20 }, grow: { hp: 18, patk: 1.6, pdef: 2.2, mdef: 1 }, speed: 22, aspd: 0.9, range: 2.5,
  },
  wolf_pet: {
    name: 'Волк-спутник', role: 'melee', group: 'beast', dur: 0, shape: 'beast', color: 0x808080, size: 1.1,
    base: { hp: 70, patk: 9, pdef: 26, mdef: 18 }, grow: { hp: 13, patk: 2.1, pdef: 1.4, mdef: 0.9 }, speed: 30, aspd: 1.3, range: 2.2,
  },
  treant_pet: {
    name: 'Древень-страж', role: 'tank', group: 'beast', dur: 0, taunt: true, shape: 'tree', color: 0x3a5a2a, size: 1.6,
    base: { hp: 220, patk: 6, pdef: 60, mdef: 40 }, grow: { hp: 34, patk: 1.4, pdef: 3, mdef: 1.8 }, speed: 16, aspd: 0.6, range: 3,
  },
};

// сколько питомцев группы держит профессия
export const PET_LIMITS = { necromancer: { skeleton: 1 }, druid: { beast: 1 } };
export const SUMMON_CAST = 2; // с, призыв можно и в бою
export const PET_FOLLOW = [2, 3]; // держится от хозяина на этой дистанции
export const PET_LEASH = 25; // дальше от хозяина не уходит — возвращается
export const PET_TELEPORT = 40; // дальше — телепорт к хозяину

// характеристики питомца от уровня и маг. атаки хозяина (owner: { lvl, matk })
export function petStats(petId, owner) {
  const d = PETS[petId]; if (!d) return null;
  const L = Math.max(0, (owner?.lvl || 1) - 1), k = 1 + (owner?.matk || 0) / 400;
  const v = (key) => (d.base[key] + d.grow[key] * L);
  return {
    maxHp: Math.round(v('hp') * k), patk: +(v('patk') * k).toFixed(1), pdef: Math.round(v('pdef')), mdef: Math.round(v('mdef')),
    speed: d.speed * MOVE_SCALE, aspd: d.aspd, range: d.range, taunt: !!d.taunt,
  };
}

// лимит профессии для питомца (0 — призывать нельзя)
export const petLimit = (prof, petId) => PET_LIMITS[prof]?.[PETS[petId]?.group] || 0;

let seq = 0;
// призыв: возвращает { pets, removed, err } — новый список, заменённые старые питомцы; pets — массив питомцев хозяина
export function summonPet(pets, petId, owner, now = 0) {
  const d = PETS[petId];
  const lim = petLimit(owner?.prof, petId);
  if (!d || !lim) return { pets, removed: [], err: 'Вы не умеете призывать этого питомца' };
  const st = petStats(petId, owner);
  const pet = {
    uid: ++seq, pet: petId, owner: owner.id ?? null, group: d.group, born: now, until: d.dur ? now + d.dur * 1000 : null,
    hp: st.maxHp, ...st, pos: owner.pos ? { ...owner.pos } : { x: 0, z: 0 }, target: null,
  };
  const same = pets.filter((p) => p.group === d.group).sort((a, b) => a.born - b.born);
  const removed = same.slice(0, Math.max(0, same.length - lim + 1));
  return { pets: [...pets.filter((p) => !removed.includes(p)), pet], removed, err: null };
}

// убрать погибших и тех, у кого вышло время
export const expirePets = (pets, now) => pets.filter((p) => p.hp > 0 && (p.until == null || p.until > now));

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const alive = (e) => e && !e.dead && e.hp !== 0;

// решение питомца на такт: { action: 'follow'|'attack'|'return'|'idle', target, pos, teleport }
// ownerTarget — цель хозяина; enemiesNear — [{ id, pos, dead, hitsOwner }]
export function petDecide(pet, ownerPos, ownerTarget, enemiesNear = []) {
  const d = dist(pet.pos, ownerPos);
  if (d > PET_TELEPORT) return { action: 'return', target: null, pos: { ...ownerPos }, teleport: true };
  if (d > PET_LEASH) return { action: 'return', target: null, pos: { ...ownerPos }, teleport: false };
  const inLeash = (e) => alive(e) && e.pos && dist(e.pos, ownerPos) <= PET_LEASH;
  // приоритет: цель хозяина → кто бьёт хозяина → прежняя цель
  const tgt = [ownerTarget, enemiesNear.find((e) => e.hitsOwner && inLeash(e)), enemiesNear.find((e) => e.id === pet.target)].find(inLeash);
  if (tgt) return { action: 'attack', target: tgt, pos: { ...tgt.pos }, teleport: false };
  if (d > PET_FOLLOW[1]) {
    // точка в PET_FOLLOW[0]..[1] м от хозяина со стороны питомца
    const r = (PET_FOLLOW[0] + PET_FOLLOW[1]) / 2, k = r / d;
    return { action: 'follow', target: null, pos: { x: ownerPos.x + (pet.pos.x - ownerPos.x) * k, z: ownerPos.z + (pet.pos.z - ownerPos.z) * k }, teleport: false };
  }
  return { action: 'idle', target: null, pos: null, teleport: false };
}

// кому достаётся опыт за убийство: питомец — хозяину, иначе самому убийце
export const petKillOwner = (killer) => (killer?.pet ? killer.owner ?? null : killer?.id ?? null);
