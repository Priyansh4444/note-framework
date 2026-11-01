/**
 * Browser-only reader-taste checks. Keep `measureTaste` self-contained so Playwright can
 * serialize it. Each rule encodes a complaint readers made more than once; the hint says the fix.
 */
export type TasteFinding = { rule: string; ids: string[]; measured?: unknown; hint: string };

export function measureTaste(): TasteFinding[] {
  const findings: TasteFinding[] = [];
  const report = (rule: string, els: Element[], hint: string, measured?: unknown) =>
    findings.push({ rule, ids: els.map(id), hint, measured });
  function id(el: Element): string {
    const path: string[] = [];
    for (let at: Element | null = el; at && at !== document.body; at = at.parentElement) {
      if (at.id) {
        path.unshift(`#${at.id}`);
        break;
      }
      const cls = [...at.classList].slice(0, 2).join(".");
      path.unshift(at.localName + (cls ? `.${cls}` : ""));
    }
    return path.slice(-4).join(" > ");
  }
  const visible = (el: Element) => {
    if (el.closest("details:not([open]) > :not(summary)")) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
  };
  const all = (root: ParentNode, selector: string) =>
    [...root.querySelectorAll(selector)].filter(visible);
  const main = document.querySelector("main, article, #app") ?? document.body;
  const column = main.getBoundingClientRect();
  const figures = all(main, "figure, [data-nk-figure], .nk-experiment").filter(
    (el, _, list) => !list.some((other) => other !== el && other.contains(el)),
  );

  // "Things are constantly misaligned": edges 1-4px apart are mistakes, not choices.
  const blocks = all(main, "p, h1, h2, h3, h4, figcaption, pre, blockquote, .katex-display").filter(
    (el) => !el.closest("svg, figure, nav, li, td, th"),
  );
  for (const edge of ["left", "right"] as const) {
    const sorted = blocks
      .map((el) => ({ el, x: el.getBoundingClientRect()[edge] }))
      .filter(({ el }) => edge === "left" || el.getBoundingClientRect().width > column.width * 0.6)
      .sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].x - sorted[i - 1].x;
      if (gap > 0.75 && gap <= 4)
        report(
          "near-miss-alignment",
          [sorted[i - 1].el, sorted[i].el],
          `Snap ${edge} edges to one column line.`,
          { [edge]: [sorted[i - 1].x, sorted[i].x] },
        );
    }
  }
  const control = "button, [role=slider], input, select, a[role=button]";
  const rows = new Set(
    all(main, control)
      .filter((el) => !el.closest("svg"))
      .map((el) => el.parentElement!)
      .filter(Boolean),
  );
  for (const row of rows) {
    const items = [...row.children].filter((el) => el.matches(control) && visible(el));
    const top = items[0]?.getBoundingClientRect();
    const line = items.filter(
      (el) => Math.abs(el.getBoundingClientRect().top - top.top) < top.height,
    );
    const centers = line.map((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    const spread = Math.max(...centers) - Math.min(...centers);
    if (line.length > 1 && spread > 1 && spread <= 6)
      report("near-miss-alignment", line, "Center a control row on one line.", { spread });
  }

  // "Header should be properly centered": centered containers must center their content.
  for (const el of all(main.parentElement ?? main, "header, h1, .fw-hero, [data-centered]")) {
    const s = getComputedStyle(el);
    if (s.textAlign !== "center" && s.justifyContent !== "center") continue;
    const kids = [...el.children].filter(visible);
    if (!kids.length) continue;
    const left = Math.min(...kids.map((k) => k.getBoundingClientRect().left));
    const right = Math.max(...kids.map((k) => k.getBoundingClientRect().right));
    const box = el.getBoundingClientRect();
    const inner =
      box.left +
      parseFloat(s.paddingLeft) +
      (box.width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)) / 2;
    const offset = (left + right) / 2 - inner;
    if (Math.abs(offset) > 2)
      report("off-center", [el], "Remove asymmetric padding or hidden slots.", { offset });
  }

  // "Too many dividers" (yet keep the needed ones): no stacked rules, no rule every paragraph.
  const lines: { el: Element; y: number; left: number; right: number }[] = [];
  for (const el of all(main, "*")) {
    const r = el.getBoundingClientRect();
    if (r.width < column.width * 0.4 || el.closest("svg")) continue;
    const s = getComputedStyle(el);
    if (el.localName === "hr") {
      lines.push({ el, y: r.top, left: r.left, right: r.right });
      continue;
    }
    const ruled = (["Top", "Bottom", "Left", "Right"] as const).filter(
      (side) =>
        parseFloat(s[`border${side}Width`]) > 0 &&
        s[`border${side}Style`] !== "none" &&
        !/rgba\([^)]*,\s*0\)|transparent/.test(s[`border${side}Color`]),
    );
    // A box framed on three or more sides, or a short track, is a frame, not a divider.
    if (ruled.length > 2 || (ruled.includes("Top") && ruled.includes("Bottom") && r.height < 20))
      continue;
    for (const side of ruled.filter((side) => side === "Top" || side === "Bottom"))
      lines.push({ el, y: side === "Top" ? r.top : r.bottom, left: r.left, right: r.right });
  }
  lines.sort((a, b) => a.y - b.y);
  for (let i = 1; i < lines.length; i++) {
    const [a, b] = [lines[i - 1], lines[i]];
    const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    if (
      b.y - a.y > 0.5 &&
      b.y - a.y < 20 &&
      overlap > 0.5 * Math.min(a.right - a.left, b.right - b.left)
    )
      report(
        "stacked-dividers",
        [a.el, b.el],
        "Two rules within 20px read as one heavy bar; keep one.",
      );
  }
  const perScreen = lines.length / Math.max(1, column.height / 1000);
  if (perScreen > 4)
    report(
      "divider-density",
      [main],
      "Use whitespace before rules; keep dividers for real breaks.",
      {
        perScreen: +perScreen.toFixed(1),
      },
    );

  for (const figure of figures) {
    // "Too many sliders, it's almost redundant": one transport, one disclosure per figure.
    const timelines = all(figure, "[data-nk-timeline]");
    const sliders = all(figure, "[role=slider], input[type=range]");
    const tracks = sliders.filter((el) => {
      const r = el.getBoundingClientRect();
      return !el.closest("svg") && r.width > 3 * r.height;
    });
    const verbs = all(figure, "button").map((b) =>
      (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().split(/\s/)[0].toLowerCase(),
    );
    const players = verbs.filter((v) => /^(play|pause|replay|restart)$/.test(v));
    if (timelines.length > 1 || players.length > new Set(players).size || tracks.length > 2)
      report("redundant-controls", [figure], "Keep one timeline and one play control per figure.", {
        timelines: timelines.length,
        players,
        tracks: tracks.length,
      });
    const disclosures = figure.querySelectorAll("details");
    if (disclosures.length > 1)
      report("disclosure-budget", [figure], "One optional disclosure per figure; merge the rest.", {
        details: disclosures.length,
      });

    // "Duplicated position readouts": the same changing number must not print twice.
    const texts = new Map<string, Element[]>();
    for (const el of all(figure, "*")) {
      if (el.children.length) continue;
      const text = el.textContent?.trim() ?? "";
      if (text.length < 2 || !/\d/.test(text) || el.closest("[aria-hidden=true]")) continue;
      texts.set(text, [...(texts.get(text) ?? []), el]);
    }
    for (const [text, els] of texts)
      if (els.length > 1 && !els.every((el) => el.closest("svg")))
        report("duplicate-readout", els, "Show each live value once, where the eye already is.", {
          text,
        });

    // "Slide the white dot" with no handler: instructions must name a working control.
    const prose = figure.textContent ?? "";
    if (/\b(drag|slide|scrub)\b/i.test(prose)) {
      const handle =
        sliders.length ||
        all(figure, "*").some((el) => /grab|move|resize/.test(getComputedStyle(el).cursor));
      if (!handle)
        report(
          "instruction-without-handle",
          [figure],
          "Make the named object draggable or reword.",
        );
    }
    // Round-1 misalignment: a one-row timeline label sits over the beat it names.
    for (const timeline of timelines) {
      const ticks = [...timeline.querySelectorAll(".nk-timeline-beat")].map((t) => {
        const r = t.getBoundingClientRect();
        return r.left + r.width / 2;
      });
      const labels = all(timeline, ".nk-timeline-label");
      const oneRow =
        new Set(labels.map((l) => Math.round(l.getBoundingClientRect().top))).size === 1;
      if (!oneRow || ticks.length !== labels.length) continue;
      labels.slice(0, -1).forEach((label, i) => {
        const r = label.getBoundingClientRect();
        const center = r.left + r.width / 2;
        if (center < ticks[i] - 8 || center > ticks[i + 1] + 8)
          report("label-off-beat", [label], "Place each timeline label over its own beat span.", {
            label: Math.round(center),
            beat: [Math.round(ticks[i]), Math.round(ticks[i + 1])],
          });
      });
    }
    // "Through the middle" wrapping inside its button: one run of label text stays on one line.
    for (const label of all(figure, "button, [role=tab], .nk-timeline-label, label")) {
      const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent?.trim() ?? "";
        if (text.length < 2 || text.length > 40) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        if (new Set([...range.getClientRects()].map((r) => Math.round(r.bottom))).size > 1)
          report("wrapped-label", [label], "Shorten the label or give its row room.", { text });
      }
    }
    // "Rings cut through the P₁ label": no stroked ring passes through an SVG label.
    for (const svg of all(figure, "svg")) {
      const labels = [...svg.querySelectorAll("text")]
        .filter(visible)
        .map((t) => ({ t, b: t.getBoundingClientRect() }));
      for (const ring of [...svg.querySelectorAll("circle")].filter(visible)) {
        const s = getComputedStyle(ring);
        if (s.stroke === "none" || parseFloat(s.strokeWidth) === 0 || Number(s.strokeOpacity) < 0.2)
          continue;
        const c = ring.getBoundingClientRect();
        const [cx, cy, radius] = [c.left + c.width / 2, c.top + c.height / 2, c.width / 2];
        if (radius < 6) continue;
        for (const { t, b } of labels) {
          const near = Math.hypot(
            Math.max(b.left - cx, 0, cx - b.right),
            Math.max(b.top - cy, 0, cy - b.bottom),
          );
          const far = Math.max(
            ...[
              [b.left, b.top],
              [b.right, b.top],
              [b.left, b.bottom],
              [b.right, b.bottom],
            ].map(([x, y]) => Math.hypot(x - cx, y - cy)),
          );
          if (near < radius - 1 && radius + 1 < far)
            report(
              "mark-through-label",
              [ring, t],
              "Keep labels clear of rings; offset by the ring radius.",
              { label: t.textContent },
            );
        }
      }
    }
    // "Play scrolls the curve away": on desktop a figure and its transport fit one screen.
    const height = figure.getBoundingClientRect().height;
    if (innerWidth >= 1024 && height > innerHeight * 0.85)
      report(
        "tall-figure",
        [figure],
        "Trim empty viewBox or disclose secondary views; keep it on one screen.",
        {
          height: Math.round(height),
        },
      );
    // "End" stranded alone on its own line: wrapped label rows must not orphan their last item.
    for (const row of all(figure, "*")) {
      const style = getComputedStyle(row);
      if (!/flex/.test(style.display) || style.flexWrap !== "wrap" || row.closest("svg, .katex"))
        continue;
      const tops = [...row.children]
        .filter(visible)
        .map((el) => Math.round(el.getBoundingClientRect().top));
      const lines = [...new Set(tops)].map((top) => tops.filter((t) => t === top).length);
      if (lines.length > 1 && lines.at(-1) === 1 && lines.at(-2)! > 1)
        report("orphan-wrap", [row], "Shorten or shrink labels so the last one never sits alone.", {
          lines,
        });
    }
    // "Moving strips…" over a static picture: promised motion needs a clock or a control.
    const reading = figure.nextElementSibling?.localName === "p" ? figure.nextElementSibling : null;
    if (
      /\b(moving|moves|animat(?:es|ed|ion)|watch)\b/i.test(prose + (reading?.textContent ?? ""))
    ) {
      const moves =
        players.length ||
        tracks.length ||
        figure.matches("[data-nk-scene-time], :has([data-nk-scene-time])");
      if (!moves)
        report(
          "motion-promise",
          [figure],
          "Animate it on a scene clock with one transport, or reword.",
        );
    }

    // "The 0 1 2 do not look correctly spaced": numeric labels in a row must sit on an affine scale.
    for (const svg of all(figure, "svg")) {
      const ticks = [...svg.querySelectorAll("text")]
        .filter(visible)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            el,
            v: Number(el.textContent?.trim()),
            x: r.left + r.width / 2,
            y: r.top + r.height / 2,
          };
        })
        .filter((t) => (t.el.textContent?.trim() ?? "") !== "" && Number.isFinite(t.v));
      for (const axis of ["x", "y"] as const) {
        const across = axis === "x" ? "y" : "x";
        const groups = new Map<number, typeof ticks>();
        for (const t of ticks) {
          const key = Math.round(t[across] / 2);
          groups.set(key, [...(groups.get(key) ?? []), t]);
        }
        for (const row of groups.values()) {
          if (row.length < 3 || new Set(row.map((t) => t.v)).size !== row.length) continue;
          row.sort((a, b) => a[axis] - b[axis]);
          const rising = row.every((t, i) => i === 0 || t.v > row[i - 1].v);
          const falling = row.every((t, i) => i === 0 || t.v < row[i - 1].v);
          if (!rising && !falling) continue;
          const fits = (f: (v: number) => number) => {
            const [a, b] = [row[0], row.at(-1)!];
            const slope = (b[axis] - a[axis]) / (f(b.v) - f(a.v));
            const span = Math.abs(b[axis] - a[axis]);
            return row.every(
              (t) =>
                Math.abs(a[axis] + slope * (f(t.v) - f(a.v)) - t[axis]) <=
                Math.max(1.5, span * 0.02),
            );
          };
          if (!fits((v) => v) && !(row.every((t) => t.v > 0) && fits(Math.log)))
            report(
              "uneven-scale",
              row.map((t) => t.el),
              "Place ticks with the scale function, not by hand.",
              {
                values: row.map((t) => t.v),
                positions: row.map((t) => Math.round(t[axis])),
              },
            );
        }
      }
    }
  }

  for (const nested of all(main, "details details"))
    report("disclosure-budget", [nested], "Never nest dropdowns; promote or cut the inner one.");

  // "P0" in a figure but P₀ in prose: one name, one notation.
  const plain = new Set<string>();
  const sub = new Set<string>();
  const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";
  for (const el of all(main, "p, li, figcaption, h1, h2, h3, text, label, button, td, th")) {
    if (el.closest(".katex, pre, code") || el.querySelector("tspan[baseline-shift], sub")) continue;
    const text =
      el.localName === "text"
        ? (el.textContent ?? "")
        : [...el.childNodes].map((n) => (n.nodeType === 3 ? n.textContent : " ")).join("");
    for (const [, letter, digit] of text.matchAll(/\b([A-Z])([0-9])\b/g)) plain.add(letter + digit);
    for (const [, letter, digit] of text.matchAll(/([A-Z])([₀-₉])/g))
      sub.add(letter + SUBSCRIPT.indexOf(digit));
  }
  for (const note of main.querySelectorAll(".katex annotation"))
    for (const [, letter, digit] of (note.textContent ?? "").matchAll(/([A-Z])_\{?([0-9])/g))
      sub.add(letter + digit);
  const mixed = [...plain].filter((name) => sub.has(name));
  if (mixed.length)
    report(
      "mixed-notation",
      [main],
      "Write subscripts everywhere (P₀, or a subscript tspan in SVG).",
      { mixed },
    );

  // "Centring hides the left-hand expressions": every formula is fully visible or reachable by scroll.
  for (const math of all(main, ".katex")) {
    if (math.parentElement?.closest(".katex")) continue;
    const r = math.getBoundingClientRect();
    let box: Element | null = math.parentElement;
    while (box && box !== main && getComputedStyle(box).overflowX === "visible")
      box = box.parentElement;
    const edge = (box && box !== main ? box : main).getBoundingClientRect();
    // A formula that silently scrolls is still cut off for the reader; math must fit its box.
    const lost = Math.max(edge.left - r.left, r.right - edge.right);
    // Screen-reader copies live in 1px clipped boxes on purpose.
    if (lost > 1 && edge.width > 2)
      report(
        "clipped-math",
        [math],
        "Break or stack the formula; never centre it past a clipping edge.",
        {
          lost: Math.round(lost),
        },
      );
  }

  // "Math equations go on their own line": long inline math becomes display math.
  for (const math of all(main, ".katex")) {
    if (math.closest(".katex-display, svg, figure, table, li") || !math.closest("p")) continue;
    const pieces = [...math.getClientRects()].filter((r) => r.width > 0);
    const width = Math.max(...pieces.map((r) => r.width));
    if (new Set(pieces.map((r) => Math.round(r.top))).size > 1)
      report(
        "broken-inline-math",
        [math],
        "Keep a formula on one line: nowrap it, or set it as display.",
        {
          tex: math.querySelector("annotation")?.textContent,
        },
      );
    else if (width > column.width * 0.6)
      report(
        "long-inline-math",
        [math],
        "Set long formulas as display math with a sentence of context.",
        {
          width: Math.round(width),
        },
      );
  }

  // "Bloatware with dead sentences": a paragraph is one idea.
  for (const p of all(main, "p")) {
    const words = (p.textContent ?? "").split(/\s+/).filter(Boolean).length;
    if (words > 110)
      report("wall-of-text", [p], "Split into one idea per paragraph, or cut.", { words });
  }

  // "Bland and linear": eased or spring motion only (0s visibility flips and infinite loops excepted).
  for (const el of all(document.body, "*")) {
    const s = getComputedStyle(el);
    const durations = s.transitionDuration.split(",").map(parseFloat);
    const easings = s.transitionTimingFunction.split(/,(?![^(]*\))/);
    if (easings.some((e, i) => e.trim() === "linear" && (durations[i % durations.length] ?? 0) > 0))
      report("linear-motion", [el], "Use a spring variable or ease-out; linear reads mechanical.", {
        transition: s.transition,
      });
    if (
      s.animationName !== "none" &&
      s.animationTimingFunction.split(",")[0].trim() === "linear" &&
      s.animationIterationCount !== "infinite"
    )
      report("linear-motion", [el], "Use a spring variable or ease-out; linear reads mechanical.", {
        animation: s.animationName,
      });
  }

  // "Clicking a # anchor makes it JUMP"; "text selection should invert"; dark mode only.
  if (
    !matchMedia("(prefers-reduced-motion: reduce)").matches &&
    getComputedStyle(document.documentElement).scrollBehavior !== "smooth"
  )
    report(
      "anchor-jump",
      [document.documentElement],
      "Set html { scroll-behavior: smooth } with a reduced-motion fallback.",
    );
  let selection = false;
  const walk = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule && rule.selectorText.includes("::selection"))
        selection ||= !!rule.style.color && !!(rule.style.backgroundColor || rule.style.background);
      if (rule instanceof CSSMediaRule && /prefers-color-scheme:\s*light/.test(rule.conditionText))
        report(
          "dark-only",
          [document.documentElement],
          "Remove the light theme; notes are dark only.",
        );
      if ("cssRules" in rule) walk((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules);
    } catch {
      // Cross-origin sheets are unreadable and never hold our tokens.
    }
  }
  if (!selection)
    report(
      "selection-not-inverted",
      [document.documentElement],
      "Style ::selection with inverted ink and paper.",
    );
  return findings;
}
