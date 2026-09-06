# Visual FX

Visual FX is a small multipass GPU instrument, not a filter gallery. The timeline,
edit history, clip type (`subject`) and project container version (2) remain stable
adapters. Creative configurations have their own version (4).

## Architecture

`js/visual-fx/gl.mjs` is a minimal WebGL2/WebGL1 toolkit (context creation, FBOs,
ping-pong render targets, a shared fullscreen quad). Every pass shares one GLSL ES
1.00 source set, so it compiles unchanged under either context - WebGL2 is preferred
and gives float render targets for the signal buffers below; WebGL1 falls back to
`UNSIGNED_BYTE` automatically when the extension or framebuffer completeness check
fails. `js/visual-fx/glsl.mjs` holds the shared function library (hash/value-noise/
fbm/curl field, luma, palette mapping, dither). `js/visual-fx/passes.mjs` and
`js/visual-fx/systems.mjs` hold the actual pass shaders.

`js/visual-fx/pipeline.mjs` runs six passes per frame, entirely at a low internal
"pixel space" resolution (96-256px wide depending on system and the `grain` tuning
value), before one full-resolution blend at the end:

```
SOURCE --(box downsample)--> INGEST
INGEST + INGEST(prev) + CONTROL(prev) --> CONTROL FIELD   (luma / edges / frame diff / motion memory)
CONTROL FIELD + FIELD(prev)           --> DRIFT FIELD     (curl-noise target eased in with inertia)
INGEST + FIELD + CONTROL + HISTORY(prev) --> STATE PASS   (per-system feedback: displace, erode, inject, write HISTORY)
HISTORY --(quantize/tone-map)--> PALETTE
PALETTE + SOURCE --(nearest upscale + intensity blend)--> screen
```

`INGEST`, `CONTROL FIELD`, `DRIFT FIELD` and `HISTORY` are ping-pong pairs (see
`PingPong` in `gl.mjs`): each pass reads its own previous output as an input, which
is what makes this real feedback rather than `mix(currentFrame, previousFrame)`.
Quantization only ever happens in the palette pass, on the way to the screen - the
stored history stays continuous so error never compounds into mud over hundreds of
frames. `js/visual-fx/renderer.mjs` owns the pipeline's lifetime and GPU resource
cleanup; `js/visual-fx/effect.mjs` owns activation, optional person/background
analysis and final mask compositing (unchanged from before - the mask is applied
after image processing and history, not baked into the renderer). `fallback.mjs`
supplies a bounded CPU approximation (grid quantize + a rotated/scaled trail) for
browsers without WebGL.

## Systems

Four systems, not nine presets: `recursive` (rotating/zooming memory with light
erosion - tunnels and slow collapse), `flow` (a strong curl field advects and
partially desaturates its own history - material flowing and dissolving), `pixelfield`
(a deliberately low working resolution; injection is driven by the motion channel of
the control field, so active cells refresh while static ones hold - pixel as
material, not a pixelate filter) and `trace` (edges/frame-difference are the actual
material fed into a decay-then-stamp afterimage buffer, so structure can outlive the
source). `js/visual-fx/systems.mjs` maps four macros (`intensity`, `memory`,
`structure`, `movement`, all 0..1) plus a small per-system tuning set (2-3 extra
values, always including `grain` and `palette`) onto the actual pass uniforms with
curated, non-linear curves - a macro is a mapped control, never a 1:1 alias of a
single shader uniform.

## Palette

Colour is curated, not a colour picker. `PALETTE_OPTIONS` in `config.mjs` is a fixed
list (source-restrained, monochrome, warm monochrome, cold monochrome, duotone) with
per-system default tones defined in `systems.mjs`. Quantization levels, contrast
curve and dither amount all follow the `structure` macro.

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

## State-safety contract

This is the part that matters most for the instrument to feel alive:

- **STATE-SAFE** (never reset the running simulation): any macro, the `target`
  (Todo/Persona/Fondo), and any non-topology tuning value (e.g. `spin`,
  `turbulence`, `jitter`, `persistBias`, `palette`). `visualConfigTopologyKey()` in
  `config.mjs` is the single source of truth for what counts as topology.
