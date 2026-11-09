using System.Globalization;
using ACadSharp.Entities;
using ACadSharp.Tables;

namespace Plantline.Cad.Samples;

/// <summary>An item of a sheet's legend: what it stands for, drawn as a line, a dashed line, a box or a circle in the colour of its layer.</summary>
internal sealed record LegendItem(string Label, Layer Layer, string Shape = "line");

/// <summary>
/// A drawing sheet laid in model space around the plan, as plant drawings are made: the frame and title block of a
/// paper size at a scale, a north arrow, a scale bar, the legend and notes in a column on the right, and coordinate
/// grid crosses. Its parts are drawn in paper millimetres inside blocks and placed at the scale.
/// </summary>
internal sealed class Sheet
{
    private const double Column = 180;
    private readonly Plan plan;
    private readonly Pen pen;

    /// <param name="origin">The frame's lower left corner, in metres.</param>
    public Sheet(Plan plan, Pen pen, string paper, double scale, P origin)
    {
        (this.plan, this.pen, Paper, Scale, Origin) = (plan, pen, paper, scale, origin);
        (Width, Height) = paper == "A0" ? (1189.0, 841.0) : (841.0, 594.0);
    }

    public string Paper { get; }

    public double Scale { get; }

    public P Origin { get; }

    public double Width { get; }

    public double Height { get; }

    /// <summary>Metres per paper millimetre.</summary>
    public double M => Scale / 1000;

    /// <summary>A point of the paper (millimetres from the frame's lower left corner) in metres.</summary>
    public P At(double x, double y) => Origin + new P(x, y) * M;

    /// <summary>The frame, the title block with its values, the north arrow and the scale bar.</summary>
    public void Frame(string project, string title, string number, string date)
    {
        var (w, h, x0) = (Width, Height, Width - 10 - Column);
        var frame = plan.Layer("TITLE-FRAME", 7);
        var lines = plan.Layer("TITLE-BLOCK", 7);
        var texts = plan.Layer("TITLE-TEXT", 7);
        var paper = new Pen(1);
        var label = (double x, double y, string text) => paper.Text(texts, x, y, 2, text);
        var block = plan.Block($"FRAME_{Paper}",
        [
            paper.Rect(frame, 0, 0, w, h),
            paper.Rect(frame, 20, 10, w - 10, h - 10),
            paper.Rect(lines, x0, 10, w - 10, 110),
            ..new[] { 95.0, 75, 60, 45, 22 }.Select(y => paper.Line(lines, x0, y, w - 10, y)),
            ..new[] { 60.0, 105, 145 }.SelectMany(x => new[] { paper.Line(lines, x0 + x, 45, x0 + x, 75) }),
            paper.Line(lines, x0 + 15, 22, x0 + 15, 45),
            paper.Line(lines, x0 + 45, 22, x0 + 45, 45),
            paper.Line(lines, x0, 40, w - 10, 40),
            label(x0 + 2, 106, "PROJECT"),
            label(x0 + 2, 91, "DRAWING TITLE"),
            label(x0 + 2, 71, "DRAWING No."),
            label(x0 + 62, 71, "REV"),
            label(x0 + 107, 71, "SCALE"),
            label(x0 + 147, 71, "SIZE"),
            label(x0 + 2, 56, "DATE"),
            label(x0 + 62, 56, "DRAWN"),
            label(x0 + 107, 56, "CHECKED"),
            label(x0 + 147, 56, "APPROVED"),
            label(x0 + 2, 41.5, "REV"),
            label(x0 + 17, 41.5, "DATE"),
            label(x0 + 47, 41.5, "DESCRIPTION"),
            paper.Text(texts, x0 + 2, 17, 2.5, "SAMPLE DRAWING, MADE UP FOR PLANTLINE. NOT FOR CONSTRUCTION."),
            paper.Text(texts, x0 + 2, 12.5, 2, "github.com/araminix/plantline"),
        ]);
        var insert = pen.Put(block, frame, Origin.X, Origin.Y, 0, M * pen.K);
        var value = (string tag, string text, double x, double y, double size) =>
        {
            var at = At(x0 + x, y);
            pen.Tag(insert, tag, text, at.X, at.Y, size * M);
        };
        value("PROJECT", project, 2, 98, 4);
        value("TITLE", title, 2, 79, 5);
        value("DWG_NO", number, 2, 63, 3.5);
        value("REV", "B", 62, 63, 3.5);
        value("SCALE", $"1:{Scale:0}", 107, 63, 3.5);
        value("SIZE", Paper, 147, 63, 3.5);
        value("DATE", date, 2, 48, 3);
        value("DRAWN", "plantline", 62, 48, 3);
        value("CHECKED", "-", 107, 48, 3);
        value("APPROVED", "-", 147, 48, 3);
        value("REV_A", "A", 2, 34, 2.5);
        value("REV_A_DATE", "2026-10-12", 17, 34, 2.5);
        value("REV_A_TEXT", "Issued for review", 47, 34, 2.5);
        value("REV_B", "B", 2, 27, 2.5);
        value("REV_B_DATE", date, 17, 27, 2.5);
        value("REV_B_TEXT", "Issued for permit, comments included", 47, 27, 2.5);
        plan.Add(insert);

        var symbols = plan.Layer("TITLE-SYMBOLS", 7);
        var north = plan.Block("NORTH_ARROW",
        [
            paper.Circle(symbols, 0, 0, 10),
            paper.Poly(symbols, true, 0, 12, 4, -8, 0, -4, -4, -8),
            paper.Text(symbols, 0, 14, 5, "N", 0, centred: true),
        ]);
        var northAt = At(w - 25, h - 30);
        plan.Add(pen.Put(north, symbols, northAt.X, northAt.Y, 0, M * pen.K));

        var metres = Scale / 10;
        var bar = plan.Block($"SCALE_BAR_1-{Scale:0}",
        [
            paper.Rect(symbols, 0, 0, 100, 2.5),
            new Solid { FirstCorner = new(0, 0, 0), SecondCorner = new(25, 0, 0), ThirdCorner = new(0, 2.5, 0), FourthCorner = new(25, 2.5, 0), Layer = symbols },
            new Solid { FirstCorner = new(50, 0, 0), SecondCorner = new(75, 0, 0), ThirdCorner = new(50, 2.5, 0), FourthCorner = new(75, 2.5, 0), Layer = symbols },
            ..new[] { 0, 0.25, 0.5, 1 }.Select(f => paper.Text(symbols, f * 100, -5, 2.5, f == 1 ? $"{metres:0} m" : $"{f * metres:0.#}", 0, centred: true)),
            paper.Text(symbols, 0, 5, 3, $"SCALE 1:{Scale:0} ({Paper})"),
        ]);
        var barAt = At(x0, 120);
        plan.Add(pen.Put(bar, symbols, barAt.X, barAt.Y, 0, M * pen.K));
    }

