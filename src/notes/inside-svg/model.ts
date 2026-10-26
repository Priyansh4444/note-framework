export type LayerId = "sky" | "sun" | "rear" | "front" | "frame";
export type WindowStop = "left" | "center" | "right";
type Shape = { readonly id: LayerId; readonly label: string } & (
  | {
      readonly kind: "rect";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | { readonly kind: "circle"; readonly cx: number; readonly cy: number; readonly r: number }
  | { readonly kind: "path"; readonly d: string }
);

// One original drawing, in a 300 × 260 coordinate system. All views use these records.
export const opening = "M60 240V105A90 90 0 0 1 240 105V240Z";
export const shapes: readonly Shape[] = Object.freeze([
  Object.freeze({ id: "sky", label: "Sky", kind: "rect", x: 0, y: 0, width: 300, height: 260 }),
  Object.freeze({ id: "sun", label: "Sun", kind: "circle", cx: 158, cy: 112, r: 35 }),
  Object.freeze({
    id: "rear",
    label: "Rear hill",
    kind: "path",
    d: "M0 195Q90 80 180 135Q240 175 300 120L300 260H0Z",
  }),
  Object.freeze({
    id: "front",
    label: "Front hill",
    kind: "path",
    d: "M0 225Q95 140 170 197Q230 230 300 160L300 260H0Z",
  }),
  Object.freeze({
    id: "frame",
    label: "Frame",
    kind: "path",
    d: `M46 252V105A104 104 0 0 1 254 105V252Z ${opening}`,
  }),
] satisfies Shape[]);
const behind: readonly LayerId[] = Object.freeze(["sky", "sun", "rear", "front", "frame"]);
const ahead: readonly LayerId[] = Object.freeze(["sky", "rear", "front", "sun", "frame"]);
export const orderFor = (sunFront: boolean): readonly LayerId[] => (sunFront ? ahead : behind);
export const windowOffset = (stop: WindowStop) => ({ left: -42, center: 0, right: 42 })[stop];
export const peelDuration = 2600;

/** Pixel layout reserves its final footprint, keeping the timeline still during seeking. */
export function peelLayout(width: number, fraction: number) {
  const columns = width < 460 ? 2 : 3;
  const gap = 20;
  const size = Math.min(180, (width - gap * (columns - 1)) / columns);
  const row = (size * 260) / 300 + 38;
  const height = Math.ceil(5 / columns) * row;
  const assembled = Math.min(290, width);
  const p = Math.max(0, Math.min(1, fraction));
  const eased = p * p * (3 - 2 * p);
  const gridWidth = columns * size + (columns - 1) * gap;
  return {
    height: Math.max(height, (assembled * 260) / 300 + 28),
    planes: shapes.map((shape, i) => ({
      id: shape.id,
      x:
        ((width - assembled) / 2) * (1 - eased) +
        ((width - gridWidth) / 2 + (i % columns) * (size + gap)) * eased,
      y: Math.floor(i / columns) * row * eased,
      width: assembled + (size - assembled) * eased,
      // Annotations wait until their moving planes no longer overlap.
      labelOpacity: p >= 0.9 ? 1 : 0,
    })),
  };
}
