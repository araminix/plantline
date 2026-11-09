using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.IO;
using ACadSharp.Tables;
using ACadSharp.Types.Units;
using CSMath;

// Writes the made-up sample drawings of the web app (web/public/samples), one per plant type, in metres.
// Run: dotnet run --project cad/Plantline.Cad.Samples -- web/public/samples
// With --large, writes only large-plant.dwg, a drawing the size of a real plant for CI's reading limits (not committed):
// dotnet run --project cad/Plantline.Cad.Samples -- --large <folder>
if (args is ["--large", var folder])
{
    Directory.CreateDirectory(folder);
    Save(Large(), folder, "large-plant", dwg: true, dxf: false);
    return;
}

var output = args.Length > 0 ? args[0] : "samples";
Directory.CreateDirectory(output);

Save(Solar(), output, "solar-plant", dwg: true);
Save(Wind(), output, "wind-farm");
Save(Storage(), output, "battery-storage");
Save(Hydro(), output, "hydro-plant");
Save(Substation(), output, "substation");
Save(Transmission(), output, "transmission-line");

// A 1.2 MWp solar plant in UTM zone 36N coordinates: 4 inverter blocks of 10 tables of 56 modules, 2 strings per table.
static CadDocument Solar()
{
    var (document, add) = New();
    var tables = Layer(document, "PV-TABLES", 5);
    var strings = Layer(document, "PV-STRINGS", 3);
    var inverters = Layer(document, "INVERTERS", 1);
    var cables = Layer(document, "CABLES", 6);
    var fence = Layer(document, "FENCE", 8);
    // A table holds its modules, 2 rows of 28, as module blocks named after their power
    var module = Block(document, "PV_MODULE_550W", 0.68, 1.9);
    var modules = Layer(document, "PV-MODULES", 4);
    var table = Block(
        document,
        "PV_TABLE_2x28",
        20,
        4,
        Enumerable.Range(0, 56).Select(i => (Entity)new Insert(module) { InsertPoint = new XYZ(-10 + 0.357 + i % 28 * 0.714, i < 28 ? -1 : 1, 0), Layer = modules }).ToArray());
    var inverter = Block(document, "INVERTER_250KW", 2, 1);
    var station = Block(document, "TRANSFORMER_STATION", 6, 3);
    const double east = 470_000, north = 4_330_000;
    for (var group = 0; group < 4; group++)
    {
        var x0 = east + group % 2 * 120;
        var y0 = north + group / 2 * 60;
        for (var i = 0; i < 10; i++)
        {
            var x = x0 + i % 5 * 22;
            var y = y0 + i / 5 * 8;
            add(Put(table, tables, x, y));
            add(Line(strings, x - 9, y - 1, x + 9, y - 1));
            add(Line(strings, x - 9, y + 1, x + 9, y + 1));
        }

        add(Put(inverter, inverters, x0 + 44, y0 + 20, $"INV-{group + 1:00}"));
        add(Line(cables, x0 + 44, y0 + 20, east + 100, north + 50));
    }

    add(Put(station, Layer(document, "STATION", 2), east + 100, north + 50, "TS-01"));
    add(Rectangle(fence, east - 20, north - 15, east + 240, north + 90));
    return document;
}

static CadDocument Wind()
{
    var (document, add) = New();
    var turbines = Layer(document, "WTG", 1);
    var cables = Layer(document, "CABLES", 6);
    var roads = Layer(document, "ROADS", 8);
    var turbine = Block(document, "WTG_4MW", 0, 0, new Circle { Radius = 20 });
    var substation = Block(document, "SUBSTATION_33KV", 40, 30);
    for (var i = 0; i < 8; i++)
    {
        var x = i * 450.0;
        var y = i % 2 * 300.0;
        add(Put(turbine, turbines, x, y, $"WTG-{i + 1:00}"));
        add(Line(cables, x, y, 1600, -500));
        add(Line(roads, x, y - 60, x + 450, (i + 1) % 2 * 300.0 - 60));
    }

    add(Put(substation, Layer(document, "SUBSTATION", 2), 1600, -500, "SS-01"));
    return document;
}

