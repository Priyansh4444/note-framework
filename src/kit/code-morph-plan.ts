/** Build-owned correspondence. Missing sides are patch omissions, never inferred source. */
export type CodeSide = "before" | "after";
export type MorphPart = Readonly<{ id: string; text: string; before?: string; after?: string }>;
export type MorphRow = Readonly<{
  id: string;
  before?: { index: number; number?: number };
  after?: { index: number; number?: number };
  parts: readonly MorphPart[];
  kind: "source" | "metadata";
}>;
export type CodeMorphPlan = Readonly<{
  version: 1;
  rows: readonly MorphRow[];
  counts: Record<CodeSide, number>;
}>;
