// Reads a drawing with the built WebAssembly reader (public/cad, from `pnpm cad`) several times, as a browser does,
// and fails when a reading fails or needs more time or memory than the limits. CI runs it on a generated plant the
// size of a real one (cad/Plantline.Cad.Samples --large), so a reader that grows slower or larger is caught.
// node scripts/check-reader.mjs <drawing> [--runs 3] [--max-seconds 6] [--max-memory-mb 650]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { runs: { type: "string", default: "3" }, "max-seconds": { type: "string", default: "6" }, "max-memory-mb": { type: "string", default: "650" } },
});
const web = dirname(dirname(fileURLToPath(import.meta.url)));
const { dotnet } = await import(pathToFileURL(join(web, "public", "cad", "_framework", "dotnet.js")).href);
const runtime = await dotnet.create();
const { CadExports: reader } = await runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName);
const bytes = new Uint8Array(readFileSync(positionals[0]));

let slowest = 0;
for (let run = 1; run <= Number(values.runs); run++) {
    const started = performance.now();
    const json = reader.ReadDrawing(bytes);
    const points = reader.TakePoints();
    const seconds = (performance.now() - started) / 1000;
    slowest = Math.max(slowest, seconds);
    console.log(`Reading ${run}: ${seconds.toFixed(1)} s, JSON ${(json.length / 1e6).toFixed(2)} M characters, points ${(points.length / 2 ** 20).toFixed(1)} MB`);
}
// WebAssembly memory only grows, so this is the most any reading needed
const memory = runtime.Module.HEAPU8.length / 2 ** 20;
console.log(`Reader memory: ${memory.toFixed(0)} MB`);

const failures = [
    slowest > Number(values["max-seconds"]) && `The slowest reading took ${slowest.toFixed(1)} s, over the limit of ${values["max-seconds"]} s.`,
    memory > Number(values["max-memory-mb"]) && `The reader grew to ${memory.toFixed(0)} MB, over the limit of ${values["max-memory-mb"]} MB.`,
].filter(Boolean);
for (const failure of failures) console.error(`::error::${failure}`);
process.exit(failures.length > 0 ? 1 : 0);
