# AGENTS.md

## Project

`hatewebcam-web` is a local-first browser webcam/video editor. Vanilla ES modules + Vite; no framework, TypeScript, backend, or runtime CDN. UI copy and most docs are Spanish (es-AR); tests assert Spanish text. All media processing stays in the browser.

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

- Entry flow: `index.html` -> `js/app.js` -> fetches four templates -> `new AppController().start()`.
- `AppController` is split into mixins in `js/app/*.mjs`, applied at the bottom of `js/app/controller.mjs`. Mixin methods use `this`; controller constants are instance fields.
- The UI migration is incremental: Svelte 5 islands live in `src/`, while the media engine and most editor DOM remain in `js/` and `templates/`. `src/lib/shell/shell-bridge.mjs` is the dependency-free state bridge so legacy `.mjs` modules stay loadable by Node 20 tests. Do not import Svelte/TS modules from legacy `.mjs` files.
- `tests/smoke-check.mjs` enforces these structural rules: no bare `clamp()`/`escapeHtml()` calls, no `$()` outside `js/app/dom.mjs`, no bare controller constants, and no unbound controller methods passed to `addEventListener`/`requestAnimationFrame`/`requestVideoFrameCallback`.
- `templates/*.html` are fetched at runtime and injected into slots in `index.html`. Edit the template files, not just `index.html`; new templates/slots must be wired in `js/app/template-loader.mjs` and usually in the smoke check.
- `templates/`, `vendor/`, and `css/` are copied to `dist/` by `scripts/copy-templates.mjs`, not by Vite. Add any new static top-level directory there.
- Runtime dependencies must be vendored under `vendor/`. CSP blocks external origins, and the smoke check rejects CDN references (`cdn.jsdelivr.net`, `esm.sh`, `cdnjs.cloudflare.com`) plus the old `webm-muxer` dependency.
- `vite.config.mjs` uses `base: './'` so the same build works locally and under the GitHub Pages subpath. Keep asset URLs relative.
- Persisted state uses `localStorage` keys `hatewebcam_config` and `hatewebcam_profiles`. Settings migrations are one-shot flags in `js/app/init.mjs` (e.g. `forceMirrorDefaultV4`); add a new flag instead of silently changing existing defaults.
- `subject-worker.mjs` and `blob-tracking-worker.mjs` are module workers; `js/workers/face-mesh-worker.js` is a classic script. Keep `new URL('./worker.mjs', import.meta.url)` inline so Vite can bundle workers.
- Face Mesh runs on the main thread by default. The classic-worker path is gated by `globalThis.HATEWEBCAM_FACE_MESH_WORKER === true` and is known broken with the vendored FaceMesh build (undefined GL context).
- `js/visual-fx/` is a six-pass WebGL feedback pipeline. Read `docs/visual-fx.md` before changing it; project schema is v2, Visual FX config is v4, and topology/state-reset behavior is contractual.

## Testing and conventions

- `npm test` is not Playwright. Never claim browser verification without `npm run test:browser`.
- Node tests are hand-rolled `node:assert` scripts. Add unit coverage as a function and invoke it at the bottom of `tests/unit-check.mjs`; browser modules imported there often need browser globals mocked via `mockGlobal`.
- Playwright uses a fake camera device. Visual snapshots live in `tests/browser/*-snapshots/`; default `maxDiffPixelRatio` is `0.07`. Do not delete snapshots to make a test pass.
- `tests/browser/performance-budget.spec.mjs` enforces initial page weight/time budgets (total < 1.5 MB, scripts < 500 KB, largest resource < 700 KB). Avoid heavy runtime assets.
- Spanish is the i18n source language. Add English mappings to `ENGLISH_REPLACEMENTS` in `js/i18n.mjs`; matching is substring-based and longer phrases must come first.
- `js/` lint forbids `console.log` (`no-console` allows only `warn`/`error`). There is no typecheck step.
- Manual performance/benchmark scripts (`tests/manual/`, `scripts/recording-benchmark.mjs`) are not part of CI; see `PERF.md`.
- CI deploys `main` to GitHub Pages only after all checks pass.

## Docs

`README.md` (Spanish + English), `CONTRIBUTING.md`, `DESIGN.md` (visual tokens), `PRODUCT.md` (scope), `SECURITY.md`, `PERF.md`, `docs/visual-fx.md`.
