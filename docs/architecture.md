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
│  │ properties                   │                           │ drawing JSON + points    │
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
| Drawing reader | DWG or DXF to drawing JSON and a binary list of points, in .NET with ACadSharp, compiled to WebAssembly. Every block once. | `cad/Plantline.Cad`, `cad/Plantline.Cad.Browser` |
| Reader worker | Runs the reader for one file in a worker of its own, ended afterwards or on Cancel; reports a reader that cannot start at once; hands the points over without copying; asks before a file likely too large for the device. | `web/src/layout/cad.worker.ts`, `cad.ts` |
| Drawing model | The reader's output checked and typed; blocks placed inside each other through their transforms (depth limit, copy limit), block extents, lengths. | `web/src/layout/drawing.ts` |
| Recognition | Rules to counts and lengths, over every placed copy. | `web/src/layout/recognize.ts` |
| Placement | Drawing coordinates to latitude and longitude. | `web/src/layout/place.ts` |
| Map scene | The drawing projected once per placement, ready to draw at any zoom. | `web/src/layout/scene.ts` |
| Map layer | Draws the scene on Leaflet's canvas. | `web/src/layout/LayoutMap.tsx` |
| Layout exports | GeoJSON and CSV. | `web/src/layout/exports.ts` |
| Languages | 14 dictionaries, loaded when chosen; English built in; the page's `lang` and `dir`. | `web/src/i18n/` |

## Data formats

### Diagram file (`.plantline.json`)

```json
{
  "format": "plantline",
  "version": 3,
  "diagram": {
    "plantType": "solar",
    "name": "Field A",
    "nodes": [
      { "id": "n-1a2b3c4d", "kind": "gridConnection", "x": 160, "y": 80, "label": "", "designation": "=E01", "props": { "voltageKv": 34.5, "shortCircuitMva": 800 }, "width": null, "rotation": 0, "flip": false, "labelAt": { "x": 30, "y": -40 } },
      { "id": "n-5e6f7a8b", "kind": "busbar", "x": 160, "y": 200, "label": "MV bus", "designation": "", "props": { "voltageKv": 34.5, "status": "planned" }, "width": 320, "rotation": 0, "flip": false, "labelAt": null }
    ],
    "links": [{ "id": "l-9c0d1e2f", "from": "n-1a2b3c4d", "to": "n-5e6f7a8b", "route": [140, 100, 180], "straight": false, "props": { "lineKind": "cable", "lengthM": 85 } }],
    "notes": [{ "id": "t-3a4b5c6d", "kind": "area", "x": 60, "y": 40, "width": 240, "height": 200, "text": "Bay E01" }]
  }
}
```

- `plantType`: `solar`, `wind`, `storage`, `hydro`, `substation` or `transmission`.
- `kind`: one of the 23 element kinds of `NODE_KINDS` in `web/src/plants.ts`.
- `x`, `y`: the element's centre, in diagram units (the grid is 20); a symbol is 48 × 48.
- `width`: the length of a busbar; `null` for anything else.
- `rotation`: 0, 90, 180 or 270, turned clockwise; a busbar is 0 (across) or 90 (upright). `flip`: the symbol mirrored
  across its own axis before it is turned. `labelAt`: where the label starts, from the element's centre (within
  ±1,000), or `null` for its usual place.
- Links have no direction.
- `route`: `null` while a line routes itself; once dragged into shape, the positions of its middle segments, which are
  alternately horizontal and vertical: the y of the first horizontal segment, the x of the next vertical one, and so
  on, an odd count. The segments at the two ends run straight out of the elements' leads, so moving an element keeps
  the route whole; on a busbar, the line meets the bar under the nearest vertical segment.
- `straight`: drawn straight from lead to lead instead of at right angles (`route` is then not used).
- `props` (elements and links): only the fields that have a value. Every element may have `status` (`existing`,
  `planned`, `outOfService`), `manufacturer`, `model` and `notes`, plus its kind's electrical fields; a link may have
  `lineKind` (`cable`, `overheadLine`, `busduct`), `status`, `voltageKv`, `lengthM`, `conductor`, `crossSectionMm2`,
  `circuits`, `ratedCurrentA` and `notes`. The fields of each kind, their units and limits are in
  `web/src/diagram/properties.ts`; a file with a field the kind does not have, or a value out of its range, is refused.
- `notes`: texts (`kind` `text`, from the top left corner, one line per `\n`, `width` and `height` 0) and areas
  (`kind` `area`, a dashed box of `width` × `height` with `text` as its title); at most 1,000, texts of at most 1,000
  characters. Ids are unique across elements, links and notes.
- Versions 1 and 2 are still read and saved as 3. Their elements had `voltageKv` and `ratingKva` instead of `props`:
  the voltage becomes the kind's voltage (a transformer's HV side, an inverter's AC side, a PV array's, combiner box's
  or battery's DC voltage in V), the rating its main power field (a capacitor bank's or reactor's in Mvar), and a
  rating the kind has no field for goes into its notes. Version 1 also lacks `route`, `straight`, `rotation`, `flip`,
  `labelAt` and `notes`: its lines route themselves, its elements stand upright with their labels in place.