- **STATE-BREAKING** (resets): switching `system`, a topology-flagged tuning value
  (`grain`, i.e. internal resolution), source/seek/clip changes, and an
  incompatible render size (preview/export switch, output resize).
- A discrete "Reiniciar" button in the inspector (`restartVisualFxSimulation`)
  clears state manually without touching the saved config.
- A paused preview re-renders the same media time whenever a macro/tuning value is
  committed; the renderer keys its own dedup cache on `(time, identity, config)`,
  not just `(time, identity)`, so that repaint reflects the new value instead of
  returning a stale cached frame.

## Temporal contract

- Media time and a saved seed drive movement. Repeated timestamps at an unchanged
  config reuse output and do not add feedback. Pausing does not advance history.
- Explicit seeks, source changes, a topology change, bypass, resolution and
  render-mode changes reset history. Backward time and gaps above 250 ms also
  discard history.
- Seeking starts feedback fresh at the chosen frame; it does not reconstruct unseen
  earlier frames. Sequential preview and export with the same frames, settings,
  dimensions and cadence use the same algorithm. Preview may run at a lower internal
  resolution than export; the export config yields more detail without changing the
  system's nature.

## Visual QA

`tests/manual/visual-fx-contact-sheet.mjs` is a dev-only Playwright script (not part
of `npm test`) that renders all four systems against a synthetic, webcam-like moving
frame at several points in time and writes a contact sheet PNG to `test-results/`.
It exists because automated tests validate software, not art direction - use it (or
the FX Lab below) whenever a system's shader changes.

In dev mode (`?fxlab=1` or `localStorage.hatewebcam-fxlab = '1'`), the FX Lab panel's
"Buffers" mode shows the actual intermediate GPU buffers - SOURCE, MASK, MOTION
(control field), FIELD (drift field), HISTORY and OUTPUT (palette) - as small
canvases, read back on demand. It never appears for a normal user.

## Compatibility and removed code

Legacy v3 preset ids migrate to systems: feedback/echo/ghost -> recursive,
melt/fragment -> flow, decay/noise -> pixelfield, signal/scan -> trace. Pre-v3 ids
(anatomy, data-body, smear, dissolve, signal-map) also resolve. Seed and target are
retained when valid; `amount`/`movement`/`persistence` seed the new macros when a
legacy config has no `macros` block of its own. Migration is approximate, not
pixel-identical - it targets "same neighbourhood of behaviour", not bit-for-bit
uniform values, since the whole point of this rewrite is that the old per-module
uniforms no longer exist.

The old subject-bound effects, HUD, preset/config layer and smear renderer were
removed in the prior refactor and stay removed. Person analysis, local assets,
workers, caching and mask transforms remain untouched. Controller field names
(`subjectFxEffect`, `subjectFxBypass`, ...) and the timeline's `subject` wire type
are intentionally kept as compatibility boundaries, not renamed for their own sake -
they are not dependencies of the image renderer, which is entirely new.

## Verification and limits

`npm test` includes normalization, migration, state-safety and timeline checks.
`tests/browser/visual-fx.spec.mjs` exercises real WebGL pixel output, the
state-safety contract end to end, pause/seek/reset, mask composition, FPS decay, the
CPU fallback, four viewport widths and a real WebM export. The existing browser
suite still covers the other editor/webcam features.

The CPU fallback approximates the macro language (grid quantize + a decaying,
rotated/scaled trail) at a reduced width; it is deliberately less detailed than the
GPU graph and does not run the control-field/drift-field/palette machinery. Context
loss switches to that mode for the remaining effect lifetime. No cloud processing or
uploads occur. Hardware-camera use, Firefox/Safari and high-resolution performance on
physical mobile GPUs require device testing.

## Visual reference

The aesthetic direction was informed by Causa sui's public generative work (Verse
series such as "P E T A L R O T", "Ruptured Celestial", "Wound" and "·Trace-
Traversal·" - shattered pixel structure, quantized low-fi blocks, feedback-driven
ghosting, form fading into remaining traces) and by standard TouchDesigner feedback-
network technique (Feedback/Level/Blur/Transform/Edge TOP chains: decay the carried
image, displace it, erode it, let new material re-enter gradually). No individual
work was copied; the four systems and the multipass state-vs-topology model are this
project's own architecture built from that grammar.
