// Повторная проверка боевого умения перед применением: мир мог измениться за время каста.
import { needsEnemy, townOk } from './skills.js';
export function castError({ skill, dead, stunned, town, target, targetAvailable = true, targetTown = false, distance = 0 }) {
  if (dead) return 'Персонаж погиб';
  if (stunned) return 'Вы оглушены';
  if (!townOk(skill) && town) return 'В городе сражаться нельзя';
  if ((needsEnemy(skill) || ['slow', 'drain'].includes(skill.kind))) {
    if (!target || target.dead || !targetAvailable || !(target.def || target.isPlayer)) return 'Нет цели';
    if (target.isPlayer && targetTown) return 'В городе сражаться нельзя';
    if (distance > (skill.range || 0) + (target.radius || 0)) return 'Цель слишком далеко';
  }
  return null;
}
