---
name: HateWebcam
description: Local-first webcam studio and video editor — warm graphite darkroom, oxide safelight, paper-white actions, quiet preview frame.
colors:
  surface-0: '#121110'
  surface-1: '#191816'
  surface-2: '#21201d'
  surface-3: '#2c2a26'
  text-primary: '#f4f1e8'
  text-secondary: '#b9b3a7'
  text-muted: '#938c80'
  brand: '#b0473c'
  recording: '#e25a4d'
  success: '#7fb08c'
  warning: '#c9a069'
  danger: '#d8756e'
  focus: '#f5f2e9'
  border: '#322f2a'
  border-light: '#423e38'
  paper: '#f2eee4'
  ink: '#16150f'
  brand-soft: 'rgba(176, 71, 60, 0.14)'
  brand-border: 'rgba(176, 71, 60, 0.5)'
  border-subtle: 'rgba(244, 241, 232, 0.1)'
  shadow-ink: 'rgba(0, 0, 0, 0.72)'
  shadow-room: 'rgba(0, 0, 0, 0.42)'
  overlay-dark: 'rgba(17, 17, 17, 0.94)'
typography:
  body:
    fontFamily: "'IBM Plex Sans', 'Segoe UI Variable Text', 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: '13.5px'
    fontWeight: 400
    lineHeight: 1.5
  section:
    fontFamily: "'IBM Plex Sans', 'Segoe UI Variable Text', 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: '13px'
    fontWeight: 600
    lineHeight: 1.35
  ui:
    fontFamily: "'IBM Plex Sans', 'Segoe UI Variable Text', 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: '12.5px'
    fontWeight: 500
    lineHeight: 1.35
  help:
    fontFamily: "'IBM Plex Sans', 'Segoe UI Variable Text', 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: '11.5px'
    fontWeight: 400
    lineHeight: 1.55
  mono:
    fontFamily: "'IBM Plex Mono', 'Cascadia Mono', 'Segoe UI Mono', Consolas, 'Courier New', monospace"
    fontSize: '11px'
    fontWeight: 400
    lineHeight: 1.45
  field:
    fontFamily: "'IBM Plex Mono', 'Cascadia Mono', 'Segoe UI Mono', Consolas, 'Courier New', monospace"
    fontSize: '10.5px'
    fontWeight: 400
    lineHeight: 1.45
  stage-hud:
    fontFamily: "'IBM Plex Mono', 'Cascadia Mono', 'Segoe UI Mono', Consolas, 'Courier New', monospace"
    fontSize: '9.5px'
    fontWeight: 500
    lineHeight: 1
    letterSpacing: '0.14em'
  state-title:
    fontFamily: "'IBM Plex Sans', 'Segoe UI Variable Text', 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: '32px'
    fontWeight: 500
    lineHeight: 1.15
  icon:
    fontFamily: "'Font Awesome 6 Free'"
    fontSize: '11px'
    fontWeight: 900
    lineHeight: 1
rounded:
  sm: '5px'
  md: '8px'
  lg: '12px'
spacing:
  xs: '4px'
  sm: '6px'
  md: '8px'
  lg: '12px'
  xl: '16px'
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
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    rounded: '{rounded.sm}'
    padding: '8px 12px'
  button-primary-hover:
    backgroundColor: '#ffffff'
    textColor: '{colors.ink}'
    rounded: '{rounded.sm}'
    padding: '8px 12px'
  button-primary-active:
    backgroundColor: '{colors.brand}'
    textColor: '#ffffff'
    rounded: '{rounded.sm}'
    padding: '8px 12px'
  mode-tab-active:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    rounded: '3px'
    padding: '0 14px'
---

# Design System: HateWebcam

## Overview

**Creative North Star: "The Darkroom Bench"**

hatewebcam is a local-first camera and video workstation, so the interface borrows the physical logic of a darkroom bench: warm graphite surfaces, an oxide-red safelight, paper-white actions, and a quiet preview frame at the center. The preview is the print being made; panels, inspectors, and timelines are the tools laid out around it. Grain is present but restrained, so it reads as material rather than noise.

The product should feel exact and quiet. Controls are compact, labels are readable at normal size, and the accent red is a signal — live, selected, recording — never decoration. Typography is one family, IBM Plex, split between Sans for language and Mono for measurements, timecode, and machine state.

**Key Characteristics:**

- Warm four-step graphite stack (`surface-0` → `surface-3`) with a shared 180px grain tile at low opacity
- IBM Plex Sans for copy and controls; IBM Plex Mono for fields, timecode, and status readouts
- Paper-white primary buttons; oxide red reserved for live, selection, and recording
- Preview stage with a 1px warm border and capture deck; no faux camera HUD overlays on empty states
- Three-column header: brand, mode switch, actions; mode tabs use plain Webcam / Video labels
- Progressive empty states: a framed import card, a plain-language local-processing note, and next steps only before a source exists
- Tight 5px controls and 8px cards; shadows only on the stage and modal layers

## Colors

A warm, low-chroma dark palette. Nothing is pure black or pure grey: every neutral carries a little brown so the stage reads as a lit room rather than a screen.

### Primary

