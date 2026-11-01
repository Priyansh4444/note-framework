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

This is evidence from sampled Chromium states, not a guarantee for every possible geometry, physical assistive technology, browser, or device. The recording shows this reviewed local framework preview, not the older deployment. DeepSeek's requested independent review is recorded below when it completes.
