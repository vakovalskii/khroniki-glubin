// Готовый костюм человека-воина. Смена брони влияет на характеристики; модульной брони в GLB нет.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { stepTurn } from './anim.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { usesGuardian, createGuardianMotion } from './guardian-motion.js';
const URL = '/assets/warrior/meshy/guardian-game.glb';
let asset;
const load = () => asset ??= new GLTFLoader().loadAsync(URL).catch((e) => { asset = null; throw e; });
export function attachGuardian(root, character) {
  if (!usesGuardian(character)) return;
  const fallback = [...root.children], fallbackAnim = root.userData.anim;
  const status = root.userData.guardian = { state: 'loading', clip: null, armor: 'fixed' };
  let mixer, actions, active, motion, holder, removed = false, lastState = {}, lastKey;
  root.userData.disposeGuardian = () => { removed = true; mixer?.stopAllAction(); if (mixer) mixer.uncacheRoot(mixer.getRoot()); };
  root.userData.levelUp = (s) => motion?.celebrate(s) || false;
  root.userData.anim = (t, s, dt = 1 / 60) => {
    lastState = s; root.userData.st = s;
    if (!mixer) return fallbackAnim(t, s, dt);
    stepTurn(root, dt);
    for (const c of fallback) c.visible = false;
    root.rotation.z = 0; // смерть задаёт клип, без дополнительного поворота всего героя
    const state = motion.step(s, dt), key = `${state.name}:${state.serial}`;
    if (key !== lastKey) {
      const next = actions[state.name] || actions.Idle;
      next.reset().setLoop(state.loop ? THREE.LoopRepeat : THREE.LoopOnce, state.loop ? Infinity : 1);
      next.clampWhenFinished = !state.loop;
      next.setEffectiveTimeScale(state.seconds ? next.getClip().duration / state.seconds : 1).setEffectiveWeight(1).play();
      if (active && active !== next) { active.fadeOut(0.12); next.fadeIn(0.12); }
      active = next; status.clip = state.name; lastKey = key;
    }
    if (state.rate != null) active.setEffectiveTimeScale(state.rate);
    status.playbackRate = active.getEffectiveTimeScale();
    mixer.update(dt);
  };
  load().then((gltf) => {
    if (removed) return;
    const names = new Set(gltf.animations.map(c => c.name));
    for (const name of ['Idle','Run','Walk','Death','Attack','Combo','Hit','Skill01','Skill03','LevelUp']) if (!names.has(name)) throw new Error(`Нет клипа ${name}`);
    const model = clone(gltf.scene); model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model), h = bounds.max.y - bounds.min.y;
    if (!(h > 0)) throw new Error('Модель без высоты');
    holder = new THREE.Group(); holder.scale.setScalar(2.2 / h); model.position.y -= bounds.min.y;
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    holder.add(model); root.add(holder);
    mixer = new THREE.AnimationMixer(model);
    actions = Object.fromEntries(gltf.animations.map(c => [c.name, mixer.clipAction(c)]));
    motion = createGuardianMotion(Object.fromEntries(gltf.animations.map(c => [c.name, c.duration])));
    const hand = model.getObjectByName('mixamorigRightHand') || model.getObjectByName('mixamorig:RightHand'), weapon = root.userData.weaponGroup;
    if (hand && weapon) { hand.add(weapon); weapon.position.set(0, 0.07, 0); weapon.rotation.set(0, 0, 0); weapon.scale.setScalar(1 / holder.scale.x); }
    for (const c of fallback) c.visible = false;
    status.state = 'ready'; status.clips = [...names];
    root.userData.anim(0, lastState, 0);
  }).catch((e) => {
    if (removed) return;
    mixer = null; if (holder) root.remove(holder); root.userData.anim = fallbackAnim;
    status.state = 'fallback'; status.reason = e.message;
    for (const c of fallback) c.visible = true;
  });
}
