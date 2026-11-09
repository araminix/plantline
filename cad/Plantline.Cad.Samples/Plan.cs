using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.Tables;
using ACadSharp.Types.Units;
using CSMath;

namespace Plantline.Cad.Samples;

/// <summary>A drawing being written: its layers by name, its blocks, and model space.</summary>
internal sealed class Plan
{
    public Plan(UnitsType units)
    {
        Document.Header.InsUnits = units;
    }

    public CadDocument Document { get; } = new();

    public Layer Layer(string name, short color)
    {
        if (Document.Layers.TryGetValue(name, out var existing))
        {
            return existing;
        }

        var layer = new Layer(name) { Color = new Color(color) };
        Document.Layers.Add(layer);
        return layer;
    }

    public BlockRecord Block(string name, IEnumerable<Entity> entities)
    {
        var block = new BlockRecord(name);
        foreach (var entity in entities)
        {
            block.Entities.Add(entity);
        }

        Document.BlockRecords.Add(block);
        return block;
    }

    public void Add(Entity entity) => Document.Entities.Add(entity);

    public void Add(IEnumerable<Entity> entities)
    {
        foreach (var entity in entities)
        {
            Document.Entities.Add(entity);
        }
    }
}

/// <summary>
/// Draws entities with every length multiplied by <see cref="K"/>: 1 for a drawing in metres, 1000 for one in
/// millimetres, so a plan is written in metres whatever unit its file uses.
/// </summary>
internal sealed class Pen(double k)
{
    public double K { get; } = k;

    public Line Line(Layer? layer, double x1, double y1, double x2, double y2) =>
        On(new Line(new XYZ(x1 * K, y1 * K, 0), new XYZ(x2 * K, y2 * K, 0)), layer);

    public Line Line(Layer? layer, P a, P b) => Line(layer, a.X, a.Y, b.X, b.Y);

    public LwPolyline Poly(Layer? layer, bool closed, IEnumerable<P> points) =>
        On(new LwPolyline(points.Select(p => (IVector)new XY(p.X * K, p.Y * K))) { IsClosed = closed }, layer);

    public LwPolyline Poly(Layer? layer, bool closed, params double[] xy) =>
        Poly(layer, closed, Enumerable.Range(0, xy.Length / 2).Select(i => new P(xy[2 * i], xy[2 * i + 1])));

    public LwPolyline Rect(Layer? layer, double x1, double y1, double x2, double y2) => Poly(layer, true, x1, y1, x2, y1, x2, y2, x1, y2);

    /// <summary>A w × h rectangle centred on (x, y), turned by an angle in degrees.</summary>
    public LwPolyline Box(Layer? layer, double x, double y, double w, double h, double degrees = 0)
    {
        var (u, v) = (P.Polar(degrees, w / 2), P.Polar(degrees + 90, h / 2));
        var c = new P(x, y);
        return Poly(layer, true, [c - u - v, c + u - v, c + u + v, c - u + v]);
    }

    public Circle Circle(Layer? layer, double x, double y, double r) => On(new Circle { Center = new XYZ(x * K, y * K, 0), Radius = r * K }, layer);

    public Arc Arc(Layer? layer, double x, double y, double r, double fromDegrees, double toDegrees) =>
        On(new Arc { Center = new XYZ(x * K, y * K, 0), Radius = r * K, StartAngle = fromDegrees * Math.PI / 180, EndAngle = toDegrees * Math.PI / 180 }, layer);

    public TextEntity Text(Layer? layer, double x, double y, double height, string value, double degrees = 0, bool centred = false)
    {
        var text = new TextEntity { Value = value, InsertPoint = new XYZ(x * K, y * K, 0), Height = height * K, Rotation = degrees * Math.PI / 180 };
        if (centred)
        {
            text.HorizontalAlignment = TextHorizontalAlignment.Center;
            text.AlignmentPoint = text.InsertPoint;
        }

        return On(text, layer);
    }

    /// <summary>A reference to a block at (x, y), turned by an angle in degrees and scaled (the scale is not multiplied by K).</summary>
    public Insert Put(BlockRecord block, Layer layer, double x, double y, double degrees = 0, double scale = 1) =>
        new(block) { InsertPoint = new XYZ(x * K, y * K, 0), Rotation = degrees * Math.PI / 180, XScale = scale, YScale = scale, Layer = layer };

    /// <summary>Adds an attribute (ID, TYPE…) to a reference, its text placed at (x, y).</summary>
    public Insert Tag(Insert insert, string tag, string value, double x, double y, double height)
    {
        insert.Attributes.Add(new AttributeEntity { Tag = tag, Value = value, InsertPoint = new XYZ(x * K, y * K, 0), Height = height * K, Layer = insert.Layer });
        return insert;
    }

    private static T On<T>(T entity, Layer? layer) where T : Entity
    {
        if (layer is not null)
        {
            entity.Layer = layer;
        }

        return entity;
    }
}

