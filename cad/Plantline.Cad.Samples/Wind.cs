using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.Types.Units;

namespace Plantline.Cad.Samples;

/// <summary>
/// A 45 MW wind farm on real steppe ridges in UTM zone 36N (SRTM ground): ten 4.5 MW turbines (rotor 150 m) sited on
/// the highest ground at least 440 m apart, each with its crane hardstand and blade laydown area; 5.5 m access roads
/// branching from the substation to every turbine with the 33 kV cables in their shoulder; the 33/154 kV substation,
/// O&amp;M building and connection line in the lowest open ground nearby; a met mast; the licence area; the streams;
/// 10 m contours; and the sheet with the turbines' coordinate table.
/// </summary>
internal static class Wind
{
    private static readonly P Centre = new(733_870, 4_347_466);
    private const int Turbines = 10;
    private const double Spacing = 440, Rotor = 150;

    public static CadDocument Draw()
    {
        var plan = new Plan(UnitsType.Meters);
        var pen = new Pen(1);
        var terrain = Terrain.Load("wind");
        var ground = terrain.Smoothed(1);

        // Micro-siting: the highest ground first, each turbine at least 440 m from the others
        var candidates = new List<(P At, double Z)>();
        for (var x = Centre.X - 2100; x <= Centre.X + 2100; x += terrain.Step)
        {
            for (var y = Centre.Y - 1600; y <= Centre.Y + 1600; y += terrain.Step)
            {
                candidates.Add((new P(x, y), ground.Height(x, y)));
            }
        }

        var sites = new List<P>();
        foreach (var (at, _) in candidates.OrderByDescending(c => c.Z))
        {
            if (sites.All(site => (site - at).Length >= Spacing))
            {
                sites.Add(at);
            }

            if (sites.Count == Turbines)
            {
                break;
            }
        }

        // Numbered from west to east
        sites = sites.OrderBy(site => site.X).ToList();
        var middle = sites.Aggregate(new P(0, 0), (sum, p) => sum + p) * (1.0 / sites.Count);

        // The substation: the lowest open ground 1.4 to 2.2 km from the turbines' middle, inside the survey
        var substationAt = candidates.Concat(Ring(middle, 1400, 2200, terrain.Step).Select(p => (At: p, Z: ground.Height(p))))
            .Where(c => (c.At - middle).Length is >= 1400 and <= 2200 && c.At.X > terrain.From.X + 400 && c.At.X < terrain.To.X - 400 && c.At.Y > terrain.From.Y + 400 && c.At.Y < terrain.To.Y - 400)
            .Where(c => Slope(ground, c.At) < 0.08)
            .MinBy(c => c.Z).At;

        // The roads: a tree from the substation to every turbine, joining each to the nearest already reached (gentle climbs preferred)
        var nodes = new List<P> { substationAt };
        nodes.AddRange(sites);
        var parent = Tree(nodes, (a, b) => (a - b).Length + 6 * Math.Abs(ground.Height(a) - ground.Height(b)));
        var roadLayer = plan.Layer("ROAD-ACCESS-5.5M", 41);
        var edges = plan.Layer("TRACK-EDGE", 41);
        var mv = plan.Layer("MV-CABLE-33KV", 1);
        var hardstands = plan.Layer("CRANE-HARDSTAND", 30);
        var laydown = plan.Layer("BLADE-LAYDOWN", 252);
        var roadLength = 0.0;
        for (var i = 1; i < nodes.Count; i++)
        {
            var (from, to) = (nodes[parent[i]], nodes[i]);
            var direction = (to - from).Unit;
            var length = (to - from).Length;
            var bend = direction.Left * (length * 0.07 * (i % 2 == 0 ? 1 : -1));
            var end = to - direction * 36;
            var road = Geo.Smooth([from, from + (end - from) * 0.33 + bend, from + (end - from) * 0.66 - bend * 0.5, end], 12);
            roadLength += Geo.Length(road);
            plan.Add(pen.Poly(roadLayer, false, road));
            foreach (var side in new[] { -2.75, 2.75 })
            {
                plan.Add(pen.Poly(edges, false, Geo.Offset(road, side)));
            }

            plan.Add(pen.Poly(mv, false, (List<P>)[.. Geo.Offset(road, 4), to]));

            // The hardstand where the road arrives, the blade laydown area beside it
            var stand = to - direction * 24;
            var blades = to - direction * 30 + direction.Left * 26;
            plan.Add(pen.Box(hardstands, stand.X, stand.Y, 45, 25, direction.Degrees));
            plan.Add(pen.Box(laydown, blades.X, blades.Y, 85, 12, direction.Degrees));
        }

        // The turbines, rotors facing the prevailing north-north-easterly wind
        var foundation = plan.Layer("WTG-FOUNDATION", 8);
        var swept = plan.Layer("WTG-ROTOR", 252);
        var turbine = plan.Block("WTG_4.5MW_D150_HH105",
        [
            pen.Circle(foundation, 0, 0, 11),
            pen.Circle(null, 0, 0, 2.25),
            pen.Box(null, -4, 0, 14, 4.2),
            pen.Circle(null, 4, 0, 1.6),
            pen.Line(null, 4.5, -Rotor / 2, 4.5, Rotor / 2),
            pen.Circle(swept, 0, 0, Rotor / 2),
        ]);
        var turbines = plan.Layer("WTG", 1);
        var ids = sites.Select((_, i) => $"WTG-{i + 1:00}").ToList();
        for (var i = 0; i < sites.Count; i++)
        {
            var at = sites[i];
            var insert = pen.Put(turbine, turbines, at.X, at.Y, 70);
            pen.Tag(insert, "ID", ids[i], at.X + 16, at.Y + 14, 12);
            pen.Tag(insert, "HUB_HEIGHT", "HH 105 m", at.X + 16, at.Y - 2, 8);
            pen.Tag(insert, "ELEVATION", $"{ground.Height(at):0.0} m", at.X + 16, at.Y - 14, 8);
            plan.Add(insert);
        }

        // The substation, the O&M building towards the turbines, the 154 kV connection away from them
        var substationLayer = plan.Layer("SUBSTATION", 2);
        var substation = plan.Block("SUBSTATION_33-154KV_50MVA",
        [
            pen.Rect(null, -40, -30, 40, 30),
            pen.Box(null, -8, 8, 10, 6),
            pen.Rect(null, -36, -26, 36, 26),
            pen.Line(null, -30, 18, 30, 18),
            pen.Box(null, 18, -16, 20, 10),
            ..Enumerable.Range(0, 4).Select(i => (Entity)pen.Box(null, -28 + i * 6, 18, 2, 2)),
        ]);
        var away = (substationAt - middle).Unit;
        plan.Add(pen.Tag(pen.Put(substation, substationLayer, substationAt.X, substationAt.Y, away.Degrees + 90), "ID", "WF-SS 33/154 kV", substationAt.X + 45, substationAt.Y + 36, 12));
        var om = plan.Layer("O&M-BUILDING", 2);
        var omAt = substationAt - away * 75 + away.Left * 50;
        plan.Add(pen.Box(om, omAt.X, omAt.Y, 30, 15, away.Degrees + 90));
        plan.Add(pen.Box(om, (omAt + away.Left * 25).X, (omAt + away.Left * 25).Y, 30, 18, away.Degrees + 90));
        plan.Add(pen.Text(om, omAt.X + 20, omAt.Y + 12, 8, "O&M BUILDING, PARKING"));
        var ohl = plan.Layer("OHL-154KV-CONNECTION", 6);
        var towers = Enumerable.Range(1, 4).Select(i => substationAt + away * (60 + (i - 1) * 330)).Where(p => p.X > terrain.From.X && p.X < terrain.To.X && p.Y > terrain.From.Y && p.Y < terrain.To.Y).ToList();
        plan.Add(pen.Poly(ohl, false, [substationAt + away * 40, .. towers]));
        foreach (var tower in towers)
        {
            plan.Add(pen.Box(ohl, tower.X, tower.Y, 8, 8, away.Degrees));
        }

        plan.Add(pen.Text(ohl, towers[^1].X + 15, towers[^1].Y, 9, "154 kV LINE TO THE EXISTING SYSTEM"));

        // A met mast on the highest free ground, its guy wires anchored around it
        var mastAt = candidates.OrderByDescending(c => c.Z).First(c => sites.All(site => (site - c.At).Length > 300)).At;
        var mastLayer = plan.Layer("MET-MAST", 4);
        var mast = plan.Block("MET_MAST_105M",
        [
            pen.Circle(null, 0, 0, 1),
            ..new[] { 90.0, 210, 330 }.SelectMany(a => new Entity[] { pen.Line(null, P.Polar(a, 1).X, P.Polar(a, 1).Y, P.Polar(a, 55).X, P.Polar(a, 55).Y), pen.Circle(null, P.Polar(a, 55).X, P.Polar(a, 55).Y, 1.5) }),
        ]);
        plan.Add(pen.Tag(pen.Put(mast, mastLayer, mastAt.X, mastAt.Y), "ID", "MM-01 MET MAST 105 m", mastAt.X + 8, mastAt.Y + 8, 9));

        // The licence area: 450 m around the turbines
        var licence = Hull(sites.SelectMany(site => Enumerable.Range(0, 24).Select(k => site + P.Polar(k * 15, 450))).ToList());
        var licenceLayer = plan.Layer("LICENCE-AREA-BOUNDARY", 1);
        plan.Add(pen.Poly(licenceLayer, true, licence));

        // The sheet, the turbines' middle on the left of it; contours and streams over the paper's plan area
        var sheet = new Sheet(plan, pen, "A0", 5000, middle - new P(500, 430) * 5);
        var surveyFrom = new P(Math.Max(terrain.From.X + 50, sheet.At(25, 15).X), Math.Max(terrain.From.Y + 50, sheet.At(25, 15).Y));
        var surveyTo = new P(Math.Min(terrain.To.X - 50, sheet.At(985, 826).X), Math.Min(terrain.To.Y - 50, sheet.At(985, 826).Y));
        Topography.Draw(plan, pen, Contours.Trace((x, y) => ground.Height(x, y), surveyFrom, surveyTo, 25, 10, 1.5), 50, 9);
        var stream = plan.Layer("STREAM", 150);
        var (main, others) = terrain.Smoothed(1).Streams(250_000);
        foreach (var run in others.Prepend(main).SelectMany(line => Geo.Runs(line, p => p.X > surveyFrom.X && p.X < surveyTo.X && p.Y > surveyFrom.Y && p.Y < surveyTo.Y)))
        {
            plan.Add(pen.Poly(stream, false, run));
        }

        sheet.Frame("SAMPLE WIND FARM", $"WIND FARM LAYOUT, {Turbines} x 4.5 MW = {Turbines * 4.5:0.0} MW", "WF-CIV-LAY-001", "2026-11-09");
        sheet.Grid(500, (x, y) => ($"E {Sheet.Spaced(x)}", $"N {Sheet.Spaced(y)}"));
        var legend = sheet.Legend(
        [
            new("Wind turbine 4.5 MW, foundation", turbines, "circle"),
            new("Rotor swept area, D = 150 m", swept, "circle"),
            new("Crane hardstand 25 x 45 m", hardstands, "box"),
            new("Blade laydown area", laydown, "box"),
            new("Access road 5.5 m", roadLayer),
            new("MV cable 33 kV", mv),
            new("Substation 33/154 kV, O&M building", substationLayer, "box"),
            new("Met mast with guy wires", mastLayer, "circle"),
            new("154 kV connection line", ohl, "dash"),
            new("Licence area boundary", licenceLayer, "dash"),
            new("Stream", stream),
            new("Contour, 10 m / 50 m", plan.Layer("TOPO-CONTOUR-MAJOR", 8)),
        ]);
        sheet.Notes(
        [
            "Coordinates: WGS 84 / UTM zone 36N (EPSG:32636), metres. Elevations in metres above mean sea level (SRTM), contour interval 10 m.",
            $"Wind turbines: {Turbines} x 4.5 MW, rotor diameter 150 m, hub height 105 m; {Turbines * 4.5:0.0} MW installed.",
            $"Turbines on the ridge tops at least {Spacing:0} m ({Spacing / Rotor:0.0} rotor diameters) apart; prevailing wind from the north-north-east.",
            "Crane hardstands 25 x 45 m and blade laydown areas 85 x 12 m where the road reaches each turbine.",
            $"Access roads 5.5 m wide, {roadLength / 1000:0.0} km, branching from the substation; gradient at most 12 %, inner radius at least 45 m.",
            "Collector system: 33 kV cables in the road shoulder, looped from turbine to turbine back to the substation.",
            "Substation 33/154 kV, 50 MVA, with the O&M building; grid connection by a 154 kV line to the existing system.",
        ], legend + 6);

        // The coordinate table, in the right column
        var table = plan.Layer("SCHEDULES", 7);
        var paper = new Pen(1);
        var widths = new[] { 0.0, 30, 75, 125, 150, 176 };
        var rows = new List<string[]> { new[] { "TURBINE", "EASTING", "NORTHING", "ELEV.", "HUB" } };
        rows.AddRange(sites.Select((site, i) => new[] { ids[i], Sheet.Spaced(site.X), Sheet.Spaced(site.Y), $"{ground.Height(site):0.0}", "105" }));
        var cells = new List<Entity> { paper.Text(table, 0, 4, 3.5, "COORDINATES (UTM 36N)") };
        for (var r = 0; r <= rows.Count; r++)
        {
            cells.Add(paper.Line(table, 0, -r * 7, widths[^1], -r * 7));
        }

        foreach (var x in widths)
        {
            cells.Add(paper.Line(table, x, 0, x, -rows.Count * 7));
        }

        for (var r = 0; r < rows.Count; r++)
        {
            for (var c = 0; c < 5; c++)
            {
                cells.Add(paper.Text(table, widths[c] + 2, -r * 7 - 5, 2.5, rows[r][c]));
            }
        }

        var tableAt = sheet.At(sheet.Width - 10 - 180 + 2, 330);
        plan.Add(pen.Put(plan.Block("COORDINATE_SCHEDULE", cells), table, tableAt.X, tableAt.Y, 0, sheet.M));
        sheet.Detail("DETAIL_A_ROAD_SECTION", "A  ACCESS ROAD AND CABLE TRENCH, SECTION", 100, sheet.Width - 10 - 180 + 50, 200, RoadSection(pen, plan));
        Console.WriteLine($"  wind: {Turbines} turbines at {string.Join(", ", sites.Select(s => $"{ground.Height(s):0}"))} m, roads {roadLength:0} m");
        return plan.Document;
    }

