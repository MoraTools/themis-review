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

Grades have their own hex values in every token block, not mixes of the status tokens: light A `#1c6e36`, B `#1d4f82`, C `#6f420a`, D `#ab4c11`, F `#a61b1b`; dark A `#6cc17e`, B `#8eccf9`, C `#dda051`, D `#f37e47`, F `#f6728b`. A is green, B blue, C bronze or amber, D orange, and F red. B is not the `--info` blue and C is not the gold (`--accent`, `--accent-text`): each pair is more than 0.075 apart in OKLab, and so are light C and D. F is never lighter and, in dark, never less saturated than D. Each token passes 4.5:1 on its chip fill, the canvas, both report surfaces, and `--rail`; B and F also pass on `--surface-strong`, and D and F pass on their tinted node heads. The tests compute the colors and check separation. Print uses the light block on a white page, with distinct grades; in print the grade chip has one fixed tabular width, so chips align across rows.

Gold (`--accent`, `--accent-text`) marks only interactive things and their states: links, the active tab, primary buttons, focus, the drop zone and active call edges. Static values (the cap value, rule ids and code in the rules table, the static zip tab of the drop zone) use `--text` or `--text-muted`.

On the map, grade salience only grows from A to F: A and B have no mark, C, D and F have a 4px left bar in the grade color, and only D and F have a tinted head (D 10%, F 14% of the grade over `--surface-raised`).

`--border-strong` is the 3:1 line color: light `#807d77`, dark `#7c7870`, at least 3:1 on every surface (rail, canvas, panel, raised, strong, field). Dashed ghost and file nodes use it, so no separate ghost token is needed. Call edges, the call handle and the legend call swatch all use `--edge-call`.

State tokens in `:root`: `--selected-border` (`--text`) and `--selected-bg` (`--surface-strong`) mark the selected node, the open legend, the flashed code line, pressed filter chips and the pressed compact toggle of the map (with an inset border, not a gold fill). Hover state tokens are in every token block: `--hover-bg` (`--surface-raised`) and `--hover-border` (`--border-strong`). Buttons, map controls, filter chips, sort chips, grade strip buttons, the code flag and table rows use them; hover never uses gold. Inline links keep their own recipe (text color, then gold with a full underline). The minimap mask is one token, `--minimap-mask` (35% of `--bg`), so grade fills outside the view keep their hue. There are no alias tokens: use `--surface`, `--surface-raised`, `--radius`, `--crit-text` and `--on-accent` directly. A sorted table header uses `--text`, and prints muted.

Data-type tokens belong to the theme blocks. Use `var(--type-...)` from React Flow nodes, variables, and edges. Type labels remain present; do not use color alone to identify data.

## Typography

Serve Inter 4.001 and Cormorant 4.000 locally. Inter is the interface face. Cormorant sets the 22px uppercase Themis wordmark, page titles, upload headline, and large report grade. Never use Cormorant below 22px or for controls and data.

The mono stack is `Consolas, "Cascadia Mono", ui-monospace, "SF Mono", Menlo, "DejaVu Sans Mono", monospace`. Do not ship Cascadia Mono. Use mono for code, paths, figures, 11px uppercase labels with `--track-label` (0.06em), and 11px uppercase chips with `--track-chip` (0.04em). One caps-label rule (a selector list in `styles.css`, the report footer included) sets the label font, tracking and case; do not copy the recipe into new rules. The report score number is mono. Buttons use Inter 13px 600 and sentence case.

