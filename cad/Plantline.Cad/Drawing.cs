using System.Text.Json.Serialization;

namespace Plantline.Cad;

/// <summary>
/// A drawing reduced to what the web app shows and recognises. Every block is kept once: model space and each block
/// hold their own shapes and their references to other blocks, each reference with its transform. The web app places
/// the references itself, so a block used 10,000 times costs one copy, not 10,000.
/// </summary>
/// <param name="Units">The drawing's length unit: unitless, mm, cm, dm, m, km, in, ft, yd or mi.</param>
/// <param name="Layers">Layer names; shapes and references give their layer as an index into this list.</param>
/// <param name="Blocks">The blocks model space uses, directly or nested; references give their block as an index into this list.</param>
/// <param name="Model">Model space: what the drawing shows.</param>
/// <param name="Truncated">True when the drawing had more than <see cref="CadReader.MaxItems"/> shapes and references or more than <see cref="CadReader.MaxPoints"/> points; the rest is left out.</param>
public sealed record Drawing(string Units, IReadOnlyList<string> Layers, IReadOnlyList<Block> Blocks, Block Model, bool Truncated)
{
    /// <summary>The points of every shape, x and y in turn, in the units of the block that holds the shape. Sent to the web app as binary, not as JSON.</summary>
    [JsonIgnore]
    public double[] Points { get; init; } = [];

    /// <summary>The number of points in <see cref="Points"/>, so the web app can check that the two parts belong together.</summary>
    public int PointCount => Points.Length / 2;
}

/// <summary>Model space or a block definition, in its own coordinates.</summary>
/// <param name="Shapes">
/// Four numbers per shape: the layer, 1 when the shape is closed (else 0), its first point in <see cref="Drawing.Points"/>
/// and its number of points. Lines, polylines, arcs, circles, ellipses, splines and solids are shapes (curves become
/// 24 segments).
/// </param>
public sealed record Block(string Name, IReadOnlyList<int> Shapes, IReadOnlyList<Reference> References);

/// <summary>A block placed inside model space or inside another block. An array of copies (MINSERT) is one reference per copy.</summary>
/// <param name="Block">The block, as an index into <see cref="Drawing.Blocks"/>.</param>
/// <param name="Layer">The reference's own layer, as an index into <see cref="Drawing.Layers"/>.</param>
/// <param name="Transform">From the block's coordinates to those of the block or model space holding the reference: x' = a·x + c·y + e and y' = b·x + d·y + f, written [a, b, c, d, e, f].</param>
/// <param name="Attributes">The reference's attribute values by tag; null when it has none.</param>
public sealed record Reference(int Block, int Layer, double[] Transform, IReadOnlyDictionary<string, string>? Attributes);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
[JsonSerializable(typeof(Drawing))]
public sealed partial class DrawingJson : JsonSerializerContext;
