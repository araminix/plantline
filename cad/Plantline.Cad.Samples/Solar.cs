using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.Tables;
using ACadSharp.Types.Units;

namespace Plantline.Cad.Samples;

/// <summary>
/// A ground-mounted solar plant of about 10 MWp in UTM zone 36N, laid out the way design tools lay one out: fixed-tilt
/// tables of two lengths (2 modules high, 28 or 14 wide) filling two cadastral parcels inside a 10 m setback, string
/// inverters on the tables, two transformer stations by a gravel road, DC, AC and MV cables, a fenced boundary with
/// a gate, an earth track and the existing 33 kV line, the real ground (SRTM) as 1 m contours with its dry stream beds,
/// and the sheet with its legend, notes and details.
/// </summary>
internal static class Solar
{
    // The plan's own coordinates are metres from this UTM point
    private static readonly P Origin = new(470_000, 4_330_000);
    private const double ModuleWidth = 1.134, ModuleDepth = 2.065, Gap = 0.02, Pitch = 9.4, RoadX = 215;
    private const int StringModules = 28, StringsPerInverter = 24, ModuleWp = 590;
    private static readonly double LongTable = StringModules * ModuleWidth + (StringModules - 1) * Gap;
    private static readonly double ShortTable = StringModules / 2 * ModuleWidth + (StringModules / 2 - 1) * Gap;
    private static readonly double TableDepth = 2 * ModuleDepth + 0.017;

    private sealed record Table(P Centre, bool Long, int Row, bool East)
    {
        public int Strings => Long ? 2 : 1;

        public double Width => Long ? LongTable : ShortTable;

        /// <summary>The end nearer the road, where its cables leave.</summary>
        public P RoadEnd => Centre + new P(East ? -Width / 2 : Width / 2, 0);
    }

