# A calmer reading path and operable motion

Status: implementing. Base dfcf8de. Standalone framework only; CS164 and School/note-framework untouched.

Trace: guide Copy prompt only changes an adjacent sentence; CodeBlock uses a separate copied signal. Service is an Experiment already, so reproduce transport visibility/operation before replacing anything. Supplemental notes show definitions, figures and extended references; readers need a shorter default path and visual patterns serving different questions.

Architect skipped: reuse established Experiment/Scene and MorphFigure/LayerFigure/InkFigure contracts; no new scene ownership or rendering architecture. Shared copy feedback has a finite idle/pending/success/failure state and retains existing clipboard semantics. One main experiment per chapter, optional reasoning disclosed, complete content/source coverage preserved. Patterns must answer an actual question, not be appended as a gallery.

Throughput checkpoint:
- Blocking first steps: read existing owners/skills and reproduce actual controls before edits.
- Independent workstreams: copy feedback (kit/Docs), editorial/pattern notes (demo/SVG/spring), Service playback (service/Experiment). Disjoint files; parent owns skill updates and final integration.
- Shared mutable state: preserve one scene clock and retained nodes. No parallel writes to shared files; component owners report cross-scope needs.
- Smallest safe decomposition: three coherent owners; each owns its behavior and focused tests. Parent reviews all diffs before publication.

Acceptance: actual pointer feedback has visible intermediate transform/opacity frames, bounded cancellation, keyboard immediacy and reduced motion. Copy success requires successful copy; exact bytes/fallback remain. Service has visible Play/Pause/Replay and normal/reduced-motion operation. Notes teach one question then a useful experiment; morph/layers/ink connect to numerical or semantic source state. No bright mode. Verify desktop/phone, loaded fonts, no clipping, build and independent starter export if kit changes. Local and portable guidance must both ship.
