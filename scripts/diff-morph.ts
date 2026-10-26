import { FileRenderer, type FileContents } from "@pierre/diffs";
import type { CodeMorphPlan, MorphPart, MorphRow } from "../src/kit/code-morph-plan";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const glyphs = (text: string) => Array.from(segmenter.segment(text), (part) => part.segment);

type Line = { text: string; number: number; styles: string[]; noNewline?: boolean };
type Hunk = {
  header: string;
  omitted: boolean;
  before: Line[];
  after: Line[];
  runs: { before: Line[]; after: Line[] }[];
};

/** Order-preserving LCS, bounded at build time as well as at runtime. */
function matches(a: string[], b: string[]): [number, number][] {
  if (a.length * b.length > 160_000) {
    const out: [number, number][] = [];
    let i = 0;
    while (i < Math.min(a.length, b.length) && a[i] === b[i]) {
      out.push([i, i]);
      i++;
    }
    let x = a.length - 1,
      y = b.length - 1;
    const tail: [number, number][] = [];
    while (x >= i && y >= i && a[x] === b[y]) {
      tail.push([x--, y--]);
    }
    return [...out, ...tail.reverse()];
  }
  const width = b.length + 1,
    table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i * width + j] =
        a[i] === b[j]
          ? 1 + table[(i + 1) * width + j + 1]
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
  const out: [number, number][] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) out.push([i++, j++]);
    else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i++;
    else j++;
  }
  return out;
}

function parts(id: string, before?: Line, after?: Line): MorphPart[] {
  const a = glyphs(before?.text ?? ""),
    b = glyphs(after?.text ?? "");
  const shared = matches(a, b),
    out: MorphPart[] = [];
  function add(text: string, oldPaint?: string, newPaint?: string) {
    const last = out.at(-1);
    if (last && last.before === oldPaint && last.after === newPaint) {
      out[out.length - 1] = { ...last, text: last.text + text };
    } else
      out.push({
        id: `${id}:p${out.length}`,
        text,
        ...(oldPaint !== undefined ? { before: oldPaint } : {}),
        ...(newPaint !== undefined ? { after: newPaint } : {}),
      });
  }
  let i = 0,
    j = 0;
  for (const [x, y] of [...shared, [a.length, b.length]]) {
    while (i < x) {
      add(a[i], before!.styles[i], undefined);
      i++;
    }
    while (j < y) {
      add(b[j], undefined, after!.styles[j]);
      j++;
    }
    if (x < a.length) {
      add(a[x], before!.styles[x], after!.styles[y]);
      i++;
      j++;
    }
  }
  return out;
}

function parse(source: string): Hunk[] {
  const hunks: Hunk[] = [];
  let hunk: Hunk | undefined, run: Hunk["runs"][number] | undefined;
  let oldNumber = 0,
    newNumber = 0;
  let oldEnd = 0,
    newEnd = 0;
  let previous: Line[] = [];
  for (const raw of source.replace(/\r\n/g, "\n").split("\n")) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(raw);
    if (header) {
      const [oldStart, oldCount, newStart, newCount] = [
        Number(header[1]),
        Number(header[2] ?? 1),
        Number(header[3]),
        Number(header[4] ?? 1),
      ];
      const oldBoundary = oldCount === 0 ? oldStart : oldStart - 1;
      const newBoundary = newCount === 0 ? newStart : newStart - 1;
      const omitted = hunks.length > 0 && (oldBoundary > oldEnd || newBoundary > newEnd);
      hunk = { header: raw, omitted, before: [], after: [], runs: [] };
      hunks.push(hunk);
      oldEnd = oldBoundary + oldCount;
      newEnd = newBoundary + newCount;
      oldNumber = oldStart;
      newNumber = newStart;
      run = undefined;
      previous = [];
    } else if (hunk && raw === "\\ No newline at end of file") {
      previous.forEach((line) => {
        line.noNewline = true;
      });
    } else if (hunk && /^[ +-]/.test(raw)) {
      const marker = raw[0],
        text = raw.slice(1);
      previous = [];
      if (marker === " ") run = undefined;
      if (!run) {
        run = { before: [], after: [] };
        hunk.runs.push(run);
      }
      if (marker !== "+") {
        const line = { text, number: oldNumber++, styles: [] };
        hunk.before.push(line);
        run.before.push(line);
        previous.push(line);
      }
      if (marker !== "-") {
        const line = { text, number: newNumber++, styles: [] };
        hunk.after.push(line);
        run.after.push(line);
        previous.push(line);
      }
      if (marker === " ") run = undefined;
    }
  }
  return hunks;
}

