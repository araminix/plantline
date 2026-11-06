# Architecture

plantline is a static web app. Everything happens in the browser: there is no server, no account and no database.

```
 Browser
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ React app (web/src)                                                                     │
│                                                                                         │
│  Single-line diagram                         Plant layout                               │
│  ┌──────────────────────────────┐           ┌───────────────────────────────────────┐  │
│  │ model · history · checks ·   │           │ recognise · place · export            │  │
│  │ arrange · file · export      │           │ map (Leaflet, OpenStreetMap / Esri)   │  │
│  │ canvas (SVG) · palette ·     │           └───────────────▲───────────────────────┘  │
│  │ properties                   │                           │ drawing JSON             │
│  └──────────────┬───────────────┘           ┌───────────────┴───────────────────────┐  │
│                 │ localStorage, files        │ Web Worker, one per file              │  │
│                 ▼                            │ .NET reader (ACadSharp), WebAssembly  │  │
│           this browser only                  └───────────────▲───────────────────────┘  │
│                                                              │ DWG / DXF bytes          │
└──────────────────────────────────────────────────────────────┴─────────────────────────┘
```

## Parts

| Part | What it does | Files |
| --- | --- | --- |
| Plant types | The six plant types, the palette of each (its own equipment first), the elements that change voltage, and the default recognition rules of each. | `web/src/plants.ts` |
| Diagram model | Immutable diagram data and the operations on it: add, move (free during a drag, snapped at its end), edit, connect, remove. | `web/src/diagram/model.ts` |
| History | Undo and redo over diagram states; a preview (a drag in progress) is not a step. | `web/src/diagram/history.ts` |
| Checks | The problems listed in the properties panel. | `web/src/diagram/checks.ts` |
| Arrange | The automatic layout: rows from the grid connection, breadth first. | `web/src/diagram/arrange.ts` |
| Rendering | Symbols and lines in SVG, shared by the canvas, the SVG and PNG exports and print. | `web/src/diagram/symbols.tsx`, `DiagramContent.tsx`, `export.tsx` |
| Canvas | Pointer events (mouse, pen and touch alike): select, drag, pan, pinch, connect. | `web/src/diagram/Canvas.tsx` |
| Diagram file | The `.plantline.json` format and its validation. | `web/src/diagram/file.ts` |
| Drawing reader | DWG or DXF to drawing JSON, in .NET with ACadSharp, compiled to WebAssembly. | `cad/Plantline.Cad`, `cad/Plantline.Cad.Browser` |
| Reader worker | Runs the reader for one file in a worker of its own, with a size limit and a timeout. | `web/src/layout/cad.worker.ts`, `cad.ts` |
| Recognition | Rules to counts and lengths. | `web/src/layout/recognize.ts` |
| Placement | Drawing coordinates to latitude and longitude. | `web/src/layout/place.ts` |
| Layout exports | GeoJSON and CSV. | `web/src/layout/exports.ts` |
| Languages | 14 dictionaries, loaded when chosen; English built in; the page's `lang` and `dir`. | `web/src/i18n/` |

## Data formats

### Diagram file (`.plantline.json`)

```json
{
  "format": "plantline",
  "version": 1,
  "diagram": {
    "plantType": "solar",
    "name": "Field A",
    "nodes": [
      { "id": "n-1a2b3c4d", "kind": "gridConnection", "x": 160, "y": 80, "label": "", "designation": "=E01", "voltageKv": 34.5, "ratingKva": null, "width": null },
      { "id": "n-5e6f7a8b", "kind": "busbar", "x": 160, "y": 200, "label": "MV bus", "designation": "", "voltageKv": 34.5, "ratingKva": null, "width": 320 }
    ],
    "links": [{ "id": "l-9c0d1e2f", "from": "n-1a2b3c4d", "to": "n-5e6f7a8b" }]
  }
}
```

- `plantType`: `solar`, `wind`, `storage`, `hydro`, `substation` or `transmission`.
- `kind`: one of the 23 element kinds of `NODE_KINDS` in `web/src/plants.ts`.
- `x`, `y`: the element's centre, in diagram units (the grid is 20); a symbol is 48 × 48.
- `width`: the length of a busbar; `null` for anything else.
- Links have no direction.
- Limits, checked when a file is opened: 5 MB, 5,000 elements, 10,000 links, 200 characters per text, coordinates
  within ±1,000,000, ids of at most 64 letters, digits, `_` or `-`, unique, and links between existing elements.

### Drawing JSON (from the reader)

