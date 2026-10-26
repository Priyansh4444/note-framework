import * as A from "./vendor/audit.mjs";
import * as g from "../geometry.ts";
import { writeFileSync, mkdirSync } from "node:fs";
const out = "artifacts/mechanical-reference";
mkdirSync(out, { recursive: true });
const R = A.recorder(g.P);
for (const part of g.parts) {
  const b = part.body,
    meta = { name: part.id, ground: part.id.startsWith("rubber-foot-") };
  const shape =
    b.kind === "slab" ? A.slab(b.plan, b.z, b.h, meta) : A.cylinder(b.x, b.y, b.r, b.z, b.h, meta);
  R.put({
    name: part.id,
    piece: part.moving ? "carriage" : "base",
    move: part.moving ? [30, 0, 0] : [0, 0, 0],
    at: part.center,
    svg: part.html,
    shapes: [R.solid(shape)],
  });
}
const states = [-1, -0.5, 0, 0.5, 1].map((x) => ({
  label: `stroke ${x * 30} mm`,
  shares: { carriage: x, base: 0 },
}));
A.settle(R, g.P, { states, step: 0.5 });
const result = A.audit(R, g.P, { frames: states, apart: false });
console.log(A.report(result));
writeFileSync(`${out}/geometry-report.json`, JSON.stringify(result, null, 2));
console.log(
  "audit: ",
  g.parts.length,
  "actual solids, 5 stroke positions; failures",
  A.failures(result),
);
process.exitCode = A.failures(result) ? 1 : 0;
