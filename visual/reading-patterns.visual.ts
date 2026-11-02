import { expect, test } from "./browser-test";

for (const width of [390, 1440])
  test(`the reading path links the live curve to its visual treatments at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const badFonts: string[] = [];
    page.on("response", (r) => {
      if (/\.woff2?(\?|$)/.test(r.url()) && r.status() !== 200) badFonts.push(r.url());
    });
    await page.goto("/notes/framework-demo#forms", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    expect(badFonts).toEqual([]);
    const forms = page.locator("#forms"),
      morph = forms.locator(".nk-morph"),
      canvas = morph.locator("canvas");
    await expect(morph).toBeVisible();
    await expect(forms.locator(".nk-ink")).toBeHidden();
    await expect(page.locator('#code .nk-code-block[data-kind="code"]')).toBeHidden();
    await expect(page.locator("#weights .nk-equation")).toBeHidden();
    const snapshot = () => canvas.evaluate((n) => Reflect.get(n, "morphSnapshot")());
    const before = await snapshot();
    expect(before.contours).toHaveLength(24);
    const accentPixels = () =>
      canvas.evaluate((node: HTMLCanvasElement) => {
        const pixels = node.getContext("2d")!.getImageData(0, 0, node.width, node.height).data;
        let count = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (
            pixels[i + 3] > 200 &&
            pixels[i + 1] > pixels[i] * 1.5 &&
            pixels[i + 2] > pixels[i] * 1.5
          )
            count++;
        return count;
      });
    expect(await accentPixels()).toBeGreaterThan(10);
    await expect(forms).toContainText("Straight joins the endpoints");
    await expect(forms).toContainText("visual transitions, not new Bézier calculations");
    const originalNode = await canvas.elementHandle();
    const handle = page
      .locator(".bz-first-try")
      .getByRole("slider", { name: "Control point P₁", exact: true });
    await handle.press("Shift+ArrowRight");
    await morph.scrollIntoViewIfNeeded();
    await expect
      .poll(async () => JSON.stringify((await snapshot()).contours))
      .not.toBe(JSON.stringify(before.contours));
    expect(await canvas.evaluate((node, prior) => node === prior, originalNode)).toBe(true);
    expect((await snapshot()).identitiesStable).toBe(true);
    await morph.getByRole("radio", { name: "Straight", exact: true }).click();
    await expect(morph.getByRole("radio", { name: "Straight", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(await accentPixels()).toBeGreaterThan(10);
    await morph.getByRole("radio", { name: "Handles", exact: true }).click();
    await morph.getByRole("radio", { name: "Curve", exact: true }).click();
    await forms.screenshot({ path: info.outputPath(`forms-${width}.png`) });
    await forms.locator("summary").filter({ hasText: "What if the path were painted?" }).click();
    const ink = forms.locator(".nk-ink");
    await expect(ink).toBeVisible();
    await ink.getByRole("radio", { name: "Three strands", exact: true }).click();
    await expect(ink).toHaveAttribute("data-scene", "braid");
    await ink.screenshot({ path: info.outputPath(`ink-${width}.png`) });
    await page.locator("#code summary").filter({ hasText: "Read the working code" }).click();
    await expect(page.locator('#code .nk-code-block[data-kind="code"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await originalNode?.dispose();
  });

test("the note's morph retargets during motion without replacing its strips", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/notes/framework-demo#forms", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const morph = page.locator("#forms .nk-morph"),
    canvas = morph.locator("canvas");
  await morph.scrollIntoViewIfNeeded();
  await morph.getByRole("radio", { name: "Handles", exact: true }).click();
  await expect
    .poll(() => canvas.evaluate((n) => Reflect.get(n, "morphSnapshot")().running))
    .toBe(true);
  const change = await canvas.evaluate((n) => {
    const snapshot = () => Reflect.get(n, "morphSnapshot")();
    const before = snapshot();
    const button = n.closest("figure")!.querySelectorAll<HTMLButtonElement>('[role="radio"]')[2];
    button.click();
    return { before, after: snapshot() };
  });
  expect(change.after.contours).toEqual(change.before.contours);
  expect(change.after.selected).toBe("chord");
  expect(change.after.identitiesStable).toBe(true);
  await expect
    .poll(() => canvas.evaluate((n) => Reflect.get(n, "morphSnapshot")().running))
    .toBe(false);
  await morph.screenshot({ path: info.outputPath("normal-forms-390.png") });
});
