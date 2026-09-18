// Данные мира: классы, предметы, мобы, умения, зоны. Всё своё — механика в духе старых MMORPG.

export const MAX_LEVEL = 40;
// опыт до следующего уровня
export const xpToNext = (lv) => Math.round(60 * Math.pow(lv, 2.25));

export const CLASSES = {
  warrior: {
    name: 'Воин', color: 0xb04030,
    attr: { str: 40, dex: 30, con: 43, int: 21, wit: 11, men: 25 },
    base: { hp: 120, mp: 30, patk: 9, matk: 3, pdef: 40, mdef: 30, aspd: 1.0, speed: 26, crit: 0.08 },
    grow: { hp: 22, mp: 4, patk: 2.2, matk: 0.4, pdef: 2.0, mdef: 1.2 },
    skills: ['power_strike', 'battle_cry', 'whirlwind'],
    range: 3.2,
  },
  mage: {
    name: 'Маг', color: 0x3050c0,
    attr: { str: 22, dex: 21, con: 27, int: 41, wit: 20, men: 39 },
    base: { hp: 80, mp: 90, patk: 4, matk: 12, pdef: 30, mdef: 45, aspd: 0.8, speed: 24, crit: 0.05 },
    grow: { hp: 13, mp: 14, patk: 0.6, matk: 2.6, pdef: 1.2, mdef: 2.0 },
    skills: ['fire_bolt', 'heal', 'ice_nova'],
    range: 22,
  },
};

// умения: kind — dmg (физ/маг), heal, buff, aoe, debuff (ослабление цели), dot (урон со временем), hot (лечение со временем), summon (питомец pet)
// needShield/needBow/needPolearm — требование к оружию; dash — рывок к цели; slow — замедление цели; drain — лечит долю урона; also — доп. множители баффа
// правила наложения и тиков эффектов — src/effects.js
export const SKILLS = {
  power_strike: { name: 'Мощный удар', key: '1', mp: 8, cd: 5, kind: 'dmg', school: 'p', mul: 2.4, range: 3.5, color: 0xffa040, lvl: 1 },
  battle_cry: { name: 'Боевой клич', key: '2', mp: 15, cd: 40, kind: 'buff', stat: 'patk', mul: 1.3, dur: 20, color: 0xff4040, lvl: 5 },
  whirlwind: { name: 'Вихрь', key: '3', mp: 22, cd: 10, kind: 'aoe', school: 'p', mul: 1.6, radius: 7, color: 0xffd060, lvl: 12 },
  fire_bolt: { name: 'Огненная стрела', key: '1', mp: 10, cd: 2.2, kind: 'dmg', school: 'm', mul: 2.2, range: 24, color: 0xff5010, cast: 0.8, lvl: 1 },
  heal: { name: 'Исцеление', key: '2', mp: 18, cd: 6, kind: 'heal', amount: 0.35, color: 0x60ff90, cast: 1.0, lvl: 3 },
  ice_nova: { name: 'Ледяная волна', key: '3', mp: 30, cd: 12, kind: 'aoe', school: 'm', mul: 1.8, radius: 9, color: 0x80d0ff, cast: 0.6, lvl: 10 },
  // умения профессий (с 20 уровня)
  shield_bash: { name: 'Удар щитом', mp: 20, cd: 9, kind: 'dmg', school: 'p', mul: 1.8, range: 3.5, stun: 2, needShield: true, color: 0xc0d0e0, lvl: 20 },
  iron_will: { name: 'Железная воля', mp: 30, cd: 60, kind: 'buff', stat: 'pdef', mul: 1.4, dur: 30, color: 0x90a0c0, lvl: 22 },
  frenzy: { name: 'Неистовство', mp: 25, cd: 60, kind: 'buff', stat: 'patk', mul: 1.5, dur: 15, color: 0xff3020, lvl: 20 },
  cleave: { name: 'Рассекающий удар', mp: 28, cd: 7, kind: 'dmg', school: 'p', mul: 3.2, range: 3.5, color: 0xff7040, lvl: 24 },
  lightning: { name: 'Цепная молния', mp: 34, cd: 5, kind: 'dmg', school: 'm', mul: 3.0, range: 26, color: 0xa0c0ff, cast: 1.2, lvl: 20 },
  meteor: { name: 'Метеор', mp: 60, cd: 18, kind: 'aoe', school: 'm', mul: 2.6, radius: 8, color: 0xff6020, cast: 1.8, lvl: 26 },
  heal_major: { name: 'Великое исцеление', mp: 40, cd: 10, kind: 'heal', amount: 0.7, color: 0x90ffb0, cast: 1.4, lvl: 20 },
  // копейщик
  wide_sweep: { name: 'Широкий взмах', mp: 26, cd: 8, kind: 'aoe', school: 'p', mul: 2.0, radius: 5.5, cone: 100, maxTargets: 4, needPolearm: true, color: 0xffc070, lvl: 20 },
  lunge: { name: 'Выпад', mp: 22, cd: 6, kind: 'dmg', school: 'p', mul: 2.9, range: 6, dash: true, needPolearm: true, color: 0xffe0a0, lvl: 22 },
  // лучник (профессия воина)
  aimed_shot: { name: 'Прицельный выстрел', mp: 16, cd: 5, kind: 'dmg', school: 'p', mul: 2.3, range: 22, needBow: true, color: 0xe0d070, lvl: 20 },
  swift_feet: { name: 'Быстрые ноги', mp: 20, cd: 45, kind: 'buff', stat: 'speed', mul: 1.25, dur: 20, color: 0x90e060, lvl: 20 },
  entangle_shot: { name: 'Опутывающая стрела', mp: 24, cd: 8, kind: 'dmg', school: 'p', mul: 2.0, range: 22, slow: { mul: 0.5, dur: 4 }, needBow: true, color: 0x60c060, lvl: 22 },
  arrow_rain: { name: 'Град стрел', mp: 32, cd: 11, kind: 'aoe', school: 'p', mul: 1.6, radius: 6, range: 22, around: 'target', needBow: true, color: 0xd0c080, lvl: 24 },
  // некромант: проклятия и кража жизни; скелет — второстепенное
  curse_weakness: { name: 'Проклятие слабости', mp: 28, cd: 20, kind: 'debuff', stat: 'patk', mul: 0.75, dur: 12, range: 22, cast: 0.8, color: 0x8040a0, lvl: 20 },
  blood_harvest: { name: 'Кровавая жатва', mp: 34, cd: 6, kind: 'dmg', school: 'm', mul: 2.6, drain: 0.3, range: 22, cast: 1.0, color: 0xc02040, lvl: 21 },
  curse_decay: { name: 'Проклятие тлена', mp: 30, cd: 10, kind: 'dot', school: 'm', dot: { mul: 2.4, dur: 12, tick: 2 }, range: 22, cast: 0.6, color: 0x608030, lvl: 22 },
  fear_shackles: { name: 'Оковы страха', mp: 26, cd: 18, kind: 'debuff', stat: 'speed', mul: 0.6, dur: 6, range: 20, cast: 0.5, color: 0x503070, lvl: 23 },
  raise_skeleton: { name: 'Поднять скелета', mp: 45, cd: 20, kind: 'summon', pet: 'skeleton_pet', cast: 2, color: 0xd8d4c0, lvl: 24 },
  life_steal: { name: 'Похищение жизни', mp: 38, cd: 9, kind: 'dmg', school: 'm', mul: 1.7, drain: 0.6, range: 20, cast: 1.2, color: 0xff3050, lvl: 26 },
  // друид: боевая магия, поддержка, звери
  nature_thorns: { name: 'Шипы природы', mp: 22, cd: 3, kind: 'dmg', school: 'm', mul: 2.5, range: 22, cast: 0.9, color: 0x70b040, lvl: 20 },
  renewal: { name: 'Обновление', mp: 30, cd: 12, kind: 'hot', hot: { amount: 0.04, dur: 10, tick: 1 }, target: 'ally', cast: 0.8, color: 0x80ff80, lvl: 21 },
  forest_gift: { name: 'Дар леса', mp: 40, cd: 90, kind: 'buff', stat: 'pdef', mul: 1.1, also: { maxHp: 1.12 }, dur: 60, target: 'party', cast: 1.0, color: 0xa0e070, lvl: 22 },
  call_wolf: { name: 'Зов волка', mp: 40, cd: 10, kind: 'summon', pet: 'wolf_pet', cast: 2, color: 0x909090, lvl: 23 },
  awaken_treant: { name: 'Пробуждение древня', mp: 70, cd: 30, kind: 'summon', pet: 'treant_pet', cast: 2, color: 0x4a7a3a, lvl: 28 },
  blessing: { name: 'Благословение', mp: 35, cd: 90, kind: 'buff', stat: 'mdef', mul: 1.35, dur: 60, color: 0xfff0a0, cast: 1.0, lvl: 22 },
};
// умение качается до maxLv; на каждый следующий уровень нужен уровень персонажа выше на SKILL_LV_STEP
export const SKILL_MAX_LV = 5;
export const SKILL_LV_STEP = 4;

