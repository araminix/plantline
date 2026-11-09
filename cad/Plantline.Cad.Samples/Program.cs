using ACadSharp;
using ACadSharp.IO;
using Plantline.Cad.Samples;

// Writes the made-up sample drawings of the web app (web/public/samples), one per plant type, drawn the way real
// plant drawings are: on a sheet with a title block, in survey or site coordinates, with the layers, blocks and
// annotations design teams use.
// Run: dotnet run --project cad/Plantline.Cad.Samples -- web/public/samples
// With --large, writes only large-plant.dwg, a drawing the size of a real plant for CI's reading limits (not committed):
// dotnet run --project cad/Plantline.Cad.Samples -- --large <folder>
if (args is ["--large", var folder])
{
    Directory.CreateDirectory(folder);
    Save(Large.Draw(), folder, "large-plant", dwg: true, dxf: false);
    return;
}

var output = args.Length > 0 ? args[0] : "samples";
Directory.CreateDirectory(output);

Save(Solar.Draw(), output, "solar-plant", dwg: true);
Save(Wind.Draw(), output, "wind-farm");
Save(Storage.Draw(), output, "battery-storage");
Save(Hydro.Draw(), output, "hydro-plant");
Save(Substation.Draw(), output, "substation");
Save(Transmission.Draw(), output, "transmission-line");

static void Save(CadDocument document, string folder, string name, bool dwg = false, bool dxf = true)
{
    if (dxf)
    {
        using var writer = new DxfWriter(Path.Combine(folder, name + ".dxf"), document, false);
        writer.Write();
    }

    if (dwg)
    {
        using var writer = new DwgWriter(Path.Combine(folder, name + ".dwg"), document);
        writer.Write();
    }

    Console.WriteLine($"{name}: {document.Entities.Count} entities");
}
