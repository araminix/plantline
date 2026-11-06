import { describe, expect, it } from "vitest";
import { drawingBounds, parseDrawing, polylineLength } from "./drawing";
import { solarFixture } from "./fixture";

describe("drawing data", () => {
    it("accepts the reader's JSON and refuses anything else", () => {
        const drawing = solarFixture();
        expect(parseDrawing(JSON.stringify(drawing))).toEqual(drawing);
        expect(() => parseDrawing("null")).toThrow();
        expect(() => parseDrawing(JSON.stringify({ ...drawing, units: "furlong" }))).toThrow();
        expect(() => parseDrawing(JSON.stringify({ ...drawing, shapes: {} }))).toThrow();
    });

    it("measures the extent and the length of open and closed polylines", () => {
        expect(drawingBounds(solarFixture())).toEqual([-20000, -20000, 60000, 20000]);
        expect(drawingBounds({ ...solarFixture(), shapes: [], inserts: [] })).toBeNull();
        expect(polylineLength([0, 0, 3, 4], false)).toBe(5);
        expect(polylineLength([0, 0, 10, 0, 10, 10, 0, 10], true)).toBe(40);
        expect(polylineLength([0, 0, 10, 0, 10, 10, 0, 10], false)).toBe(30);
    });
});
