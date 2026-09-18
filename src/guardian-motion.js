import { gaitPlayback } from './movement.js';
// Только визуальные состояния: не меняют урон, скорость или экипировку.
export const usesGuardian = (p) => p?.cls === 'warrior' && (!p.race || p.race === 'human');
export function createGuardianMotion(durations = {}) {
  let action = null, serial = 0, attack = 0, skill = 0, count = 0, dead = false;
  const begin = (name, seconds = durations[name] || 0.6) => { action = { name, left: seconds, seconds, serial: ++serial }; };
  const blocked = (s) => s.dieT != null || s.dead || s.inCombat || s.moving || s.casting || s.attackT > 0 || s.hitT > 0;
  return {
    celebrate(s) { if (blocked(s) || action) return false; begin('LevelUp'); return true; },
    step(s, dt) {
      const died = s.dieT != null || !!s.dead;
      const attacked = (s.attackT || 0) > attack + 0.05;
      const skilled = (s.skillPulse || 0) !== skill;
      attack = s.attackT || 0; skill = s.skillPulse || 0;
      if (died) { if (!dead) { action = null; ++serial; } dead = true; return { name: 'Death', serial, loop: false }; }
      if (dead) { dead = false; action = null; ++serial; }
      if (action) { action.left -= dt; if (action.left <= 0 || action.name === 'LevelUp' && blocked(s)) action = null; }
      // Hit — сильное отбрасывание из библиотеки: обычный урон оставляет текущую атаку/каст.
      if (skilled) begin(s.skillAnimation === 'Skill01' ? 'Skill01' : 'Skill03');
      else if (attacked && action?.name !== 'Skill01') begin(count++ % 2 ? 'Combo' : 'Attack', s.attackDuration || 0.6);
      if (s.casting) { action = null; return { name: 'Skill01', serial: 0, loop: true }; }
      if (s.moving && action) action = null;
      if (action) return { ...action, loop: false };
      return { ...gaitPlayback(s), serial: 0, loop: true };
    },
  };
}
