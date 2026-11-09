using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.IO;
using ACadSharp.Tables;
using ACadSharp.Types.Units;
using CSMath;
using Xunit;

namespace Plantline.Cad.Tests;

public sealed class CadReaderTests
{
    [Theory]
    [InlineData("solar-plant.dwg")]
    [InlineData("solar-plant.dxf")]
    public void ReadsTheSolarSample_InDwgAndDxf(string file)
    {
        var drawing = CadReader.Read(File.ReadAllBytes(SamplePath(file)));

        Assert.Equal("m", drawing.Units);
        var tables = drawing.Model.References.Select(reference => drawing.Blocks[reference.Block].Name).Where(name => name.StartsWith("PV_TABLE_2P")).ToList();
        Assert.Equal(292, tables.Count(name => name == "PV_TABLE_2P28"));
        Assert.Equal(24, tables.Count(name => name == "PV_TABLE_2P14"));
        Assert.Equal(56, drawing.Blocks.Single(block => block.Name == "PV_TABLE_2P28").References.Count(reference => drawing.Blocks[reference.Block].Name == "PV_MODULE_590W"));
        Assert.Equal(608, Shapes(drawing.Model).Count(shape => drawing.Layers[shape.Layer] == "PV-STRINGS"));
        var inverters = drawing.Model.References.Where(reference => drawing.Layers[reference.Layer] == "PV-INVERTERS").Select(reference => reference.Attributes!["ID"]).Order();
        Assert.Equal(Enumerable.Range(1, 25).Select(i => $"INV-{i:00}"), inverters);
        Assert.Contains("PV-TABLES", drawing.Layers);
        Assert.False(drawing.Truncated);
    }

    [Fact]
    public void KeepsNestedBlocks_WithTheTransformOfEachReference()
    {
        var document = new CadDocument();
        var inner = Block(document, "INNER", new Line(new XYZ(0, 0, 0), new XYZ(1, 0, 0)));
        var outer = Block(document, "OUTER", new Insert(inner) { InsertPoint = new XYZ(10, 0, 0) });
        document.Entities.Add(new Insert(outer) { InsertPoint = new XYZ(100, 100, 0), Rotation = Math.PI / 2 });

        var drawing = CadReader.Read(Dxf(document));

        Assert.Equal(["OUTER", "INNER"], drawing.Blocks.Select(block => block.Name));
        var toModel = Assert.Single(drawing.Model.References).Transform;
        var toOuter = Assert.Single(drawing.Blocks[0].References).Transform;
        var line = Assert.Single(Shapes(drawing.Blocks[1]));
        var start = Apply(toModel, Apply(toOuter, Point(drawing, line.First)));
        var end = Apply(toModel, Apply(toOuter, Point(drawing, line.First + 1)));
        AssertNear((100, 110), start);
        AssertNear((100, 111), end);
        Assert.Empty(drawing.Model.Shapes);
    }

    [Fact]
    public void PlacesABlock_ByItsBasePoint()
    {
        var document = new CadDocument();
        var block = Block(document, "BASED", new Line(new XYZ(5, 5, 0), new XYZ(6, 5, 0)));
        block.BlockEntity.BasePoint = new XYZ(5, 5, 0);
        document.Entities.Add(new Insert(block) { InsertPoint = new XYZ(20, 30, 0), XScale = 2, YScale = 2 });

        var drawing = CadReader.Read(Dxf(document));

        var transform = Assert.Single(drawing.Model.References).Transform;
        var line = Assert.Single(Shapes(drawing.Blocks[0]));
        AssertNear((20, 30), Apply(transform, Point(drawing, line.First)));
        AssertNear((22, 30), Apply(transform, Point(drawing, line.First + 1)));
    }

    [Fact]
    public void KeepsEachBlockOnce_HoweverOftenItIsUsed()
    {
        var drawing = CadReader.Read(Dxf(LargePlant(fields: 9)));

        Assert.Equal(["FIELD", "ROW", "TABLE", "MODULE"], drawing.Blocks.Select(block => block.Name));
        Assert.Equal([9, 8, 10, 28, 0], new[] { drawing.Model }.Concat(drawing.Blocks).Select(block => block.References.Count));
        Assert.True(drawing.PointCount < 100, $"{drawing.PointCount} points");
        Assert.True(CadReader.ToJson(drawing).Length < 10_000);
    }

