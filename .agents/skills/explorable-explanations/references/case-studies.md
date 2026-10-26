# Source-grounded patterns

Inspected 2026-10-22. These are implementation observations and transferable choices, not permission to copy prose, drawings or source wholesale. A reference's visual polish does not verify its scientific claims.

## Making Software — Dan Hollick

Public chapters inspected in a browser and through their loaded client bundles:

- [How does a screen work?](https://www.makingsoftware.com/chapters/how-a-screen-works)
- [Color spaces, models and gamuts](https://www.makingsoftware.com/chapters/color-spaces-models-and-gamuts)

Both rendered through their ending and glossary. The first had 26 figures; the second included numbered illustrations, semantic horizontal rules, local glossary references and restrained text widths. Their 3D-looking pictures were authored image assets, not evidence of live WebGL. Loaded chapter bundles compile paragraphs, headings, tables and calls to a shared figure component carrying a figure number, alt text and dimensions.

The shared figure implementation groups images into desktop columns and specifies full-width horizontal snapping on mobile. Clicking an image opened a fixed overlay with Exit and a caption. Its state tracks opening, selected image and image readiness; transition code uses an image-ready fallback. This is image-inspection behavior, not a simulation clock. Do not add an image camera just because this reference has one: in this note framework, the user prefers diagrams operated through meaningful variables.

**Transfer:** put the relevant picture directly beside its explanatory step; number figures; keep text measure stable while figures can widen; separate a new conceptual section with one purposeful rule. Reserve image dimensions before loading. A small caption should identify the evidence or operation, not merely name the picture.

**Limits:** mobile grouping was read from code rather than tested on a phone. Locked chapters, including digital-images and rays-and-sdfs, were excluded after their public introductions. No claim is made about subscriber material, original source maps, complete accessibility, or animation behavior in those chapters.

## Maxime Heckel — linked experiments

Sources: [raymarching article](https://blog.maximeheckel.com/posts/painting-with-math-a-gentle-study-of-raymarching/), [spring article](https://blog.maximeheckel.com/posts/the-physics-behind-spring-animations/), and the [public source at commit 5148184](https://github.com/MaximeHeckel/blog.maximeheckel.com/tree/514818461e256154b310fa246ad21736ccc8fc4b).

Read implementations under `core/components/MDX/Widgets/`:

- `Raymarching/RaymarchingVisualizer/RaymarchingVisualizer.tsx`: one step state drives a memoized 17×17 sample grid and an isometric geometric view. Reset, next-step and slider controls operate that same state.
- `SpringAnimation/SpringPhysics.tsx`: a fixed-step integrator produces plotted positions; changing parameters restarts the demonstration. Numerical output and motion need a declared relationship; independent animations are not automatically equivalent.
- `ShaderCanvas.tsx`: a viewport-gated requestAnimationFrame loop updates elapsed-time uniforms; parameter refs update GPU uniforms without rebuilding the program. It cleans up the loop when not in view.
- `MDXComponents.tsx` and raymarching `Sandpack.tsx`: dynamic widgets and fixed-height placeholders defer expensive work. Sandpack also considers GPU capability. Those network-dependent playgrounds are not suitable for this framework's offline sharing sandbox.

**Transfer:** one authoritative model, several read-only projections; expose the parameter that causes the visible result. Show one operation before running many. Precompute deterministic traces when playback must seek exactly. Reserve layout space. For this framework, adapt timing to the existing Scene clock instead of importing a second RAF loop or the source site's React/WebGL stack.

Source inspection establishes these code paths, not live slider feel, browser performance, or complete accessibility. Verify those in the resulting note.

## Original implementation exercise

A diagonal edge across a pixel grid can connect vector geometry, covered area, a stored brightness value and reconstruction error. Ask what one pixel should preserve; then let a reader move the edge and compare center sampling with area coverage. Derive all four views from the same numerical model. This is an original worked example, not a reconstructed reference illustration.
