# Test cases

Every [user story](user-stories.md) and the automated tests that prove it. All of them run on every push and pull
request ([CI](../.github/workflows/ci.yml)).

| Suite | Tool | Where | Run |
| --- | --- | --- | --- |
| Unit and component | Vitest, Testing Library, jsdom | `web/src/**/*.test.ts(x)` | `pnpm test` in `web/` |
| Drawing reader | xUnit | `cad/Plantline.Cad.Tests` | `dotnet test --project Plantline.Cad.Tests` in `cad/` |
| End to end | Playwright, on a desktop and a phone (Pixel 7, touch) | `web/e2e` | `pnpm cad && pnpm e2e` in `web/` |

## Getting started

| ID | Story | Case | Test |
| --- | --- | --- | --- |
| TC-01 | US-01 | The first visit asks for the plant type; the palette then starts with that plant's equipment. | `App.test.tsx` › asks for the plant type on the first visit…; e2e › every test starts this way |
| TC-02 | US-01 | Every plant type has a palette of known elements, without repeats, with a grid connection. | `plants.test.ts` › give every plant type a palette… |
| TC-03 | US-02 | Changing the plant type changes the palette and keeps the diagram. | `App.test.tsx` › changes the palette with the plant type and keeps the diagram |
| TC-04 | US-03 | Every language has exactly the English messages, none empty, with the same placeholders. | `i18n.test.ts` › have a file for every language… |
| TC-05 | US-03 | Every plant type and every element and object kind has a name. | `i18n.test.ts` › name every plant type… |
| TC-06 | US-03 | Arabic and Persian are right to left, the others left to right. | `i18n.test.ts` › write Arabic and Persian right to left…; `App.test.tsx` › turns the page right to left in Arabic |
| TC-07 | US-03 | The first browser language the app speaks is chosen (pt-BR is Portuguese), else English. | `i18n.test.ts` › pick the first browser language… |
| TC-08 | US-03 | A missing message falls back to English; placeholders are filled. | `i18n.test.ts` › fill placeholders and fall back… |
| TC-09 | US-03, US-05 | In Persian the layout mirrors (palette on the right) and nothing scrolls sideways, on desktop and phone. | e2e › mirrors the layout in Persian… |
| TC-10 | US-04 | The theme switches between light and dark. | `App.test.tsx` › switches between the light and dark themes |
| TC-11 | US-05 | No view scrolls sideways on a phone or a desktop. | e2e › every test ends with this check |

## Single-line diagram

| ID | Story | Case | Test |
| --- | --- | --- | --- |
| TC-20 | US-10 | Tapping a palette element adds it, selected, and shows its properties. | `App.test.tsx` › adds an element from the palette…; e2e › builds, connects… |
| TC-21 | US-10, US-11 | A new element lands on the grid; a busbar gets its length. | `model.test.ts` › adds an element on the grid… |
| TC-22 | US-11 | A drag moves freely and snaps to the grid at its end. | `model.test.ts` › moves elements freely during a drag… |
| TC-23 | US-11, US-15 | A drag is one undo step; previews are not steps. | `history.test.ts` › makes a drag one step… |
| TC-24 | US-12 | Two elements connect once; never an element to itself. | `model.test.ts` › connects two elements once… |
| TC-25 | US-12 | Connecting by picking elements on the canvas, with a mouse and with touch. | e2e › builds, connects, checks and saves… |
| TC-26 | US-13, US-14 | Fields are edited; removing an element removes its lines. | `model.test.ts` › removes an element together with its links… |
| TC-27 | US-15 | Undo and redo; a new step clears redo; nothing to undo changes nothing. | `history.test.ts` › undoes and redoes…; `App.test.tsx` › adds an element… and undoes it; e2e › builds… |
| TC-28 | US-16 | Arrangement: grid connection on top, one row per level, rows centred, a manual order kept. | `arrange.test.ts` › puts the grid connection on top… |
| TC-29 | US-16 | Unconnected groups side by side without overlap. | `arrange.test.ts` › places unconnected groups side by side… |
| TC-30 | US-16 | A busbar reaches every feeder below it. | `arrange.test.ts` › lengthens a busbar… |
| TC-31 | US-17 | No issues for an empty diagram or a good one. | `checks.test.ts` › finds nothing…; e2e › builds… (“No problems found.”) |
| TC-32 | US-17 | A missing grid connection and unconnected elements are reported. | `checks.test.ts` › reports a missing grid connection… |
| TC-33 | US-17 | Different voltages on a line are reported, except across a transformer or inverter. | `checks.test.ts` › reports different voltages… |
| TC-34 | US-17 | A reference designation used twice is reported. | `checks.test.ts` › reports a reference designation used twice |
| TC-35 | US-19 | The diagram is still there after a reload. | `App.test.tsx` › keeps the diagram in the browser between visits |
| TC-36 | US-20 | A saved file reads back exactly. | `file.test.ts` › read back exactly what was saved; e2e › builds… (the downloaded file) |
| TC-37 | US-20, US-42 | Files that are not plantline diagrams, are inconsistent, hostile (unknown kinds, huge coordinates or texts, duplicate ids, dangling lines, too many elements) or over 5 MB are refused. | `file.test.ts` › refuse…  (3 tests); e2e › refuses a file that is not a diagram… |
| TC-38 | US-20, US-21 | Files are named after the diagram, in any script, or “diagram”. | `export.test.tsx` › name files after the diagram…; e2e › builds… (`diagram.plantline.json`) |
| TC-39 | US-21, US-42 | The exported SVG stands alone, holds every element and line, leaves out the pointer areas, and escapes typed text. | `export.test.tsx` › draw a standalone SVG… |

