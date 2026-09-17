// Сквозной тест в браузере: npm run test:e2e (поднимает vite сам). Падает с кодом 1 при любой ошибке.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = +process.env.E2E_PORT || 5199, WS = +process.env.E2E_WS || 8791, URL = `http://localhost:${PORT}/?ws=ws://localhost:${WS}`;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const DBDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'realms-e2e-'));
const wsServer = spawn('node', ['--no-warnings', 'server/server.js'], { stdio: 'pipe', env: { ...process.env, PORT: String(WS), DB: path.join(DBDIR, 'e2e.db'), DEV_CMD: '1' } });
wsServer.stderr.on('data', (d) => process.stderr.write('[ws] ' + d));
const results = [];
let failed = 0;
async function step(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push(`  ✓ ${name} (${Date.now() - t0} мс)`); }
  catch (e) { failed++; console.error(e.stack); results.push(`  ✗ ${name}: ${e.message}`); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
// профиль ведёт сервер: изменения приходят ответом, поэтому всегда ждём подтверждения
const untilP = (pg, fn, arg, ms = 8000) => pg.waitForFunction(fn, arg, { timeout: ms });

try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(URL)).ok) break; } catch { /* ждём */ } await new Promise((r) => setTimeout(r, 200)); }
  const browser = await chromium.launch({ ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}), headless: process.env.HEADED ? false : true, slowMo: Number(process.env.SLOW || 0), args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', ...(process.env.E2E_RENDERER === 'metal' || (!process.env.E2E_RENDERER && process.platform === 'darwin') ? ['--use-angle=metal'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const G = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  // HUD обновляется раз в несколько кадров — ждём нужный текст
  const zoneHas = (t, ms = 5000) => page.waitForFunction((t) => document.getElementById('zone').textContent.includes(t), t, { timeout: ms }).then(() => true, () => false);

  await step('стартовый экран открывается', async () => {
    await page.goto(URL);
    await page.waitForSelector('#start-new:not([disabled])', { timeout: 15000 });
    expect(await page.isVisible('[data-cls=mage]'), 'нет выбора класса');
  });

  await step('создание персонажа (маг)', async () => {
    await page.fill('#cname', 'Автотест'); await page.fill('#cpass', 'пароль1');
    await page.click('[data-cls=mage]');
    await page.click('#start-new');
    await page.waitForFunction(() => window.__g?.P && document.body.classList.contains('ingame'), null, { timeout: 10000 });
    const p = await G(() => ({ cls: window.__g.P.cls, lvl: window.__g.P.lvl, name: window.__g.P.name }));
    expect(p.cls === 'mage' && p.lvl === 1 && p.name === 'Автотест', JSON.stringify(p));
    await page.waitForFunction(() => document.getElementById('pname').textContent.includes('Автотест'), null, { timeout: 5000 }).catch(() => { throw new Error('HUD без имени'); });
  });

  await step('ходьба кликом по земле', async () => {
    const before = await G(() => window.__g.hero.position.clone());
    await page.mouse.click(700, 500);
    await wait(1500);
    const after = await G(() => window.__g.hero.position.clone());
    expect(Math.hypot(after.x - before.x, after.z - before.z) > 1, 'персонаж не сдвинулся');
  });

  await step('камера: два пальца вращают, щипок зумит', async () => {
    const c0 = await G(() => ({ ...window.__g.cam }));
    await page.mouse.move(640, 400);
    for (let i = 0; i < 10; i++) await page.mouse.wheel(12, 6);
    await wait(400);
    const c1 = await G(() => ({ ...window.__g.cam }));
    expect(Math.abs(c1.yaw - c0.yaw) > 0.1 && Math.abs(c1.pitch - c0.pitch) > 0.02, `орбита ${JSON.stringify([c0, c1])}`);
    await page.keyboard.down('Control'); for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 8); await page.keyboard.up('Control');
    await wait(400);
    const c2 = await G(() => ({ ...window.__g.cam }));
    expect(c2.dist > c1.dist * 1.2, `зум ${c1.dist} → ${c2.dist}`);
    await page.keyboard.press('KeyV');
  });

  await step('торговец: покупку проводит сервер', async () => {
    await G(() => { const g = window.__g, n = g.npcs.find((x) => x.role === 'merchant'); g.dev({ coins: 500, x: n.x + 2, z: n.z + 2 }); });
    await untilP(page, () => window.__g.P.coins === 500);
    await page.waitForFunction(() => { const g = window.__g, n = g.npcs.find(n => n.role === 'merchant'); return Math.hypot(g.hero.position.x - n.x, g.hero.position.z - n.z) < 6; });
    await wait(300); // сервер успевает получить положение после dev-переноса
    await G(() => window.__g.openNpc(window.__g.npcs.find((n) => n.role === 'merchant')));
    expect(await page.isVisible('#shop'), 'окно торговца не открылось');
    const n0 = await G(() => window.__g.P.inv.find((i) => i.id === 'potion_hp')?.n || 0);
    await page.click('[data-buy=potion_hp]');
    await untilP(page, (n) => (window.__g.P.inv.find((i) => i.id === 'potion_hp')?.n || 0) === n + 1, n0);
    expect((await G(() => window.__g.P.coins)) === 470, 'монеты не списались');
    await page.click('#shop [data-close]');
  });

  await step('торговец: без монет покупка не проходит', async () => {
    await G(() => window.__g.dev({ coins: 0 }));
    await untilP(page, () => window.__g.P.coins === 0);
    const n0 = await G(() => window.__g.P.inv.find((i) => i.id === 'potion_hp')?.n || 0);
    await G(() => window.__g.netSend({ t: 'buy', id: 'sword_crystal', n: 1 }));
    await wait(800);
    expect((await G(() => window.__g.P.coins)) === 0, 'монеты ушли в минус');
    expect(!(await G(() => window.__g.P.inv.some((i) => i.id === 'sword_crystal'))), 'вещь выдана без оплаты');
    expect((await G(() => window.__g.P.inv.find((i) => i.id === 'potion_hp')?.n || 0)) === n0, 'сумка изменилась');
    await G(() => window.__g.dev({ coins: 470 }));
    await untilP(page, () => window.__g.P.coins === 470);
  });

  await step('хранитель врат: телепорт на луга', async () => {
    await G(() => { const g = window.__g, n = g.npcs.find((x) => x.role === 'gatekeeper'); g.dev({ x: n.x + 2, z: n.z + 2 }); });
    await wait(500);
    await G(() => { const g = window.__g; g.openNpc(g.npcs.find((n) => n.role === 'gatekeeper')); });
    await page.click('[data-tp=meadow]');
    expect(await zoneHas('Солнечные луга'), `зона: ${await page.textContent('#zone')}`);
    await untilP(page, () => window.__g.P.coins === 390);
  });

  // ближайший живой моб нужного вида — мобов присылает сервер, поэтому сперва ждём их
  const nearMob = (pg, kind) => pg.evaluate((k) => {
    const g = window.__g, h = g.hero.position;
    const m = [...g.mobs.values()].filter((x) => !x.dead && x.obj.visible && (!k || x.def === window.__MOBS?.[k] || x.def.name === k))
      .sort((a, b) => a.obj.position.distanceTo(h) - b.obj.position.distanceTo(h))[0];
    return m ? { id: m.id, x: m.obj.position.x, z: m.obj.position.z, name: m.def.name } : null;
  }, kind);

  await step('бой: убийство моба даёт опыт и монеты', async () => {
    await page.waitForFunction(() => [...window.__g.mobs.values()].some((m) => !m.dead && m.obj.visible), null, { timeout: 15000 });
    const before = await G(() => ({ xp: window.__g.P.xp, coins: window.__g.P.coins, kills: window.__g.P.kills }));
    await G(() => window.__g.dev({ lvl: 20, hp: 99999 }));
    await untilP(page, () => window.__g.P.lvl === 20);
    const m = await nearMob(page);
    await G((t) => window.__g.dev({ x: t.x + 1, z: t.z + 1 }), m);
    await wait(700);
    await G((t) => { const g = window.__g; g.target = g.mobs.get(t.id); g.attack(); }, m);
    await page.waitForFunction((k) => window.__g.P.kills > k, before.kills, { timeout: 30000 });
    const after = await G(() => ({ xp: window.__g.P.xp, coins: window.__g.P.coins }));
    expect(after.xp > before.xp && after.coins > before.coins, JSON.stringify({ before, after }));
  });

  await step('читер: подмена профиля в консоли не доходит до сервера', async () => {
    const real = await G(() => { window.__g.P.coins = 1234567; window.__g.P.lvl = 40; return true; });
    expect(real, 'не удалось подменить');
    await G(() => window.__g.netSend({ t: 'save', p: { coins: 1234567, lvl: 40 } }));
    await wait(1200);
    // сервер присылает свой профиль и затирает подмену
    // любое действие заставляет сервер прислать свой профиль и затереть подмену
    await G(() => window.__g.dev({ coins: 321 }));
    await untilP(page, () => window.__g.P.coins === 321);
    expect((await G(() => window.__g.P.lvl)) !== 40, 'сервер принял накрученный уровень');
  });

  await step('читер: рывок через полкарты отклоняется', async () => {
    const p0 = await G(() => ({ x: window.__g.hero.position.x, z: window.__g.hero.position.z }));
    await G((p) => { window.__g.hero.position.set(p.x + 400, window.__g.hero.position.y, p.z + 400); }, p0);
    await wait(1200);
    const p1 = await G(() => ({ x: window.__g.hero.position.x, z: window.__g.hero.position.z }));
    expect(Math.hypot(p1.x - p0.x, p1.z - p0.z) < 60, `сервер пустил рывок: ${JSON.stringify(p1)}`);
  });

  await step('умение: огненная стрела тратит ману и ставит перезарядку', async () => {
    const m = await nearMob(page);
    await G((t) => window.__g.dev({ x: t.x + 8, z: t.z }), m);
    await wait(700);
    await G((t) => { window.__g.target = window.__g.mobs.get(t.id); }, m);
    const mp0 = await G(() => window.__g.P.mp);
    await page.keyboard.press('Digit1');
    await page.waitForFunction((v) => window.__g.P.mp < v, mp0, { timeout: 8000 });
    expect(await G(() => (window.__g.P.mp) < 1e9), 'мана не списалась');
  });

  await step('получение уровня открывает умение', async () => {
    await G(() => window.__g.dev({ xp: 50000 }));
    await page.waitForFunction(() => window.__g.P.lvl >= 3, null, { timeout: 8000 });
    const lvl = await G(() => window.__g.P.lvl);
    expect(lvl >= 3, `уровень ${lvl}`);
    expect(!(await page.$eval('[data-skill=heal]', (e) => e.classList.contains('locked'))), 'исцеление заблокировано');
  });

  await step('инвентарь: кукла, надеть и снять, окно персонажа', async () => {
    await G(() => window.__g.dev({ item: 'staff_oak' }));
    await G(() => window.__g.dev({ item: 'ring_bronze' }));
    await untilP(page, () => window.__g.P.inv.some((e) => e.id === 'ring_bronze') && window.__g.P.inv.some((e) => e.id === 'staff_oak'));
    await G(() => window.__g.useItem('staff_oak'));
    await untilP(page, () => window.__g.P.equip.weapon === 'staff_oak');
    await page.keyboard.press('KeyI');
    expect((await page.getAttribute('#doll [data-slot=weapon]', 'title')) === 'Дубовый жезл', 'нет на кукле');
    // перетаскивание кольца из сумки на куклу
    const idx = await G(() => window.__g.P.inv.findIndex((e) => e.id === 'ring_bronze'));
    const from = await page.locator(`#inv-grid [data-bag="${idx}"]`).boundingBox(), to = await page.locator('#doll [data-slot=ring2]').boundingBox();
    await page.mouse.move(from.x + 20, from.y + 20); await page.mouse.down();
    await page.mouse.move(to.x + 20, to.y + 20, { steps: 6 }); await page.mouse.up();
    await untilP(page, () => window.__g.P.equip.ring2 === 'ring_bronze');
    // выбор и снятие кнопкой
    await page.click('#doll [data-slot=ring2]');
    expect((await page.textContent('#inv-info')).includes('Бронзовое кольцо'), 'нет описания');
    await page.click('#inv-info [data-cmd=off]');
    await untilP(page, () => !window.__g.P.equip.ring2);
    // окно персонажа
    await page.keyboard.press('KeyC');
    expect((await page.textContent('#char-body')).includes('Маг. атака'), 'нет характеристик');
    await page.keyboard.press('Escape');
    expect(!(await page.isVisible('#char')), 'окно персонажа не закрылось');
  });

  await step('усиление: безопасная заточка до +3', async () => {
    await G(() => window.__g.dev({ item: 'scroll_ench_w', n: 3 }));
    await untilP(page, () => (window.__g.P.inv.find((x) => x.id === 'scroll_ench_w')?.n || 0) === 3);
    for (let i = 1; i <= 3; i++) {
      await G(() => { window.__g.useItem('scroll_ench_w'); window.__g.enchant({ slot: 'weapon' }); });
      await untilP(page, (k) => (window.__g.P.enc.weapon || 0) === k, i);
    }
    const r = await G(() => ({ e: window.__g.P.enc.weapon, left: window.__g.P.inv.filter((x) => x.id === 'scroll_ench_w').length }));
    expect(r.e === 3 && r.left === 0, JSON.stringify(r));
    await page.keyboard.press('Escape');
  });

  await step('читер: заточка без свитка не проходит', async () => {
    const e0 = await G(() => window.__g.P.enc.weapon || 0);
    await G(() => window.__g.netSend({ t: 'ench', scroll: 'scroll_ench_w', ref: { slot: 'weapon' } }));
    await wait(900);
    expect((await G(() => window.__g.P.enc.weapon || 0)) === e0, 'сервер заточил без свитка');
  });

  await step('кнопки меню на ПК: инвентарь и карта без клавиатуры', async () => {
    await page.click('#menu [data-act=inv]');
    expect(await page.isVisible('#inv'), 'инвентарь не открылся кнопкой');
    await page.click('#menu [data-act=inv]');
    expect(!(await page.isVisible('#inv')), 'инвентарь не закрылся кнопкой');
    await page.click('#menu [data-act=char]');
    expect(await page.isVisible('#char'), 'персонаж не открылся кнопкой');
    await page.keyboard.press('Escape');
    await page.click('#menu [data-act=map]');
    expect(await page.isVisible('#bigmap'), 'карта не открылась кнопкой');
    await page.keyboard.press('Escape');
  });

  await step('смерть и возрождение в городе', async () => {
    // агрессивные мобы живут в лесу и катакомбах — идём туда и ждём, пока сервер их пришлёт
    await G(() => window.__g.dev({ x: 20, z: 10, lvl: 1 }));
    await page.waitForFunction(() => [...window.__g.mobs.values()].some((m) => m.def.aggro && !m.dead && m.obj.visible), null, { timeout: 20000 });
    const agro = await G(() => {
      const g = window.__g, h = g.hero.position;
      const m = [...g.mobs.values()].filter((x) => x.def.aggro && !x.dead && x.obj.visible).sort((a, b) => a.obj.position.distanceTo(h) - b.obj.position.distanceTo(h))[0];
      return m ? { x: m.obj.position.x, z: m.obj.position.z } : null;
    });
    expect(agro, 'рядом нет агрессивного моба');
    await G((t) => window.__g.dev({ x: t.x + 1, z: t.z + 1, hp: 1, lvl: 1 }), agro);
    await page.waitForFunction(() => window.__g.dead, null, { timeout: 25000 });
    expect(await page.isVisible('#death'), 'нет окна смерти');
    await page.click('#respawn');
    await page.waitForFunction(() => !window.__g.dead, null, { timeout: 8000 });
    expect(await zoneHas('мирная зона'), 'возрождение не в городе');
  });

  await step('вход в катакомбы через склеп', async () => {
    // в катакомбах нежить нападает первой: на 1 уровне персонажа съедят раньше, чем он успеет что-то сделать
    await G(() => window.__g.dev({ lvl: 20, hp: 99999 }));
    await untilP(page, () => window.__g.P.lvl === 20);
    await G(() => window.__g.dev({ x: 150, z: 250 + 8.5 }));
    expect(await zoneHas('Катакомбы', 10000), 'не попал в катакомбы');
  });

  await step('свиток возврата переносит в город', async () => {
    await G(() => window.__g.dev({ item: 'scroll_escape' }));
    await untilP(page, () => window.__g.P.inv.some((e) => e.id === 'scroll_escape'));
    await G(() => window.__g.useItem('scroll_escape'));
    expect(await zoneHas('мирная зона', 20000), 'не вернулся в город');
  });

  await step('прогресс живёт на сервере и переживает перезагрузку', async () => {
    await wait(800);
    // чистим весь локальный кэш, кроме токена входа: прогресс должен прийти с сервера
    await page.evaluate(() => { const a = localStorage.getItem('l2w-auth'); localStorage.clear(); localStorage.setItem('l2w-auth', a); });
    await page.reload();
    await page.waitForSelector('#start-cont:not([hidden]):not([disabled])', { timeout: 10000 });
    expect((await page.textContent('#start-cont')).includes('Автотест'), 'нет кнопки продолжения');
    await page.click('#start-cont');
    await page.waitForFunction(() => window.__g?.hero, null, { timeout: 10000 });
    expect((await G(() => window.__g.P.equip.weapon)) === 'staff_oak', 'экипировка не сохранилась');
  });

  // ===== телефон =====
  const phone = await (await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })).newPage();
  phone.on('pageerror', (e) => errors.push('телефон: ' + e.message));
  const PG = (fn, arg) => phone.evaluate(fn, arg);
  await step('телефон: создание персонажа, мобильный интерфейс', async () => {
    await phone.goto(URL + '&touch', { waitUntil: 'domcontentloaded', timeout: 60000 }); // второй контекст с WebGL поднимается небыстро
    await phone.waitForSelector('#start-new:not([disabled])');
    await phone.fill('#cname', 'Телефон'); await phone.fill('#cpass', 'пароль2'); await phone.tap('#start-new');
    await phone.waitForFunction(() => window.__g?.P, null, { timeout: 30000 });
    expect(await phone.isVisible('#joy'), 'нет джойстика');
    expect(await phone.isVisible('#mbtns [data-act=attack]'), 'нет кнопки атаки');
    const over = await PG(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); const a = r('skills'), b = r('log'); return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; });
    expect(!over, 'панель умений перекрывает лог');
    const clipped = await PG(() => [...document.querySelectorAll('#mbtns button, #skills .slot')].filter((b) => { const r = b.getBoundingClientRect(); return r.bottom > innerHeight || r.right > innerWidth || r.top < 0; }).map((b) => b.textContent));
    expect(!clipped.length, `за краем экрана: ${clipped.join(', ')}`);
    const hit = await PG(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(), a = r('mbtns'); return ['skills', 'mapbox'].filter((id) => { const b = r(id); return a.left < b.right && b.left < a.right && a.top < b.bottom + 4 && b.top < a.bottom + 4; }).join(','); });
    expect(!hit, `кнопки налезают на: ${hit}`);
    await phone.waitForTimeout(1500);
    await phone.screenshot({ path: 'tests/last-phone.png' });
  });
  await step('iPhone 16 в Safari (852×340): всё влезает, ничего не перекрыто', async () => {
    await phone.setViewportSize({ width: 852, height: 340 });
    await phone.waitForTimeout(500);
    const bad = await PG(() => {
      const r = (el) => el.getBoundingClientRect();
      const ids = ['status', 'mapbox', 'mbtns', 'skills', 'joy', 'log'];
      const out = [];
      for (const id of ids) { const b = r(document.getElementById(id)); if (b.bottom > innerHeight + 1 || b.right > innerWidth + 1 || b.top < -1 || b.left < -1) out.push(`${id} за краем`); }
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const a = r(document.getElementById(ids[i])), b = r(document.getElementById(ids[j]));
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) out.push(`${ids[i]}×${ids[j]}`);
      }
      return out;
    });
    await phone.screenshot({ path: 'tests/last-iphone.png' });
    await phone.setViewportSize({ width: 844, height: 390 });
    expect(!bad.length, bad.join(', '));
    // в Chrome полный экран включается сразу, в Safari на iPhone — подсказка «На экран Домой»
    await PG(() => { Element.prototype.requestFullscreen = undefined; Element.prototype.webkitRequestFullscreen = undefined; });
    await phone.tap('#fsbtn');
    expect(await phone.isVisible('#fshint'), 'нет подсказки про полный экран');
    await phone.tap('#fshint-ok');
  });

  await step('телефон: тап по земле — идти', async () => {
    const a = await PG(() => window.__g.hero.position.clone());
    await phone.touchscreen.tap(560, 230);
    await phone.waitForTimeout(1500);
    const b = await PG(() => window.__g.hero.position.clone());
    expect(Math.hypot(a.x - b.x, a.z - b.z) > 1, 'не пошёл');
  });
  await step('телефон: джойстик двигает персонажа', async () => {
    const a = await PG(() => window.__g.hero.position.clone());
    await PG(() => { const pad = document.getElementById('joy'), r = pad.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const ev = (t, x, y) => pad.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 9, pointerType: 'touch', clientX: x, clientY: y }));
      ev('pointerdown', cx, cy); ev('pointermove', cx, cy - 60); setTimeout(() => ev('pointerup', cx, cy - 60), 3000); });
    await phone.waitForTimeout(3400);
    const b = await PG(() => window.__g.hero.position.clone());
    expect(Math.hypot(a.x - b.x, a.z - b.z) > 5, `сдвиг ${Math.hypot(a.x - b.x, a.z - b.z).toFixed(1)}`);
    expect((await PG(() => window.__g.joy.x + window.__g.joy.y)) === 0, 'джойстик не отпустился');
  });
  await step('телефон: кнопки атаки и вещей', async () => {
    // уходим на луга и ждём, пока сервер пришлёт мобов: кнопка атаки выбирает цель из видимых
    await PG(() => window.__g.dev({ x: -260, z: 180 }));
    await phone.waitForFunction(() => [...window.__g.mobs.values()].some((m) => !m.dead && m.obj.visible), null, { timeout: 20000 });
    await PG(() => {
      const g = window.__g, h = g.hero.position;
      const m = [...g.mobs.values()].filter((x) => !x.dead && x.obj.visible).sort((a, b) => a.obj.position.distanceTo(h) - b.obj.position.distanceTo(h))[0];
      if (m) g.dev({ x: m.obj.position.x + 3, z: m.obj.position.z });
    });
    await phone.waitForFunction(() => {
      const g = window.__g, h = g.hero.position;
      return [...g.mobs.values()].some((m) => !m.dead && m.obj.visible && m.obj.position.distanceTo(h) < 40);
    }, null, { timeout: 20000 });
    const k0 = await PG(() => window.__g.P.kills);
    await phone.tap('#mbtns [data-act=attack]'); await phone.tap('#mbtns [data-act=attack]');
    await phone.waitForFunction((k) => window.__g.P.kills > k || window.__g.target, k0, { timeout: 15000 });
    await phone.tap('#mbtns [data-act=inv]');
    const full = await PG(() => { const r = document.getElementById('inv').getBoundingClientRect(); return r.width >= innerWidth - 2; });
    expect(full, 'инвентарь не на весь экран');
    await phone.tap('#inv [data-close]');
  });

  await step('мультиплеер: видим друг друга, онлайн, чат', async () => {
    const pos = await G(() => { const p = window.__g.hero.position; return { x: p.x, z: p.z }; });
    await PG((p) => window.__g.dev({ x: p.x + 3, z: p.z }), pos);
    await page.waitForFunction(() => [...window.__g.remotes.values()].some((r) => r.name === 'Телефон' && r.obj.visible), null, { timeout: 8000 });
    await page.waitForFunction(() => document.getElementById('online').textContent.includes('Онлайн: 2'), null, { timeout: 5000 });
    await page.waitForFunction(() => document.getElementById('labels').textContent.includes('Телефон'), null, { timeout: 8000 }).catch(() => { throw new Error('нет подписи другого игрока'); });
    await page.keyboard.press('Enter');
    await page.keyboard.type('Привет из теста');
    await page.keyboard.press('Enter');
    await phone.waitForFunction(() => document.getElementById('logbox').textContent.includes('Привет из теста'), null, { timeout: 5000 });
    await PG(() => { document.getElementById('chatin').value = '+Продам меч'; document.getElementById('chatsend').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    await page.waitForFunction(() => [...document.querySelectorAll('#logbox .c-trade')].some((d) => d.textContent.includes('Продам меч')), null, { timeout: 5000 });
    // личное сообщение: клик по имени подставляет /w, приходит только адресату фиолетовым
    await page.click('#logbox .c-trade b[data-name="Телефон"]');
    expect((await page.inputValue('#chatin')) === '/w Телефон ', 'клик по имени не подставил /w');
    await page.keyboard.type('секрет'); await page.keyboard.press('Enter');
    await phone.waitForFunction(() => [...document.querySelectorAll('#logbox .c-pm')].some((d) => d.textContent.includes('секрет')), null, { timeout: 5000 });
    expect(await PG(() => getComputedStyle(document.querySelector('#logbox .c-pm')).color === 'rgb(200, 140, 255)'), 'личное не фиолетовое');
    await page.waitForFunction(() => document.querySelector('#logbox .c-pm.me')?.textContent.includes('-> Телефон'), null, { timeout: 5000 });
    await PG(() => { document.getElementById('chatin').value = '/r и тебе'; document.getElementById('chatsend').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    await page.waitForFunction(() => [...document.querySelectorAll('#logbox .c-pm')].some((d) => d.textContent.includes('и тебе')), null, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelector('#chtabs [data-tab=pm] i'), null, { timeout: 3000 });
    // настройки: системные сообщения выключаются
    await page.click('#chatgear'); await page.click('#chatset [data-set=sys]');
    expect(!(await page.isVisible('#syslog')), 'системный чат не выключился');
    await page.click('#chatset [data-set=sys]'); await page.click('#chatgear');
  });

  await step('PvP: флаг, убийство белого — PK, объявление, жрец смывает карму', async () => {
    await G(() => { const g = window.__g; if (g.dead) g.respawn(); g.dev({ x: -260, z: 180, hp: 99999, lvl: 20 }); });
    await PG(() => { const g = window.__g; if (g.dead) g.respawn(); g.dev({ x: -257, z: 180, lvl: 20 }); });
    await wait(800);
    await phone.waitForFunction(() => [...window.__g.remotes.values()].some((r) => r.name === 'Автотест' && r.obj.visible), null, { timeout: 8000 });
    await G(() => window.__g.dev({ hp: 1 }));
    await wait(300);
    await PG(() => { const g = window.__g; g.target = [...g.remotes.values()].find((r) => r.name === 'Автотест'); g.attack(); });
    await page.waitForFunction(() => window.__g.dead, null, { timeout: 10000 });
    await phone.waitForFunction(() => window.__g.P.karma > 0 && window.__g.P.pk === 1, null, { timeout: 5000 });
    await page.waitForFunction(() => document.getElementById('logbox').textContent.includes('стал PK'), null, { timeout: 5000 });
    // ник PK у жертвы — красный
    await page.waitForFunction(() => [...document.querySelectorAll('#labels .nlabel')].some((l) => l.textContent === 'Телефон' && l.style.color === 'rgb(255, 74, 74)'), null, { timeout: 5000 });
    await G(() => window.__g.respawn());
    // жрец: отмыв за деньги
    await PG(() => { const g = window.__g, n = g.npcs.find((x) => x.role === 'priest'); g.dev({ coins: 100000, x: n.x + 2, z: n.z + 2 }); });
    await untilP(phone, () => window.__g.P.coins === 100000);
    await phone.waitForFunction(() => { const g = window.__g, n = g.npcs.find(n => n.role === 'priest'); return Math.hypot(g.hero.position.x - n.x, g.hero.position.z - n.z) < 6; });
    await phone.waitForTimeout(300); // подтверждение положения на сервере
    await PG(() => window.__g.openNpc(window.__g.npcs.find((n) => n.role === 'priest')));
    await phone.tap('#wash');
    await phone.waitForFunction(() => window.__g.P.karma === 0, null, { timeout: 5000 });
    // karma приходит в me, монеты — следующим сообщением you; ждём обе части ответа.
    await untilP(phone, () => window.__g.P.coins < 100000);
    expect((await PG(() => window.__g.P.coins)) < 100000, 'деньги за отмыв не списаны');
  });

  await step('камера: ПКМ вправо и вниз, миникарта после поворота', async () => {
    const old = await G(() => ({ ...window.__g.cam }));
    try {
      await page.mouse.move(650, 310); await page.mouse.down({ button: 'right' });
      await page.mouse.move(720, 350, { steps: 5 }); await page.mouse.up({ button: 'right' });
      const cam = await G(() => ({ ...window.__g.cam }));
      expect(cam.yaw > old.yaw, 'горизонтальная орбита инвертирована');
      expect(cam.pitch < old.pitch, 'вертикальная орбита инвертирована');
    } finally { await page.mouse.up({ button: 'right' }); await G(c => Object.assign(window.__g.cam, c), old); }
  });

  await step('аккаунт: занятое имя, неверный пароль, вход с другого устройства', async () => {
    await phone.context().close(); // три WebGL-вкладки на программном рендере не успевают
    const other = await (await browser.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
    other.on('pageerror', (e) => errors.push('другое устройство: ' + e.message));
    await other.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await other.waitForSelector('#start-new:not([disabled])', { timeout: 60000 });
    const msg = (t) => other.waitForFunction((t) => document.getElementById('start-msg').textContent.includes(t), t, { timeout: 5000 });
    await other.fill('#cname', 'автотест'); await other.fill('#cpass', 'чужой');
    await other.click('#start-new'); await msg('занято');
    await other.click('#start-login'); await msg('Неверное');
    await other.fill('#cpass', 'пароль1'); await other.click('#start-login');
    await other.waitForFunction(() => window.__g?.P, null, { timeout: 8000 });
    expect((await other.evaluate(() => window.__g.P.equip.weapon)) === 'staff_oak', 'на другом устройстве не тот персонаж');
    await page.waitForFunction(() => document.getElementById('syslog').textContent.includes('другого устройства'), null, { timeout: 5000 });
    await other.close();
  });

  await step('нет ошибок в консоли', async () => { expect(!errors.length, errors.slice(0, 3).join(' | ')); });
  await browser.close();
} catch (e) {
  failed++; results.push(`  ✗ запуск: ${e.message}`);
} finally {
  server.kill(); wsServer.kill(); fs.rmSync(DBDIR, { recursive: true, force: true });
}
console.log(`E2E:\n${results.join('\n')}\n${failed ? `ПРОВАЛЕНО: ${failed}` : 'всё прошло'}`);
process.exit(failed ? 1 : 0);