    /// <summary>Points on a grid between two distances from a centre.</summary>
    private static IEnumerable<P> Ring(P centre, double inner, double outer, double step)
    {
        for (var x = -outer; x <= outer; x += step)
        {
            for (var y = -outer; y <= outer; y += step)
            {
                var d = Math.Sqrt(x * x + y * y);
                if (d >= inner && d <= outer)
                {
                    yield return centre + new P(x, y);
                }
            }
        }
    }

    private static double Slope(Terrain ground, P at)
    {
        var (dx, dy) = (ground.Height(at.X + 25, at.Y) - ground.Height(at.X - 25, at.Y), ground.Height(at.X, at.Y + 25) - ground.Height(at.X, at.Y - 25));
        return Math.Sqrt(dx * dx + dy * dy) / 50;
    }

    /// <summary>The cheapest tree over the points from the first one (Prim): each point's parent.</summary>
    private static int[] Tree(List<P> points, Func<P, P, double> cost)
    {
        var parent = new int[points.Count];
        var reached = new bool[points.Count];
        var best = Enumerable.Repeat(double.MaxValue, points.Count).ToArray();
        best[0] = 0;
        for (var k = 0; k < points.Count; k++)
        {
            var next = Enumerable.Range(0, points.Count).Where(i => !reached[i]).MinBy(i => best[i]);
            reached[next] = true;
            for (var i = 0; i < points.Count; i++)
            {
                if (!reached[i] && cost(points[next], points[i]) < best[i])
                {
                    (best[i], parent[i]) = (cost(points[next], points[i]), next);
                }
            }
        }

        return parent;
    }

