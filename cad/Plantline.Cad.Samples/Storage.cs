using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.Types.Units;

namespace Plantline.Cad.Samples;

/// <summary>
/// A 50 MW / 100 MWh battery storage site in local site coordinates (metres from the south-west property corner):
/// 24 battery containers with their 12 PCS/MV skids in three bands between 6 m roads, the 33 kV E-house, control
/// building and auxiliary transformer, the 33/154 kV main transformer and its 154 kV bay in a fenced HV yard, fire
/// water and hydrants, lighting, cameras, drainage and spot levels, and a reserved area for a second phase.
/// </summary>
internal static class Storage
{
    private static readonly double[] Columns = [35, 72, 109, 146];
    private static readonly double[] Bands = [15, 53, 91];

    public static CadDocument Draw()
    {
        var plan = new Plan(UnitsType.Meters);
        var pen = new Pen(1);

        // Property, fence with the main and emergency gates, the public road and the site's access
        plan.Add(pen.Rect(plan.Layer("PROPERTY-BOUNDARY", 30), 0, 0, 230, 160));
        var fence = plan.Layer("FENCE-2.4M", 3);
        plan.Add(pen.Poly(fence, false, 106, 3, 227, 3, 227, 157, 202, 157));
        plan.Add(pen.Poly(fence, false, 196, 157, 3, 157, 3, 3, 96, 3));
        var gates = plan.Layer("FENCE-GATE", 3);
        plan.Add(pen.Put(plan.Block("GATE_SLIDING_10M", [pen.Line(null, -5, 0, 5, 0), pen.Line(null, -5, -0.4, 5, -0.4), pen.Line(null, 5, 0, 15, 0)]), gates, 101, 3));
        plan.Add(pen.Put(plan.Block("GATE_SWING_6M", [pen.Arc(null, -3, 0, 3, 0, 90), pen.Arc(null, 3, 0, 3, 90, 180)]), gates, 199, 157));
        var publicRoad = plan.Layer("EXISTING-ROAD", 251);
        plan.Add(pen.Line(publicRoad, -60, -20, 300, -20));
        plan.Add(pen.Line(publicRoad, -60, -28, 300, -28));
        plan.Add(pen.Text(publicRoad, -40, -25.5, 2, "EXISTING ROAD (ASPHALT, 8 m)"));

        // Roads: a ring inside the fence, two between the bands, the access from the gate
        var road = plan.Layer("ROAD-ASPHALT-6M", 41);
        var edge = plan.Layer("ROAD-EDGE", 41);
        var centrelines = new List<List<P>>
        {
            new() { new(12, 12), new(218, 12), new(218, 148), new(12, 148), new(12, 12) },
            new() { new(12, 50), new(172, 50) },
            new() { new(12, 88), new(172, 88) },
            new() { new(101, -20), new(101, 12) },
            new() { new(172, 50), new(172, 148) },
        };
        foreach (var line in centrelines)
        {
            plan.Add(pen.Poly(road, false, line));
            foreach (var side in new[] { -3.0, 3.0 })
            {
                plan.Add(pen.Poly(edge, false, Geo.Offset(line, side)));
            }
        }

        // Power blocks: two battery containers and their PCS/MV skid, four to a band
        var containerLayer = plan.Layer("BATTERY-CONTAINERS", 3);
        var container = plan.Block("BESS_CONTAINER_20FT_4.2MWH",
        [
            pen.Box(null, 0, 0, 6.058, 2.438),
            pen.Box(null, -3.35, 0, 0.6, 1.6),
            pen.Box(null, 3.35, 0, 0.6, 1.6),
            pen.Line(null, -2.4, -1.219, -2.4, 1.219),
            pen.Line(null, 2.4, -1.219, 2.4, 1.219),
            pen.Line(null, -1.0, -1.219, 1.0, -1.219),
        ]);
        var skidLayer = plan.Layer("PCS-MV-SKIDS", 1);
        var skid = plan.Block("PCS_MVSKID_4.2MVA",
        [
            pen.Box(null, 0, 0, 12.192, 2.438),
            pen.Line(null, -1.6, -1.219, -1.6, 1.219),
            pen.Line(null, 3.4, -1.219, 3.4, 1.219),
            pen.Text(null, -4.6, -0.3, 0.6, "PCS"),
            pen.Text(null, 0.2, -0.3, 0.6, "TR"),
            pen.Text(null, 3.9, -0.3, 0.6, "RMU"),
        ]);
        var dc = plan.Layer("DC-CABLE-1500V", 4);
        var mv = plan.Layer("MV-CABLE-33KV", 1);
        var lv = plan.Layer("LV-CABLE-0.4KV", 6);
        var (containers, skids) = (0, 0);
        foreach (var band in Bands)
        {
            var (rowY, skidY) = (band + 6, band + 14.5);
            foreach (var x in Columns)
            {
                var skidId = $"PCS-{++skids:00}";
                plan.Add(pen.Tag(pen.Put(skid, skidLayer, x, skidY), "ID", skidId, x - 6, skidY + 1.8, 0.9));
                foreach (var side in new[] { -1, 1 })
                {
                    var cx = x + side * (6.058 / 2 + 1.5);
                    var insert = pen.Put(container, containerLayer, cx, rowY);
                    pen.Tag(insert, "ID", $"BESS-{++containers:00}", cx - 2.8, rowY - 2.4, 0.9);
                    pen.Tag(insert, "CAPACITY", "4.2 MWh LFP", cx - 2.8, rowY - 3.5, 0.6);
                    plan.Add(insert);
                    plan.Add(pen.Poly(dc, false, cx, rowY + 1.22, cx, skidY - 2.2, x + side * 2, skidY - 2.2, x + side * 2, skidY - 1.22));
                }
            }

            // Each band's skids chained on one 33 kV circuit to the E-house, with an auxiliary supply beside it
            plan.Add(pen.Poly(mv, false, (List<P>)[new(Columns[0], skidY + 1.22), new(Columns[0], skidY + 4), new(176, skidY + 4), new(176, 120), new(184, 120)]));
            plan.Add(pen.Poly(lv, false, (List<P>)[new(Columns[0], rowY - 1.22), new(Columns[0], band + 1.5), new(177.5, band + 1.5), new(177.5, 131), new(181, 131)]));
            foreach (var x in Columns.Skip(1))
            {
                plan.Add(pen.Line(mv, x, skidY + 1.22, x, skidY + 4));
            }
        }

        // Buildings: E-house, control building, fire pump house; the fire water tank; the reserved second phase
        var buildings = plan.Layer("BUILDINGS", 2);
        plan.Add(pen.Box(buildings, 195, 124, 22, 8));
        plan.Add(pen.Text(buildings, 186, 123.2, 1.4, "E-HOUSE 33 kV SWITCHGEAR"));
        plan.Add(pen.Box(buildings, 195, 106, 18, 10));
        plan.Add(pen.Text(buildings, 188, 105.3, 1.4, "CONTROL BUILDING"));
        var fireLayer = plan.Layer("FIRE-FIGHTING", 1);
        plan.Add(pen.Circle(fireLayer, 34, 130, 7.5));
        plan.Add(pen.Text(fireLayer, 28, 129.3, 1.4, "FIRE WATER 300 m3"));
        plan.Add(pen.Box(buildings, 50, 130, 8, 5));
        plan.Add(pen.Text(buildings, 46.6, 133.5, 1.2, "PUMP HOUSE"));
        var future = plan.Layer("FUTURE-EXTENSION", 252);
        plan.Add(pen.Rect(future, 66, 118, 160, 141));
        plan.Add(pen.Text(future, 80, 128.5, 2.2, "RESERVED FOR PHASE 2 (8 BLOCKS)"));

        // The auxiliary transformer, the main transformer and its 154 kV bay in the HV yard
        var transformers = plan.Layer("POWER-TRANSFORMER", 2);
        plan.Add(pen.Tag(pen.Put(plan.Block("AUX_TRANSFORMER_33-0.4KV_400KVA", [pen.Box(null, 0, 0, 2.2, 1.6), pen.Box(null, 0, 0, 3.4, 2.8)]), transformers, 181, 134), "ID", "AUX TR 33/0.4 kV 400 kVA", 179, 136.5, 0.8));
        plan.Add(pen.Poly(mv, false, 184, 124, 178.5, 124, 178.5, 72, 191, 72));
        var main = plan.Block("MAIN_TRANSFORMER_60MVA_33-154KV",
        [
            pen.Box(null, 0, 0, 8, 4.5),
            pen.Box(null, 0, 0, 13, 9),
            pen.Rect(null, -6.5, 4.8, 6.5, 5.4),
            ..Enumerable.Range(0, 6).Select(i => (Entity)pen.Rect(null, -3.6 + i * 1.3, -3.4, -2.8 + i * 1.3, -2.25)),
            ..new[] { -1.8, 0.0, 1.8 }.Select(x => (Entity)pen.Circle(null, x, 1.2, 0.3)),
        ]);
        plan.Add(pen.Tag(pen.Put(main, transformers, 195, 72), "ID", "TR-01 33/154 kV 60 MVA", 202, 74, 1));
        var hv = plan.Layer("HV-EQUIPMENT", 4);
        var three = (string name, double w, double h) => plan.Block(name, [.. new[] { -3.0, 0, 3 }.Select(x => (Entity)pen.Box(null, x, 0, w, h))]);
        var bay = new (string Block, double Y, double W, double H)[] { ("SA_154KV", 62, 0.6, 0.6), ("CT_170KV", 56, 0.8, 0.8), ("CB_170KV", 49, 1.0, 1.0), ("DS_170KV", 41, 0.6, 3.0) };
        foreach (var (name, y, bw, bh) in bay)
        {
            plan.Add(pen.Put(three(name, bw, bh), hv, 195, y));
        }

        plan.Add(pen.Put(plan.Block("GANTRY_154KV", [pen.Rect(null, -6, -0.4, 6, 0.4), pen.Box(null, -6, 0, 1.2, 1.2), pen.Box(null, 6, 0, 1.2, 1.2)]), hv, 195, 32));
        plan.Add(pen.Rect(plan.Layer("HV-YARD-FENCE", 3), 181, 24, 209, 82));
        var ohl = plan.Layer("OHL-154KV", 6);
        plan.Add(pen.Line(ohl, 195, 32, 195, -62));
        plan.Add(pen.Text(ohl, 197, -50, 1.8, "154 kV OVERHEAD LINE TO THE EXISTING SUBSTATION"));
        var masts = plan.Layer("LIGHTNING-PROTECTION", 4);
        var mast = plan.Block("LIGHTNING_MAST_20M", [pen.Circle(null, 0, 0, 0.4), pen.Circle(null, 0, 0, 18)]);
        foreach (var (x, y) in new[] { (183.0, 26.0), (207.0, 80.0) })
        {
            plan.Add(pen.Put(mast, masts, x, y));
        }

        // Hydrants along the roads, lighting along the ring, cameras at the corners
        var hydrant = plan.Block("FIRE_HYDRANT", [pen.Circle(null, 0, 0, 0.4), pen.Line(null, -0.6, 0, 0.6, 0), pen.Line(null, 0, -0.6, 0, 0.6)]);
        foreach (var (x, y) in new[] { (20.0, 16.5), (80, 16.5), (140, 16.5), (20, 54.5), (80, 54.5), (140, 54.5), (20, 92.5), (80, 92.5), (140, 92.5), (20, 143.5), (90, 143.5), (168, 70), (168, 120) })
        {
            plan.Add(pen.Put(hydrant, fireLayer, x, y));
        }

        var lighting = plan.Layer("LIGHTING", 50);
        var pole = plan.Block("LIGHTING_POLE_10M", [pen.Circle(null, 0, 0, 0.2), pen.Arc(null, 0, 0, 1.0, 45, 135)]);
        for (var x = 20.0; x <= 210; x += 30)
        {
            plan.Add(pen.Put(pole, lighting, x, 7.5));
            plan.Add(pen.Put(pole, lighting, x, 152.5, 180));
        }

        var cameras = plan.Layer("SECURITY-CCTV", 4);
        var camera = plan.Block("CCTV_POLE_6M", [pen.Circle(null, 0, 0, 0.25), pen.Arc(null, 0, 0, 1.5, -30, 30)]);
        foreach (var (x, y, a) in new[] { (4.5, 4.5, 45.0), (225.5, 4.5, 135), (225.5, 155.5, 225), (4.5, 155.5, 315), (101, 5, 90) })
        {
            plan.Add(pen.Put(camera, cameras, x, y, a));
        }

        // Drainage swale inside the fence, spot levels over the flat ground
        plan.Add(pen.Poly(plan.Layer("DRAINAGE-SWALE", 150), false, 6, 154, 6, 6, 224, 6, 224, 154));
        var levels = plan.Layer("SPOT-LEVELS", 8);
        var random = new Random(11);
        foreach (var (x, y) in new[] { (8.0, 8.0), (60, 30), (120, 30), (200, 8), (60, 70), (120, 108), (8, 150), (100, 150), (222, 150), (222, 60), (160, 70), (25, 110) })
        {
            var level = 21.2 + 0.004 * x + 0.003 * y + random.NextDouble() * 0.12;
            plan.Add(pen.Line(levels, x - 0.5, y, x + 0.5, y));
            plan.Add(pen.Line(levels, x, y - 0.5, x, y + 0.5));
            plan.Add(pen.Text(levels, x + 0.7, y + 0.3, 1.0, $"+{level:0.00}"));
        }

        // The sheet
        var sheet = new Sheet(plan, pen, "A1", 500, new P(-60, -70));
        sheet.Frame("SAMPLE BATTERY ENERGY STORAGE", "BESS 50 MW / 100 MWh, GENERAL ARRANGEMENT", "BESS-EL-GA-001", "2026-11-09");
        sheet.Grid(20, (x, y) => ($"X {x:0}", $"Y {y:0}"));
        var legend = sheet.Legend(
        [
            new("Battery container 20 ft, 4.2 MWh", containerLayer, "box"),
            new("PCS / MV skid 4.2 MVA, 0.69/33 kV", skidLayer, "box"),
            new("Transformer 33/154 kV and auxiliary", transformers, "box"),
            new("Buildings: E-house, control, pumps", buildings, "box"),
            new("HV equipment 154 kV", hv, "box"),
            new("DC cable 1500 V", dc),
            new("MV cable 33 kV", mv),
            new("LV auxiliary cable 0.4 kV", lv),
            new("Fence 2.4 m, HV yard fence, gates", fence),
            new("Road 6 m, asphalt", road),
            new("Fire hydrant, fire water tank", fireLayer, "circle"),
            new("Lighting pole 10 m", lighting, "circle"),
            new("154 kV overhead line", ohl, "dash"),
            new("Reserved area, phase 2", future, "dash"),
        ]);
        sheet.Notes(
        [
            "Site coordinates in metres from the south-west property corner (X east, Y north); site north is true north. Ground level about +21.5 m.",
            "50 MW / 100 MWh: 24 battery containers (20 ft, LFP, 4.2 MWh each) and 12 PCS/MV skids (4.2 MVA, 0.69/33 kV), two containers to a skid.",
            "33 kV switchgear in the E-house; main transformer 33/154 kV 60 MVA and the 154 kV bay; overhead connection to the existing substation south of the site.",
            "At least 3.0 m between containers and 6 m roads around every band for fire access; hydrants at most 60 m apart; fire water tank 300 m3.",
            "DC cables between containers and their skid in cable trays; 33 kV and auxiliary cables in trenches beside the roads.",
            "The area in the north is reserved for a second phase of 8 power blocks.",
        ], legend + 6);
        sheet.Detail("DETAIL_A_CONTAINER_FOUNDATION", "A  CONTAINER FOUNDATION, PLAN", 50, sheet.Width - 10 - 180 + 15, 190,
        [
            pen.Box(plan.Layer("DETAILS", 7), 3.03, 1.22, 6.058, 2.438),
            pen.Rect(plan.Layer("DETAILS", 7), -0.2, -0.1, 6.258, 0.4),
            pen.Rect(plan.Layer("DETAILS", 7), -0.2, 2.04, 6.258, 2.54),
            pen.Rect(plan.Layer("DETAILS", 7), 2.6, 0.6, 3.4, 1.4),
            pen.Text(plan.Layer("DETAILS-TEXT", 7), 6.6, 2.2, 0.2, "STRIP FOOTINGS C30, 0.5 m WIDE"),
            pen.Text(plan.Layer("DETAILS-TEXT", 7), 6.6, 0.9, 0.2, "CABLE ENTRY PIT 0.8 x 0.8 m"),
        ]);
        Console.WriteLine($"  storage: {containers} containers, {skids} skids");
        return plan.Document;
    }
}
