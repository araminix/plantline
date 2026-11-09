# Changelog

All notable changes are listed here. The project follows [Semantic Versioning](https://semver.org/).

## 0.2.0 (unreleased)

### Fixed

- The File menu opens over the page: no toolbar or panel hides it any more; arrow keys move through it, Escape closes
  it and returns to its button.
- Text typed in the properties panel is saved onto its own element, never onto the element clicked next.
- The diagram is saved in the browser once per change, not on every frame of a drag; a full or blocked browser storage
  is reported.
- An unexpected error shows a message with Reload and "Download the diagram" instead of a blank page.

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
