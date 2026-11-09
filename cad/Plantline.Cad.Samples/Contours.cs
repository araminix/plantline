namespace Plantline.Cad.Samples;

/// <summary>A contour line of the ground: its elevation, its points and whether it closes on itself.</summary>
internal sealed record Contour(double Level, List<P> Points, bool Closed);

/// <summary>Contour lines traced from a height function (marching squares), as a survey's topography would give them.</summary>
internal static class Contours
{
    /// <summary>
    /// The contours every <paramref name="interval"/> of the ground over a box, sampled every <paramref name="cell"/>;
    /// cells whose centre is not <paramref name="inside"/> are left out, so the lines end at the surveyed area's edge.
    /// </summary>
    public static List<Contour> Trace(Func<double, double, double> height, P from, P to, double cell, double interval, double tolerance, Func<P, bool>? inside = null)
    {
        var (nx, ny) = ((int)Math.Ceiling((to.X - from.X) / cell), (int)Math.Ceiling((to.Y - from.Y) / cell));
        var z = new double[nx + 1, ny + 1];
        var (low, high) = (double.MaxValue, double.MinValue);
        for (var i = 0; i <= nx; i++)
        {
            for (var j = 0; j <= ny; j++)
            {
                z[i, j] = height(from.X + i * cell, from.Y + j * cell);
                (low, high) = (Math.Min(low, z[i, j]), Math.Max(high, z[i, j]));
            }
        }

        var surveyed = new bool[nx, ny];
        for (var i = 0; i < nx; i++)
        {
            for (var j = 0; j < ny; j++)
            {
                surveyed[i, j] = inside?.Invoke(new P(from.X + (i + 0.5) * cell, from.Y + (j + 0.5) * cell)) ?? true;
            }
        }

        var contours = new List<Contour>();
        for (var level = Math.Ceiling(low / interval) * interval; level <= high; level += interval)
        {
            // A tiny shift keeps grid values off the level, so every crossing is on an edge's inside
            var c = level + 1e-7;
            var point = (long key) =>
            {
                var (index, vertical) = (key / 2, key % 2 == 1);
                var (i, j) = ((int)(index % (nx + 1)), (int)(index / (nx + 1)));
                var (a, b) = vertical ? (z[i, j], z[i, j + 1]) : (z[i, j], z[i + 1, j]);
                var t = (c - a) / (b - a);
                return vertical ? new P(from.X + i * cell, from.Y + (j + t) * cell) : new P(from.X + (i + t) * cell, from.Y + j * cell);
            };
            var segments = new List<(long A, long B)>();
            for (var i = 0; i < nx; i++)
            {
                for (var j = 0; j < ny; j++)
                {
                    if (surveyed[i, j])
                    {
                        Cell(segments, z, c, i, j, nx);
                    }
                }
            }

            foreach (var (keys, closed) in Chain(segments))
            {
                var line = Geo.Simplify(keys.Select(point).ToList(), tolerance);
                if (line.Count >= 2)
                {
                    contours.Add(new Contour(level, line, closed));
                }
            }
        }

        return contours;
    }

    // The crossings of one cell, as pairs of edges: an edge is (j·(nx+1) + i)·2, plus 1 for a vertical one
    private static void Cell(List<(long, long)> segments, double[,] z, double c, int i, int j, int nx)
    {
        long Horizontal(int x, int y) => ((long)y * (nx + 1) + x) * 2;
        long Vertical(int x, int y) => ((long)y * (nx + 1) + x) * 2 + 1;
        var (bottom, right, top, left) = (Horizontal(i, j), Vertical(i + 1, j), Horizontal(i, j + 1), Vertical(i, j));
        var index = (z[i, j] > c ? 1 : 0) | (z[i + 1, j] > c ? 2 : 0) | (z[i + 1, j + 1] > c ? 4 : 0) | (z[i, j + 1] > c ? 8 : 0);
        var centreHigh = (z[i, j] + z[i + 1, j] + z[i + 1, j + 1] + z[i, j + 1]) / 4 > c;
        switch (index)
        {
            case 1 or 14: segments.Add((left, bottom)); break;
            case 2 or 13: segments.Add((bottom, right)); break;
            case 3 or 12: segments.Add((left, right)); break;
            case 4 or 11: segments.Add((right, top)); break;
            case 6 or 9: segments.Add((bottom, top)); break;
            case 7 or 8: segments.Add((left, top)); break;
            case 5:
                segments.Add(centreHigh ? (bottom, right) : (left, bottom));
                segments.Add(centreHigh ? (left, top) : (right, top));
                break;
            case 10:
                segments.Add(centreHigh ? (left, bottom) : (bottom, right));
                segments.Add(centreHigh ? (right, top) : (left, top));
                break;
        }
    }

    // Joins segments that share an edge into lines: open ones from their loose ends first, then the closed loops
    private static IEnumerable<(List<long> Keys, bool Closed)> Chain(List<(long A, long B)> segments)
    {
        var at = new Dictionary<long, List<int>>();
        for (var s = 0; s < segments.Count; s++)
        {
            foreach (var key in new[] { segments[s].A, segments[s].B })
            {
                if (!at.TryGetValue(key, out var list))
                {
                    at[key] = list = [];
                }

                list.Add(s);
            }
        }

        var used = new bool[segments.Count];
        var starts = at.Where(entry => entry.Value.Count == 1).Select(entry => entry.Key).Concat(segments.Select(segment => segment.A)).ToList();
        foreach (var start in starts)
        {
            if (!at[start].Any(s => !used[s]))
            {
                continue;
            }

            var keys = new List<long> { start };
            var current = start;
            while (at[current].FirstOrDefault(s => !used[s], -1) is var next and >= 0)
            {
                used[next] = true;
                current = segments[next].A == current ? segments[next].B : segments[next].A;
                keys.Add(current);
            }

            var closed = keys.Count > 2 && keys[^1] == keys[0];
            if (closed)
            {
                keys.RemoveAt(keys.Count - 1);
            }

            yield return (keys, closed);
        }
    }
}