## Plant layout

| ID | Story | Case | Test |
| --- | --- | --- | --- |
| TC-50 | US-30 | DWG and DXF of the same plant read the same: units, blocks, strings, attributes. | `CadReaderTests` › ReadsTheSolarSample_InDwgAndDxf |
| TC-51 | US-30 | Nested block content is placed in model coordinates (translation and rotation), with the block's box. | `CadReaderTests` › PlacesNestedBlockContent_InModelCoordinates |
| TC-52 | US-30 | Texts (multi-line without formatting), curves and the unit are read. | `CadReaderTests` › ReadsTextsAndCurves_AndTheUnit |
| TC-53 | US-30, US-42 | Bytes that are not a drawing are refused with an error, not a crash. | `CadReaderTests` › RejectsBytesThatAreNotADrawing (3 cases); e2e › opens a DXF… and reports a file that is not a drawing |
| TC-54 | US-30 | The reader's JSON has the names the app reads. | `CadReaderTests` › WritesCamelCaseJson_TheWebAppReads; `drawing.test.ts` › accepts the reader's JSON… |
| TC-55 | US-30 | A file chosen by the user is read in the browser and counted. | e2e › opens a DXF chosen by the user… |
| TC-56 | US-31, US-32 | The sample of every plant type opens on the map with its key object counted (40 tables, 8 turbines, 12 batteries, 3 generators, 8 breakers, 15 towers), on desktop and phone. | e2e › reads the … sample drawing and counts it (6 tests) |
| TC-57 | US-32 | Tables, strings and inverters are counted; cables and fences measured in metres. | `recognize.test.ts` › counts tables, strings and inverters… |
| TC-58 | US-32 | A block inside a table and the table's own outline are not counted again. | `recognize.test.ts` › does not count a block nested in a table… |
| TC-59 | US-33 | The first matching rule wins; an invalid pattern matches nothing and is reported. | `recognize.test.ts` › lets the first matching rule win… |
| TC-60 | US-32, US-33 | Every plant type's default rules are valid patterns of known kinds. | `plants.test.ts` › give every plant type layout rules… |
| TC-61 | US-34 | Lengths follow the unit (the fixture is in millimetres). | `recognize.test.ts` › counts tables… (14 m of cable) |
| TC-62 | US-35 | A point placement puts the centre on the point and keeps distances in metres. | `place.test.ts` › puts the drawing centre on the chosen point… |
| TC-63 | US-35 | The rotation turns the drawing counter-clockwise. | `place.test.ts` › turns the drawing by the rotation… |
| TC-64 | US-35 | Projected coordinates (UTM 36N) land where they should, scaled by the unit. | `place.test.ts` › reads coordinates in a projected system… |
| TC-65 | US-35 | An invalid coordinate system is refused. | `place.test.ts` › refuses a definition that is not one |
| TC-66 | US-37 | The solar sample's capacity is 1.23 MWp (40 tables × 56 modules × 550 Wp). | e2e › opens a DXF chosen by the user… |
| TC-67 | US-38 | GeoJSON has the recognised objects, longitude first, with their attributes; closed shapes are polygons. | `exports.test.ts` › write the recognised objects as GeoJSON… |
| TC-68 | US-38, US-42 | CSV quotes text and defuses spreadsheet formulas. | `exports.test.ts` › write totals as CSV… |
| TC-69 | US-39, US-42 | Nesting is not expanded past 8 levels; a drawing is truncated at the item limit and says so. | `CadReaderTests` › StopsExpandingBlocks_AtTheDepthLimit, TruncatesALargeDrawing_AtTheItemLimit |
| TC-70 | US-32 | Extents and lengths of open and closed polylines. | `drawing.test.ts` › measures the extent and the length… |

## Checked by hand before each release

| ID | Story | Case |
| --- | --- | --- |
| TC-90 | US-21 | Print shows only the diagram, black on white; “Save as PDF” gives one page. |
| TC-91 | US-36 | Satellite imagery appears and keeps its colours in the dark theme; the plain map is darkened. |
| TC-92 | US-40 | The browser's network panel shows no request other than the site's own files and map tiles. |
| TC-93 | US-05 | On a real phone: pinch zoom, the bottom bar, sheets open and close. |
