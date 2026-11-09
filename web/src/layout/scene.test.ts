import L from "leaflet";
import { describe, expect, it } from "vitest";
import { LAYOUT_RULES } from "../plants";
import { apply, METRES_PER_UNIT, type Drawing } from "./drawing";
import { makeDrawing, solarFixture } from "./fixture";
import { createProjector, utmProj, type Placement } from "./place";
import { recognize } from "./recognize";
import { buildScene, FRAME_SCALE, GREY, mercator, unmercator } from "./scene";

const sceneOf = (drawing: Drawing, placement: Placement, centre: [number, number] = [0, 0]) => {
    const metresPerUnit = METRES_PER_UNIT[drawing.units];
    const project = createProjector(placement, centre, metresPerUnit)!;
    const scene = buildScene(drawing, recognize(drawing, LAYOUT_RULES.solar, metresPerUnit), { project, metresPerUnit, colorOf: () => "#e11d48", isFilled: () => true });
    // Where a drawing point lands in the frame when projected exactly
    const exact = (x: number, y: number) => {
        const [px, py] = mercator(...project(x, y));
        return [(px - scene.origin[0]) * FRAME_SCALE, (py - scene.origin[1]) * FRAME_SCALE];
    };
    return { scene, exact };
};

/** Frame units in a metre at a latitude. */
const perMetre = (lat: number) => (FRAME_SCALE * 256) / (40_075_016.686 * Math.cos((lat * Math.PI) / 180));

describe("the map scene", () => {
    it("uses Leaflet's Web Mercator pixels and turns them back into latitude and longitude", () => {
        for (const [lat, lon] of [
            [39.9, 32.8],
            [-33.9, 151.2],
            [0, 0],
        ] as const) {
            const leaflet = L.CRS.EPSG3857.latLngToPoint(L.latLng(lat, lon), 0);
            expect(mercator(lat, lon)[0]).toBeCloseTo(leaflet.x, 9);
            expect(mercator(lat, lon)[1]).toBeCloseTo(leaflet.y, 9);
            expect(unmercator(...mercator(lat, lon))[0]).toBeCloseTo(lat, 9);
            expect(unmercator(...mercator(lat, lon))[1]).toBeCloseTo(lon, 9);
        }
    });

    it("draws a small plant through transforms only, each block's shapes kept once", () => {
        const { scene, exact } = sceneOf(solarFixture(), { mode: "point", lat: 39, lon: 32, rotationDeg: 30 });
        expect(scene.projected.size).toBe(0);
        expect(scene.placed.map((block) => block.placements.length).sort()).toEqual([1, 1, 2, 2]);
        expect(scene.colors[0]).toBe(GREY);
        expect(scene.boxes.get("#e11d48")).toHaveLength(3 * 8);
        // The second table's outline corner, placed through its transform, lands where exact projection puts it
        const table = scene.placed.find((block) => block.paint.get(GREY)?.lines.coords.includes(10000))!;
        const [, second] = table.placements;
        const placed = apply(second!.transform, -10000, -2000);
        const expected = exact(22000 - 10000, -2000);
        expect(Math.hypot(placed[0] - expected[0]!, placed[1] - expected[1]!) / perMetre(39)).toBeLessThan(0.02);
    });

    it("projects a large plant's own shapes point by point and still places its small blocks through transforms", () => {
        const drawing = makeDrawing(
            "m",
            {
                shapes: [{ layer: "FENCE", closed: true, points: [470000, 4330000, 475000, 4330000, 475000, 4334000, 470000, 4334000] }],
                references: [{ block: "INV", layer: "INVERTERS", at: [474900, 4333900], rotation: 45 }],
            },
            { INV: { shapes: [{ layer: "0", closed: true, points: [-2, -1, 2, -1, 2, 1, -2, 1] }] } },
        );
        const { scene, exact } = sceneOf(drawing, { mode: "crs", proj: utmProj(36, false) });
        expect([...scene.projected.values()].flatMap((paint) => [paint.lines.ends.length, paint.fills.ends.length]).reduce((a, b) => a + b)).toBe(1);
        const inverter = scene.placed.find((block) => block.placements.length === 1)!;
        const placed = apply(inverter.placements[0]!.transform, 2, 1);
        const expected = exact(...apply([Math.SQRT1_2, Math.SQRT1_2, -Math.SQRT1_2, Math.SQRT1_2, 474900, 4333900], 2, 1));
        expect(Math.hypot(placed[0] - expected[0]!, placed[1] - expected[1]!) / perMetre(39)).toBeLessThan(0.02);
        const [x1, y1, x2, y2] = scene.bounds!;
        expect((x2 - x1) / perMetre(39.1)).toBeCloseTo(5000, -2);
        expect((y2 - y1) / perMetre(39.1)).toBeCloseTo(4000, -2);
    });

    it("says when a drawing places more copies than it can draw", () => {
        const tenOf = (block: string) => ({ references: Array.from({ length: 10 }, (_, i) => ({ block, layer: "0", at: [i, 0] as [number, number] })) });
        const blocks = Object.fromEntries(Array.from({ length: 8 }, (_, level) => [`B${level}`, level < 7 ? tenOf(`B${level + 1}`) : { shapes: [{ layer: "0", points: [0, 0, 1, 1] }] }]));
        const { scene } = sceneOf(makeDrawing("m", tenOf("B0"), blocks), { mode: "point", lat: 0, lon: 0, rotationDeg: 0 });
        expect(scene.complete).toBe(false);
    });
});
