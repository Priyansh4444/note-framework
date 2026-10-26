import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
const directory = process.argv[2];
if (!directory) throw Error("Pass the independently exported starter directory.");
const html = readFileSync(join(directory, "dist-pattern-test-single/index.html"), "utf8");
const out = "artifacts/pattern-library";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [],
  requests = [],
  checks = [];
try {
  const p = await browser.newPage({ viewport: { width: 1000, height: 1100 } });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.route("**/*", (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await p.setContent(
    '<iframe sandbox="allow-scripts" style="width:100%;height:1050px;border:0"></iframe>',
  );
  await p.locator("iframe").evaluate((el, text) => (el.srcdoc = text), html);
  const frame = p.frameLocator("iframe");
  await frame.locator(".nk-morph canvas").waitFor();
  await frame.locator(".nk-ink line").last().waitFor();
  const morph = frame.locator(".nk-morph"),
    canvas = morph.locator("canvas");
  await morph.getByRole("button", { name: "Handles", exact: true }).click();
  await p.waitForTimeout(180);
  const continuity = await canvas.evaluate((n) => {
    const before = n.morphSnapshot();
    document.querySelectorAll(".nk-morph button")[2].click();
    const after = n.morphSnapshot();
    return { before, after };
  });
  assert.deepEqual(continuity.after.contours, continuity.before.contours);
  assert(continuity.before.moving);
  assert(continuity.after.identitiesStable);
  await p.waitForTimeout(1500);
  assert.equal((await canvas.evaluate((n) => n.morphSnapshot())).selected, "chord");
  await morph.screenshot({ path: `${out}/starter-opaque-morph.png` });
  checks.push(
    "Real intermediate contour geometry, synchronous interruption continuity, retained identity and last target.",
  );
  const layer = frame.locator(".nk-layers");
  await layer.getByRole("button", { name: "Handles", exact: true }).click();
  await layer.getByRole("button", { name: "Chords", exact: true }).click();
  await p.waitForTimeout(1500);
  assert.equal(await layer.getAttribute("data-layer"), "pieces");
  checks.push("Layer selection and settling operate in the opaque export.");
  const ink = frame.locator(".nk-ink");
  await ink
    .locator("line")
    .first()
    .evaluate((n) => {
      window.__inkNodes = [...n.parentElement.children];
    });
  await ink.getByRole("button", { name: "Three strands", exact: true }).click();
  await p.waitForTimeout(100);
  await ink.getByRole("button", { name: "Hatching", exact: true }).click();
  await p.waitForTimeout(1800);
  assert.equal(await ink.getAttribute("data-scene"), "hatch");
  assert(
    await ink
      .locator("svg")
      .evaluate((n) => window.__inkNodes.every((line, i) => line === n.children[i])),
  );
  checks.push("Seeded brush marks retain node identity across interrupted scene changes.");
  await p.setViewportSize({ width: 390, height: 1100 });
  await ink.scrollIntoViewIfNeeded();
  assert(await ink.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.screenshot({ path: `${out}/starter-opaque-390.png`, fullPage: true });
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
  checks.push("Opaque null origin, no runtime error or network request, no phone overflow.");
  // The independent export must contain current library/skill bytes, not merely a successful build.
  const rootFiles = [
    "src/kit/patterns/LayerFigure.tsx",
    "src/kit/patterns/MorphFigure.tsx",
    "src/kit/patterns/InkFigure.tsx",
    "src/kit/patterns/recipes.tsx",
    "src/kit/patterns/recipe-model.ts",
    ".agents/skills/layer-figures/SKILL.md",
    ".agents/skills/morph-figures/SKILL.md",
    ".agents/skills/ink-figures/SKILL.md",
  ];
  for (const name of rootFiles)
    assert.equal(readFileSync(join(directory, name), "utf8"), readFileSync(name, "utf8"), name);
  checks.push("Independent source and all three skills match framework bytes.");
  writeFileSync(
    `${out}/export-report.json`,
    JSON.stringify({ checks, errors, networkRequests: requests }, null, 2),
  );
  console.log(checks.join("\n"));
} finally {
  await browser.close();
}