    public static CadDocument Draw()
    {
        var plan = new Plan(UnitsType.Meters);
        var pen = new Pen(1);
        var w = (P local) => Origin + local;
        var ws = (IEnumerable<P> points) => points.Select(p => Origin + p);

        // Land: two parcels, the fence 2 m inside, the setback 10 m inside
        P[] parcel = [new(0, 0), new(390, -25), new(430, 160), new(360, 300), new(60, 285), new(-20, 140)];
        var cadastre = plan.Layer("CADASTRE-PARCEL", 30);
        var cadastreText = plan.Layer("CADASTRE-TEXT", 30);
        plan.Add(pen.Poly(cadastre, true, ws(parcel)));
        var (split1, split2) = (new P(150, -25.0 / 390 * 150), new P(165, 300 + (165 - 360) * 0.05));
        plan.Add(pen.Line(cadastre, w(split1), w(split2)));
        var west = new List<P> { parcel[0], split1, split2, parcel[4], parcel[5] };
        var east = new List<P> { split1, parcel[1], parcel[2], parcel[3], split2 };
        plan.Add(pen.Text(cadastreText, w(new P(55, 150)).X, w(new P(55, 150)).Y, 5, "PARCEL 112/4"));
        plan.Add(pen.Text(cadastreText, w(new P(55, 142)).X, w(new P(55, 142)).Y, 3.5, $"{Area(west) / 10_000:0.00} ha"));
        plan.Add(pen.Text(cadastreText, w(new P(300, 150)).X, w(new P(300, 150)).Y, 5, "PARCEL 112/5"));
        plan.Add(pen.Text(cadastreText, w(new P(300, 142)).X, w(new P(300, 142)).Y, 3.5, $"{Area(east) / 10_000:0.00} ha"));

        var setback = Geo.Inset(parcel, 10);
        plan.Add(pen.Poly(plan.Layer("SETBACK-LINE-10M", 1), true, ws(setback)));

        var fenceLine = Geo.Inset(parcel, 2);
        var along = (fenceLine[1] - fenceLine[0]).Unit;
        var gate = fenceLine[0] + along * ((RoadX - fenceLine[0].X) / along.X);
        var fence = plan.Layer("FENCE-2.0M-CHAINLINK", 3);
        plan.Add(pen.Poly(fence, false, ws([gate + along * 3, .. fenceLine.Skip(1), fenceLine[0], gate - along * 3])));
        var gates = plan.Layer("FENCE-GATE", 3);
        var gateBlock = plan.Block("GATE_DOUBLE_6M", [pen.Line(null, -3, 0, -3, 0.3), pen.Line(null, 3, 0, 3, 0.3), pen.Arc(null, -3, 0, 3, 0, 90), pen.Arc(null, 3, 0, 3, 90, 180), pen.Line(null, -3, 0, -3, 3), pen.Line(null, 3, 0, 3, 3)]);
        plan.Add(pen.Put(gateBlock, gates, w(gate).X, w(gate).Y, along.Degrees));

        // An earth track along the south boundary and the existing 33 kV line beside it
        var outward = along.Left * -1;
        var track = plan.Layer("EXISTING-TRACK", 251);
        foreach (var offset in new[] { 14.0, 18.0 })
        {
            plan.Add(pen.Line(track, w(parcel[0] + outward * offset - along * 160), w(parcel[0] + outward * offset + along * 580)));
        }

        plan.Add(pen.Text(track, w(parcel[0] + outward * 26 + along * 60).X, w(parcel[0] + outward * 26 + along * 60).Y, 3.5, "EXISTING EARTH TRACK", along.Degrees));
        var ohl = plan.Layer("EXISTING-OHL-33KV", 6);
        var pole = plan.Block("POLE_MV_CONCRETE", [pen.Circle(null, 0, 0, 0.35), pen.Line(null, -1.2, 0, 1.2, 0)]);
        var poles = Enumerable.Range(0, 13).Select(i => parcel[0] + outward * 30 + along * (-150 + i * 60)).ToList();
        plan.Add(pen.Poly(ohl, false, ws(poles)));
        foreach (var p in poles)
        {
            plan.Add(pen.Put(pole, ohl, w(p).X, w(p).Y, along.Degrees));
        }

        plan.Add(pen.Text(ohl, w(poles[2] + outward * 6).X, w(poles[2] + outward * 6).Y, 3, "EXISTING 33 kV OVERHEAD LINE (3x1/0 AWG)", along.Degrees));

        // The road: from the track through the gate to a turning head in the north
        var roadTop = new P(RoadX, 250);
        List<P> road = [gate + outward * 16, gate, roadTop];
        var roadLayer = plan.Layer("ROAD-GRAVEL-4M", 41);
        var roadEdges = plan.Layer("GRAVEL-SURFACE-EDGE", 41);
        plan.Add(pen.Poly(roadLayer, false, ws(road)));
        plan.Add(pen.Line(roadLayer, w(roadTop + new P(-20, 0)), w(roadTop + new P(20, 0))));
        foreach (var side in new[] { -2.0, 2.0 })
        {
            plan.Add(pen.Poly(roadEdges, false, ws(Geo.Offset(road, side))));
            plan.Add(pen.Line(roadEdges, w(roadTop + new P(-20, side)), w(roadTop + new P(20, side))));
        }

        // Equipment by the road: two transformer stations, the MV connection kiosk, a weather mast
        var stations = new[] { new P(RoadX + 6.5, 85), new P(RoadX - 6.5, 195) };
        var kiosk = new P(RoadX + 15, 12);
        var meteo = new P(RoadX + 25, 100);
        List<(double X1, double Y1, double X2, double Y2)> keepClear =
        [
            (RoadX - 6, -40, RoadX + 6, 260),
            (RoadX, 74, RoadX + 16, 96),
            (RoadX - 16, 184, RoadX, 206),
            (RoadX, -40, RoadX + 26, 24),
            (RoadX + 18, 93, RoadX + 32, 107),
            (RoadX - 26, 243, RoadX + 26, 258),
        ];

        // Tables: rows every 9.4 m, on a grid of slots from the road outwards, long tables where they fit, short ones at the edges
        var tables = new List<Table>();
        var slot = LongTable + 0.5;
        for (var (row, y) = (0, setback.Min(p => p.Y) + 1); y + TableDepth < setback.Max(p => p.Y) - 1; (row, y) = (row + 1, y + Pitch))
        {
            if (Geo.Span(setback, y) is not { } low || Geo.Span(setback, y + TableDepth) is not { } high)
            {
                continue;
            }

            var (from, to) = (Math.Max(low.From, high.From) + 0.5, Math.Min(low.To, high.To) - 0.5);
            var blocked = keepClear.Where(c => c.Y1 < y + TableDepth && c.Y2 > y).ToList();
            var fits = (double a, double b) => a >= from && b <= to && !blocked.Any(c => c.X1 < b && c.X2 > a);
            foreach (var isEast in new[] { false, true })
            {
                for (var k = 0; k < 20; k++)
                {
                    // Each slot's inner edge (nearer the road), then the long table's or a short table's extent
                    var inner = isEast ? RoadX + 7 + k * slot : RoadX - 7 - k * slot;
                    var outer = isEast ? inner + LongTable : inner - LongTable;
                    var middle = isEast ? inner + ShortTable : inner - ShortTable;
                    var centre = (double a, double b) => new P((a + b) / 2, y + TableDepth / 2);
                    if (fits(Math.Min(inner, outer), Math.Max(inner, outer)))
                    {
                        tables.Add(new Table(centre(inner, outer), true, row, isEast));
                    }
                    else if (fits(Math.Min(inner, middle), Math.Max(inner, middle)))
                    {
                        tables.Add(new Table(centre(inner, middle), false, row, isEast));
                    }
                }
            }
        }

        var module = plan.Block($"PV_MODULE_{ModuleWp}W", [pen.Box(null, 0, 0, ModuleWidth, ModuleDepth), pen.Line(null, -ModuleWidth / 2, 0, ModuleWidth / 2, 0)]);
        var pile = plan.Block("PILE_C150", [pen.Box(null, 0, 0, 0.15, 0.15)]);
        var modules = plan.Layer("PV-MODULES", 5);
        var piles = plan.Layer("PV-PILES", 8);
        BlockRecord TableBlock(int columns, int pileCount)
        {
            var width = columns * ModuleWidth + (columns - 1) * Gap;
            var entities = new List<Entity> { pen.Box(null, 0, 0, width, TableDepth) };
            for (var c = 0; c < columns; c++)
            {
                foreach (var y in new[] { -1, 1 })
                {
                    entities.Add(pen.Put(module, modules, -width / 2 + ModuleWidth / 2 + c * (ModuleWidth + Gap), y * (ModuleDepth + 0.017) / 2));
                }
            }

            for (var i = 0; i < pileCount; i++)
            {
                foreach (var y in new[] { -1.35, 1.35 })
                {
                    entities.Add(pen.Put(pile, piles, -width / 2 + 1.6 + i * (width - 3.2) / (pileCount - 1), y));
                }
            }

            return plan.Block($"PV_TABLE_2P{columns}", entities);
        }

        var longBlock = TableBlock(StringModules, 8);
        var shortBlock = TableBlock(StringModules / 2, 4);
        var tableLayer = plan.Layer("PV-TABLES", 5);

        // Inverters: on each side of the road, consecutive tables (row by row, snaking) share one until it has about 24 strings
        var groups = new List<List<Table>>();
        foreach (var isEast in new[] { false, true })
        {
            var side = tables.Where(t => t.East == isEast)
                .OrderBy(t => t.Row)
                .ThenBy(t => Math.Abs(t.Centre.X - RoadX) * (t.Row % 2 == 0 ? 1 : -1))
                .ToList();
            var count = Math.Max(1, (int)Math.Round(side.Sum(t => t.Strings) / (double)StringsPerInverter));
            var target = side.Sum(t => t.Strings) / (double)count;
            var (group, sum) = (new List<Table>(), 0);
            foreach (var table in side)
            {
                group.Add(table);
                sum += table.Strings;
                if (sum >= target * (groups.Count(g => g[0].East == isEast) + 1) - 0.5 && groups.Count(g => g[0].East == isEast) < count - 1)
                {
                    groups.Add(group);
                    group = [];
                }
            }

            groups.Add(group);
        }

        var inverterBlock = plan.Block("INVERTER_330KW", [pen.Box(null, 0, 0, 1.05, 0.75), pen.Line(null, -0.52, -0.37, 0.52, 0.37)]);
        var inverterLayer = plan.Layer("PV-INVERTERS", 1);
        var strings = plan.Layer("PV-STRINGS", 3);
        var stringNumbers = plan.Layer("PV-STRING-NUMBERS", 3);
        var dc = plan.Layer("DC-CABLE-1500V", 4);
        var ac = plan.Layer("AC-CABLE-800V", 6);
        var tableNumbers = new Dictionary<Table, string>();
        foreach (var row in tables.GroupBy(t => t.Row))
        {
            var n = 0;
            foreach (var table in row.OrderBy(t => t.Centre.X))
            {
                tableNumbers[table] = $"R{row.Key + 1:00}-{++n:00}";
            }
        }

        var inverters = new List<(string Id, P At, int Station, bool East)>();
        foreach (var group in groups)
        {
            var id = $"INV-{inverters.Count + 1:00}";
            var mid = group.Aggregate(new P(0, 0), (sum, t) => sum + t.Centre) * (1.0 / group.Count);
            var host = group.OrderBy(t => (t.Centre - mid).Length).First();
            var at = host.RoadEnd + new P(host.East ? 1.2 : -1.2, TableDepth / 2 + 0.7);
            var station = mid.Y < 140 ? 0 : 1;
            inverters.Add((id, at, station, host.East));
            plan.Add(pen.Tag(pen.Put(inverterBlock, inverterLayer, w(at).X, w(at).Y), "ID", id, w(at).X + 0.8, w(at).Y + 0.6, 0.9));

            var trench = (bool isEast) => RoadX + (isEast ? 4.6 : -4.6);
            var number = 0;
            foreach (var table in group)
            {
                // The table's strings: a straight run along each row of modules, or a U along both for a short table
                var (left, right) = (table.Centre.X - table.Width / 2 + 0.3, table.Centre.X + table.Width / 2 - 0.3);
                var (top, bottom) = (table.Centre.Y + 1.04, table.Centre.Y - 1.04);
                var runs = table.Long ? new List<List<P>> { new() { new(left, top), new(right, top) }, new() { new(left, bottom), new(right, bottom) } } : [[new(left, top), new(right, top), new(right, bottom), new(left, bottom)]];
                foreach (var run in runs)
                {
                    plan.Add(pen.Poly(strings, false, ws(run)));
                    var label = w(run[0] + new P(0.2, 0.25));
                    plan.Add(pen.Text(stringNumbers, label.X, label.Y, 0.6, $"S{inverters.Count:00}.{++number:00}"));
                }

                // The table's DC cable: to the row gap behind it, along the gap to the trench by the road, along it to the inverter's gap
                var gapY = table.Centre.Y + TableDepth / 2 + (Pitch - TableDepth) / 2;
                var inverterGap = at.Y;
                var x = trench(table.East);
                plan.Add(pen.Poly(dc, false, ws([table.RoadEnd, new(table.RoadEnd.X, gapY), new(x, gapY), new(x, inverterGap), at])));
                plan.Add(pen.Tag(pen.Put(table.Long ? longBlock : shortBlock, tableLayer, w(table.Centre).X, w(table.Centre).Y), "ID", tableNumbers[table], w(table.Centre).X - table.Width / 2 + 0.3, w(table.Centre).Y - 0.4, 0.8));
            }

            // The inverter's AC cable: along its gap to the road side, along the road to its station
            var acX = RoadX + (host.East ? 2.9 : -2.9);
            var to = stations[station];
            plan.Add(pen.Poly(ac, false, ws([at, new(acX, at.Y), new(acX, to.Y), to])));
        }

        // The stations, the kiosk, the MV cable from the stations through the kiosk to a riser pole of the existing line
        // Each station sized for its inverters, from the usual ratings
        var perStation = Enumerable.Range(0, stations.Length).Select(i => inverters.Count(inverter => inverter.Station == i)).ToList();
        var kva = new[] { 2500, 3150, 4000, 4500, 5000, 6300 }.First(rating => rating >= perStation.Max() * 330);
        var stationBlock = plan.Block($"TS_0.8-33KV_{kva}KVA", [pen.Box(null, 0, 0, 8, 4.5), pen.Box(null, 0, 0, 6.06, 2.44), pen.Line(null, -1, -1.22, -1, 1.22), pen.Line(null, 1.4, -1.22, 1.4, 1.22)]);
        var stationLayer = plan.Layer("TRANSFORMER-STATIONS", 2);
        for (var i = 0; i < stations.Length; i++)
        {
            var count = perStation[i];
            var at = w(stations[i]);
            var insert = pen.Put(stationBlock, stationLayer, at.X, at.Y, 90);
            pen.Tag(insert, "ID", $"TS-{i + 1:00}", at.X + 3, at.Y + 4, 1.5);
            pen.Tag(insert, "RATING", $"{kva} kVA 0.8/33 kV, {count} inverters", at.X + 3, at.Y + 2, 1);
            plan.Add(insert);
        }

        var kioskBlock = plan.Block("MV_CONNECTION_KIOSK", [pen.Box(null, 0, 0, 6, 3.4), pen.Line(null, -1, -1.7, -1, 1.7), pen.Line(null, 1, -1.7, 1, 1.7)]);
        var switchgear = plan.Layer("MV-SWITCHGEAR", 2);
        plan.Add(pen.Tag(pen.Put(kioskBlock, switchgear, w(kiosk).X, w(kiosk).Y), "ID", "KK-01 CONNECTION KIOSK", w(kiosk).X + 3.5, w(kiosk).Y + 2, 1.5));
        var riser = poles.OrderBy(p => (p - kiosk).Length).First();
        var mv = plan.Layer("MV-CABLE-33KV", 1);
        plan.Add(pen.Poly(mv, false, ws([riser, new(kiosk.X, riser.Y + 4), kiosk, new(RoadX + 2.4, kiosk.Y), new(RoadX + 2.4, stations[0].Y), stations[0]])));
        plan.Add(pen.Poly(mv, false, ws([stations[0], new(RoadX + 2.4, stations[0].Y), new(RoadX + 2.4, stations[1].Y), stations[1]])));
        var meteoBlock = plan.Block("METEO_MAST", [pen.Circle(null, 0, 0, 0.3), pen.Line(null, 0, 0, 1.2, 0.8), pen.Box(null, 1.4, 0.9, 0.5, 0.3)]);
        var monitoring = plan.Layer("MONITORING", 4);
        plan.Add(pen.Tag(pen.Put(meteoBlock, monitoring, w(meteo).X, w(meteo).Y), "ID", "WS-01 WEATHER STATION", w(meteo).X + 1.5, w(meteo).Y + 1.5, 1));

        // Security cameras on the fence, the drainage ditch along the north
        var cctv = plan.Block("CCTV_POLE_6M", [pen.Circle(null, 0, 0, 0.25), pen.Arc(null, 0, 0, 1.5, -30, 30)]);
        var security = plan.Layer("SECURITY-CCTV", 4);
        var cameraPoints = Geo.Inset(parcel, 3);
        for (var i = 0; i < cameraPoints.Count; i++)
        {
            var (a, b) = (cameraPoints[i], cameraPoints[(i + 1) % cameraPoints.Count]);
            foreach (var t in new[] { 0.0, 0.5 })
            {
                var p = a + (b - a) * t;
                plan.Add(pen.Put(cctv, security, w(p).X, w(p).Y, (b - a).Degrees + 90));
            }
        }

        var ditch = Geo.Inset(parcel, 6);
        plan.Add(pen.Poly(plan.Layer("DRAINAGE-DITCH", 150), false, ws([ditch[2], ditch[3], ditch[4], ditch[5]])));

        // The ground as surveyed (SRTM, smoothed), beyond the parcels, with its dry stream beds
        var ground = Terrain.Load("solar").Smoothed(3);
        var (surveyFrom, surveyTo) = (w(new P(-140, -110)), w(new P(560, 420)));
        Topography.Draw(plan, pen, Contours.Trace((x, y) => ground.Height(x, y), surveyFrom, surveyTo, 8, 1, 0.3), 5, 2.2);
        var (main, others) = ground.Streams(60_000);
        var dry = plan.Layer("STREAM-DRY", 150);
        foreach (var run in others.Prepend(main).SelectMany(stream => Geo.Runs(stream, p => p.X > surveyFrom.X && p.X < surveyTo.X && p.Y > surveyFrom.Y && p.Y < surveyTo.Y)))
        {
            plan.Add(pen.Poly(dry, false, run));
        }

        // The sheet
        var moduleCount = tables.Sum(t => t.Long ? 2 * StringModules : StringModules);
        var stringCount = tables.Sum(t => t.Strings);
        var mwp = moduleCount * ModuleWp / 1e6;
        var sheet = new Sheet(plan, pen, "A0", 1000, w(new P(-260, -240)));
        sheet.Frame("SAMPLE SOLAR PV PLANT", $"PV PLANT LAYOUT, {mwp:0.00} MWp / {inverters.Count * 0.33:0.00} MWac", "SPP-EL-LAY-001", "2026-11-09");
        sheet.Grid(100, (x, y) => ($"E {Sheet.Spaced(x)}", $"N {Sheet.Spaced(y)}"));
        var legend = sheet.Legend(
        [
            new($"PV table 2P{StringModules} / 2P{StringModules / 2}, {ModuleWp} Wp modules", tableLayer, "box"),
            new("PV string (28 modules)", strings),
            new("String inverter 330 kW", inverterLayer, "box"),
            new($"Transformer station {kva} kVA", stationLayer, "box"),
            new("DC cable 1500 V (H1Z2Z2-K)", dc),
            new("AC cable 0.8 kV (NA2XY)", ac),
            new("MV cable 33 kV (NA2XS(F)2Y)", mv),
            new("Fence 2.0 m chain-link, gate", fence),
            new("Gravel road 4 m", roadLayer),
            new("Cadastral parcel boundary", cadastre),
            new("Setback line 10 m", plan.Layer("SETBACK-LINE-10M", 1), "dash"),
            new("CCTV pole", security, "circle"),
            new("Existing 33 kV overhead line", ohl, "dash"),
            new("Existing earth track, dry stream bed", track),
            new("Contour, 1 m / 5 m", plan.Layer("TOPO-CONTOUR-MAJOR", 8)),
        ]);
        sheet.Notes(
        [
            "Coordinates: WGS 84 / UTM zone 36N (EPSG:32636), metres. Elevations in metres above mean sea level (SRTM), contour interval 1 m.",
            $"PV modules: {ModuleWp} Wp bifacial, half-cut, 2278 x 1134 mm; {moduleCount:N0} modules, {mwp:0.000} MWp.",
            $"Mounting: fixed tilt 25 degrees facing south, 2 modules in portrait (2P), tables of {StringModules} and {StringModules / 2} modules wide, row pitch {Pitch:0.0} m, driven piles C150.",
            $"Strings of {StringModules} modules: {stringCount} strings on {inverters.Count} string inverters of 330 kW (DC/AC {mwp / (inverters.Count * 0.33):0.00}).",
            $"Transformer stations: {stations.Length} x {kva} kVA, 0.8/33 kV ({string.Join(" and ", perStation)} inverters), each with its MV ring main unit. Connection to the existing 33 kV line at the kiosk KK-01.",
            "DC and AC cables in trenches as detail B; DC cables run in the row gaps and the trenches beside the road.",
            "Fence 2.0 m chain-link with barbed wire as detail C; no equipment within the 10 m setback from the parcel boundaries.",
            "Table numbers: row (from the south) and table (from the west), as R05-07.",
        ], legend + 6);
        sheet.Detail("DETAIL_A_MOUNTING_SECTION", "A  MOUNTING STRUCTURE, SECTION", 50, 840, 650, MountingSection(pen, plan));
        sheet.Detail("DETAIL_B_TRENCH_SECTION", "B  CABLE TRENCH, SECTION", 20, 875, 480, TrenchSection(pen, plan));
        sheet.Detail("DETAIL_C_FENCE_ELEVATION", "C  FENCE, ELEVATION", 50, 840, 330, FenceElevation(pen, plan));

        Console.WriteLine($"  solar: {tables.Count} tables ({tables.Count(t => t.Long)} long), {moduleCount} modules, {mwp:0.000} MWp, {stringCount} strings, {inverters.Count} inverters");
        return plan.Document;
    }

