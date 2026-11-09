import { beforeEach, describe, expect, it } from "vitest";
import { LAYOUT_RULES } from "../plants";
import { drawingKey, recall, remember, type DrawingSettings } from "./memory";

const settings = (lat: number): DrawingSettings => ({
    unit: "m",
    placement: { mode: "point", lat, lon: 37, rotationDeg: 12.5 },
    rules: { solar: [...LAYOUT_RULES.solar] },
    assignments: { blocks: { EARTH: "skip", "590W": "pvModule" }, layers: { "PVcase Inverters": "none" } },
    hidden: ["ANTET"],
    moduleWp: 590,
    modulesPerTable: 56,
});

describe("remembered drawings", () => {
    beforeEach(() => localStorage.clear());

    it("bring back what was set for the same file, by name and size", () => {
        const key = drawingKey({ name: "plant.dwg", size: 7_874_968 });
        expect(recall(key)).toBeNull();
        expect(remember(key, settings(39.7))).toBe(true);
        expect(recall(key)).toEqual(settings(39.7));
        expect(recall(drawingKey({ name: "plant.dwg", size: 1 }))).toBeNull();
    });

    it("keep the 20 most recently used, and ignore what is not as expected", () => {
        for (let i = 0; i < 22; i++) remember(`drawing-${i}`, settings(i));
        expect(recall("drawing-0")).toBeNull();
        expect(recall("drawing-1")).toBeNull();
        expect(recall("drawing-21")?.placement).toMatchObject({ lat: 21 });
        localStorage.setItem("plantline.drawings", JSON.stringify({ bad: { ...settings(1), unit: "parsec", usedAt: 1 }, good: { ...settings(2), usedAt: 1 } }));
        expect(recall("bad")).toBeNull();
        expect(recall("good")?.placement).toMatchObject({ lat: 2 });
    });
});