// профессии: смена на PROF_LVL у наставника в городе; bonus — множители характеристик
export const PROF_LVL = 20;
export const PROFESSIONS = {
  knight: { name: 'Страж', base: 'warrior', desc: 'Щит и тяжёлая броня, держит удар', bonus: { maxHp: 1.15, pdef: 1.15 }, skills: ['shield_bash', 'iron_will'] },
  berserker: { name: 'Берсерк', base: 'warrior', desc: 'Максимум урона ценой защиты', bonus: { patk: 1.12, crit: 1.25, pdef: 0.95 }, skills: ['frenzy', 'cleave'] },
  sorcerer: { name: 'Чародей', base: 'mage', desc: 'Разрушительная магия', bonus: { matk: 1.15, cast: 1.1 }, skills: ['lightning', 'meteor'] },
  healer: { name: 'Целитель', base: 'mage', desc: 'Лечение и благословения', bonus: { maxMp: 1.2, mdef: 1.1 }, skills: ['heal_major', 'blessing'] },
  // polearmRange — прибавка к дальности с древковым оружием; дальность с луком задаёт сам лук (range)
  pikeman: { name: 'Копейщик', base: 'warrior', desc: 'Древковое оружие, бьёт нескольких перед собой', bonus: { patk: 1.08 }, polearmRange: 2, skills: ['wide_sweep', 'lunge'] },
  archer: { name: 'Лучник', base: 'warrior', desc: 'Лук и стрелы, бой издалека', bonus: { patk: 1.05, crit: 1.15, speed: 1.05, eva: 1.1, pdef: 0.9 }, skills: ['aimed_shot', 'swift_feet', 'entangle_shot', 'arrow_rain'] },
  necromancer: { name: 'Некромант', base: 'mage', desc: 'Проклятия и кража жизни', bonus: { matk: 1.06, maxHp: 1.05 }, skills: ['curse_weakness', 'blood_harvest', 'curse_decay', 'fear_shackles', 'raise_skeleton', 'life_steal'] },
  druid: { name: 'Друид', base: 'mage', desc: 'Магия природы, поддержка и звери-спутники', bonus: { matk: 1.05, maxHp: 1.08, mdef: 1.05 }, skills: ['nature_thorns', 'renewal', 'forest_gift', 'call_wolf', 'awaken_treant'] },
};

// грейды снаряжения
export const GRADES = { none: 'без грейда', d: 'D', c: 'C', b: 'B' };

