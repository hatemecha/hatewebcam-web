---
name: HateWebcam
description: Dark utilitarian webcam and video editor — graphite surfaces, film grain, compact controls, brand red for live states.
colors:
  surface-0: '#101112'
  surface-1: '#171819'
  surface-2: '#1e2021'
  surface-3: '#292b2c'
  text-primary: '#f0f0ec'
  text-secondary: '#b3b4b0'
  text-muted: '#8b8c88'
  brand: '#a83b38'
  recording: '#e94339'
  success: '#69af81'
  warning: '#c59b59'
  danger: '#cf635e'
  focus: '#f3f3ef'
  border: '#2b2d2e'
  border-light: '#3a3c3e'
  brand-soft: 'rgba(168, 59, 56, 0.14)'
  brand-border: 'rgba(168, 59, 56, 0.55)'
  border-subtle: 'rgba(255, 255, 255, 0.1)'
typography:
  body:
    fontFamily: "'Aptos', 'Segoe UI Variable Text', 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Cascadia Mono', 'Segoe UI Mono', Consolas, 'Courier New', monospace"
    fontSize: '9px'
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: '1.8px'
  ui:
    fontFamily: "'Aptos', 'Segoe UI Variable Text', 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: '12px'
    fontWeight: 500
    lineHeight: 1.5
  mono:
    fontFamily: "'Cascadia Mono', 'Segoe UI Mono', Consolas, 'Courier New', monospace"
    fontSize: '11px'
    fontWeight: 400
    lineHeight: 1.45
  field:
    fontFamily: "'Cascadia Mono', 'Segoe UI Mono', Consolas, 'Courier New', monospace"
    fontSize: '10px'
    fontWeight: 400
    lineHeight: 1.45
  status:
    fontFamily: "'Cascadia Mono', 'Segoe UI Mono', Consolas, 'Courier New', monospace"
    fontSize: '11px'
    fontWeight: 400
    lineHeight: 1.45
  section:
    fontFamily: "'Aptos', 'Segoe UI Variable Text', 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: '13px'
    fontWeight: 600
    lineHeight: 1.5
  state-title:
    fontFamily: "'Aptos', 'Segoe UI Variable Text', 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: '17px'
    fontWeight: 600
    lineHeight: 1.3
rounded:
  sm: '4px'
  md: '6px'
spacing:
  xs: '4px'
  sm: '6px'
  md: '8px'
  lg: '12px'
  xl: '14px'
components:
  button-default:
    backgroundColor: '{colors.surface-2}'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.sm}'
    padding: '8px 12px'
  button-default-hover:
    backgroundColor: '{colors.surface-3}'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.sm}'
    padding: '8px 12px'
  button-primary:
    backgroundColor: '#202223'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.sm}'
    padding: '8px 12px'
  button-primary-hover:
    backgroundColor: '{colors.brand-soft}'
    textColor: '{colors.text-primary}'
    rounded: '{rounded.sm}'
    padding: '8px 12px'
  button-primary-active:
    backgroundColor: '{colors.brand}'
    textColor: '#ffffff'
    rounded: '{rounded.sm}'
    padding: '8px 12px'
  mode-tab-active:
    backgroundColor: 'transparent'
    textColor: '{colors.text-primary}'
    rounded: '0'
    padding: '0 10px'
---

# Design System: HateWebcam

## Overview

**Creative North Star: "The Graphite Bench"**

hatewebcam reads as a dark workshop bench: graphite surfaces, visible film grain, and compact controls arranged for task completion. The preview canvas is the brightest object in the room; panels, headers, and inspectors recede into layered charcoal. Brand red (`#a83b38`) is reserved for mode selection, recording, and primary actions — never as ambient decoration. Obvious workspace context is communicated by position and controls, not explanatory labels.

Typography splits cleanly: sans-serif for controls and body copy, monospace for section labels, selects, inputs, and status chrome. Uppercase micro-labels with wide letter-spacing organize dense panels without adding visual noise.

**Key Characteristics:**

- Dark four-step surface stack (`surface-0` → `surface-3`) with SVG film grain on major shells
- Compact 13px body / 9px uppercase section labels; controls feel instrument-panel dense
- Brand red as the only heated accent; semantic greens/ambers for detector and status states
- Centered capture stage, intent-based right panel on desktop, compact mode switch and bottom HUD on mobile
- Progressive video empty states reveal import first, then timeline and clip-specific adjustments as context exists
- Subtle shadows only where content lifts (preview frame, modals, mobile sheets) — not on every button

## Colors

A restrained dark palette: warm off-white text on cool graphite surfaces, with one oxide red accent and a small semantic set for live/recording/success/warning/danger states.

### Primary

- **Oxide Red** (`#a83b38`): Brand accent — active mode tabs, primary buttons when engaged, favicon stripe, and active preset underlines. Used sparingly; its heat signals "live" or "selected."

### Secondary

