import { describe, expect, it } from "vitest";
import { LAYOUT_RULES } from "../plants";
import { METRES_PER_UNIT } from "./drawing";
import { makeDrawing, solarFixture } from "./fixture";
import { inventory, recognize } from "./recognize";

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

    it("counts the module inside each table, but not the table's own outline again", () => {
        const drawing = solarFixture();
        const { kinds } = recognize(drawing, LAYOUT_RULES.solar, 0.001);
        expect(kinds.get(drawing.model)).toEqual({ shapes: ["pvString", "pvString", "cable", "fence"], references: ["pvTable", "pvTable", "inverter"] });
        expect(kinds.get(drawing.blocks[0]!)).toEqual({ shapes: [null], references: ["pvModule"] });
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

    it("follows the user's choices for blocks and layers before the rules", () => {
        const drawing = solarFixture();
        const counts = (assignments: Parameters<typeof recognize>[3]) => {
            const { totals } = recognize(drawing, LAYOUT_RULES.solar, 0.001, assignments);
            return Object.fromEntries(totals.map((total) => [total.kind, total.measure === "length" ? Math.round(total.lengthM) : total.count]));
        };
        // The module block inside each table counted as modules; the inverter block not counted; the fence layer as a road
        const result = counts({ blocks: { MODULE: "pvModule", INVERTER_250KW: "none" }, layers: { FENCE: "road" } });
        expect(result).toMatchObject({ pvTable: 2, inverter: 0, pvModule: 2, fence: 0, road: 240 });
        // A counted kind chosen for a layer counts the references on it, and its closed shapes in model space only
        expect(counts({ blocks: {}, layers: { "PV-TABLES": "building" } })).toMatchObject({ pvTable: 0, building: 2 });
        // A block left out takes what is inside with it (a key plan repeating the plant)
        expect(counts({ blocks: { PV_TABLE_2x28: "skip" }, layers: {} })).toMatchObject({ pvTable: 0, pvModule: 0, inverter: 1 });
    });

    it("lists the blocks and layers in use, most used first", () => {
        const { blocks, layers } = inventory(solarFixture());
        expect(blocks).toEqual([
            { name: "PV_TABLE_2x28", copies: 2 },
            { name: "MODULE", copies: 2 },
            { name: "INVERTER_250KW", copies: 1 },
        ]);
        expect(layers.find((layer) => layer.name === "PV-TABLES")).toEqual({ name: "PV-TABLES", shapes: 2, references: 2 });
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
