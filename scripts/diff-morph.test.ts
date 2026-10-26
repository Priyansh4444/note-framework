import { expect, test } from "bun:test";
import { compileCodeArtifact } from "./code-blocks";
import type { CodeMorphPlan, CodeSide } from "../src/kit/code-morph-plan";
const project = (plan: CodeMorphPlan, side: CodeSide) =>
  plan.rows
    .filter((row) => row.kind === "source" && row[side]?.number)
    .map((row) =>
      row.parts
        .filter((part) => part[side] !== undefined)
        .map((part) => part.text)
        .join(""),
    );

test("compiled correspondence preserves context once and shared replacement tokens deterministically", async () => {
  const source =
    "--- a/test.ts\n+++ b/test.ts\n@@ -10,3 +10,4 @@\n const context = 0;\n-const value = 1;\n+const value = 200;\n+const extra = 3;\n return value;\n";
  const artifact = await compileCodeArtifact("diff", "test.diff", source);
  const repeated = await compileCodeArtifact("diff", "test.diff", source);
  expect(artifact).toEqual(repeated);
  if (artifact.kind !== "diff") throw Error("diff");
  expect(project(artifact.morph, "before")).toEqual([
    "const context = 0;",
    "const value = 1;",
    "return value;",
  ]);
  expect(project(artifact.morph, "after")).toEqual([
    "const context = 0;",
    "const value = 200;",
    "const extra = 3;",
    "return value;",
  ]);
  const shared = artifact.morph.rows.filter((row) => row.before && row.after);
  expect(
    shared
      .flatMap((row) => row.parts)
      .some((p) => p.before !== undefined && p.after !== undefined && p.text.includes("value")),
  ).toBe(true);
  const ids = artifact.morph.rows.flatMap((row) => [row.id, ...row.parts.map((p) => p.id)]);
  expect(new Set(ids).size).toBe(ids.length);
});

test("noncontiguous partial hunks retain original numbers, gaps, repeated Unicode, and missing-newline metadata", async () => {
  const source =
    "--- a/u.ts\r\n+++ b/u.ts\r\n@@ -4,2 +4,2 @@\r\n // 🦀 計算 é 👩‍💻\r\n-const a = 1;\r\n+const a = 2;\r\n@@ -80 +90 @@\r\n-const a = 1;\r\n+const a = 2;\r\n\\ No newline at end of file\r\n";
  const a = await compileCodeArtifact("diff", "u.diff", source);
  if (a.kind !== "diff") throw Error("diff");
  expect(a.source).toBe(source);
  expect(project(a.morph, "before")).toEqual(["// 🦀 計算 é 👩‍💻", "const a = 1;", "const a = 1;"]);
  expect(project(a.morph, "after")).toEqual(["// 🦀 計算 é 👩‍💻", "const a = 2;", "const a = 2;"]);
  expect(a.morph.rows.some((row) => row.parts.some((p) => p.text.includes("Omitted source")))).toBe(
    true,
  );
  expect(
    a.morph.rows.some((row) =>
      row.parts.some(
        (p) =>
          p.text === "No newline at end of file" && p.after !== undefined && p.before === undefined,
      ),
    ),
  ).toBe(true);
  expect(
    a.morph.rows.filter((row) => row.kind === "source").map((row) => row.before?.number),
  ).toEqual([4, 5, 80, undefined]);
});

test("adjacent hunks are continued excerpts without omitted source or cross-hunk matches", async () => {
  const source =
    "--- a/test.ts\n+++ b/test.ts\n@@ -4 +4 @@ first\n-const a = 1;\n+const b = 2;\n@@ -5 +5 @@ second\n-const b = 2;\n+const a = 1;\n";
  const a = await compileCodeArtifact("diff", "test.diff", source);
  if (a.kind !== "diff") throw Error("diff");
  expect(a.source).toBe(source);
  expect(
    a.morph.rows
      .filter((row) => row.kind === "metadata")
      .map((row) => row.parts.map((p) => p.text).join("")),
  ).toEqual(["Changed excerpt · @@ -4 +4 @@ first", "Continued excerpt · @@ -5 +5 @@ second"]);
  expect(project(a.morph, "before")).toEqual(["const a = 1;", "const b = 2;"]);
  expect(project(a.morph, "after")).toEqual(["const b = 2;", "const a = 1;"]);
  expect(
    a.morph.rows
      .filter((row) => row.kind === "source" && row.before && row.after)
      .map((row) => [row.before!.number, row.after!.number]),
  ).toEqual([
    [4, 4],
    [5, 5],
  ]);
});