    private static double Area(IReadOnlyList<P> polygon) =>
        Math.Abs(Enumerable.Range(0, polygon.Count).Sum(i => polygon[i].Cross(polygon[(i + 1) % polygon.Count]))) / 2;

    private static List<Entity> MountingSection(Pen pen, Plan plan)
    {
        var line = plan.Layer("DETAILS", 7);
        var text = plan.Layer("DETAILS-TEXT", 7);
        var (rise, run) = (4.576 * Math.Sin(25 * Math.PI / 180), 4.576 * Math.Cos(25 * Math.PI / 180));
        var (x0, y0) = (0.2, 0.8);
        var entities = new List<Entity>
        {
            pen.Line(line, -0.5, 0, 4.9, 0),
            pen.Rect(line, 0.55, -1.6, 0.7, y0 + 0.15),
            pen.Rect(line, 3.4, -1.6, 3.55, y0 + rise * 3.2 / run + 0.1),
            pen.Line(line, x0, y0, x0 + run, y0 + rise),
            pen.Line(line, 0.62, y0 + 0.15, 3.47, y0 + rise * 3.4 / run),
        };
        for (var m = 0; m < 2; m++)
        {
            var (a, b) = (m * 2.288, m * 2.288 + 2.278);
            var c = Math.Cos(25 * Math.PI / 180);
            var s = Math.Sin(25 * Math.PI / 180);
            entities.Add(pen.Poly(line, true, x0 + a * c - 0.06 * s, y0 + a * s + 0.06 * c, x0 + b * c - 0.06 * s, y0 + b * s + 0.06 * c, x0 + b * c - 0.1 * s, y0 + b * s + 0.1 * c, x0 + a * c - 0.1 * s, y0 + a * s + 0.1 * c));
        }

        entities.Add(pen.Arc(line, x0, y0, 1.2, 0, 25));
        entities.Add(pen.Text(text, x0 + 1.3, y0 + 0.15, 0.12, "25 deg"));
        entities.Add(pen.Text(text, -0.4, 0.15, 0.12, "MIN. 0.80 m ABOVE GROUND"));
        entities.Add(pen.Text(text, 0.8, -1.9, 0.12, "PILES C150, L = 2.40 m, EMBEDMENT 1.60 m"));
        entities.Add(pen.Text(text, x0 + run / 2 - 0.6, y0 + rise + 0.45, 0.12, "2 x 2278 mm MODULES, PORTRAIT"));
        entities.Add(pen.Line(line, x0, -0.6, x0 + run, -0.6));
        entities.Add(pen.Text(text, x0 + run / 2 - 0.3, -0.5, 0.12, $"{run:0.00} m"));
        return entities;
    }

