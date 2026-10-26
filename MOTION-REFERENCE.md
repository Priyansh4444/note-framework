# Code changes and the reading timeline

The reference for this pass is [OpenCode 2.0](https://anoma.ly/notes/opencode-2-0/). The earlier pass inspected OpenCode Reloaded; that missed the source-version animation the user meant.

The public article's code control switches between Promise and Effect implementations. It presents one version at a time rather than a red/green split patch. Inspecting the running page and its shipped JavaScript established the following mechanics:

| Before | After | Why |
| --- | --- | --- |
| Replace an entire highlighted listing | Keep identities for corresponding lines and shared text parts | Readers can follow the code that survives the edit |
| Two narrow panes as the main reading view | One full-width version, with a compact version switch | Long expressions remain legible |
| A separate toolbar slab | A quiet filename in a thin outline | The source stays visually primary |
| An abrupt change in line count | Move retained lines and resize the code region | The edit has a visible spatial relationship |
| Animate every version change | Commit cold, offscreen and reduced-motion changes immediately | Motion helps only when the reader can follow it |

The shipped reference uses roughly 400ms for changing text-part widths, 450ms for line movement and 350ms for the container, with zero-bounce structural springs. It measures the real code typography, preserves the block's viewport anchor, and removes temporary animation state after settling. Screenshots establish the appearance; the implementation and actual intermediate runtime probes establish the motion.

Our adaptation uses the existing SolidJS kit. The primary frame follows the measured GitHub Dark palette; the separate Source tools inspector retains Pierre’s Vesper highlighting. A unified patch supplies the two source excerpts; omitted file content must remain visibly omitted. Unified/Split remain useful inspection views, while Copy retains the exact original patch. The public reference's implementation, text, fonts, icons and branding are not copied into this repository.

The curved sketch belongs to the page's top-right reading timeline. `Wayfinder` owns that navigation and its relationship to document scrolling. Experiment clocks own mathematical playback. These are separate meanings of time and position; a change to the page timeline must preserve the working mathematical slider.

For future reference-driven changes, record the exact URL and operate the specific component before choosing an implementation. Distinguish a code-version morph from a patch comparison, and a page-reading timeline from a figure playhead. Verify the named surface in a browser regression before treating visual resemblance as completion.


## The Service and sound

The next reference is the four-client **The Service** figure on the same [OpenCode 2.0 article](https://anoma.ly/notes/opencode-2-0/), identified in its public application as `Jk` / `.service-foundation-study`. It is distinct from the six-client study. Terminal starts one process and one session; Web joins that session; Desktop and the script create independent sessions. Completion returns only to the clients watching that session. The recreation is a labelled educational simulation, with original implementation, text, glyphs and synthesis.

The source declares semantic landing, connection, send, appearance and completion cues. It suppresses backward/equal playback and frame gaps over 120ms, and gates sustained flight sound by active visibility. Our scene observes the same causal idea with a batched discontinuity revision: even a tiny forward seek is silent. Explicit gesture unlocks sound; pause, mute, hidden/offscreen scenes and disposal silence voices. Scheduled/nonzero synthesized signal is verification evidence, not a claim that physical speakers were heard.

The page keeps its vertical–diagonal–vertical reading rail. Animation playback gets a separate shallow horizontal S curve beneath the picture. Both now paint a blue segment of their actual path rather than a dot; the same sampled arclength supplies paint and pointer projection. Offset grabs pause before seeking and release stays paused. Numeric parameters retain their native geometry and semantics.

| Before | After | Why |
| --- | --- | --- |
| Tight patch number, sign and text gutters | Separate measured clearance for each role | Dense changes stay readable without changing copied source |
| Circular reading playhead | Blue path segment | The marker is part of the curved line the user requested |
| Figure playback without its own curved control | Distinct S-shaped scene scrubber | Time can be explored by tracing a different curve |
| Unrelated decorative sound | Quiet cues derived from the picture’s event trace | A contact or reply can be heard at its causal moment |

The current primary frame has the reference’s single glyph toggle and filename in the outline; version, patch and Copy tools sit in a separate disclosure. Primary gutters and excerpt metadata are absent. The host note keeps its own prose width and source contents, so matching measured component styling does not imply whole-image pixel equality.
