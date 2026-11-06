import { describe, expect, it } from "vitest";
import { checkDiagram } from "./checks";
import { addNode, connect, emptyDiagram, updateNode, type Diagram } from "./model";

const build = (...kinds: Parameters<typeof addNode>[1][]) =>
    kinds.reduce<{ diagram: Diagram; ids: string[] }>(
        (acc, kind, i) => {
            const added = addNode(acc.diagram, kind, i * 100, 0);
            return { diagram: added.diagram, ids: [...acc.ids, added.id] };
        },
        { diagram: emptyDiagram("solar"), ids: [] },
    );

describe("diagram checks", () => {
    it("finds nothing in an empty diagram or a connected one with a grid connection", () => {
        expect(checkDiagram(emptyDiagram("wind"))).toEqual([]);
        const { diagram, ids } = build("gridConnection", "breaker");
        expect(checkDiagram(connect(diagram, ids[0]!, ids[1]!)!)).toEqual([]);
    });

    it("reports a missing grid connection and unconnected elements", () => {
        const { diagram, ids } = build("inverter", "breaker");
        expect(checkDiagram(diagram)).toEqual([
            { code: "noGrid", nodeIds: [] },
            { code: "unconnected", nodeIds: [ids[0]] },
            { code: "unconnected", nodeIds: [ids[1]] },
        ]);
    });

    it("reports different voltages on a link, except across a transformer or inverter", () => {
        const { diagram, ids } = build("gridConnection", "busbar", "transformer");
        const [grid, bus, transformer] = ids as [string, string, string];
        let d = connect(connect(diagram, grid, bus)!, bus, transformer)!;
        d = updateNode(updateNode(updateNode(d, grid, { voltageKv: 154 }), bus, { voltageKv: 33 }), transformer, { voltageKv: 0.8 });
        expect(checkDiagram(d)).toEqual([{ code: "voltageMismatch", nodeIds: [grid, bus] }]);
    });

    it("reports a reference designation used twice", () => {
        const { diagram, ids } = build("gridConnection", "breaker", "breaker");
        const [grid, q1, q2] = ids as [string, string, string];
        let d = connect(connect(diagram, grid, q1)!, grid, q2)!;
        d = updateNode(updateNode(d, q1, { designation: "-Q1" }), q2, { designation: " -Q1 " });
        expect(checkDiagram(d)).toEqual([{ code: "duplicateDesignation", nodeIds: [q1, q2] }]);
    });
});
