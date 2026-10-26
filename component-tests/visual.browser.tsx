import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { createSignal } from "solid-js";
import { Parameter } from "../src/kit/Parameter";
import { CurveMorphExample, LayersExample, InkExample } from "../src/kit/patterns/recipes";
import { CurveTimeline } from "../src/kit/CurveTimeline";
import { createScene } from "../src/post/scene/clock";
import { mount, painted } from "./mount";

const renderer = import.meta.env.VITE_VISUAL_BASELINE;
if (renderer !== undefined && renderer !== "ubuntu-24")
  throw new Error("Unknown visual baseline renderer.");
const screenshotName = (name: string) => (renderer ? `${name}-${renderer}` : name);

const patterns = [
  { name: "morph", component: CurveMorphExample, choice: "Straight" },
  { name: "layers", component: LayersExample, choice: "Chords" },
  { name: "ink", component: InkExample, choice: "Hatching" },
] as const;

for (const width of [1280, 390]) {
  for (const pattern of patterns) {
    test(`${pattern.name} selected form at ${width}px`, async () => {
      await page.viewport(width, 900);
      const Component = pattern.component;
      const { container } = mount(() => <Component />);
      await page.getByRole("button", { name: pattern.choice, exact: true }).click();
      await expect
        .element(page.getByRole("button", { name: pattern.choice, exact: true }))
        .toHaveAttribute("aria-pressed", "true");
      await painted();
      expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth);
      await expect(page.elementLocator(container)).toMatchScreenshot(
        screenshotName(`${pattern.name}-${width}`),
      );
    });
  }

  test(`native and curved controls at ${width}px`, async () => {
    await page.viewport(width, 900);
    const { container } = mount(() => {
      const [value, setValue] = createSignal(42);
      const scene = createScene([
        { label: "Start", ms: 1000 },
        { label: "Reveal", ms: 1000 },
      ]);
      scene.seek(800);
      return (
        <>
          <Parameter
            label="Refinement"
            value={value()}
            min={0}
            max={100}
            step={0.1}
            unit="%"
            onInput={setValue}
          />
          <CurveTimeline scene={scene} label="Construction timeline" />
        </>
      );
    });
    await painted();
    expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth);
    await expect(page.elementLocator(container)).toMatchScreenshot(
      screenshotName(`controls-${width}`),
    );
  });
}
