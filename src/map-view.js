// Проекция миникарты в направления экрана; большая карта остаётся севером вверх.
export function mapOffset(dx, dz, yaw = 0) {
  return [dx * Math.cos(yaw) - dz * Math.sin(yaw), dx * Math.sin(yaw) + dz * Math.cos(yaw)];
}
