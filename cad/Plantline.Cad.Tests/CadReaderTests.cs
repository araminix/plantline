using System.Text.Json;
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
        Assert.Equal(40, drawing.Inserts.Count(insert => insert.Block == "PV_TABLE_2x28" && insert.Depth == 0));
        Assert.Equal(80, drawing.Shapes.Count(shape => shape.Layer == "PV-STRINGS"));
        var inverters = drawing.Inserts.Where(insert => insert.Layer == "INVERTERS").Select(insert => insert.Attributes["ID"]).Order();
        Assert.Equal(["INV-01", "INV-02", "INV-03", "INV-04"], inverters);
        Assert.Contains("PV-TABLES", drawing.Layers);
        Assert.False(drawing.Truncated);
    }

    [Fact]
    public void PlacesNestedBlockContent_InModelCoordinates()
    {
        var document = new CadDocument();
        var inner = Block(document, "INNER", new Line(new XYZ(0, 0, 0), new XYZ(1, 0, 0)));
        var outer = Block(document, "OUTER", new Insert(inner) { InsertPoint = new XYZ(10, 0, 0) });
        document.Entities.Add(new Insert(outer) { InsertPoint = new XYZ(100, 100, 0), Rotation = Math.PI / 2 });

        var drawing = CadReader.Read(Dxf(document));

        var line = Assert.Single(drawing.Shapes);
        Assert.Equal(2, line.Depth);
        Assert.Equal([100, 110, 100, 111], line.Points);
        var outerRef = drawing.Inserts.Single(insert => insert.Block == "OUTER");
        Assert.Equal([100, 110, 100, 111], outerRef.Box);
    }

    [Fact]
    public void StopsExpandingBlocks_AtTheDepthLimit()
    {
        var document = new CadDocument();
        var block = Block(document, "LEVEL12", new Line(new XYZ(0, 0, 0), new XYZ(1, 1, 0)));
        for (var level = 11; level >= 0; level--)
        {
            block = Block(document, $"LEVEL{level}", new Insert(block));
        }

        document.Entities.Add(new Insert(block));

        var drawing = CadReader.Read(Dxf(document));

        Assert.Equal(CadReader.MaxDepth, drawing.Inserts.Max(insert => insert.Depth));
        Assert.Empty(drawing.Shapes);
    }

    [Fact]
    public void TruncatesALargeDrawing_AtTheItemLimit()
    {
        var document = new CadDocument();
        for (var i = 0; i < 20; i++)
        {
            document.Entities.Add(new Line(new XYZ(i, 0, 0), new XYZ(i, 1, 0)));
        }

        var drawing = CadReader.Read(Dxf(document), maxItems: 5);

        Assert.True(drawing.Truncated);
        Assert.Equal(5, drawing.Shapes.Count);
    }

    [Fact]
    public void ReadsTextsAndCurves_AndTheUnit()
    {
        var document = new CadDocument();
        document.Header.InsUnits = UnitsType.Feet;
        document.Entities.Add(new TextEntity { Value = " INV-01 ", InsertPoint = new XYZ(5, 6, 0), Height = 1 });
        document.Entities.Add(new MText { Value = "{\\fArial|b1;Station} A", InsertPoint = new XYZ(1, 2, 0), Height = 1 });
        document.Entities.Add(new Circle { Center = new XYZ(0, 0, 0), Radius = 2 });

        var drawing = CadReader.Read(Dxf(document));

        Assert.Equal("ft", drawing.Units);
        Assert.Contains(drawing.Texts, text => text.Text == "INV-01" && text.X == 5 && text.Y == 6);
        Assert.Contains(drawing.Texts, text => text.Text == "Station A");
        var circle = Assert.Single(drawing.Shapes);
        Assert.True(circle.Closed);
        Assert.True(circle.Points.Length >= 40);
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
    public void WritesCamelCaseJson_TheWebAppReads()
    {
        var json = CadReader.ReadJson(File.ReadAllBytes(SamplePath("wind-farm.dxf")));

        using var parsed = JsonDocument.Parse(json);
        var names = parsed.RootElement.EnumerateObject().Select(property => property.Name);
        Assert.Equal(["units", "layers", "shapes", "inserts", "texts", "truncated"], names);
        var insert = parsed.RootElement.GetProperty("inserts")[0];
        Assert.Equal(["layer", "block", "depth", "x", "y", "box", "attributes"], insert.EnumerateObject().Select(property => property.Name));
    }

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