- **Recording Pulse** (`#e94339`): Brighter red for active recording states, recording HUD dot, and record triggers when capturing.

### Tertiary

- **Detector Green** (`#69af81`): Success and detector-unit checkbox fills — signals "tracking on" distinct from brand actions.
- **Caution Amber** (`#c59b59`): Warning states in diagnostics and export feedback.
- **Fault Rose** (`#cf635e`): Danger/destructive feedback; pairs with `.btn.danger` treatments.

### Neutral

- **Graphite Stack** (`#101112` / `#171819` / `#1e2021` / `#292b2c`): `surface-0` through `surface-3` — page background, panels, inputs, hovers respectively.
- **Warm Paper Text** (`#f0f0ec`): Primary copy on dark surfaces.
- **Ash Secondary** (`#b3b4b0`): Descriptions, slider labels, inactive tab text.
- **Readable Slate** (`#8b8c88`): Help text, placeholders, muted chrome; raised to preserve legibility at compact sizes.
- **Hairline Borders** (`#2b2d2e` / `#3a3c3e`): Section dividers and control outlines; often softened to `rgba(255,255,255,0.09–0.12)` on grained panels.

### Named Rules

**The One Heat Rule.** Brand red appears on ≤15% of any screen. If everything looks "active," nothing is.

**The Grain Is Structure Rule.** Major surfaces (body, header, preview area, control panel, mobile HUD) share the same `--grain` SVG tile at 180×180px with `soft-light` blend — do not remove grain from one shell while leaving it on neighbors.

## Typography

**Display Font:** None distinct — the logo uses uppercase tracked sans at 11px, not a display face.

**Body Font:** Aptos / Segoe UI stack (with system fallbacks)

**Label/Mono Font:** Cascadia Mono / Segoe UI Mono stack — used for section titles, selects, text inputs, header links, mode tabs, and numeric readouts.

**Character:** Compact instrument UI — small sizes, high information density, monospace for anything that reads as "setting" or "status."

### Hierarchy

- **Logo / Wordmark** (600, 11px, letter-spacing 2.5px, uppercase): Header identity without status or version suffixes.
- **Section Label** (600, 9px, letter-spacing 1.8px, uppercase, mono): Panel section titles (`.section-title`); `.accent` variant uses brand red.
- **UI Control** (500, 12px, sans): Buttons, quick-action copy, slider group labels.
- **Body** (400, 13px, line-height 1.5, sans): Default page text; help text at 11px in muted gray.
- **Field / Status** (400, 10–11px, mono): Selects, text inputs, diagnostic rows, header utility links.

### Named Rules

**The Mono For Settings Rule.** Anything editable or machine-readable (select, text input, timer, export summary) uses the mono stack — do not switch these to sans.

## Layout

**Desktop shell:** Full-viewport flex row — preview area (`flex: 1`, centered) + fixed-width control panel (`clamp(320px, 30vw, 390px)`, min 320px). Header bar is absolutely positioned across the top (`40px` tall, `46–52px` on large breakpoints). The combined preview and capture console is centered on both axes within the remaining workspace.

**Preview:** Max width `1180px` (scales up on ≥1600px and ≥2200px breakpoints); wrapper gets border + deep shadow to lift the canvas from the graphite background.

**Control panel:** The webcam inspector is intent-based: establish the camera, shape the look, enable detectors, then capture. It begins directly with the first actionable section and carries no introductory copy.

**Video editor mode:** Replaces webcam panel with inspector + timeline split; inspector width `clamp(280px, 25vw, 480px)`, timeline height `clamp(240px, 32vh, 420px)`. Empty states are progressive: import is the only prominent first action, advanced project controls stay quiet until a source exists, and adjustment guidance advances from no video to no selected effect clip.

**Mobile (≤900px):** Control panel becomes off-canvas; preview fills viewport with bottom HUD (`mobile-hud-bottom`) and slide-up FX panel. The compact header contains only the centered Webcam/Video switch. Safe-area insets are respected on the recording HUD.

**Spacing rhythm:** Panel sections pad `12px 14px`; control gaps `5–8px`; preset grids `6px` gap. Section titles sit `9px` above their content block.

## Elevation & Depth

Depth is conveyed primarily through **tonal layering + film grain**, not decorative shadows. Surfaces step from `#101112` (page) to `#171819` (panels) to `#1e2021` (inputs) to `#292b2c` (hover).

Shadows appear only where content must lift above the bench:

### Shadow Vocabulary

- **Preview lift** (`0 24px 70px rgba(0,0,0,0.34), 0 1px 0 rgba(255,255,255,0.09)`): Desktop preview wrapper border frame; this lift is required to keep the optical stage distinct from the graphite bench.
- **Panel edge** (`-18px 0 48px rgba(0,0,0,0.16)`): Control panel left shadow on desktop.
- **Header shelf** (`0 8px 24px rgba(0,0,0,0.18)`): Header bar separation.
- **Modal stack** (`0 24px 80px rgba(0,0,0,0.7)`): Export and capture preview cards.
- **Mobile sheet** (`0 -20px 50px rgba(0,0,0,0.42)`): Mobile FX panel from bottom.

