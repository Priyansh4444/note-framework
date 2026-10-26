import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { ARM, TARGETS, boundPoint, pointAt } from './model.js';
const out=new URL('../../artifacts/all-studies/arm/',import.meta.url).pathname;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const errors=[],results=[];
const page=await browser.newPage({viewport:{width:1440,height:1200},deviceScaleFactor:1});
page.on('pageerror',error=>errors.push(error.message));
const url=process.env.ARM_URL??'http://localhost:3151/studies/mechanical-arm/index.html';
const state=()=>page.locator('#mechanism').evaluate(svg=>({radius:+svg.dataset.radius,angle:+svg.dataset.angle,tip:{x:+svg.dataset.tipX,y:+svg.dataset.tipY},elbow:{x:+svg.dataset.elbowX,y:+svg.dataset.elbowY}}));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const screenPoint=point=>page.locator('#mechanism').evaluate((svg,point)=>{const p=new DOMPoint(point.x,point.y).matrixTransform(svg.getScreenCTM());return{x:p.x,y:p.y}},point);
function lengths(s){assert(Math.abs(dist(ARM.origin,s.elbow)-ARM.upper)<1e-7);assert(Math.abs(dist(s.elbow,s.tip)-ARM.lower)<1e-7)}
async function check(name,fn){await fn();results.push({name,passed:true});console.log('PASS',name)}
try{
  const clockStart=new Date('2026-01-01T00:00:00Z');await page.clock.install({time:clockStart});await page.clock.pauseAt(clockStart);await page.goto(url);await page.clock.runFor(32);
  const upper=await page.$('#upper'),count=await page.locator('svg *').count();
  await check('named targets animate and rapid retargets preserve the displayed pose',async()=>{
    await page.getByRole('button',{name:'Transfer'}).click();await page.clock.runFor(140);
    const moving=await state();lengths(moving);assert(dist(moving.tip,TARGETS[0])>10);assert(dist(moving.tip,TARGETS[1])>10);
    await page.screenshot({path:out+'mid-motion.png',fullPage:true});
    await page.getByRole('button',{name:'Park'}).click();const before=await state();assert(dist(before.tip,moving.tip)<1e-8);
    await page.clock.runFor(32);const reversing=await state();lengths(reversing);
    await page.getByRole('button',{name:'Inspect'}).click();const interrupted=await state();assert(dist(interrupted.tip,reversing.tip)<1e-8);
    await page.clock.runFor(1500);assert(dist((await state()).tip,TARGETS[0])<.03);
    assert(await upper.evaluate(node=>node===document.querySelector('#upper')));assert.equal(await page.locator('svg *').count(),count);
  });
  await check('genuine offset grab, drag, rapid reversals and outside capture preserve link lengths',async()=>{
    const start=await state(),grab=await screenPoint({x:start.tip.x+12,y:start.tip.y});
    await page.mouse.move(grab.x,grab.y);await page.mouse.down();assert(dist((await state()).tip,start.tip)<1e-8);
    for(const point of [{x:460,y:210},{x:590,y:190},{x:335,y:250},{x:475,y:310}]){
      const screen=await screenPoint({x:point.x+12,y:point.y});await page.mouse.move(screen.x,screen.y,{steps:5});
      const s=await state();lengths(s);assert(dist(s.tip,pointAt(boundPoint(point)))<1.5, JSON.stringify({actual:s.tip,expected:pointAt(boundPoint(point))}));
    }
    await page.screenshot({path:out+'dragged-pose.png',fullPage:true});
    await page.mouse.move(0,0,{steps:10});const edge=await state();lengths(edge);assert(edge.radius<=ARM.maxRadius);assert(edge.angle>=ARM.minAngle&&edge.angle<=ARM.maxAngle);
    await page.mouse.up();assert.equal(await page.locator('#status').textContent(),'Position held');
  });
  await check('keyboard arrows, Shift, Home and target activation respond immediately',async()=>{
    await page.locator('#mechanism').focus();await page.keyboard.press('Home');assert(dist((await state()).tip,TARGETS[2])<1e-8);
    const before=await state();await page.keyboard.press('ArrowUp');assert(dist((await state()).tip,{x:before.tip.x,y:before.tip.y-8})<1e-8);
    const next=await state();await page.keyboard.press('Shift+ArrowRight');assert(dist((await state()).tip,{x:next.tip.x+25,y:next.tip.y})<1e-8);
    await page.getByRole('button',{name:'Transfer'}).focus();await page.keyboard.press('Enter');assert(dist((await state()).tip,TARGETS[1])<1e-8);
  });
  await check('reduced motion settles targets with no traveling pose',async()=>{
    await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Inspect'}).click();assert(dist((await state()).tip,TARGETS[0])<1e-8);
    await page.clock.runFor(1000);assert(dist((await state()).tip,TARGETS[0])<1e-8);
    await page.emulateMedia({reducedMotion:'no-preference'});
  });
  await check('scrolling the actual SVG offscreen pauses and resumes the motion clock',async()=>{
    await page.setViewportSize({width:390,height:450});await page.clock.runFor(32);
    await page.getByRole('button',{name:'Transfer'}).click();await page.clock.runFor(64);
    await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await new Promise(resolve=>setTimeout(resolve,80));await page.clock.runFor(64);
    const bounds=await page.locator('#mechanism').boundingBox();assert(bounds.y+bounds.height<0,'SVG must genuinely leave the viewport');
    const paused=await state();await page.clock.runFor(500);assert(dist((await state()).tip,paused.tip)<1e-8);
    await page.locator('#mechanism').scrollIntoViewIfNeeded();await new Promise(resolve=>setTimeout(resolve,80));await page.clock.runFor(1500);assert(dist((await state()).tip,TARGETS[1])<.03);
  });
  for(const width of [320,390,768,1440])await check(`responsive ${width}px, control size, labels, disclosure and full SVG bounds`,async()=>{
    await page.setViewportSize({width,height:width<700?844:1100});await page.goto(url);await page.clock.runFor(32);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    for(const target of TARGETS){
      await page.getByRole('button',{name:target.name}).focus();await page.keyboard.press('Enter');
      const result=await page.locator('#mechanism').evaluate(svg=>{
        const nodes=['upper','forearm'];const viewport=svg.getBoundingClientRect();
        return nodes.map(id=>{const node=document.getElementById(id),b=node.getBBox(),m=node.getScreenCTM();const points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m));return {id,minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y)),viewport:{x:viewport.x,y:viewport.y,right:viewport.right,bottom:viewport.bottom}};});
      });
      for(const b of result){assert(b.minX>=b.viewport.x-1,`${target.id}/${b.id} left clipping at ${width}`);assert(b.maxX<=b.viewport.right+1,`${target.id}/${b.id} right clipping at ${width}`);assert(b.minY>=b.viewport.y-1,`${target.id}/${b.id} top clipping at ${width}`);assert(b.maxY<=b.viewport.bottom+1,`${target.id}/${b.id} bottom clipping at ${width}`);}
    }
    for(const button of await page.getByRole('button').all()){const b=await button.boundingBox();assert(b.width>=44&&b.height>=44)}
    for(const selector of ['.intro p','.stage-help','.keyboard-hint','.explanation p','.target b','.readouts dt'])assert(await page.locator(selector).first().evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=15));
    await page.getByRole('button',{name:'Inspect'}).focus();await page.keyboard.press('Enter');await page.locator('h1').scrollIntoViewIfNeeded();
    await page.screenshot({path:out+`width-${width}.png`,fullPage:true});
    await page.locator('summary').click();assert(await page.locator('details').evaluate(node=>node.open));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  });
  await check('single HTML is network-independent in an opaque sandbox',async()=>{
    const html=await (await import('node:fs/promises')).readFile(new URL('../../public/studies/mechanical-arm/index.html',import.meta.url),'utf8');
    const isolated=await browser.newPage({viewport:{width:390,height:844}});const requests=[];
    await isolated.route('**/*',route=>{requests.push(route.request().url());route.abort()});
    await isolated.setContent('<iframe sandbox="allow-scripts" style="border:0;width:100%;height:800px"></iframe>');
    await isolated.locator('iframe').evaluate((node,html)=>node.srcdoc=html,html);const frame=isolated.frames()[1];
    await frame.getByRole('button',{name:'Transfer'}).click();await frame.waitForTimeout(1400);
    assert(await frame.locator('#mechanism').evaluate(svg=>Math.abs(+svg.dataset.tipX-325)<.1));assert.deepEqual(requests,[]);
    await isolated.screenshot({path:out+'opaque-sandbox.png',fullPage:true});await isolated.close();
  });
  assert.deepEqual(errors,[]);console.log('PASS no runtime errors');results.push({name:'no runtime errors',passed:true});
} finally {
 await writeFile(out+'browser-report.json',JSON.stringify({url,results,errors},null,2));await browser.close();
}
