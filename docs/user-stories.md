# User stories

Who plantline is for, what they need from it, and how we know each need is met. Every story has an ID used in
[tasks.md](tasks.md) and [test-cases.md](test-cases.md).

## People

| Persona | Who | What they want from plantline |
| --- | --- | --- |
| **Design engineer** | Designs plants at a developer or EPC contractor: solar, wind, storage, substations. | A quick, clean single-line diagram; a check that the CAD layout holds what the design says (tables, inverters, cable lengths); figures for a bill of materials. |
| **Field and O&M engineer** | Runs plants; often on site with a phone or tablet. | To see an existing plant's diagram and layout on any device, in their language, and to find an object on the map. |
| **Consultant, student or teacher** | Reviews or learns plant design without expensive CAD licences. | A free tool that opens real drawings and draws standard diagrams, with nothing to install. |
| **Developer** | Builds tools for a utility or EPC. | Code that is easy to read, run and fork; documented file formats; a permissive license. |

## Epic A: Getting started

**US-01 Choose the plant type first.** As a first-time visitor, I choose what I am designing (solar PV, wind farm,
battery storage, hydropower, substation or transmission line), so the tool shows the right equipment.
- The first visit opens a chooser with the six plant types, each with its symbol.
- After the choice, the diagram palette starts with that plant's own equipment (PV array, wind turbine, battery,
  generator, transformer, overhead line).
- The choice is remembered on later visits.

**US-02 Change the plant type at any time.** As a user, I switch the plant type from the header.
- The palette and the drawing recognition rules change with it; the diagram itself is kept.
- An opened diagram file sets the plant type it was saved with.

**US-03 Use the app in my language.** As a user anywhere, I use plantline in my language.
- 14 languages: English, Chinese, Hindi, Spanish, French, Arabic, Persian, Portuguese, Russian, Japanese, German,
  Korean, Turkish and Italian, each in its own name.
- The browser's language is chosen on the first visit when the app speaks it; else English.
- Arabic and Persian lay the whole page out right to left; drawings stay left to right.
- Latin, Greek and Cyrillic letters use Inter and Arabic and Persian use Estedad on every device, served with the site.
- Every message exists in every language.

**US-04 Light or dark.** As a user, I choose a light or dark theme; the first one follows my system. The map stays
readable in both, and satellite imagery keeps its real colours.

**US-05 Phones and tablets.** As a field engineer, I use plantline on a phone or tablet.
- The page never scrolls sideways; the toolbar scrolls within the screen.
- The palette, properties and drawing details open as sheets from a bar at the bottom.
- The diagram pans with a finger and zooms with two.
- Added to the home screen, it has its own icon.

## Epic B: Single-line diagram

**US-10 Add equipment.** As a design engineer, I drag an element from the palette onto the drawing, where it lands on
the grid point under the pointer, or I tap it and it appears in the middle of the view; either way it is selected.
- With a mouse or pen the element follows the pointer at once; on a touch screen I hold it a moment first, so a swipe
  still scrolls the palette. On a phone the palette sheet steps aside while I drag.
- The dragged element shows where it is going: dashed outside the drawing, solid over it. Dropped anywhere else, it
  is not added.
- A new element never lands on another one: it takes the free grid point nearest to where it was dropped or tapped.

**US-11 Place it on the grid.** I drag elements, one or several (Shift or Ctrl adds to the selection); they land on a
20-unit grid. A drag is one undo step.

**US-12 Connect equipment.** I connect two elements by dragging from a connection point of one onto the other, or
with Connect, picking the first and then the second element (or starting from the selected one). Lines run straight
down and across, and reach anywhere along a busbar. An element cannot be connected to itself or twice to the same
element.
- Connection points are where a symbol has a lead (a grid connection and a wind turbine only at the bottom; a load, an
  earthing switch, a voltage transformer and a surge arrester only at the top), and along a busbar. They show when I
  point at or select an element, and on every element while I draw a line.
- While I drag, a dashed line follows the pointer; it turns to the accent colour and the element under it is outlined
  when the line can connect there. Dropped anywhere else, nothing changes.
- A selected line shows its two ends; I drag one onto another element to reconnect it.

**US-13 Describe equipment.** I give a selected element a label, a reference designation (IEC 81346), a voltage
(kV) and a rating (kVA); a busbar also has a length. A field is saved when I leave it or press Enter, as one undo step,
and always onto the element I typed it for, even when I click another element next.