    /// <summary>The legend at the top of the right column; returns the paper height it takes.</summary>
    public double Legend(IReadOnlyList<LegendItem> items)
    {
        var layer = plan.Layer("LEGEND", 7);
        var paper = new Pen(1);
        var entities = new List<Entity> { paper.Text(layer, 0, 0, 4, "LEGEND") };
        for (var i = 0; i < items.Count; i++)
        {
            var (item, y) = (items[i], -9 - i * 7.5);
            var color = item.Layer.Color;
            IEnumerable<Entity> sample = item.Shape switch
            {
                "box" => [paper.Rect(layer, 0, y - 2, 14, y + 2)],
                "circle" => [paper.Circle(layer, 7, y, 2.2)],
                "dash" => Enumerable.Range(0, 4).Select(d => (Entity)paper.Line(layer, d * 4, y, d * 4 + 2.4, y)),
                _ => [paper.Line(layer, 0, y, 14, y)],
            };
            foreach (var entity in sample)
            {
                entity.Color = color;
                entities.Add(entity);
            }

            entities.Add(paper.Text(layer, 18, y - 1.2, 2.5, item.Label));
        }

        var at = At(Width - 10 - Column + 2, Height - 18);
        plan.Add(pen.Put(plan.Block("LEGEND", entities), layer, at.X, at.Y, 0, M * pen.K));
        return 12 + items.Count * 7.5;
    }

    /// <summary>Numbered general notes in the right column, from a paper height below the frame's top.</summary>
    public void Notes(IReadOnlyList<string> notes, double below)
    {
        var layer = plan.Layer("NOTES", 7);
        var paper = new Pen(1);
        var entities = new List<Entity> { paper.Text(layer, 0, 0, 4, "GENERAL NOTES") };
        var y = -9.0;
        for (var i = 0; i < notes.Count; i++)
        {
            var lines = Wrap(notes[i], 68);
            for (var l = 0; l < lines.Count; l++)
            {
                entities.Add(paper.Text(layer, l == 0 ? 0 : 6, y, 2.5, l == 0 ? $"{i + 1}. {lines[l]}" : lines[l]));
                y -= 4.5;
            }

            y -= 1.5;
        }

        var at = At(Width - 10 - Column + 2, Height - 18 - below);
        plan.Add(pen.Put(plan.Block("GENERAL_NOTES", entities), layer, at.X, at.Y, 0, M * pen.K));
    }