async function paint(
  renderer: FileRenderer,
  name: string,
  language: FileContents["lang"],
  lines: Line[],
) {
  if (!lines.length) return;
  const result = await renderer.asyncRender({
    name,
    lang: language,
    contents: lines.map((line) => line.text).join("\n"),
  });
  let lineIndex = 0;
  for (const row of result.contentAST) {
    if (row.type !== "element" || row.properties["data-line"] === undefined) continue;
    const line = lines[lineIndex++];
    if (!line) break;
    const paints: string[] = [];
    const visit = (node: (typeof row.children)[number], style = "") => {
      if (node.type === "text") for (const _ of Array.from(node.value)) paints.push(style);
      else if (node.type === "element")
        node.children.forEach((child) => visit(child, String(node.properties.style ?? style)));
    };
    row.children.forEach((node) => visit(node));
    let offset = 0;
    line.styles = glyphs(line.text).map((glyph) => {
      const style = paints[offset] ?? "";
      offset += Array.from(glyph).length;
      return style;
    });
  }
}

/** Called only after the patch boundary has validated counts, order and file count. */
export async function compileDiffMorph(
  source: string,
  name: string,
  language: FileContents["lang"],
): Promise<CodeMorphPlan> {
  const hunks = parse(source),
    rows: MorphRow[] = [],
    counts = { before: 0, after: 0 };
  const renderer = new FileRenderer({
    theme: "github-dark",
    themeType: "dark",
    preferredHighlighter: "shiki-js",
    disableFileHeader: true,
  });
  function row(before?: Line, after?: Line, metadata?: string) {
    const id = `r${rows.length}`;
    const entry: MorphRow = {
      id,
      kind: metadata || before?.number === 0 || after?.number === 0 ? "metadata" : "source",
      ...(before || metadata
        ? { before: { index: counts.before++, ...(before ? { number: before.number } : {}) } }
        : {}),
      ...(after || metadata
        ? { after: { index: counts.after++, ...(after ? { number: after.number } : {}) } }
        : {}),
      parts: metadata
        ? [{ id: `${id}:p0`, text: metadata, before: "", after: "" }]
        : parts(id, before, after),
    };
    rows.push(entry);
    if (before?.noNewline || after?.noNewline) {
      const note = { text: "No newline at end of file", number: 0, styles: Array(25).fill("") };
      row(before?.noNewline ? note : undefined, after?.noNewline ? note : undefined);
    }
  }
  try {
    for (const [index, hunk] of hunks.entries()) {
      await paint(renderer, name, language, hunk.before);
      await paint(renderer, name, language, hunk.after);
      row(
        undefined,
        undefined,
        `${hunk.omitted ? "⋯ Omitted source" : index ? "Continued excerpt" : "Changed excerpt"} · ${hunk.header}`,
      );
      for (const run of hunk.runs) {
        // Exact context anchors are isolated by parse; changed runs pair only in
        // source order and only when they share substantial non-whitespace text.
        let a = 0,
          b = 0;
        while (a < run.before.length || b < run.after.length) {
          const old = run.before[a],
            next = run.after[b];
          if (!old) {
            row(undefined, next);
            b++;
            continue;
          }
          if (!next) {
            row(old);
            a++;
            continue;
          }
          const oldGlyphs = glyphs(old.text),
            newGlyphs = glyphs(next.text);
          const same = matches(oldGlyphs, newGlyphs);
          const useful = same.filter(([i]) => /\S/.test(oldGlyphs[i])).length;
          if (
            old.text === next.text ||
            useful >= Math.max(3, Math.min(old.text.trim().length, next.text.trim().length) * 0.35)
          ) {
            row(old, next);
            a++;
            b++;
          } else if (run.before.slice(a + 1).some((line) => line.text === next.text)) {
            row(old);
            a++;
          } else {
            row(undefined, next);
            b++;
          }
        }
      }
    }
    // Empty sides are explicit, including new and deleted files.
    for (const side of ["before", "after"] as const)
      if (!hunks.some((hunk) => hunk[side].length)) {
        const id = `r${rows.length}`;
        rows.push({
          id,
          kind: "metadata",
          [side]: { index: counts[side]++ },
          parts: [{ id: `${id}:p0`, text: "No source on this side", [side]: "" }],
        });
      }
    for (const side of ["before", "after"] as const) {
      const actual = rows
        .filter((r) => r.kind === "source" && r[side]?.number)
        .map((r) =>
          r.parts
            .filter((p) => p[side] !== undefined)
            .map((p) => p.text)
            .join(""),
        );
      const expected = hunks.flatMap((h) => h[side].map((l) => l.text));
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(`Morph ${side} projection differs from validated patch`);
    }
    return { version: 1, rows, counts };
  } finally {
    renderer.cleanUp();
  }
}
