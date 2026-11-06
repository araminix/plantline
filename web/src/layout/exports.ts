import type { LayoutKind } from "../plants";
import type { Drawing } from "./drawing";
import type { Projector } from "./place";
import type { Recognition, Total } from "./recognize";

type Position = [number, number];
interface Feature {
    type: "Feature";
    geometry: { type: "Point"; coordinates: Position } | { type: "LineString"; coordinates: Position[] } | { type: "Polygon"; coordinates: Position[][] };
    properties: Record<string, string | number>;
}

/** The recognised objects as GeoJSON (longitude, latitude): block references as points, shapes as lines or polygons. */
export function toGeoJson(drawing: Drawing, recognition: Recognition, project: Projector): string {
    const lonLat = (x: number, y: number): Position => {
        const [lat, lon] = project(x, y);
        return [round(lon), round(lat)];
    };
    const features: Feature[] = [];
    drawing.inserts.forEach((insert, i) => {
        const kind = recognition.insertKinds[i];
        if (!kind) return;
        const centre = lonLat((insert.box[0] + insert.box[2]) / 2, (insert.box[1] + insert.box[3]) / 2);
        features.push({ type: "Feature", geometry: { type: "Point", coordinates: centre }, properties: { kind, block: insert.block, layer: insert.layer, ...insert.attributes } });
    });
    drawing.shapes.forEach((shape, i) => {
        const kind = recognition.shapeKinds[i];
        if (!kind) return;
        const ring: Position[] = [];
        for (let p = 0; p < shape.points.length - 1; p += 2) ring.push(lonLat(shape.points[p]!, shape.points[p + 1]!));
        const geometry: Feature["geometry"] = shape.closed ? { type: "Polygon", coordinates: [[...ring, ring[0]!]] } : { type: "LineString", coordinates: ring };
        features.push({ type: "Feature", geometry, properties: { kind, layer: shape.layer } });
    });
    return JSON.stringify({ type: "FeatureCollection", features });
}

/** The totals as CSV: kind (stable key), name (in the user's language), count and length in metres. */
export function toCsv(totals: readonly Total[], name: (kind: LayoutKind) => string): string {
    const rows = totals.map((total) => [total.kind, name(total.kind), String(total.count), total.measure === "length" ? total.lengthM.toFixed(1) : ""]);
    return [["kind", "name", "count", "length_m"], ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

const round = (value: number) => Math.round(value * 1e7) / 1e7;

// Quotes a cell when needed, and defuses cells a spreadsheet would run as a formula
const csvCell = (value: string) => {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};