    /// <summary>The convex hull of points, anticlockwise (monotone chain).</summary>
    private static List<P> Hull(List<P> points)
    {
        var sorted = points.OrderBy(p => p.X).ThenBy(p => p.Y).ToList();
        var hull = new List<P>();
        foreach (var pass in new[] { sorted, Enumerable.Reverse(sorted).ToList() })
        {
            var start = hull.Count;
            foreach (var p in pass)
            {
                while (hull.Count >= start + 2 && (hull[^1] - hull[^2]).Cross(p - hull[^2]) <= 0)
                {
                    hull.RemoveAt(hull.Count - 1);
                }

                hull.Add(p);
            }

            hull.RemoveAt(hull.Count - 1);
        }

        return hull;
    }

    private static List<Entity> RoadSection(Pen pen, Plan plan)
    {
        var line = plan.Layer("DETAILS", 7);
        var text = plan.Layer("DETAILS-TEXT", 7);
        return
        [
            pen.Poly(line, false, -6, -0.6, -4.75, 0, -3.75, 0, -2.75, 0.05, 0, 0.12, 2.75, 0.05, 3.75, 0, 5.0, -0.2, 5.6, -0.8, 6.2, -0.2, 7.5, 0.4),
            pen.Poly(line, false, -2.75, 0.05, -2.75, -0.35, 2.75, -0.35, 2.75, 0.05),
            pen.Poly(line, false, 3.9, -0.02, 3.9, -1.2, 4.6, -1.2, 4.6, -0.05),
            pen.Circle(line, 4.1, -1.0, 0.05),
            pen.Circle(line, 4.25, -1.0, 0.05),
            pen.Circle(line, 4.4, -1.0, 0.05),
            pen.Text(text, -2.4, 0.5, 0.25, "5.50 m CARRIAGEWAY, CRUSHED STONE 35 cm"),
            pen.Text(text, 3.6, -1.7, 0.2, "33 kV CABLES"),
            pen.Text(text, 5.0, 0.6, 0.2, "DITCH"),
        ];
    }
}