    [Fact]
    public void ReadsDeepNesting_WithoutExpandingIt()
    {
        var document = new CadDocument();
        var block = Block(document, "LEVEL1000", new Line(new XYZ(0, 0, 0), new XYZ(1, 1, 0)));
        for (var level = 999; level >= 0; level--)
        {
            block = Block(document, $"LEVEL{level}", new Insert(block));
        }

        document.Entities.Add(new Insert(block));

        var drawing = CadReader.Read(Dxf(document));

        Assert.Equal(1001, drawing.Blocks.Count);
        Assert.Single(Shapes(drawing.Blocks[^1]));
        Assert.False(drawing.Truncated);
    }

    [Fact]
    public void ReadsABlockThatContainsItself_Once()
    {
        // ACadSharp cannot build such a block in memory (it clones forever), so the file is written with another
        // block's name in the reference and then edited, as a hostile file would be
        var document = new CadDocument();
        var other = Block(document, "OTHER", new Line(new XYZ(0, 0, 0), new XYZ(1, 0, 0)));
        var self = Block(document, "SELF", new Insert(other) { InsertPoint = new XYZ(2, 0, 0) });
        document.Entities.Add(new Insert(self));
        var text = Encoding.UTF8.GetString(Dxf(document));
        var edited = Regex.Replace(text, @"(AcDbBlockReference\r?\n  2\r?\n)OTHER(\r?\n)", "${1}SELF${2}");

        var drawing = CadReader.Read(Encoding.UTF8.GetBytes(edited));

        var selfBlock = Assert.Single(drawing.Blocks);
        Assert.Equal("SELF", selfBlock.Name);
        Assert.Equal(0, Assert.Single(selfBlock.References).Block);
    }

    [Fact]
    public void MakesAnArrayOfCopies_OneReferencePerCopy()
    {
        var document = new CadDocument();
        var block = Block(document, "POST", new Circle { Radius = 0.1 });
        document.Entities.Add(new Insert(block) { InsertPoint = new XYZ(1, 2, 0), ColumnCount = 3, RowCount = 2, ColumnSpacing = 10, RowSpacing = 5 });

        var drawing = CadReader.Read(Dxf(document));

        var origins = drawing.Model.References.Select(reference => (reference.Transform[4], reference.Transform[5])).Order();
        Assert.Equal([(1, 2), (1, 7), (11, 2), (11, 7), (21, 2), (21, 7)], origins);
    }

    [Fact]
    public void TruncatesALargeDrawing_AtTheItemAndPointLimits()
    {
        var document = new CadDocument();
        for (var i = 0; i < 20; i++)
        {
            document.Entities.Add(new Line(new XYZ(i, 0, 0), new XYZ(i, 1, 0)));
        }

        var byItems = CadReader.Read(Dxf(document), maxItems: 5);
        var byPoints = CadReader.Read(Dxf(document), maxPoints: 7);

        Assert.True(byItems.Truncated);
        Assert.Equal(5, Shapes(byItems.Model).Count());
        Assert.True(byPoints.Truncated);
        Assert.Equal(3, Shapes(byPoints.Model).Count());
        Assert.Equal(6, byPoints.PointCount);
    }

    [Fact]
    public void ReadsCurvesAndTheUnit_AndLeavesTextsOut()
    {
        var document = new CadDocument();
        document.Header.InsUnits = UnitsType.Feet;
        document.Entities.Add(new TextEntity { Value = "INV-01", InsertPoint = new XYZ(5, 6, 0), Height = 1 });
        document.Entities.Add(new MText { Value = "Station A", InsertPoint = new XYZ(1, 2, 0), Height = 1 });
        document.Entities.Add(new Circle { Center = new XYZ(0, 0, 0), Radius = 2 });

        var drawing = CadReader.Read(Dxf(document));

        Assert.Equal("ft", drawing.Units);
        var circle = Assert.Single(Shapes(drawing.Model));
        Assert.True(circle.Closed);
        Assert.True(circle.Count >= 20);
        Assert.Equal(circle.Count, drawing.PointCount);
    }

    [Theory]
    [InlineData(new byte[0])]
    [InlineData(new byte[] { 0x41, 0x43, 0x31, 0x30, 0x33, 0x32, 0, 0, 0, 1, 2, 3 })]
    [InlineData(new byte[] { 0x20, 0x20, 0x30, 0x0a, 0x53, 0x45, 0x43 })]
    public void RejectsBytesThatAreNotADrawing(byte[] bytes)
    {
        Assert.Throws<InvalidDataException>(() => CadReader.Read(bytes));
    }