static CadDocument Storage()
{
    var (document, add) = New();
    var batteries = Layer(document, "BESS", 3);
    var converters = Layer(document, "PCS", 1);
    var transformers = Layer(document, "TRANSFORMERS", 2);
    var battery = Block(document, "BESS_CONTAINER_40FT", 12, 2.5);
    var pcs = Block(document, "PCS_2500KW", 6, 2.5);
    var transformer = Block(document, "TRAFO_33KV", 4, 3);
    for (var i = 0; i < 12; i++)
    {
        add(Put(battery, batteries, i % 6 * 16.0, i / 6 * 20.0, $"BESS-{i + 1:00}"));
    }

    for (var i = 0; i < 6; i++)
    {
        add(Put(pcs, converters, i * 16.0, 10, $"PCS-{i + 1:00}"));
    }

    for (var i = 0; i < 3; i++)
    {
        add(Put(transformer, transformers, i * 32.0 + 8, 40, $"TR-{i + 1}"));
    }

    add(Rectangle(Layer(document, "FENCE", 8), -15, -10, 100, 55));
    add(Line(Layer(document, "CABLES", 6), 0, 10, 72, 40));
    return document;
}

static CadDocument Hydro()
{
    var (document, add) = New();
    var unit = Block(document, "GENERATOR_UNIT_15MW", 8, 8, new Circle { Radius = 3 });
    var transformer = Block(document, "TRAFO_154KV", 6, 4);
    var generators = Layer(document, "UNITS", 1);
    for (var i = 0; i < 3; i++)
    {
        add(Put(unit, generators, i * 14.0, 0, $"G{i + 1}"));
        add(Put(transformer, Layer(document, "TRANSFORMERS", 2), i * 14.0, 30, $"T{i + 1}"));
    }

    add(Rectangle(Layer(document, "POWERHOUSE-BUILDING", 7), -8, -8, 36, 10));
    add(Line(Layer(document, "ROADS", 8), -40, 50, 60, 50));
    return document;
}

static CadDocument Substation()
{
    var (document, add) = New();
    var transformer = Block(document, "TRAFO_154-33KV", 8, 6);
    var breaker = Block(document, "CB_BAY", 1.5, 1.5);
    var disconnector = Block(document, "DS_BAY", 1, 2);
    var busbars = Layer(document, "BUSBAR", 4);
    add(Line(busbars, 0, 40, 96, 40));
    add(Line(busbars, 0, 10, 96, 10));
    for (var i = 0; i < 2; i++)
    {
        add(Put(transformer, Layer(document, "TRANSFORMERS", 2), 24 + i * 48.0, 25, $"TR{i + 1}"));
    }

    for (var i = 0; i < 8; i++)
    {
        add(Put(breaker, Layer(document, "BREAKERS", 1), 6 + i * 12.0, 46, $"Q{i + 1}"));
        add(Put(disconnector, Layer(document, "DISCONNECTORS", 3), 6 + i * 12.0, 52));
        add(Put(disconnector, Layer(document, "DISCONNECTORS", 3), 6 + i * 12.0, 4));
    }

    add(Rectangle(Layer(document, "CONTROL-BUILDING", 7), 100, 0, 115, 12));
    add(Rectangle(Layer(document, "FENCE", 8), -10, -10, 125, 65));
    return document;
}

static CadDocument Transmission()
{
    var (document, add) = New();
    var tower = Block(document, "TOWER_154KV", 8, 8);
    var substation = Block(document, "SUBSTATION_154KV", 60, 40);
    var route = new List<double>();
    for (var i = 0; i < 15; i++)
    {
        var x = i * 350.0;
        var y = Math.Sin(i / 3.0) * 120;
        route.AddRange([x, y]);
        add(Put(tower, Layer(document, "TOWERS", 1), x, y, $"T{i + 1:00}"));
    }

    add(Polyline(Layer(document, "OHL-154KV", 6), false, [.. route]));
    add(Put(substation, Layer(document, "SUBSTATIONS", 2), -80, 0, "SS-A"));
    add(Put(substation, Layer(document, "SUBSTATIONS", 2), 14 * 350 + 80, Math.Sin(14 / 3.0) * 120, "SS-B"));
    return document;
}

