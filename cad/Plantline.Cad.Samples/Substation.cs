using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.Tables;
using ACadSharp.Types.Units;

namespace Plantline.Cad.Samples;

/// <summary>
/// A 154/33 kV air-insulated substation drawn in millimetres, as general arrangements are, in site coordinates from
/// the south-west property corner: a double busbar with two line bays, two transformer bays, a bus coupler and a
/// reserved bay, each bay's equipment on 3 m phase spacing; two 100 MVA transformers on oil pits; the control building
/// with its 16-panel 33 kV switchgear (shown in a front view); cable trenches, roads, lightning masts, the fence and
/// the incoming lines' terminal towers.
/// </summary>
internal static class Substation
{
    private static readonly double[] BusbarA = [108, 111, 114];
    private static readonly double[] BusbarB = [96, 99, 102];
    private const double YardWest = 17, YardEast = 93;

    private static readonly (string Id, string Function, string Kind)[] Panels =
    [
        ("J01", "INCOMER TR1", "CB"), ("J02", "VT BUS A", "VT"), ("J03", "FEEDER 1", "CB"), ("J04", "FEEDER 2", "CB"),
        ("J05", "FEEDER 3", "CB"), ("J06", "FEEDER 4", "CB"), ("J07", "AUX TR1", "CB"), ("J08", "CAP BANK", "CB"),
        ("J09", "BUS SECTION", "CB"), ("J10", "BUS RISER", "DS"), ("J11", "VT BUS B", "VT"), ("J12", "FEEDER 5", "CB"),
        ("J13", "FEEDER 6", "CB"), ("J14", "FEEDER 7", "CB"), ("J15", "FEEDER 8", "CB"), ("J16", "INCOMER TR2", "CB"),
    ];

