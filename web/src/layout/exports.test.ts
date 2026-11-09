import { describe, expect, it } from "vitest";
import { LAYOUT_RULES } from "../plants";
import { toCsv, toGeoJson } from "./exports";
import { makeDrawing, solarFixture } from "./fixture";
import { createProjector } from "./place";
import { recognize } from "./recognize";

interface Feature {
    geometry: { type: string; coordinates: number[] & number[][][] };
    properties: Record<string, string>;
}

describe("layout exports", () => {
    it("write the recognised objects as GeoJSON, longitude first", () => {
        const drawing = solarFixture();
        const recognition = recognize(drawing, LAYOUT_RULES.solar, 0.001);
        const project = createProjector({ mode: "point", lat: 39, lon: 32, rotationDeg: 0 }, [0, 0], 0.001)!;
        const features: Feature[] = JSON.parse(toGeoJson(drawing, recognition, project)).features;
        // 2 tables, their 2 modules and an inverter; 2 strings, a cable and a fence
        expect(features).toHaveLength(5 + 4);
        const inverter = features.find((f) => f.properties.kind === "inverter")!;
        expect(inverter.properties).toMatchObject({ ID: "INV-01", block: "INVERTER_250KW", layer: "INVERTERS" });
        expect(inverter.geometry.coordinates[0]).toBeGreaterThan(32);
        const fence = features.find((f) => f.properties.kind === "fence")!;
        expect(fence.geometry.type).toBe("Polygon");
        expect(fence.geometry.coordinates[0]).toHaveLength(5);
    });

    it("put a turned block's point at the centre of what it draws", () => {
        const drawing = makeDrawing("m", { references: [{ block: "INV", layer: "INVERTERS", at: [0, 0], rotation: 90 }] }, { INV: { shapes: [{ layer: "0", points: [0, 0, 100, 0, 100, 2] }] } });
        const project = (x: number, y: number): [number, number] => [y, x];
        const [feature] = JSON.parse(toGeoJson(drawing, recognize(drawing, LAYOUT_RULES.solar, 1), project)).features as Feature[];
        expect(feature!.geometry.coordinates.map((value) => Math.round(value * 1e6) / 1e6)).toEqual([-1, 50]);
    });

    it("write totals as CSV, quoting text and defusing spreadsheet formulas", () => {
        const csv = toCsv(
            [
                { kind: "pvTable", measure: "count", count: 40, lengthM: 0 },
                { kind: "cable", measure: "length", count: 4, lengthM: 512.345 },
            ],
            (kind) => (kind === "pvTable" ? 'PV "table", fixed' : "=HYPERLINK()"),
        );
        expect(csv).toBe(`kind,name,count,length_m\npvTable,"PV ""table"", fixed",40,\ncable,'=HYPERLINK(),4,512.3\n`);
    });
});