    /// <summary>
    /// Grid crosses every <paramref name="step"/> metres over the plan (not the right column), labelled along the
    /// frame's left and bottom edges with the coordinates <paramref name="name"/> gives.
    /// </summary>
    public void Grid(double step, Func<double, double, (string X, string Y)> name)
    {
        var layer = plan.Layer("GRID-COORDINATES", 8);
        var (from, to) = (At(20, 10), At(Width - 10 - Column - 5, Height - 10));
        var size = 2 * M;
        for (var x = Math.Ceiling(from.X / step) * step; x < to.X; x += step)
        {
            for (var y = Math.Ceiling(from.Y / step) * step; y < to.Y; y += step)
            {
                plan.Add(pen.Line(layer, x - size, y, x + size, y));
                plan.Add(pen.Line(layer, x, y - size, x, y + size));
            }

            plan.Add(pen.Text(layer, x, from.Y + 2 * M, 2.2 * M, name(x, 0).X, 90));
        }

        for (var y = Math.Ceiling(from.Y / step) * step; y < to.Y; y += step)
        {
            plan.Add(pen.Text(layer, from.X + 2 * M, y + 1 * M, 2.2 * M, name(0, y).Y));
        }
    }

    /// <summary>A detail drawn true size in metres, placed on the sheet at a paper point at its own scale, titled under it.</summary>
    public void Detail(string name, string title, double detailScale, double x, double y, IEnumerable<Entity> entities)
    {
        var layer = plan.Layer("DETAILS", 7);
        var text = plan.Layer("DETAILS-TEXT", 7);
        var at = At(x, y);
        var enlarge = Scale / detailScale;
        var list = entities.ToList();
        var lowest = list.SelectMany(entity => entity switch
        {
            Line line => new[] { line.StartPoint.Y, line.EndPoint.Y },
            LwPolyline polyline => polyline.Vertices.Select(vertex => vertex.Location.Y),
            Circle circle => [circle.Center.Y - circle.Radius],
            TextEntity label => [label.InsertPoint.Y],
            _ => [],
        }).DefaultIfEmpty(0).Min();
        plan.Add(pen.Put(plan.Block(name, list), layer, at.X, at.Y, 0, enlarge));
        plan.Add(pen.Text(text, at.X, at.Y + lowest * enlarge / pen.K - 7 * M, 3.5 * M, $"{title}  1:{detailScale:0}"));
    }

    /// <summary>Text lines of at most a width in characters, broken between words.</summary>
    public static List<string> Wrap(string text, int width)
    {
        var lines = new List<string> { "" };
        foreach (var word in text.Split(' '))
        {
            if (lines[^1].Length > 0 && lines[^1].Length + 1 + word.Length > width)
            {
                lines.Add("");
            }

            lines[^1] = lines[^1].Length == 0 ? word : $"{lines[^1]} {word}";
        }

        return lines;
    }

    /// <summary>A number with spaces between thousands, as survey coordinates are written.</summary>
    public static string Spaced(double value) => value.ToString("#,0", CultureInfo.InvariantCulture).Replace(',', ' ');
}

/// <summary>The ground of a plan as contour lines: minor ones, and every few a major one labelled with its elevation.</summary>
internal static class Topography
{
    public static void Draw(Plan plan, Pen pen, List<Contour> contours, double majorEvery, double textHeight)
    {
        var minor = plan.Layer("TOPO-CONTOUR-MINOR", 252);
        var major = plan.Layer("TOPO-CONTOUR-MAJOR", 8);
        var labels = plan.Layer("TOPO-TEXT", 8);
        foreach (var contour in contours)
        {
            var isMajor = Math.Abs(contour.Level / majorEvery - Math.Round(contour.Level / majorEvery)) < 1e-6;
            plan.Add(pen.Poly(isMajor ? major : minor, contour.Closed, contour.Points));
            var length = Geo.Length(contour.Points);
            if (isMajor && length > textHeight * 30)
            {
                var (point, direction) = Geo.At(contour.Points, length / 2);
                var angle = direction.Degrees;
                angle = angle > 90 ? angle - 180 : angle < -90 ? angle + 180 : angle;
                plan.Add(pen.Text(labels, point.X, point.Y, textHeight, $"{contour.Level:0}", angle, centred: true));
            }
        }
    }
}