    public static CadDocument Draw()
    {
        var plan = new Plan(UnitsType.Millimeters);
        var pen = new Pen(1000);

        // Property, fence and gate, yard gravel
        plan.Add(pen.Rect(plan.Layer("PROPERTY-BOUNDARY", 30), 0, 0, 150, 165));
        var fence = plan.Layer("FENCE", 3);
        plan.Add(pen.Poly(fence, false, 70, 2, 148, 2, 148, 163, 2, 163, 2, 2, 60, 2));
        plan.Add(pen.Put(plan.Block("GATE_SLIDING_10M", [pen.Line(null, -5, 0, 5, 0), pen.Line(null, -5, -0.3, 5, -0.3)]), plan.Layer("FENCE-GATE", 3), 65, 2));
        plan.Add(pen.Rect(plan.Layer("YARD-GRAVEL", 252), 13, 58, 97, 150));

        // Busbars: two systems of three tubular phases across the yard
        var busbar = plan.Layer("BUSBAR-154KV", 1);
        foreach (var y in BusbarA.Concat(BusbarB))
        {
            plan.Add(pen.Line(busbar, YardWest, y, YardEast, y));
        }

        var labels = plan.Layer("TEXT-EQUIPMENT", 7);
        plan.Add(pen.Text(labels, YardWest - 3.5, 110, 1.4, "BB A", 90, centred: true));
        plan.Add(pen.Text(labels, YardWest - 3.5, 98, 1.4, "BB B", 90, centred: true));

        // Equipment blocks: three phases side by side, 3 m apart
        var hv = plan.Layer("HV-EQUIPMENT-154KV", 4);
        BlockRecord Three(string name, Func<double, IEnumerable<Entity>> phase) => plan.Block(name, new[] { -3.0, 0, 3 }.SelectMany(phase));
        var breaker = Three("CB_SF6_170KV_3150A", x => [pen.Circle(null, x, 0, 0.45), pen.Box(null, x, -1.1, 0.9, 0.6)]);
        var disconnector = Three("DS_170KV_CENTRE-BREAK", x => [pen.Box(null, x, -1.4, 0.6, 0.6), pen.Box(null, x, 1.4, 0.6, 0.6), pen.Line(null, x, -1.1, x + 0.35, 1.1)]);
        var earthed = Three("DS-ES_170KV_CENTRE-BREAK", x => [pen.Box(null, x, -1.4, 0.6, 0.6), pen.Box(null, x, 1.4, 0.6, 0.6), pen.Line(null, x, -1.1, x + 0.35, 1.1), pen.Line(null, x + 0.5, -1.4, x + 1.1, -1.4)]);
        var currentTransformer = Three("CT_170KV", x => [pen.Circle(null, x, 0, 0.35), pen.Circle(null, x, 0, 0.15)]);
        var voltageTransformer = Three("CVT_170KV", x => [pen.Circle(null, x, 0, 0.3), pen.Line(null, x - 0.3, 0, x + 0.3, 0)]);
        var arrester = Three("SA_154KV_10KA", x => [pen.Circle(null, x, 0, 0.25), pen.Line(null, x, -0.25, x, -0.6)]);
        var gantry = plan.Block("GANTRY_154KV_12M", [pen.Rect(null, -6, -0.3, 6, 0.3), pen.Box(null, -6, 0, 0.9, 0.9), pen.Box(null, 6, 0, 0.9, 0.9)]);
        var conductors = plan.Layer("CONDUCTORS-154KV", 1);
        Insert Place(BlockRecord block, double x, double y, string? id = null, double degrees = 0)
        {
            var insert = pen.Put(block, hv, x, y, degrees);
            return id is null ? insert : pen.Tag(insert, "ID", id, x + 4.6, y - 0.4, 0.9);
        }

        void Conductors(double x, double from, double to)
        {
            foreach (var dx in new[] { -3.0, 0, 3 })
            {
                plan.Add(pen.Line(conductors, x + dx, from, x + dx, to));
            }
        }

        var bays = new (string Name, double X, string Kind)[] { ("H1", 25, "line"), ("H2", 37, "line"), ("TR1", 49, "transformer"), ("BC", 61, "coupler"), ("TR2", 73, "transformer") };
        foreach (var (name, x, kind) in bays)
        {
            plan.Add(Place(disconnector, x, BusbarA[1], $"{name}-Q1"));
            plan.Add(Place(disconnector, x, BusbarB[1], $"{name}-Q2"));
            plan.Add(pen.Text(labels, x, kind == "transformer" ? 57 : 150, 1.6, name, 0, centred: true));
            if (kind is "line" or "coupler")
            {
                plan.Add(Place(breaker, x, 121, $"{name}-Q0"));
                plan.Add(Place(currentTransformer, x, 126));
                Conductors(x, BusbarB[0] - 1.5, kind == "line" ? 144 : 127);
            }

            if (kind == "line")
            {
                plan.Add(Place(earthed, x, 131, $"{name}-Q9"));
                plan.Add(Place(voltageTransformer, x, 136));
                plan.Add(Place(arrester, x, 140));
                plan.Add(Place(gantry, x, 144));
            }

            if (kind == "transformer")
            {
                plan.Add(Place(breaker, x, 88, $"{name}-Q0"));
                plan.Add(Place(currentTransformer, x, 83));
                plan.Add(Place(arrester, x, 77));
                Conductors(x, 72, BusbarA[2] + 1.5);
            }
        }

        foreach (var x in new[] { YardWest, YardEast })
        {
            plan.Add(Place(gantry, x, (BusbarA[1] + BusbarB[1]) / 2, null, 90));
        }

        plan.Add(pen.Rect(plan.Layer("FUTURE-BAY", 252), 80, 94, 90, 146));
        plan.Add(pen.Text(plan.Layer("FUTURE-BAY", 252), 85, 130, 1.4, "RESERVED LINE BAY", 90, centred: true));

        // Power transformers on oil pits, their neutral earthing resistors, 33 kV cables to the building
        var transformers = plan.Layer("POWER-TRANSFORMERS", 2);
        var transformer = plan.Block("TR_154-33KV_100MVA",
        [
            pen.Box(null, 0, 0, 9, 4.5),
            pen.Rect(null, -7, -5, 7, 5),
            pen.Rect(null, -4.5, 2.6, 4.5, 3.6),
            pen.Rect(null, -4.5, -3.8, 4.5, -2.4),
            ..new[] { -3.0, 0, 3 }.Select(x => (Entity)pen.Circle(null, x, 1.6, 0.35)),
            ..new[] { -1.5, 0, 1.5 }.Select(x => (Entity)pen.Circle(null, x, -1.6, 0.2)),
        ]);
        var resistor = plan.Block("NER_33KV_800A", [pen.Box(null, 0, 0, 2.4, 1.8), pen.Line(null, -1.2, 0, 1.2, 0)]);
        var mv = plan.Layer("MV-CABLE-33KV", 6);
        foreach (var (id, x) in new[] { ("TR1", 49.0), ("TR2", 73.0) })
        {
            var insert = pen.Put(transformer, transformers, x, 66);
            pen.Tag(insert, "ID", id, x + 7.5, 68, 1.2);
            pen.Tag(insert, "RATING", "154/33 kV 100 MVA YNd11", x + 7.5, 66.3, 0.8);
            plan.Add(insert);
            plan.Add(pen.Put(resistor, plan.Layer("NEUTRAL-EARTHING", 4), x + 9.5, 60));
            plan.Add(pen.Poly(mv, false, x, 61, x, 47, x < 60 ? 40 : 56, 47, x < 60 ? 40 : 56, 34));
        }

        // The control building: switchgear room with the 33 kV panels, control, battery and office rooms
        plan.Add(pen.Rect(plan.Layer("CONTROL-BUILDING", 2), 30, 16, 76, 34));
        var rooms = plan.Layer("ROOM-PARTITIONS", 2);
        plan.Add(pen.Line(rooms, 60, 16, 60, 34));
        plan.Add(pen.Line(rooms, 60, 26, 76, 26));
        plan.Add(pen.Line(rooms, 68, 26, 68, 34));
        foreach (var (text, x, y) in new[] { ("33 kV SWITCHGEAR ROOM", 34.0, 20.0), ("CONTROL ROOM", 62.0, 20.0), ("BATTERY", 61, 29), ("OFFICE", 69, 29) })
        {
            plan.Add(pen.Text(labels, x, y, 0.9, text));
        }

        var switchgear = plan.Layer("SWITCHGEAR-33KV", 1);
        var panelBlocks = new Dictionary<string, BlockRecord>
        {
            ["CB"] = plan.Block("CB_36KV_CUBICLE", [pen.Rect(null, 0, 0, 0.8, 1.6), pen.Circle(null, 0.4, 0.8, 0.2)]),
            ["VT"] = plan.Block("VT_36KV_CUBICLE", [pen.Rect(null, 0, 0, 0.8, 1.6), pen.Line(null, 0.1, 0.8, 0.7, 0.8)]),
            ["DS"] = plan.Block("DS_36KV_BUSRISER", [pen.Rect(null, 0, 0, 0.8, 1.6), pen.Line(null, 0.2, 0.3, 0.6, 1.3)]),
        };
        for (var i = 0; i < Panels.Length; i++)
        {
            var (id, function, kind) = Panels[i];
            var x = 33 + i * 0.8 + (i >= 8 ? 1.2 : 0);
            plan.Add(pen.Tag(pen.Put(panelBlocks[kind], switchgear, x, 31.5), "ID", id, x + 0.15, 30.8, 0.3));
        }

        // Feeders out to the west, auxiliary transformers and the capacitor bank, guard house and parking
        var feeders = plan.Layer("MV-FEEDER-CABLES-33KV", 6);
        var feederPanels = new[] { 2, 3, 4, 5, 11, 12, 13, 14 };
        for (var i = 0; i < feederPanels.Length; i++)
        {
            var x = 33 + feederPanels[i] * 0.8 + (feederPanels[i] >= 8 ? 1.2 : 0) + 0.4;
            plan.Add(pen.Poly(feeders, false, x, 33.1, x, 36 + i * 0.6, -5, 36 + i * 0.6));
        }

        plan.Add(pen.Text(labels, -4.5, 41.5, 1.2, "8 x 33 kV FEEDERS"));
        var aux = plan.Block("AUX_TR_33-0.4KV_250KVA", [pen.Box(null, 0, 0, 2, 1.5), pen.Box(null, 0, 0, 3.2, 2.6)]);
        var auxLayer = plan.Layer("AUX-TRANSFORMERS", 2);
        plan.Add(pen.Tag(pen.Put(aux, auxLayer, 82, 22), "ID", "AUX TR1", 84, 22, 0.8));
        plan.Add(pen.Tag(pen.Put(aux, auxLayer, 82, 28), "ID", "AUX TR2", 84, 28, 0.8));
        var capacitor = plan.Layer("CAPACITOR-BANK", 4);
        plan.Add(pen.Rect(capacitor, 110, 60, 132, 76));
        plan.Add(pen.Put(plan.Block("CAPACITOR_BANK_33KV_10MVAR", [.. Enumerable.Range(0, 12).Select(i => (Entity)pen.Box(null, -7.5 + i % 6 * 3, i < 6 ? -2 : 2, 1.6, 2.4))]), capacitor, 121, 68));
        plan.Add(pen.Text(capacitor, 110, 77.5, 1.2, "CAPACITOR BANK 33 kV 10 Mvar"));
        plan.Add(pen.Rect(plan.Layer("GUARD-HOUSE-BUILDING", 2), 76, 6, 80, 10));
        var parking = plan.Layer("PARKING", 8);
        plan.Add(pen.Rect(parking, 8, 16, 26, 30));
        for (var x = 10.5; x < 26; x += 2.5)
        {
            plan.Add(pen.Line(parking, x, 16, x, 21));
        }

        // Roads, cable trenches, lightning masts, lighting
        var road = plan.Layer("ROAD-CL", 41);
        var edge = plan.Layer("ROAD-EDGE", 41);
        foreach (var line in new List<List<P>> { new() { new(65, -15), new(65, 44) }, new() { new(10, 44), new(140, 44) }, new() { new(20, 52), new(104, 52) }, new() { new(104, 44), new(104, 150) } })
        {
            plan.Add(pen.Poly(road, false, line));
            foreach (var side in new[] { -2.5, 2.5 })
            {
                plan.Add(pen.Poly(edge, false, Geo.Offset(line, side)));
            }
        }

        var trench = plan.Layer("CABLE-TRENCH", 8);
        plan.Add(pen.Rect(trench, 17, 92.5, 100.5, 93.5));
        plan.Add(pen.Rect(trench, 99.5, 34, 100.5, 92.5));
        plan.Add(pen.Rect(trench, 76, 33.5, 99.5, 34.5));
        foreach (var (_, x, kind) in bays)
        {
            plan.Add(kind == "transformer" ? pen.Rect(trench, x + 5.2, 72, x + 6.2, 92.5) : pen.Rect(trench, x + 5.2, 93.5, x + 6.2, 141));
        }

        var mastLayer = plan.Layer("LIGHTNING-PROTECTION", 4);
        var mast = plan.Block("LIGHTNING_MAST_25M", [pen.Circle(null, 0, 0, 0.5), pen.Line(null, -0.8, 0, 0.8, 0)]);
        foreach (var (x, y) in new[] { (14.0, 59.0), (96.0, 59.0), (14.0, 149.0), (96.0, 149.0), (55.0, 147.0) })
        {
            plan.Add(pen.Put(mast, mastLayer, x, y));
        }

        var lighting = plan.Layer("LIGHTING", 50);
        var pole = plan.Block("LIGHTING_POLE_8M", [pen.Circle(null, 0, 0, 0.2), pen.Arc(null, 0, 0, 0.9, 45, 135)]);
        for (var x = 15.0; x <= 135; x += 20)
        {
            plan.Add(pen.Put(pole, lighting, x, 47.5));
        }

        // The incoming 154 kV lines and their terminal towers north of the property
        var ohl = plan.Layer("OHL-154KV-INCOMING", 6);
        var tower = plan.Block("TERMINAL_TOWER_154KV", [pen.Box(null, 0, 0, 10, 10), pen.Line(null, -5, -5, 5, 5), pen.Line(null, -5, 5, 5, -5), pen.Line(null, -7, 0, 7, 0)]);
        foreach (var (x, tx, ty, name) in new[] { (25.0, 10.0, 195.0, "TO SS-A"), (37.0, 52.0, 200.0, "TO SS-B") })
        {
            foreach (var dx in new[] { -3.0, 0, 3 })
            {
                plan.Add(pen.Line(ohl, x + dx, 144, tx + dx, ty));
            }

            plan.Add(pen.Tag(pen.Put(tower, ohl, tx, ty), "ID", $"154 kV LINE {name}", tx + 7, ty + 2, 1.4));
        }

        // The sheet
        var sheet = new Sheet(plan, pen, "A1", 500, new P(-50, -40));
        sheet.Frame("SAMPLE 154/33 kV SUBSTATION", "SUBSTATION GENERAL ARRANGEMENT, 2 x 100 MVA", "SS-EL-GA-001", "2026-11-09");
        sheet.Grid(20, (x, y) => ($"X {x * 1000:0}", $"Y {y * 1000:0}"));
        var legend = sheet.Legend(
        [
            new("Busbar 154 kV, tubular", busbar),
            new("154 kV equipment: CB, DS, CT, CVT, SA", hv, "box"),
            new("Power transformer 154/33 kV", transformers, "box"),
            new("Auxiliary transformer 33/0.4 kV", auxLayer, "box"),
            new("33 kV switchgear panels", switchgear, "box"),
            new("Control building, guard house", plan.Layer("CONTROL-BUILDING", 2), "box"),
            new("33 kV cables, feeders", mv),
            new("Cable trench 1.0 m", trench, "box"),
            new("Road 5 m", road),
            new("Fence 2.5 m, gate", fence),
            new("Lightning mast 25 m", mastLayer, "circle"),
            new("154 kV incoming line", ohl, "dash"),
        ]);
        sheet.Notes(
        [
            "Drawing unit: millimetre. Site coordinates from the south-west property corner (X east, Y north); north is true north.",
            "154 kV double busbar: 2 line bays, 2 transformer bays and the bus coupler; one bay reserved. Phase spacing 3.0 m, bay width 12.0 m.",
            "Power transformers 2 x 100 MVA, 154/33 kV, YNd11, ONAN/ONAF, on oil pits; neutral earthing resistors 800 A on the 33 kV side.",
            "33 kV metal-clad switchgear, 16 panels in two sections (detail A); 8 outgoing feeders by cable to the west.",
            "Equipment designations: Q0 breaker, Q1/Q2 busbar disconnectors, Q9 line disconnector with earthing switch.",
            "Cable trenches 1.0 m wide; lightning masts and earthing grid as the earthing study.",
        ], legend + 6);
        sheet.Detail("DETAIL_A_33KV_SWITCHGEAR_FRONT", "A  33 kV SWITCHGEAR, FRONT VIEW", 50, 430, 95, SwitchgearFront(pen, plan));
        sheet.Detail("DETAIL_B_TRENCH_SECTION", "B  CABLE TRENCH, SECTION", 20, 470, 220,
        [
            pen.Poly(plan.Layer("DETAILS", 7), false, -0.65, 0.1, -0.65, -1.0, 0.65, -1.0, 0.65, 0.1),
            pen.Poly(plan.Layer("DETAILS", 7), false, -0.5, 0.1, -0.5, -0.85, 0.5, -0.85, 0.5, 0.1),
            pen.Rect(plan.Layer("DETAILS", 7), -0.65, 0.1, 0.65, 0.18),
            pen.Line(plan.Layer("DETAILS", 7), -0.5, -0.35, -0.1, -0.35),
            pen.Line(plan.Layer("DETAILS", 7), -0.5, -0.6, -0.1, -0.6),
            pen.Text(plan.Layer("DETAILS-TEXT", 7), 0.8, 0.1, 0.06, "PRECAST COVER SLAB"),
            pen.Text(plan.Layer("DETAILS-TEXT", 7), 0.8, -0.4, 0.06, "CABLE BRACKETS AT 0.25 m"),
            pen.Text(plan.Layer("DETAILS-TEXT", 7), 0.8, -0.9, 0.06, "C25 CONCRETE, 1.0 m WIDE"),
        ]);
        Console.WriteLine("  substation: 5 bays, 2 transformers, 16 panels");
        return plan.Document;
    }

    // In metres; the pen writes them in millimetres
    private static List<Entity> SwitchgearFront(Pen pen, Plan plan)
    {
        var line = plan.Layer("DETAILS", 7);
        var text = plan.Layer("DETAILS-TEXT", 7);
        var entities = new List<Entity> { pen.Line(line, -0.5, 0, 14.5, 0) };
        for (var i = 0; i < Panels.Length; i++)
        {
            var (id, function, _) = Panels[i];
            var x = i * 0.8 + (i >= 8 ? 1.2 : 0);
            entities.Add(pen.Rect(line, x, 0, x + 0.8, 2.3));
            entities.Add(pen.Rect(line, x + 0.1, 0.15, x + 0.7, 1.35));
            entities.Add(pen.Rect(line, x + 0.15, 1.6, x + 0.65, 2.1));
            entities.Add(pen.Text(text, x + 0.1, 2.45, 0.1, id));
            entities.Add(pen.Text(text, x + 0.45, 1.45, 0.06, function, 90));
        }

        entities.Add(pen.Text(text, 0, -0.3, 0.12, "SECTION 1 (BUS A)"));
        entities.Add(pen.Text(text, 7.6, -0.3, 0.12, "SECTION 2 (BUS B)"));
        return entities;
    }
}
