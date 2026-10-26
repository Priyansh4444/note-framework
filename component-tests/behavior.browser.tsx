import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { createSignal, onCleanup } from "solid-js";
import { Parameter } from "../src/kit/Parameter";
import { CurveTimeline } from "../src/kit/CurveTimeline";
import { createScene } from "../src/post/scene/clock";
import { CurveMorphExample, LayersExample, InkExample } from "../src/kit/patterns/recipes";
import { mount, painted } from "./mount";

test("Parameter keyboard input and changed constraints agree with native sanitization", async () => {
  let changeMaximum = (_value: number) => {};
  mount(() => {
    const [value, setValue] = createSignal(0.75);
    const [max, setMax] = createSignal(1);
    changeMaximum = setMax;
    return (
      <Parameter
        label="Amount"
        min={0}
        max={max()}
        step={0.05}
        value={value()}
        onInput={setValue}
      />
    );
  });
  const slider = page.getByRole("slider", { name: "Amount" });
  changeMaximum(0.5);
  await expect.element(slider).toHaveValue("0.5");
  await expect.element(slider).toHaveAttribute("aria-valuetext", "0.5");
  await slider.click();
  await userEvent.keyboard("{Home}{ArrowRight}");
  await expect.element(slider).toHaveValue("0.05");
  await expect.element(slider).toHaveAttribute("aria-valuetext", "0.05");
});

test("curved timeline seeks exact beats and keyboard endpoints through the scene", async () => {
  mount(() => {
    const scene = createScene([
      { label: "Start", ms: 1000 },
      { label: "Reveal", ms: 1500 },
    ]);
    return <CurveTimeline scene={scene} label="Construction timeline" />;
  });
  const slider = page.getByRole("slider", { name: "Construction timeline" });
  await page.getByRole("button", { name: /Reveal/ }).click();
  await expect.element(slider).toHaveAttribute("aria-valuenow", "1000");
  slider.element().focus();
  await userEvent.keyboard("{End}");
  await expect.element(slider).toHaveAttribute("aria-valuenow", "2500");
  await userEvent.keyboard("{Home}{ArrowRight}");
  await expect.element(slider).toHaveAttribute("aria-valuenow", "25");
});

test("all recipes update the selected visual without replacing persistent drawing nodes", async () => {
  const { container } = mount(() => (
    <>
      <CurveMorphExample />
      <LayersExample />
      <InkExample />
    </>
  ));
  await painted();
  const canvas = container.querySelector("canvas");
  const layer = container.querySelector('[data-layer-id="guides"]');
  const marks = [...container.querySelectorAll(".nk-ink-mark")];
  expect(canvas).not.toBeNull();
  expect(layer).not.toBeNull();
  expect(marks).toHaveLength(240);
  await page.getByRole("button", { name: "Straight", exact: true }).click();
  await page.getByRole("button", { name: "Chords", exact: true }).click();
  await page.getByRole("button", { name: "Hatching", exact: true }).click();
  expect(container.querySelector("canvas")).toBe(canvas);
  expect(container.querySelector('[data-layer-id="guides"]')).toBe(layer);
  expect([...container.querySelectorAll(".nk-ink-mark")]).toEqual(marks);
  await expect.element(page.getByRole("img", { name: /24 strips.*Straight/ })).toBeVisible();
  await expect
    .element(page.getByRole("img", { name: /drawing into layers.*Chords/ }))
    .toBeVisible();
  await expect.element(page.getByRole("img", { name: /material.*Hatching/ })).toBeVisible();
});

test("unmount disposes the Solid owner and retained canvas runtime before removing DOM", async () => {
  let disposed = 0;
  const mounted = mount(() => {
    onCleanup(() => disposed++);
    return <CurveMorphExample />;
  });
  await painted();
  const canvas = mounted.container.querySelector("canvas")!;
  const snapshot: unknown = Reflect.get(canvas, "morphSnapshot");
  expect(snapshot).toBeTypeOf("function");
  if (typeof snapshot !== "function") throw new Error("Morph diagnostics unavailable");
  mounted.unmount();
  const after = snapshot();
  expect(after.disposed).toBe(true);
  expect(after.running).toBe(false);
  expect(disposed).toBe(1);
  expect(canvas.isConnected).toBe(false);
  await painted();
  expect(snapshot().paints).toBe(after.paints);
  mounted.unmount();
  expect(disposed).toBe(1);
});
