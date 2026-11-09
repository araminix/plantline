using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.Types.Units;

namespace Plantline.Cad.Samples;

/// <summary>
/// A run-of-river hydropower plant in a real Black Sea valley in UTM zone 37N (SRTM ground): the river along the
/// valley floor; the weir and its reservoir; the intake and sand trap; a headrace channel along the valley side at
/// nearly the weir's level (where the real ground is at that level), with aqueducts where side streams cross it;
/// the forebay, penstock, powerhouse with three Francis units and tailrace; the 6.3/34.5 kV switchyard and line;
/// the access roads and bridge; expropriation boundaries; 10 m contours; a penstock profile and a weir section.
/// </summary>
internal static class Hydro
{
    private const double WeirAt = 400, ChannelSlope = 0.0005, Discharge = 30;

    public static CadDocument Draw()
    {
        var plan = new Plan(UnitsType.Meters);
        var pen = new Pen(1);
        var terrain = Terrain.Load("hydro");
        var ground = terrain.Smoothed(1);

        // The river along the valley floor, from below the existing dam to the valley's northern end
        var river = ground.Valley(new P(491_900, 4_520_750), new P(488_700, 4_526_700));
        var riverLength = Geo.Length(river);
        P At(double s, double d)
        {
            var (point, direction) = Geo.At(river, s);
            return point + direction.Left * d;
        }

        double Along(double s) => Geo.At(river, s).Direction.Degrees;

        // The bed: the ground along the river, never rising downstream
        var bed = new List<double>();
        for (var s = 0.0; s <= riverLength; s += 10)
        {
            bed.Add(Math.Min(bed.Count > 0 ? bed[^1] : double.MaxValue, ground.Height(At(s, 0))));
        }

        double Bed(double s) => bed[Math.Clamp((int)(s / 10), 0, bed.Count - 1)];

        // The scheme: the powerhouse where the river has fallen 50 m below the weir
        var crest = Math.Round(Bed(WeirAt)) + 5;
        var powerhouseAt = Enumerable.Range(0, (int)(riverLength / 10)).Select(i => i * 10.0).FirstOrDefault(s => s > WeirAt + 2500 && Bed(WeirAt) - Bed(s) >= 50, riverLength - 600);
        var (channelFrom, channelTo) = (WeirAt + 40, powerhouseAt - 60);
        double Level(double s) => crest - 0.5 - ChannelSlope * (s - channelFrom);

        // The channel: on the bank where the ground at its level stays nearer the river and steadier
        var stations = Enumerable.Range(0, (int)((channelTo - channelFrom) / 20) + 1).Select(i => channelFrom + i * 20).ToList();
        List<double> Offsets(int side)
        {
            var found = stations.Select(s => Enumerable.Range(6, 450).Select(k => k * 2.0).Cast<double?>().FirstOrDefault(d => ground.Height(At(s, side * d!.Value)) >= Level(s))).ToList();
            var filled = found.Select((d, i) => d ?? found.Take(i).LastOrDefault(v => v is not null) ?? 400).ToList();
            return filled.Select((_, i) => filled.Skip(Math.Max(0, i - 4)).Take(9).Average()).ToList();
        }

        var (left, right) = (Offsets(1), Offsets(-1));
        var roughness = (List<double> d) => d.Sum() + 5 * d.Zip(d.Skip(1)).Sum(pair => Math.Abs(pair.First - pair.Second));
        var side = roughness(left) <= roughness(right) ? 1 : -1;
        var offsets = side == 1 ? left : right;
        var channelAxis = Geo.Simplify(stations.Select((s, i) => At(s, side * offsets[i])).ToList(), 0.5);
        var endOffset = offsets[^1];

        // The ground, streams and river on the sheet, which is centred on the scheme
        var scheme = river.Concat(channelAxis).Where(p => Geo.Locate(river, p).Station is var s && s > WeirAt - 300 && s < powerhouseAt + 300).ToList();
        var middle = new P((scheme.Min(p => p.X) + scheme.Max(p => p.X)) / 2, (scheme.Min(p => p.Y) + scheme.Max(p => p.Y)) / 2);
        var sheet = new Sheet(plan, pen, "A0", 5000, middle - new P(505, 425) * 5);
        var surveyFrom = new P(Math.Max(terrain.From.X + 50, sheet.At(25, 15).X), Math.Max(terrain.From.Y + 50, sheet.At(25, 15).Y));
        var surveyTo = new P(Math.Min(terrain.To.X - 50, sheet.At(985, 826).X), Math.Min(terrain.To.Y - 50, sheet.At(985, 826).Y));
        var inside = (P p) => p.X > surveyFrom.X && p.X < surveyTo.X && p.Y > surveyFrom.Y && p.Y < surveyTo.Y;
        Topography.Draw(plan, pen, Contours.Trace((x, y) => ground.Height(x, y), surveyFrom, surveyTo, 25, 10, 2), 50, 9);

        var water = plan.Layer("RIVER-WATER-EDGE", 150);
        var axis = plan.Layer("RIVER-AXIS", 150);
        foreach (var run in Geo.Runs(river, inside))
        {
            plan.Add(pen.Poly(axis, false, run));
        }

        foreach (var run in Geo.Runs(Geo.Slice(river, WeirAt, riverLength), inside))
        {
            foreach (var edge in new[] { -11.0, 11 })
            {
                plan.Add(pen.Poly(water, false, Geo.Offset(run, edge)));
            }
        }

        var above = Geo.Slice(river, Math.Max(0, WeirAt - 350), WeirAt);
        var width = (double s) => 11 + 22 * Math.Pow(s / Geo.Length(above), 1.5);
        var reservoirLayer = plan.Layer($"RESERVOIR-NWL-{crest:0}", 150);
        plan.Add(pen.Poly(reservoirLayer, true, Geo.Offset(above, width).Concat(Enumerable.Reverse(Geo.Offset(above, s => -width(s))))));
        var reservoirLabel = At(WeirAt - 150, -side * 8);
        plan.Add(pen.Text(reservoirLayer, reservoirLabel.X, reservoirLabel.Y, 6, $"NWL {crest:0.00}", Along(WeirAt - 150)));
        var arrow = plan.Block("FLOW_ARROW", [pen.Line(null, -12, 0, 12, 0), pen.Poly(null, true, 12, 0, 6, 2.5, 6, -2.5)]);
        for (var s = 300.0; s < riverLength; s += 900)
        {
            if (inside(At(s, 0)))
            {
                plan.Add(pen.Put(arrow, axis, At(s, 0).X, At(s, 0).Y, Along(s)));
            }
        }

        // Side streams (not the river itself), and the aqueducts carrying the channel over them
        var streams = plan.Layer("STREAM", 150);
        var channel = plan.Layer("HEADRACE-CHANNEL", 5);
        var aqueduct = plan.Block("AQUEDUCT", [pen.Box(null, 0, 0, 30, 8), pen.Line(null, -15, 0, 15, 0)]);
        var aqueducts = 0;
        foreach (var stream in ground.Streams(300_000).Others)
        {
            var away = stream.Where(p => Math.Abs(Geo.Locate(river, p).Distance) > 40).ToList();
            if (away.Count < stream.Count / 2 || !stream.Any(inside))
            {
                continue;
            }

            foreach (var run in Geo.Runs(stream, inside))
            {
                plan.Add(pen.Poly(streams, false, run));
            }

            foreach (var (point, station) in Geo.Crossings(channelAxis, stream))
            {
                var direction = Geo.At(channelAxis, station).Direction;
                plan.Add(pen.Tag(pen.Put(aqueduct, channel, point.X, point.Y, direction.Degrees), "ID", $"AQUEDUCT {++aqueducts}", point.X + 12, point.Y + 12, 5));
            }
        }

        // The weir, sluice gate, fish pass on the far bank, intake and sand trap on the channel's bank, control building
        var weir = plan.Layer("WEIR-STRUCTURE", 4);
        plan.Add(pen.Poly(weir, true, [At(WeirAt - 2, -26), At(WeirAt - 2, 26), At(WeirAt + 2, 26), At(WeirAt + 2, -26)]));
        foreach (var d in new[] { -30.0, 30 })
        {
            plan.Add(pen.Box(weir, At(WeirAt, d).X, At(WeirAt, d).Y, 10, 8, Along(WeirAt)));
        }

        plan.Add(pen.Put(plan.Block("SLUICE_GATE", [pen.Box(null, 0, 0, 6, 3), pen.Line(null, -3, 0, 3, 0)]), weir, At(WeirAt, side * 18).X, At(WeirAt, side * 18).Y, Along(WeirAt)));
        plan.Add(pen.Poly(plan.Layer("FISH-PASS", 4), false, Enumerable.Range(0, 9).Select(i => At(WeirAt - 10 + i * 4, -side * (i % 2 == 0 ? 16 : 21)))));
        plan.Add(pen.Box(weir, At(WeirAt - 12, side * 32).X, At(WeirAt - 12, side * 32).Y, 14, 10, Along(WeirAt)));
        var weirLabel = At(WeirAt - 80, side * 70);
        plan.Add(pen.Text(weir, weirLabel.X, weirLabel.Y, 7, $"WEIR, CREST {crest:0.00}, INTAKE"));
        plan.Add(pen.Box(plan.Layer("SAND-TRAP", 4), At(WeirAt + 20, side * 30).X, At(WeirAt + 20, side * 30).Y, 34, 12, Along(WeirAt + 20)));
        plan.Add(pen.Box(plan.Layer("WEIR-CONTROL-BUILDING", 2), At(WeirAt - 40, side * 52).X, At(WeirAt - 40, side * 52).Y, 10, 7, Along(WeirAt)));

        // The headrace channel
        plan.Add(pen.Poly(plan.Layer("HEADRACE-AXIS", 5), false, channelAxis));
        foreach (var edge in new[] { -2.5, 2.5 })
        {
            plan.Add(pen.Poly(channel, false, Geo.Offset(channelAxis, edge)));
        }

        // Forebay and spillway, penstock with anchor blocks, the powerhouse with its units, the tailrace
        var channelEnd = Geo.At(channelAxis, Geo.Length(channelAxis));
        var forebayAt = channelEnd.Point + channelEnd.Direction * 20;
        plan.Add(pen.Box(channel, forebayAt.X, forebayAt.Y, 45, 22, channelEnd.Direction.Degrees));
        plan.Add(pen.Text(channel, forebayAt.X + 25, forebayAt.Y + 14, 6, $"FOREBAY, NWL {Level(channelTo):0.00}"));
        plan.Add(pen.Poly(plan.Layer("SPILLWAY-CHANNEL", 5), false, [forebayAt + channelEnd.Direction * 22, At(powerhouseAt + 60, side * endOffset * 0.5), At(powerhouseAt + 90, side * 11)]));
        var powerhouse = At(powerhouseAt, side * 36);
        var penstockTop = forebayAt;
        var penstockFoot = powerhouse + (penstockTop - powerhouse).Unit * 14;
        var penstock = plan.Layer("PENSTOCK", 6);
        var across = (penstockFoot - penstockTop).Unit.Left;
        plan.Add(pen.Line(penstock, penstockTop, penstockFoot));
        foreach (var edge in new[] { -1.5, 1.5 })
        {
            plan.Add(pen.Line(penstock, penstockTop + across * edge, penstockFoot + across * edge));
        }

        var penstockLength = (penstockFoot - penstockTop).Length;
        var anchor = plan.Block("ANCHOR_BLOCK", [pen.Box(null, 0, 0, 5, 5)]);
        for (var i = 0; i <= 3; i++)
        {
            var p = penstockTop + (penstockFoot - penstockTop) * (i / 3.0);
            plan.Add(pen.Put(anchor, penstock, p.X, p.Y, (penstockFoot - penstockTop).Degrees));
        }

        var head = Level(channelTo) - (Bed(powerhouseAt) + 1.5);
        var power = 9.81 * Discharge * head * 0.88 / 1000;
        var (large, small) = (Math.Round(power * 0.44, 1), Math.Round(power - 2 * Math.Round(power * 0.44, 1), 1));
        var houseLayer = plan.Layer("POWERHOUSE-BUILDING", 2);
        var along = Geo.At(river, powerhouseAt).Direction;
        plan.Add(pen.Box(houseLayer, powerhouse.X, powerhouse.Y, 44, 24, along.Degrees));
        plan.Add(pen.Line(plan.Layer("EOT-CRANE-RAIL", 8), powerhouse + along.Left * side * 6 - along * 22, powerhouse + along.Left * side * 6 + along * 22));
        var units = plan.Layer("GENERATING-UNITS", 1);
        var largeUnit = plan.Block($"GENERATOR_UNIT_{large:0.0}MW_FRANCIS", [pen.Circle(null, 0, 0, 3.4), pen.Circle(null, 0, 0, 2.1), pen.Box(null, 0, 5, 2.4, 1.6)]);
        var smallUnit = plan.Block($"GENERATOR_UNIT_{small:0.0}MW_FRANCIS", [pen.Circle(null, 0, 0, 2.0), pen.Circle(null, 0, 0, 1.2), pen.Box(null, 0, 3.4, 1.6, 1.2)]);
        foreach (var (id, offset, block) in new[] { ("G1", -13.0, largeUnit), ("G2", -1.0, largeUnit), ("G3", 11.5, smallUnit) })
        {
            var at = powerhouse + along * offset - along.Left * side * 3;
            plan.Add(pen.Tag(pen.Put(block, units, at.X, at.Y, along.Degrees), "ID", id, at.X + 2, at.Y - 7, 2.5));
        }

        var houseLabel = powerhouse + along.Left * side * 18 - along * 22;
        plan.Add(pen.Text(houseLayer, houseLabel.X, houseLabel.Y, 5, $"POWERHOUSE 2 x {large:0.0} + 1 x {small:0.0} MW", along.Degrees));
        var tailrace = plan.Layer("TAILRACE", 5);
        plan.Add(pen.Line(tailrace, powerhouse - along.Left * side * 12 - along * 16, At(powerhouseAt + 20, side * 11)));
        plan.Add(pen.Line(tailrace, powerhouse - along.Left * side * 12 + along * 16, At(powerhouseAt + 48, side * 11)));

        // The switchyard downstream of the powerhouse, the 34.5 kV line down the valley on the far bank
        var yard = At(powerhouseAt + 70, side * 50);
        var yardAlong = Geo.At(river, powerhouseAt + 70).Direction;
        plan.Add(pen.Box(plan.Layer("SWITCHYARD-FENCE", 3), yard.X, yard.Y, 32, 26, yardAlong.Degrees));
        var steps = plan.Layer("STEP-UP-TRANSFORMERS", 2);
        var bigTrafo = plan.Block("TRAFO_6.3-34.5KV_8MVA", [pen.Box(null, 0, 0, 4.5, 3), pen.Box(null, 0, 0, 7, 5.5)]);
        var smallTrafo = plan.Block("TRAFO_6.3-34.5KV_2MVA", [pen.Box(null, 0, 0, 2.8, 2), pen.Box(null, 0, 0, 4.5, 3.8)]);
        foreach (var (id, offset, block) in new[] { ("T1", -9.0, bigTrafo), ("T2", 0.0, bigTrafo), ("T3", 9.0, smallTrafo) })
        {
            var at = yard + yardAlong * offset - yardAlong.Left * side * 5;
            plan.Add(pen.Tag(pen.Put(block, steps, at.X, at.Y, yardAlong.Degrees), "ID", id, at.X, at.Y - 5, 2));
        }

        var ohl = plan.Layer("OHL-34.5KV", 6);
        var line = Enumerable.Range(0, 12).Select(i => At(powerhouseAt + 120 + i * 150, -side * (90 + 8 * Math.Sin(i)))).Where(inside).Prepend(yard).ToList();
        plan.Add(pen.Poly(ohl, false, line));
        var pole = plan.Block("POLE_34.5KV", [pen.Box(null, 0, 0, 1.2, 1.2), pen.Line(null, -2.5, 0, 2.5, 0)]);
        foreach (var p in line.Skip(1))
        {
            plan.Add(pen.Put(pole, ohl, p.X, p.Y));
        }

        if (line.Count > 3)
        {
            plan.Add(pen.Text(ohl, line[3].X + 10, line[3].Y + 10, 6, "34.5 kV LINE TO THE DISTRIBUTION GRID"));
        }

        // Roads: along the far bank from the valley's end to the weir, a bridge to the powerhouse, hairpins up to the forebay
        var roadLayer = plan.Layer("ROAD-ACCESS", 41);
        var edges = plan.Layer("CARRIAGEWAY-EDGE", 41);
        var mainRoad = Geo.Runs(Geo.Offset(Geo.Slice(river, WeirAt - 40, riverLength - 30), -side * 45), inside).MaxBy(run => run.Count)!;
        var bridge = At(powerhouseAt + 30, 0);
        var toPowerhouse = new List<P> { At(powerhouseAt + 30, -side * 45), At(powerhouseAt + 30, side * 30), powerhouse + along * 26 };
        var forebayRoad = Geo.Smooth([powerhouse + along * 26, At(powerhouseAt - 160, side * endOffset * 0.45), At(powerhouseAt - 40, side * endOffset * 0.75), forebayAt + channelEnd.Direction.Left * side * -20], 10);
        foreach (var road in new[] { mainRoad, toPowerhouse, forebayRoad })
        {
            plan.Add(pen.Poly(roadLayer, false, road));
            foreach (var edge in new[] { -2.5, 2.5 })
            {
                plan.Add(pen.Poly(edges, false, Geo.Offset(road, edge)));
            }
        }

        plan.Add(pen.Tag(pen.Put(plan.Block("ROAD_BRIDGE_40M", [pen.Box(null, 0, 0, 8, 40)]), roadLayer, bridge.X, bridge.Y, Along(powerhouseAt + 30)), "ID", "BRIDGE 40 m", bridge.X + 8, bridge.Y + 22, 5));

        // Expropriation: around the weir, along the channel, around the powerhouse and switchyard
        var expropriation = plan.Layer("EXPROPRIATION-BOUNDARY", 1);
        plan.Add(pen.Box(expropriation, At(WeirAt - 10, side * 10).X, At(WeirAt - 10, side * 10).Y, 150, 150, Along(WeirAt)));
        plan.Add(pen.Poly(expropriation, true, Geo.Offset(channelAxis, 15).Concat(Enumerable.Reverse(Geo.Offset(channelAxis, -15)))));
        plan.Add(pen.Box(expropriation, At(powerhouseAt + 20, side * 60).X, At(powerhouseAt + 20, side * 60).Y, 190, 170, Along(powerhouseAt)));

        // The sheet
        var title = $"HEPP GENERAL LAYOUT, {2 * large + small:0.0} MW";
        sheet.Frame("SAMPLE RUN-OF-RIVER HYDROPOWER PLANT", title, "HEPP-CIV-LAY-001", "2026-11-09");
        sheet.Grid(500, (x, y) => ($"E {Sheet.Spaced(x)}", $"N {Sheet.Spaced(y)}"));
        var legend = sheet.Legend(
        [
            new("River, water edge, flow", water),
            new($"Reservoir at NWL {crest:0.00}", reservoirLayer),
            new("Weir, intake, sluice gate", weir, "box"),
            new("Headrace channel 5.0 m, forebay", channel),
            new("Penstock, steel 3000 mm", penstock),
            new("Powerhouse", houseLayer, "box"),
            new("Generating unit (Francis)", units, "circle"),
            new("Step-up transformer 6.3/34.5 kV", steps, "box"),
            new("34.5 kV overhead line", ohl, "dash"),
            new("Access road 5 m, bridge", roadLayer),
            new("Expropriation boundary", expropriation, "dash"),
            new("Side stream", streams),
            new("Contour, 10 m / 50 m", plan.Layer("TOPO-CONTOUR-MAJOR", 8)),
        ]);
        sheet.Notes(
        [
            "Coordinates: WGS 84 / UTM zone 37N (EPSG:32637), metres. Elevations in metres above mean sea level (SRTM), contour interval 10 m.",
            $"Run-of-river plant: weir crest and normal water level {crest:0.00}; intake, sluice gate and sand trap on the channel's bank; fish pass on the far bank.",
            $"Headrace channel 5.0 m wide, slope {ChannelSlope * 100:0.00} %, {Geo.Length(channelAxis):0} m; design discharge {Discharge:0} m3/s; {aqueducts} aqueduct(s) over side streams.",
            $"Forebay normal water level {Level(channelTo):0.00}; steel penstock 3000 mm, {penstockLength:0} m, on 4 anchor blocks.",
            $"Powerhouse: 2 x {large:0.0} MW and 1 x {small:0.0} MW Francis units, {2 * large + small:0.0} MW; gross head {head:0.0} m; tailrace back to the river.",
            "Switchyard 6.3/34.5 kV: 2 x 8 MVA and 1 x 2 MVA step-up transformers; 34.5 kV line down the valley to the distribution grid.",
            "Access road 5 m along the far bank, a 40 m bridge to the powerhouse, and a service road to the forebay in hairpins.",
        ], legend + 6);
        sheet.Detail("DETAIL_A_PENSTOCK_PROFILE", "A  PENSTOCK, LONGITUDINAL PROFILE", 2000, sheet.Width - 10 - 180 + 30, 450, PenstockProfile(pen, plan, penstockTop, penstockFoot, ground, Level(channelTo), Bed(powerhouseAt)));
        sheet.Detail("DETAIL_B_WEIR_SECTION", "B  WEIR, SECTION", 250, sheet.Width - 10 - 180 + 25, 300, WeirSection(pen, plan, crest, Bed(WeirAt)));
        var box = (scheme.Max(p => p.X) - scheme.Min(p => p.X), scheme.Max(p => p.Y) - scheme.Min(p => p.Y));
        Console.WriteLine($"  hydro: river {riverLength:0} m, bank {side}, channel {Geo.Length(channelAxis):0} m, penstock {penstockLength:0} m, head {head:0.0} m, {2 * large + small:0.0} MW, scheme {box.Item1:0} x {box.Item2:0} m, {aqueducts} aqueducts");
        return plan.Document;
    }