```json
{
  "units": "m",
  "layers": ["0", "INVERTERS", "PV-STRINGS", "PV-TABLES"],
  "shapes": [{ "layer": "PV-STRINGS", "depth": 0, "closed": false, "points": [469991, 4329999, 470009, 4329999] }],
  "inserts": [{ "layer": "INVERTERS", "block": "INVERTER_250KW", "depth": 0, "x": 470044, "y": 4330020, "box": [470043, 4330019.5, 470045, 4330020.5], "attributes": { "ID": "INV-01" } }],
  "texts": [{ "layer": "0", "text": "INV-01", "x": 470044, "y": 4330022 }],
  "truncated": false
}
```

- Coordinates are in drawing units, rounded to 3 decimals; `units` is `unitless`, `mm`, `cm`, `dm`, `m`, `km`, `in`, `ft`,
  `yd` or `mi`.
- Block references are expanded: every shape is in model coordinates. `depth` is 0 in model space and grows by one
  per block level.
- Lines, polylines, arcs, circles, ellipses, splines and solids become point lists (curves with 24 segments).
- A block reference's `box` is the extent of the shapes drawn inside it.
- Hatches, dimensions, images and 3D solids are left out.

## How recognition works

Each rule has a kind, a pattern (a case-insensitive regular expression) and a measure. The first matching rule wins:

- **count:** a block reference whose block name or layer matches is one object, at any depth; so is a shape drawn
  directly in model space (depth 0) on a matching layer. A table's own outline (inside its block) is not counted again.
- **length:** every shape on a matching layer adds its length (closed shapes their perimeter) in metres.

## How placement works

- **On a point:** the centre of the drawing goes to a latitude and longitude, turned counter-clockwise by the rotation,
  with 1 drawing unit = the unit's length in metres. The earth is treated as flat around the point, which is exact
  enough for a plant a few kilometres wide.
- **Map coordinates:** drawing coordinates (in metres after the unit) are in the given proj4 system, a UTM zone by
  default, and proj4js turns them into WGS84.

## Security model

The app's inputs are drawings and diagram files, which may be hostile, and its output is shown in a browser and in
files others open.

| Threat | Defence |
| --- | --- |
| A drawing that crashes, hangs or exhausts the reader | The reader runs in a Web Worker started for one file and ended after it; a 2-minute timeout ends a hung read; files over 100 MB are refused before reading. |
| A block bomb (deep or self-referencing nesting, exponential copies) | Expansion stops 8 levels deep; at most 500,000 items are kept. Block boxes come from the shapes kept, not from ACadSharp's own recursive bounding box. |
| A hostile diagram file | Strict validation: format, version, every field's type and range, unique ids, existing link ends, size limits; anything unexpected is refused. |
| Script injection (XSS) | React escapes all text; there is no `dangerouslySetInnerHTML`, no `eval`, no HTML built from strings. Exported SVG is rendered by React, so typed text is escaped. |
| Third-party scripts | A Content Security Policy in `index.html` allows scripts only from the site itself (and WebAssembly), images only from the site and the two tile servers, and no connections elsewhere. |
| Formula injection in CSV | Cells starting with `=`, `+`, `-`, `@`, tab or carriage return are prefixed with `'`. |
| Supply chain | Few dependencies; exact versions at least two weeks old at release; pnpm refuses packages published less than 7 days ago; Dependabot waits as long; GitHub Actions pinned to commits. |
| Privacy | No server, analytics or cookies. Settings and the autosaved diagram are in `localStorage`; drawings are never stored. |

## Decisions

| Decision | Why |
| --- | --- |
| Browser only, no backend | Free hosting (GitHub Pages), nothing to operate, files stay with the user, easy to fork. |
| .NET (ACadSharp) for drawings, compiled to WebAssembly | No free, permissively licensed DWG reader exists in JavaScript (LibreDWG is GPL). ACadSharp is MIT and reads DWG and DXF. Loaded only when a drawing is opened (about 3 MB compressed). |
| The rest in TypeScript and React, without a state library | The diagram is one immutable value with an undo history; `useState` suffices. |
| SVG for diagrams, Leaflet for maps | SVG gives crisp, exportable diagrams and accessible elements; Leaflet is small, stable and BSD-licensed. |
| No CSS framework | One stylesheet with theme tokens and logical properties, which mirror for right-to-left languages by themselves. |
| Our own small translation layer | 14 flat dictionaries; message keys are type-checked, so a missing English message fails the build. |
| Diagrams read left to right in every language | An electrical drawing is the same drawing in Arabic or English; only the interface mirrors. |

## Known limits

- Arcs drawn as polyline bulges are drawn as straight segments; arrays of block references (MINSERT) show one copy.
- Recognition depends on block and layer names; drawings without meaningful names need edited rules.
- A point placement is flat-earth: fine for a plant, not for a line hundreds of kilometres long (use map coordinates).
- The diagram canvas needs a pointer; keyboard editing on the canvas is in the backlog (B-05).
