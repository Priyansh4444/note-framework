import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const origin=process.env.STUDY_ORIGIN??'http://localhost:3151';
const out='artifacts/all-studies/hairline';mkdirSync(out,{recursive:true});
const browser=await chromium.launch(),errors=[],checks=[];
const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
try{
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:1000});await page.goto(origin+'/studies/hairline/index.html');await page.locator('#stage svg').waitFor();
  assert.equal(await page.locator('#read').textContent(),'rest');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const box=await page.locator('#stage').boundingBox();assert(box.x>=0&&box.x+box.width<=width+.5);
  await page.locator('#stage').focus();await page.keyboard.press('Home');assert.equal(await page.locator('#read').textContent(),'folio 01');await page.keyboard.press('End');assert.equal(await page.locator('#read').textContent(),'folio 06');await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#read').textContent(),'folio 05');await page.keyboard.press('Escape');assert.equal(await page.locator('#read').textContent(),'rest');
  await page.screenshot({path:`${out}/width-${width}.png`,fullPage:true});checks.push({width,noOverflow:true,keyboard:true});
 }
 await page.clock.install();await page.reload();await page.locator('#stage svg').waitFor();
 await page.evaluate(()=>window.__nodes=[...document.querySelectorAll('#stage svg *')]);
 await page.locator('#play').click();await page.clock.runFor(2000);const tourRead=await page.locator('#read').textContent();assert.notEqual(tourRead,'rest');
 await page.locator('#stage').focus();await page.keyboard.press('Home');await page.clock.runFor(5000);assert.equal(await page.locator('#read').textContent(),'folio 01');checks.push({tourAnswers:true,keyboardTakesOverTour:true});
 // Rapid fixed-pose selections retain the exact painted geometry in the same event.
 const continuity=await page.evaluate(()=>{const stage=document.querySelector('#stage'),before=[...stage.querySelectorAll('path')].map(p=>p.getAttribute('d'));stage.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));return before.every((d,i)=>d===stage.querySelectorAll('path')[i].getAttribute('d'));});assert(continuity);
 await page.clock.runFor(1200);assert.equal(await page.locator('#read').textContent(),'folio 06');assert(await page.evaluate(()=>window.__nodes.every((n,i)=>n===document.querySelectorAll('#stage svg *')[i])));checks.push({sameEventContinuity:true,retainedNodes:true});
 await page.locator('#intensity').focus();await page.keyboard.press('Home');assert.equal(await page.locator('#value').textContent(),'20');await page.keyboard.press('End');assert.equal(await page.locator('#value').textContent(),'65');
 assert.equal(await page.locator('#theme').count(),0);assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');checks.push({intensityEndpoints:[20,65],darkOnly:true});
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#stage').focus();await page.keyboard.press('Home');await page.clock.runFor(40);const still=await page.locator('#stage svg').innerHTML();await page.clock.runFor(1000);assert.equal(await page.locator('#stage svg').innerHTML(),still);checks.push({reducedMotionSettles:true});
 await page.evaluate(()=>window.hairline.figure.destroy());assert.equal(await page.locator('#stage svg *').count(),0);await page.clock.runFor(2000);assert.equal(await page.locator('#stage svg *').count(),0);checks.push({destroyClearsFigure:true});
 assert.deepEqual(errors,[]);writeFileSync(`${out}/browser-report.json`,JSON.stringify({origin,checks,errors},null,2));console.log('Hairline responsive, keyboard, tour takeover, continuity, retained nodes, range/theme, reduced motion and disposal passed.');
}finally{await browser.close();}
