import { describe, expect, it } from "vitest";
import { looksProjected, sizeOf, unitAdvice } from "./where";

describe("where a drawing lies", () => {
    it("notices a plant drawn in metres but labelled millimetres, and suggests metres", () => {
        // Like a real 1.4 km plant whose file says millimetres
        const bounds: [number, number, number, number] = [1256, 1563, 2696, 2357];
        expect(sizeOf(bounds, "mm")).toBeCloseTo(1.44);
        expect(unitAdvice(bounds, "mm")).toBe("m");
        expect(unitAdvice(bounds, "m")).toBeNull();
        // A plant drawn in millimetres and labelled metres would be 1,440 km wide
        expect(unitAdvice([0, 0, 1_440_000, 800_000], "m")).toBe("mm");
        // A 3.6 km wind farm labelled millimetres: metres, the most common unit, rather than feet
        expect(unitAdvice([0, 0, 3600, 900], "mm")).toBe("m");
    });

    it("tells projected coordinates from local ones", () => {
        expect(looksProjected([470_000, 4_330_000, 470_300, 4_330_200], "m")).toBe(true);
        expect(looksProjected([1256, 1563, 2696, 2357], "m")).toBe(false);
        // The same projected coordinates, labelled millimetres: not projected until the unit is right
        expect(looksProjected([470_000, 4_330_000, 470_300, 4_330_200], "mm")).toBe(false);
    });
});
