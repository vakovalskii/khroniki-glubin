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
    const second=await make('СетевойВоин','warrior');
    await second.waitForFunction(()=>window.__g.hero.userData.guardian?.state==='ready',null,{timeout:30000});
    await mage.waitForFunction(()=>['КонтентВоин','СетевойВоин'].every(name=>[...window.__g.remotes.values()].some(r=>r.name===name&&r.obj.userData.guardian?.state==='ready')),null,{timeout:30000});
    const independent=await mage.evaluate(()=>{
      const roots=['КонтентВоин','СетевойВоин'].map(name=>[...window.__g.remotes.values()].find(r=>r.name===name).obj);
      const meshes=roots.map(root=>{let mesh;root.traverse(o=>{if(o.isSkinnedMesh&&!mesh)mesh=o;});return mesh;});
      return meshes.every(Boolean)&&meshes[0].skeleton!==meshes[1].skeleton&&meshes[0].skeleton.bones[0]!==meshes[1].skeleton.bones[0]&&meshes[0].geometry===meshes[1].geometry;
    });
    if(!independent)throw Error('Скелеты сетевых воинов не независимы или геометрия не переиспользуется');
    await warrior.evaluate(()=>window.__g.useSkill('battle_cry'));
    await warrior.waitForFunction(()=>window.__g.hero.userData.guardian.clip==='Skill01');
    await mage.waitForFunction(()=>[...window.__g.remotes.values()].find(r=>r.name==='КонтентВоин')?.obj.userData.guardian.clip==='Skill01');
    if(await mage.evaluate(()=>[...window.__g.remotes.values()].find(r=>r.name==='СетевойВоин')?.obj.userData.guardian.clip==='Skill01'))throw Error('Анимация клича затронула второго воина');
    await second.keyboard.down('KeyW');
    await mage.waitForFunction(()=>['Run','Walk'].includes([...window.__g.remotes.values()].find(r=>r.name==='СетевойВоин')?.obj.userData.guardian.clip));
    await second.keyboard.up('KeyW');
    await mage.evaluate(()=>window.__g.useSkill('call_wolf'));
    await mage.waitForFunction(()=>document.getElementById('pet-status').textContent.includes('Волк'),null,{timeout:10000});
    await warrior.evaluate(()=>window.__g.netSend({t:'pinvite',name:'КонтентМаг'}));
    await mage.waitForSelector('#party-accept:visible');await mage.click('#party-accept');
    await warrior.waitForFunction(()=>document.getElementById('party-members').textContent.includes('КонтентМаг'));
    await mage.waitForFunction(()=>document.getElementById('party-members').textContent.includes('КонтентВоин'));
    await warrior.screenshot({path:'tests/last-content-warrior.png'});
    for(const [page,x] of [[warrior,-260],[second,-258.5],[mage,-265]]) {
      await page.evaluate(x=>window.__g.dev({x,z:180,lvl:30,hp:99999}),x);
    }
    await mage.waitForFunction(()=>['КонтентВоин','СетевойВоин'].every(name=>{const r=[...window.__g.remotes.values()].find(r=>r.name===name);return r?.obj.visible&&Math.abs(r.obj.position.z-180)<2;}));
    await warrior.evaluate(()=>window.__g.dev({hp:1}));
    await warrior.waitForFunction(()=>window.__g.P.hp<20);
    await second.evaluate(()=>{const g=window.__g;g.target=[...g.remotes.values()].find(r=>r.name==='КонтентВоин');g.attack();});
    await mage.waitForFunction(()=>['Attack','Combo'].includes([...window.__g.remotes.values()].find(r=>r.name==='СетевойВоин')?.obj.userData.guardian.clip),null,{timeout:15000});
    await mage.waitForFunction(()=>[...window.__g.remotes.values()].find(r=>r.name==='КонтентВоин')?.obj.userData.guardian.clip==='Death',null,{timeout:15000});
    await warrior.evaluate(()=>window.__g.respawn());
    await warrior.waitForFunction(()=>!window.__g.dead);
    const home=await warrior.evaluate(()=>({x:window.__g.hero.position.x,z:window.__g.hero.position.z}));
    await mage.evaluate(p=>window.__g.dev(p),home);
    await mage.waitForFunction(()=>{const r=[...window.__g.remotes.values()].find(r=>r.name==='КонтентВоин');return r?.obj.visible&&!r.dead&&r.obj.userData.guardian.clip==='Idle';});
    await second.close();
    await mage.waitForFunction(()=>![...window.__g.remotes.values()].some(r=>r.name==='СетевойВоин'));
    const downloads=await mage.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.endsWith('/guardian-game.glb')).length);
    if(downloads!==1)throw Error('Модель загружалась повторно: '+downloads);
    if(errors.length)throw Error(errors.join(' | '));
  } finally {await context.close();}
}
