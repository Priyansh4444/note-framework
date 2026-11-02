# Framework council review

This work belongs to the standalone Note Framework. The CS164 site and course archive are not part of this change; integration into course sites is deferred.

## Priorities from earlier reviews

The author asked us to give prior Opus judgments significant weight. The checklist below preserves the substantive findings supplied in the thread, including the Claude council feedback, rather than treating a new numerical score as a reason to discard them. Original provider attribution was not available for every historical finding; these are not presented as a new independent Opus review.

| Prior finding | Result | Guard or implementation |
| --- | --- | --- |
| Claims about every figure, construction order, endpoints, and approximation guarantees were inaccurate | Prose distinguishes curve evaluation from closed-form weight plots; endpoints cover the full interval; summaries derive from live geometry | `framework-demo/index.tsx`, `figures/Construction.tsx`, `figures/Flatten.tsx`, `bezier/model.test.ts` |
| Timeline labels selected times they did not name | Named beats select their semantic positions; a figure has one playback scrubber | `src/kit/timeline-model.ts`, `timeline-model.test.ts`, `visual/scene-controls.visual.ts` |
| Weights repeated the same encoding and hid coincident values | Redundant rings removed; exact ties remain at their true coordinates with tie marks; chart grip has a separate lane | `figures/Weights.tsx`, `visual/weights-r8.visual.ts` |
| Result marks covered draggable endpoints and labels escaped figures | Controls paint above results; semantic subscript labels stay inside bounds | `bezier/Handles.tsx`, `visual/taste.visual.ts`, `visual/rounded-playhead.visual.ts` |
| Flatten had a long visually static tail, beaded samples, and misleading tiny-gap rings | Playback ends at 16 segments; samples fade as density rises; the zero/subpixel gap display is suppressed | `figures/Flatten.tsx`, `visual/flatten-r8.visual.ts` |
| Figures were too tall and row numbers were detached | Empty viewBox space removed; construction uses a nearby tone legend | `bezier/CurveScene.tsx`, `visual/r8-integration.visual.ts`, `scripts/taste-measure.ts` |
| Phone code hid the corrected side and the scroll cue | Before/After stays available; the initial corrected source and external scroll hint are visible | `src/kit/CodeBlock.tsx`, `code-block.css`, `visual/code-morph.visual.ts` |
| Reduced motion skipped meaningful discrete states | Next step visits 1, 2, 4, 8, 16; replay returns to 1 | `src/kit/playback.ts`, `playback.test.ts`, `visual/r8-integration.visual.ts` |
| Small chart tick labels collided | Shared Axes selects labels using actual viewer scale while preserving data and ticks | `src/kit/Axes.tsx`, `visual/flatten-r8.visual.ts` |
| Semantic indices were incorrectly treated as undersized base labels | Audit permits proper subscript scaling while still rejecting genuinely tiny text | `scripts/audit-measure.ts`, `scripts/audit.test.ts` |

## Final independent review

GPT-6.1 Sol, high reasoning effort, reviewed source `559d4c34c0dadc7f2af347fc45fcef40db8ad0ef` independently in round 10. Scores: readability **10**, figures **10**, motion **10**, correctness **10**, code **10**. No actionable finding remained in that sampled review.

The reviewer inspected actual screenshots and source, drove Chromium at 320/390/1440px with successfully loaded fonts, checked exact weights at 0, ½, 1, pointer manipulation, playback/pause, continuous seeking, code switching, and reduced-motion stepping. It independently reran 43 audit tests and six chart browser tests. The parent run passed lint, formatting, dead-code analysis, typecheck, 268 tests, and an opaque-note audit of 62 samples / 31,186 checks with zero unverified states. The standalone repository separately passed lint, formatting, dead-code analysis, typecheck, 257 tests, 12 Vitest component tests, 22 focused browser checks against the production build, seven public Worker/account/navigation checks, and a fresh source export with its own install, typecheck, dead-code check, and public build. The course-only tests are intentionally absent from that standalone count. The complete browser suite is recorded in the PR.

This is evidence from sampled Chromium states, not a guarantee for every possible geometry, physical assistive technology, browser, or device. The recording shows this reviewed local framework preview, not the older deployment. DeepSeek independently rated the reviewed version 9.4/10. It found the missing public-export audit module (fixed by shipping the full taste tool and independently building the export) and a near-midpoint weight-tie interaction gap. The latter now canonicalizes only values within 1e-7 of ½ before computing all geometry and ties, and accessible weights use three decimals. The pointer regression also verifies the exact symmetric values. A new Sol High review covers this follow-up; the earlier 10/10 applies to the recorded source above.


