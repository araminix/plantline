# Test cases

Every [user story](user-stories.md) and the automated tests that prove it. All of them run on every push and pull
request ([CI](../.github/workflows/ci.yml)).

| Suite | Tool | Where | Run |
| --- | --- | --- | --- |
| Unit and component | Vitest, Testing Library, jsdom | `web/src/**/*.test.ts(x)` | `pnpm test` in `web/` |
| Drawing reader | xUnit | `cad/Plantline.Cad.Tests` | `dotnet test --project Plantline.Cad.Tests` in `cad/` |
| End to end | Playwright, on a desktop and a phone (Pixel 7, touch) | `web/e2e` | `pnpm cad && pnpm e2e` in `web/` |
| Limits | Node scripts, in CI | `web/scripts/check-reader.mjs`, `check-size.mjs` | see [CONTRIBUTING.md](../CONTRIBUTING.md) |

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
| TC-76 | US-03 | English shows Inter and Persian Estedad, both served with the site. | e2e › shows its own fonts, Estedad for Persian… |
| TC-77 | US-05, US-41 | The app icons in the manifest, the home screen icon and the link preview image exist. | e2e › shows its own fonts… and has app icons and a link preview |
| TC-78 | US-04 | The header's logo is the favicon's mark, drawn in the theme's colours. | `Logo.test.tsx` › draws the same mark as the favicon |

## Single-line diagram

