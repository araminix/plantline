using System.Globalization;

namespace Plantline.Cad.Samples;

/// <summary>
/// The real ground of a sample site: SRTM elevations on a square grid in UTM metres (Terrain/*.grid, written by
/// Terrain/fetch.mjs). Gives the height anywhere, and the streams the ground drains into.
/// </summary>
internal sealed class Terrain
{
    private readonly double[,] z;

    private Terrain(int zone, double east, double north, double step, double[,] heights)
    {
        (Zone, East, North, Step, z) = (zone, east, north, step, heights);
    }

    public int Zone { get; }

    /// <summary>The grid's south-west corner.</summary>
    public double East { get; }

    public double North { get; }

    public double Step { get; }

    public int Columns => z.GetLength(1);

    public int Rows => z.GetLength(0);

    public P From => new(East, North);

    public P To => new(East + (Columns - 1) * Step, North + (Rows - 1) * Step);

    public static Terrain Load(string name)
    {
        var lines = File.ReadAllLines(Path.Combine(AppContext.BaseDirectory, "Terrain", name + ".grid")).Where(line => !line.StartsWith('#')).ToList();
        var header = lines[0].Split(' ').Select(value => double.Parse(value, CultureInfo.InvariantCulture)).ToArray();
        var (columns, rows) = ((int)header[4], (int)header[5]);
        var heights = new double[rows, columns];
        for (var row = 0; row < rows; row++)
        {
            var values = lines[row + 1].Split(' ');
            for (var column = 0; column < columns; column++)
            {
                heights[row, column] = double.Parse(values[column], CultureInfo.InvariantCulture);
            }
        }

        return new Terrain((int)header[0], header[1], header[2], header[3], heights);
    }

    /// <summary>The ground smoothed by a 3 x 3 binomial filter, some passes over: SRTM's metre steps and noise go.</summary>
    public Terrain Smoothed(int passes)
    {
        var current = (double[,])z.Clone();
        for (var pass = 0; pass < passes; pass++)
        {
            var next = new double[Rows, Columns];
            for (var r = 0; r < Rows; r++)
            {
                for (var c = 0; c < Columns; c++)
                {
                    var (sum, weight) = (0.0, 0.0);
                    for (var dr = -1; dr <= 1; dr++)
                    {
                        for (var dc = -1; dc <= 1; dc++)
                        {
                            var (rr, cc) = (r + dr, c + dc);
                            if (rr < 0 || rr >= Rows || cc < 0 || cc >= Columns)
                            {
                                continue;
                            }

                            var w = (dr == 0 ? 2 : 1) * (dc == 0 ? 2 : 1);
                            (sum, weight) = (sum + current[rr, cc] * w, weight + w);
                        }
                    }

                    next[r, c] = sum / weight;
                }
            }

            current = next;
        }

        return new Terrain(Zone, East, North, Step, current);
    }

    /// <summary>The height at a UTM point, interpolated between the four nearest grid points (the edge's beyond the grid).</summary>
    public double Height(double east, double north)
    {
        var x = Math.Clamp((east - East) / Step, 0, Columns - 1.000001);
        var y = Math.Clamp((north - North) / Step, 0, Rows - 1.000001);
        var (c, r) = ((int)x, (int)y);
        var (fx, fy) = (x - c, y - r);
        return z[r, c] * (1 - fx) * (1 - fy) + z[r, c + 1] * fx * (1 - fy) + z[r + 1, c] * (1 - fx) * fy + z[r + 1, c + 1] * fx * fy;
    }

    public double Height(P point) => Height(point.X, point.Y);

    private P Node(int r, int c) => new(East + c * Step, North + r * Step);

    /// <summary>
    /// The streams of the ground: where water from at least <paramref name="area"/> square metres gathers, traced
    /// downhill (pits filled, each point draining to its steepest neighbour). The main stream is the one gathering the
    /// most, from its farthest spring to where it leaves the grid; the others run from their springs to where they
    /// join a larger one. All are smoothed.
    /// </summary>
    public (List<P> Main, List<List<P>> Others) Streams(double area)
    {
        var (down, gathered) = Drainage();
        var threshold = area / (Step * Step);
        var isStream = (int i) => gathered[i] >= threshold;
        var cells = Rows * Columns;

        var outlet = Enumerable.Range(0, cells).Where(i => down[i] < 0).MaxBy(i => gathered[i]);
        var mainCells = new List<int>();
        for (var i = outlet; i >= 0;)
        {
            mainCells.Add(i);
            i = Neighbours(i).Where(j => down[j] == i && isStream(j)).DefaultIfEmpty(-1).MaxBy(j => j < 0 ? -1 : gathered[j]);
        }

        mainCells.Reverse();
        var visited = new bool[cells];
        foreach (var i in mainCells)
        {
            visited[i] = true;
        }

        var hasUpstream = new bool[cells];
        for (var i = 0; i < cells; i++)
        {
            if (isStream(i) && down[i] >= 0)
            {
                hasUpstream[down[i]] = true;
            }
        }

        var others = new List<List<P>>();
        foreach (var spring in Enumerable.Range(0, cells).Where(i => isStream(i) && !hasUpstream[i] && !visited[i]))
        {
            var points = new List<P>();
            for (var i = spring; i >= 0 && isStream(i); i = down[i])
            {
                points.Add(Node(i / Columns, i % Columns));
                if (visited[i])
                {
                    break;
                }

                visited[i] = true;
            }

            if (points.Count >= 3)
            {
                others.Add(Soften(points));
            }
        }

        return (Soften(mainCells.Select(i => Node(i / Columns, i % Columns)).ToList()), others);
    }

