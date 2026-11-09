using System.Runtime.InteropServices;
using System.Text.Json;
using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.IO;
using ACadSharp.Tables;
using ACadSharp.Types.Units;
using CSMath;

namespace Plantline.Cad;

/// <summary>Reads a DWG or DXF file into a <see cref="Drawing"/>. Files are untrusted: the output is bounded.</summary>
public static class CadReader
{
    /// <summary>Shapes and block references kept at most (each block counted once); a larger drawing is returned truncated.</summary>
    public const int MaxItems = 1_000_000;

    /// <summary>Points kept at most (16 bytes each); a larger drawing is returned truncated.</summary>
    public const int MaxPoints = 4_000_000;

    private const int CurveSegments = 24;

    /// <param name="maxItems">The item limit; <see cref="MaxItems"/> unless a test needs a smaller one.</param>
    /// <param name="maxPoints">The point limit; <see cref="MaxPoints"/> unless a test needs a smaller one.</param>
    /// <exception cref="InvalidDataException">The bytes are not a DWG or DXF drawing this reader understands.</exception>
    public static Drawing Read(byte[] bytes, int maxItems = MaxItems, int maxPoints = MaxPoints)
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

        var collector = new Collector(document.Layers.Select(layer => layer.Name).Order(StringComparer.Ordinal), maxItems, maxPoints);
        var model = collector.Collect("*Model_Space", document.Entities);
        var blocks = collector.CollectBlocks();
        return new Drawing(UnitName(document.Header.InsUnits), collector.Layers, blocks, model, collector.Truncated) { Points = collector.TakePoints() };
    }

    /// <summary>The drawing without its points, as JSON: the form the web app receives next to <see cref="PointBytes"/>.</summary>
    public static string ToJson(Drawing drawing) => JsonSerializer.Serialize(drawing, DrawingJson.Default.Drawing);

    /// <summary>The drawing's points as little-endian 64-bit numbers, the form the web app receives them in.</summary>
    public static byte[] PointBytes(Drawing drawing) => MemoryMarshal.AsBytes(drawing.Points.AsSpan()).ToArray();

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

    /// <summary>
    /// Collects model space, then every block it uses, each once. Blocks wait in a list instead of being read
    /// recursively, so neither deep nor self-referencing nesting can overflow the stack; placing references inside
    /// each other (and its depth limit) is the web app's work.
    /// </summary>
    private sealed class Collector
    {
        private readonly int maxItems;
        private readonly int maxPoints;
        private readonly List<string> layers;
        private readonly Dictionary<string, int> layerIndex;
        private readonly Dictionary<BlockRecord, int> blockIndex = new(ReferenceEqualityComparer.Instance);
        private readonly List<BlockRecord> pending = [];
        private readonly List<double> points = [];
        private int items;

        public Collector(IEnumerable<string> layerNames, int maxItems, int maxPoints)
        {
            this.maxItems = maxItems;
            this.maxPoints = maxPoints;
            layers = [.. layerNames];
            layerIndex = layers.Select((name, index) => (name, index)).ToDictionary(pair => pair.name, pair => pair.index, StringComparer.Ordinal);
        }

        public IReadOnlyList<string> Layers => layers;
        public bool Truncated { get; private set; }
        public double[] TakePoints() => [.. points];

        public Block Collect(string name, IEnumerable<Entity> entities)
        {
            var shapes = new List<int>();
            var references = new List<Reference>();
            foreach (var entity in entities)
            {
                if (items >= maxItems)
                {
                    Truncated = true;
                    break;
                }

                Add(entity, shapes, references);
            }

            return new Block(name, shapes, references);
        }

        /// <summary>Every block the collected content refers to, nested ones included, in the order of their indexes.</summary>
        public IReadOnlyList<Block> CollectBlocks()
        {
            var blocks = new List<Block>();
            for (var i = 0; i < pending.Count; i++)
            {
                // A truncated drawing still lists the blocks it refers to, empty
                blocks.Add(Truncated ? new Block(pending[i].Name, [], []) : Collect(pending[i].Name, pending[i].Entities));
            }

            return blocks;
        }

        private void Add(Entity entity, List<int> shapes, List<Reference> references)
        {
            var layer = LayerOf(entity);
            switch (entity)
            {
                case Insert { Block: not null } insert:
                    AddReferences(insert, layer, references);
                    break;
                case Line line:
                    AddShape(shapes, layer, false, [line.StartPoint, line.EndPoint]);
                    break;
                case IPolyline polyline:
                    AddShape(shapes, layer, polyline.IsClosed, polyline.Vertices.Select(vertex => vertex.Location));
                    break;
                case Arc arc:
                    AddShape(shapes, layer, false, arc.PolygonalVertexes(CurveSegments));
                    break;
                case Circle circle:
                    AddShape(shapes, layer, true, circle.PolygonalVertexes(CurveSegments));
                    break;
                case Ellipse ellipse:
                    AddShape(shapes, layer, false, ellipse.PolygonalVertexes(CurveSegments));
                    break;
                case Spline spline:
                    AddCurve(shapes, layer, spline);
                    break;
                case Solid solid:
                    AddShape(shapes, layer, true, [solid.FirstCorner, solid.SecondCorner, solid.FourthCorner, solid.ThirdCorner]);
                    break;
            }
        }

        /// <summary>
        /// The transform takes a block point p to P + R·S·(p − B): P the insertion point, R the rotation, S the scales, B
        /// the block's base point; mirrored in x when the reference faces down (normal −Z, as its coordinate system says).
        /// ACadSharp's own GetTransform subtracts the base point after scaling, which misplaces scaled blocks.
        /// </summary>
        private void AddReferences(Insert insert, int layer, List<Reference> references)
        {
            var block = BlockIndex(insert.Block!);
            var attributes = insert.Attributes
                .Where(attribute => !string.IsNullOrWhiteSpace(attribute.Tag))
                .GroupBy(attribute => attribute.Tag)
                .ToDictionary(group => group.Key, group => group.First().Value ?? string.Empty);
            var (cos, sin) = (Math.Cos(insert.Rotation), Math.Sin(insert.Rotation));
            var (a, b, c, d) = (cos * insert.XScale, sin * insert.XScale, -sin * insert.YScale, cos * insert.YScale);
            var basePoint = insert.Block!.BlockEntity?.BasePoint ?? XYZ.Zero;
            var mirror = insert.Normal.Z < 0 ? -1 : 1;

            // An array (MINSERT) is one reference per copy, the copies spaced along the reference's own turned axes
            for (var row = 0; row < Math.Max(1, (int)insert.RowCount); row++)
            {
                for (var column = 0; column < Math.Max(1, (int)insert.ColumnCount); column++)
                {
                    if (items >= maxItems)
                    {
                        Truncated = true;
                        return;
                    }

                    var (dx, dy) = (column * insert.ColumnSpacing, row * insert.RowSpacing);
                    var e = insert.InsertPoint.X + dx * cos - dy * sin - (a * basePoint.X + c * basePoint.Y);
                    var f = insert.InsertPoint.Y + dx * sin + dy * cos - (b * basePoint.X + d * basePoint.Y);
                    references.Add(new Reference(block, layer, [mirror * a, b, mirror * c, d, mirror * e, f], attributes.Count > 0 ? attributes : null));
                    items++;
                }
            }
        }

        private int BlockIndex(BlockRecord record)
        {
            if (!blockIndex.TryGetValue(record, out var index))
            {
                index = pending.Count;
                blockIndex.Add(record, index);
                pending.Add(record);
            }

            return index;
        }

        private int LayerOf(Entity entity)
        {
            var name = entity.Layer?.Name ?? "0";
            if (!layerIndex.TryGetValue(name, out var index))
            {
                index = layers.Count;
                layers.Add(name);
                layerIndex.Add(name, index);
            }

            return index;
        }

        private void AddCurve(List<int> shapes, int layer, Spline spline)
        {
            try
            {
                AddShape(shapes, layer, false, spline.PolygonalVertexes(CurveSegments));
            }
            catch (Exception exception) when (exception is ArgumentException or InvalidOperationException)
            {
                // A spline without a valid definition draws nothing
            }
        }

        private void AddShape<T>(List<int> shapes, int layer, bool closed, IEnumerable<T> vertices) where T : IVector
        {
            var first = points.Count / 2;
            foreach (var vertex in vertices)
            {
                points.Add(vertex[0]);
                points.Add(vertex[1]);
            }

            var count = points.Count / 2 - first;
            if (count < 2 || first + count > maxPoints)
            {
                Truncated |= first + count > maxPoints;
                points.RemoveRange(first * 2, count * 2);
                return;
            }

            shapes.AddRange([layer, closed ? 1 : 0, first, count]);
            items++;
        }
    }
}
