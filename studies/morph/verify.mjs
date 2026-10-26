import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const base = process.env.STUDY_URL ?? 'http://127.0.0.1:3151/studies/morph/index.html';
const evidence = new URL('../../artifacts/all-studies/morph/', import.meta.url);
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'no-preference' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if(message.type() === 'error') errors.push(message.text()); });
const report = { url: base, widths: [], contours: 32, samplesPerContour: 32, checks: [] };
const snapshot = () => page.evaluate(() => window.__morphStudy.snapshot());
const capture = async name => {
  const bytes = await page.screenshot({ path: new URL(name + '.png', evidence).pathname, fullPage: true });
  return createHash('sha256').update(bytes).digest('hex');
};
const settle = () => page.waitForFunction(() => !window.__morphStudy.snapshot().running);

try {
  await page.goto(base);
  await page.waitForFunction(() => !!window.__morphStudy);
  for(const width of [320,390,768,1440]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1050 });
    await page.evaluate(() => scrollTo(0,0));
    await page.waitForTimeout(70);
    const layout = await page.evaluate(() => {
      const targets = [...document.querySelectorAll('button,a')].map(el => ({ text: el.textContent.trim(), width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }));
      const text = [...document.querySelectorAll('p,h1,button,a,.stage-label,.stage-note,.edition span,.key')].filter(el => el.getBoundingClientRect().width && el.getBoundingClientRect().height).map(el => ({text:el.textContent.trim().slice(0,65), size:parseFloat(getComputedStyle(el).fontSize)}));
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, targets, minFont: Math.min(...text.map(x=>x.size)), undersize: text.filter(x=>x.size<15) };
    });
    assert.equal(layout.scrollWidth,width,`No horizontal overflow at ${width}`);
    assert.ok(layout.targets.every(x=>x.width>=44 && x.height>=44),`44px target floor at ${width}: ${JSON.stringify(layout.targets)}`);
    assert.ok(layout.minFont>=15,`15px text floor at ${width}: ${JSON.stringify(layout.undersize)}`);
    report.widths.push(layout);
    await capture(`type-${width}`);
    await page.keyboard.press('3');
    await page.waitForTimeout(90);
    await capture(`type-to-ring-intermediate-${width}`);
    await settle();
    await capture(`ring-${width}`);
    await page.keyboard.press('1');await settle();
  }
  report.checks.push('320/390/768/1440px: no horizontal overflow; every visible link/button >=44px; essential text >=15px.');
  await page.setViewportSize({ width:1440,height:1050 });
  await page.locator('[data-form="1"]').click();
  await page.waitForTimeout(120);
  const intermediate = await snapshot();
  const beforeHash = await capture('type-to-grid-intermediate');
  assert.ok(intermediate.running);
  assert.ok(intermediate.contours.some(c=>c.points.some(p=>Math.abs(p.vx)>1)));
  // Both samples occur in one event-loop turn, so a retarget cannot hide a reset.
  const continuity = await page.evaluate(() => {
    const before = window.__morphStudy.snapshot();
    document.querySelector('[data-form="2"]').click();
    const after = window.__morphStudy.snapshot();
    return { equal: JSON.stringify(before.contours)===JSON.stringify(after.contours), after };
  });
  assert.ok(continuity.equal,'Retarget preserves every displayed position and velocity exactly.');
  assert.ok(continuity.after.identitiesStable);
  report.checks.push('Synchronous mid-flight retarget preserves all 1,024 positions/velocities exactly; all contour/vertex identities survive.');
  await page.waitForTimeout(140);
  await capture('grid-to-ring-intermediate');
  for(const key of ['4','1','3','2','4','1','2','3','4']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(45);
  }
  await settle();
  const rapid = await snapshot();
  assert.equal(rapid.selected,3);
  assert.ok(rapid.identitiesStable);
  assert.ok(rapid.contours.every(c=>c.points.every(p=>Number.isFinite(p.x+p.y+p.vx+p.vy)&&p.vx===0&&p.vy===0)));
  report.checks.push('Nine rapid keyboard retargets settle directly into the final requested Fold; finite geometry and stable identities; no queue.');
  assert.notEqual(await capture('fold-1440'),beforeHash);
  for(const [key,name] of [['2','grid'],['3','ring'],['1','type-final']]) {
    await page.keyboard.press(key);await settle();await capture(`${name}-1440`);
  }
  const settledTicks=(await snapshot()).ticks;
  await page.waitForTimeout(150);
  assert.equal((await snapshot()).ticks,settledTicks);
  report.checks.push('RAF stops after settling.');
  await page.locator('[data-form="2"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal((await snapshot()).selected,3);
  assert.equal(await page.locator('[data-form="3"]').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('ArrowLeft');
  assert.equal((await snapshot()).selected,2);
  await page.locator('#edge').click();
  assert.equal(await page.locator('#edge').getAttribute('aria-pressed'),'false');
  await page.locator('#edge').click();
  report.checks.push('Number keys, focused-button arrow keys, direct buttons, and Edge light toggle work.');

  await page.emulateMedia({reducedMotion:'reduce'});
  await page.keyboard.press('2');
  const reduced = await snapshot();
  assert.ok(reduced.reduced && !reduced.running && reduced.selected===1 && reduced.fill===0);
  assert.ok(reduced.contours.every(c=>c.points.every(p=>p.vx===0&&p.vy===0)));
  await capture('reduced-motion-grid');
  report.checks.push('Live reduced-motion preference change cancels the clock; selection snaps to target with zero velocity.');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:390,height:200});
  await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
  await page.waitForFunction(()=>!window.__morphStudy.snapshot().visible);
  await page.keyboard.press('4');
  const paused=await snapshot();
  await page.waitForTimeout(120);
  assert.deepEqual((await snapshot()).contours,paused.contours);
  assert.ok(!(await snapshot()).running);
  await page.evaluate(()=>scrollTo(0,document.querySelector('#stage').offsetTop));
  await page.waitForFunction(()=>window.__morphStudy.snapshot().visible);
  await settle();
  assert.equal((await snapshot()).selected,3);
  report.checks.push('Actual offscreen IntersectionObserver pause freezes geometry, then resumes toward latest target on scroll.');

  // Chromium has no page-visibility override; exercise that lifecycle handler explicitly.
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    document.dispatchEvent(new Event('visibilitychange'));
    document.querySelector('[data-form="0"]').click();
  });
  const hidden=await snapshot();await page.waitForTimeout(100);
  assert.ok(!hidden.running);
  assert.deepEqual((await snapshot()).contours,hidden.contours);
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await settle();
  report.checks.push('Visibility handler verified with synthetic document.hidden + visibilitychange (not a real OS background tab).');
  assert.deepEqual(errors,[]);
  report.errors=errors;
  report.checks.push('No browser console errors or runtime exceptions.');
  const fallback = await browser.newPage({viewport:{width:390,height:844}});
  await fallback.addInitScript(()=>{HTMLCanvasElement.prototype.getContext=()=>null;});
  await fallback.goto(base);
  assert.ok(await fallback.locator('#fallback').isVisible());
  assert.equal(await fallback.locator('button:disabled').count(),5);
  await fallback.screenshot({path:new URL('canvas-unavailable.png',evidence).pathname,fullPage:true});
  await fallback.close();
  const noJS = await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});
  await noJS.goto(base);
  assert.equal(await noJS.locator('.controls').isVisible(),false);
  assert.ok(await noJS.locator('noscript p.stage-note').isVisible());
  await noJS.screenshot({path:new URL('javascript-disabled.png',evidence).pathname,fullPage:true});
  await noJS.close();
  report.checks.push('Canvas-unavailable fallback shows a static letter and disabled controls; JavaScript-disabled fallback shows a static letter and explanatory label.');
  await writeFile(new URL('verification.json',evidence),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
