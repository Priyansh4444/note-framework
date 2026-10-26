import * as k from "./vendor/iso-kit";
export const width = 720,
  height = 440;
const bed: k.Plan = { x: -110, y: -72, w: 220, d: 144, r: 8 };
export const P = k.fitProjection(k.boxCorners(bed, -18, 50), width, height, {
  pad: 40,
  azimuth: 45,
});
export const axis = k.axisVector(P, [1, 0, 0]);
export const gripPoint = k.iso([0, 0, 37], P);
export const at = (point: k.Point3) => k.iso(point, P);
type Body =
  | { kind: "slab"; plan: k.Plan; z: number; h: number }
  | { kind: "cylinder"; x: number; y: number; r: number; z: number; h: number };
export type Part = { id: string; html: string; body: Body; center: k.Point3; moving: boolean };
export const parts: Part[] = [];
function slab(
  id: string,
  plan: k.Plan,
  z: number,
  h: number,
  style: k.SolidStyle = {},
  moving = false,
  extra = "",
) {
  parts.push({
    id,
    html: k.solidSvg(k.slabOf(plan, z, h, P, 8, 0.5), { ...style, inner: extra }),
    body: { kind: "slab", plan, z, h },
    center: [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2],
    moving,
  });
}
function cylinder(
  id: string,
  x: number,
  y: number,
  r: number,
  z: number,
  h: number,
  style: k.SolidStyle = {},
  moving = false,
  extra = "",
) {
  parts.push({
    id,
    html: k.solidSvg(k.cylinder(x, y, r, z, h, P, 48, 0.3), { ...style, inner: extra }),
    body: { kind: "cylinder", x, y, r, z, h },
    center: [x, y, z + h / 2],
    moving,
  });
}
const line = (d: string, tone: k.LineTone = "lo") => k.lineSvg(d, { tone });
function bolt(id: string, x: number, y: number, z: number, moving = false) {
  cylinder(`${id}-washer`, x, y, 1.8, z, 0.5, { tone: "lo" }, moving);
  cylinder(
    `${id}-head`,
    x,
    y,
    1.1,
    z + 0.5,
    0.8,
    { tone: "mid" },
    moving,
    k.dotsSvg([at([x, y, z + 1.3])], { size: 0.45 }),
  );
}
for (const [i, [x, y]] of k.corners(bed, 17).entries()) {
  cylinder(`rubber-foot-${i}`, x, y, 6, -18, 2, { tone: "lo" });
  cylinder(`metal-foot-${i}`, x, y, 4.5, -16, 4, { tone: "mid" });
}
slab(
  "bed",
  bed,
  -12,
  12,
  { tone: "lo" },
  false,
  line(k.planOutline(k.insetPlan(bed, 5), 0, P), "faint"),
);
for (const [i, [x, y]] of k.corners(bed, 9).entries()) bolt(`bed-bolt-${i}`, x, y, 0);
const ruler: k.Plan = { x: -90, y: 62, w: 104, d: 6, r: 1 };
const ticks = k.topTicks(-86, 10, 4, 5, 62, 0.7, [2, 4], P);
slab("ruler", ruler, 0, 0.7, { tone: "lo" }, false, line(ticks.minor) + line(ticks.major, "mid"));
const label: k.Plan = { x: -96, y: -62, w: 39, d: 17, r: 1.2 };
slab(
  "label",
  label,
  0,
  0.7,
  { tone: "lo" },
  false,
  [0, 1, 2]
    .map((i) =>
      k.lineSvg(k.lineOnTop([-89, -57 + i * 3], [-65 + i * 5, -57 + i * 3], 0.7, P), {
        free: true,
        tone: "faint",
      }),
    )
    .join(""),
);
for (const x of [-93, -60]) cylinder(`label-rivet-${x}`, x, -53.5, 0.7, 0.7, 0.3, { tone: "lo" });
for (const [side, y] of [-20, 20].entries()) {
  slab(`rail-${side}`, { x: -88, y: y - 2, w: 176, d: 4, r: 1 }, 9, 4, { tone: "mid" });
  for (const x of [-85, 85]) {
    slab(`rail-foot-${side}-${x}`, { x: x - 5, y: y - 7, w: 10, d: 14, r: 1 }, 0, 9, {
      tone: "lo",
    });
    slab(`rail-clamp-${side}-${x}`, { x: x - 4, y: y - 7, w: 8, d: 14, r: 0.8 }, 13, 1, {
      tone: "mid",
    });
    for (const dy of [-5, 5]) bolt(`clamp-${side}-${x}-${dy}`, x, y + dy, 14);
  }
}
for (const x of [-61, 56]) {
  slab(`stop-${x}`, { x, y: -7, w: 5, d: 14, r: 1 }, 0, 18, { tone: "lo" });
  slab(`stop-pad-${x}`, { x, y: -7, w: 5, d: 14, r: 1 }, 18, 1, { tone: "mid" });
}
slab("spring-anchor", { x: -90, y: -8, w: 7, d: 16, r: 1.2 }, 0, 32, { tone: "mid" });
bolt("anchor", -86.5, 0, 32);
slab("damper-foot", { x: 70, y: -10, w: 25, d: 20, r: 2 }, 0, 18, { tone: "lo" });
slab(
  "damper",
  { x: 70, y: -6, w: 25, d: 12, r: 2 },
  18,
  14,
  { tone: "mid" },
  false,
  line(k.sideSeam({ x: 70, y: -6, w: 25, d: 12, r: 2 }, 25, P), "faint"),
);
slab("gland", { x: 66, y: -5, w: 4, d: 10, r: 1 }, 21, 10, { tone: "mid" });
cylinder(
  "damping-knob",
  83,
  0,
  4.5,
  32,
  4,
  { tone: "hi" },
  false,
  line(k.knurl(83, 0, 4.5, 32, 36, 28, P)),
);
for (const x of [-18, 18])
  for (const y of [-20, 20]) {
    slab(`shoe-${x}-${y}`, { x: x - 4, y: y - 4, w: 8, d: 8, r: 1 }, 13, 5, { tone: "mid" }, true);
  }
