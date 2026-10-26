# Reader contract: compact, complete, and polished notes

Read this when authoring or condensing course notes, or polishing a note site's reading flow and interactions. These are lessons from the CS164 work; course-specific numbers, exam dates, and archives belong in that course's registries rather than this shared skill.

## Start from the reader's question

- A reader under time pressure needs the problem, input/output, the useful picture, the reason the method works, and the key fact. Explain a needed term visibly at first use; glossary hover/focus/tap supplies extra detail. Do not require a tooltip to understand the next sentence.
- Distinguish a definition, an invariant (a fact kept true after each step), an assumption, and a conclusion. “Visible” alone does not prove that an arbitrary triangulation contains an edge: identify the actual algorithm and the property that forces that edge.
- Infer confusion from specific questions rather than assigning a fixed ability level. Repeated questions about guarantees, floor division, or input/output are reasons to expose those relationships with a small worked example and a labeled diagram.
- Give an actionable revision path when time is short. Do not promise a guaranteed score or predict a paper without evidence. Keep formulas, conditions, and runtimes easy to find in their normal topic/algorithm entries.

## Compress the reading path, preserve the coverage

- Use context → picture → reason → key fact as the default path. Keep proofs, larger examples, and degeneracies in named expandable reasoning, with assumptions required for the visible statement still visible.
- Read the entire source deck, including its drawings. Render slide images when geometry or labels carry information text extraction misses. Account for every substantive topic with synchronized section IDs and source page ranges; explicitly record non-content exclusions. A coverage map is not proof of mathematical correctness.
- Compare original rendered detailed text, TeX annotations, and source links before/after condensation. Shorter pages must come from hierarchy and disclosure, not lost theorems or edge cases. Keep diagrams faithful to the source; identify representative examples separately from exact reconstructions.
- State what a bound counts, the input assumptions, the rounding rule, and whether it is a guarantee or a minimum/optimum. For example, a simple polygon without holes admits at most floor(n/3) vertex guards; a particular polygon can need fewer. Keep such facts in their relevant section, not in a new global feature panel.
- Runtime entries retain their algorithm/implementation/model assumptions: sorting versus scanning, output size, arithmetic precision, maintained data structures, and preprocessing versus query cost. Preserve a reader-approved row format instead of redesigning it during unrelated polish.

## Separate three different classifications

- Academic audience comes from official policy, not perceived topic difficulty. Shared lectures remain available to undergraduates; explicitly additional graduate readings/questions stay separately labeled.
- Current study block belongs in one typed registry and one URL-owned selector. Historical year/title/paper kind is independent: a problem on an old final can practice a current first-midterm topic. Keep mixed questions separately disclosed in focused views and preserve deep links and scope through navigation.
- Current homework, historical exam questions, and independently authored examples are distinct sources. Historical questions require a verified paper, original URLs, dated archive captures where applicable, original page numbers, and hashes. Preserve requested downloads with an explicit allowlist. Label paraphrases and independent solutions; never imply an instructor answer key.

## Editorial layout reduces decisions

- Preserve a requested control type when improving it. A request for a better dropdown does not authorize replacing it with radio buttons. Use the project's accessible component primitive for selection, focus, keyboard navigation, dismissal, and collision handling; style its portal deliberately.
- Put global scope in one normal-flow header. Keep source-specific filters beside the list they actually filter; do not imply they affect unrelated algorithm rows. Keep scope and local filter state separate.
- Align header and reading measure, use predictable spacing, ragged-right prose, readable source labels, and fewer redundant badges in focused views. Use named disclosures for repeated administrative/provenance text, retaining visible source access and discoverable policy links. Keep typed registry, source provenance, and mathematical assumptions intact.
- Borrow hierarchy and interaction behavior from an inspected reference, not only its fonts or colors. Measure the first useful list item/picture with loaded fonts at desktop and phone widths. A smaller document or a passing build does not establish a calmer reading experience.
- Record the exact reference URL and operate the requested component before designing around it. A source-version morph and a red/green patch comparison serve different reading tasks; a page-reading timeline and an experiment playhead have different state owners. Put a regression on the named surface before changing a similarly named component.
- Keep fixed navigation and tooltips from covering diagrams. Check enlarged control text, long labels, 320/390px layouts, and portaled content without hiding overflow to mask defects.
- Check painted text against icons, not only equal line-box centers: asymmetric font metrics can leave a visibly raised label. Use font-aware text boxes on compact control labels where supported; keep focus rings owned by the shared component and test every consumer. Check wrapped badges at the column edge and navigation direction rather than child position.
- Measure tables and formula contents against their reading column and panel bounds, with details open. A table can extend past its column without overflowing the viewport; a formula can clip inside a panel while the page itself fits. Shared responsive primitive rules must load for every route that uses them. Prefer equivalent narrow math line breaks over clipping or blanket type shrinking.

