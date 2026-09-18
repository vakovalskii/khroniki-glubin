// Единый масштаб обычного перемещения: сохраняет соотношения героя, мобов и питомцев.
export const MOVE_SCALE = 0.25;
// Скорость опорной стопы из GLB при высоте персонажа 2.2: измерена по нижней четверти траектории.
export const GAIT_SPEED = { Walk: 1.89, Run: 4.71 };
export function gaitPlayback(s) {
  const speed = Number.isFinite(s.travelSpeed) ? Math.max(0, s.travelSpeed) : s.moving ? (s.speed ?? 1) * GAIT_SPEED.Run : 0;
  if (!s.moving || speed < 0.05) return { name: 'Idle', rate: 1 };
  const name = speed < 2.7 ? 'Walk' : 'Run';
  return { name, rate: Math.max(0.1, Math.min(3, speed / GAIT_SPEED[name])) };
}
