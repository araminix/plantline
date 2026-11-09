using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using Plantline.Cad;

/// <summary>The functions the web app calls in its CAD worker (web/src/layout/cad.worker.ts).</summary>
[SupportedOSPlatform("browser")]
public static partial class CadExports
{
    private static Drawing? last;

    /// <summary>Nothing runs at start; the worker calls <see cref="ReadDrawing"/>.</summary>
    public static void Main()
    {
    }

    /// <summary>The DWG or DXF file as drawing JSON (without its points); throws (a JS error) when the file cannot be read.</summary>
    [JSExport]
    public static string ReadDrawing(byte[] bytes)
    {
        last = CadReader.Read(bytes);
        return CadReader.ToJson(last);
    }

    /// <summary>The points of the drawing read last, as little-endian 64-bit numbers; the reader then lets the drawing go.</summary>
    [JSExport]
    public static byte[] TakePoints()
    {
        var bytes = last is null ? [] : CadReader.PointBytes(last);
        last = null;
        return bytes;
    }
}
