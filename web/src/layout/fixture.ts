import type { Drawing } from "./drawing";

/** A small solar drawing in millimetres: 2 tables (one with a module block inside), 2 strings, a 10 m cable, a fence. */
export const solarFixture = (): Drawing => ({
    units: "mm",
    layers: ["0", "CABLES", "FENCE", "PV-STRINGS", "PV-TABLES"],
    inserts: [
        { layer: "PV-TABLES", block: "PV_TABLE_2x28", depth: 0, x: 0, y: 0, box: [-10000, -2000, 10000, 2000], attributes: {} },
        { layer: "0", block: "MODULE", depth: 1, x: 0, y: 0, box: [-500, -1000, 500, 1000], attributes: {} },
        { layer: "PV-TABLES", block: "PV_TABLE_2x28", depth: 0, x: 22000, y: 0, box: [12000, -2000, 32000, 2000], attributes: { ID: "=T2" } },
        { layer: "INVERTERS", block: "INVERTER_250KW", depth: 0, x: 40000, y: 10000, box: [39000, 9500, 41000, 10500], attributes: { ID: "INV-01" } },
    ],
    shapes: [
        { layer: "PV-TABLES", depth: 1, closed: true, points: [-10000, -2000, 10000, -2000, 10000, 2000, -10000, 2000] },
        { layer: "PV-STRINGS", depth: 0, closed: false, points: [-9000, -1000, 9000, -1000] },
        { layer: "PV-STRINGS", depth: 0, closed: false, points: [13000, -1000, 31000, -1000] },
        { layer: "CABLES", depth: 0, closed: false, points: [0, 0, 6000, 0, 6000, 8000] },
        { layer: "FENCE", depth: 0, closed: true, points: [-20000, -20000, 60000, -20000, 60000, 20000, -20000, 20000] },
    ],
    texts: [{ layer: "0", text: "INV-01", x: 40000, y: 12000 }],
    truncated: false,
});