// слоты куклы персонажа
export const SLOTS = [
  { id: 'ear1', name: 'Серьга', type: 'ear' }, { id: 'neck', name: 'Ожерелье', type: 'neck' }, { id: 'ear2', name: 'Серьга', type: 'ear' },
  { id: 'ring1', name: 'Кольцо', type: 'ring' }, { id: 'head', name: 'Шлем', type: 'head' }, { id: 'ring2', name: 'Кольцо', type: 'ring' },
  { id: 'weapon', name: 'Оружие', type: 'weapon' }, { id: 'armor', name: 'Доспех', type: 'armor' }, { id: 'shield', name: 'Щит', type: 'shield' },
  { id: 'gloves', name: 'Перчатки', type: 'gloves' }, { id: 'legs', name: 'Поножи', type: 'legs' }, { id: 'feet', name: 'Сапоги', type: 'feet' },
];

// w — вес, twoHand — занимает и щит, bow — лук (только профессия «Лучник», range — дальность), polearm — древковое (только воин), robe — мантия (не для воина), full — закрывает поножи, set — комплект
export const ITEMS = {
  // оружие
  sword_novice: { name: 'Меч новичка', slot: 'weapon', grade: 'none', patk: 6, price: 0, w: 3, color: 0xa0a0a0 },
  staff_novice: { name: 'Посох новичка', slot: 'weapon', grade: 'none', patk: 3, matk: 6, price: 0, w: 2, twoHand: true, color: 0x8a6030 },
  sword_long: { name: 'Длинный меч', slot: 'weapon', grade: 'd', patk: 18, price: 900, lvl: 8, w: 3.5, color: 0xc0c8d0 },
  staff_oak: { name: 'Дубовый жезл', slot: 'weapon', grade: 'd', patk: 7, matk: 17, price: 900, lvl: 8, w: 2, twoHand: true, color: 0x6a4020 },
  sword_crystal: { name: 'Кристальный клинок', slot: 'weapon', grade: 'c', patk: 38, price: 6500, lvl: 18, w: 3.5, color: 0x80e0ff },
  staff_crystal: { name: 'Кристальный посох', slot: 'weapon', grade: 'c', patk: 14, matk: 36, price: 6500, lvl: 18, w: 2.2, twoHand: true, color: 0x90a0ff },
  sword_dragon: { name: 'Клинок дракона', slot: 'weapon', grade: 'b', patk: 70, price: 0, lvl: 25, w: 4, color: 0xff6030, rare: true },
  // луки (только профессия «Лучник») и древковое (только воин)
  bow_novice: { name: 'Лук новичка', slot: 'weapon', grade: 'none', patk: 7, price: 0, w: 1.5, twoHand: true, bow: true, range: 20, color: 0x8a6a40 },
  bow_short: { name: 'Короткий лук', slot: 'weapon', grade: 'd', patk: 20, price: 950, lvl: 8, w: 1.8, twoHand: true, bow: true, range: 20, color: 0x9a7040 },
  bow_crystal: { name: 'Кристальный лук', slot: 'weapon', grade: 'c', patk: 42, price: 6800, lvl: 18, w: 2, twoHand: true, bow: true, range: 20, color: 0x80d0ff },
  spear_long: { name: 'Длинное копьё', slot: 'weapon', grade: 'd', patk: 21, price: 950, lvl: 8, w: 4.5, twoHand: true, polearm: true, color: 0xb0b8c0 },
  halberd_crystal: { name: 'Кристальная алебарда', slot: 'weapon', grade: 'c', patk: 44, price: 6800, lvl: 18, w: 5.5, twoHand: true, polearm: true, color: 0x80e0ff },
  // щиты
  shield_wood: { name: 'Дощатый щит', slot: 'shield', grade: 'd', pdef: 12, price: 400, lvl: 8, w: 4, color: 0x8a6030 },
  shield_iron: { name: 'Железный щит', slot: 'shield', grade: 'c', pdef: 26, price: 2600, lvl: 18, w: 6, color: 0x9098a8 },
  // без грейда
  armor_cloth: { name: 'Холщовая рубаха', slot: 'armor', grade: 'none', pdef: 6, mdef: 4, price: 0, w: 2, color: 0x9a8a6a },
  legs_cloth: { name: 'Холщовые штаны', slot: 'legs', grade: 'none', pdef: 3, price: 0, w: 1.5, color: 0x6a5a40 },
  // D: кожаный (тяжёлый)
  helm_leather: { name: 'Кожаный шлем', slot: 'head', grade: 'd', pdef: 7, price: 350, lvl: 8, w: 1.5, set: 'leather', color: 0x7a4a2a },
  armor_leather: { name: 'Кожаный доспех', slot: 'armor', grade: 'd', pdef: 20, mdef: 4, price: 800, lvl: 8, w: 6, set: 'leather', color: 0x7a4a2a },
  legs_leather: { name: 'Кожаные поножи', slot: 'legs', grade: 'd', pdef: 11, price: 500, lvl: 8, w: 3, set: 'leather', color: 0x6a3e22 },
  gloves_leather: { name: 'Кожаные перчатки', slot: 'gloves', grade: 'd', pdef: 4, price: 250, lvl: 8, w: 0.8, set: 'leather', color: 0x7a4a2a },
  boots_leather: { name: 'Кожаные сапоги', slot: 'feet', grade: 'd', pdef: 4, price: 250, lvl: 8, w: 1, set: 'leather', color: 0x5a3a20 },
  // D: ученическая мантия (лёгкая)
  hat_apprentice: { name: 'Ученический капюшон', slot: 'head', grade: 'd', pdef: 4, mdef: 5, price: 350, lvl: 8, w: 0.5, set: 'apprentice', color: 0x3a6a8a },
  robe_apprentice: { name: 'Ученическая мантия', slot: 'armor', grade: 'd', pdef: 18, mdef: 12, mp: 30, price: 1100, lvl: 8, w: 3, robe: true, full: true, set: 'apprentice', color: 0x3a6a8a },
  gloves_apprentice: { name: 'Ученические перчатки', slot: 'gloves', grade: 'd', pdef: 3, mdef: 2, price: 250, lvl: 8, w: 0.4, set: 'apprentice', color: 0x2a4a6a },
  boots_apprentice: { name: 'Ученические туфли', slot: 'feet', grade: 'd', pdef: 3, mdef: 2, price: 250, lvl: 8, w: 0.6, set: 'apprentice', color: 0x2a4a6a },
  // C: кольчужный (тяжёлый)
  helm_chain: { name: 'Кольчужный шлем', slot: 'head', grade: 'c', pdef: 15, price: 2200, lvl: 18, w: 2.5, set: 'chain', color: 0x8090a0 },
  armor_chain: { name: 'Кольчуга', slot: 'armor', grade: 'c', pdef: 42, mdef: 8, price: 5500, lvl: 18, w: 9, set: 'chain', color: 0x8090a0 },
  legs_chain: { name: 'Кольчужные поножи', slot: 'legs', grade: 'c', pdef: 24, price: 3300, lvl: 18, w: 5, set: 'chain', color: 0x707e8e },
  gloves_chain: { name: 'Латные перчатки', slot: 'gloves', grade: 'c', pdef: 9, price: 1600, lvl: 18, w: 1.4, set: 'chain', color: 0x8090a0 },
  boots_chain: { name: 'Латные сапоги', slot: 'feet', grade: 'c', pdef: 9, price: 1600, lvl: 18, w: 2, set: 'chain', color: 0x606c7a },
  // C: мистическая мантия
  hat_mystic: { name: 'Мистическая шляпа', slot: 'head', grade: 'c', pdef: 9, mdef: 10, price: 2200, lvl: 18, w: 0.8, set: 'mystic', color: 0x5040a0 },
  robe_mystic: { name: 'Мистическая мантия', slot: 'armor', grade: 'c', pdef: 38, mdef: 30, mp: 70, price: 7500, lvl: 18, w: 4, robe: true, full: true, set: 'mystic', color: 0x5040a0 },
  gloves_mystic: { name: 'Мистические перчатки', slot: 'gloves', grade: 'c', pdef: 6, mdef: 5, price: 1600, lvl: 18, w: 0.5, set: 'mystic', color: 0x40308a },
  boots_mystic: { name: 'Мистические туфли', slot: 'feet', grade: 'c', pdef: 6, mdef: 5, price: 1600, lvl: 18, w: 0.8, set: 'mystic', color: 0x40308a },
  // B: костяной (добыча с босса)
  helm_bone: { name: 'Костяной шлем', slot: 'head', grade: 'b', pdef: 26, price: 0, lvl: 25, w: 3, set: 'bone', color: 0xe0dcc0, rare: true },
  armor_bone: { name: 'Костяной доспех', slot: 'armor', grade: 'b', pdef: 70, mdef: 20, price: 0, lvl: 25, w: 10, set: 'bone', color: 0xe0dcc0, rare: true },
  legs_bone: { name: 'Костяные поножи', slot: 'legs', grade: 'b', pdef: 40, price: 0, lvl: 25, w: 6, set: 'bone', color: 0xd0cab0, rare: true },
  gloves_bone: { name: 'Костяные перчатки', slot: 'gloves', grade: 'b', pdef: 15, price: 0, lvl: 25, w: 1.6, set: 'bone', color: 0xe0dcc0, rare: true },
  boots_bone: { name: 'Костяные сапоги', slot: 'feet', grade: 'b', pdef: 15, price: 0, lvl: 25, w: 2.2, set: 'bone', color: 0xc8c2a8, rare: true },
  // украшения
  ear_bronze: { name: 'Бронзовая серьга', slot: 'ear', grade: 'd', mdef: 7, mp: 10, price: 300, lvl: 8, w: 0.1, color: 0xc08040 },
  neck_bronze: { name: 'Бронзовое ожерелье', slot: 'neck', grade: 'd', mdef: 10, price: 400, lvl: 8, w: 0.1, color: 0xc08040 },
  ring_bronze: { name: 'Бронзовое кольцо', slot: 'ring', grade: 'd', mdef: 5, price: 250, lvl: 8, w: 0.1, color: 0xc08040 },
  ear_silver: { name: 'Серебряная серьга', slot: 'ear', grade: 'c', mdef: 16, mp: 25, price: 2200, lvl: 18, w: 0.1, color: 0xd0d8e0 },
  neck_silver: { name: 'Серебряное ожерелье', slot: 'neck', grade: 'c', mdef: 22, price: 3000, lvl: 18, w: 0.1, color: 0xd0d8e0 },
  ring_silver: { name: 'Серебряное кольцо', slot: 'ring', grade: 'c', mdef: 12, crit: 0.01, price: 1800, lvl: 18, w: 0.1, color: 0xd0d8e0 },
  ear_lich: { name: 'Серьга Короля-лича', slot: 'ear', grade: 'b', mdef: 32, mp: 80, price: 0, lvl: 25, w: 0.1, color: 0xb070ff, rare: true },
  // расходники
  potion_hp: { name: 'Зелье здоровья', use: 'hp', amount: 120, price: 30, stack: true, w: 0.05, color: 0xff3040 },
  potion_mp: { name: 'Зелье маны', use: 'mp', amount: 80, price: 45, stack: true, w: 0.05, color: 0x3060ff },
  scroll_escape: { name: 'Свиток возврата', use: 'escape', price: 120, stack: true, w: 0.05, color: 0xe0d080 },
  scroll_ench_w: { name: 'Свиток усиления оружия', use: 'ench', ench: 'w', price: 1500, stack: true, w: 0.05, color: 0xff9040 },
  scroll_ench_a: { name: 'Свиток усиления брони', use: 'ench', ench: 'a', price: 400, stack: true, w: 0.05, color: 0x60c0ff },
  // заряды: расходуются за удар/заклинание, грейд — как у оружия
  shot_none: { name: 'Заряд духа (без грейда)', use: 'shot', school: 'p', grade: 'none', price: 3, stack: true, w: 0.01, color: 0xe0e0a0 },
  shot_d: { name: 'Заряд духа (D)', use: 'shot', school: 'p', grade: 'd', price: 8, stack: true, w: 0.01, color: 0xffe080 },
  shot_c: { name: 'Заряд духа (C)', use: 'shot', school: 'p', grade: 'c', price: 20, stack: true, w: 0.01, color: 0xffc040 },
  spirit_none: { name: 'Заряд магии (без грейда)', use: 'shot', school: 'm', grade: 'none', price: 5, stack: true, w: 0.01, color: 0xa0c0e0 },
  spirit_d: { name: 'Заряд магии (D)', use: 'shot', school: 'm', grade: 'd', price: 14, stack: true, w: 0.01, color: 0x80b0ff },
  spirit_c: { name: 'Заряд магии (C)', use: 'shot', school: 'm', grade: 'c', price: 35, stack: true, w: 0.01, color: 0x6080ff },
  // стрелы: 1 за выстрел из лука, грейд — как у лука
  arrow_none: { name: 'Стрелы (без грейда)', use: 'arrow', grade: 'none', price: 1, stack: true, w: 0.01, color: 0xc0a070 },
  arrow_d: { name: 'Стрелы (D)', use: 'arrow', grade: 'd', price: 3, stack: true, w: 0.01, color: 0xd0b080 },
  arrow_c: { name: 'Стрелы (C)', use: 'arrow', grade: 'c', price: 8, stack: true, w: 0.01, color: 0x90d0ff },
  // ресурсы с мобов (mat): пока продаются торговцу, дальше — ремёсла; rarity — цвет подсветки на земле (иначе по грейду)
  bone: { name: 'Кость', price: 8, stack: true, loot: true, mat: true, w: 0.2, color: 0xeeeedd },
  pelt: { name: 'Шкура', price: 14, stack: true, loot: true, mat: true, w: 0.3, color: 0x8a6a4a },
  crystal: { name: 'Кристалл', price: 60, stack: true, loot: true, mat: true, rarity: 'uncommon', w: 0.1, color: 0x90e0ff },
  ectoplasm: { name: 'Эктоплазма', price: 90, stack: true, loot: true, mat: true, rarity: 'uncommon', w: 0.1, color: 0x90ffb0 },
  hide_thick: { name: 'Толстая шкура', price: 32, stack: true, loot: true, mat: true, w: 0.4, color: 0x5a3a22 },
  fang: { name: 'Клык', price: 24, stack: true, loot: true, mat: true, w: 0.05, color: 0xf0e8d0 },
  silk: { name: 'Паучий шёлк', price: 45, stack: true, loot: true, mat: true, w: 0.05, color: 0xe8e8f8 },
  chitin: { name: 'Хитин', price: 80, stack: true, loot: true, mat: true, w: 0.2, color: 0xb08a40 },
  golem_heart: { name: 'Сердце голема', price: 450, stack: true, loot: true, mat: true, rarity: 'rare', w: 0.5, color: 0xff8030 },
  orc_totem: { name: 'Орочий тотем', price: 140, stack: true, loot: true, mat: true, rarity: 'uncommon', w: 0.3, color: 0xc05030 },
  lich_dust: { name: 'Прах лича', price: 1200, stack: true, loot: true, mat: true, rarity: 'epic', w: 0.05, color: 0xb070ff },
  soul_shard: { name: 'Осколок души', price: 180, stack: true, loot: true, mat: true, rarity: 'rare', w: 0.02, color: 0x70e0ff },
  // мусор на продажу (junk) — доход низких уровней
  broken_sword: { name: 'Сломанный меч', price: 38, stack: true, loot: true, junk: true, w: 1.5, color: 0x8a8a8a },
  orc_amulet: { name: 'Орочий амулет', price: 95, stack: true, loot: true, junk: true, w: 0.1, color: 0xb08a40 },
};

