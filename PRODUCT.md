# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary:** General public — anyone who wants a free, private, browser-based webcam tool without installing software or creating an account.

They use hatewebcam when they need live camera preview with filters, visual detectors, photo/video capture, or light local video editing, and when keeping processing on-device matters more than cloud convenience.

**Secondary:** Contributors and fork maintainers who extend the static, vendorized codebase (see CONTRIBUTING.md).

## Product Purpose

hatewebcam is a browser application for real-time webcam preview with image controls, visual detectors, photo and video capture, and a local video editor with interval-based effects and export — all without a backend, accounts, or uploads.

**Success looks like:** a visitor can open the app, grant camera access, apply filters and detectors, capture or import media, preview results, and download files locally with predictable behavior across supported browsers.

**Current status:** public beta; interface and cross-browser behavior may change (README).

## Positioning

Built-in visual detectors (color tracking, Face Mesh, blink detection) combined with interval-based effects on an interactive timeline — capabilities that sit in one static, local-first app rather than as separate tools or cloud pipelines.

Neighboring webcam filters rarely offer the same detector stack and timeline-based effect authoring in a single offline-capable page.

## Operating Context

- **Runtime:** modern browser with camera permission; served from `localhost` or `https` (not `file://`).
- **Deployment:** GitHub Pages at `https://hatemecha.github.io/hatewebcam-web/`; local dev via `npm run dev` (Vite, port 5173).
- **Workflows:**
  - **Webcam mode:** select camera → adjust filters → optional detectors → capture photo (JPEG) or video (MP4/WebM per `MediaRecorder`) → preview → download or discard.
  - **Video mode:** load local file → trim on timeline → mark effect intervals → export with presets (`fast`, `balanced`, `high`, `chroma`).
- **Persistence:** `localStorage` keys `hatewebcam_config`, `hatewebcam_profiles`, `hatewebcam_locale` (es/en).
- **Privacy model:** processing stays in the browser; no telemetry, analytics, or proprietary backend; vendorized runtime deps (no CDN at runtime).

## Capabilities and Constraints

**Confirmed capabilities:**

- Live preview with quick and fine image controls.
- Photo (JPEG) and video capture with post-capture preview and optional photo enhancement.
- Detectors: color objects, faces (MediaPipe Face Mesh), blinks.
- Saved profiles in the browser.
- Responsive UI with dedicated mobile HUD.
- Spanish and English UI with auto-detection and persistent locale selector.
- Local video editor: trim, interval effects, markers, magnetic snapping, export modal.
- Chroma-only export mode (green/blue WebM overlays for external compositing).

**Technical constraints:**

- Static app: Vite build, vanilla ES modules, no framework.
- Vendorized: Font Awesome, MediaPipe Face Mesh, Mediabunny (no `ffmpeg.wasm`).
- Export codecs/containers depend on browser `MediaRecorder` / WebCodecs; audio may be dropped when incompatible with chosen container.
- Face Mesh WASM can be resource-heavy on modest devices.
- CSP allows `unsafe-eval`, `wasm-unsafe-eval`, and `blob:` for MediaPipe, workers, and export.

**Terminology:** modes **Webcam** and **Video**; UI copy bilingual (es primary in docs, en supported).

## Brand Commitments

- **Name:** HATEWEBCAM (header logo styling); package/repo name `hatewebcam-web`.
- **Voice:** minimal and utilitarian — tool-first; no strong personality beyond the logo. Beta status lives in the README, not as a header badge.
- **Maintainer:** Alex Romero (`hatemecha`); personal project with maintainer final say on scope and design (CONTRIBUTING.md).
- **License:** MIT for project code; third-party licenses in THIRD_PARTY_NOTICES.md.

## Evidence on Hand

| Asset                     | Path / location                               |
| ------------------------- | --------------------------------------------- |
| Desktop webcam screenshot | `docs/images/webcam-desktop.jpg`              |
| Video editor screenshot   | `docs/images/video-editor-desktop.jpg`        |
| Favicon                   | `favicon.svg`                                 |
| Live deployment           | `https://hatemecha.github.io/hatewebcam-web/` |
| Repository                | `https://github.com/hatemecha/hatewebcam-web` |

**Do not fabricate:** testimonials, customer logos, usage metrics, pricing, or performance benchmarks.

## Product Principles

1. **Local-first privacy** — prefer on-device processing and local downloads over uploads or accounts.
2. **Honest beta** — surface limitations (browser variance, WASM cost, codec gaps) rather than overselling.
3. **Offline-capable runtime** — vendorize dependencies; avoid runtime CDN reliance.
4. **Detector + timeline depth** — invest in built-in visual detectors and interval-based effects as the core differentiator.
5. **Utilitarian clarity** — prioritize scanability and task completion over decorative branding.

## Accessibility & Inclusion

- Bilingual UI (es/en) with persistent user choice.
- Semantic landmarks, ARIA on mode tabs and controls, keyboard paths documented in editor (e.g. `M` for markers).
- No product-specific WCAG target confirmed; treat keyboard navigation, contrast, and screen-reader labels as ongoing quality bars.
