// Fetches the ground of a sample site: SRTM 1 arc-second elevations (NASA/USGS, public domain) through the
// OpenTopoData API, on a square grid in UTM coordinates, written as <name>.grid beside this script.
// node fetch.mjs <name> <zone> <east> <north> <columns> <rows> <step>
// (east, north: the grid's south-west corner in metres; the API takes 100 points a second at most.)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [name, zone, east, north, columns, rows, step] = process.argv.slice(2).map((value, i) => (i === 0 ? value : Number(value)));

// UTM (WGS 84, northern hemisphere) to latitude and longitude, after Snyder's "Map Projections: A Working Manual"
function toLatLon(e, n) {
    const [a, f, k0] = [6378137, 1 / 298.257223563, 0.9996];
    const e2 = f * (2 - f);
    const ep2 = e2 / (1 - e2);
    const m = n / k0;
    const mu = m / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const phi1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu);
    const [sin, cos, tan] = [Math.sin(phi1), Math.cos(phi1), Math.tan(phi1)];
    const c1 = ep2 * cos ** 2;
    const t1 = tan ** 2;
    const n1 = a / Math.sqrt(1 - e2 * sin ** 2);
    const r1 = (a * (1 - e2)) / (1 - e2 * sin ** 2) ** 1.5;
    const d = (e - 500000) / (n1 * k0);
    const lat = phi1 - ((n1 * tan) / r1) * (d ** 2 / 2 - ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4) / 24 + ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6) / 720);
    const lon = (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5) / 120) / cos;
    return [(lat * 180) / Math.PI, (zone - 1) * 6 - 180 + 3 + (lon * 180) / Math.PI];
}

const points = [];
for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
        points.push(toLatLon(east + column * step, north + row * step));
    }
}

const elevations = [];
for (let i = 0; i < points.length; i += 100) {
    const locations = points.slice(i, i + 100).map(([lat, lon]) => `${lat.toFixed(6)},${lon.toFixed(6)}`).join("|");
    for (let attempt = 1; ; attempt++) {
        const response = await fetch(`https://api.opentopodata.org/v1/srtm30m?locations=${locations}`);
        if (response.ok) {
            elevations.push(...(await response.json()).results.map((result) => result.elevation ?? 0));
            break;
        }
        if (attempt === 5) throw new Error(`OpenTopoData: ${response.status}`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    await new Promise((resolve) => setTimeout(resolve, 1100));
    process.stdout.write(`\r${Math.min(i + 100, points.length)} / ${points.length}`);
}

const lines = [
    "# SRTM 1 arc-second elevations (NASA/USGS, public domain) through OpenTopoData, metres",
    "# zone east north step columns rows, then the rows from the south, each from the west",
    `${zone} ${east} ${north} ${step} ${columns} ${rows}`,
];
for (let row = 0; row < rows; row++) {
    lines.push(elevations.slice(row * columns, (row + 1) * columns).map((z) => Math.round(z)).join(" "));
}
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), `${name}.grid`), lines.join("\n") + "\n");
console.log(`\n${name}.grid: ${columns} x ${rows}, ${Math.min(...elevations)}..${Math.max(...elevations)} m`);