Font sizes come only from the `--fs-*` tokens in `:root`: 11, 12, 13, 14, 16, 18, 22, 26, 32, 40, 64 and 80px, plus `--fs-display` for the upload headline. Prose is never mono: errors, the report and rules meta lines and the editor stats use Inter; figures and file names are mono only inside `<code>`. The texts that explain the score (`.report-facts`, `.rules-note`, `.report-lost`) are 14px with a 68ch measure. Running text and table text are 14px, meta is 12px, finding titles are 16px; a number inside a phrase sits in a mono `.fig` span. Buttons, tabs, disclosure toggles (Fix first, Legend, Points lost, the scoring lines) and the title of a detailed map node stay 13px; the node layout estimate depends on that title size, and compact node titles use 12px times the zoom scale. In the report facts the scope line (Included / Not shown) uses `--text`; the formula, bands and distribution lines stay muted. Finding messages, fixes and name keys keep a 60ch measure, and the rule id follows the finding title. The floor is 12px for all sentence text, values, hints, notes, paths, stats and table cells. Only uppercase mono labels and chips use 11px. Compact map nodes scale a token by the inverse zoom.

## Layout

The top bar is 56px high on desktop: brand and Review sub-line, existing tabs, analysis tools, then language and theme toggles. At 760px and below, brand and toggles occupy row one, tabs row two, and analysis tools wrap below. At 480px and below the bar has two rows: brand, Export PDF and New analysis as 44x44 icon buttons (download and plus, with `aria-label` and `title`), then the toggles; then the tabs with the score value right-aligned (the score label stays for screen readers only). Keep all tools available at 390px.

The upload error line is always rendered (empty without an error, `role="alert"`), so the live region exists before the message. Under the hero it reserves `2lh`, so the centered block does not move. The message uses the error SeverityIcon, `--crit-text` and Inter 14px.

Keep the statue's existing position, dimensions, responsive fading, and mobile hiding. Its dark rendering uses screen blend; light uses `invert(1)` and multiply. Keep the seven random hero phrases and credit. The hint states that A360 export analysis runs locally.

Reports and rules have a centered reading area. The report head is a two-column grid: title, date and files line, and facts in column 1, the grade box in column 2 beside them; at 760px and below the meta and facts go under the title and grade box. The scoring lines (formula, bands, distribution) are a disclosure under the scope line: open on desktop (the toggle hides while open) and in print, closed at 760px and below (chosen at render with `matchMedia`), so Fix first stays near the top. Under 760px each summary row has two lines (the taskbot name at full width, then findings and score, through a subgrid; the Findings header cell is hidden visually and kept for screen readers), and finding card heads are a grid: chip, place and rule id on row 1, the title on row 2. Tables scroll inside their wrappers. The canvas retains its map, legend, minimap, and controls. At 760px and below the map head has the grade strip on row 1 and Fix first on its own full-width row under it, with its summary (taskbot, then rule title) wrapped to 2 lines at most; the legend toggle stays at the right of the panel. When the first view of a large map cannot show every taskbot, it centers the taskbot of the first Fix first item (else the worst taskbot), without selecting or opening it. The editor remains a full-screen dialog; only `.drawer[open]` is a flex box, so a closed dialog is not painted.

## Elevation & Depth

Use tonal layers and one-pixel borders. No resting shadows on panels or buttons. The overlay shadow token is reserved for dialogs and drawers.

## Shapes

Controls and panels have 4px corners (`--radius`, also on the minimap, the map controls column and code cards); chips have 3px corners (`--radius-chip`). Controls are `--control-h` high: 32px, or 44px at 760px and below and on coarse pointers. Editor tabs and the legend toggle follow the same token (editor tabs keep 40px on desktop).

Inline text targets (report Line links, taskbot names, editor finding flags, rule links, Points lost links) share one rule: inline-flex, at least `--target-min` wide and high (24px, 44px with the 44px controls), with padding offset by a matching negative margin so the text does not move. Stacked Points lost rows drop the vertical offset and have a 2px gap. Each row is one line when it fits: the title, then a muted 12px note when the filter hides some of the family's findings ("1 Info, not shown", also when other findings of the family are shown), then a fixed track (64px, 4px high; 48px and 2px in print; `--border` ground) right before the points, filled from its right end in `--border-strong` to the row's share of the largest row (`aria-hidden`, also in print). The Total row has no track; its points stay right-aligned with the rows. The Points lost and scoring-line toggles are at least `--target-min` high. Grade strip buttons are at least `--target-min` square, and the strip uses a min-height. The 44px query is `screen` only; `@media print` resets the whole target rule to plain inline text with no min size, padding or margin. Finding items have an 8px row gap and align on the baseline, so a line label and its text share one baseline.