- **Oxide Safelight** (`#b0473c`): The only heated accent. Active mode indices, selected tabs, recording affordances, and small state markers. Keep it under roughly 10% of any screen.
- **Paper** (`#f2eee4`): Primary button fill and focus surfaces. Paper is the action color; red is the state color.

### Secondary

- **Recording Pulse** (`#e25a4d`): Brighter red for the record dot, recording HUD, and active capture.
- **Detector Green** (`#7fb08c`): Detector-on and success states.
- **Caution Amber** (`#c9a069`): Warnings and countdown emphasis.
- **Fault Rose** (`#d8756e`): Destructive actions and error feedback.

### Neutral

- **Darkroom Stack** (`#121110` / `#191816` / `#21201d` / `#2c2a26`): page, panels, inputs, hover.
- **Paper White** (`#f4f1e8`): primary copy.
- **Warm Ash** (`#b9b3a7`): descriptions, inactive tabs, secondary values.
- **Smoke** (`#938c80`): help text, placeholders, muted chrome. Do not go lighter than this for body-adjacent copy.
- **Hairlines** (`#322f2a` / `#423e38`): dividers, frames, control outlines.

### Named Rules

**The One Heat Rule.** Red marks live, selected, or recording. If red appears on more than a few elements, the signal is lost.

**The Paper Action Rule.** Primary actions are paper-white with ink text. Red is not a button fill except when the button represents an active/recording state.

**The Warm Neutral Rule.** Never introduce cool grey or pure black into the shell. The stage interior may be near-black (`#070706`) because it is a screen within the room.

## Typography

**Typeface:** IBM Plex Sans (variable, 100–700) and IBM Plex Mono (400/500/600), self-hosted from `vendor/fonts/` with the OFL license.

**Character:** A working instrument, not a poster. Sans keeps instructions human; mono keeps numbers, timecodes, and status precise.

### Hierarchy

- **Wordmark** (600, 11.5px, letter-spacing 0.2em, uppercase, mono): `HATEWEBCAM`, preceded by a 7px oxide square.
- **Section Title** (600, 13px, sans, sentence case): panel sections. Preceded by a 6px diamond outline; no decorative Font Awesome icons.
- **UI Control** (500, 12.5px, sans): buttons, toggle copy, field labels.
- **Help** (400, 11.5px, line-height 1.55, sans, smoke): supporting copy under controls.
- **Mono Field / Status** (400–500, 10.5–11px, mono): selects, numeric inputs, timecode, diagnostics, file metadata.
- **State Title** (500, 30–32px, sans, tight leading): camera and import empty states.

### Named Rules

**The Readable Label Rule.** Do not set functional labels at 9px. Section and control labels live at 11–13px; mono status chips may use 10–11px.

**The Mono For Settings Rule.** Anything editable, measured, or machine-readable uses mono: selects, text inputs, timer, resolution, timecode, export summary.

**The No Icon Paraphrase Rule.** Do not put an icon in front of a heading that already says what it is. One icon set only: Font Awesome solid.

## Layout

**Desktop shell:** Full-viewport flex row — preview area (`flex: 1`) + control panel (`clamp(336px, 29vw, 408px)`). The stage and capture deck are centered as one unit.

**Header:** 52px tall, three-column grid: brand block left, mode switch center, actions right. The mode switch is a small segmented control with paper active state and plain labels. It is not a floating tab bar.

**Preview:** Max width `1180px`; expands at 1600px and 2200px breakpoints. The stage is a square-cornered frame with a 1px warm border and a deep, soft lift. Empty camera states stay centered copy without decorative brackets or metadata overlays.

**Capture deck:** Directly under the stage, sharing its width. A 92px capture bar holds timer, shutter, and record; a 38px status bar holds diagnostics and detector state. The deck is part of the stage, not a separate card.

**Control panel:** Intent-based: camera source, look, detectors, then capture quality and image controls behind one advanced toggle. Sections are flat, separated by hairlines, with 18px vertical padding.

**Video editor mode:** Column layout: preview + splitter + inspector, with a timeline docked below the preview. Inspector width `clamp(300px, 25vw, 400px)`, timeline `clamp(300px, 33vh, 420px)`. The no-source state keeps the inspector visible but reveals only import and project resume; timeline and effect tabs stay hidden until a source exists.

**Mobile (≤900px):** The control panel becomes an off-canvas sheet; the stage fills the viewport above a 94px bottom HUD. The header keeps a compact wordmark plus the mode switch; export, language, and GitHub collapse away. A mirror pill floats above the HUD with a visible label. No-source video mode uses an auto-height stage so the import card is never clipped.

**Spacing rhythm:** Panel sections `18px` vertical / `18px` horizontal; control gaps `6–8px`; chip gaps `6px`.

## Elevation & Depth

Depth comes from tonal steps and grain. Shadows are reserved for the stage, modal layers, and the mobile sheet.

### Shadow Vocabulary

