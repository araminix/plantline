using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.Types.Units;

namespace Plantline.Cad.Samples;

/// <summary>
/// A real plant's size, in UTM coordinates, for CI's reading limits: 17,920 modules in tables, rows and fields (nested
/// four deep), 60 detail blocks of 800 lines and 400 circles each (equipment drawings, title blocks) and 20,000 lines in
/// model space: about 700,000 points, like the real plant drawing these limits were measured on.
/// </summary>
internal static class Large
{
    public static CadDocument Draw()
    {
        var plan = new Plan(UnitsType.Meters);
        var pen = new Pen(1);
        var modules = plan.Layer("PV-MODULES", 8);
        var tables = plan.Layer("PV-TABLES", 5);
        var module = plan.Block("MODULE", [pen.Box(null, 0, 0, 1.1, 2.3), pen.Line(modules, -0.55, 0, 0.55, 0)]);
        var table = plan.Block("PV_TABLE_2x14", [pen.Box(null, 0, 0, 15.6, 4.8), .. Enumerable.Range(0, 28).Select(i => pen.Put(module, modules, -7.15 + i % 14 * 1.1, -1.2 + i / 14 * 2.4))]);
        var row = plan.Block("PV_ROW", Enumerable.Range(0, 10).Select(i => (Entity)pen.Put(table, tables, i * 16, 0)));
        var inverter = plan.Block("INVERTER_3MW", [pen.Box(null, 0, 0, 6, 2.5)]);
        var field = plan.Block("PV_FIELD",
        [
            pen.Rect(plan.Layer("FENCE", 8), -12, -8, 160, 80),
            .. Enumerable.Range(0, 8).Select(i => pen.Put(row, tables, 0, i * 9)),
            pen.Put(inverter, plan.Layer("INVERTERS", 1), 150, 74),
        ]);
        const double east = 470_000, north = 4_330_000;
        for (var i = 0; i < 8; i++)
        {
            var (x, y) = (east + i % 4 * 180, north + i / 4 * 100);
            plan.Add(pen.Tag(pen.Put(field, plan.Layer("PV-FIELDS", 5), x, y), "ID", $"F-{i + 1:00}", x, y, 1));
        }

        var details = plan.Layer("DETAILS", 7);
        for (var d = 0; d < 60; d++)
        {
            var detail = plan.Block($"DETAIL_{d:00}", Enumerable.Range(0, 1200).Select(i => i % 3 == 2
                ? (Entity)pen.Circle(details, i % 40, i / 40, 0.3)
                : pen.Line(details, i % 40, i / 40, i % 40 + 0.8, i / 40 + 0.5)));
            plan.Add(pen.Put(detail, details, east - 200 + d % 10 * 45, north - 200 + d / 10 * 35));
        }

        var cables = plan.Layer("CABLES", 6);
        for (var i = 0; i < 20_000; i++)
        {
            var (x, y) = (east + i % 200 * 3.6, north - 300 + i / 200 * 0.9);
            plan.Add(pen.Line(cables, x, y, x + 3, y + 0.4));
        }

        return plan.Document;
    }
}
