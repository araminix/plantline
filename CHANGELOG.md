# Changelog

All notable changes are listed here. The project follows [Semantic Versioning](https://semver.org/).

## Unreleased

### Changed

- The sample drawings are drawn as real plant drawings are: on a sheet with a title block, legend, notes, details and
  coordinate grid, with the layers, blocks and attributes design teams use, and (for the solar, wind, hydropower and
  transmission samples) on real ground: contours, streams and the river from SRTM elevations, in UTM coordinates
  that land where the plant was laid out. A 10 MWp solar plant (316 tables, 25 string inverters), a 45 MW wind farm
  on ridge tops, a 50 MW / 100 MWh storage site, a 13 MW run-of-river plant along a real valley, a 154/33 kV
  substation drawn in millimetres and a 13.6 km 154 kV line with 38 towers.

### Fixed

- In Arabic and Persian, the map's satellite and fit buttons no longer lie under the zoom buttons.

## 0.5.0 (unreleased)

Plant layouts that work with real drawings.

### Added

- A drawing in local coordinates waits for a click on the map where the plant is, instead of landing at latitude 0,
  longitude 0; one in coordinates that look projected switches to map coordinates and asks for the zone.
- Layers and blocks: the drawing's own blocks and layers with their counts; choose what each is (or Not counted, or
  leave a block out with what is inside, for a key plan that repeats the plant); show or hide layers. The name
  patterns moved under Advanced.
- PV modules are recognised (block names such as "590W", panel layers), and PVcase tables ("… PVBlock").
- The solar capacity comes from the modules counted in the drawing, with the module power read from their block
  names; the modules per table typed are used only when the drawing has no module blocks.
- A legend on the map; hover, click or tap a counted object to see its kind, ID, block, layer and attributes; search
  the found objects and show one on the map.
- The solar sample's tables hold their 56 module blocks.
- A drawing opened again (same file name and size) comes back with its unit, place, block and layer choices, hidden
  layers, name patterns and module figures; the 20 used last are remembered in the browser. Edited name patterns
  survive a change of plant type.

### Fixed

- The map keeps its centre right when its box changes without the window changing.
- A unit that makes the plant implausibly small or large is noticed ("In mm, this plant would be 1.5 m across. Is the
  drawing in m?"), with a button to use the suggested unit.

## 0.4.0 (unreleased)

Complete properties.

### Added

- Properties for each kind of element, grouped in General, Electrical and Notes, with units and checks of what is
  typed: status (existing, planned, out of service), manufacturer, model and notes for all; for example a
  transformer's HV, LV and tertiary voltage, rated power, vector group and impedance, an inverter's AC and DC power,
  AC voltage, maximum DC voltage and MPPTs, a PV array's peak power, modules, module power, strings and modules per
  string, currents and breaking current for switchgear, ratio and accuracy class for instrument transformers.
- Properties for lines: kind (cable, overhead line, busduct), status, voltage, length, conductor or cable type,
  cross-section, circuits, rated current, notes.
- The drawing shows each element's voltages and main ratings under its name; planned equipment is dashed and
  equipment out of service faded, in exports too.
- Checks: voltages compared on each side of a transformer; an inverter with its DC and AC sides mixed up; PV modules
  that are not strings × modules per string.

### Changed

- File format version 3: each element's `voltageKv` and `ratingKva` become `props` with its kind's fields, and lines
  have `props`. Version 1 and 2 files open, their voltage and rating moved to the kind's fields (a rating the kind has
  no field for goes into its notes), and save as version 3.

## 0.3.0 (unreleased)

A real diagram editor.

### Added

- Drag elements from the palette onto the diagram (on a touch screen, hold them a moment first); a tapped element
  takes the free spot nearest the middle of the view, so new elements never pile up on each other.
- Connection points: drag from one onto another element to connect them; drag a selected line's end onto another
  element to reconnect it. A dashed line and an outlined target show where it will connect.
- Line routes: drag a segment to move it, an end segment to add a bend; double-click a segment to remove it; Route
  automatically; straight lines as an option. Routes are saved in the file (format version 2; version 1 files still
  open).