- Limits, checked when a file is opened: 5 MB, 5,000 elements, 10,000 links, 200 characters per text, coordinates
  within ±1,000,000, ids of at most 64 letters, digits, `_` or `-`, unique, links between existing elements, and
  routes of at most 63 coordinates.

### Drawing (from the reader)

The reader returns two things: JSON, and the points of every shape as little-endian 64-bit numbers (x1, y1, x2, y2, …),
which the worker hands to the page without copying.

```json
{
  "units": "m",
  "layers": ["0", "INVERTERS", "PV-STRINGS", "PV-TABLES"],
  "blocks": [
    { "name": "PV_TABLE_2x28", "shapes": [3, 1, 0, 4], "references": [] },
    { "name": "INVERTER_250KW", "shapes": [1, 1, 4, 4], "references": [] }
  ],
  "model": {
    "name": "*Model_Space",
    "shapes": [2, 0, 8, 2],
    "references": [
      { "block": 0, "layer": 3, "transform": [1, 0, 0, 1, 470000, 4330000] },
      { "block": 1, "layer": 1, "transform": [1, 0, 0, 1, 470044, 4330020], "attributes": { "ID": "INV-01" } }
    ]
  },
  "truncated": false,
  "pointCount": 10
}
```

- Every block the drawing uses is kept **once**, in its own coordinates, with its shapes and its references to other
  blocks. A block used 16,000 times costs one copy; the app places the copies itself.
- `shapes`: four numbers per shape: the layer (an index into `layers`), 1 when closed (else 0), the first point and
  the number of points. Lines, polylines, arcs, circles, ellipses, splines and solids become point lists (curves with
  24 segments).
- `references`: the block (an index into `blocks`), the reference's own layer, the transform from the block's
  coordinates to those holding it (x' = a·x + c·y + e, y' = b·x + d·y + f, written [a, b, c, d, e, f]), and attribute
  values by tag when there are any. An array of copies (MINSERT) is one reference per copy.
- `units` is `unitless`, `mm`, `cm`, `dm`, `m`, `km`, `in`, `ft`, `yd` or `mi`; `pointCount` lets the app check that the
  JSON and the points belong together.
- Texts, hatches, dimensions, images and 3D solids are left out.
- Limits: 1,000,000 shapes and references, 4,000,000 points; beyond them the drawing is `truncated`.

### Placing blocks

The app walks model space and opens each reference: the block's transform composed with its holder's gives every
copy's position in drawing coordinates. A reference nested deeper than 8 levels is counted but not opened, so a block
that contains itself stops there; a walk that would place more than 5,000,000 shapes and references stops and says so
(a block bomb, ten copies of ten copies of ten…). A block's extent comes from its own shapes and the extents of the
blocks it places, measured once per block and depth.

## How recognition works

Each rule has a kind, a pattern (a case-insensitive regular expression) and a measure. The first matching rule wins:

- **count:** a block reference whose block name or layer matches is one object, at any depth, in every placed copy;
  so is a shape drawn directly in model space on a matching layer. A table's own outline (inside its block) is not
  counted again.
- **length:** every shape on a matching layer adds its length (closed shapes their perimeter) in metres, in every
  placed copy and after its transform.

## How placement works

- **On a point:** the centre of the drawing goes to a latitude and longitude, turned counter-clockwise by the rotation,
  with 1 drawing unit = the unit's length in metres. The earth is treated as flat around the point, which is exact
  enough for a plant a few kilometres wide.
- **Map coordinates:** drawing coordinates (in metres after the unit) are in the given proj4 system, a UTM zone by
  default, and proj4js turns them into WGS84.

## How the map draws a drawing

- **Once per placement**, the drawing is projected into a *frame*: Web Mercator pixels at zoom 0, less an origin at the
  drawing's centre, times 2²⁰. Canvas paths keep 32-bit numbers, which would lose metres at map coordinates; small
  numbers around the drawing keep millimetres.
- A placed block smaller than 1 km is drawn through one transform taken from the projection at its centre (three
  points one metre apart): straight enough to be under 2 cm off. Its shapes are kept once. Anything larger, such as
  model space of a big plant, is projected point by point, and the blocks inside it decide again.
- **On each move or zoom**, Leaflet's canvas renderer places the canvas and the layer draws: blocks out of view are
  skipped, blocks under 4 pixels become dots written as pixels into one image, everything else goes into one path per
  colour, stroked once in lines one screen pixel wide (canvases draw those about nine times faster than wider lines).
- **Moving and turning** (a point placement): a handle at the drawing's centre moves it, one above it turns it. While
  a handle is dragged, the layer redraws the same scene through one more transform (a shift, or a turn about the
  centre), so nothing is projected again; the new placement is applied once, when the drag ends.
