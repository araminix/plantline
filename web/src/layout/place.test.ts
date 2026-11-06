import { describe, expect, it } from "vitest";
import { createProjector, utmProj } from "./place";

describe("placing a drawing on the map", () => {
    it("puts the drawing centre on the chosen point and keeps distances in metres", () => {
        const project = createProjector({ mode: "point", lat: 40, lon: 30, rotationDeg: 0 }, [500, 500], 1)!;
        expect(project(500, 500)).toEqual([40, 30]);
        const [lat, lon] = project(500, 1500);
        expect(lat - 40).toBeCloseTo(1000 / 111_320, 6);
        expect(lon).toBeCloseTo(30, 9);
    });

    it("turns the drawing by the rotation, counter-clockwise", () => {
        const project = createProjector({ mode: "point", lat: 0, lon: 0, rotationDeg: 90 }, [0, 0], 1)!;
        const [lat, lon] = project(1000, 0);
        expect(lat).toBeCloseTo(1000 / 111_320, 6);
        expect(lon).toBeCloseTo(0, 9);
    });

    it("reads coordinates in a projected system, scaled by the drawing unit", () => {
        const project = createProjector({ mode: "crs", proj: utmProj(36, false) }, [0, 0], 0.001)!;
        const [lat, lon] = project(500_000_000, 4_370_000_000);
        expect(lon).toBeCloseTo(33, 6);
        expect(lat).toBeCloseTo(39.48, 1);
    });

    it("refuses a definition that is not one", () => {
        expect(createProjector({ mode: "crs", proj: "+proj=nonsense" }, [0, 0], 1)).toBeNull();
        expect(createProjector({ mode: "crs", proj: "" }, [0, 0], 1)).toBeNull();
    });
});