**US-14 Remove.** I delete the selected elements (their lines go with them) or a selected line, with the toolbar, the
properties panel or the Delete key.

**US-15 Undo and redo.** Every change can be undone and redone (toolbar, Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y), up to 100
steps.

**US-16 Arrange automatically.** One click lays the diagram out: the grid connection on top, each element one row
below the one it hangs from, separate groups side by side, busbars long enough for their feeders; the view then
fits the result.

**US-17 Check the diagram.** With nothing selected, the properties panel lists the problems, each selecting the
elements concerned: no grid connection, an unconnected element, different voltages on one line (transformers and
inverters may join two), a reference designation used twice.

**US-18 Navigate.** I zoom with the wheel, the toolbar or two fingers, pan by dragging the background, and fit the
diagram to the screen. An opened diagram is fitted once; adding the first element does not zoom.

**US-19 Keep my work.** The diagram is kept in the browser and is still there when I come back. If the browser cannot
keep it (its storage is full or blocked), I am told to save it as a file. If the app fails unexpectedly, it says so and
offers to reload or to download the kept diagram, instead of a blank page.

**US-20 Save and open files.** I save the diagram as a `.plantline.json` file and open it again later or on another
computer. A file that is not a plantline diagram, is inconsistent or is over 5 MB is refused with a message, and the
current diagram is kept.

**US-21 Share the drawing.** I export the diagram as SVG or PNG (black on white, sized to its content), or print it
and save it as PDF; only the diagram is printed.

## Epic C: Plant layout from a drawing

**US-30 Open a drawing, privately.** As a design engineer, I open a DWG or DXF file of up to 100 MB; it is read in my
browser and never uploaded. While it is read I see the time so far and can cancel. Another file type, a damaged file
or a reader that cannot be loaded each give a clear message at once, with "Try again" where it may help; a file likely
too large for my device's memory is read only if I agree.

**US-31 Try a sample.** Without a drawing of my own, I open a made-up sample of the current plant type.

**US-32 Recognise and count.** The objects of the drawing are recognised by their block and layer names, with rules
for the plant type: counted (tables, strings, inverters, turbines, batteries, generators, transformers, breakers,
disconnectors, towers, substations, buildings) or measured in metres (cables, overhead lines, busbars, roads,
fences). A table's own outline or a block inside a table is not counted again.

**US-33 Adjust the rules.** I edit the pattern of each rule (a regular expression) and see the counts change; an
invalid pattern is marked and matches nothing; I can reset the rules.

**US-34 Fix the unit.** The drawing's unit is read from the file; I can change it (a file can claim millimetres while
its geometry is in metres), and all lengths and the map follow.

**US-35 Put it on the map.** I place the drawing:
- on a point: its centre at a latitude and longitude (or at the map centre), turned by a rotation; on the map I drag
  its centre handle to move it and its turning handle to turn it, and it follows smoothly however large it is;
- in map coordinates: a UTM zone or any proj4 definition; an invalid one says so.

**US-36 Check against the ground.** I switch between the plain map and satellite imagery.

**US-37 Solar capacity.** For a solar plant, I give the modules per table and the module power; the installed capacity
is shown in kWp or MWp.

**US-38 Take the results away.** I export the recognised objects as GeoJSON (points for blocks, lines and polygons for
shapes, with their kind, block, layer and attributes) and the totals as CSV. CSV cells cannot run as spreadsheet
formulas.

**US-39 Large drawings.** A real plant drawing with tens of thousands of nested block copies opens without slowing or
crashing the browser, and the map stays smooth. A drawing beyond the reader's limits (1,000,000 shapes and block
references, 4,000,000 points) or placing more than 5,000,000 copies is shown and counted up to them, with a warning;
blocks nested more than 8 deep are counted but not opened.

## Epic D: Trust and ownership

**US-40 Privacy.** No account, no server and no tracking: the app sends nothing anywhere; only map tiles are fetched,
from OpenStreetMap and Esri.

**US-41 Host or fork it.** As a developer, I build plantline into static files, host them anywhere, and change it
freely under the Apache 2.0 license. A link to the site shows a preview picture; a fork hosted elsewhere changes its
address in `index.html`.

**US-42 Safe with untrusted files.** As a user, I can open any file without risk: drawings and diagram files are
validated and bounded, the drawing reader runs in a worker that is ended after each file, a drawing likely too large
for my device is read only if I agree, and the page has a strict Content Security Policy.
