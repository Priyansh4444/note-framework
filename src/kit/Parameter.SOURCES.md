# Parameter sources

The previous version adapted bounded rubber stretch from [DialKit's Slider.tsx at 0c90bef](https://github.com/kitlangton/dialkit/blob/0c90befcea82cfe8ce0b1c4f79dad8676483ca9e/src/components/Slider.tsx). Its MIT notice, crediting Josh Puckett, is retained below. The translated ellipse, bowed rail, square-root response and numerical spring have been removed.

The replacement uses a browser-painted native thumb over a persistent closed Bézier contour. Its trailing side extends at most 6px beyond the 8px thumb radius. Reversal retargets the currently painted contour over 90ms; regrabbing samples the in-flight pose, and one replaceable WAAPI owner relaxes only the contour within 180ms of release. Absolute path coordinates are rebased and clamped on every native-center update, so an interrupted morph cannot anchor the root at an old value. Matching props are acknowledged after native sanitization, including percentage round trips. Native sanitized values determine the readout, accessibility text and straight fill endpoint. The contour and response were written here; no third-party component code or dependency was added.

[Build UI's Elastic Slider](https://buildui.com/recipes/elastic-slider) informed bounded decorative feedback. [Lucas Bebber's gooey-effects article](https://tympanus.net/codrops/2015/03/10/creative-gooey-effects/) informed connected silhouettes. This implementation uses explicit paths rather than a blur/contrast filter and keeps the numerical control immediate.

Browser verification guidance is in [component testing](../../docs/component-testing.md).

## MIT License

Copyright (c) 2026 Josh Puckett

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
