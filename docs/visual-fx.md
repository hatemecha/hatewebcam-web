# Visual FX

Visual FX replaces the experimental Subject FX renderer. The timeline, edit history,
clip type (`subject`) and project container version (2) remain stable adapters.
Creative configurations have their own version (3).

## Processing

`js/visual-fx/config.mjs` defines nine composable recipes and normalizes every saved
value. `effect.mjs` owns activation, optional analysis and final mask compositing.
`renderer.mjs` owns GPU resources and temporal lifetime; `shaders.mjs` combines
spatial displacement, bounded luminance drag, pixel processing, color separation,
recursive history and scan overlays. `fallback.mjs` supplies bounded CPU processing.

Each GPU frame samples the source and the previous **processed output**. After the
render, a GPU copy updates the history texture. No JavaScript pixel readback is used
for GPU feedback. The texture is retained at the same resolution as the output.
The renderer uses existing preview dimensions; export uses export dimensions.

Recipes: Feedback, Digital Melt, Echo, Pixel Decay, Signal Loss, Fragment, Scan,
Ghost and Mono Noise. Advanced controls compose techniques across all recipes.
The main UI exposes intensity, motion and (for temporal recipes) persistence.

## Targeting

- **Todo** neither initializes nor runs MediaPipe, including during export.
- **Persona / Fondo** reuse the local analyzer, worker, mask feathering, motion/cache
  infrastructure and shared coordinate transforms. The mask is applied after image
  processing and history, so temporal material remains independent of pose tracking.
- Missing, stale or failed masks preserve the source (or the chroma background in
  effects-only export) and offer Todo. A zero-coverage valid mask naturally leaves
  Persona unchanged and applies Fondo to the whole frame.
- Export waits for the requested mask frame. Preview uses available recent masks;
  paused preview requests a completed analysis and refreshes when ready.

## Temporal contract

- Media time and a saved seed drive movement. Repeated timestamps reuse output and
  do not add feedback. Pausing does not advance history.
- Explicit seeks, source/config/clip changes, bypass, resolution and render-mode
  changes reset history. Backward time and gaps above 250 ms also discard history.
- Seeking starts feedback fresh at the chosen frame; it does not reconstruct unseen
  earlier frames. Sequential preview and export with the same frames, settings,
  dimensions and cadence use the same algorithm. Different FPS use exponential decay
  scaled by elapsed media time, but resampling, mask cadence and spatial interpolation
  can still change individual pixels. Very slow preview (<4 FPS) resets long gaps.
- Chroma export includes Visual FX: Persona/Fondo composite onto chroma; Todo covers
  the whole image. Other detector overlays retain their existing ordering.

## Compatibility and removed code

Legacy IDs migrate to recipes: Anatomy/Data Body -> Scan, Smear -> Digital Melt,
Dissolve -> Pixel Decay, Signal Map -> Signal Loss. Seed, amount, scale and
persistence are retained when valid. Legacy per-module body settings and HUD labels
are intentionally discarded. Migration is approximate, not pixel-identical.

The old subject-bound effects, HUD, preset/config layer and smear renderer were
removed. Person analysis, local assets, workers, caching and mask transforms remain.
Controller names and the timeline's `subject` wire type are compatibility boundaries,
not dependencies of the image renderer. The inspector lives in
`js/app/visual-fx-ui.mjs`; timeline integration in `js/app/visual-fx-integration.mjs`.

## Verification and limits

`npm test` includes normalization, migration, timeline and loading-race checks.
`tests/browser/visual-fx.spec.mjs` exercises real WebGL pixel output, pause/seek/reset,
mask composition, FPS decay, fallback, four viewport widths and a real WebM export.
The existing browser suite still covers the other editor/webcam features.

Luminance drag is a bounded eight-sample approximation, not full pixel sorting.
The CPU fallback processes a maximum width of 320 pixels, with approximate spatial
processing; it is deliberately less detailed than WebGL. Context loss switches to
that mode for the remaining effect lifetime. No cloud processing or uploads occur.
Hardware-camera use, Firefox/Safari and high-resolution performance on physical
mobile GPUs require device testing.

## Visual reference

The user's Causa sui reference was inspected through the publicly linked video for
[Caustic Progress](https://www.twstalker.com/__causasui/status/2037563658721718763).
Rectangular fragmentation, deformation and temporal traces informed the techniques;
the work and its person annotations were not copied. X itself returned HTTP 403.