    private static List<Entity> TrenchSection(Pen pen, Plan plan)
    {
        var line = plan.Layer("DETAILS", 7);
        var text = plan.Layer("DETAILS-TEXT", 7);
        var entities = new List<Entity>
        {
            pen.Line(line, -1.0, 0, 1.0, 0),
            pen.Poly(line, false, -0.4, 0, -0.4, -1.0, 0.4, -1.0, 0.4, 0),
            pen.Line(line, -0.4, -0.7, 0.4, -0.7),
            pen.Line(line, -0.3, -0.35, 0.3, -0.35),
        };
        for (var i = 0; i < 6; i++)
        {
            entities.Add(pen.Circle(line, -0.25 + i * 0.1, -0.85, 0.025));
        }

        entities.Add(pen.Text(text, 0.5, -0.38, 0.05, "WARNING TAPE"));
        entities.Add(pen.Text(text, 0.5, -0.75, 0.05, "SAND BEDDING 30 cm"));
        entities.Add(pen.Text(text, 0.5, -0.9, 0.05, "DC / AC / 33 kV CABLES"));
        entities.Add(pen.Text(text, -0.1, -1.12, 0.05, "0.80 m"));
        entities.Add(pen.Text(text, -0.95, -0.5, 0.05, "1.00 m"));
        return entities;
    }