slab("carriage", { x: -25, y: -26, w: 50, d: 52, r: 3 }, 18, 5, { tone: "hi", lit: true }, true);
slab(
  "cap",
  { x: -23, y: -24, w: 46, d: 48, r: 2 },
  23,
  5,
  { tone: "hi", lit: true },
  true,
  line(k.planOutline({ x: -19, y: -20, w: 38, d: 40, r: 2 }, 28, P), "lo"),
);
slab("left-seat", { x: -26, y: -6, w: 3, d: 12, r: 0.5 }, 23, 6, { tone: "hi" }, true);
slab("right-seat", { x: 23, y: -4, w: 3, d: 8, r: 0.5 }, 23, 6, { tone: "hi" }, true);
for (const x of [-18, 18]) for (const y of [-19, 19]) bolt(`shoe-bolt-${x}-${y}`, x, y, 28, true);
cylinder("grip-stem", 0, 0, 3, 28, 4, { tone: "hi", lit: true }, true);
cylinder(
  "grip",
  0,
  0,
  7,
  32,
  5,
  { tone: "hi", lit: true },
  true,
  line(k.knurl(0, 0, 7, 32, 37, 36, P), "lo"),
);
slab("gauge-foot", { x: 32, y: 29, w: 36, d: 36, r: 3 }, 0, 3, { tone: "lo" });
cylinder("gauge-post", 50, 47, 5, 3, 13, { tone: "mid" });
const dialTicks = k.radialTicks(50, 47, 15.5, 40, 5, 23, [1.2, 3], P);
cylinder(
  "gauge",
  50,
  47,
  17,
  16,
  7,
  { tone: "hi" },
  false,
  line(k.ring(50, 47, 15.5, 23, P), "lo") + line(dialTicks.minor) + line(dialTicks.major, "mid"),
);
export const shadow = k.haloOf(bed, -18, 0.1, P);
export const staticParts = parts
  .filter((p) => !p.moving)
  .sort((a, b) => k.depthOf(a.center, P) - k.depthOf(b.center, P));
