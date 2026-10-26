/** Explicit geometric obligations, measured by the development-only browser auditor. */
export type AuditLayout = {
  align?: "x-start" | "x-center" | "x-end" | "y-start" | "y-center" | "y-end";
  gaps?: "x" | "y";
  count?: number;
  visible?: boolean;
  separate?: number;
  tolerancePx?: number;
};

export type AuditLayoutAttributes = Partial<
  Record<
    | "data-nk-audit-align"
    | "data-nk-audit-gaps"
    | "data-nk-audit-count"
    | "data-nk-audit-visible"
    | "data-nk-audit-separate"
    | "data-nk-audit-tolerance-px",
    string
  >
>;

export function auditLayout(options: AuditLayout): AuditLayoutAttributes {
  const attrs: AuditLayoutAttributes = {};
  const names = {
    align: "align",
    gaps: "gaps",
    count: "count",
    visible: "visible",
    separate: "separate",
    tolerancePx: "tolerance-px",
  } as const;
  // Runtime validation also protects JS authors and options arriving through object spreads.
  for (const [key, value] of Object.entries(options)) {
    if (!Object.hasOwn(names, key)) throw new TypeError(`Unknown auditLayout option: ${key}`);
    if (value === undefined) continue;
    if (key === "align" && !/^[xy]-(start|center|end)$/.test(String(value)))
      throw new TypeError("Invalid audit alignment");
    if (key === "gaps" && value !== "x" && value !== "y")
      throw new TypeError("Invalid audit gap axis");
    if (key === "visible" && typeof value !== "boolean")
      throw new TypeError("audit visible must be boolean");
    if (["count", "separate", "tolerancePx"].includes(key)) {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        (key === "count" && !Number.isSafeInteger(value))
      ) {
        throw new TypeError(
          `audit ${key} must be a finite nonnegative ${key === "count" ? "integer" : "number"}`,
        );
      }
    }
    attrs[`data-nk-audit-${names[key as keyof typeof names]}`] = String(value);
  }
  return attrs;
}
