using System.Text.Json;
using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.IO;
using ACadSharp.Types.Units;
using CSMath;

namespace Plantline.Cad;

/// <summary>Reads a DWG or DXF file into a <see cref="Drawing"/>. Files are untrusted: nesting and size are bounded.</summary>
public static class CadReader
{
    /// <summary>Block references nested deeper than this are not expanded (a self-referencing or exploding block).</summary>
    public const int MaxDepth = 8;

    /// <summary>Shapes, block references and texts kept at most; a larger drawing is returned truncated.</summary>
    public const int MaxItems = 500_000;

    private const int CurveSegments = 24;

    /// <param name="maxItems">The item limit; <see cref="MaxItems"/> unless a test needs a smaller one.</param>
    /// <exception cref="InvalidDataException">The bytes are not a DWG or DXF drawing this reader understands.</exception>
    public static Drawing Read(byte[] bytes, int maxItems = MaxItems)
    {
        CadDocument document;
        try
        {
            using var stream = new MemoryStream(bytes, writable: false);
            document = IsDwg(bytes) ? DwgReader.Read(stream) : DxfReader.Read(stream);
        }
        catch (Exception exception) when (exception is not OutOfMemoryException)
        {
            throw new InvalidDataException("The file is not a readable DWG or DXF drawing.", exception);
        }

        var walker = new Walker(maxItems);
        foreach (var entity in document.Entities)
        {
            if (!walker.Visit(entity, 0))
            {
                break;
            }
        }

        var layers = document.Layers.Select(layer => layer.Name).Order(StringComparer.Ordinal).ToList();
        return new Drawing(UnitName(document.Header.InsUnits), layers, walker.Shapes, walker.Inserts, walker.Texts, walker.Truncated);
    }

    /// <summary>The drawing as JSON, the form the web app receives.</summary>
    public static string ReadJson(byte[] bytes) => JsonSerializer.Serialize(Read(bytes), DrawingJson.Default.Drawing);

    // Every DWG version starts with "AC10" (AC1009 to AC1032); anything else is tried as DXF (text or binary).
    private static bool IsDwg(byte[] bytes) =>
        bytes.Length > 6 && bytes[0] == 'A' && bytes[1] == 'C' && bytes[2] == '1' && bytes[3] == '0';

    private static string UnitName(UnitsType units) => units switch
    {
        UnitsType.Millimeters => "mm",
        UnitsType.Centimeters => "cm",
        UnitsType.Decimeters => "dm",
        UnitsType.Meters => "m",
        UnitsType.Kilometers => "km",
        UnitsType.Inches or UnitsType.USSurveyInches => "in",
        UnitsType.Feet or UnitsType.USSurveyFeet => "ft",
        UnitsType.Yards or UnitsType.USSurveyYards => "yd",
        UnitsType.Miles or UnitsType.USSurveyMiles => "mi",
        _ => "unitless",
    };

    private sealed class Walker(int maxItems)
    {
        public List<Shape> Shapes { get; } = [];
        public List<InsertRef> Inserts { get; } = [];
        public List<TextRef> Texts { get; } = [];
        public bool Truncated { get; private set; }

        private int Count => Shapes.Count + Inserts.Count + Texts.Count;

        /// <summary>Adds the entity; false once the item limit is reached.</summary>
        public bool Visit(Entity entity, int depth)
        {
            if (Count >= maxItems)
            {
                Truncated = true;
                return false;
            }

            var layer = entity.Layer?.Name ?? "0";
            switch (entity)
            {
                case Insert insert:
                    // The box comes from the shapes drawn inside, not from ACadSharp's bounding box, which recurses
                    // without a limit and overflows the stack on a self-referencing block
                    var firstShape = Shapes.Count;
                    var complete = depth >= MaxDepth || insert.Explode().All(child => Visit(child, depth + 1));
                    Inserts.Add(Reference(insert, layer, depth, Shapes.Skip(firstShape)));
                    return complete;
                case Line line:
                    AddShape(layer, depth, false, [line.StartPoint, line.EndPoint]);
                    break;
                case IPolyline polyline:
                    AddShape(layer, depth, polyline.IsClosed, polyline.Vertices.Select(vertex => vertex.Location));
                    break;
                case Arc arc:
                    AddShape(layer, depth, false, arc.PolygonalVertexes(CurveSegments));
                    break;
                case Circle circle:
                    AddShape(layer, depth, true, circle.PolygonalVertexes(CurveSegments));
                    break;
                case Ellipse ellipse:
                    AddShape(layer, depth, false, ellipse.PolygonalVertexes(CurveSegments));
                    break;
                case Spline spline:
                    AddCurve(layer, depth, spline);
                    break;
                case Solid solid:
                    AddShape(layer, depth, true, [solid.FirstCorner, solid.SecondCorner, solid.FourthCorner, solid.ThirdCorner]);
                    break;
                case AttributeDefinition:
                    break;
                case TextEntity text:
                    AddText(layer, text.Value, text.InsertPoint);
                    break;
                case MText text:
                    AddText(layer, text.PlainText, text.InsertPoint);
                    break;
            }

            return true;
        }

        private static InsertRef Reference(Insert insert, string layer, int depth, IEnumerable<Shape> inside)
        {
            var point = insert.InsertPoint;
            double minX = double.MaxValue, minY = double.MaxValue, maxX = double.MinValue, maxY = double.MinValue;
            foreach (var shape in inside)
            {
                for (var i = 0; i < shape.Points.Length; i += 2)
                {
                    minX = Math.Min(minX, shape.Points[i]);
                    maxX = Math.Max(maxX, shape.Points[i]);
                    minY = Math.Min(minY, shape.Points[i + 1]);
                    maxY = Math.Max(maxY, shape.Points[i + 1]);
                }
            }

            double[] bounds = minX <= maxX ? [minX, minY, maxX, maxY] : [Round(point.X), Round(point.Y), Round(point.X), Round(point.Y)];

            var attributes = insert.Attributes
                .Where(attribute => !string.IsNullOrWhiteSpace(attribute.Tag))
                .GroupBy(attribute => attribute.Tag)
                .ToDictionary(group => group.Key, group => group.First().Value ?? string.Empty);
            return new InsertRef(layer, insert.Block?.Name ?? string.Empty, depth, Round(point.X), Round(point.Y), bounds, attributes);
        }

        private void AddCurve(string layer, int depth, Spline spline)
        {
            try
            {
                AddShape(layer, depth, false, spline.PolygonalVertexes(CurveSegments));
            }
            catch (Exception exception) when (exception is ArgumentException or InvalidOperationException)
            {
                // A spline without a valid definition draws nothing
            }
        }

        private void AddShape<T>(string layer, int depth, bool closed, IEnumerable<T> vertices) where T : IVector
        {
            var points = vertices.SelectMany(vertex => new[] { Round(vertex[0]), Round(vertex[1]) }).ToArray();
            if (points.Length >= 4)
            {
                Shapes.Add(new Shape(layer, depth, closed, points));
            }
        }

        private void AddText(string layer, string? value, XYZ point)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                Texts.Add(new TextRef(layer, value.Trim(), Round(point.X), Round(point.Y)));
            }
        }

        private static double Round(double value) => Math.Round(value, 3);
    }
}
