import { describe, expect, it } from "vitest";
import { arrange } from "./arrange";
import { addNode, connect, emptyDiagram, type Diagram } from "./model";

describe("automatic arrangement", () => {
    it("puts the grid connection on top and each element one row below the one it hangs from", () => {
        let diagram: Diagram = emptyDiagram("solar");
        const ids: string[] = [];
        for (const [kind, x, y] of [["inverter", 500, 40], ["busbar", 0, 900], ["gridConnection", 300, 600], ["inverter", 20, 20]] as const) {
            const added = addNode(diagram, kind, x, y);
            diagram = added.diagram;
            ids.push(added.id);
        }
        const [inverterA, bus, grid, inverterB] = ids as [string, string, string, string];
        diagram = [[grid, bus], [bus, inverterA], [bus, inverterB]].reduce((d, [a, b]) => connect(d, a!, b!)!, diagram);

        const at = (id: string) => arrange(diagram).nodes.find((node) => node.id === id)!;
        expect(at(grid).y).toBeLessThan(at(bus).y);
        expect(at(bus).y).toBeLessThan(at(inverterA).y);
        expect(at(inverterA).y).toBe(at(inverterB).y);
        expect(at(inverterB).x).toBeLessThan(at(inverterA).x);
        expect(at(grid).x).toBe(at(bus).x);
    });

    it("places unconnected groups side by side without overlap", () => {
        let diagram: Diagram = emptyDiagram("wind");
        for (let i = 0; i < 3; i++) diagram = addNode(diagram, "windTurbine", 0, 0).diagram;
        const xs = arrange(diagram).nodes.map((node) => node.x);
        expect(new Set(xs).size).toBe(3);
    });

    it("lengthens a busbar to reach every feeder below it", () => {
        let diagram: Diagram = emptyDiagram("solar");
        const add = (kind: Parameters<typeof addNode>[1]) => {
            const added = addNode(diagram, kind, 0, 0);
            diagram = added.diagram;
            return added.id;
        };
        const bus = add("busbar");
        const feeders = [add("inverter"), add("inverter"), add("inverter")];
        for (const feeder of feeders) diagram = connect(diagram, bus, feeder)!;

        const arranged = arrange(diagram);
        const busbar = arranged.nodes.find((node) => node.id === bus)!;
        for (const node of arranged.nodes.filter((n) => feeders.includes(n.id))) {
            expect(Math.abs(node.x - busbar.x)).toBeLessThan(busbar.width! / 2);
        }
    });
});
