using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using Plantline.Cad;

/// <summary>The functions the web app calls in its CAD worker (web/src/layout/cad.worker.ts).</summary>
[SupportedOSPlatform("browser")]
public static partial class CadExports
{
    /// <summary>Nothing runs at start; the worker calls <see cref="ReadDrawing"/>.</summary>
    public static void Main()
    {
    }

    /// <summary>The DWG or DXF file as drawing JSON; throws (a JS error) when the file cannot be read.</summary>
    [JSExport]
    public static string ReadDrawing(byte[] bytes) => CadReader.ReadJson(bytes);
}
