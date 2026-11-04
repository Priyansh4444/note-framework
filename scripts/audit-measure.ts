/** Browser-only code: keep this function self-contained so Playwright can serialize it. */
export type AuditRect = { x: number; y: number; width: number; height: number };
export type Finding = {
  kind: "failure" | "unverified";
  rule: string;
  ids: string[];
  rects?: AuditRect[];
  measured?: unknown;
  threshold?: unknown;
  hint: string;
};
export type Measurement = {
  findings: Finding[];
  evaluated: number;
  unsupported: number;
  gated: number;
  svgTexts: number;
  shadowRoots: number;
  codeContainers: number;
  deferred: number;
};

export async function measureDocument(): Promise<Measurement> {
  const result: Measurement = {
    findings: [],
    evaluated: 0,
    unsupported: 0,
    gated: 0,
    svgTexts: 0,
    shadowRoots: 0,
    codeContainers: 0,
    deferred: 0,
  };
  const all: Element[] = [];
  const visit = (root: Document | ShadowRoot) => {
    for (const el of root.querySelectorAll("*")) {
      all.push(el);
      if (el.shadowRoot) {
        result.shadowRoots++;
        visit(el.shadowRoot);
      }
    }
  };
  visit(document);
  const parent = (el: Element): Element | null =>
    el.parentElement ?? (el.getRootNode() as ShadowRoot).host ?? null;
  const chain = (el: Element) => {
    const ancestors: Element[] = [];
    for (let at: Element | null = el; at; at = parent(at)) ancestors.push(at);
    return ancestors;
  };
  const id = (el: Element) => {
    const path: string[] = [];
    for (let at: Element | null = el; at; at = parent(at)) {
      if (at.id) {
        path.unshift(`#${at.id}`);
        break;
      }
      const siblings = at.parentElement?.children;
      const position = siblings ? [...siblings].indexOf(at) + 1 : 1;
      path.unshift(`${at.localName}:nth-child(${position})`);
      if (at.getRootNode() instanceof ShadowRoot && !at.parentElement) path.unshift("::shadow");
    }
    return path.join(" > ");
  };
  const modal = all.find((el) => el.matches("dialog:modal"));
  const inClosedDisclosure = (el: Element) => {
    const ancestors = chain(el);
    // Use the same host-crossing chain for summary content inside open shadow roots.
    return ancestors.some((at) => {
      if (!(at instanceof HTMLDetailsElement) || at.open || at === el) return false;
      const summary = at.querySelector(":scope > summary");
      return !summary || !ancestors.includes(summary);
    });
  };
  const deferred = (el: Element) =>
    (!!modal && !chain(el).includes(modal)) || inClosedDisclosure(el);
  result.deferred = all.filter(deferred).length;
  const paintChain = (el: Element) => {
    const ancestors = chain(el),
      modalIndex = modal ? ancestors.indexOf(modal) : -1;
    return modalIndex < 0 ? ancestors : ancestors.slice(0, modalIndex + 1);
  };
  const rect = (el: Element): AuditRect => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const emit = (
    kind: Finding["kind"],
    rule: string,
    els: Element[],
    hint: string,
    measured?: unknown,
    threshold?: unknown,
  ) => {
    result.findings.push({
      kind,
      rule,
      ids: els.map(id),
      rects: els.map(rect),
      measured,
      threshold,
      hint,
    });
    if (kind === "unverified") result.unsupported++;
  };
  const check = (
    ok: boolean,
    rule: string,
    els: Element[],
    hint: string,
    measured?: unknown,
    threshold?: unknown,
  ) => {
    result.evaluated++;
    if (!ok) emit("failure", rule, els, hint, measured, threshold);
  };
  const gated = (el: Element) =>
    chain(el).some(
      (at) =>
        at.matches(".scene-content, .scene-controls") &&
        chain(at).some(
          (scene) =>
            scene.matches(".scene:not([data-started])") && !!scene.querySelector(".scene-gate"),
        ),
    );
  const visible = (el: Element) => {
    // Closed details descendants still have layout boxes in Chromium but are not painted.
    if (inClosedDisclosure(el)) return false;
    if (
      paintChain(el).some((at) => {
        const s = getComputedStyle(at);
        return (
          s.display === "none" ||
          s.visibility === "hidden" ||
          s.visibility === "collapse" ||
          Number(s.opacity) === 0 ||
          s.contentVisibility === "hidden"
        );
      })
    )
      return false;
    const r = rect(el);
    return r.width > 0 && r.height > 0;
  };
  const unsupported = (el: Element): boolean => {
    const reason = paintChain(el).find((at) => {
      const s = getComputedStyle(at);
      return (
        s.maskImage !== "none" ||
        s.clipPath !== "none" ||
        s.filter !== "none" ||
        s.clip !== "auto" ||
        (s.overflow !== "visible" && parseFloat(s.borderRadius) > 0) ||
        (at instanceof SVGElement &&
          ["mask", "clip-path", "filter"].some(
            (name) => at.hasAttribute(name) && at.getAttribute(name) !== "none",
          ))
      );
    });
    if (reason)
      emit(
        "unverified",
        "unsupported-geometry",
        [el, reason],
        "Remove the mask/filter/nonrectangular clip or inspect it separately; rectangular bounds cannot verify this required target.",
      );
    return !!reason;
  };
  const clipped = (el: Element) => {
    const r = rect(el);
    for (const at of paintChain(el).slice(1)) {
      const s = getComputedStyle(at);
      const svg = at instanceof SVGSVGElement;
      const clipX =
        (svg && s.overflowX !== "visible") || /hidden|clip|auto|scroll/.test(s.overflowX);
      const clipY =
        (svg && s.overflowY !== "visible") || /hidden|clip|auto|scroll/.test(s.overflowY);
      // The document viewport scrolls vertically; its horizontal extent is checked separately.
      if (at === document.documentElement || at === document.body || (!clipX && !clipY)) continue;
      const matrix = s.transform === "none" ? null : new DOMMatrix(s.transform);
      if (matrix && (Math.abs(matrix.b) > 0.0001 || Math.abs(matrix.c) > 0.0001 || !matrix.is2D)) {
        emit(
          "unverified",
          "unsupported-clip-transform",
          [el, at],
          "Inspect the rotated/perspective clipping ancestor separately.",
        );
        continue;
      }
      const b = rect(at);
      const scaleX = at instanceof HTMLElement && at.offsetWidth ? b.width / at.offsetWidth : 1;
      const scaleY = at instanceof HTMLElement && at.offsetHeight ? b.height / at.offsetHeight : 1;
      const left = b.x + (at instanceof HTMLElement ? at.clientLeft * scaleX : 0);
      const top = b.y + (at instanceof HTMLElement ? at.clientTop * scaleY : 0);
      const right = at instanceof HTMLElement ? left + at.clientWidth * scaleX : b.x + b.width;
      const bottom = at instanceof HTMLElement ? top + at.clientHeight * scaleY : b.y + b.height;
      check(
        !(
          (clipX && (r.x < left - 1 || r.x + r.width > right + 1)) ||
          (clipY && (r.y < top - 1 || r.y + r.height > bottom + 1))
        ),
        "clipped",
        [el, at],
        "Move the label inside its SVG/overflow box, enlarge that box, or allow intended scrolling.",
        r,
        { left, top, right, bottom, tolerancePx: 1 },
      );
    }
  };
  const inspectVisibility = (el: Element) => {
    check(
      visible(el),
      "essential-visible",
      [el],
      "Restore display, visibility, opacity and nonzero dimensions, or declare this obligation only in its intended scene phase.",
    );
    if (!visible(el)) return;
    unsupported(el);
    clipped(el);
    el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    // A wrapped inline's union bounds include space belonging to other elements.
    const fragments = [...el.getClientRects()]
      .map((r) => ({
        left: Math.max(0, r.left),
        right: Math.min(innerWidth, r.right),
        top: Math.max(0, r.top),
        bottom: Math.min(innerHeight, r.bottom),
      }))
      .filter((r) => r.right > r.left && r.bottom > r.top);
    if (!fragments.length) {
      check(
        false,
        "essential-in-viewport",
        [el],
        "Ensure the target can be scrolled into the visible viewport.",
      );
      return;
    }
    const hit = (x: number, y: number) => {
      let found = document.elementFromPoint(x, y);
      while (found?.shadowRoot) {
        const next = found.shadowRoot.elementFromPoint(x, y);
        if (!next || next === found) break;
        found = next;
      }
      return found;
    };
    const points = [
      [0.5, 0.5],
      [0.2, 0.2],
      [0.8, 0.2],
      [0.2, 0.8],
      [0.8, 0.8],
    ];
    const hits = fragments.flatMap(({ left, right, top, bottom }) =>
      points.map(([x, y]) => hit(left + (right - left) * x, top + (bottom - top) * y)),
    );
    const owns = (target: Element | null) => !!target && chain(target).includes(el);
    // SVG groups and pointer-events:none are not necessarily hit-testable ink.
    const pointer = getComputedStyle(el).pointerEvents;
    const interactive = el.matches(
      "button, a[href], input, select, textarea, summary, [role=button]",
    );
    if (
      pointer === "none" ||
      (el instanceof SVGElement &&
        !interactive &&
        !hits.some(owns) &&
        hits.every((h) => !h || chain(el).includes(h)))
    ) {
      emit(
        "unverified",
        "hit-test-unavailable",
        [el],
        "This target is not reliably hit-testable; inspect its painted occlusion separately. Bounds and visibility were still checked.",
      );
    } else {
      check(
        hits.some(owns),
        "obstructed",
        [el, ...new Set(hits.filter((h): h is Element => !!h && !owns(h)))],
        "Move or dismiss the covering layer; sampled hit tests check reachability, not every painted pixel.",
        hits.map((h) => (h ? id(h) : null)),
        "at least one sampled point reaches target (five per visible fragment)",
      );
    }
  };

  const obligations = new Set<Element>();
  const allowed = new Set(["align", "gaps", "count", "visible", "separate", "tolerance-px"]);
  for (const el of all) {
    const attrs = el.getAttributeNames().filter((n) => n.startsWith("data-nk-audit-"));
    const values: Record<string, string> = {};
    let valid = true;
    for (const attr of attrs) {
      const key = attr.slice("data-nk-audit-".length),
        value = el.getAttribute(attr)!;
      const numeric =
        /^(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value) &&
        Number.isFinite(Number(value)) &&
        Number(value) >= 0;
      const ok =
        allowed.has(key) &&
        ((key === "align" && /^[xy]-(start|center|end)$/.test(value)) ||
          (key === "gaps" && /^[xy]$/.test(value)) ||
          (key === "visible" && /^(true|false)$/.test(value)) ||
          (key === "count" && numeric && Number.isSafeInteger(Number(value))) ||
          (["separate", "tolerance-px"].includes(key) && numeric));
      check(
        ok,
        "invalid-declaration",
        [el],
        `Fix serialized ${attr}; unknown names/values never waive a check.`,
        value,
      );
      valid &&= ok;
      values[key] = value;
    }
    const essential = el.getAttribute("data-nk-essential");
    if (essential !== null) {
      check(
        ["", "true", "false"].includes(essential),
        "invalid-essential",
        [el],
        "Use data-nk-essential, true, or false.",
        essential,
      );
      if (essential !== "false") obligations.add(el);
    }
    if (!attrs.length || !valid) continue;
    if (gated(el)) {
      result.gated++;
      continue;
    }
    if (deferred(el)) continue;
    const children = [...el.children];
    const tolerance = Number(values["tolerance-px"] ?? 1);
    if (values.count !== undefined)
      check(
        children.length === Number(values.count),
        "count",
        [el],
        "Restore missing direct children or correct the intended count.",
        children.length,
        Number(values.count),
      );
    if (values.visible === "true") for (const child of children) obligations.add(child);
    for (const rule of ["align", "gaps", "separate"]) {
      if (values[rule] === undefined) continue;
      const min = rule === "gaps" ? 3 : 2;
      check(
        children.length >= min,
        "cardinality",
        [el],
        `${rule} requires at least ${min} actual direct children; use count to catch missing intended children.`,
        children.length,
        min,
      );
      if (children.length < min) continue;
      if (children.some((child) => !deferred(child) && !visible(child))) {
        emit(
          "unverified",
          "hidden-measurement",
          [el],
          "Required geometry has hidden/zero-area children; reveal them in the intended phase before measuring.",
        );
        continue;
      }
      // A declaration on <details> can span its summary and deferred interior.
      if (children.some(deferred)) continue;
      if (children.map(unsupported).some(Boolean)) continue;
      const boxes = children.map(rect);
      if (rule === "align") {
        const [axis, edge] = values.align.split("-");
        const coords = boxes.map(
          (r) =>
            (axis === "x" ? r.x : r.y) +
            (edge === "center" ? 0.5 : edge === "end" ? 1 : 0) *
              (axis === "x" ? r.width : r.height),
        );
        const spread = Math.max(...coords) - Math.min(...coords);
        check(
          spread <= tolerance,
          "align",
          children,
          "Align the declared transformed edges/centers in CSS pixels.",
          spread,
          tolerance,
        );
      } else if (rule === "gaps") {
        const x = values.gaps === "x";
        boxes.sort((a, b) => (x ? a.x - b.x : a.y - b.y));
        const gaps = boxes
          .slice(1)
          .map((b, i) =>
            x ? b.x - boxes[i].x - boxes[i].width : b.y - boxes[i].y - boxes[i].height,
          );
        check(
          Math.min(...gaps) >= -tolerance && Math.max(...gaps) - Math.min(...gaps) <= tolerance,
          "gaps",
          children,
          "Equalize the spaces between outer edges; equal centers do not imply equal gaps.",
          gaps,
          { tolerancePx: tolerance, nonnegative: true },
        );
      } else {
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i],
              b = boxes[j];
            const dx = Math.max(a.x - b.x - b.width, b.x - a.x - a.width, 0);
            const dy = Math.max(a.y - b.y - b.height, b.y - a.y - a.height, 0);
            const overlap =
              a.x < b.x + b.width &&
              b.x < a.x + a.width &&
              a.y < b.y + b.height &&
              b.y < a.y + a.height;
            const distance = Math.hypot(dx, dy);
            check(
              !overlap && distance + tolerance >= Number(values.separate),
              "separate",
              [children[i], children[j]],
              "Separate the transformed outer bounds by the declared clearance.",
              distance,
              { clearancePx: Number(values.separate), tolerancePx: tolerance },
            );
          }
      }
    }
  }

  // Built-in controls carry their own contracts: authors cannot forget an audit opt-in.
  // These are box relationships, not a claim about font ink or native pseudo-element pixels.
  for (const summary of all.filter(
    (el) =>
      el.matches(
        ".nk-disclosure-summary, .nk-note details > summary, .fw-page details > summary",
      ) &&
      !el.parentElement?.matches(".nk-check, .exercise") &&
      visible(el) &&
      !deferred(el),
  )) {
    const mark = summary.querySelector(":scope > .nk-disclosure-mark");
    const label = summary.querySelector(":scope > .nk-disclosure-label");
    const parts =
      summary.matches(".nk-disclosure-summary") &&
      summary.children.length === 2 &&
      !!mark &&
      !!label;
    check(
      parts,
      "disclosure-parts",
      [summary],
      "Use DisclosureSummary with its marker and label parts.",
      summary.children.length,
      2,
    );
    if (!mark || !label) continue;
    const box = rect(summary),
      m = rect(mark),
      l = rect(label),
      style = getComputedStyle(summary);
    const padding = [
      parseFloat(style.paddingTop),
      parseFloat(style.paddingBottom),
      parseFloat(style.paddingLeft),
      parseFloat(style.paddingRight),
    ];
    check(
      padding.every((n) => n >= 8) && box.height >= 44,
      "disclosure-padding",
      [summary],
      "Keep at least 8px of padding on every side and a 44px target.",
      { padding, height: box.height },
      { minPadding: 8, minHeight: 44 },
    );
    check(
      Math.abs(m.y - l.y) <= 1 &&
        Math.abs(m.height - parseFloat(style.lineHeight)) <= 1 &&
        l.x - m.x - m.width >= 8,
      "disclosure-first-line",
      [mark, label],
      "Align the marker with the label's first line, including when the label wraps.",
      {
        topDifference: m.y - l.y,
        markerHeight: m.height,
        lineHeight: style.lineHeight,
        gap: l.x - m.x - m.width,
      },
      { tolerancePx: 1, minGap: 8 },
    );
    if (summary.matches(":focus-visible")) {
      const ms = getComputedStyle(mark),
        ls = getComputedStyle(label);
      check(
        style.outlineStyle === "none" &&
          ms.outlineStyle !== "none" &&
          parseFloat(ms.outlineWidth) >= 2 &&
          ls.textDecorationLine.includes("underline"),
        "disclosure-focus",
        [summary, mark, label],
        "Keep visible keyboard focus on the marker and words, rather than drawing a full-row box.",
        {
          rowOutline: style.outlineStyle,
          markerOutline: ms.outlineStyle,
          labelDecoration: ls.textDecorationLine,
        },
      );
    }
  }
  for (const link of all.filter((el) => el.matches(".nk-arrow-label") && visible(el))) {
    const label = link.querySelector(":scope > .nk-arrow-text"),
      icon = link.querySelector(":scope > svg");
    check(
      !!label && !!icon && link.children.length === 2,
      "link-icon-parts",
      [link],
      "Keep the link's label and icon as two explicit parts.",
    );
    if (!label || !icon) continue;
    const l = rect(label),
      i = rect(icon),
      font = parseFloat(getComputedStyle(link).fontSize);
    const gap = i.x - l.x - l.width,
      center = i.y + i.height / 2 - l.y - l.height / 2;
    check(
      gap >= 6 &&
        gap <= 12 &&
        Math.abs(center) <= 1 &&
        i.width >= font * 0.8 &&
        i.height <= font * 1.1,
      "link-icon-spacing",
      [label, icon],
      "Give the arrow its own 6–12px gap and center its em-sized box beside the label.",
      { gap, centerDifference: center, width: i.width, height: i.height, font },
      { minGap: 6, maxGap: 12, centerTolerance: 1 },
    );
  }
  for (const parameter of all.filter(
    (el) => el.matches(".nk-parameter") && visible(el) && !deferred(el),
  )) {
    const input = parameter.querySelector<HTMLInputElement>("input[type=range]");
    const header = parameter.querySelector(".nk-parameter-label"),
      label = header?.querySelector("label"),
      output = header?.querySelector("output");
    const bounds = parameter.querySelector(".nk-parameter-bounds");
    const track = parameter.querySelector<SVGPathElement>(".nk-parameter-track"),
      fill = parameter.querySelector<SVGPathElement>(".nk-parameter-fill");
    check(
      !!input &&
        !!header &&
        !!label &&
        !!output &&
        bounds?.children.length === 2 &&
        !!track &&
        !!fill,
      "parameter-parts",
      [parameter],
      "Keep the label, readout, native range, bounds and exact track/fill in every Parameter.",
    );
    if (!input || !header || !label || !output || !bounds || !track || !fill) continue;
    const h = rect(header),
      l = rect(label),
      o = rect(output),
      r = rect(input),
      b = rect(bounds);
    check(
      Math.abs(l.x - h.x) <= 1 &&
        Math.abs(o.x + o.width - h.x - h.width) <= 1 &&
        o.x - l.x - l.width >= 11,
      "parameter-header",
      [label, output],
      "Keep the label at the left edge, the readout at the right edge and 12px between them.",
      { left: l.x - h.x, right: o.x + o.width - h.x - h.width, gap: o.x - l.x - l.width },
      { edgeTolerance: 1, minGap: 11 },
    );
    check(
      r.height >= 44 &&
        Math.abs(b.x - r.x) <= 1 &&
        Math.abs(b.width - r.width) <= 1 &&
        Math.abs(parseFloat(getComputedStyle(bounds).paddingLeft) - 8) <= 1 &&
        Math.abs(parseFloat(getComputedStyle(bounds).paddingRight) - 8) <= 1,
      "parameter-padding",
      [input, bounds],
      "Keep the range target at least 44px tall and bounds inset 8px below the track ends.",
    );
    // System colors use the browser's complete native range instead of SVG paint.
    if (matchMedia("(forced-colors: active)").matches) continue;
    const svg = track.ownerSVGElement,
      matrix = track.getScreenCTM();
    if (!svg || !matrix) continue;
    const point = (path: SVGPathElement, fraction: number) => {
      const p = path.getPointAtLength(path.getTotalLength() * fraction);
      return new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!);
    };
    const rail = [0, 0.25, 0.5, 0.75, 1].map((t) => point(track, t));
    check(
      rect(track).height <= 0.5 && rail.every((p) => Math.abs(p.y - (r.y + r.height / 2)) <= 0.5),
      "parameter-straight-track",
      [input, track],
      "Decorative motion must leave the numerical track straight and stationary.",
      rail.map((p) => p.y),
      { y: r.y + r.height / 2, tolerance: 0.5 },
    );
    const ratio =
      Number(input.max) === Number(input.min)
        ? 0
        : (input.valueAsNumber - Number(input.min)) / (Number(input.max) - Number(input.min));
    const expected = r.x + 8 + ratio * (r.width - 16),
      end = point(fill, 1);
    check(
      Math.abs(end.x - expected) <= 0.5 && Math.abs(end.y - r.y - r.height / 2) <= 0.5,
      "parameter-fill-value",
      [input, fill],
      "The fill endpoint must follow the native value immediately, without springing or clipping a full rail.",
      { end: { x: end.x, y: end.y }, expected },
      { tolerancePx: 0.5 },
    );
    const collar = parameter.querySelector<SVGPathElement>(".nk-parameter-collar");
    check(
      !!collar,
      "parameter-collar-part",
      [parameter],
      "Keep the attached contour as one inspectable path.",
    );
    if (collar && visible(collar)) {
      const root = point(collar, 0),
        box = rect(collar);
      check(
        Math.abs(root.x - expected) <= 0.5 && Math.abs(root.y - r.y - r.height / 2) <= 0.5,
        "parameter-collar-attachment",
        [input, collar],
        "The contour root must stay attached to the exact native center while dragging and settling.",
        { root: { x: root.x, y: root.y }, expected },
        { tolerancePx: 0.5 },
      );
      check(
        box.x >= expected - 14.5 && box.x + box.width <= expected + 14.5 && box.height <= 8.5,
        "parameter-collar-bounds",
        [collar],
        "Limit the local contour to 6px beyond the 8px thumb radius and 8px in height.",
        box,
        { maxRadius: 14, maxHeight: 8, tolerancePx: 0.5 },
      );
    }
  }

  const texts = all.filter(
    (el): el is SVGTextElement =>
      el instanceof SVGTextElement &&
      !gated(el) &&
      !deferred(el) &&
      visible(el) &&
      !!el.textContent?.trim(),
  );
  result.svgTexts = texts.length;
  for (const el of texts) {
    unsupported(el);
    clipped(el);
    const sizes = [el, ...el.querySelectorAll("tspan, textPath")].filter(visible).map((part) => {
      const m = (part as SVGGraphicsElement).getScreenCTM();
      if (!m) return NaN;
      // Smallest singular value: conservative under nonuniform scale/skew, correct under rotation.
      const a = m.a * m.a + m.b * m.b,
        b = m.c * m.c + m.d * m.d,
        c = m.a * m.c + m.b * m.d;
      const scale = Math.sqrt(Math.max(0, (a + b - Math.hypot(a - b, 2 * c)) / 2));
      // Typographic indices are smaller than their readable base label. Keep a
      // 10.5px minimum for sub/superscripts alongside the base label's 15px.
      const index =
        part.localName === "tspan" &&
        /^(sub|super)$/.test(part.getAttribute("baseline-shift") ?? "");
      return (parseFloat(getComputedStyle(part).fontSize) * scale) / (index ? 0.7 : 1);
    });
    if (sizes.some((n) => !Number.isFinite(n)))
      emit(
        "unverified",
        "font-transform",
        [el],
        "A required text transform could not be measured.",
      );
    else
      check(
        Math.min(...sizes) >= 15 - 0.01,
        "font-size",
        [el],
        "Increase the font or reduce viewBox/CSS downscaling; labels must render at least 15 CSS px.",
        Math.min(...sizes),
        15,
      );
  }
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i],
        b = texts[j];
      const ar = rect(a),
        br = rect(b);
      const overlapX = Math.min(ar.x + ar.width, br.x + br.width) - Math.max(ar.x, br.x);
      const overlapY = Math.min(ar.y + ar.height, br.y + br.height) - Math.max(ar.y, br.y);
      check(
        overlapX <= 1 || overlapY <= 1,
        "text-collision",
        [a, b],
        "Move or shorten overlapping labels. Conservative text bounds can include whitespace.",
        { overlapX, overlapY },
        { tolerancePx: 1 },
      );
    }
  for (const el of all) {
    if (gated(el) || deferred(el)) continue;
    if (
      el.matches(
        ".scene-gate, button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button]",
      ) &&
      visible(el) &&
      !el.matches(":disabled")
    )
      obligations.add(el);
    if (el.matches("pre, [data-nk-code], .nk-code, .nk-codeblock") && visible(el)) {
      result.codeContainers++;
      const s = getComputedStyle(el);
      check(
        el.scrollWidth <= el.clientWidth + 1 || /auto|scroll/.test(s.overflowX),
        "code-overflow",
        [el],
        "Wrap code or give this container its own horizontal scrolling.",
        { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth },
        1,
      );
      unsupported(el);
      clipped(el);
    }
  }
  for (const el of obligations) {
    if (gated(el)) {
      result.gated++;
      continue;
    }
    if (deferred(el)) continue;
    inspectVisibility(el);
  }
  check(
    document.documentElement.scrollWidth <= innerWidth + 1,
    "viewport-overflow",
    [document.documentElement],
    "Constrain the overflowing figure/container at this viewport.",
    document.documentElement.scrollWidth,
    innerWidth + 1,
  );
  return result;
}
