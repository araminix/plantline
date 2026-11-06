import { describe, expect, it } from "vitest";
import { addNode, BUSBAR_WIDTH, connect, emptyDiagram, moveNodes, removeItems, updateNode } from "./model";

const twoNodes = () => {
    const first = addNode(emptyDiagram("solar"), "inverter", 101, 99);
    const second = addNode(first.diagram, "busbar", 300, 300);
    return { diagram: second.diagram, a: first.id, b: second.id };
};

describe("diagram model", () => {
    it("adds an element on the grid, a busbar with its length", () => {
        const { diagram, a, b } = twoNodes();
        expect(diagram.nodes.find((node) => node.id === a)).toMatchObject({ kind: "inverter", x: 100, y: 100, width: null, label: "" });
        expect(diagram.nodes.find((node) => node.id === b)?.width).toBe(BUSBAR_WIDTH);
    });

    it("connects two elements once and never an element to itself", () => {
        const { diagram, a, b } = twoNodes();
        const linked = connect(diagram, a, b);
        expect(linked?.links).toHaveLength(1);
        expect(connect(linked!, b, a)).toBeNull();
        expect(connect(diagram, a, a)).toBeNull();
    });

    it("moves elements freely during a drag and back onto the grid at its end", () => {
        const { diagram, a } = twoNodes();
        expect(moveNodes(diagram, new Set([a]), 13, 7, false).nodes[0]).toMatchObject({ x: 113, y: 107 });
        expect(moveNodes(diagram, new Set([a]), 13, 7, true).nodes[0]).toMatchObject({ x: 120, y: 100 });
    });

    it("removes an element together with its links, and edits fields", () => {
        const { diagram, a, b } = twoNodes();
        const linked = connect(diagram, a, b)!;
        const removed = removeItems(linked, new Set([a]));
        expect(removed.nodes.map((node) => node.id)).toEqual([b]);
        expect(removed.links).toEqual([]);
        expect(updateNode(diagram, b, { label: "Main bus", voltageKv: 33 }).nodes[1]).toMatchObject({ label: "Main bus", voltageKv: 33 });
    });
});
