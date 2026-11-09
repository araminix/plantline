import { describe, expect, it } from "vitest";
import { LAYOUT_RULES } from "../plants";
import { solarFixture } from "./fixture";
import { findObjects, moduleWp, nameOf } from "./found";
import { targetAt } from "./LayoutMap";
import { recognize } from "./recognize";

describe("found objects", () => {
    it("lists every counted object with its ID, block, layer and corners", () => {
        const drawing = solarFixture();
        const found = findObjects(drawing, recognize(drawing, LAYOUT_RULES.solar, 0.001));
        // Model space first, then what the blocks placed in it hold
        expect(found.map((object) => [object.kind, object.label])).toEqual([
            ["pvTable", "PV_TABLE_2x28 1"],
            ["pvTable", "=T2"],
            ["inverter", "INV-01"],
            ["pvModule", "MODULE 1"],
            ["pvModule", "MODULE 2"],
        ]);
        const inverter = found[2]!;
        expect(inverter).toMatchObject({ block: "INVERTER_250KW", layer: "INVERTERS", attributes: { ID: "INV-01" } });
        expect(inverter.corners[0]).toEqual([39000, 9500]);
    });

    it("leaves out what is left out", () => {
        const drawing = solarFixture();
        const found = findObjects(drawing, recognize(drawing, LAYOUT_RULES.solar, 0.001, { blocks: { PV_TABLE_2x28: "skip" }, layers: {} }));
        expect(found.map((object) => object.kind)).toEqual(["inverter"]);
    });

    it("names an object by its ID or a similar attribute", () => {
        expect(nameOf({ Description: "Inverter", TAG: "INV-07" })).toBe("INV-07");
        expect(nameOf({ id: "T-12", tag: "x" })).toBe("T-12");
        expect(nameOf({ Remark: "spare" })).toBe("spare");
        expect(nameOf({})).toBeNull();
    });

    it("describes the smallest object under the pointer: the inverter, not the table it stands on", () => {
        const table = { index: 0, south: 0, west: 0, north: 10, east: 10 };
        const inverter = { index: 1, south: 4, west: 4, north: 5, east: 5 };
        expect(targetAt([table, inverter], 4.5, 4.5)).toBe(inverter);
        expect(targetAt([table, inverter], 8, 8)).toBe(table);
        expect(targetAt([table, inverter], 20, 20)).toBeNull();
    });

    it("reads the module power from module block names when they agree", () => {
        expect(moduleWp(["PV_MODULE_550W"])).toBe(550);
        expect(moduleWp(["590W", "Panel 590Wp"])).toBe(590);
        expect(moduleWp(["550W", "590W"])).toBeNull();
        expect(moduleWp(["INVERTER_250KW", "MODULE"])).toBeNull();
    });
});
