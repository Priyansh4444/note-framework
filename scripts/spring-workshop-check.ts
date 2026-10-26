import { chromium } from "playwright";
import { expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { LINE_ENDS } from "../src/notes/spring-workshop/verification/vendor/line-ends.mjs";
const out = "artifacts/mechanical-reference";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const results: unknown[] = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 2,
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    (process.env.FRAMEWORK_REVIEW_URL ?? "http://localhost:3151") + "/notes/spring-workshop",
    { waitUntil: "networkidle" },
  );
  const root = page.locator("#spring-instrument");
  const grip = page.getByRole("slider", { name: "Carriage displacement" });
  for (const theme of ["dark", "paper"]) {
    if (theme === "paper")
      await page.getByRole("button", { name: "Paper off", exact: true }).click();
    for (const key of ["Home", "ArrowRight", "End"]) {
      await grip.press(key);
      const result = (await page.evaluate(`(${LINE_ENDS})({select:'.spring-card'})`)) as {
        problems: unknown[];
        ends: number;
      };
      results.push({ theme, key, ...result });
      expect(result.problems).toEqual([]);
      await root.screenshot({ path: `${out}/${theme}-${key}.png` });
    }
    // Render SVG at 4× CSS scale in a separate unclipped document. Original nodes
    // are cloned only for inspection; the operating figure retains its own nodes.
    const art = await root.locator(".spring-card").evaluate((el) => el.outerHTML);
    const styles = await page
      .locator('style,link[rel="stylesheet"]')
      .evaluateAll((nodes) => nodes.map((n) => n.outerHTML).join(""));
    const close = await browser.newPage({ viewport: { width: 3000, height: 2100 } });
    await close.setContent(
      `<html><head>${styles}</head><body class="note-spring-workshop"><div style="width:2800px">${art}</div></body></html>`,
    );
    await close.locator(".spring-card").screenshot({ path: `${out}/${theme}-4x.png` });
    await close.close();
  }
  expect(errors).toEqual([]);
  writeFileSync(`${out}/line-results.json`, JSON.stringify(results, null, 2));
  console.log(
    "PASS: official Anatomy line-end check, two themes × three positions, 4× renders, no runtime errors.",
  );
} finally {
  await browser.close();
}