/// <summary>A point or a vector of the plan, in metres.</summary>
internal readonly record struct P(double X, double Y)
{
    public static P operator +(P a, P b) => new(a.X + b.X, a.Y + b.Y);

    public static P operator -(P a, P b) => new(a.X - b.X, a.Y - b.Y);

    public static P operator *(P a, double k) => new(a.X * k, a.Y * k);

    public double Length => Math.Sqrt(X * X + Y * Y);

    public P Unit => this * (1 / Length);

    /// <summary>The vector turned a quarter turn anticlockwise.</summary>
    public P Left => new(-Y, X);

    public double Degrees => Math.Atan2(Y, X) * 180 / Math.PI;

    public static P Polar(double degrees, double length = 1) => new(Math.Cos(degrees * Math.PI / 180) * length, Math.Sin(degrees * Math.PI / 180) * length);

    public double Dot(P other) => X * other.X + Y * other.Y;

    public double Cross(P other) => X * other.Y - Y * other.X;
}

/// <summary>Geometry on polylines (lists of points) and polygons.</summary>
internal static class Geo
{
    public static double Length(IReadOnlyList<P> line)
    {
        var length = 0.0;
        for (var i = 1; i < line.Count; i++)
        {
            length += (line[i] - line[i - 1]).Length;
        }

        return length;
    }

    /// <summary>A smooth curve through the points (Catmull-Rom), a point about every <paramref name="step"/>.</summary>
    public static List<P> Smooth(IReadOnlyList<P> points, double step)
    {
        var curve = new List<P> { points[0] };
        for (var i = 0; i < points.Count - 1; i++)
        {
            var (p0, p1, p2, p3) = (points[Math.Max(i - 1, 0)], points[i], points[i + 1], points[Math.Min(i + 2, points.Count - 1)]);
            var n = Math.Max(1, (int)Math.Ceiling((p2 - p1).Length / step));
            for (var j = 1; j <= n; j++)
            {
                var t = (double)j / n;
                var (t2, t3) = (t * t, t * t * t);
                curve.Add((p1 * 2 + (p2 - p0) * t + (p0 * 2 - p1 * 5 + p2 * 4 - p3) * t2 + (p1 * 3 - p0 - p2 * 3 + p3) * t3) * 0.5);
            }
        }

        return curve;
    }

    /// <summary>The line moved sideways, to its left by a positive distance.</summary>
    public static List<P> Offset(IReadOnlyList<P> line, double distance) => Offset(line, _ => distance);

    /// <summary>The line moved sideways by a distance that depends on the station (the distance along the line).</summary>
    public static List<P> Offset(IReadOnlyList<P> line, Func<double, double> distance)
    {
        var moved = new List<P>(line.Count);
        var s = 0.0;
        for (var i = 0; i < line.Count; i++)
        {
            if (i > 0)
            {
                s += (line[i] - line[i - 1]).Length;
            }

            var before = i > 0 ? (line[i] - line[i - 1]).Unit : (line[1] - line[0]).Unit;
            var after = i < line.Count - 1 ? (line[i + 1] - line[i]).Unit : before;
            moved.Add(line[i] + (before + after).Unit.Left * distance(s));
        }

        return moved;
    }

    /// <summary>The point at a station of the line, and the line's direction there.</summary>
    public static (P Point, P Direction) At(IReadOnlyList<P> line, double station)
    {
        var s = 0.0;
        for (var i = 1; i < line.Count; i++)
        {
            var segment = line[i] - line[i - 1];
            var length = segment.Length;
            if (s + length >= station || i == line.Count - 1)
            {
                var t = Math.Clamp((station - s) / length, 0, 1);
                return (line[i - 1] + segment * t, segment.Unit);
            }

            s += length;
        }

        return (line[0], (line[1] - line[0]).Unit);
    }

    /// <summary>The part of the line between two stations.</summary>
    public static List<P> Slice(IReadOnlyList<P> line, double from, double to)
    {
        var part = new List<P> { At(line, from).Point };
        var s = 0.0;
        for (var i = 1; i < line.Count; i++)
        {
            s += (line[i] - line[i - 1]).Length;
            if (s > from && s < to)
            {
                part.Add(line[i]);
            }
        }

        part.Add(At(line, to).Point);
        return part;
    }

    /// <summary>Where a point lies along a line: the station of its nearest point, and its distance, positive to the left.</summary>
    public static (double Station, double Distance) Locate(IReadOnlyList<P> line, P point)
    {
        var (best, station, side, s) = (double.MaxValue, 0.0, 0.0, 0.0);
        for (var i = 1; i < line.Count; i++)
        {
            var segment = line[i] - line[i - 1];
            var length = segment.Length;
            var t = Math.Clamp((point - line[i - 1]).Dot(segment) / (length * length), 0, 1);
            var distance = (point - (line[i - 1] + segment * t)).Length;
            if (distance < best)
            {
                (best, station, side) = (distance, s + t * length, Math.Sign(segment.Cross(point - line[i - 1])));
            }

            s += length;
        }

        return (station, side * best);
    }

