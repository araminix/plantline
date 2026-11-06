import { describe, expect, it } from "vitest";
import { LAYOUT_RULES } from "../plants";
import { METRES_PER_UNIT } from "./drawing";
import { solarFixture } from "./fixture";
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
    });

    it("does not count a block nested in a table, nor the table's own outline, again", () => {
        const result = recognize(solarFixture(), LAYOUT_RULES.solar, 0.001);
        expect(result.insertKinds).toEqual(["pvTable", null, "pvTable", "inverter"]);
        expect(result.shapeKinds).toEqual([null, "pvString", "pvString", "cable", "fence"]);
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