- Group editing: select an area by dragging over the empty drawing (CAD style: left to right selects what is inside,
  right to left what it touches; on a touch screen, hold still first); Ctrl+A; copy, cut, paste and duplicate; arrow
  keys nudge; rotate 90° and flip (elements and groups, busbars stand upright); align edges and centres; space evenly.
- Resize a busbar by dragging its ends; drag an element's label to another place.
- Texts and areas (dashed boxes with a title, resized by their corner) to annotate the diagram.
- The zoom level in the toolbar (press it for 100 %), zoom to selection, and an overview map on wide screens.
- A shortcuts sheet (the toolbar's Shortcuts button or `?`) in every language; Shift+1, Shift+2 and Shift+0 fit,
  zoom to the selection and return to 100 %.

### Changed

- Dragging the empty drawing with a mouse now selects an area; pan with the middle button, Space and drag, or a
  finger.
- A new logo, a busbar with three feeders, and a green colour in both themes.
- The Inter and Estedad fonts, served with the site: Persian and Arabic look the same on every device.
- Icons for a phone's home screen and a picture for link previews.

### Fixed

- A line from an element whose only lead points away (a grid connection under its busbar) no longer runs back through
  the symbol; it goes around it.

## 0.2.0 (unreleased)

### Fixed

- The File menu opens over the page: no toolbar or panel hides it any more; arrow keys move through it, Escape closes
  it and returns to its button.
- Text typed in the properties panel is saved onto its own element, never onto the element clicked next.
- The diagram is saved in the browser once per change, not on every frame of a drag; a full or blocked browser storage
  is reported.
- An unexpected error shows a message with Reload and "Download the diagram" instead of a blank page.
- A menu stays under its button while the page or a toolbar scrolls, instead of closing (seen on phones).
- **Large drawings no longer crash the browser tab.** The reader keeps every block once with its transform instead of
  copying it everywhere it is used, sends the points as binary instead of text, and leaves out texts; the map draws
  each block's shapes once per copy through a transform, with dots for copies too small to see. A real 7.5 MB plant
  drawing with 27,000 nested block copies: read in 10 s instead of 61 s (2 s compiled ahead of time, below), reader memory 0.5 GB instead of 1.3 GB, and
  the page receives 12 MB instead of 77 million characters; zooming redraws in under 100 ms.
- Arrays of block copies (MINSERT) show every copy, not only the first.
- Move and turn a drawing on the map by dragging its handles; it follows smoothly however large it is.
- The drawing reader is compiled ahead of time: the real plant drawing above opens in about 3.5 s instead of 11 s, for
  a one-time download of 6.5 MB instead of 2.7 MB.
- A drawing reader that cannot start (a file of it failed to download) is reported within seconds with "Try again",
  instead of a "took too long" after two minutes.
- While a drawing is read, the time so far and Cancel are shown, instead of a fixed two-minute limit; a drawing likely
  too large for the device's memory is read only after asking.
- CI reads a generated plant the size of a real one three times within limits of time and memory, and limits the
  compressed download of the app and the reader.
- The documents no longer say that the reader's worker protects the page from running out of memory: it shares the
  page's memory; the question before large drawings does.
- Scaled blocks with a base point are placed correctly.

## 0.1.0 (unreleased)

The first version.

### Single-line diagrams

- Six plant types (solar PV, wind farm, battery storage, hydropower, substation, transmission line), each with its own
  palette; 23 element types in the style of IEC 60617.
- Add, drag on the grid, connect, edit (label, IEC 81346 reference designation, voltage, rating), delete; undo and
  redo; automatic arrangement.
- Checks: grid connection, unconnected elements, voltage mismatches, duplicate designations.
- Kept in the browser; saved and opened as `.plantline.json`; exported as SVG and PNG; printed or saved as PDF.

### Plant layouts

- DWG and DXF read in the browser (ACadSharp on WebAssembly, in a worker).
- Objects recognised and counted, or measured, with editable rules per plant type; solar capacity.
- Placed on the map on a point with a rotation, or in UTM or any proj4 system; plain map or satellite imagery.
- GeoJSON and CSV exports; a sample drawing for every plant type.

### Everywhere

- 14 languages, Arabic and Persian right to left; light and dark themes; phones and tablets.
- No account, no server, no tracking.