// комплекты: бонус, когда надеты все части
export const SETS = {
  leather: { name: 'Кожаный комплект', parts: ['helm_leather', 'armor_leather', 'legs_leather', 'gloves_leather', 'boots_leather'], bonus: { hp: 80, pdef: 10 } },
  apprentice: { name: 'Ученический комплект', parts: ['hat_apprentice', 'robe_apprentice', 'gloves_apprentice', 'boots_apprentice'], bonus: { mp: 60, matk: 5 } },
  chain: { name: 'Кольчужный комплект', parts: ['helm_chain', 'armor_chain', 'legs_chain', 'gloves_chain', 'boots_chain'], bonus: { hp: 220, pdef: 25, speed: -1 } },
  mystic: { name: 'Мистический комплект', parts: ['hat_mystic', 'robe_mystic', 'gloves_mystic', 'boots_mystic'], bonus: { mp: 150, matk: 14, cast: 0.1 } },
  bone: { name: 'Костяной комплект', parts: ['helm_bone', 'armor_bone', 'legs_bone', 'gloves_bone', 'boots_bone'], bonus: { hp: 400, pdef: 40, crit: 0.03 } },
};

// мобы: shape — вид (для процедурной модели)
// добыча: coins [мин, макс]; mats — ресурсы [id, шанс, мин, макс]; loot — одна вещь из группы по весам { chance, items: [[id, вес]] }
// (или массив групп — у боссов); noLoot — ничего не роняет. Правила розыгрыша — src/loot.js
const BONE_LOOT = [['armor_bone', 1], ['helm_bone', 1], ['legs_bone', 1], ['gloves_bone', 1], ['boots_bone', 1], ['sword_dragon', 1], ['ear_lich', 1]];
export const MOBS = {
  hill_guardian: { name: 'Страж руин', lvl: 12, hp: 470, patk: 32, pdef: 85, xp: 285, coins: [28, 55], shape: 'golem', color: 0x8b9c81, size: 1.65, reach: 1.4, stun: { chance: 0.1, sec: 1 }, mats: [['crystal', 0.4]], loot: { chance: 0.18, items: [['potion_hp', 60], ['scroll_ench_a', 20], ['shield_iron', 20]] } },
  bog_wisp: { name: 'Болотный огонёк', lvl: 15, hp: 410, patk: 38, pdef: 55, xp: 350, coins: [30, 65], shape: 'elemental', variant: 'bog', color: 0x60cda0, size: 0.85, flying: true, aggro: true, ranged: { color: 0x70ffc0, orb: true, school: 'm', min: 7, max: 12, cd: 2.6 }, mats: [['ectoplasm', 0.4]], loot: { chance: 0.22, items: [['potion_mp', 70], ['ear_bronze', 20], ['scroll_escape', 10]] } },
  marsh_witch: { name: 'Болотная ведунья', lvl: 18, hp: 680, patk: 49, pdef: 80, xp: 490, coins: [45, 90], shape: 'cultist', color: 0x59836b, size: 1.1, aggro: true, ranged: { color: 0x93cc50, orb: true, school: 'm', min: 8, max: 14, cd: 2.8 }, abil: [{ kind: 'raise', cd: 14, first: 5, mob: 'risen_skeleton', n: 1, max: 2, color: 0x93cc50 }], mats: [['ectoplasm', 0.45], ['bone', 0.3]], loot: { chance: 0.28, items: [['potion_mp', 45], ['scroll_ench_a', 25], ['hat_mystic', 15], ['gloves_mystic', 15]] } },
  rabbit: { name: 'Полевой кролик', lvl: 1, hp: 40, patk: 5, pdef: 20, xp: 18, coins: [2, 6], shape: 'critter', color: 0xd0c0a0, size: 0.8, mats: [['pelt', 0.45]], loot: { chance: 0.18, items: [['potion_hp', 90], ['boots_leather', 10]] } },
  wolf: { name: 'Серый волк', lvl: 3, hp: 85, patk: 10, pdef: 28, xp: 45, coins: [5, 12], shape: 'beast', color: 0x707070, size: 1.1, social: true, mats: [['pelt', 0.6, 1, 2], ['fang', 0.25]], loot: { chance: 0.22, items: [['potion_hp', 65], ['potion_mp', 20], ['gloves_leather', 10], ['ring_bronze', 5]] } },
  goblin: { name: 'Гоблин-разведчик', lvl: 5, hp: 130, patk: 15, pdef: 34, xp: 80, coins: [10, 22], shape: 'humanoid', color: 0x4a8a3a, size: 0.9, social: true, mats: [['bone', 0.3]], loot: { chance: 0.22, items: [['potion_hp', 60], ['broken_sword', 30], ['ring_bronze', 10]] } },
  goblin_archer: { name: 'Гоблин-лучник', lvl: 7, hp: 115, patk: 18, pdef: 28, xp: 115, coins: [12, 26], shape: 'humanoid', color: 0x6a8a2a, size: 0.9, social: true, fam: 'goblin', ranged: { color: 0xd0a050 }, mats: [['bone', 0.25]], loot: { chance: 0.22, items: [['potion_hp', 55], ['broken_sword', 35], ['gloves_leather', 10]] } },
  boar: { name: 'Дикий кабан', lvl: 8, hp: 210, patk: 22, pdef: 45, xp: 140, coins: [15, 30], shape: 'beast', color: 0x6a4a30, size: 1.4, mats: [['pelt', 0.6, 1, 2], ['hide_thick', 0.2]], loot: { chance: 0.06, items: [['boots_leather', 1], ['gloves_apprentice', 1]] } },
  treant: { name: 'Древень', lvl: 11, hp: 380, patk: 30, pdef: 70, xp: 240, coins: [25, 50], shape: 'tree', color: 0x3a5a2a, size: 1.8, mats: [['crystal', 0.1]], loot: { chance: 0.07, items: [['hat_apprentice', 55], ['ear_bronze', 45]] } },
  orc: { name: 'Орк-воитель', lvl: 14, hp: 520, patk: 42, pdef: 80, xp: 360, coins: [40, 80], shape: 'humanoid', color: 0x3a6a4a, size: 1.4, aggro: true, social: true, mats: [['bone', 0.4, 1, 2]], loot: { chance: 0.3, items: [['potion_hp', 55], ['orc_amulet', 25], ['helm_leather', 10], ['scroll_ench_a', 10]] } },
  spider: { name: 'Пещерный паук', lvl: 16, hp: 600, patk: 50, pdef: 85, xp: 430, coins: [45, 90], shape: 'spider', color: 0x3a2a3a, size: 1.3, aggro: true, mats: [['silk', 0.5, 1, 2], ['crystal', 0.15]], loot: { chance: 0.03, items: [['neck_bronze', 1]] } },
  scorpion: { name: 'Песчаный скорпион', lvl: 19, hp: 820, patk: 60, pdef: 110, xp: 600, coins: [60, 120], shape: 'spider', color: 0xb08040, size: 1.5, mats: [['chitin', 0.45], ['crystal', 0.2]], loot: { chance: 0.03, items: [['gloves_chain', 70], ['legs_chain', 30]] } },
  golem: { name: 'Каменный голем', lvl: 23, hp: 1400, patk: 78, pdef: 160, xp: 950, coins: [90, 170], shape: 'golem', color: 0x8a7a6a, size: 2.2, stun: { chance: 0.12, sec: 1.5 }, mats: [['crystal', 0.35, 1, 2], ['golem_heart', 0.03]], loot: { chance: 0.06, items: [['scroll_ench_w', 1], ['boots_chain', 1]] } },
  skeleton: { name: 'Скелет-страж', lvl: 18, hp: 700, patk: 56, pdef: 95, xp: 520, coins: [55, 100], shape: 'humanoid', color: 0xe0dcc8, size: 1.1, aggro: true, social: true, mats: [['bone', 0.8, 1, 2]], loot: { chance: 0.18, items: [['potion_mp', 55], ['scroll_ench_a', 22], ['broken_sword', 23]] } },
  skeleton_archer: { name: 'Скелет-лучник', lvl: 20, hp: 640, patk: 60, pdef: 85, xp: 600, coins: [60, 110], shape: 'humanoid', color: 0xe0dcc8, size: 1.05, aggro: true, social: true, fam: 'skeleton', ranged: { color: 0xc8d8ff }, mats: [['bone', 0.7]], loot: { chance: 0.2, items: [['potion_mp', 60], ['scroll_ench_a', 20], ['broken_sword', 20]] } },
  ghoul: { name: 'Упырь', lvl: 21, hp: 950, patk: 68, pdef: 120, xp: 720, coins: [70, 140], shape: 'humanoid', color: 0x6a8a6a, size: 1.2, aggro: true, mats: [['ectoplasm', 0.25]], loot: { chance: 0.05, items: [['ring_silver', 40], ['broken_sword', 60]] } },
  wraith: { name: 'Призрак', lvl: 24, hp: 1100, patk: 80, pdef: 130, xp: 900, coins: [90, 160], shape: 'ghost', color: 0x90ffd0, size: 1.3, aggro: true, mats: [['ectoplasm', 0.5]], loot: { chance: 0.06, items: [['scroll_ench_w', 65], ['hat_mystic', 35]] } },
  // ---- волна 2: новые виды ----
  // flying — летает (модель над землёй), speed — множитель бега, reach — прибавка к дальности удара, burrow — зарыт до сближения
  // ranged: orb — магическая сфера (school 'm'), knife — метательный нож; abil — способности (правила в src/combat.js)
  wild_bee: { name: 'Дикая пчела', lvl: 4, hp: 55, patk: 11, pdef: 20, xp: 55, coins: [3, 9], shape: 'bee', color: 0xe0b020, size: 1, flying: true, speed: 1.5, social: true, loot: { chance: 0.1, items: [['potion_hp', 1]] } },
  bandit: { name: 'Разбойник', lvl: 8, hp: 190, patk: 20, pdef: 38, xp: 150, coins: [18, 40], shape: 'bandit', color: 0x6a2a2a, size: 1, ranged: { color: 0xc8d0d8, knife: true, min: 7, max: 12, cd: 1.9 }, loot: { chance: 0.35, items: [['broken_sword', 50], ['potion_hp', 28], ['scroll_escape', 8], ['gloves_leather', 7], ['boots_leather', 7]] } },
  bat: { name: 'Летучая мышь', lvl: 11, hp: 200, patk: 24, pdef: 40, xp: 170, coins: [8, 18], shape: 'bat', color: 0x3a3040, size: 1.15, flying: true, speed: 1.4, aggro: true, social: true, mats: [['fang', 0.2]] },
  dryad: { name: 'Дриада', lvl: 13, hp: 420, patk: 30, pdef: 60, xp: 330, coins: [30, 60], shape: 'dryad', color: 0x5aa050, size: 1.05, ranged: { color: 0x80ff70, orb: true, school: 'm', min: 10, max: 15, cd: 2.6 },
    abil: [{ kind: 'heal', cd: 7, r: 16, amount: 0.25, any: true, color: 0x80ff90 }], mats: [['crystal', 0.15]], loot: { chance: 0.08, items: [['hat_apprentice', 40], ['robe_apprentice', 20], ['ear_bronze', 40]] } },
  bear: { name: 'Бурый медведь', lvl: 15, hp: 950, patk: 46, pdef: 95, xp: 560, coins: [40, 90], shape: 'bear', color: 0x5a3a22, size: 1.6, stun: { chance: 0.15, sec: 1.2 }, mats: [['hide_thick', 0.7, 1, 2], ['fang', 0.5, 1, 2]], loot: { chance: 0.03, items: [['armor_leather', 1]] } },
  orc_shaman: { name: 'Орк-шаман', lvl: 17, hp: 520, patk: 40, pdef: 70, xp: 420, coins: [40, 85], shape: 'orc', variant: 'shaman', color: 0x4a7a4a, size: 1.2, aggro: true, social: true, fam: 'orc',
    ranged: { color: 0x70ffd0, orb: true, school: 'm', min: 9, max: 14, cd: 2.8 },
    abil: [{ kind: 'heal', cd: 8, r: 14, amount: 0.22, color: 0x70ffb0 }, { kind: 'buff', cd: 14, first: 1.5, r: 12, mul: 1.25, dur: 10, color: 0xff5030, name: 'Боевой тотем' }], mats: [['orc_totem', 0.12], ['bone', 0.3]], loot: { chance: 0.25, items: [['potion_mp', 50], ['orc_amulet', 35], ['scroll_ench_a', 10], ['hat_mystic', 5]] } },
  sandworm: { name: 'Песчаный червь', lvl: 21, hp: 1100, patk: 70, pdef: 120, xp: 780, coins: [70, 140], shape: 'worm', color: 0xb89060, size: 1.4, aggro: true, burrow: true, reach: 1.5, speed: 1.1, mats: [['chitin', 0.5, 1, 2], ['crystal', 0.15]], loot: { chance: 0.03, items: [['legs_chain', 1]] } },
  lizard_spear: { name: 'Ящер-копейщик', lvl: 20, hp: 880, patk: 64, pdef: 110, xp: 650, coins: [60, 120], shape: 'lizard', color: 0x6a8a3a, size: 1.15, social: true, reach: 1.8, mats: [['fang', 0.4], ['hide_thick', 0.25]], loot: { chance: 0.06, items: [['helm_chain', 45], ['halberd_crystal', 10], ['broken_sword', 45]] } },
  fire_elemental: { name: 'Огненный элементаль', lvl: 24, hp: 1150, patk: 76, pdef: 120, xp: 920, coins: [80, 160], shape: 'elemental', color: 0xff6a20, size: 1.3, aggro: true, flying: true,
    abil: [{ kind: 'fire', cd: 7, first: 2, r: 3.2, dur: 3, tick: 0.5, mul: 0.3, delay: 0.6, color: 0xff5010 }], mats: [['crystal', 0.4, 1, 2]], loot: { chance: 0.05, items: [['scroll_ench_w', 50], ['ear_silver', 35], ['staff_crystal', 15]] } },
  cultist: { name: 'Культист-некромант', lvl: 22, hp: 900, patk: 66, pdef: 100, xp: 800, coins: [80, 150], shape: 'cultist', color: 0x3a2050, size: 1.1, aggro: true,
    ranged: { color: 0xb060ff, orb: true, school: 'm', min: 10, max: 15, cd: 2.6 },
    abil: [{ kind: 'raise', cd: 14, first: 1, mob: 'risen_skeleton', n: 2, max: 3, color: 0x9050ff }], mats: [['ectoplasm', 0.3]], loot: { chance: 0.08, items: [['gloves_mystic', 30], ['boots_mystic', 30], ['scroll_ench_a', 25], ['robe_mystic', 15]] } },
  risen_skeleton: { name: 'Поднятый скелет', lvl: 18, hp: 320, patk: 44, pdef: 70, xp: 60, coins: [0, 0], shape: 'humanoid', color: 0xe0dcc8, size: 0.95, aggro: true, noLoot: true },
  giant_rat: { name: 'Гигантская крыса', lvl: 18, hp: 540, patk: 50, pdef: 80, xp: 400, coins: [25, 55], shape: 'rat', color: 0x6a5a50, size: 1.15, aggro: true, social: true, speed: 1.25, mats: [['pelt', 0.5], ['fang', 0.25]], loot: { chance: 0.12, items: [['potion_hp', 60], ['broken_sword', 40]] } },
  // лагерь орков: стаи под площадные умения — здоровья и опыта меньше, чем у одиночек того же уровня
  orc_warrior: { name: 'Орк-воин', lvl: 19, hp: 640, patk: 58, pdef: 95, xp: 420, coins: [45, 90], shape: 'orc', variant: 'warrior', color: 0x4a7a3a, size: 1.35, aggro: true, social: true, fam: 'orc', mats: [['bone', 0.35], ['fang', 0.15]], loot: { chance: 0.2, items: [['orc_amulet', 45], ['broken_sword', 30], ['scroll_ench_a', 16], ['helm_chain', 6], ['armor_chain', 3]] } },
  orc_archer: { name: 'Орк-лучник', lvl: 18, hp: 520, patk: 54, pdef: 80, xp: 380, coins: [40, 85], shape: 'orc', variant: 'archer', color: 0x5a7a3a, size: 1.25, aggro: true, social: true, fam: 'orc', ranged: { color: 0x806040 }, mats: [['bone', 0.3]], loot: { chance: 0.2, items: [['orc_amulet', 45], ['potion_hp', 35], ['gloves_chain', 7], ['bow_crystal', 3]] } },
  orc_chief: { name: 'Вождь Клыкастых', lvl: 25, hp: 2200, patk: 84, pdef: 150, xp: 1500, coins: [150, 300], shape: 'orc', variant: 'chief', color: 0x3a6a30, size: 1.55, aggro: true, social: true, fam: 'orc', stun: { chance: 0.12, sec: 1.2 },
    abil: [{ kind: 'buff', cd: 18, first: 1, r: 16, mul: 1.3, dur: 12, color: 0xff3020, name: 'Клич вождя' }], mats: [['orc_totem', 1, 1, 2], ['hide_thick', 0.6, 1, 3]], loot: [{ chance: 1, items: [['armor_chain', 20], ['helm_chain', 20], ['halberd_crystal', 15], ['sword_crystal', 15], ['neck_silver', 15], ['ring_silver', 15]] }, { chance: 0.4, items: [['scroll_ench_w', 1]] }] },
  lich: { name: 'Король-лич', lvl: 28, hp: 9000, patk: 120, pdef: 200, xp: 9000, coins: [1500, 2500], shape: 'humanoid', color: 0x8040c0, size: 2.6, aggro: true, boss: true, respawn: 300, mats: [['ectoplasm', 1, 2, 4], ['lich_dust', 1, 1, 2]], loot: [{ chance: 1, items: BONE_LOOT }, { chance: 0.6, items: BONE_LOOT }, { chance: 0.5, items: [['scroll_ench_w', 1]] }] },
};