- A real 7.5 MB plant drawing (27,000 nested block copies, 265,000 shapes when expanded) opens in about 3.5 s in the
  browser, with the reader at 0.5 GB; the page receives 1.6 million characters of JSON and 10.5 MB of points, holds
  about 80 MB, and redraws in well under 100 ms.

## Security model

The app's inputs are drawings and diagram files, which may be hostile, and its output is shown in a browser and in
files others open.

| Threat | Defence |
| --- | --- |
| A drawing that crashes, hangs or exhausts the reader | The reader runs in a Web Worker started for one file and ended after it; the user sees the time so far and can cancel; files over 100 MB are refused before reading. A worker shares the page's memory, so the worker alone does not protect the page: before reading a file likely to need more than a quarter of the device's memory (about 70 times its size for DWG, 15 times for DXF), the app asks. |
| A reader that cannot start (a runtime file fails to download) | .NET's start then waits for ever; the worker treats errors that are not recovered from within 5 s as a failed start and reports it at once, and the user can try again. |
| A block bomb (deep or self-referencing nesting, exponential copies) | The reader never expands blocks: each is read once, from a list rather than by recursion, so no nesting can overflow its stack; at most 1,000,000 shapes and references and 4,000,000 points are kept. The app opens references at most 8 levels deep and stops a walk at 5,000,000 placed shapes and references. Block extents come from the shapes kept, not from ACadSharp's own recursive bounding box. |
| A hostile diagram file | Strict validation: format, version, every field's type and range, unique ids, existing link ends, size limits; anything unexpected is refused. |
| Script injection (XSS) | React escapes all text; there is no `dangerouslySetInnerHTML`, no `eval`, no HTML built from strings. Exported SVG is rendered by React, so typed text is escaped. |
| Third-party scripts | A Content Security Policy in `index.html` allows scripts and fonts only from the site itself (and WebAssembly), images only from the site and the two tile servers, and no connections elsewhere. |
| Formula injection in CSV | Cells starting with `=`, `+`, `-`, `@`, tab or carriage return are prefixed with `'`. |
| Supply chain | Few dependencies; exact versions at least two weeks old at release; pnpm refuses packages published less than 7 days ago; Dependabot waits as long; GitHub Actions pinned to commits. |
| Privacy | No server, analytics or cookies. Settings and the autosaved diagram are in `localStorage`; drawings are never stored. |

## Decisions

| Decision | Why |
| --- | --- |
| Browser only, no backend | Free hosting (GitHub Pages), nothing to operate, files stay with the user, easy to fork. |
| .NET (ACadSharp) for drawings, compiled to WebAssembly | No free, permissively licensed DWG reader exists in JavaScript (LibreDWG is GPL). ACadSharp is MIT and reads DWG and DXF. Loaded only when a drawing is opened. |
| The reader compiled ahead of time | Measured on a real 7.5 MB plant drawing: 2.2 s instead of 9.9 s in the interpreter; the download is 6.5 MB compressed instead of 2.7 MB, once, then cached. Needs the `wasm-tools` workload to build; without it the same reader is interpreted. |
| The rest in TypeScript and React, without a state library | The diagram is one immutable value with an undo history; `useState` suffices. |
| SVG for diagrams, Leaflet for maps | SVG gives crisp, exportable diagrams and accessible elements; Leaflet is small, stable and BSD-licensed. |
| No CSS framework | One stylesheet with theme tokens and logical properties, which mirror for right-to-left languages by themselves. |
| Our own small translation layer | 14 flat dictionaries; message keys are type-checked, so a missing English message fails the build. |
| Diagrams read left to right in every language | An electrical drawing is the same drawing in Arabic or English; only the interface mirrors. |
| Inter and Estedad, served with the site | The same letters on every device (Persian and Arabic used to be whatever font the device had). Variable fonts from the `@fontsource-variable` packages: each part (Latin, Cyrillic, Arabic…) downloads only when the page shows its letters, about 48 KB for English and 57 KB more for Persian or Arabic. Chinese, Japanese, Korean and Hindi keep the system's font; theirs would weigh megabytes. |
| One mark, drawn once | `public/favicon.svg` is the logo. The header draws the same mark in the theme's colours (`ui/Logo.tsx`; a test keeps them equal), and `pnpm brand` renders the app icons, the link preview image and the README header from it. |

## Known limits

- Arcs drawn as polyline bulges are drawn as straight segments; texts are not read.
- A block reference whose normal is tilted (neither up nor down) is drawn as if seen from above.
- Recognition depends on block and layer names; drawings without meaningful names need edited rules.
- A point placement is flat-earth: fine for a plant, not for a line hundreds of kilometres long (use map coordinates).
- The diagram canvas needs a pointer; keyboard editing on the canvas is in the backlog (B-05).
