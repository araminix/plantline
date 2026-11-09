import { describe, expect, it } from "vitest";
import { checkDiagram } from "./checks";
import { addNode, connect, emptyDiagram, updateNode, type Diagram } from "./model";
import type { Properties } from "./properties";

const withProps = (diagram: Diagram, id: string, props: Properties) => updateNode(diagram, id, { props });

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

    it("reports different voltages on a line", () => {
        const { diagram, ids } = build("gridConnection", "busbar");
        const [grid, bus] = ids as [string, string];
        const d = withProps(withProps(connect(diagram, grid, bus)!, grid, { voltageKv: 154 }), bus, { voltageKv: 33 });
        expect(checkDiagram(d)).toEqual([{ code: "voltageMismatch", nodeIds: [grid, bus] }]);
    });

    it("compares a transformer's HV side with what is above it and its LV side with what is below", () => {
        const diagram = emptyDiagram("substation");
        const mv = addNode(diagram, "busbar", 0, 0);
        const transformer = addNode(mv.diagram, "transformer", 0, 200);
        const lv = addNode(transformer.diagram, "busbar", 0, 400);
        let d = connect(connect(lv.diagram, mv.id, transformer.id)!, transformer.id, lv.id)!;
        d = withProps(withProps(withProps(d, mv.id, { voltageKv: 33 }), transformer.id, { hvKv: 33, lvKv: 0.4 }), lv.id, { voltageKv: 0.4 });
        expect(checkDiagram(d).filter((issue) => issue.code === "voltageMismatch")).toEqual([]);
        // The LV bar at 0.69 kV no longer matches the LV side
        expect(checkDiagram(withProps(d, lv.id, { voltageKv: 0.69 })).filter((issue) => issue.code === "voltageMismatch")).toEqual([{ code: "voltageMismatch", nodeIds: [transformer.id, lv.id] }]);
    });

    it("reports an inverter connected the wrong way round, and PV modules that do not add up", () => {
        const diagram = emptyDiagram("solar");
        const inverter = addNode(diagram, "inverter", 0, 0);
        const pv = addNode(inverter.diagram, "pvArray", 0, 200);
        const transformer = addNode(pv.diagram, "transformer", 0, -200);
        // The PV array below the inverter meets its AC side; the transformer above meets its DC side
        let d = connect(connect(transformer.diagram, inverter.id, pv.id)!, transformer.id, inverter.id)!;
        d = withProps(d, pv.id, { modules: 100, strings: 4, modulesPerString: 24 });
        const issues = checkDiagram(d).filter((issue) => issue.code !== "noGrid");
        expect(issues).toEqual([
            { code: "inverterSides", nodeIds: [inverter.id, pv.id] },
            { code: "inverterSides", nodeIds: [inverter.id, transformer.id] },
            { code: "moduleCount", nodeIds: [pv.id] },
        ]);
    });

    it("reports a reference designation used twice", () => {
        const { diagram, ids } = build("gridConnection", "breaker", "breaker");
        const [grid, q1, q2] = ids as [string, string, string];
        let d = connect(connect(diagram, grid, q1)!, grid, q2)!;
        d = updateNode(updateNode(d, q1, { designation: "-Q1" }), q2, { designation: " -Q1 " });
        expect(checkDiagram(d)).toEqual([{ code: "duplicateDesignation", nodeIds: [q1, q2] }]);
    });
});
