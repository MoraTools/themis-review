---
name: Themis One gold
description: Local A360 code review in the Helios, Athena, and Themis suite.
colors:
  dark-bg: "#191715"
  light-bg: "#f4f3f1"
  dark-accent: "#efbc4b"
  light-accent: "#ebb432"
  light-accent-text: "#865901"
typography:
  display:
    fontFamily: "Cormorant, Georgia, serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1.15
  body:
    fontFamily: 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: "4px"
  chip: "3px"
spacing:
  small: "8px"
  medium: "16px"
  page: "24px"
---

## Overview

One gold is the approved suite theme. Preserve the existing upload, map, editor, report, and rules flows. The shell is an Operate surface; reports and rule detail support reading. Do not add decorative labels above headings.

## Colors

`src/ui/styles.css` owns the palette. Warm graphite and marble grounds have separate rail, panel, raised, strong, and field surfaces. Use gold fill for primary actions, but `--accent-text` for readable links and text. Status colors indicate success, warning, error, and information. Use the shared named tokens, not inline colors.

Grades use `color-mix(in oklab, ...)` tokens in both theme blocks. A is green, B blue, C bronze or amber, D orange, and F red or salmon. Each token passes 4.5:1 against the canvas and both report surfaces. The tests compute actual mixed colors and check separation. Print uses the light block on a white page, with distinct grades.

Data-type tokens belong to the theme blocks. Use `var(--type-...)` from React Flow nodes, variables, and edges. Type labels remain present; do not use color alone to identify data.

## Typography

Serve Inter 4.001 and Cormorant 4.000 locally. Inter is the interface face. Cormorant sets the 22px uppercase Themis wordmark, page titles, upload headline, and large report grade. Never use Cormorant below 22px or for controls and data.

The mono stack is `Consolas, "Cascadia Mono", ui-monospace, "SF Mono", Menlo, "DejaVu Sans Mono", monospace`. Do not ship Cascadia Mono. Use mono for code, paths, figures, 11px uppercase labels with 0.06em tracking, and 10px uppercase status chips with 0.04em tracking. The report score number is mono. Buttons use Inter 13px 600 and sentence case.

## Layout

The top bar is 56px high on desktop: brand and Review sub-line, existing tabs, analysis tools, then language and theme toggles. At 760px and below, brand and toggles occupy row one, tabs row two, and analysis tools wrap below. Keep all tools available at 390px.

Keep the statue's existing position, dimensions, responsive fading, and mobile hiding. Its dark rendering uses screen blend; light uses `invert(1)` and multiply. Keep the seven random hero phrases and credit. The hint states that A360 export analysis runs locally.

Reports and rules have a centered reading area. Tables scroll inside their wrappers. The canvas retains its map, legend, minimap, and controls. The editor remains a full-screen dialog.

## Elevation & Depth

Use tonal layers and one-pixel borders. No resting shadows on panels or buttons. The overlay shadow token is reserved for dialogs and drawers.

## Shapes

Controls and panels have 4px corners; status chips have 3px corners. Controls are 32px high, or 44px on small screens and coarse pointers.

## Components

The two icon-only preference toggles use local Lucide SVGs. Show a sun in dark mode and a moon in light mode. Both title and accessible label follow the specified bilingual strings. Expose the controls in the editor as well as the shell.

`public/boot.js` runs synchronously before styles. Browser theme and the first supported English or Spanish browser language supply defaults. Only overrides persist under `suite.themis.theme` and `suite.themis.lang`; returning to the browser value clears the key. Migrate `themis-lang` once. Follow live browser changes without an override. React language state follows the document language event.

Use 160ms color-only transitions during theme changes, plus the theme icon turn and cross-fade. Keep the upload zone's rotating gold conic rim, derived from accent tokens. Reduced motion stops the rim and transitions. No entrance animation is needed.

Style selection, caret, scrollbars, focus, and browser chrome. Every interactive element has a 2px focus outline with a 2px offset. Severity uses chips and SVG icons, never emoji. Print remains light with local fonts and the same grade distinctions.

## Do's and Don'ts

- Preserve the local-only processing promise and all scoring behavior.
- Keep both languages complete and format dates and numbers for the active language.
- Use state and surface tokens for mixed colors; keep literal palette values inside token blocks.
- Do not restore commercial font names, old font files, preview parameters, or preview variants.
- Do not change `src/core` for presentation work.