// A real plant's size, in UTM coordinates: 17,920 modules in tables, rows and fields (nested four deep), 60 detail
// blocks of 800 lines and 400 circles each (equipment drawings, title blocks) and 20,000 lines in model space: about
// 700,000 points, like the real plant drawing these limits were measured on.
static CadDocument Large()
{
    var (document, add) = New();
    var module = Block(document, "MODULE", 1.1, 2.3, Line(Layer(document, "PV-MODULES", 8), -0.55, 0, 0.55, 0));
    var table = Block(document, "PV_TABLE_2x14", 15.6, 4.8);
    for (var i = 0; i < 28; i++)
    {
        table.Entities.Add(Put(module, Layer(document, "PV-MODULES", 8), -7.15 + i % 14 * 1.1, -1.2 + i / 14 * 2.4));
    }

    var row = Block(document, "PV_ROW", 0, 0);
    for (var i = 0; i < 10; i++)
    {
        row.Entities.Add(Put(table, Layer(document, "PV-TABLES", 5), i * 16, 0));
    }

    var inverter = Block(document, "INVERTER_3MW", 6, 2.5);
    var field = Block(document, "PV_FIELD", 0, 0, Rectangle(Layer(document, "FENCE", 8), -12, -8, 160, 80));
    for (var i = 0; i < 8; i++)
    {
        field.Entities.Add(Put(row, Layer(document, "PV-TABLES", 5), 0, i * 9));
    }

    field.Entities.Add(Put(inverter, Layer(document, "INVERTERS", 1), 150, 74));
    const double east = 470_000, north = 4_330_000;
    for (var i = 0; i < 8; i++)
    {
        add(Put(field, Layer(document, "PV-FIELDS", 5), east + i % 4 * 180, north + i / 4 * 100, $"F-{i + 1:00}"));
    }

    for (var d = 0; d < 60; d++)
    {
        var detail = Block(document, $"DETAIL_{d:00}", 0, 0);
        for (var i = 0; i < 1200; i++)
        {
            detail.Entities.Add(i % 3 == 2
                ? new Circle { Center = new XYZ(i % 40, i / 40, 0), Radius = 0.3, Layer = Layer(document, "DETAILS", 7) }
                : Line(Layer(document, "DETAILS", 7), i % 40, i / 40, i % 40 + 0.8, i / 40 + 0.5));
        }

        add(Put(detail, Layer(document, "DETAILS", 7), east - 200 + d % 10 * 45, north - 200 + d / 10 * 35));
    }

    var cables = Layer(document, "CABLES", 6);
    for (var i = 0; i < 20_000; i++)
    {
        var (x, y) = (east + i % 200 * 3.6, north - 300 + i / 200 * 0.9);
        add(Line(cables, x, y, x + 3, y + 0.4));
    }

    return document;
}

static (CadDocument Document, Action<Entity> Add) New()
{
    var document = new CadDocument();
    document.Header.InsUnits = UnitsType.Meters;
    return (document, entity => document.Entities.Add(entity));
}

static Layer Layer(CadDocument document, string name, short color)
{
    if (document.Layers.TryGetValue(name, out var existing))
    {
        return existing;
    }

    var layer = new Layer(name) { Color = new Color(color) };
    document.Layers.Add(layer);
    return layer;
}

// A block whose outline is a width x height rectangle centred on its base point, plus any extra entities.
static BlockRecord Block(CadDocument document, string name, double width, double height, params Entity[] extra)
{
    var block = new BlockRecord(name);
    if (width > 0 && height > 0)
    {
        block.Entities.Add(Rectangle(null, -width / 2, -height / 2, width / 2, height / 2));
    }

    foreach (var entity in extra)
    {
        block.Entities.Add(entity);
    }

    document.BlockRecords.Add(block);
    return block;
}

static Insert Put(BlockRecord block, Layer layer, double x, double y, string? id = null)
{
    var insert = new Insert(block) { InsertPoint = new XYZ(x, y, 0), Layer = layer };
    if (id is not null)
    {
        insert.Attributes.Add(new AttributeEntity { Tag = "ID", Value = id, InsertPoint = new XYZ(x, y, 0), Height = 1, Layer = layer });
    }

    return insert;
}

static Line Line(Layer layer, double x1, double y1, double x2, double y2) =>
    new(new XYZ(x1, y1, 0), new XYZ(x2, y2, 0)) { Layer = layer };

static LwPolyline Rectangle(Layer? layer, double x1, double y1, double x2, double y2) =>
    Polyline(layer, true, x1, y1, x2, y1, x2, y2, x1, y2);

static LwPolyline Polyline(Layer? layer, bool closed, params double[] xy)
{
    var vertices = Enumerable.Range(0, xy.Length / 2).Select(i => (IVector)new XY(xy[2 * i], xy[2 * i + 1]));
    var polyline = new LwPolyline(vertices) { IsClosed = closed };
    if (layer is not null)
    {
        polyline.Layer = layer;
    }

    return polyline;
}

static void Save(CadDocument document, string folder, string name, bool dwg = false, bool dxf = true)
{
    if (dxf)
    {
        using var writer = new DxfWriter(Path.Combine(folder, name + ".dxf"), document, false);
        writer.Write();
    }

    if (dwg)
    {
        using var writer = new DwgWriter(Path.Combine(folder, name + ".dwg"), document);
        writer.Write();
    }

    Console.WriteLine($"{name}: {document.Entities.Count} entities");
}
