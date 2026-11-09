import type { LayoutKind } from "../plants";
import { apply, compose, createBoxes, forEachShape, walk, type Drawing } from "./drawing";
import type { Projector } from "./place";
import type { Recognition, Total } from "./recognize";

type Position = [number, number];
interface Feature {
    type: "Feature";
    geometry: { type: "Point"; coordinates: Position } | { type: "LineString"; coordinates: Position[] } | { type: "Polygon"; coordinates: Position[][] };
    properties: Record<string, string | number>;
}

/**
 * The recognised objects of every placed copy as GeoJSON (longitude, latitude): block references as points at the
 * centre of what they draw, shapes as lines or polygons.
 */
export function toGeoJson(drawing: Drawing, recognition: Recognition, project: Projector): string {
    const lonLat = (x: number, y: number): Position => {
        const [lat, lon] = project(x, y);
        return [round(lon), round(lat)];
    };
    const boxOf = createBoxes(drawing);
    const features: Feature[] = [];
    walk(drawing, null, (block, transform, depth) => {
        const kinds = recognition.kinds.get(block)!;
        block.references.forEach((reference, i) => {
            const kind = kinds.references[i];
            const box = kind && boxOf(drawing.blocks[reference.block]!, depth + 1);
            if (!kind || !box) return;
            const centre = apply(compose(transform, reference.transform), (box[0] + box[2]) / 2, (box[1] + box[3]) / 2);
            const properties = { kind, block: drawing.blocks[reference.block]!.name, layer: drawing.layers[reference.layer]!, ...reference.attributes };
            features.push({ type: "Feature", geometry: { type: "Point", coordinates: lonLat(...centre) }, properties });
        });
        forEachShape(block, (index, layer, closed, first, count) => {
            const kind = kinds.shapes[index];
            if (!kind) return;
            const ring: Position[] = [];
            for (let p = first; p < first + count; p++) ring.push(lonLat(...apply(transform, drawing.points[p * 2]!, drawing.points[p * 2 + 1]!)));
            const geometry: Feature["geometry"] = closed ? { type: "Polygon", coordinates: [[...ring, ring[0]!]] } : { type: "LineString", coordinates: ring };
            features.push({ type: "Feature", geometry, properties: { kind, layer: drawing.layers[layer]! } });
        });
        return null;
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