    public static bool Inside(IReadOnlyList<P> polygon, P point)
    {
        var inside = false;
        for (int i = 0, j = polygon.Count - 1; i < polygon.Count; j = i++)
        {
            var (a, b) = (polygon[i], polygon[j]);
            if ((a.Y > point.Y) != (b.Y > point.Y) && point.X < (b.X - a.X) * (point.Y - a.Y) / (b.Y - a.Y) + a.X)
            {
                inside = !inside;
            }
        }

        return inside;
    }

    /// <summary>A convex polygon, its corners anticlockwise, shrunk by a distance on every side.</summary>
    public static List<P> Inset(IReadOnlyList<P> polygon, double distance)
    {
        var n = polygon.Count;
        var lines = Enumerable.Range(0, n).Select(i =>
        {
            var (a, b) = (polygon[i], polygon[(i + 1) % n]);
            var shift = (b - a).Unit.Left * distance;
            return (From: a + shift, Direction: b - a);
        }).ToList();
        return Enumerable.Range(0, n).Select(i =>
        {
            var (first, second) = (lines[(i + n - 1) % n], lines[i]);
            var t = (second.From - first.From).Cross(second.Direction) / first.Direction.Cross(second.Direction);
            return first.From + first.Direction * t;
        }).ToList();
    }

    /// <summary>Where a horizontal line crosses a convex polygon: its x range, or null.</summary>
    public static (double From, double To)? Span(IReadOnlyList<P> polygon, double y)
    {
        var xs = new List<double>();
        for (var i = 0; i < polygon.Count; i++)
        {
            var (a, b) = (polygon[i], polygon[(i + 1) % polygon.Count]);
            if ((a.Y <= y && b.Y > y) || (b.Y <= y && a.Y > y))
            {
                xs.Add(a.X + (y - a.Y) / (b.Y - a.Y) * (b.X - a.X));
            }
        }

        return xs.Count >= 2 ? (xs.Min(), xs.Max()) : null;
    }

    /// <summary>The runs of a line's consecutive points that are inside an area (a line clipped to it).</summary>
    public static IEnumerable<List<P>> Runs(IEnumerable<P> line, Func<P, bool> inside)
    {
        var run = new List<P>();
        foreach (var point in line)
        {
            if (inside(point))
            {
                run.Add(point);
                continue;
            }

            if (run.Count >= 2)
            {
                yield return run;
            }

            run = [];
        }

        if (run.Count >= 2)
        {
            yield return run;
        }
    }

    /// <summary>Where a line crosses another: the points, and their stations along the first.</summary>
    public static IEnumerable<(P Point, double Station)> Crossings(IReadOnlyList<P> line, IReadOnlyList<P> other)
    {
        var station = 0.0;
        for (var i = 1; i < line.Count; i++)
        {
            var (a, b) = (line[i - 1], line[i]);
            for (var j = 1; j < other.Count; j++)
            {
                var (c, d) = (other[j - 1], other[j]);
                var denominator = (b - a).Cross(d - c);
                if (Math.Abs(denominator) < 1e-9)
                {
                    continue;
                }

                var t = (c - a).Cross(d - c) / denominator;
                var u = (c - a).Cross(b - a) / denominator;
                if (t is >= 0 and <= 1 && u is >= 0 and <= 1)
                {
                    yield return (a + (b - a) * t, station + t * (b - a).Length);
                }
            }

            station += (b - a).Length;
        }
    }

    /// <summary>Fewer points, none further than the tolerance from the line they leave (Douglas-Peucker).</summary>
    public static List<P> Simplify(IReadOnlyList<P> line, double tolerance)
    {
        if (line.Count < 3)
        {
            return [.. line];
        }

        var keep = new bool[line.Count];
        keep[0] = keep[^1] = true;
        var stack = new Stack<(int, int)>();
        stack.Push((0, line.Count - 1));
        while (stack.Count > 0)
        {
            var (first, last) = stack.Pop();
            var (a, b) = (line[first], line[last]);
            var (farthest, index) = (0.0, -1);
            for (var i = first + 1; i < last; i++)
            {
                var ab = b - a;
                var distance = ab.Length < 1e-9 ? (line[i] - a).Length : Math.Abs(ab.Cross(line[i] - a)) / ab.Length;
                if (distance > farthest)
                {
                    (farthest, index) = (distance, i);
                }
            }

            if (farthest > tolerance)
            {
                keep[index] = true;
                stack.Push((first, index));
                stack.Push((index, last));
            }
        }

        return [.. line.Where((_, i) => keep[i])];
    }
}
