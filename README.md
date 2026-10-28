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

## Technical design document

After an import, open **TDD**. Use **Download TDD DOCX** or **Download TDD PDF** to save the document. **Export review PDF** prints the code review report.

Both TDD formats use the same source data and images. The document includes a project dependency map, a solution flow for each unique Taskbot, source control outcomes, input/output variables, referenced files, and logs. Caller/input mapping tables and package tables are omitted. Large flows use source scopes and numbered continuation references. Full runtime graphs remain in the batch coverage files.

Recorder screenshots and enabled documentation images appear at their source actions. Repeated image bytes use figure references. Missing images, dynamic targets, missing Taskbots, disabled actions, and different versions of a shared Taskbot remain visible. For duplicate Taskbot paths, the first imported archive supplies the document source.

Introduction and process summary are empty. The generator does not infer business purpose, deployment schedules, approval, or test results. Source comments are labelled as source documentation. Secret literals in named action fields, authentication headers, and configuration keys are masked. Screenshots retain their source pixels. The browser does not upload files or call an AI service.

To export each ZIP in a directory, plus one combined document, run:

```bash
TDD_RUNTIME_PACKAGES=/path/to/bundled/node/node_modules npm run tdd:batch -- .data /tmp/themis-tdd-runs/iteration-03
```

The batch uses the production parser, document model, and DOCX/PDF exporters. Image conversion requires `sharp`, either in the directory given by `TDD_RUNTIME_PACKAGES` or as an installed Node package. The output directory contains DOCX, PDF, per-run coverage JSON, and `manifest.json` with source SHA-256 hashes and PDF page counts. ZIP files are read only.