| ID | Story | Case | Test |
| --- | --- | --- | --- |
| TC-20 | US-10 | Tapping a palette element adds it, selected, and shows its properties. | `App.test.tsx` › adds an element from the palette…; e2e › builds, connects… |
| TC-21 | US-10, US-11 | A new element lands on the grid; a busbar gets its length. | `model.test.ts` › adds an element on the grid… |
| TC-21a | US-10 | A new element takes the free grid point nearest to where it was asked, never on top of another. | `model.test.ts` › adds every element at the free grid point nearest…; e2e › drags an element from the palette… |
| TC-21b | US-10, US-05 | An element dragged from the palette lands under the pointer, with a mouse on a desktop and a finger on a phone; dropped on the palette, nothing is added. | e2e › drags an element from the palette onto the drawing… |
| TC-22 | US-11 | A drag moves freely and snaps to the grid at its end. | `model.test.ts` › moves elements freely during a drag… |
| TC-23a | US-11a | An area selects what is wholly inside left to right and what it touches right to left; copies paste with new ids and their lines where they overlap nothing; a group turns a quarter around its middle and mirrors (a busbar stands up; lines route themselves again); edges and centres align; centres space evenly; a busbar resizes from one end. | `edit.test.ts` (6 tests) |
| TC-23b | US-11a | Turned elements: leads turn with them, lines run across between turned symbols and bend once from upright to turned, an upright busbar is met from the side. | `geometry.test.ts` › turns leads with their element…, meets an upright busbar… |
| TC-23c | US-11a, US-05 | An area selected with a mouse and with a held finger; aligned centres; duplicates never overlap; one element turned. | e2e › selects elements by area, aligns, duplicates and turns them |
| TC-23d | US-11a | A busbar resized by its end handle, a label dragged, with a mouse and a finger; Ctrl+A, Ctrl+C, Ctrl+V and an arrow key on a desktop. | e2e › resizes a busbar by its end and moves a label… |
| TC-23 | US-11, US-15 | A drag is one undo step; previews are not steps. | `history.test.ts` › makes a drag one step…, counts the changes worth saving… |
| TC-24 | US-12 | Two elements connect once; never an element to itself. | `model.test.ts` › connects two elements once… |
| TC-25 | US-12 | Connecting by picking elements on the canvas, with a mouse and with touch. | e2e › builds, connects, checks and saves… |
| TC-25a | US-12 | A line dragged from a connection point onto an element connects them, with a mouse and a finger; dropped on the empty drawing, nothing is added. | e2e › draws a line from a connection point… |
| TC-25b | US-12 | A selected line's end dragged onto another element reconnects it; never onto the element at its other end or into a repeated line. | `model.test.ts` › moves a line's end…; e2e › draws a line from a connection point… |
| TC-25d | US-12a | A middle segment moves across its direction on the grid; an end segment adds a step, or slides along a busbar; zero-length steps are tidied; a double click removes a bend, and without bends the line routes itself. | `geometry.test.ts` › moves a middle segment…, adds a bend…, removes a bend… |
| TC-25e | US-12a | A line routing itself goes around a symbol whose lead points away, never through it; a straight line runs lead to lead. | `geometry.test.ts` › routes out of a lead that points away…, joins two symbols on one row… |
| TC-25f | US-12a | Moving both elements keeps a line's route; moving one keeps the route and stretches the line; arranging resets routes. | `model.test.ts` › keeps a line's shape…; `arrange.test.ts` › puts the grid connection on top… |
| TC-25g | US-12a, US-15 | Dragging a line adds a bend; undo and redo restore it; a double click removes it. | e2e › bends a line by dragging it… |
| TC-25h | US-12a, US-20 | Routes, turns, mirrors and label places are saved and read back; version 1 files open with self-routing lines and upright elements; malformed routes, turns or label places are refused. | `file.test.ts` › read back exactly…, read version 1 files…, refuse inconsistent or hostile content |
| TC-25c | US-12 | Connection points are where symbols have leads; lines leave the upper element at the bottom, meet a busbar within its length, and join two symbols on one row from side to side. | `geometry.test.ts` (4 tests) |
| TC-26 | US-13, US-14 | Fields are edited; removing an element removes its lines. | `model.test.ts` › removes an element together with its links… |
| TC-26a | US-13 | Text typed for one element is saved onto it, not onto the element clicked next. | `App.test.tsx` › saves typed text onto the element it was typed for… |
| TC-27 | US-15 | Undo and redo; a new step clears redo; nothing to undo changes nothing. | `history.test.ts` › undoes and redoes…; `App.test.tsx` › adds an element… and undoes it; e2e › builds… |
| TC-28 | US-16 | Arrangement: grid connection on top, one row per level, rows centred, a manual order kept. | `arrange.test.ts` › puts the grid connection on top… |
| TC-29 | US-16 | Unconnected groups side by side without overlap. | `arrange.test.ts` › places unconnected groups side by side… |
| TC-30 | US-16 | A busbar reaches every feeder below it. | `arrange.test.ts` › lengthens a busbar… |
| TC-31 | US-17 | No issues for an empty diagram or a good one. | `checks.test.ts` › finds nothing…; e2e › builds… (“No problems found.”) |
| TC-32 | US-17 | A missing grid connection and unconnected elements are reported. | `checks.test.ts` › reports a missing grid connection… |
| TC-33 | US-17 | Different voltages on a line are reported, except across a transformer or inverter. | `checks.test.ts` › reports different voltages… |
| TC-34 | US-17 | A reference designation used twice is reported. | `checks.test.ts` › reports a reference designation used twice |
| TC-35 | US-19 | The diagram is still there after a reload. | `App.test.tsx` › keeps the diagram in the browser between visits |
| TC-35a | US-19 | A drag is saved once, at its end, not on every frame. | `App.test.tsx` › saves a drag once… |
| TC-35b | US-19 | A full or blocked storage is reported. | `App.test.tsx` › says so when the browser cannot keep the diagram |
| TC-35c | US-19 | An unexpected error shows a message, a reload and the kept diagram to download. | `ErrorBoundary.test.tsx` (2 tests) |
| TC-36 | US-20 | A saved file reads back exactly. | `file.test.ts` › read back exactly what was saved; e2e › builds… (the downloaded file) |
| TC-37 | US-20, US-42 | Files that are not plantline diagrams, are inconsistent, hostile (unknown kinds, huge coordinates or texts, duplicate ids, dangling lines, too many elements) or over 5 MB are refused. | `file.test.ts` › refuse…  (3 tests); e2e › refuses a file that is not a diagram… |
| TC-38 | US-20, US-21 | Files are named after the diagram, in any script, or “diagram”. | `export.test.tsx` › name files after the diagram…; e2e › builds… (`diagram.plantline.json`) |
| TC-39 | US-21, US-42 | The exported SVG stands alone, holds every element and line, leaves out the pointer areas, and escapes typed text. | `export.test.tsx` › draw a standalone SVG… |

