# AGENTS.md

## Project

`hatewebcam-web` is a local-first browser webcam/video editor. Vite 8 serves Svelte 5 islands and TypeScript modules; there is no backend or runtime CDN. UI copy and most docs are Spanish (es-AR); tests assert Spanish text. All media processing stays in the browser.

## Commands

Requires Node `^20.19.0 || >=22.12.0`.

```bash
npm ci
npm run dev            # http://localhost:5173; camera needs localhost or https, not file://
npm test               # Node syntax/structural + unit + visual-fx checks (no browser)
npm run test:browser   # Playwright; builds dist and serves it on 127.0.0.1:4173
npm run lint
npm run typecheck      # svelte-check; src/ is strict TypeScript
npm run format:check   # CI gate
npm run build          # vite build + copy templates/vendor/css into dist
```

Full pre-PR / CI order: `npm run format:check` -> `npm run lint` -> `npm run typecheck` -> `npm test` -> `npm run test:browser` -> `npm run build`.

Run one browser spec with `npx playwright test tests/browser/app-smoke.spec.mjs`; add `-g "test name"` to narrow. Update visual snapshots intentionally with `npx playwright test tests/browser/webcam-visual.spec.mjs --update-snapshots`. `npm run format` rewrites the whole repo; prefer `npx prettier --write <paths>`.

## Architecture

- Entry flow. `index.html` loads `js/app.ts`, which mounts the Svelte shell and starts `WebcamApplication`. `SettingsStore`, `WebcamCamera`, `WebcamCapture`, `Detectors`, and `PreviewRenderer` own their respective resources and publish presentation state.
- Svelte owns the controls, accessible state and localized copy. Canvas, WebGL, timeline drawing and pointer gestures stay in the typed render and interaction modules. Presentation state belongs in `src/lib/**`.
- `js/app/editor-install.ts` creates a `VideoEditorSession` the first time Video is selected. The session owns the source URL, timeline, history, export and Visual FX. Keep value imports from the lazy entry out of the Webcam startup graph.
- `tests/smoke-check.mjs` enforces TypeScript runtime modules, syntax, static asset contracts and the lazy entry. `npm test` uses `tsx` for Node tests that import runtime TypeScript.
- There are no fetched HTML templates. `vendor/` and `css/` are copied to `dist/` by `scripts/copy-templates.mjs`, not by Vite. Add any new static top-level directory there.
- Runtime dependencies must be vendored under `vendor/`. CSP blocks external origins, and the smoke check rejects CDN references (`cdn.jsdelivr.net`, `esm.sh`, `cdnjs.cloudflare.com`) plus the old `webm-muxer` dependency.
- `vite.config.mjs` uses `base: './'` so the same build works locally and under the GitHub Pages subpath. Keep asset URLs relative.
- Persisted state uses `localStorage` keys `hatewebcam_config` and `hatewebcam_profiles`. Settings migrations are one-shot flags in `js/app/webcam-settings.ts` (e.g. `forceMirrorDefaultV4`); add a new flag instead of silently changing existing defaults.
- `subject-worker.ts` and `blob-tracking-worker.ts` are module workers. `js/workers/face-mesh-worker.ts` builds as a classic worker. Keep the worker URLs inline in their constructors so Vite bundles them, and update both endpoints of each typed protocol together.
- Face Mesh runs on the main thread by default. `globalThis.HATEWEBCAM_FACE_MESH_WORKER === true` enables the classic worker path, which falls back to the main thread if the vendored Face Mesh build cannot initialize its GL context.
- `js/visual-fx/` is a six-pass WebGL feedback pipeline. Read `docs/visual-fx.md` before changing it; project schema is v2, Visual FX config is v4, and topology/state-reset behavior is contractual.

## Testing and conventions

- `npm test` is not Playwright. Never claim browser verification without `npm run test:browser`.
- Node tests are hand-rolled `node:assert` scripts. Add unit coverage as a function and invoke it at the bottom of `tests/unit-check.mjs`; browser modules imported there often need browser globals mocked via `mockGlobal`.
- Playwright uses a fake camera device. Visual snapshots live in `tests/browser/*-snapshots/`; default `maxDiffPixelRatio` is `0.07`. Do not delete snapshots to make a test pass.
- `tests/browser/performance-budget.spec.mjs` enforces initial page weight/time budgets (total < 1.5 MB, scripts < 500 KB, largest resource < 700 KB). Avoid heavy runtime assets.
- Spanish is the i18n source language. Message keys are the Spanish strings in `src/lib/i18n/catalog.ts`; English values are exact lookups. Svelte calls `m()`; imperative DOM code calls `translateCurrent()`. There is no DOM-walking translator. Dynamic sentences use `{placeholders}`. Persist `hatewebcam_locale`.
- `js/` lint forbids `console.log` (`no-console` allows only `warn`/`error`). `npm run typecheck` checks Svelte and all own runtime TypeScript, including the three worker entry points with `tsconfig.workers.json`.
- Manual performance/benchmark scripts (`tests/manual/`, `scripts/recording-benchmark.mjs`) are not part of CI; see `PERF.md`.
- CI deploys `main` to GitHub Pages only after all checks pass.

## Docs

`README.md` (Spanish + English), `CONTRIBUTING.md`, `DESIGN.md` (visual tokens), `PRODUCT.md` (scope), `SECURITY.md`, `PERF.md`, `docs/visual-fx.md`.