    private static List<Entity> FenceElevation(Pen pen, Plan plan)
    {
        var line = plan.Layer("DETAILS", 7);
        var text = plan.Layer("DETAILS-TEXT", 7);
        var entities = new List<Entity> { pen.Line(line, -0.3, 0, 3.3, 0) };
        foreach (var x in new[] { 0.0, 3.0 })
        {
            entities.Add(pen.Rect(line, x - 0.03, -0.6, x + 0.03, 2.4));
            entities.Add(pen.Rect(line, x - 0.2, -0.6, x + 0.2, 0));
        }

        // The mesh: diagonals y = x - c inside the 3 x 2 m panel
        for (var c = -1.75; c < 3.0; c += 0.25)
        {
            var (from, to) = (Math.Max(0, c), Math.Min(3, 2 + c));
            entities.Add(pen.Line(line, from, from - c, to, to - c));
        }

        foreach (var y in new[] { 2.1, 2.25, 2.4 })
        {
            entities.Add(pen.Line(line, 0, y, 3, y));
        }

        entities.Add(pen.Text(text, 3.4, 2.2, 0.1, "BARBED WIRE, 3 ROWS"));
        entities.Add(pen.Text(text, 3.4, 1.0, 0.1, "CHAIN-LINK MESH, h = 2.0 m"));
        entities.Add(pen.Text(text, -0.3, -0.95, 0.1, "POSTS 60 mm AT 3.0 m, CONCRETE FOOTING 0.4 x 0.4 x 0.6 m"));
        return entities;
    }
}
