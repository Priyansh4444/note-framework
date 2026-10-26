import type { CodeMorphPlan, CodeSide, MorphRow } from "./code-morph-plan";

type Paint = { width: string; opacity: string; filter: string; transform: string };
type RowDOM = {
  plan: MorphRow;
  element: HTMLDivElement;
  parts: HTMLSpanElement[];
};
const css = `
:host { display:block; min-width:0; max-width:100%; font:inherit; color:#e1e4e8; background:transparent; }
* { box-sizing:border-box; }
pre { position:relative; display:block; width:100%; margin:0; padding:20px 22px 24px; overflow-x:auto; overflow-y:hidden;
  font:inherit; tab-size:2; white-space:pre; }
.morph-stage { position:relative; min-width:100%; }
.morph-row { position:absolute; top:0; left:0; width:max-content; white-space:pre; contain:layout style; border-radius:0; }
.morph-text { display:block; white-space:pre; }
.morph-part { display:inline-block; vertical-align:baseline; overflow:hidden; white-space:pre; font:inherit; }
.morph-ruler { position:absolute; left:0; top:0; width:max-content; visibility:hidden; white-space:pre; pointer-events:none; font:inherit; }
::selection { color:#101010; background:#fff; }
`;
const snapshot = (el: HTMLElement): Paint => {
  const s = getComputedStyle(el);
  return { width: s.width, opacity: s.opacity, filter: s.filter, transform: s.transform };
};

/** The compiler owns matching. This disposable runtime only measures and retargets
 * the persistent union of rows/parts; no source parsing or highlighting occurs. */
