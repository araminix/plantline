import { describe, expect, it } from "vitest";
import { alignNodes, copyItems, distributeNodes, flipNodes, nodesInBox, pasteItems, resizeBusbar, rotateNodes } from "./edit";
import { connect, emptyDiagram, footprint, overlaps, updateLink, type Diagram, type DiagramNode } from "./model";

const node = (id: string, kind: DiagramNode["kind"], x: number, y: number): DiagramNode => ({
    id,
    kind,
    x,
    y,
    label: "",
    designation: "",
    voltageKv: null,
    ratingKva: null,
    width: kind === "busbar" ? 240 : null,
    rotation: 0,
    flip: false,
    labelAt: null,
});

/** A busbar at (0, 0), a breaker below it and a fuse to the right, the busbar and breaker connected with a route. */
function sample(): Diagram {
    const diagram = { ...emptyDiagram("substation"), nodes: [node("bus", "busbar", 0, 0), node("cb", "breaker", 0, 100), node("fu", "fuse", 300, 200)] };
    const linked = connect(diagram, "bus", "cb")!;
    return updateLink(linked, linked.links[0]!.id, { route: [60, 40, 60] });
}
const at = (diagram: Diagram, id: string) => diagram.nodes.find((n) => n.id === id)!;
const all = new Set(["bus", "cb", "fu"]);

describe("group editing", () => {
    it("selects by area as in CAD: wholly inside left to right, touched right to left", () => {
        const box = { minX: -50, minY: 50, maxX: 400, maxY: 150 };
        expect(nodesInBox(sample(), box, false)).toEqual(["cb"]);
        expect(nodesInBox(sample(), { ...box, minY: -10 }, true)).toEqual(["bus", "cb"]);
    });

    it("pastes copies with new ids and their lines, where they overlap nothing", () => {
        const diagram = sample();
        const pasted = pasteItems(diagram, copyItems(diagram, new Set(["bus", "cb"])));
        expect(pasted.ids).toHaveLength(2);
        expect(pasted.ids.some((id) => all.has(id))).toBe(false);
        expect(pasted.diagram.links).toHaveLength(2);
        const copy = pasted.diagram.links[1]!;
        expect([copy.from, copy.to]).toEqual(pasted.ids);
        const boxes = pasted.diagram.nodes.map(footprint);
        boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)));
        // The copied route moved with its elements
        const shift = at(pasted.diagram, pasted.ids[0]!).x;
        expect(copy.route).toEqual([60 + shift, 40 + shift, 60 + shift]);
    });

    it("turns a group a quarter clockwise around its middle; a busbar stands up; lines route themselves again", () => {
        const turned = rotateNodes(sample(), new Set(["bus", "cb"]));
        // Middle (0, 60): the busbar above it goes to the right, the breaker below it to the left
        expect(at(turned, "bus")).toMatchObject({ x: 60, y: 60, rotation: 90 });
        expect(at(turned, "cb")).toMatchObject({ x: -40, y: 60, rotation: 90 });
        expect(at(rotateNodes(turned, new Set(["bus"])), "bus").rotation).toBe(0);
        expect(turned.links[0]!.route).toBeNull();
        expect(at(rotateNodes(sample(), new Set(["fu"])), "fu")).toMatchObject({ x: 300, y: 200, rotation: 90 });
    });

    it("mirrors a group left to right; a turned symbol turns the other way", () => {
        const flipped = flipNodes(sample(), new Set(["cb", "fu"]));
        expect(at(flipped, "cb")).toMatchObject({ x: 300, flip: true });
        expect(at(flipped, "fu")).toMatchObject({ x: 0, flip: true });
        expect(at(flipNodes(rotateNodes(sample(), new Set(["cb"])), new Set(["cb"])), "cb").rotation).toBe(270);
    });

    it("aligns edges and centres, and spaces centres evenly", () => {
        const left = alignNodes(sample(), all, "left");
        expect([at(left, "cb").x, at(left, "fu").x]).toEqual([-100, -100]);
        const centred = alignNodes(sample(), new Set(["cb", "fu"]), "centre");
        expect([at(centred, "cb").x, at(centred, "fu").x]).toEqual([160, 160]);
        const top = alignNodes(sample(), new Set(["cb", "fu"]), "top");
        expect([at(top, "cb").y, at(top, "fu").y]).toEqual([100, 100]);
        const spaced = distributeNodes({ ...sample(), nodes: [...sample().nodes, node("x", "fuse", 40, 0)] }, new Set(["bus", "x", "fu"]), true);
        expect([at(spaced, "bus").x, at(spaced, "x").x, at(spaced, "fu").x]).toEqual([0, 160, 300]);
    });

    it("resizes a busbar from one end, keeping the other, in steps of two grid units", () => {
        const longer = at(resizeBusbar(sample(), "bus", "end", { x: 251, y: 3 }), "bus");
        // The start stays at -120; the end goes to the nearest step, 240
        expect(longer).toMatchObject({ x: 60, width: 360 });
        expect(at(resizeBusbar(sample(), "bus", "start", { x: 500, y: 0 }), "bus")).toMatchObject({ x: 100, width: 40 });
    });
});