## Palette and diagram readability

- The shared `src/post/theme.css` carries this reader's terminal/Fastfetch palette. Use semantic `--diagram-*` tokens in SVG and theme text/control tokens in UI; do not embed a second palette in each figure. The source is the active terminal theme plus `/etc/fastfetch/config.jsonc`: green hardware, cyan software, pink uptime. Keep the charcoal/grey reading surface quiet and use accent colors for distinct geometric roles. This is a captured palette, not a runtime dependency on the reader's computer.
- Measure SVG label size after viewBox scaling, not just its authored font-size. A 14-unit label in a 600-unit drawing becomes roughly 6px at 320px page width. Crop unused space, reserve label clearance, and put equations or longer legends in unscaled HTML when necessary. Check 320/390px screenshots; raising contrast alone cannot repair crossing labels or tiny subscripts. Keep normal secondary text at least 4.5:1 against its actual background; assess ancestor opacity too.
- Geometry animation must expose the operation: identify the affected region, stage its construction, commit the topological change, then show the invariant or count. A fading full diagram or an instant unexplained replacement is insufficient. Do not interpolate one diagonal through another; remove the old edge before drawing the replacement. Keep node identity and the single seekable scene clock, and verify intermediate frames as well as final states.

## Motion is a separate part of polish

- For UI polish, read the installed `emil-design-eng` skill when available. In this environment it is at `<local-skill-root>/emil-design-eng/SKILL.md`; if the reader explicitly invokes it, search local skill roots before claiming it is unavailable. Report an unavailable named skill honestly; do not claim to have used it.
- Distinguish **UI motion** (menu entry/exit, press feedback, navigation continuity) from **explanatory geometry motion** (the scene clock). Existing animated diagrams do not satisfy a request to animate dropdowns or page changes. Conversely, UI transitions must not tween mathematical values or start another figure clock.
- Choose a purpose and a frequency budget before animating. Use brief transform/opacity changes and custom ease-out, an origin at the trigger for anchored menus, and faster exits. Prefer existing tokens and primitives; do not add a library for a fade, animate layout dimensions, bounce study content, or add scroll-reveal gates to ordinary prose.
- Keep menus interruptible and let their accessible primitive own presence/focus. Give pointer interactions responsive feedback; keep keyboard use immediate and honor reduced motion. Hover motion needs hover/fine-pointer gating. Preserve 44px targets and visible focus.
- Page transitions must be attached to committed pathname changes and lazy-route readiness. Keep the header stable and content immediately usable. Query/hash/filter changes must not repeatedly animate the article. Preserve router-owned history, anchors, scroll restoration, modified/external/download links, and direct loads; cancel stale effects on rapid navigation. Do not intercept navigation just to wait for an animation.
- Verify normal-motion UI explicitly: sample the actual dropdown and route content between endpoints, inspect entry and exit, close/reopen rapidly, navigate during motion, and check keyboard/reduced-motion paths. Static screenshots, CSS declarations, and tests of the figure clock alone are insufficient evidence. A video or sampled animation timeline makes the claimed behavior reviewable.

## Finish on the actual surface

Run the project's archive/coverage guards, mathematical tests, typecheck, and per-note build. Verify direct routes and in-app transitions in a real browser at desktop and phone widths. Wait for the lazy page body before counting its content; a persistent global header is not proof that the new route is ready. Inspect screenshots and motion frames, preserve original figure nodes, and check TeX, links, tables, console errors, and overflow. Publish only through the configured per-note command within existing user authorization, verify the live artifact and requested downloads, and record the tested source revision.
