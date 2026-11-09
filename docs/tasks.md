# Tasks

The work behind each [user story](user-stories.md), in the order it was done, and the backlog.

## Done (0.1.0)

| ID | Task | Stories | Where |
| --- | --- | --- | --- |
| T-01 | Prove that ACadSharp reads DWG and DXF in the browser: compiled to WebAssembly without extra workloads, run in a Web Worker (the runtime must start when the worker starts, and the worker must listen with `addEventListener`). | US-30, US-42 | spike, then `web/src/layout/cad.worker.ts` |
| T-02 | Drawing reader: DWG or DXF to drawing JSON and binary points; every block once with transformed references (arrays as one per copy) and their attributes; curves to points; units; limits on size (1,000,000 items, 4,000,000 points). | US-30, US-32, US-39, US-42 | `cad/Plantline.Cad` |
| T-03 | Browser module of the reader (`CadExports.ReadDrawing`) and its build script (`pnpm cad`). | US-30 | `cad/Plantline.Cad.Browser`, `web/scripts/build-cad.mjs` |
| T-04 | A made-up sample drawing for every plant type (solar also as DWG), written by a generator. | US-31 | `cad/Plantline.Cad.Samples`, `web/public/samples` |
| T-05 | Web app skeleton: Vite, React, strict TypeScript, Content Security Policy, settings kept in the browser. | US-41, US-42 | `web/` |
| T-06 | Plant types, their palettes and their recognition rules. | US-01, US-02, US-32 | `web/src/plants.ts` |
| T-07 | Diagram model, undo history (a drag is one step), checks and automatic arrangement. | US-10 to US-17 | `web/src/diagram/model.ts`, `history.ts`, `checks.ts`, `arrange.ts` |
| T-08 | 23 symbols in the style of IEC 60617, and one renderer for the canvas, exports and print. | US-10, US-21 | `web/src/diagram/symbols.tsx`, `DiagramContent.tsx` |
| T-09 | Canvas: pan, zoom (wheel and pinch), select, drag on the grid, connect; editor with toolbar, palette and properties; keyboard shortcuts. | US-10 to US-18 | `web/src/diagram/Canvas.tsx`, `DiagramEditor.tsx` |
| T-10 | Diagram file format with strict validation and limits; autosave. | US-19, US-20, US-42 | `web/src/diagram/file.ts` |
| T-11 | Exports: SVG, PNG, print to PDF. | US-21 | `web/src/diagram/export.tsx` |
| T-12 | Plant layout: drawing data, recognition, units, map placement (point and rotation, UTM or proj4), solar capacity, GeoJSON and CSV exports. | US-32 to US-38 | `web/src/layout/` |
| T-13 | Plant layout view: reader in a worker per file (size limit, timeout), map with plain and satellite tiles, details panel. | US-30 to US-39 | `web/src/layout/cad.ts`, `LayoutView.tsx`, `LayoutMap.tsx` |
| T-14 | 14 languages, right to left for Arabic and Persian; message keys type-checked. | US-03 | `web/src/i18n/` |
| T-15 | Light and dark themes; layouts for desktops, tablets and phones. | US-04, US-05 | `web/src/app.css` |
| T-16 | Unit and component tests (Vitest), reader tests (xUnit), end-to-end tests on desktop and phone (Playwright). | all | `*.test.ts(x)`, `cad/Plantline.Cad.Tests`, `web/e2e` |
| T-17 | CI: tests on every push and pull request; GitHub Pages on `main`; actions pinned to commits. | US-41 | `.github/workflows/ci.yml` |
| T-18 | Supply chain: packages at least 7 days old (pnpm and Dependabot), versions at least two weeks old at release. | US-42 | `web/pnpm-workspace.yaml`, `.github/dependabot.yml` |
| T-19 | Documents: README, user stories, tasks, test cases, architecture, contributing, security, changelog. | all | `README.md`, `docs/`, root files |

## Backlog

| ID | Task | Why |
| --- | --- | --- |
| B-01 | Draft a single-line diagram from a plant layout: inverters, strings and transformers found in the drawing become elements and lines. | Saves the most drawing time; no other free tool does it. |
| B-02 | String sizing checks from module and inverter datasheets (string voltage against the inverter's input range at the site's temperatures). | A common design mistake, found early. |
| B-03 | Cable schedule from the layout: each cable's length by its layer and ends. | A bill of materials needs it. |
| B-04 | PDF drawing sheets with a title block (project, revision, author) and paper sizes. | Diagrams handed to clients and authorities. |
| B-05 | Keyboard editing on the canvas: move the selection with the arrow keys, connect without a pointer. | Accessibility. |
| B-06 | Install as an app and work offline (PWA). | Field use without a connection. |
| B-07 | Import a substation configuration (IEC 61850 SSD/SCD) as a diagram. | Substation engineers already have one. |
| B-08 | Arcs of polyline bulges and arrays of block references (MINSERT) in the reader. | More faithful drawings. |
| B-09 | Labels that avoid each other in dense diagrams. | Readability of large diagrams. |
