import * as A from "./vendor/audit.mjs";
import * as g from "../geometry.ts";
import * as k from "../vendor/iso-kit.ts";
import { writeFileSync } from "node:fs";
let failed = false;
const results = [];
const pairs = [];
let baseItems, baseOverlaps;
for (const x of [-30, 0, 30]) {
  const R = A.recorder(g.P);
  for (const part of g.parts) {
    const b = part.body,
      meta = { name: part.id, ground: part.id.startsWith("rubber-foot-") };
    let shape =
      b.kind === "slab"
        ? A.slab(b.plan, b.z, b.h, meta)
        : A.cylinder(b.x, b.y, b.r, b.z, b.h, meta);
    const offset = part.moving ? [x, 0, 0] : [0, 0, 0];
    shape = A.moved(shape, offset);
    R.put({
      name: part.id,
      at: part.center.map((v, i) => v + offset[i]),
      svg: `<g transform="${g.translate(offset[0])}">${part.html}</g>`,
      shapes: [R.solid(shape)],
    });
  }
  const plan = g.rodPlan(x);
  R.put({
    name: "rod",
    at: [(x + 26 + 66) / 2, 0, 26],
    svg: k.solidSvg(g.rod(x)),
    shapes: [R.solid(A.slab(plan, 25, 2, { name: "rod" }))],
  });
  const points = g.springPoints(x);
  const shapes = R.route("spring", points, 0.2, { owner: "spring" });
  const coil = g.spring(x);
  R.put({
    name: "spring",
    at: [(-83 + x - 26) / 2, 0, 26],
    svg: k.lineSvg(coil.back) + k.lineSvg(coil.front),
    shapes,
  });
  A.settle(R, g.P, { states: [0], step: 0.5 });
  const result = A.audit(R, g.P, { frames: [0], apart: false });
  const state = { label: `stroke ${x} mm`, shares: { carriage: x / 30, half: x / 30, base: 0 } };
  pairs.push(...R.settled.overlaps.pairs.map((pair) => ({ ...pair, state })));
  if (x === 0) {
    baseItems = R.items;
    baseOverlaps = R.settled.overlaps;
  }

  results.push({ x, result });
  console.log("STROKE", x, "\n", A.report(result));
  if (A.failures(result)) failed = true;
}
for (const item of baseItems) {
  const moving = g.parts.find((p) => p.id === item.name)?.moving;
  item.piece = moving
    ? "carriage"
    : item.name === "rod" || item.name === "spring"
      ? "half"
      : "base";
  item.ride = item.piece;
  item.move = moving ? [30, 0, 0] : item.piece === "half" ? [15, 0, 0] : [0, 0, 0];
}
const union = { ...baseOverlaps, pairs, states: [...new Set(pairs.map((p) => p.state))] };
const solved = A.orderKeys(baseItems, union);
const final = baseItems.map((item, i) => ({ ...item, key: solved.keys[i] }));
const paint = A.depthOrder(final, g.P, { overlaps: union, solved, rest: union.states });
console.log(
  "Actual shared paint plan:",
  paint.problems.length,
  "problems;",
  paint.missing.length,
  "unrecorded items",
);
if (paint.problems.length || paint.missing.length) failed = true;
writeFileSync(
  new URL("../paint-order.json", import.meta.url),
  JSON.stringify(
    final.map((item) => ({ id: item.name, key: item.key, motion: item.piece })),
    null,
    2,
  ) + "\n",
);
writeFileSync("artifacts/mechanical-reference/paint-report.json", JSON.stringify(paint, null, 2));
writeFileSync(
  "artifacts/mechanical-reference/dynamic-report.json",
  JSON.stringify(results, null, 2),
);
process.exitCode = failed ? 1 : 0;
