# Sitting vs. Standing Detection

How Spine-IQ decides whether you're sitting or standing, in order of signal
strength (adapted from the sit/stand spec; the Swift-specific architecture was
discarded — this is the same design mapped onto the Tauri/TypeScript stack):

1. **Desk transitions (strongest).** With the camera on an adjustable desk,
   raising/lowering the desk shifts the whole background coherently in frame.
   `backgroundMotion.ts` block-matches textured background patches between
   consecutive downscaled grayscale frames (person region excluded), and
   `transitionDetector.ts` turns sustained coherent vertical motion + settle
   into one completed transition. A completed transition forces the position
   (source `transition`) and holds it against the static classifier for 30 s.
2. **Direction mapping.** Whether "background moves down" means desk-up is
   setup-specific (`backgroundDownMeansStanding`, default true). It is learned
   automatically: correcting the state within 30 s of a detected transition
   flips the stored mapping.
3. **Personal baselines (static classifier).** Absolute frame geometry
   (face size, shoulder height/width) compared against calibrated sitting and
   standing baselines; corrections re-learn the signatures.
4. **State machine.** Sustained-evidence switching, prefer-previous-state when
   uncertain, away grace, manual correction always wins instantly.

Privacy: only luma buffers held transiently in memory for one frame pair;
derived numbers only — no frames are ever stored (see PRIVACY.md).

Debug: the Live view's developer table shows transition phase, cumulative Δy,
median background Δx/Δy, coherence, and tracked-point count.
