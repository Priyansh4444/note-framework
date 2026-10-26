import { chromium, type Locator } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { measureDocument } from "./audit-measure.ts";
const root = resolve(import.meta.dirname, "..");
const out = root + "/artifacts/preview";
mkdirSync(out, { recursive: true });
const base = process.env.FRAMEWORK_REVIEW_URL || "http://localhost:3151";
const browser = await chromium.launch();
const checks: string[] = [];
const geometry: unknown[] = [];
const assert = (ok: boolean, msg: string) => {
  if (!ok) throw new Error(msg);
  checks.push(msg);
};
async function reveal(target: Locator) {
  for (let depth = 0; depth < 8; depth++) {
    const closed = await target.locator("xpath=ancestor::details[not(@open)]").all();
    if (!closed.length) return;
    let opened = false;
    for (const parent of closed) {
      const summary = parent.locator(":scope > summary");
      if (await summary.isVisible()) {
        // Native disclosure content can still be opening when `open` is already true.
        // Read its declared UI timing; innerText/hit checks belong to the settled state.
        const duration = await parent.evaluate((el) => {
          const style = getComputedStyle(el, "::details-content");
          const ms = (text: string) => parseFloat(text) * (text.trim().endsWith("ms") ? 1 : 1000);
          const times = style.transitionDuration.split(",").map(ms),
            delays = style.transitionDelay.split(",").map(ms);
          return Math.max(
            0,
            ...times.map((time, i) => time + delays[i % delays.length]).filter(Number.isFinite),
          );
        });
        if (duration > 1500)
          throw new Error("Disclosure transition exceeds the review's 1500ms bound");
        await summary.click();
        if (duration) await target.page().waitForTimeout(duration + 32);
        opened = true;
        break;
      }
    }
    if (!opened) throw new Error("No visible disclosure opens the requested content");
  }
  throw new Error("Disclosure nesting exceeded the review limit");
}
for (const width of [1440, 1280, 768, 390, 320]) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [name, path] of [
    ["home", "/"],
    ["guide", "/docs"],
    ["example", "/notes/framework-demo"],
  ]) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    if (name !== "home") {
      const advanced = page.locator(".nk-code-block, .nk-equation");
      let visible = 0;
      for (const element of await advanced.all()) if (await element.isVisible()) visible++;
      assert(visible === 0, `${name}: code and equations are optional at ${width}`);
    }
    if (name === "example") {
      assert(
        !(await page.locator("#construction .bz-chain").isVisible()),
        `guide lines and construction counts stay optional at ${width}`,
      );
      assert(
        await page.locator("#construction").isVisible(),
        `the example begins with something to try at ${width}`,
      );
    }
    const measurement = await page.evaluate(measureDocument);
    geometry.push({ name, width, ...measurement });
    assert(
      measurement.findings.every((f) => f.kind !== "failure"),
      `${name}: measured geometry at ${width}`,
    );
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${name}: no overflow at ${width}`,
    );
    const duplicates = await page.evaluate(() => {
      const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
      return ids.filter((id, i) => ids.indexOf(id) !== i);
    });
    assert(duplicates.length === 0, `${name}: unique IDs at ${width}`);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    if ([1440, 390, 320].includes(width)) {
      await page.screenshot({
        path: `${out}/${name}-${width}.png`,
        fullPage: true,
      });
      await page.screenshot({ path: `${out}/${name}-${width}-top.png` });
    }
  }
  assert(errors.length === 0, `no runtime errors at ${width}`);
  await page.goto(base + "/");
  await page.getByRole("link", { name: "Guide", exact: true }).first().click();
  await page.getByRole("heading", { name: "Make your first note.", level: 1 }).waitFor();
  assert(new URL(page.url()).pathname === "/docs", `home → guide at ${width}`);
  await page.getByRole("link", { name: "Read the example", exact: true }).click();
  await page.getByRole("heading", { level: 1 }).filter({ hasText: "Draw a curve" }).waitFor();
  assert(
    new URL(page.url()).pathname === "/notes/framework-demo",
    `guide → local example at ${width}`,
  );
  await page
    .locator(".bz-first-try")
    .getByRole("button", { name: "Straight", exact: true })
    .click();
  await reveal(page.locator(".bz-zero-error"));
  assert(
    await page.locator(".bz-zero-error").isVisible(),
    `straight preset displays zero error at ${width}`,
  );
  await reveal(page.locator("#weight-experiment"));
  assert(
    (await page.locator("#weight-experiment").getByRole("slider").first().count()) === 1,
    `linked weight experiment at ${width}`,
  );
  await page.getByRole("button", { name: "S bend", exact: true }).click();
  assert(
    !(await page.locator(".bz-zero-error").isVisible()),
    `S bend restores log chart at ${width}`,
  );
  const handle = page.locator("#construction .bz-handle").first();
  const before = await handle.getAttribute("aria-valuetext");
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  const after = await handle.getAttribute("aria-valuetext");
  assert(before !== after, `keyboard point movement at ${width}`);
  assert(
    after ===
      (await page.locator("#weight-experiment .bz-handle").first().getAttribute("aria-valuetext")),
    `point edits propagate to other figures at ${width}`,
  );
  // Seek through the visible curved control; readout and SVG share its scene clock.
  const mix = page.locator("#mix").getByRole("slider", { name: "Mix playback", exact: true });
  await mix.press("Home");
  for (let step = 0; step < 25; step++) await mix.press("ArrowRight");
  await reveal(page.locator("#mix .bz-sum"));
  assert(
    (await page.locator("#mix .bz-sum").innerText()).includes("0.75"),
    `mix readout agrees with t at ${width}`,
  );
  await page.getByRole("link", { name: "Build a note like this" }).click();
  await reveal(page.locator("#interact"));
  await page.locator("#interact").waitFor();
  await page.locator("#interact input[type=range]").fill("0.75");
  assert(
    (await page.locator("#interact .guide-readout").innerText()).includes("65.0"),
    `guide signal computes 65 at ${width}`,
  );
  const scene = page.locator("#animate [data-nk-scene]");
  await scene.scrollIntoViewIfNeeded();
  await scene.locator("[data-nk-scene-action]").click();
  await page.waitForTimeout(180);
  await scene.locator('[data-nk-scene-action="pause"]').click();
  const paused = await scene.getAttribute("data-nk-scene-time");
  await page.waitForTimeout(160);
  assert(
    paused === (await scene.getAttribute("data-nk-scene-time")),
    `guide pauses on a stable frame at ${width}`,
  );
  await reveal(page.getByText("128 MiB", { exact: false }));
  assert(
    await page.getByText("128 MiB", { exact: false }).isVisible(),
    `hosting detail disclosure opens at ${width}`,
  );
  await page.close();
}
const page = await browser.newPage({
  viewport: { width: 390, height: 1000 },
  reducedMotion: "reduce",
});
await page.goto(base + "/docs", { waitUntil: "networkidle" });
const sweep = page.locator("#animate [data-nk-scene]");
await reveal(sweep);
assert(
  (await sweep.getAttribute("data-nk-scene-time")) ===
    (await sweep.getAttribute("data-nk-scene-length")),
  "reduced motion opens on the final sweep frame",
);
await page.goto(base + "/notes/framework-demo", { waitUntil: "networkidle" });
const scene = page.locator("#construction");
assert(
  (await scene.getAttribute("data-nk-scene-time")) ===
    (await scene.getAttribute("data-nk-scene-length")),
  "reduced motion construction opens on its final frame",
);
await page.close();
const clipboard = await browser.newContext({
  permissions: ["clipboard-read", "clipboard-write"],
});
const copyPage = await clipboard.newPage();
await copyPage.goto(base + "/docs#interact", { waitUntil: "networkidle" });
assert(
  await copyPage.locator("#interact input").isVisible(),
  "a direct link opens the optional technical section",
);
await copyPage.goto(base + "/docs", { waitUntil: "networkidle" });
const prompt = copyPage.locator("#first-note-prompt");
assert(
  (await prompt.inputValue()).includes(new URL(base).origin + "/llms.txt"),
  "the beginner prompt contains a usable instructions URL",
);
await prompt.fill("Explain how a line bends, with one picture I can change.");
await copyPage.getByRole("button", { name: "Copy prompt", exact: true }).click();
assert(
  (await copyPage.evaluate(() => navigator.clipboard.readText())) === (await prompt.inputValue()),
  "the beginner can edit and copy the prompt exactly",
);

for (const file of ["Slider.tsx", "Sweep.tsx", "guide/Prose.tsx"]) {
  const name = file.split("/").at(-1)!;
  const code = copyPage.locator(`figure.nk-code-block[aria-label="${name}"]`);
  await reveal(code);
  await code.getByRole("button", { name: "Copy source", exact: true }).click();
  const actual = await copyPage.evaluate(() => navigator.clipboard.readText());
  assert(
    actual === readFileSync(root + "/src/notes/framework/" + file, "utf8"),
    `${file}: Copy matches the running source exactly`,
  );
}
await clipboard.close();
await browser.close();
writeFileSync(
  out + "/browser-checks.json",
  JSON.stringify({ base, checks, geometry }, null, 2) + "\n",
);
console.log(`${checks.length} browser checks passed. Screenshots: ${out}`);