    [Fact]
    public void WritesCamelCaseJson_AndThePointsAsBinary_TheWebAppReads()
    {
        var drawing = CadReader.Read(File.ReadAllBytes(SamplePath("solar-plant.dxf")));

        using var parsed = JsonDocument.Parse(CadReader.ToJson(drawing));
        var root = parsed.RootElement;
        Assert.Equal(["units", "layers", "blocks", "model", "truncated", "pointCount"], root.EnumerateObject().Select(property => property.Name));
        Assert.Equal(["name", "shapes", "references"], root.GetProperty("model").EnumerateObject().Select(property => property.Name));
        var references = root.GetProperty("model").GetProperty("references").EnumerateArray().ToList();
        Assert.Contains(references, reference => reference.EnumerateObject().Select(property => property.Name).SequenceEqual(["block", "layer", "transform", "attributes"]));
        Assert.Contains(references, reference => !reference.TryGetProperty("attributes", out _));

        var bytes = CadReader.PointBytes(drawing);
        Assert.Equal(drawing.PointCount * 16, bytes.Length);
        Assert.Equal(drawing.Points[1], BitConverter.ToDouble(bytes, 8));
    }

    /// <summary>A solar field nested four deep, as real plants are drawn: model, fields, rows, tables, modules.</summary>
    internal static CadDocument LargePlant(int fields)
    {
        var document = new CadDocument { Header = { InsUnits = UnitsType.Meters } };
        var module = Block(document, "MODULE", Rectangle(0, 0, 1.1, 2.3));
        var table = Block(document, "TABLE", Rectangle(-0.1, -0.1, 15.5, 4.8));
        for (var i = 0; i < 28; i++)
        {
            table.Entities.Add(new Insert(module) { InsertPoint = new XYZ(i % 14 * 1.1, i / 14 * 2.35, 0) });
        }

        var row = Block(document, "ROW", new Line(new XYZ(0, -1, 0), new XYZ(160, -1, 0)));
        for (var i = 0; i < 10; i++)
        {
            row.Entities.Add(new Insert(table) { InsertPoint = new XYZ(i * 16, 0, 0) });
        }

        var field = Block(document, "FIELD", Rectangle(-5, -5, 165, 85));
        for (var i = 0; i < 8; i++)
        {
            field.Entities.Add(new Insert(row) { InsertPoint = new XYZ(0, i * 10, 0) });
        }

        for (var i = 0; i < fields; i++)
        {
            document.Entities.Add(new Insert(field) { InsertPoint = new XYZ(470_000 + i % 10 * 180, 4_330_000 + i / 10 * 100, 0), Rotation = 0.01 * i });
        }

        return document;
    }

    private static IEnumerable<(int Layer, bool Closed, int First, int Count)> Shapes(Block block)
    {
        for (var i = 0; i < block.Shapes.Count; i += 4)
        {
            yield return (block.Shapes[i], block.Shapes[i + 1] == 1, block.Shapes[i + 2], block.Shapes[i + 3]);
        }
    }

    private static (double X, double Y) Point(Drawing drawing, int index) => (drawing.Points[index * 2], drawing.Points[index * 2 + 1]);

    private static (double X, double Y) Apply(double[] t, (double X, double Y) p) => (t[0] * p.X + t[2] * p.Y + t[4], t[1] * p.X + t[3] * p.Y + t[5]);

    private static void AssertNear((double X, double Y) expected, (double X, double Y) actual)
    {
        Assert.Equal(expected.X, actual.X, 9);
        Assert.Equal(expected.Y, actual.Y, 9);
    }

    private static LwPolyline Rectangle(double x1, double y1, double x2, double y2) =>
        new([new XY(x1, y1), new XY(x2, y1), new XY(x2, y2), new XY(x1, y2)]) { IsClosed = true };

    private static BlockRecord Block(CadDocument document, string name, Entity entity)
    {
        var block = new BlockRecord(name);
        block.Entities.Add(entity);
        document.BlockRecords.Add(block);
        return block;
    }

    private static byte[] Dxf(CadDocument document)
    {
        using var stream = new MemoryStream();
        using (var writer = new DxfWriter(stream, document, false))
        {
            writer.Write();
        }

        return stream.ToArray();
    }

    private static string SamplePath(string file)
    {
        var folder = new DirectoryInfo(AppContext.BaseDirectory);
        while (folder is not null && !Directory.Exists(Path.Combine(folder.FullName, "web", "public", "samples")))
        {
            folder = folder.Parent;
        }

        return Path.Combine(folder?.FullName ?? throw new DirectoryNotFoundException("web/public/samples"), "web", "public", "samples", file);
    }
}
