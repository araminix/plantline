using System.Text.Json.Serialization;

namespace Plantline.Cad;

/// <summary>
/// A drawing reduced to what the web app shows and recognises. Coordinates are in drawing units, rounded to 3 decimals;
/// block references are expanded, so every shape is in model-space coordinates.
/// </summary>
/// <param name="Units">The drawing's length unit: unitless, mm, cm, dm, m, km, in, ft, yd or mi.</param>
/// <param name="Truncated">True when the drawing had more items than <see cref="CadReader.MaxItems"/>; the rest is left out.</param>
public sealed record Drawing(
    string Units,
    IReadOnlyList<string> Layers,
    IReadOnlyList<Shape> Shapes,
    IReadOnlyList<InsertRef> Inserts,
    IReadOnlyList<TextRef> Texts,
    bool Truncated);

/// <summary>A polyline: lines, arcs, circles and curves become points (x1, y1, x2, y2, ...).</summary>
/// <param name="Depth">0 in model space, 1 inside a block reference, 2 inside a nested one, and so on.</param>
public sealed record Shape(string Layer, int Depth, bool Closed, double[] Points);

/// <summary>A block reference: where it is placed, its bounding box (minX, minY, maxX, maxY) and its attribute values.</summary>
public sealed record InsertRef(
    string Layer,
    string Block,
    int Depth,
    double X,
    double Y,
    double[] Box,
    IReadOnlyDictionary<string, string> Attributes);

/// <summary>A single-line or multi-line text, without formatting codes.</summary>
public sealed record TextRef(string Layer, string Text, double X, double Y);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(Drawing))]
public sealed partial class DrawingJson : JsonSerializerContext;
