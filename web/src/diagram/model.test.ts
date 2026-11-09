import { describe, expect, it } from "vitest";
import { addNode, BUSBAR_WIDTH, connect, emptyDiagram, footprint, moveNodes, reconnect, removeItems, updateLink, updateNode, type Diagram } from "./model";

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

    it("adds every element at the free grid point nearest to where it was asked, never on top of another", () => {
        let diagram: Diagram = emptyDiagram("solar");
        for (const kind of ["inverter", "busbar", "inverter", "transformer", "busbar", "breaker"] as const) diagram = addNode(diagram, kind, 200, 200).diagram;
        const boxes = diagram.nodes.map(footprint);
        boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => expect(a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY).toBe(false)));
        // The first lands where asked; the next as near as it fits (below or above rather than far to the side)
        expect(diagram.nodes[0]).toMatchObject({ x: 200, y: 200 });
        expect(Math.abs(diagram.nodes[1]!.y - 200)).toBeLessThanOrEqual(60);
        expect(diagram.nodes[1]!.x).toBe(200);
    });

    it("connects two elements once and never an element to itself", () => {
        const { diagram, a, b } = twoNodes();
        const linked = connect(diagram, a, b);
        expect(linked?.links).toHaveLength(1);
        expect(connect(linked!, b, a)).toBeNull();
        expect(connect(diagram, a, a)).toBeNull();
    });

    it("moves a line's end to another element, never onto the element at its other end or into a repeated line", () => {
        const { diagram, a, b } = twoNodes();
        const third = addNode(diagram, "fuse", 600, 100);
        const linked = connect(third.diagram, a, b)!;
        const link = linked.links[0]!.id;
        expect(reconnect(linked, link, "to", third.id)?.links[0]).toMatchObject({ id: link, from: a, to: third.id });
        expect(reconnect(linked, link, "to", a)).toBeNull();
        expect(reconnect(linked, link, "to", b)).toBeNull();
        const twoLinks = connect(linked, a, third.id)!;
        expect(reconnect(twoLinks, link, "to", third.id)).toBeNull();
    });

    it("moves elements freely during a drag and back onto the grid at its end", () => {
        const { diagram, a } = twoNodes();
        expect(moveNodes(diagram, new Set([a]), 13, 7, false).nodes[0]).toMatchObject({ x: 113, y: 107 });
        expect(moveNodes(diagram, new Set([a]), 13, 7, true).nodes[0]).toMatchObject({ x: 120, y: 100 });
    });

    it("keeps a line's shape when both its elements move, and lets it stretch when one stays", () => {
        const { diagram, a, b } = twoNodes();
        const linked = connect(diagram, a, b)!;
        const routed = updateLink(linked, linked.links[0]!.id, { route: [200, 120, 260] });
        expect(moveNodes(routed, new Set([a, b]), 40, 20, true).links[0]!.route).toEqual([220, 160, 280]);
        expect(moveNodes(routed, new Set([a]), 40, 20, true).links[0]!.route).toEqual([200, 120, 260]);
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