export const movingParts = parts
  .filter((p) => p.moving)
  .sort((a, b) => k.depthOf(a.center, P) - k.depthOf(b.center, P));
const springShape = { from: -83, lead: 4, radius: 3.6, turns: 8, samples: 256, z: 26, tip: -26 };
function springSamples(x: number): { point: k.Point3; near: boolean }[] {
  const c = springShape,
    start = c.from + c.lead,
    end = x + c.tip - c.lead;
  const out: { point: k.Point3; near: boolean }[] = [];
  const dx = (end - start) / (c.turns * Math.PI * 2),
    norm = Math.hypot(dx, c.radius);
  const tangent: k.Point3 = [(dx / norm) * 1.5, 0, (c.radius / norm) * 1.5];
  const curve = (a: k.Point3, b: k.Point3, d: k.Point3, e: k.Point3, first: number) => {
    for (let i = first; i <= 24; i++) {
      const t = i / 24,
        u = 1 - t;
      out.push({
        point: [0, 1, 2].map(
          (j) => u * u * u * a[j] + 3 * u * u * t * b[j] + 3 * u * t * t * d[j] + t * t * t * e[j],
        ) as k.Point3,
        near: true,
      });
    }
  };
  curve(
    [c.from, c.radius, c.z],
    [c.from + 2, c.radius, c.z],
    [start - tangent[0], c.radius, c.z - tangent[2]],
    [start, c.radius, c.z],
    0,
  );
  for (let i = 1; i <= c.samples; i++) {
    const p = i / c.samples,
      angle = p * c.turns * Math.PI * 2;
    out.push({
      point: [
        start + (end - start) * p,
        c.radius * Math.cos(angle),
        c.z + c.radius * Math.sin(angle),
      ],
      near: k.depthOf([0, Math.cos(angle), Math.sin(angle)], P) > 0,
    });
  }
  curve(
    [end, c.radius, c.z],
    [end + tangent[0], c.radius, c.z + tangent[2]],
    [x + c.tip - 2, c.radius, c.z],
    [x + c.tip, c.radius, c.z],
    1,
  );
  return out;
}
/** The renderer and physical audit use the same smooth-ended wire centerline. */
export const springPoints = (x: number) => springSamples(x).map((sample) => sample.point);
export function spring(x: number) {
  const paths = { back: [] as string[], front: [] as string[] };
  const samples = springSamples(x);
  let run: k.Flat[] = [],
    near = samples[0].near;
  for (const sample of samples) {
    const point = at(sample.point);
    run.push(point);
    if (sample.near !== near) {
      paths[near ? "front" : "back"].push(k.pathOf(run));
      run = [point];
      near = sample.near;
    }
  }
  paths[near ? "front" : "back"].push(k.pathOf(run));
  return { back: paths.back.join(""), front: paths.front.join("") };
}
export const rodPlan = (x: number): k.Plan => ({ x: x + 26, y: -1, w: 66 - x - 26, d: 2, r: 0.7 });
export const rod = (x: number) => k.slabOf(rodPlan(x), 25, 2, P, 4);
export const translate = (x: number) => k.translateAlong(P, [x, 0, 0]);
export function needle(x: number) {
  const angle = (x / 30) * Math.PI * 0.72;
  return k.lineOnTop(
    [50 + Math.sin(angle) * 2, 47 - Math.cos(angle) * 2],
    [50 - Math.sin(angle) * 11, 47 + Math.cos(angle) * 11],
    23.2,
    P,
  );
}
export const zero = k.lineOnTop([0, 62], [0, 68], 0.7, P);
