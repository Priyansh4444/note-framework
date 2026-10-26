# Folios, with Hairline

Six cloth-bound notebooks sit in a rounded tray. Point along their resting top edges: the selected folio lifts and its neighbours lean away with a distance-based stagger. Leaving returns the books to their composed lean. Arrow keys, Home, End and Escape provide the same selections from the focused drawing.

This uses the actual [Hairline creation skill](https://hairline.lucasmarkes.com/skills), installed locally at `.agents/skills/hairline-create/`, pinned to upstream commit `37d2e78dcb333ab30c3338e28ed4a690364ea014`. The MIT license ships beside the artifact. The vendored bench and kernel are unmodified; the owned build adapter removes theme UI and fixes the exported shell to dark, as requested. Canonical validation happens before that explicit shell adaptation; `folios.js` is the original figure. The Riffle example informs its fixed resting-edge hit bands and discrete tween pattern. Covers, thickness, fore-edges, spine seams and binder marks are separately constructed geometry.

The figure leans on rules **01 hit**, **02 order**, **04 accent**, **08 clock**, and **09 radius**. The tour visits folios 02, 04 and 06, then leaves the tray to return to rest. Press Play to see the lap. The intensity control changes the stagger from 20 to 65ms, with 40ms as the default. There is no extra application slider.

## Build and verify

From `framework-redesign/`:

```sh
node studies/hairline/build.mjs
node studies/hairline/verify.mjs
```

`verify.mjs` uses the dev server on 3151; `STUDY_ORIGIN=http://localhost:3152` selects the production preview. The official look is run from `studies/hairline/`:

```sh
node ../../.agents/skills/hairline-create/look.mjs folios.js \
  --answer 35,34.19,50.86 --edge 69,64.19,50.86 --zoom answer
```

The eight-view, blind, motion and enlarged-answer sheets are preserved under `artifacts/all-studies/hairline/final/`. The final log is `artifacts/all-studies/hairline/look-final.log`.

The official validator and browser look pass. Manual answers to the look’s questions: 1–12 yes; 13 and 14 do not apply (neither an empty state nor a supplied SVG). At 240px, rounded book covers and doubled fore-edges distinguish the folios, with a recessed pull distinguishing the tray. The rest lean, one bright folio, progressively delayed neighbours, opaque paint order, rounded outer silhouettes and quiet creases remain visible. The drawing contains no words. Both themes and both intensity endpoints fit the frame. The full motion sheet settles without flicker; the hit bands use the rest pose. The tour was observed through its three selections and return.

The adapted standalone shell retains the upstream 11px labels and 32px controls. It ignores light theme queries and has no theme control. The reusable LayerFigure companion uses the framework’s larger type and button sizing. It has no application return link; browser Back returns to the gallery. The other studies use the application’s larger control floors. Browser checks use Chromium on Linux; physical touch hardware and other browser engines have not been exercised. The official look prints a host-side Node `TimeoutNegativeWarning`; its browser console, warning and runtime checks are clean.
