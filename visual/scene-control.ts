import type { Locator, Page } from "./browser-test";

/** Read the painted rail in screen coordinates; interaction still goes through the pointer. */
export async function railPoint(slider: Locator, fraction: number) {
  return slider.locator(".nk-timeline-rail").evaluate((path: SVGPathElement, fraction) => {
    const point = path.getPointAtLength(path.getTotalLength() * fraction);
    const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  }, fraction);
}

export async function scrubTo(page: Page, slider: Locator, fraction: number) {
  await slider.scrollIntoViewIfNeeded();
  await slider.press("Home");
  const start = await railPoint(slider, 0),
    target = await railPoint(slider, fraction);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y);
  await page.mouse.up();
}