## Subdivision motion follow-up — 4ecd915

The reader still found refinement blocky. Integer polygon replacements became one persistent 17-vertex midpoint construction on the existing scene clock. Travel-based 3.2-second pacing compresses stationary and tiny changes; short launch/landing ramps leave interior refinements moving. Counts distinguish settled from splitting states, the sampled gap measures the actual interpolant, and its blended bound remains valid. Sparse knots and optional witness ink fade without rings or a static playback tail. Compact captions share Straight's status with the accessible description.

Sol High's initial scoped approval missed a non-preset phone label crossing subsequently found by DeepSeek. The actual rounded-drag counterexample was reproduced, then fixed by avoiding filled swept triangles rather than settled outlines. The regression checks real glyph boxes, intermediate states and stationary labels at 320/390/1440px. Reproducible findings take precedence over earlier numeric scores.

Sol High independently approved final code revision `4ecd915`: readability, figures, motion, correctness and code each 10/10 within the scoped educational figure. It checked 14 runtime cases / 98 seek states, 15 Straight description states and 12 distance-helper cases. DeepSeek separately closed both findings with a containment proof and real pointer/browser evidence. Model, clock and CSS were unchanged by that closure; inherited motion evidence is distinguished from newly checked annotations.

Root verification passed: 273 source/integration tests, 49 affected browser checks, a fresh independent source export/install/typecheck/dead-code/public build, and an opaque-note audit of 63 states / 31,726 checks with no findings or unverified states. Full CI [41392266849](https://github.com/Priyansh4444/note-framework/actions/runs/41392266849) passed on `4ecd915`. The course site remains unchanged.

These sampled Chromium results do not certify every possible shape or device. Eight placement candidates remain best effort. Antigravity was supplementary; its overstated coverage claims were excluded. Grok could not start because its balance was exhausted; Iceman Free's key had expired. No fresh Opus approval was obtained. The portable reader contract records the swept-area, actual-glyph and shared-status lessons.


## Reading and interaction follow-up — 30b2cec

The default note path now keeps one question, experiment and result together, with advanced reasoning/code and compact references still reachable. Necessary Morph definitions and the interpolation caveat stay visible. One retained cyan strip makes correspondence trackable through all three live-curve views; optional Ink answers the separate material question. SVG inspection preserves its five original nodes, and Spring remains dark. Service exposes its existing single transport above the picture, with unchanged clients, events, subscribers and opt-in sound.

Shared CopyButton feedback has distinct pending/success/selection/error states, stable dimensions, brief pointer transitions and immediate keyboard/reduced feedback. A reproduced late-denial race selected old source after a newer success; operation AbortSignals now guard fallback side effects as well as stale UI status. The regression failed before the fix and passes afterward.

Sol High independently reviewed application revision `30b2cec`: readability, figures, motion, correctness and code each **10/10 in this sampled scope**, with no actionable findings. It verified 320/390/1440px normal/reduced paths, actual intermediate Copy/Morph frames, exact 395-byte patch fallback, same-source supersession, source edits/unmounts, retained geometry, source/glossary hashes, Service stepping/replay, and local font delivery. The report distinguishes probe mistakes from source defects and parent evidence from its own. Its retained tradeoff is the Service phone scroller: readable reference geometry takes precedence over shrinking four clients. No universal device/shape certification is claimed.

DeepSeek was requested independently for this follow-up, but its free usage limit prevented a review. No new DeepSeek, Grok or Opus approval is claimed; earlier Claude objections remain part of the checklist above.

Parent verification: 273 source/integration tests; 15 new copy/morph/reference checks; 25 migrated regressions; 41 layout/Service/taste checks; 12 Vitest components; independent framework/starter installs, typechecks, component checks and normal/self-contained builds. All four changed-note opaque audits passed: **162 states / 38,213 checks**, zero findings or unverified states. Full browser/CI completion and deployment are recorded with the PR. The 27-second walkthrough is in `artifacts/reading-motion/video/note-framework-reading.mp4`.

CI exposed a renderer-specific snapshot mistake after the application review: local screenshots had been relabelled as Ubuntu references. The actual Ubuntu captures showed identical geometry with font rasterization differences confined to text. Only those two references were replaced with inspected CI captures, and Vitest now rejects Ubuntu screenshot updates from a different OS. Comparison thresholds remain unchanged. These later testing/guidance changes do not alter the reviewed application behavior. CS164 and the original School framework remain untouched.
