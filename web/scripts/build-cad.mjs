// Builds the CAD reader (cad/Plantline.Cad.Browser) to WebAssembly and copies it to public/cad, where the app's CAD
// worker loads it. Needs the .NET 10 SDK; run it once before `pnpm dev`, and again after changing cad/.
//
// With the .NET "wasm-tools" workload installed, the reader is compiled ahead of time: about 4 times faster on large
// drawings, for a larger download (the site ships it; CI runs `pnpm cad --aot`, which requires the workload). Without
// it, the reader is interpreted: slower, but the same reader.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = dirname(dirname(fileURLToPath(import.meta.url)));
const project = join(web, "..", "cad", "Plantline.Cad.Browser");
const output = mkdtempSync(join(tmpdir(), "plantline-cad-"));
const target = join(web, "public", "cad", "_framework");

const aot = /^wasm-tools\b/m.test(execFileSync("dotnet", ["workload", "list"], { cwd: project, encoding: "utf8" }));
if (!aot && process.argv.includes("--aot")) {
    console.error("The wasm-tools workload is needed to compile the reader ahead of time: dotnet workload install wasm-tools");
    process.exit(1);
}
console.log(aot ? "Compiling the reader ahead of time (a few minutes)…" : "Building the interpreted reader (install the wasm-tools workload for the faster one)…");

try {
    execFileSync("dotnet", ["publish", project, "-c", "Release", "-o", output, "-nologo", "-v", "q", `-p:RunAOTCompilation=${aot}`], { stdio: "inherit" });
    rmSync(target, { recursive: true, force: true });
    cpSync(join(output, "wwwroot", "_framework"), target, { recursive: true });
    console.log(`CAD reader copied to ${target}`);
} finally {
    rmSync(output, { recursive: true, force: true });
}
