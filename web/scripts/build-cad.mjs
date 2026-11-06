// Builds the CAD reader (cad/Plantline.Cad.Browser) to WebAssembly and copies it to public/cad, where the app's CAD
// worker loads it. Needs the .NET 10 SDK; run it once before `pnpm dev`, and again after changing cad/.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = dirname(dirname(fileURLToPath(import.meta.url)));
const project = join(web, "..", "cad", "Plantline.Cad.Browser");
const output = mkdtempSync(join(tmpdir(), "plantline-cad-"));
const target = join(web, "public", "cad", "_framework");

try {
    execFileSync("dotnet", ["publish", project, "-c", "Release", "-o", output, "-nologo", "-v", "q"], { stdio: "inherit" });
    rmSync(target, { recursive: true, force: true });
    cpSync(join(output, "wwwroot", "_framework"), target, { recursive: true });
    console.log(`CAD reader copied to ${target}`);
} finally {
    rmSync(output, { recursive: true, force: true });
}
