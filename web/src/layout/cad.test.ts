import { afterEach, describe, expect, it, vi } from "vitest";
import { fitsDevice } from "./cad";

const megabytes = (name: string, size: number) => ({ name, size: size * 2 ** 20 });

describe("the drawing reader", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("asks before reading a drawing likely too large for the device's memory", () => {
        vi.stubGlobal("navigator", { deviceMemory: 8 });
        expect(fitsDevice(megabytes("plant.dwg", 20))).toBe(true);
        expect(fitsDevice(megabytes("plant.DWG", 40))).toBe(false);
        expect(fitsDevice(megabytes("plant.dxf", 100))).toBe(true);
        vi.stubGlobal("navigator", { deviceMemory: 2 });
        expect(fitsDevice(megabytes("plant.dwg", 8))).toBe(false);
        // A browser that does not say is taken to have 4 GB
        vi.stubGlobal("navigator", {});
        expect(fitsDevice(megabytes("plant.dwg", 14))).toBe(true);
        expect(fitsDevice(megabytes("plant.dwg", 20))).toBe(false);
    });
});