## Plant layout

| ID | Story | Case | Test |
| --- | --- | --- | --- |
| TC-50 | US-30 | DWG and DXF of the same plant read the same: units, blocks, strings, attributes. | `CadReaderTests` › ReadsTheSolarSample_InDwgAndDxf |
| TC-51 | US-30 | Nested blocks keep each reference's transform (translation and rotation); composed, they put the shapes where the drawing does. | `CadReaderTests` › KeepsNestedBlocks_WithTheTransformOfEachReference |
| TC-51a | US-30 | A scaled block with a base point lands on its insertion point (ACadSharp's own transform does not). | `CadReaderTests` › PlacesABlock_ByItsBasePoint |
| TC-51b | US-39 | Each block is read once however often it is used: a 20,000-module plant nested four deep is a few hundred numbers. | `CadReaderTests` › KeepsEachBlockOnce_HoweverOftenItIsUsed |
| TC-51c | US-30 | An array of copies (MINSERT) is one reference per copy, spaced by rows and columns. | `CadReaderTests` › MakesAnArrayOfCopies_OneReferencePerCopy |
| TC-52 | US-30 | Curves and the unit are read; texts are left out. | `CadReaderTests` › ReadsCurvesAndTheUnit_AndLeavesTextsOut |
| TC-53 | US-30, US-42 | Bytes that are not a drawing are refused with an error, not a crash. | `CadReaderTests` › RejectsBytesThatAreNotADrawing (3 cases); e2e › opens a DXF… and reports a file that is not a drawing |
| TC-54 | US-30 | The reader's JSON has the names the app reads, and its points are the binary numbers the app reads; anything else is refused. | `CadReaderTests` › WritesCamelCaseJson_AndThePointsAsBinary_TheWebAppReads; `drawing.test.ts` › accepts the reader's output… |
| TC-55 | US-30 | A file chosen by the user is read in the browser and counted. | e2e › opens a DXF chosen by the user… |
| TC-55a | US-30 | A reader that cannot start (a runtime file blocked) is reported within seconds, and "Try again" then reads the drawing. | e2e › reports a reader that cannot start at once… |
| TC-55b | US-30 | Cancel during a reading ends its worker and leaves no error. | e2e › cancels a reading and ends its worker |
| TC-55c | US-30, US-42 | A file likely to need more than a quarter of the device's memory is read only after asking (DWG 70 times its size, DXF 15 times; 4 GB assumed when the browser does not say). | `cad.test.ts` › asks before reading a drawing likely too large… |
| TC-56 | US-31, US-32 | The sample of every plant type opens on the map with its key object counted (40 tables, 8 turbines, 12 batteries, 3 generators, 8 breakers, 15 towers), on desktop and phone. | e2e › reads the … sample drawing and counts it (6 tests) |
| TC-57 | US-32 | Tables, strings and inverters are counted; cables and fences measured in metres. | `recognize.test.ts` › counts tables, strings and inverters… |
| TC-58 | US-32 | A block inside a table and the table's own outline are not counted again. | `recognize.test.ts` › does not count a block nested in a table… |
| TC-58a | US-32 | Every placed copy of a nested block is counted, and lines inside blocks are measured in each copy. | `recognize.test.ts` › counts every placed copy… |
| TC-59 | US-33 | The first matching rule wins; an invalid pattern matches nothing and is reported. | `recognize.test.ts` › lets the first matching rule win… |
| TC-60 | US-32, US-33 | Every plant type's default rules are valid patterns of known kinds. | `plants.test.ts` › give every plant type layout rules… |
| TC-61 | US-34 | Lengths follow the unit (the fixture is in millimetres). | `recognize.test.ts` › counts tables… (14 m of cable) |
| TC-62 | US-35 | A point placement puts the centre on the point and keeps distances in metres. | `place.test.ts` › puts the drawing centre on the chosen point… |
| TC-63 | US-35 | The rotation turns the drawing counter-clockwise. | `place.test.ts` › turns the drawing by the rotation… |
| TC-64 | US-35 | Projected coordinates (UTM 36N) land where they should, scaled by the unit. | `place.test.ts` › reads coordinates in a projected system… |
| TC-65 | US-35 | An invalid coordinate system is refused. | `place.test.ts` › refuses a definition that is not one |
| TC-65a | US-35 | Dragging the centre handle moves the drawing and dragging the turning handle turns it (a quarter turn clockwise reads −90°), on desktop and phone. | e2e › moves and turns a drawing on the map with its handles; `drawing.test.ts` › undoes a transform… |
| TC-66 | US-37 | The solar sample's capacity is 1.23 MWp (40 tables × 56 modules × 550 Wp). | e2e › opens a DXF chosen by the user… |
| TC-67 | US-38 | GeoJSON has the recognised objects, longitude first, with their attributes; closed shapes are polygons; a turned block's point is the centre of what it draws. | `exports.test.ts` › write the recognised objects as GeoJSON…, put a turned block's point… |
| TC-68 | US-38, US-42 | CSV quotes text and defuses spreadsheet formulas. | `exports.test.ts` › write totals as CSV… |
| TC-69 | US-39, US-42 | The reader reads 1,000 levels of nesting and a block that contains itself without expanding them, and truncates at the item and point limits. | `CadReaderTests` › ReadsDeepNesting_WithoutExpandingIt, ReadsABlockThatContainsItself_Once, TruncatesALargeDrawing_AtTheItemAndPointLimits |
| TC-69a | US-39, US-42 | The app opens blocks at most 8 levels deep (a block containing itself stops there) and stops a block bomb at 5,000,000 placed items, saying so. | `drawing.test.ts` › places nested blocks…, opens a block that contains itself…, stops a block bomb…; `scene.test.ts` › says when a drawing places more copies… |
| TC-70 | US-32 | Extents and lengths of open and closed polylines, through transforms. | `drawing.test.ts` › measures extents and lengths through transforms |
| TC-71 | US-31 | The map's projection is Leaflet's Web Mercator and turns back into latitude and longitude. | `scene.test.ts` › uses Leaflet's Web Mercator pixels… |
| TC-72 | US-31, US-39 | A small plant is drawn through transforms only, each block's shapes kept once, within 2 cm of exact projection. | `scene.test.ts` › draws a small plant through transforms only… |
| TC-73 | US-31, US-39 | A large plant's own shapes are projected point by point while its small blocks are still placed through transforms, within 2 cm. | `scene.test.ts` › projects a large plant's own shapes… |
| TC-74 | US-39 | A generated plant the size of a real one (17,920 modules nested four deep, about 700,000 points) reads three times in the WebAssembly reader within the limits: 6 s and 650 MB. | CI › Read a large drawing… (`scripts/check-reader.mjs`) |
| TC-75 | US-05, US-39 | The compressed download stays within its limits: the app's scripts and styles 300 KB, the drawing reader 7 MB. | CI › Download sizes… (`scripts/check-size.mjs`) |

## Checked by hand before each release

| ID | Story | Case |
| --- | --- | --- |
| TC-90 | US-21 | Print shows only the diagram, black on white; “Save as PDF” gives one page. |
| TC-91 | US-36 | Satellite imagery appears and keeps its colours in the dark theme; the plain map is darkened. |
| TC-92 | US-40 | The browser's network panel shows no request other than the site's own files and map tiles. |
| TC-93 | US-05 | On a real phone: pinch zoom, the bottom bar, sheets open and close. |
| TC-94 | US-39 | A real plant drawing with tens of thousands of block copies (kept local) opens without crashing on desktop and phone; zooming and panning stay smooth. |
| TC-95 | US-41 | Pasting the site's link in a chat shows the preview picture; on a phone, “Add to home screen” shows the icon. |
