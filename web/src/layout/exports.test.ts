import { describe, expect, it } from "vitest";
import { LAYOUT_RULES } from "../plants";
import { toCsv, toGeoJson } from "./exports";
import { solarFixture } from "./fixture";
import { createProjector } from "./place";
import { recognize } from "./recognize";

describe("layout exports", () => {
    it("write the recognised objects as GeoJSON, longitude first", () => {
        const drawing = solarFixture();
        const recognition = recognize(drawing, LAYOUT_RULES.solar, 0.001);
        const project = createProjector({ mode: "point", lat: 39, lon: 32, rotationDeg: 0 }, [0, 0], 0.001)!;
        const geojson = JSON.parse(toGeoJson(drawing, recognition, project));
        expect(geojson.type).toBe("FeatureCollection");
        expect(geojson.features).toHaveLength(3 + 4);
        const inverter = geojson.features.find((f: { properties: { kind: string } }) => f.properties.kind === "inverter");
        expect(inverter.properties.ID).toBe("INV-01");
        expect(inverter.geometry.coordinates[0]).toBeGreaterThan(32);
        const fence = geojson.features.find((f: { properties: { kind: string } }) => f.properties.kind === "fence");
        expect(fence.geometry.type).toBe("Polygon");
        expect(fence.geometry.coordinates[0]).toHaveLength(5);
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
