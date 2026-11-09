import { describe, expect, it } from "vitest";
import { LAYOUT_RULES } from "../plants";
import { METRES_PER_UNIT } from "./drawing";
import { makeDrawing, solarFixture } from "./fixture";
import { recognize } from "./recognize";

describe("recognition", () => {
    it("counts tables, strings and inverters and measures cables and the fence in metres", () => {
        const result = recognize(solarFixture(), LAYOUT_RULES.solar, METRES_PER_UNIT.mm);
        const total = (kind: string) => result.totals.find((t) => t.kind === kind)!;
        expect(total("pvTable").count).toBe(2);
        expect(total("pvString").count).toBe(2);
        expect(total("inverter").count).toBe(1);
        expect(total("cable").lengthM).toBeCloseTo(14);
        expect(total("fence").lengthM).toBeCloseTo(240);
        expect(total("road")).toMatchObject({ count: 0, lengthM: 0 });
        expect(result.complete).toBe(true);
    });

    it("does not count a block nested in a table, nor the table's own outline, again", () => {
        const drawing = solarFixture();
        const { kinds } = recognize(drawing, LAYOUT_RULES.solar, 0.001);
        expect(kinds.get(drawing.model)).toEqual({ shapes: ["pvString", "pvString", "cable", "fence"], references: ["pvTable", "pvTable", "inverter"] });
        expect(kinds.get(drawing.blocks[0]!)).toEqual({ shapes: [null], references: [null] });
    });

    it("counts every placed copy of a nested block and measures lines inside blocks in each copy", () => {
        const drawing = makeDrawing(
            "m",
            { references: [0, 1, 2].map((i) => ({ block: "ROW", layer: "0", at: [0, i * 10] as [number, number] })) },
            {
                ROW: { references: [0, 1, 2, 3].map((i) => ({ block: "INV", layer: "INVERTERS", at: [i * 5, 0] as [number, number] })), shapes: [{ layer: "CABLE", points: [0, 0, 20, 0] }] },
                INV: { shapes: [{ layer: "0", closed: true, points: [0, 0, 1, 0, 1, 1] }] },
            },
        );
        const result = recognize(drawing, LAYOUT_RULES.solar, 1);
        expect(result.totals.find((t) => t.kind === "inverter")!.count).toBe(12);
        expect(result.totals.find((t) => t.kind === "cable")!.lengthM).toBeCloseTo(60);
    });

    it("lets the first matching rule win and treats an invalid pattern as matching nothing", () => {
        const rules = [
            { kind: "inverter", pattern: "([", measure: "count" },
            { kind: "building", pattern: "inv|table", measure: "count" },
        ] as const;
        const result = recognize(solarFixture(), rules, 1);
        expect(result.invalidRules).toEqual([0]);
        expect(result.totals).toEqual([
            { kind: "inverter", measure: "count", count: 0, lengthM: 0 },
            { kind: "building", measure: "count", count: 3, lengthM: 0 },
        ]);
    });
});