List separators never start or end a line. A Fix first item reads taskbot · rule · +points taskbot · +points project: the values show the gain with a plus sign, and a capped item says "fix all N" ("corrige los N"), N being the findings of that family on that taskbot (Points lost keeps the minus sign and "(cap)"). The separators before the values have no-break spaces, and the two values with their leading separator are one nowrap group; at 760px and below the item is a grid, the taskbot on row 1, the rule and the two values stacked at the right on row 2, with no separators. In the PDF, an item whose cards the filter hides gets a print-only "Suggested fix" line with the fix its card would show. Inline lists use atomic items (`inline-block`, nowrap) with a trailing `·` from `li:not(:last-child)::after`; the clean-taskbots list is a flex-wrap list with gaps and no glyph.

The grade form (`Grade.tsx`) is `.grade` (font, color, nowrap only) around an inner `.grade-pair` that holds the baseline flex of letter and score, so the score badge and other boxes can center it vertically. At 480px and below the score badge sits in the tab row, right-aligned, at control height, with its label for screen readers only.

The editor head has one actions group (Show on map, the toggles, Close) with the only auto margin, so it keeps its x for any title. The Variables table first column keeps the 20px gutter (15px at 760px and below). Call handles with no wire carry `idle` and are hidden; the Handle stays for React Flow.

There is one chip shape and type. The severity status chip is a static tag tinted by its severity. The filter chip (editor findings filter and report severity filter) is a control at control height. Its selected state has a strong fill, a text-color border and a check mark, so it is not color only. A report filter chip holds a hidden checkbox and shows the focus ring on the chip.

## Components

The two icon-only preference toggles use local Lucide SVGs. Show a sun in dark mode and a moon in light mode. Both title and accessible label follow the specified bilingual strings. Expose the controls in the editor as well as the shell.

`public/boot.js` runs synchronously before styles. Browser theme and the first supported English or Spanish browser language supply defaults. Only overrides persist under `suite.themis.theme` and `suite.themis.lang`; returning to the browser value clears the key. Migrate `themis-lang` once. Follow live browser changes without an override. React language state follows the document language event.

Use 160ms color-only transitions during theme changes, plus the theme icon turn and cross-fade. Keep the upload zone's rotating gold conic rim, derived from accent tokens. Reduced motion stops the rim and transitions. No entrance animation is needed.

Style selection, caret, scrollbars, focus, and browser chrome. Every interactive element has a 2px focus outline with a 2px offset; header and editor tabs draw it inset (`-4px`) with `--radius`, so the bar edge does not clip it. Severity uses chips and SVG icons, never emoji; the icons differ by shape: error an octagon, warning a triangle, info a circle. Print remains light with local fonts and the same grade distinctions. In the PDF single finding cards stay whole; grouped cards may break inside, with their head, message and fix kept with the first lines (orphans and widows 3); the footer joins the last card. Pages 2 and later show the files and date in the `@page` bottom-left box, in the page counter font, from `--print-id`, which the report sets on the root element (margin boxes read custom properties only from the root).

Under `forced-colors: active`, chips, the score badge and strip buttons get a 2px `CanvasText` border, selected chips `Highlight`, grade and severity bars a 4px `CanvasText` left border, and focus a `Highlight` outline.

## Do's and Don'ts

- Preserve the local-only processing promise and all scoring behavior.
- Keep both languages complete and format dates and numbers for the active language.
- Use state and surface tokens for mixed colors; keep literal palette values inside token blocks.
- Do not restore commercial font names, old font files, preview parameters, or preview variants.
- Do not change `src/core` for presentation work.
