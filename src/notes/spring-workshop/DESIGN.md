# Spring workshop — Figure

The carriage is a mass on a spring; dragging stores displacement, releasing lets damping remove energy. One model owns position and velocity, artwork, gauge and readout. Changing damping or grabbing during motion starts from the displayed position and velocity. No reset-to-start animation or queued transitions.

Original rig, using Anatomy core at wheresryan22/anatomy commit 1482e8469b0a9e0d8cc18ea2740a01423d29ae80 (MIT; vendor/LICENSE). The original instrument is not a recreation of its existing glass-button test rig. No WebGL, pipes, exploded assemblies or 3D rotation. Existing host Scene supplies the only frame clock and visibility gate; explicit release/nudge starts a response. This adapts Anatomy’s idle-tour rule to this site's established user-started motion rule.

40+ purposeful parts before drawing:

- Base: bedplate, groove, four rubber pads, four metal feet, four retaining screws, four screw washers, ruler strip, zero inlay, label plate, two label rivets (23).
- Structure: two guide rails, four rail clamps, four clamp screws, two stops, two stop pads, spring anchor block and damper mounting foot (16).
- Mechanism: carriage slab, four bearing shoes, four shoe screws, cap plate, spring, left spring seat, right spring seat, piston body, rod, gland, piston sight recess (18).
- Control/measurement: grip stem, knurled grip, gauge pedestal, gauge bezel, dial face, needle, hub, selector knob (8).

World x follows the rails; y spans the bed; z is up. One 45° azimuth/30° elevation camera. Static artwork computed once. A moving carriage group holds mounted parts; compressing coil and exposed rod derive from displacement. Near/far rails and spring halves are painted in explicit slots. All displacement stays within the mechanical stroke, including release energy. Body mass 1 kg, spring k=144 N/m, natural frequency 12 rad/s. Damping ratios .22, 1, 1.8 give c=5.28,24,43.2 N·s/m. Exact analytic solutions in all regimes avoid frame-rate integration drift. Display units are mm and mm/s.

Reference takeaways: Hairline's fine line hierarchy and recognizable object, Anatomy's filled isometric solids/four-tone shading, Fuma's directly operated mechanical detail, Aristide's continuous interrupted motion, Bee's editorial restraint. The posts' assets are research only, not shipped. No claims to recreate their GPU/shader implementations.

Verification: invariant ODE/energy/semigroup and interruption tests; browser drag/grab/release/preset changes/keyboard/media/visibility, node identity, phone fit/target sizes, screenshots and close-ups in both themes; source protection, note build and opaque HTML check. Record Anatomy-specific audit/line-check limits explicitly if the stock tools do not fit the host rather than claiming they ran.