export function mountCodeMorph(
  root: ShadowRoot,
  plan: CodeMorphPlan,
  host: HTMLElement,
  onLayout = () => {},
) {
  const style = document.createElement("style");
  style.textContent = css;
  const pre = document.createElement("pre");
  pre.dataset.codeMorph = "";
  const stage = document.createElement("div");
  stage.className = "morph-stage";
  pre.append(stage);
  root.append(style, pre);
  // A patch is an excerpt source, not a full-file reconstruction. Its metadata
  // remains in Source tools; only actual source rows enter the reference frame.
  const indices: Record<CodeSide, number> = { before: 0, after: 0 };
  const sourceRows = plan.rows
    .filter((row) => row.kind === "source")
    .map((row) => ({
      ...row,
      before: row.before ? { ...row.before, index: indices.before++ } : undefined,
      after: row.after ? { ...row.after, index: indices.after++ } : undefined,
    }));
  const rows: RowDOM[] = sourceRows.map((row) => {
    const element = document.createElement("div");
    element.className = "morph-row";
    element.dataset.morphRow = row.id;
    element.dataset.kind = row.kind;
    const code = document.createElement("span");
    code.className = "morph-text";
    const parts = row.parts.map((part) => {
      const span = document.createElement("span");
      span.className = "morph-part";
      span.dataset.morphPart = part.id;
      span.textContent = part.text;
      code.append(span);
      return span;
    });
    element.append(code);
    stage.append(element);
    return { plan: row, element, parts };
  });
  let side: CodeSide = "before",
    disposed = false,
    generation = 0;
  let animations: Animation[] = [],
    deadline: ReturnType<typeof setTimeout> | undefined;
  let widths: Record<CodeSide, number[][]> | undefined;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const animateWithinBudget =
    rows.length <= 200 && rows.reduce((n, row) => n + row.parts.length, 0) <= 500;
  const cancel = () => {
    generation++;
    clearTimeout(deadline);
    animations.forEach((a) => a.cancel());
    animations = [];
  };
  const measure = () => {
    const result: Record<CodeSide, number[][]> = { before: [], after: [] };
    const ruler = document.createElement("span");
    ruler.className = "morph-ruler";
    ruler.setAttribute("aria-hidden", "true");
    pre.append(ruler);
    const range = document.createRange();
    for (const version of ["before", "after"] as const)
      for (const row of rows) {
        ruler.style.font = getComputedStyle(row.element).font;
        const text = row.plan.parts
          .filter((part) => part[version] !== undefined)
          .map((part) => part.text)
          .join("");
        const node = document.createTextNode(text);
        ruler.replaceChildren(node);
        // Range boxes use viewport pixels, while animation widths use local CSS
        // pixels. Normalize once for the whole line, including zoom/scale ancestors.
        const localWidth = parseFloat(getComputedStyle(ruler).width);
        const scale = localWidth > 0 ? ruler.getBoundingClientRect().width / localWidth : 1;
        let offset = 0,
          previous = 0;
        const measured = row.plan.parts.map((part) => {
          if (part[version] === undefined) return 0;
          offset += part.text.length;
          range.setStart(node, 0);
          range.setEnd(node, offset);
          const end = range.getBoundingClientRect().width / (scale || 1),
            width = end - previous;
          previous = end;
          return width;
        });
        result[version].push(measured);
      }
    range.detach();
    ruler.remove();
    return result;
  };
  const render = (next: CodeSide, requested: boolean) => {
    if (disposed) return;
    const bounds = host.getBoundingClientRect();
    const visible =
      !!host.getClientRects().length &&
      bounds.height > 0 &&
      bounds.bottom >= -200 &&
      bounds.top <= innerHeight + 200;
    const moving =
      requested &&
      animateWithinBudget &&
      visible &&
      !reduced.matches &&
      typeof pre.animate === "function";
    const oldRows = moving ? rows.map((row) => snapshot(row.element)) : [];
    const oldParts = moving ? rows.map((row) => row.parts.map(snapshot)) : [];
    const oldHeight = getComputedStyle(stage).height;
    cancel();
    side = next;
    widths ??= measure();
    const lineHeight = parseFloat(getComputedStyle(pre).lineHeight);
    const height = indices[side] * lineHeight;
    const animate = (
      element: HTMLElement,
      from: Partial<Paint>,
      to: Partial<Paint>,
      duration: number,
      easing = "cubic-bezier(.22,1,.36,1)",
    ) => {
      if (
        !moving ||
        Object.keys(to).every((key) => from[key as keyof Paint] === to[key as keyof Paint])
      )
        return;
      const start = Object.fromEntries(
        Object.keys(to).map((key) => [key, from[key as keyof Paint]]),
      );
      animations.push(element.animate([start, to], { duration, easing }));
    };
    rows.forEach((row, i) => {
      const active = row.plan[side],
        other = row.plan[side === "before" ? "after" : "before"];
      const target = {
        transform: new DOMMatrix([
          1,
          0,
          0,
          1,
          0,
          (active?.index ?? Math.min(other?.index ?? 0, indices[side] - 1)) * lineHeight,
        ]).toString(),
        opacity: active ? "1" : "0",
        filter: active ? "blur(0px)" : "blur(4px)",
      };
      row.element.style.visibility = moving || active ? "visible" : "hidden";
      row.element.setAttribute("aria-hidden", active ? "false" : "true");
      row.element.inert = !active;
      Object.assign(row.element.style, target);
      animate(
        row.element,
        oldRows[i] ?? target,
        { transform: target.transform, filter: target.filter },
        450,
      );
      animate(
        row.element,
        oldRows[i] ?? target,
        { opacity: target.opacity },
        300,
        "cubic-bezier(.4,0,.2,1)",
      );
      row.parts.forEach((part, j) => {
        const paint = row.plan.parts[j][side],
          present = paint !== undefined;
        const to = {
          width: `${widths![side][i][j]}px`,
          opacity: present ? "1" : "0",
          filter: present ? "blur(0px)" : "blur(4px)",
        };
        part.style.visibility = moving || present ? "visible" : "hidden";
        part.setAttribute("aria-hidden", present ? "false" : "true");
        part.style.userSelect = present && active ? "text" : "none";
        // All paint is emitted by Pierre's build-only AST adapter.
        part.style.cssText = `${paint ?? ""};visibility:${moving || present ? "visible" : "hidden"};width:${to.width};opacity:${to.opacity};filter:${to.filter};user-select:${present && active ? "text" : "none"}`;
        animate(part, oldParts[i]?.[j] ?? to, to, 400);
      });
    });
    stage.style.height = `${height}px`;
    if (moving && oldHeight !== stage.style.height)
      animations.push(
        stage.animate([{ height: oldHeight }, { height: `${height}px` }], {
          duration: 350,
          easing: "cubic-bezier(.22,1,.36,1)",
        }),
      );
    pre.dataset.side = side;
    const token = generation;
    const finish = () => {
      if (disposed || token !== generation) return;
      cancel();
      rows.forEach((row) => {
        row.element.style.visibility = row.plan[side] ? "visible" : "hidden";
        row.parts.forEach((part, i) => {
          part.style.visibility =
            row.plan.parts[i][side] !== undefined && row.plan[side] ? "visible" : "hidden";
        });
      });
      onLayout();
    };
    if (animations.length) {
      Promise.allSettled(animations.map((animation) => animation.finished)).then(finish);
      // A bounded fallback also handles suspended tabs and interrupted promises.
      deadline = setTimeout(finish, 1500);
    } else finish();
  };
  const settle = () => render(side, false);
  const invalidate = () => {
    widths = undefined;
    settle();
  };
  // Font readiness and scrollbar-driven element resizes can arrive immediately
  // after a click. Remeasure from the current paint instead of cancelling its
  // first intermediate frame; explicit viewport changes still settle below.
  const remeasure = () => {
    widths = undefined;
    render(
      side,
      animations.some((animation) => animation.playState === "running"),
    );
  };
  const observer = new ResizeObserver(() => {
    const width = host.clientWidth;
    if (width !== lastWidth || !host.getClientRects().length) {
      lastWidth = width;
      remeasure();
    }
  });
  let lastWidth = host.clientWidth;
  observer.observe(host);
  // A closed ancestor can keep its old width while removing the listing from layout.
  const ancestors: HTMLDetailsElement[] = [];
  for (let parent = host.parentElement; parent; parent = parent.parentElement)
    if (parent instanceof HTMLDetailsElement) ancestors.push(parent);
  const disclosure = () => {
    if (ancestors.some((details) => !details.open) || !host.getClientRects().length) settle();
  };
  const mutations = new MutationObserver(disclosure);
  ancestors.forEach((details) =>
    mutations.observe(details, { attributes: true, attributeFilter: ["open"] }),
  );
  host.addEventListener("pointerdown", settle);
  host.addEventListener("keydown", settle);
  addEventListener("resize", invalidate);
  const offscreen = new IntersectionObserver(
    (entries) => {
      if (!entries[0]?.isIntersecting) settle();
    },
    { rootMargin: "200px" },
  );
  offscreen.observe(host);
  document.addEventListener("toggle", disclosure, true);
  document.fonts.addEventListener("loadingdone", remeasure);
  document.fonts.ready.then(() => {
    if (!disposed) remeasure();
  });
  reduced.addEventListener("change", settle);
  render(side, false);
  return {
    show(next: CodeSide, motion: boolean) {
      if (next !== side) render(next, motion);
    },
    settle,
    dispose() {
      disposed = true;
      cancel();
      observer.disconnect();
      offscreen.disconnect();
      mutations.disconnect();
      host.removeEventListener("pointerdown", settle);
      host.removeEventListener("keydown", settle);
      removeEventListener("resize", invalidate);
      document.removeEventListener("toggle", disclosure, true);
      document.fonts.removeEventListener("loadingdone", remeasure);
      reduced.removeEventListener("change", settle);
      style.remove();
      pre.remove();
    },
  };
}
