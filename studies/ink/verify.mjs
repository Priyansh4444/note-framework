import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const out=resolve('artifacts/all-studies/ink');await mkdir(out,{recursive:true});
const url=process.env.STUDY_URL??'http://127.0.0.1:3151/studies/ink/index.html';
const browser=await chromium.launch({headless:true});
const errors=[];const checks=[];
const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(url);await page.waitForSelector('canvas[data-frames]');await page.evaluate(()=>document.fonts.ready);
const canvas=page.locator('#ink');
const state=()=>canvas.evaluate(c=>({frames:Number(c.dataset.frames),time:Number(c.dataset.time),weights:c.dataset.weights}));
for(const w of [1440,768,390,320]){
  await page.setViewportSize({width:w,height:1100});await page.waitForTimeout(100);
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('button')].map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})),small:[...document.querySelectorAll('p,button,summary,a,.colophon')].filter(e=>getComputedStyle(e).fontSize&&parseFloat(getComputedStyle(e).fontSize)<15).length}));
  if(layout.overflow||layout.buttons.some(b=>b.w<44||b.h<44)||layout.small)throw Error(`layout ${w}: ${JSON.stringify(layout)}`);
  await page.screenshot({path:`${out}/rain-${w}.png`,fullPage:true});checks.push({width:w,...layout});
}
await page.setViewportSize({width:1440,height:1080});
let a=await state();await page.waitForTimeout(200);let b=await state();if(a.frames!==b.frames)throw Error('initial still animates');checks.push({initialStill:true});
await page.locator('#play').click();await page.waitForTimeout(500);a=await state();if(a.time<=0)throw Error('play did not advance');
await page.locator('#play').click();await page.waitForTimeout(100);a=await state();await page.waitForTimeout(200);b=await state();if(a.time!==b.time)throw Error('pause time advanced');checks.push({playAndPause:true});
await page.locator('[data-scene="1"]').click();await page.waitForTimeout(180);a=await state();await page.screenshot({path:`${out}/morph-rain-canopy-180ms.png`,fullPage:true});if(a.weights==='1.0000,0.0000,0.0000'||a.weights==='0.0000,1.0000,0.0000')throw Error('no intermediate geometry');
const continuity=await page.evaluate(()=>{const c=document.querySelector('#ink'),before=c.dataset.weights;document.querySelector('[data-scene="2"]').click();return before===c.dataset.weights;});if(!continuity)throw Error('retarget jumped its displayed pose');checks.push({sameFrameRetargetContinuity:true});await page.waitForTimeout(120);await page.screenshot({path:`${out}/morph-retarget-120ms.png`,fullPage:true});
await page.locator('[data-scene="0"]').click();await page.waitForTimeout(100);await page.locator('[data-scene="2"]').click();await page.waitForTimeout(2300);b=await state();if(b.weights!=='0.0000,0.0000,1.0000')throw Error(`retarget did not settle ${b.weights}`);checks.push({rapidRetarget:true});
await page.screenshot({path:`${out}/circle-1440.png`,fullPage:true});
await page.locator('[data-scene="1"]').click();await page.waitForTimeout(2300);await page.screenshot({path:`${out}/canopy-1440.png`,fullPage:true});
await page.locator('#previous').click();await page.waitForTimeout(2300);if(await page.locator('[data-scene="0"]').getAttribute('aria-current')!=='true')throw Error('previous');await page.locator('#next').click();await page.waitForTimeout(2300);checks.push({previousNext:true});
await page.locator('#play').click();await page.waitForTimeout(100);await page.evaluate(()=>{document.querySelector('.stage').style.marginTop='2500px';});await page.waitForTimeout(150);a=await state();await page.waitForTimeout(250);b=await state();if(a.time!==b.time||a.frames!==b.frames)throw Error('offscreen clock runs');checks.push({offscreenPause:true});
await page.evaluate(()=>{document.querySelector('.stage').style.marginTop='';});await page.waitForTimeout(150);a=await state();if(a.time===b.time)throw Error('offscreen resume failed');await page.locator('#play').click();
await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-scene="2"]').click();a=await state();await page.waitForTimeout(300);b=await state();if(a.time!==b.time||a.frames!==b.frames||b.weights!=='0.0000,0.0000,1.0000'||!await page.locator('#play').isDisabled())throw Error('reduced motion');await page.setViewportSize({width:390,height:1100});await page.screenshot({path:`${out}/circle-reduced-390.png`,fullPage:true});checks.push({reducedMotion:true});
// Every scene at every requested width, with a structural text/art separation assertion.
for(const w of [320,390,768,1440]){
  await page.setViewportSize({width:w,height:1100});
  for(let scene=0;scene<3;scene++){
    await page.locator(`[data-scene="${scene}"]`).click();await page.waitForTimeout(60);
    const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,separation:document.querySelector('canvas').getBoundingClientRect().top-document.querySelector('.story').getBoundingClientRect().bottom}));
    if(layout.overflow||(w<=768&&layout.separation<0))throw Error(`scene layout ${w}/${scene} ${JSON.stringify(layout)}`);
    await page.screenshot({path:`${out}/scene-${scene}-${w}.png`,fullPage:true});
  }
}
checks.push({allScenesResponsive:true});
await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:1440,height:1080});await page.locator('#play').click();await page.waitForTimeout(100);
await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
a=await state();await page.waitForTimeout(200);b=await state();if(a.time!==b.time||a.frames!==b.frames)throw Error('visibility branch did not suspend');
await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(100);b=await state();if(a.time===b.time)throw Error('visibility branch did not resume');await page.locator('#play').click();checks.push({visibilityEventSuspendResume:true});
await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#next').focus();await page.keyboard.press('Enter');if(await page.locator('[data-scene="0"]').getAttribute('aria-current')!=='true')throw Error('keyboard next');checks.push({keyboardNavigation:true});
const digest=()=>canvas.evaluate(c=>c.toDataURL());await page.reload();await page.waitForSelector('canvas[data-frames]');await page.evaluate(()=>document.fonts.ready);const first=await digest();await page.reload();await page.waitForSelector('canvas[data-frames]');await page.evaluate(()=>document.fonts.ready);if(first!==await digest())throw Error('seeded drawing differs after reload');checks.push({deterministicReload:true});
const story=await browser.newPage({viewport:{width:1440,height:1080}});await story.clock.install();await story.goto(url);await story.locator('#play').click();await story.clock.runFor(30000);
if(await story.locator('[data-scene="2"]').getAttribute('aria-current')!=='true'||await story.locator('#play').getAttribute('aria-pressed')!=='false')throw Error('full story failed to finish');
checks.push({fullStoryEndsAfterThreeScenes:true});await story.close();checks.push({errors});if(errors.length)throw Error(errors.join('\n'));
await writeFile(`${out}/verification.json`,JSON.stringify({url:page.url(),checks},null,2));await browser.close();console.log(JSON.stringify(checks,null,2));
