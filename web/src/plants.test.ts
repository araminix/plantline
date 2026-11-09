import { describe, expect, it } from "vitest";
import { LAYOUT_KINDS, LAYOUT_RULES, MEASURE, NODE_KINDS, PALETTE_GROUPS, PALETTES, PLANT_TYPES } from "./plants";

describe("plant types", () => {
    it("give every plant type a palette of known elements, without repeats, starting with its own equipment", () => {
        for (const plant of PLANT_TYPES) {
            const palette = PALETTES[plant];
            expect(palette.every((kind) => NODE_KINDS.includes(kind))).toBe(true);
            expect(new Set(palette).size).toBe(palette.length);
            expect(palette).toContain("gridConnection");
        }
        expect(PALETTES.solar[0]).toBe("pvArray");
        expect(PALETTES.wind[0]).toBe("windTurbine");
        expect(PALETTES.storage[0]).toBe("battery");
        expect(PALETTES.transmission[0]).toBe("overheadLine");
    });

    it("put every element in exactly one palette group", () => {
        const grouped = PALETTE_GROUPS.flatMap((group) => group.kinds);
        expect([...grouped].sort()).toEqual([...NODE_KINDS].sort());
    });

    it("give every plant type layout rules with valid patterns and known kinds", () => {
        for (const plant of PLANT_TYPES) {
            for (const rule of LAYOUT_RULES[plant]) {
                expect(LAYOUT_KINDS).toContain(rule.kind);
                expect(() => new RegExp(rule.pattern, "i")).not.toThrow();
                // Lines are measured and everything else counted, whether by rule or by the user's choice
                expect(rule.measure, rule.kind).toBe(MEASURE[rule.kind]);
            }
        }
    });
});