### Named Rules

**The Flat Control Rule.** Buttons and inputs are flat at rest with inset highlights (`inset 0 1px 0 rgba(255,255,255,0.035)`). No drop shadow on standard `.btn`.

## Shapes

Corners are **tight, not playful**: `4px` (`--r-sm`) on controls, inputs, and chips; `6px` (`--r`) on cards and modals. The preview frame and flat mode tabs use square corners (`0`). Pills (`border-radius: 999px`) appear only on recording dots and circular shutter/record hardware.

Borders are 1px hairlines in `--border` / `--border-light`, often semi-transparent white on grained surfaces. Active states frequently add an **inset bottom accent** (`inset 0 -2px 0 #e6e6e1` or `inset 0 -3px 0 var(--brand)`) rather than thicker outlines.

## Components

### Buttons

- **Shape:** Slightly rounded rectangles (4px radius), full-width in panels, icon variant 32×32px.
- **Default:** `surface-2` fill, `border-light` outline, 12px sans label, 8×12px padding.
- **Primary:** Dark `#202223` fill, brand-tinted border; hover → `brand-soft` background; `.active` → solid brand fill, white text.
- **Danger / Recording:** Muted rose text or solid brand fill for `.recording`.
- **Hover / Focus:** Background step to `surface-3`; focus ring `2px solid #f3f3ef` with 2px offset.

### Mode Switch (Tabs)

- **Style:** Flat navigation on transparent header chrome with no tray or enclosing border; 14px desktop gap compresses to 10px on mobile.
- **Tab:** Mono 11px uppercase; inactive secondary text, active primary text with a 2px inset brand underline. Mobile reduces horizontal padding from 10px to 8px.

### Chips / Presets

- **Inactive:** Input-surface background, border-light, 10–11px mono/sans.
- **Active:** Inverted light fill (`#deded9`), dark text (`#111213`), inset brand underline — reads as "pressed into paper."

### Cards / Containers

- **Panel sections:** No card radius — flat sections divided by 1px borders.
- **Preview stage:** Square-edged frame with a desktop lift shadow and no card rounding.
- **Modal cards:** 6px radius, grained `surface-1` background, heavy modal shadow.
- **Internal padding:** 12–20px depending on density.

### Inputs / Fields

- **Select / Text:** Mono 11px, `surface-2` / `#1d1f20` fill, inset highlight shadow, 4px radius.
- **Checkbox:** Custom 14px squares; default checked → brand fill; detector units → success green fill.
- **Focus:** Light focus ring on buttons/inputs; field border darkens to `#333`.

### Navigation

- **Header:** Logo left, flat underlined mode switch center-left, actions right (export, compact locale select, icon-only GitHub link).
- **Mobile header:** Centered mode switch only; secondary actions disappear to protect the live stage.
- **GitHub link:** Icon-only 32px action with no container label.

### Capture Stage (Signature)

- **Frame:** The image stands alone without title strips, calibration decoration, or privacy slogans. The desktop preview uses the named preview lift while mobile stays edge-efficient.
- **Alignment:** Preview, empty state, and capture console share one horizontal center; the combined stage is vertically centered in the desktop workspace.

### Video Empty State

- **No source:** Center one import card in the preview and suppress advanced project controls.
- **No selected effect:** Reveal the timeline and a short ordered explanation only after a video exists; clip-specific controls appear after selection.

### Capture Hardware (Signature)

- **Photo shutter:** Circular white ring with dark inset core — mimics physical shutter, not a standard button.
- **Record trigger:** Circular with red dot; recording state adds outer glow ring.
- **Mobile dock:** Bottom bar with grain, large circular capture buttons centered.

## Do's and Don'ts

### Do:

- **Do** use the four-step surface stack and shared grain texture on every major shell.
- **Do** keep section titles at 9px uppercase mono with ≥1.8px letter-spacing.
- **Do** reserve brand red for selection, recording, and primary engagement — use semantic green for detector "on" states.
- **Do** lift only the preview frame and modals with shadows; keep controls flat.
- **Do** use mono for selects, inputs, timers, and status readouts.
- **Do** remove labels that merely explain an obvious workspace or restate the product architecture.
- **Do** reveal video-editor complexity progressively as source and clip context become available.

### Don't:

- **Don't** introduce light mode or high-chroma gradients — the system is dark graphite only.
- **Don't** add rounded-xl/ pill buttons in panels — stay at 4px unless mimicking capture hardware.
- **Don't** use brand red for body text, borders on neutral sections, or decorative backgrounds.
- **Don't** remove grain from one surface while neighboring shells keep it — the texture is structural.
- **Don't** add marketing-style display typography — density and clarity beat expression.
- **Don't** expose advanced video controls before a source exists or clip-specific adjustments before a clip is selected.
