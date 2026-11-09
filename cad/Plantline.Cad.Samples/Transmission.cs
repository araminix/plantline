using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.Tables;
using ACadSharp.Types.Units;

namespace Plantline.Cad.Samples;

/// <summary>
/// A 154 kV overhead line of about 13 km between two substations across real steppe in UTM zone 36N (SRTM ground): angle points where the route turns,
/// towers by type (dead-end at the ends, light or heavy angle by how much the line turns, suspension between) at
/// spans of at most 400 m, each turned to bisect the line, a 40 m right of way, numbered crossings of the streams,
/// village tracks and an existing 34.5 kV line, access tracks to the towers, contours in a 700 m survey corridor,
/// and the sheet with the tower schedule.
/// </summary>
internal static class Transmission
{
    private static readonly P Origin = new(471_500, 4_332_600);
    private static readonly P[] Route = [new(0, 0), new(1800, 700), new(3900, 2400), new(5900, 2300), new(7900, 2350), new(8450, 2950), new(8600, 6900)];
    private const double MaxSpan = 400, Corridor = 700;

    private sealed record Tower(string Id, string Type, P At, double Degrees, double Turn);

    public static CadDocument Draw()
    {
        var plan = new Plan(UnitsType.Meters);
        var pen = new Pen(1);
        var w = (P local) => Origin + local;
        var ws = (IEnumerable<P> points) => points.Select(p => Origin + p);

        // Towers: dead-end at the ends, angle towers where the route turns, suspension towers between at equal spans
        var towers = new List<Tower>();
        for (var leg = 0; leg < Route.Length - 1; leg++)
        {
            var (a, b) = (Route[leg], Route[leg + 1]);
            var direction = (b - a).Unit;
            var spans = (int)Math.Ceiling((b - a).Length / MaxSpan);
            if (leg == 0)
            {
                towers.Add(new Tower("", "DE", a, direction.Degrees, 0));
            }

            for (var i = 1; i < spans; i++)
            {
                towers.Add(new Tower("", "S", a + (b - a) * ((double)i / spans), direction.Degrees, 0));
            }

            if (leg == Route.Length - 2)
            {
                towers.Add(new Tower("", "DE", b, direction.Degrees, 0));
            }
            else
            {
                var next = (Route[leg + 2] - b).Unit;
                var turn = next.Degrees - direction.Degrees;
                towers.Add(new Tower("", Math.Abs(turn) <= 30 ? "A30" : "A60", b, (direction + next).Unit.Degrees, turn));
            }
        }

        towers = towers.Select((tower, i) => tower with { Id = $"T{i + 1:00}" }).ToList();

        var ground = Terrain.Load("transmission").Smoothed(1);
        double Ground(double x, double y) => ground.Height(x, y);

        var route = Route.ToList();
        var surveyed = (P p) => Math.Abs(Geo.Locate(route, p - Origin).Distance) < Corridor;
        Topography.Draw(plan, pen, Contours.Trace(Ground, w(new P(-400, -400)), w(new P(8850, 7450)), 30, 10, 2.5, surveyed), 50, 14);
        var corridor = plan.Layer("SURVEY-CORRIDOR", 8);
        foreach (var side in new[] { -Corridor, Corridor })
        {
            plan.Add(pen.Poly(corridor, false, ws(Geo.Offset(route, side))));
        }

        // Existing features the line crosses: the streams of the ground, an existing 34.5 kV line
        var streamLayer = plan.Layer("STREAM", 150);
        var (main, others) = ground.Streams(1_500_000);
        var streams = others.Prepend(main).SelectMany(stream => Geo.Runs(stream, surveyed)).ToList();
        foreach (var stream in streams)
        {
            plan.Add(pen.Poly(streamLayer, false, stream));
        }

        var mvLine = new List<P> { new(450, 1150), new(800, 500), new(1300, -350) };
        var mv = plan.Layer("EXISTING-34.5KV-LINE", 6);
        plan.Add(pen.Poly(mv, false, ws(mvLine)));
        var mvPole = plan.Block("POLE_34.5KV", [pen.Box(null, 0, 0, 1.5, 1.5)]);
        for (var s = 0.0; s < Geo.Length(mvLine); s += 120)
        {
            var p = w(Geo.At(mvLine, s).Point);
            plan.Add(pen.Put(mvPole, mv, p.X, p.Y));
        }

        // Village tracks, and new access tracks from the nearest track or highway to each tower
        var tracks = new List<List<P>>
        {
            Geo.Smooth([new(-300, 600), new(600, 300), new(1500, 500), new(2600, 300)], 30),
            Geo.Smooth([new(2400, 3300), new(3300, 2900), new(4200, 2000), new(4800, 1800)], 30),
            Geo.Smooth([new(6000, 1200), new(6600, 2000), new(7000, 3000), new(7200, 3800)], 30),
            Geo.Smooth([new(6400, 6000), new(7200, 5600), new(7900, 5000), new(8700, 4600)], 30),
        };
        var trackLayer = plan.Layer("EXISTING-VILLAGE-TRACK", 251);
        foreach (var track in tracks)
        {
            plan.Add(pen.Poly(trackLayer, false, ws(track)));
        }

        var access = plan.Layer("ROAD-ACCESS-TRACK", 41);
        foreach (var tower in towers)
        {
            var nearest = tracks
                .Select(track => Geo.At(track, Geo.Locate(track, tower.At).Station).Point)
                .MinBy(p => (p - tower.At).Length);
            var distance = (nearest - tower.At).Length;
            if (distance is > 15 and < 450)
            {
                var bend = (tower.At + nearest) * 0.5 + (nearest - tower.At).Unit.Left * (distance * 0.12);
                plan.Add(pen.Poly(access, false, ws(Geo.Smooth([nearest, bend, tower.At], 15))));
            }
        }

        // The substations at both ends
        var substation = plan.Block("SUBSTATION_154KV",
        [
            pen.Box(null, 0, 0, 90, 70),
            pen.Box(null, 0, 0, 84, 64),
            pen.Line(null, -30, 10, 30, 10),
            pen.Line(null, -30, 16, 30, 16),
            pen.Box(null, -25, -20, 22, 10),
            ..new[] { -20.0, -8, 4, 16 }.Select(x => (Entity)pen.Box(null, x, 26, 8, 1)),
        ]);
        var substations = plan.Layer("SUBSTATIONS", 2);
        var first = (Route[1] - Route[0]).Unit;
        var last = (Route[^1] - Route[^2]).Unit;
        foreach (var (id, at, direction) in new[] { ("SS-A 154 kV", Route[0] - first * 110, first), ("SS-B 154 kV", Route[^1] + last * 110, last) })
        {
            plan.Add(pen.Tag(pen.Put(substation, substations, w(at).X, w(at).Y, direction.Degrees - 90), "ID", id, w(at).X + 55, w(at).Y + 40, 25));
        }

        // The line itself, from gantry to gantry through the towers, and its right of way
        var line = new List<P> { Route[0] - first * 75 };
        line.AddRange(towers.Select(tower => tower.At));
        line.Add(Route[^1] + last * 75);
        var ohl = plan.Layer("OHL-154KV", 1);
        plan.Add(pen.Poly(ohl, false, ws(line)));
        var row = plan.Layer("RIGHT-OF-WAY-40M", 252);
        foreach (var side in new[] { -20.0, 20.0 })
        {
            plan.Add(pen.Poly(row, false, ws(Geo.Offset(route, side))));
        }

        // The towers: a block per type, its footing as wide as the tower is strong
        var towerLayer = plan.Layer("TOWERS", 5);
        var blocks = new Dictionary<string, BlockRecord>();
        foreach (var (type, side, arm) in new[] { ("S", 7.5, 5.5), ("A30", 9.0, 6.0), ("A60", 10.5, 6.5), ("DE", 12.0, 7.0) })
        {
            var h = side / 2;
            blocks[type] = plan.Block($"TOWER_154KV_{type}",
            [
                pen.Box(null, 0, 0, side, side),
                pen.Line(null, -h, -h, h, h),
                pen.Line(null, -h, h, h, -h),
                ..new[] { (-h, -h), (h, -h), (h, h), (-h, h) }.Select(c => (Entity)pen.Box(null, c.Item1, c.Item2, 1.6, 1.6)),
                pen.Line(null, 0, -arm - 2, 0, arm + 2),
                ..new[] { -arm - 2, -arm + 1, arm - 1, arm + 2 }.Select(y => (Entity)pen.Circle(null, 0, y, 0.4)),
            ]);
        }

        foreach (var tower in towers)
        {
            var at = w(tower.At);
            var insert = pen.Put(blocks[tower.Type], towerLayer, at.X, at.Y, tower.Degrees);
            pen.Tag(insert, "ID", tower.Id, at.X + 20, at.Y + 12, 22);
            pen.Tag(insert, "TYPE", tower.Type, at.X + 20, at.Y - 18, 14);
            plan.Add(insert);
        }

        // Crossings, numbered along the line
        var labels = plan.Layer("CROSSING-TEXT", 7);
        var features = new List<(string Name, List<P> Line)> { ("EXISTING 34.5 kV LINE", ws(mvLine).ToList()) };
        features.AddRange(streams.Select(stream => ("STREAM", stream)));
        features.AddRange(tracks.Select(track => ("VILLAGE TRACK", ws(track).ToList())));
        var crossings = features
            .SelectMany(feature => Geo.Crossings(ws(line).ToList(), feature.Line).Select(c => (Name: feature.Name, Point: c.Point - Origin, c.Station)))
            .OrderBy(c => c.Station)
            .ToList();
        for (var i = 0; i < crossings.Count; i++)
        {
            var p = w(crossings[i].Point);
            plan.Add(pen.Circle(labels, p.X, p.Y, 18));
            plan.Add(pen.Text(labels, p.X + 30, p.Y - 40, 22, $"CROSSING {i + 1}: {crossings[i].Name}"));
        }

        // The sheet, with the tower schedule
        var sheet = new Sheet(plan, pen, "A0", 10_000, w(new P(-1100, -800)));
        var length = Geo.Length(line);
        sheet.Frame("SAMPLE 154 kV OVERHEAD LINE", $"154 kV OHL SS-A TO SS-B, ROUTE PLAN, {length / 1000:0.00} km", "OHL-154-RP-001", "2026-11-09");
        sheet.Grid(1000, (x, y) => ($"E {Sheet.Spaced(x)}", $"N {Sheet.Spaced(y)}"));
        var legend = sheet.Legend(
        [
            new("154 kV overhead line, single circuit", ohl),
            new("Tower: suspension, angle, dead-end", towerLayer, "box"),
            new("Right of way 40 m", row, "dash"),
            new("Substation 154 kV", substations, "box"),
            new("New access track", access),
            new("Existing village track", trackLayer),
            new("Existing 34.5 kV line", mv, "dash"),
            new("Stream", streamLayer),
            new("Crossing", labels, "circle"),
            new("Survey corridor 2 x 700 m", corridor, "dash"),
            new("Contour, 10 m / 50 m", plan.Layer("TOPO-CONTOUR-MAJOR", 8)),
        ]);
        sheet.Notes(
        [
            "Coordinates: WGS 84 / UTM zone 36N (EPSG:32636), metres. Elevations in metres above mean sea level (SRTM), contour interval 10 m within the survey corridor.",
            $"Single circuit 154 kV, conductor 1272 MCM (Pheasant), one earth wire with optical fibre; {length / 1000:0.00} km, {towers.Count} towers.",
            "Tower types: S suspension, A30 angle up to 30 degrees, A60 angle up to 60 degrees, DE dead-end; spans at most 400 m.",
            "Right of way 20 m either side of the line; crossings as numbered, with clearances to the crossing owners' rules.",
            "Access tracks 4 m from the nearest existing track or road to each tower.",
        ], legend + 6);

        var table = plan.Layer("SCHEDULES", 7);
        var paper = new Pen(1);
        var widths = new[] { 0.0, 16, 32, 66, 104, 126, 148, 174 };
        var rows = new List<string[]> { new[] { "No", "TYPE", "EASTING", "NORTHING", "ELEV.", "SPAN", "ANGLE" } };
        for (var i = 0; i < towers.Count; i++)
        {
            var at = w(towers[i].At);
            var span = i < towers.Count - 1 ? $"{(towers[i + 1].At - towers[i].At).Length:0}" : "-";
            rows.Add([towers[i].Id, towers[i].Type, Sheet.Spaced(at.X), Sheet.Spaced(at.Y), $"{Ground(at.X, at.Y):0.0}", span, towers[i].Turn == 0 ? "-" : $"{towers[i].Turn:0.0}"]);
        }

        var cells = new List<Entity> { paper.Text(table, 0, 3, 3.5, "SCHEDULE OF SUPPORTS") };
        for (var r = 0; r <= rows.Count; r++)
        {
            cells.Add(paper.Line(table, 0, -r * 5, widths[^1], -r * 5));
        }

        foreach (var x in widths)
        {
            cells.Add(paper.Line(table, x, 0, x, -rows.Count * 5));
        }

        for (var r = 0; r < rows.Count; r++)
        {
            for (var c = 0; c < rows[r].Length; c++)
            {
                cells.Add(paper.Text(table, widths[c] + 1.5, -r * 5 - 3.6, 2.2, rows[r][c]));
            }
        }

        var tableAt = sheet.At(sheet.Width - 10 - 180 + 2, 640);
        plan.Add(pen.Put(plan.Block("LINE_SCHEDULE", cells), table, tableAt.X, tableAt.Y, 0, sheet.M));
        Console.WriteLine($"  transmission: {towers.Count} towers, {length:0} m, {crossings.Count} crossings");
        return plan.Document;
    }
}