    /// <summary>
    /// The valley floor between two points: the path through the grid that keeps lowest (each step's cost grows with
    /// the square of its height above the grid's lowest point), smoothed. A river runs along it.
    /// </summary>
    public List<P> Valley(P from, P to)
    {
        var index = (P p) => (int)Math.Round((p.Y - North) / Step) * Columns + (int)Math.Round((p.X - East) / Step);
        var (start, goal) = (index(from), index(to));
        var lowest = z.Cast<double>().Min();
        var cost = Enumerable.Repeat(double.MaxValue, Rows * Columns).ToArray();
        var previous = Enumerable.Repeat(-1, Rows * Columns).ToArray();
        var queue = new PriorityQueue<int, double>();
        cost[start] = 0;
        queue.Enqueue(start, 0);
        while (queue.TryDequeue(out var i, out var reached) && i != goal)
        {
            if (reached > cost[i])
            {
                continue;
            }

            foreach (var j in Neighbours(i))
            {
                var distance = (j / Columns != i / Columns && j % Columns != i % Columns) ? Math.Sqrt(2) : 1;
                var height = z[j / Columns, j % Columns] - lowest + 1;
                var next = cost[i] + distance * height * height;
                if (next < cost[j])
                {
                    (cost[j], previous[j]) = (next, i);
                    queue.Enqueue(j, next);
                }
            }
        }

        var path = new List<P>();
        for (var i = goal; i >= 0; i = previous[i])
        {
            path.Add(Node(i / Columns, i % Columns));
        }

        path.Reverse();
        return Geo.Smooth(Soften(path), Step / 3);
    }

    private IEnumerable<int> Neighbours(int i)
    {
        var (r, c) = (i / Columns, i % Columns);
        for (var dr = -1; dr <= 1; dr++)
        {
            for (var dc = -1; dc <= 1; dc++)
            {
                var (rr, cc) = (r + dr, c + dc);
                if ((dr != 0 || dc != 0) && rr >= 0 && rr < Rows && cc >= 0 && cc < Columns)
                {
                    yield return rr * Columns + cc;
                }
            }
        }
    }

    // Priority-flood pit filling from the edges, then D8: each point drains to its steepest lower neighbour
    private (int[] Down, double[] Gathered) Drainage()
    {
        var cells = Rows * Columns;
        var filled = new double[cells];
        var done = new bool[cells];
        var queue = new PriorityQueue<int, double>();
        for (var i = 0; i < cells; i++)
        {
            var (r, c) = (i / Columns, i % Columns);
            if (r == 0 || c == 0 || r == Rows - 1 || c == Columns - 1)
            {
                filled[i] = z[r, c];
                done[i] = true;
                queue.Enqueue(i, filled[i]);
            }
        }

        var order = new List<int>(cells);
        while (queue.TryDequeue(out var i, out _))
        {
            order.Add(i);
            foreach (var j in Neighbours(i))
            {
                if (!done[j])
                {
                    done[j] = true;
                    filled[j] = Math.Max(z[j / Columns, j % Columns], filled[i] + 1e-4);
                    queue.Enqueue(j, filled[j]);
                }
            }
        }

        var down = new int[cells];
        for (var i = 0; i < cells; i++)
        {
            var (r, c) = (i / Columns, i % Columns);
            down[i] = -1;
            if (r == 0 || c == 0 || r == Rows - 1 || c == Columns - 1)
            {
                continue;
            }

            var steepest = 0.0;
            foreach (var j in Neighbours(i))
            {
                var distance = (j / Columns != r && j % Columns != c) ? Math.Sqrt(2) : 1;
                var slope = (filled[i] - filled[j]) / distance;
                if (slope > steepest)
                {
                    (steepest, down[i]) = (slope, j);
                }
            }
        }

        // Water gathers from the highest point down
        var gathered = Enumerable.Repeat(1.0, cells).ToArray();
        for (var k = order.Count - 1; k >= 0; k--)
        {
            var i = order[k];
            if (down[i] >= 0)
            {
                gathered[down[i]] += gathered[i];
            }
        }

        return (down, gathered);
    }

    // A grid path's stair steps rounded off: a moving average, then fewer points
    private static List<P> Soften(List<P> line)
    {
        var averaged = line.Select((_, i) =>
        {
            var window = line.Skip(Math.Max(0, i - 2)).Take(Math.Min(line.Count, i + 3) - Math.Max(0, i - 2)).ToList();
            return window.Aggregate(new P(0, 0), (sum, p) => sum + p) * (1.0 / window.Count);
        }).ToList();
        averaged[0] = line[0];
        averaged[^1] = line[^1];
        return Geo.Simplify(averaged, 2);
    }
}