test.each([
  ["insertion after replacement", "@@ -1 +1 @@\n-old\n+new\n@@ -1,0 +2 @@\n+added\n", false],
  ["deletion after replacement", "@@ -1 +1 @@\n-old\n+new\n@@ -2 +1,0 @@\n-removed\n", false],
  ["replacement after insertion", "@@ -0,0 +1 @@\n+added\n@@ -1 +2 @@\n-old\n+new\n", false],
  ["replacement after deletion", "@@ -1 +0,0 @@\n-removed\n@@ -2 +1 @@\n-old\n+new\n", false],
  ["old-side gap after insertion", "@@ -0,0 +1 @@\n+added\n@@ -2 +2 @@\n-old\n+new\n", true],
  ["new-side gap after deletion", "@@ -1 +0,0 @@\n-removed\n@@ -2 +2 @@\n-old\n+new\n", true],
])("zero-count boundaries: %s", async (_name, hunks, omitted) => {
  const source = `--- a/test.ts\n+++ b/test.ts\n${hunks}`;
  const a = await compileCodeArtifact("diff", "test.diff", source);
  if (a.kind !== "diff") throw Error("diff");
  expect(a.source).toBe(source);
  const headers = hunks.split("\n").filter((line) => line.startsWith("@@"));
  expect(
    a.morph.rows
      .filter((row) => row.kind === "metadata")
      .map((row) => row.parts.map((p) => p.text).join("")),
  ).toEqual([
    `Changed excerpt · ${headers[0]}`,
    `${omitted ? "⋯ Omitted source" : "Continued excerpt"} · ${headers[1]}`,
  ]);
});

for (const side of ["before", "after"] as const)
  test(`empty ${side} is explicit for a new/deleted file`, async () => {
    const source =
      side === "before"
        ? "--- /dev/null\n+++ b/new.ts\n@@ -0,0 +1 @@\n+const a = 1;\n"
        : "--- a/old.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-const a = 1;\n";
    const a = await compileCodeArtifact("diff", "new.diff", source);
    if (a.kind !== "diff") throw Error("diff");
    expect(project(a.morph, side)).toEqual([]);
    expect(
      a.morph.rows.some(
        (row) => row[side] && row.parts.some((p) => p.text === "No source on this side"),
      ),
    ).toBe(true);
  });

test("changed combining marks and emoji stay whole graphemes in persistent parts", async () => {
  const a = await compileCodeArtifact(
    "diff",
    "glyph.diff",
    '--- a/glyph.ts\n+++ b/glyph.ts\n@@ -1 +1 @@\n-const glyph = "👩‍💻 é";\n+const glyph = "👩‍🔬 è";\n',
  );
  if (a.kind !== "diff") throw Error("diff");
  const parts = a.morph.rows.filter((row) => row.kind === "source").flatMap((row) => row.parts);
  for (const glyph of ["👩‍💻", "👩‍🔬", "é", "è"])
    expect(parts.some((part) => part.text.includes(glyph))).toBe(true);
});

test("very long shared lines preserve both projections through the bounded matcher", async () => {
  const before = `const long = "${"👩‍💻é".repeat(1200)}";`;
  const after = `const long = "${"👩‍💻é".repeat(1200)}x";`;
  const a = await compileCodeArtifact(
    "diff",
    "long.diff",
    `--- a/long.ts\n+++ b/long.ts\n@@ -1 +1 @@\n-${before}\n+${after}\n`,
  );
  if (a.kind !== "diff") throw Error("diff");
  expect(project(a.morph, "before")).toEqual([before]);
  expect(project(a.morph, "after")).toEqual([after]);
});
