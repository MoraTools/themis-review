# Themis Review

**https://moratools.github.io/themis-review/**

Static code review for Automation Anywhere (A360) bots, 100% in the browser.

Upload one or more `.zip` files exported from the Control Room and get:

- **Node map** (Blender-style): each taskbot is a node with its metrics (lines, comments, logs, variables); Run Task calls are drawn as connections and each variable passed between taskbots as an individual wire colored by type.
- **Editor view** per taskbot: line-by-line code with findings in the margin, plus a variables and packages table.
- **Review rules**: naming convention `<scope><Type><CamelName>` from core_framework, Message Boxes that don't close themselves (those with timeout are not flagged) or that ended up in dead code, taskbots nested from level 3 onward (`utilidad_mensajeria` exempt), empty catches, hardcoded paths, disabled code, unused or undescribed variables (input/output variables weigh more than locals), missing dependencies, log coverage, and comment coverage.
- **Score 0–100** per taskbot and per project, plus an **exportable PDF report** (Export button → print) with each finding and its suggested fix. UI in Spanish and English.

Nothing is uploaded to any server: zips are processed entirely on the front-end.

## Development

```bash
npm install
npm run dev    # local server
npm test       # analysis engine tests (requires sample zips in .data/)
npm run build  # static build (deployed to GitHub Pages via Actions)
```

Structure: `src/core` is the analysis engine (pure TypeScript, no React); `src/ui` is the interface (React + React Flow).