// боссы: фазы по доле здоровья (from — фаза начинается, когда HP ниже этой доли), умения по таймерам
// volley — снаряды в цель, doom — круг на земле (телеграф delay с), prison — оглушение дальнего игрока
export const BOSS = {
  lich: {
    hateHeal: 0.5, // лечение даёт половину ненависти от вылеченного
    phases: [
      { from: 1, title: 'Пробуждение', name: 'Король-лич пробуждается', volley: { cd: 7, first: 2.5, n: 3, mul: 0.7, color: 0x9050ff } },
      { from: 0.7, title: 'Призыв', name: 'Мёртвые, восстаньте!', summon: { mob: 'skeleton', n: 3 }, doom: { cd: 10, first: 2, r: 6, delay: 1.5, mul: 2.5 } },
      { from: 0.35, title: 'Ярость', name: 'Король-лич впадает в ярость!', aspd: 1.5, prison: { cd: 11, first: 1.5, r: 2.8, delay: 1.2, sec: 1.5 } },
    ],
  },
};
// торговцы
export const SHOP = [
  'potion_hp', 'potion_mp', 'scroll_escape', 'scroll_ench_a', 'scroll_ench_w',
  'shot_none', 'shot_d', 'shot_c', 'spirit_none', 'spirit_d', 'spirit_c', 'arrow_none', 'arrow_d', 'arrow_c',
  'bow_short', 'spear_long', 'bow_crystal', 'halberd_crystal',
  'sword_long', 'staff_oak', 'shield_wood', 'helm_leather', 'armor_leather', 'legs_leather', 'gloves_leather', 'boots_leather',
  'hat_apprentice', 'robe_apprentice', 'gloves_apprentice', 'boots_apprentice', 'ear_bronze', 'neck_bronze', 'ring_bronze',
  'sword_crystal', 'staff_crystal', 'shield_iron', 'helm_chain', 'armor_chain', 'legs_chain', 'gloves_chain', 'boots_chain',
  'hat_mystic', 'robe_mystic', 'gloves_mystic', 'boots_mystic', 'ear_silver', 'neck_silver', 'ring_silver',
];

for (const table of [ITEMS, SKILLS]) for (const [id, item] of Object.entries(table)) item.id = id;
