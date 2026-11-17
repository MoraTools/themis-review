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

Grades A to D use `color-mix(in oklab, ...)` tokens in both theme blocks: A is `--ok` 90% with `--text`, B `--info` 90%, C `--warn` 90%, and D `--crit` with `--warn` (dark 75%, light 55%, so light D stays orange). F is a literal hex in both blocks, not a color-mix: dark `#f8746c`, light `#a61b1b`. A is green, B blue, C bronze or amber, D orange, and F red. F is never lighter and, in dark, never less saturated than D. Each token passes 4.5:1 against the canvas, both report surfaces, and `--rail`; B and F also pass on `--surface-strong`, and D and F pass on their tinted node heads. The tests compute actual mixed colors and check separation. Print uses the light block on a white page, with distinct grades.

On the map, grade salience only grows from A to F: A and B have no mark, C, D and F have a 4px left bar in the grade color, and only D and F have a tinted head (D 10%, F 14% of the grade over `--surface-raised`).

`--border-strong` is the 3:1 line color: light `#807d77`, dark `#7c7870`, at least 3:1 on every surface (rail, canvas, panel, raised, strong, field). Dashed ghost and file nodes use it, so no separate ghost token is needed. Call edges, the call handle and the legend call swatch all use `--edge-call`.

State tokens in `:root`: `--selected-border` (`--text`) and `--selected-bg` (`--surface-strong`) mark the selected node, the open legend, the flashed code line and pressed filter chips. Hover only moves a border to `--border-strong`; it never uses gold. A sorted table header uses `--text`, and prints muted.

Data-type tokens belong to the theme blocks. Use `var(--type-...)` from React Flow nodes, variables, and edges. Type labels remain present; do not use color alone to identify data.

## Typography

Serve Inter 4.001 and Cormorant 4.000 locally. Inter is the interface face. Cormorant sets the 22px uppercase Themis wordmark, page titles, upload headline, and large report grade. Never use Cormorant below 22px or for controls and data.

The mono stack is `Consolas, "Cascadia Mono", ui-monospace, "SF Mono", Menlo, "DejaVu Sans Mono", monospace`. Do not ship Cascadia Mono. Use mono for code, paths, figures, 11px uppercase labels with 0.06em tracking, and 11px uppercase chips with 0.04em tracking. The report score number is mono. Buttons use Inter 13px 600 and sentence case.

Font sizes come only from the `--fs-*` tokens in `:root`: 11, 12, 13, 14, 16, 18, 22, 26, 32, 40, 64 and 80px, plus `--fs-display` for the upload headline. Prose is never mono: errors, the report and rules meta lines and the editor stats use Inter; figures and file names are mono only inside `<code>`. The texts that explain the score (`.report-facts`, `.rules-note`, `.report-lost`) are 13px with a 68ch measure, and the scoring sentence uses `--text`. Finding messages, fixes and name keys keep a 60ch measure, and the rule id follows the finding title. The floor is 12px for all sentence text, values, hints, notes, paths, stats and table cells. Only uppercase mono labels and chips use 11px. Compact map nodes scale a token by the inverse zoom.

## Layout

The top bar is 56px high on desktop: brand and Review sub-line, existing tabs, analysis tools, then language and theme toggles. At 760px and below, brand and toggles occupy row one, tabs row two, and analysis tools wrap below. At 480px and below the bar has two rows: brand, Export PDF and New analysis as 44x44 icon buttons (download and plus, with `aria-label` and `title`), then the toggles; then the tabs with the score value right-aligned (the score label stays for screen readers only). Keep all tools available at 390px.

The upload error line is always rendered (empty without an error, `role="alert"`), so the live region exists before the message. Under the hero it reserves `2lh`, so the centered block does not move. The message uses the error SeverityIcon, `--crit-text` and Inter 14px.

Keep the statue's existing position, dimensions, responsive fading, and mobile hiding. Its dark rendering uses screen blend; light uses `invert(1)` and multiply. Keep the seven random hero phrases and credit. The hint states that A360 export analysis runs locally.

Reports and rules have a centered reading area. Tables scroll inside their wrappers. The canvas retains its map, legend, minimap, and controls. The editor remains a full-screen dialog.

## Elevation & Depth

Use tonal layers and one-pixel borders. No resting shadows on panels or buttons. The overlay shadow token is reserved for dialogs and drawers.

## Shapes

Controls and panels have 4px corners (`--radius`, also on the minimap, the map controls column and code cards); chips have 3px corners (`--radius-chip`). Controls are `--control-h` high: 32px, or 44px at 760px and below and on coarse pointers. Editor tabs and the legend toggle follow the same token (editor tabs keep 40px on desktop).

Inline text targets (report Line links, taskbot names, editor finding flags) share one rule: inline-flex, at least `--target-min` wide and high (24px, 44px with the 44px controls), with padding offset by a matching negative margin so the text does not move. Finding items have an 8px row gap.

There is one chip shape and type. The severity status chip is a static tag tinted by its severity. The filter chip (editor findings filter and report severity filter) is a control at control height. Its selected state has a strong fill, a text-color border and a check mark, so it is not color only. A report filter chip holds a hidden checkbox and shows the focus ring on the chip.

## Components

The two icon-only preference toggles use local Lucide SVGs. Show a sun in dark mode and a moon in light mode. Both title and accessible label follow the specified bilingual strings. Expose the controls in the editor as well as the shell.

`public/boot.js` runs synchronously before styles. Browser theme and the first supported English or Spanish browser language supply defaults. Only overrides persist under `suite.themis.theme` and `suite.themis.lang`; returning to the browser value clears the key. Migrate `themis-lang` once. Follow live browser changes without an override. React language state follows the document language event.

Use 160ms color-only transitions during theme changes, plus the theme icon turn and cross-fade. Keep the upload zone's rotating gold conic rim, derived from accent tokens. Reduced motion stops the rim and transitions. No entrance animation is needed.

Style selection, caret, scrollbars, focus, and browser chrome. Every interactive element has a 2px focus outline with a 2px offset; header and editor tabs draw it inset (`-4px`) with `--radius`, so the bar edge does not clip it. Severity uses chips and SVG icons, never emoji. Print remains light with local fonts and the same grade distinctions.

## Do's and Don'ts

- Preserve the local-only processing promise and all scoring behavior.
- Keep both languages complete and format dates and numbers for the active language.
- Use state and surface tokens for mixed colors; keep literal palette values inside token blocks.
- Do not restore commercial font names, old font files, preview parameters, or preview variants.
- Do not change `src/core` for presentation work.
