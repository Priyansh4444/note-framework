/**
 * Derivations that move like effect.institute's code: every token keeps its
 * identity between steps. Tokens present in both steps glide to their new
 * places, removed tokens fade out first, and new tokens fade in last. A change
 * of content is a new token, never a token that rewrites itself in place.
 */
export type TokenKind = "bin" | "rel";
export interface MorphToken {
  k: string;
  tex: string;
  kind?: TokenKind;
}
export interface MorphStep {
  lines: MorphToken[][];
  focus: ReadonlySet<string>;
}
/** `from === to` is a resting step; otherwise `ms` is time since the morph began. */
export interface MorphState {
  from: number;
  to: number;
  ms: number;
}

const RELATIONS = new Set(["=", "\\le", "\\ge", "<", ">", "\\approx"]);
const BINARIES = new Set(["+", "-", "\\cdot", "\\times"]);

/**
 * Author a step as whitespace-separated TeX tokens, one string per line.
 * `tex@key` names a token explicitly; otherwise its key is its TeX plus an
 * occurrence count. Name tokens that should travel, such as the two sides of a swap.
 * `+` and `-` are binary unless they open a line, follow `(`, or follow a relation.
 */
export function step(lines: readonly string[], focus: readonly string[] = []): MorphStep {
  const seen = new Map<string, number>();
  return {
    focus: new Set(focus),
    lines: lines.map((line) => {
      const tokens: MorphToken[] = [];
      for (const chunk of line.trim().split(/\s+/)) {
        const at = chunk.lastIndexOf("@");
        const tex = at > 0 ? chunk.slice(0, at) : chunk;
        const count = (seen.get(tex) ?? 0) + 1;
        seen.set(tex, count);
        const k = at > 0 ? chunk.slice(at + 1) : count === 1 ? tex : `${tex}#${count}`;
        const previous = tokens[tokens.length - 1];
        const unary = !previous || previous.tex.endsWith("(") || previous.kind === "rel";
        const kind = RELATIONS.has(tex) ? "rel" : BINARIES.has(tex) && !unary ? "bin" : undefined;
        tokens.push({ k, tex, kind });
      }
      return tokens;
    }),
  };
}

/** The whole step as one TeX string: what screen readers and the strict TeX check see. */
export function stepTex(s: MorphStep) {
  const line = (tokens: MorphToken[], align: boolean) => {
    const rel = tokens.findIndex((t) => t.kind === "rel");
    return tokens.map((t, i) => (align && i === rel ? `&${t.tex}` : t.tex)).join(" ");
  };
  return s.lines.length === 1
    ? line(s.lines[0], false)
    : `\\begin{aligned}${s.lines.map((l) => line(l, true)).join("\\\\")}\\end{aligned}`;
}

/** A key must mean one thing everywhere, or a glide would morph content silently. */
export function checkSteps(steps: readonly MorphStep[]) {
  const tex = new Map<string, string>();
  for (const s of steps)
    for (const line of s.lines)
      for (const t of line) {
        const prior = tex.get(t.k);
        if (prior !== undefined && prior !== t.tex)
          throw new Error(`MathMorph key "${t.k}" is both ${prior} and ${t.tex}`);
        tex.set(t.k, t.tex);
        if (!t.k) throw new Error("MathMorph token without a key");
      }
  for (const s of steps) {
    const keys = s.lines.flat().map((t) => t.k);
    if (new Set(keys).size !== keys.length)
      throw new Error(`MathMorph step repeats a key: ${keys.join(" ")}`);
  }
  return tex;
}
