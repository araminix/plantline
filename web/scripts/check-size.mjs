// Fails when what browsers download grows past its limits, measured compressed (gzip), as it travels: the app's own
// scripts and styles (all of them, languages included), and the drawing reader (loaded only when a drawing is opened).
// Run after `pnpm build`. node scripts/check-size.mjs [--max-app-kb 300] [--max-reader-mb 7]
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";

const { values } = parseArgs({ options: { "max-app-kb": { type: "string", default: "300" }, "max-reader-mb": { type: "string", default: "7" } } });
const dist = join(dirname(dirname(fileURLToPath(import.meta.url))), "dist");
const files = (folder) =>
    readdirSync(folder, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name));
const compressed = (paths) => paths.reduce((total, path) => total + gzipSync(readFileSync(path), { level: 9 }).length, 0);

const app = compressed(files(join(dist, "assets")).filter((path) => /\.(js|css)$/.test(path))) / 1024;
const reader = compressed(files(join(dist, "cad", "_framework"))) / 2 ** 20;
console.log(`App scripts and styles: ${app.toFixed(0)} KB compressed (limit ${values["max-app-kb"]} KB)`);
console.log(`Drawing reader: ${reader.toFixed(2)} MB compressed (limit ${values["max-reader-mb"]} MB)`);

const failures = [
    app > Number(values["max-app-kb"]) && `The app's scripts and styles grew to ${app.toFixed(0)} KB, over ${values["max-app-kb"]} KB.`,
    reader > Number(values["max-reader-mb"]) && `The drawing reader grew to ${reader.toFixed(2)} MB, over ${values["max-reader-mb"]} MB.`,
].filter(Boolean);
for (const failure of failures) console.error(`::error::${failure}`);
process.exit(failures.length > 0 ? 1 : 0);