    // Elevations are drawn from a datum below the tailwater, so the profile stays near its insertion point
    private static List<Entity> PenstockProfile(Pen pen, Plan plan, P top, P foot, Terrain ground, double forebay, double tailwater)
    {
        var line = plan.Layer("DETAILS", 7);
        var text = plan.Layer("DETAILS-TEXT", 7);
        var datum = Math.Floor((tailwater - 10) / 10) * 10;
        var length = (foot - top).Length;
        var profile = Enumerable.Range(0, 31).Select(i => new P(length * i / 30, ground.Height(top + (foot - top) * (i / 30.0)) - datum)).ToList();
        var pipe = profile.Select((p, i) => new P(p.X, i == 0 ? forebay - 4 - datum : i == profile.Count - 1 ? tailwater - 1 - datum : p.Y - 2)).ToList();
        var entities = new List<Entity>
        {
            pen.Poly(line, false, profile),
            pen.Poly(line, false, pipe),
            pen.Line(line, 0, 0, length, 0),
            pen.Text(text, 0, -9, 4, $"DATUM {datum:0.00}"),
            pen.Text(text, 0, forebay - datum + 5, 4, $"FOREBAY NWL {forebay:0.00}"),
            pen.Text(text, length * 0.55, tailwater - datum - 9, 4, $"TAILWATER {tailwater:0.00}"),
            pen.Text(text, length * 0.3, (forebay + tailwater) / 2 - datum + 10, 4, $"STEEL 3000 mm, L = {length:0} m"),
        };
        for (var z = datum; z <= forebay + 10; z += 10)
        {
            entities.Add(pen.Line(line, -3, z - datum, 0, z - datum));
            entities.Add(pen.Text(text, -16, z - datum - 1.5, 3, $"{z:0}"));
        }

        foreach (var i in new[] { 0, 10, 20, 30 })
        {
            entities.Add(pen.Box(line, pipe[i].X, pipe[i].Y, 5, 4));
        }

        return entities;
    }

    private static List<Entity> WeirSection(Pen pen, Plan plan, double crest, double bed)
    {
        var line = plan.Layer("DETAILS", 7);
        var text = plan.Layer("DETAILS-TEXT", 7);
        var height = crest - bed;
        return
        [
            pen.Poly(line, false, -16, 0, -6, 0, -4, height, -2, height, 2, height * 0.6, 8, 0.2, 14, 0, 16, 0),
            pen.Poly(line, false, -6, 0, -6, -3, 14, -3, 14, 0),
            pen.Line(line, -16, height, -4, height),
            pen.Text(text, -15, height + 0.6, 0.8, $"NWL {crest:0.00}"),
            pen.Text(text, -3, height + 0.6, 0.8, $"CREST {crest:0.00}"),
            pen.Text(text, 3, -2.2, 0.8, "STILLING BASIN, C30 CONCRETE"),
            pen.Text(text, -15, -2.2, 0.8, $"RIVER BED {bed:0.00}"),
        ];
    }
}
