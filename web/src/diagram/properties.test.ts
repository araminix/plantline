import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import { NODE_KINDS } from "../plants";
import { ELECTRICAL, FIELDS, isFieldValue, LINE_FIELDS, readProperties, summary, upgradeProperties, withField } from "./properties";

describe("element and line properties", () => {
    it("give every kind its electrical fields, each named, with no field twice", () => {
        for (const kind of NODE_KINDS) {
            expect(ELECTRICAL[kind].length, kind).toBeGreaterThan(0);
            expect(new Set(ELECTRICAL[kind]).size, kind).toBe(ELECTRICAL[kind].length);
        }
        expect(new Set(LINE_FIELDS).size).toBe(LINE_FIELDS.length);
        for (const spec of Object.values(FIELDS)) expect(en).toHaveProperty([spec.label]);
    });

    it("accept only values a field can hold", () => {
        expect(isFieldValue("voltageKv", 33)).toBe(true);
        expect(isFieldValue("voltageKv", -1)).toBe(false);
        expect(isFieldValue("voltageKv", "33")).toBe(false);
        expect(isFieldValue("modules", 10.5)).toBe(false);
        expect(isFieldValue("powerFactor", 1.2)).toBe(false);
        expect(isFieldValue("status", "planned")).toBe(true);
        expect(isFieldValue("status", "maybe")).toBe(false);
        expect(isFieldValue("vectorGroup", "")).toBe(false);
        expect(isFieldValue("notes", "x".repeat(1001))).toBe(false);
    });

    it("read only the fields of the kind, and store a field only while it has a value", () => {
        expect(readProperties({ hvKv: 33, lvKv: 0.4 }, ["hvKv", "lvKv"])).toEqual({ hvKv: 33, lvKv: 0.4 });
        expect(readProperties({ hvKv: 33 }, ["voltageKv"])).toBeNull();
        expect(readProperties([], ["voltageKv"])).toBeNull();
        expect(withField({ voltageKv: 33 }, "ratedCurrentA", 630)).toEqual({ voltageKv: 33, ratedCurrentA: 630 });
        expect(withField({ voltageKv: 33, model: "X" }, "model", "")).toEqual({ voltageKv: 33 });
        expect(withField({ voltageKv: 33 }, "voltageKv", null)).toEqual({});
    });

    it("turn an old voltage and rating into the kind's own fields, keeping what has no field in the notes", () => {
        expect(upgradeProperties("transformer", 33, 1600)).toEqual({ hvKv: 33, ratedPowerKva: 1600 });
        expect(upgradeProperties("inverter", 0.8, 3125)).toEqual({ acVoltageKv: 0.8, acPowerKva: 3125 });
        expect(upgradeProperties("pvArray", 1.5, 500)).toEqual({ dcVoltageV: 1500, peakPowerKwp: 500 });
        expect(upgradeProperties("capacitorBank", 33, 5000)).toEqual({ voltageKv: 33, reactiveMvar: 5 });
        expect(upgradeProperties("breaker", 33, 1000)).toEqual({ voltageKv: 33, notes: "1000 kVA" });
        expect(upgradeProperties("fuse", null, null)).toEqual({});
    });

    it("show an element's voltages and main ratings on the drawing", () => {
        expect(summary("transformer", { hvKv: 33, lvKv: 0.4, ratedPowerKva: 1600, vectorGroup: "Dyn11" })).toEqual(["33/0.4 kV", "1600 kVA"]);
        expect(summary("battery", { energyKwh: 4000, powerKw: 2000, dcVoltageV: 1200 })).toEqual(["1200 V", "4000 kWh", "2000 kW"]);
        expect(summary("breaker", { voltageKv: 33, ratedCurrentA: 630 })).toEqual(["33 kV"]);
    });
});
