export async function contentStep(browser, URL) {
  const context=await browser.newContext({viewport:{width:1280,height:800}}),errors=[];
  const make=async(name,cls)=>{const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(URL);await page.waitForSelector('#start-new:not([disabled])');await page.fill('#cname',name);await page.fill('#cpass','content-password');await page.click(`[data-cls=${cls}]`);await page.click('#start-new');await page.waitForFunction(()=>window.__g?.P&&document.body.classList.contains('ingame'));return page;};
  try {
    const warrior=await make('КонтентВоин','warrior'),mage=await make('КонтентМаг','mage');
    await warrior.waitForFunction(()=>window.__g.hero.userData.guardian?.state==='ready',null,{timeout:30000});
    const clips=await warrior.evaluate(()=>window.__g.hero.userData.guardian.clips);
    if(clips.length<10)throw Error('Потеряны клипы воина');
    for(const [page,prof,skill]of [[warrior,'berserker','frenzy'],[mage,'druid','call_wolf']]){
      await page.evaluate(()=>{const g=window.__g,n=g.npcs.find(n=>n.role==='mentor');g.dev({lvl:30,sp:100000,x:n.x+2,z:n.z+2});});
      await page.waitForFunction(()=>window.__g.P.lvl===30&&window.__g.P.sp===100000);
      await page.waitForTimeout(400);
      await page.evaluate(()=>{const g=window.__g;g.openNpc(g.npcs.find(n=>n.role==='mentor'));});
      await page.click(`[data-prof=${prof}]`);await page.waitForFunction(id=>window.__g.P.prof===id,prof);
      await page.click(`[data-learn=${skill}]`);await page.waitForFunction(id=>window.__g.P.skl[id]===1,skill);await page.click('#mentor [data-close]');
      if(!await page.locator(`[data-skill=${skill}]`).count())throw Error('Нет умения профессии на панели');
    }
    await warrior.evaluate(()=>window.__g.useSkill('battle_cry'));
    await warrior.waitForFunction(()=>window.__g.hero.userData.guardian.clip==='Skill01');
    await mage.evaluate(()=>window.__g.useSkill('call_wolf'));
    await mage.waitForFunction(()=>document.getElementById('pet-status').textContent.includes('Волк'),null,{timeout:10000});
    await warrior.evaluate(()=>window.__g.netSend({t:'pinvite',name:'КонтентМаг'}));
    await mage.waitForSelector('#party-accept:visible');await mage.click('#party-accept');
    await warrior.waitForFunction(()=>document.getElementById('party-members').textContent.includes('КонтентМаг'));
    await mage.waitForFunction(()=>document.getElementById('party-members').textContent.includes('КонтентВоин'));
    await warrior.screenshot({path:'tests/last-content-warrior.png'});
    if(errors.length)throw Error(errors.join(' | '));
  } finally {await context.close();}
}