- **Stage lift** (`0 0 0 1px rgba(0,0,0,0.55), 0 34px 90px rgba(0,0,0,0.42)`): separates the preview from the room.
- **Header shelf** (`0 10px 30px rgba(0,0,0,0.18)`): subtle separation under the blurred header.
- **Modal stack** (`0 24px 80px rgba(0,0,0,0.7)`): capture preview and export cards.
- **Mobile sheet** (`0 -20px 50px rgba(0,0,0,0.42)`): FX panel rising from the bottom.

### Named Rules

**The Flat Control Rule.** Standard buttons and fields are flat at rest. No drop shadow on `.btn`; hover is a tonal step plus a border shift.

**The Grain Is Structure Rule.** Body, header, panel, stage surround, and mobile HUD share the same grain tile. Keep grain low enough that text never sits on visible noise.

## Shapes

Corners are tight: `5px` on controls/chips, `8px` on cards and modals, `12px` only on large sheets. The preview frame stays square (`0`). Pills are limited to capture hardware and small status dots; mirror is a full-width row with label + mono state, not a faux switch.

Borders are 1px. Active states use fill or a bottom inset accent, not thicker outlines. The mode switch is the one place where a paper fill indicates selection.

## Components

### Buttons

- **Default:** `surface-2` fill, `border-light`, 12.5px sans, 5px radius.
- **Primary:** paper fill, ink text, 600 weight; hover to pure white; active/engaged to brand red with white text.
- **Disabled:** transparent fill, `border-light`, smoke text. Disabled primary buttons must not look like enabled paper buttons.
- **Danger / Recording:** rose outline or solid recording fill.
- **Focus:** 2px `--focus` ring with 2px offset.

### Mode Switch

- **Tray:** `surface-2` at low contrast, 3px padding, 2px gap, 3px radius.
- **Tab:** 12px sans, 34px min height, with a mono index (`01`, `02`) before the label.
- **Active:** paper background, ink text, index tinted oxide. No underline; the fill is the state.

### Chips / Presets

- **Inactive:** transparent or `surface-2`, hairline border, smoke text.
- **Active:** paper fill, ink text. Color chips keep their swatch; the selected outline uses paper, not red.

### Cards / Containers

- **Panel sections:** flat, no radius, hairline dividers.
- **Preview stage:** square frame, warm border, stage lift.
- **Import card:** no boxed card; the stage itself is the frame. Icon tile, title, hint, format chips, primary CTA, and a local-processing note.
- **Modals:** 8px radius, `surface-1`, modal stack.

### Inputs / Fields

- **Select / Text:** mono 10.5–11px, `surface-2`, inset highlight, 5px radius.
- **Range:** 3px track, oxide-to-graphite gradient, paper thumb with a dark core.
- **Checkbox:** 14px square; brand for general toggles, success green for detector units.
- **Focus:** paper ring; field border lifts to `border-light`.

### Navigation

- **Header:** brand + `LOCAL` left, mode switch center, actions right (export in video mode, ES/EN select, GitHub icon).
- **Mobile header:** compact wordmark + mode switch, nothing else.
- **Video inspector tabs:** `Proyecto` / `Clip` / `Ajustes`, with an oxide underline on the active tab.

### Capture Stage (Signature)

- **Frame:** 1px warm border on the preview. Empty states use a light icon, title, one action, and the local-processing footer — no bracket overlays.
- **Empty states:** Framed, centered, and specific. The camera state names the state, gives one instruction, one primary action, and a local-processing footer. The video state leads with import, then project resume.
- **Capture hardware:** Photo is a paper ring with a dark core; record is a red square in a ring. Labels sit below at 10px mono. Disabled hardware dims without disappearing.

### Video Editor

- **Timeline:** Flat dark tracks with a 88px label column, 10px mono labels, 20px rows. The playhead is a 1px oxide line with a paper cap. Track labels are buttons and must keep a transparent background.
- **Inspector:** File actions first, then editing assistance, then export. Marker density controls use a 4-column grid; regenerate spans the row.
- **No source:** Only import and project resume. A three-step "Después de importar" list fills the empty inspector with accurate orientation, then disappears once a source exists.

## Do's and Don'ts

### Do:

- **Do** keep the preview readable with a simple frame and honest empty-state copy.
- **Do** use IBM Plex Sans for language and IBM Plex Mono for settings and measurements.
- **Do** reserve oxide red for live, selected, recording, and primary engagement states.
- **Do** use paper-white for primary buttons and focus.
- **Do** keep section titles at 13px sans, sentence case, with the small diamond marker.
- **Do** reveal video complexity progressively: import, then timeline, then clip-specific controls.
- **Do** keep the local-processing promise visible in empty states and export copy.
- **Do** check no-source video on mobile; the import card must fit without clipping.

### Don't:

- **Don't** set functional labels at 9px uppercase with 1.8px tracking.
- **Don't** add decorative icons next to headings or mix icon families.
- **Don't** use gradients in the wordmark, buttons, or surfaces.
- **Don't** make disabled primary buttons look like enabled paper buttons.
- **Don't** let native button backgrounds leak into the timeline or inspector.
- **Don't** use red for body text, neutral borders, or ambient decoration.
- **Don't** show timeline, effect tabs, or clip controls before a source or clip exists.
- **Don't** introduce pure black or cool grey into the shell; keep the room warm.
