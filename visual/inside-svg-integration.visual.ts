import { expect, test } from "./browser-test";
import { measureDocument } from "../scripts/audit-measure";

test("reduced motion opens the separated result before interaction", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/notes/inside-svg", { waitUntil: "networkidle" });
  const figure = page.locator("#svg-peel");
  await expect(figure).toHaveAttribute("data-nk-scene-time", "2600");
  await expect(figure).toHaveAttribute("data-nk-scene-active", "false");
  for (const label of await figure.locator(".svg-plane-label").all())
    await expect(label).toHaveCSS("opacity", "1");
});

test("source reasoning uses the shared keyboard disclosure and measured spacing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto("/notes/inside-svg", { waitUntil: "networkidle" });
  const summaries = page.locator(".svg-reason > summary");
  await expect(summaries).toHaveCount(2);
  for (const summary of await summaries.all()) {
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(summary.locator("..")).toHaveAttribute("open", "");
    const outline = await summary.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).toBe("none");
  }
  const measured = await page.evaluate(measureDocument);
  expect(
    measured.findings.filter((f) => f.kind === "failure" && f.rule.startsWith("disclosure-")),
  ).toEqual([]);
});
