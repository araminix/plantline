import { describe, expect, it } from "vitest";
import { autoRoute, dragSegment, linkShape, portTowards, removeSegment, sidesOf, tidyRoute } from "./geometry";
import { addNode, emptyDiagram, type DiagramNode, type Route } from "./model";

const node = (kind: DiagramNode["kind"], x: number, y: number, width: number | null = null, rotation: DiagramNode["rotation"] = 0): DiagramNode => ({
    ...addNode(emptyDiagram("solar"), kind, x, y).diagram.nodes[0]!,
    width: width ?? (kind === "busbar" ? 240 : null),
    rotation,
});
const shape = (from: DiagramNode, to: DiagramNode, route: Route | null = null, straight = false) => linkShape({ route, straight }, from, to);
const xy = (points: { x: number; y: number }[]) => points.map(({ x, y }) => [x, y]);

describe("line geometry", () => {
    it("offers a connection point where a symbol has a lead", () => {
        expect(sidesOf(node("breaker", 0, 0))).toEqual(["up", "down"]);
        expect(sidesOf(node("gridConnection", 0, 0))).toEqual(["down"]);
        expect(sidesOf(node("load", 0, 0))).toEqual(["up"]);
    });

    it("leaves the upper element at the bottom, crosses halfway and enters the lower one at the top", () => {
        expect(xy(shape(node("breaker", 0, 0), node("inverter", 100, 200)).points)).toEqual([
            [0, 24],
            [0, 100],
            [100, 100],
            [100, 176],
        ]);
    });

    it("meets a busbar straight above or below the other element, within its length", () => {
        const busbar = node("busbar", 0, 0, 200);
        expect(portTowards(busbar, { x: 60, y: 100 })).toEqual({ x: 60, y: 0, side: "down" });
        expect(portTowards(busbar, { x: 500, y: 100 })).toEqual({ x: 92, y: 0, side: "down" });
    });

    it("joins two symbols on one row from side to side, and draws a straight line from lead to lead", () => {
        expect(shape(node("breaker", 200, 0), node("fuse", 0, 0))).toEqual({
            points: [
                { x: 176, y: 0 },
                { x: 24, y: 0 },
            ],
            route: null,
        });
        expect(xy(shape(node("breaker", 0, 0), node("fuse", 100, 200), null, true).points)).toEqual([
            [0, 24],
            [100, 176],
        ]);
    });

    it("routes out of a lead that points away and around its symbol, never through it", () => {
        // A grid connection (lead at the bottom only) under its busbar
        const grid = node("gridConnection", 0, 100);
        const busbar = node("busbar", 0, 0, 400);
        expect(autoRoute(grid, busbar)).toEqual([144, -44, 20]);
        expect(xy(shape(grid, busbar).points)).toEqual([
            [0, 124],
            [0, 144],
            [-44, 144],
            [-44, 20],
            [-44, 20],
            [-44, 0],
        ]);
    });

    it("moves a middle segment across its direction, on the grid", () => {
        const [a, b] = [node("breaker", 0, 0), node("fuse", 200, 200)];
        const dragged = dragSegment(a, b, shape(a, b), 1, { x: 50, y: 147 });
        expect(dragged).toEqual([140]);
        expect(xy(shape(a, b, dragged).points)).toEqual([
            [0, 24],
            [0, 140],
            [200, 140],
            [200, 176],
        ]);
    });

    it("adds a bend when an end segment is dragged, slides along a busbar instead, and tidies steps of zero length", () => {
        const [a, b] = [node("breaker", 0, 0), node("fuse", 200, 200)];
        expect(dragSegment(a, b, shape(a, b), 0, { x: -60, y: 50 })).toEqual([44, -60, 100]);
        expect(dragSegment(a, b, shape(a, b), 3, { x: 260, y: 150 })).toEqual([100, 260, 156]);
        const busbar = node("busbar", 0, 0, 400);
        // The line leaves the bar at x 100 instead of straight above the fuse
        expect(dragSegment(busbar, b, shape(busbar, b), 0, { x: 100, y: 50 })).toEqual([88, 100, 88]);
        expect(xy(shape(busbar, b, [88, 100, 88]).points)[0]).toEqual([100, 0]);
        // Dragged back onto the lead: the bend is gone
        expect(tidyRoute(a, b, [44, 0, 100])).toEqual([100]);
        expect(tidyRoute(a, b, [60, 100, 60])).toEqual([60]);
        expect(tidyRoute(busbar, b, [88, 100, 88])).toEqual([88, 100, 88]);
    });

    it("removes a bend on a double click, and routes itself when none is left", () => {
        const [a, b] = [node("breaker", 0, 0), node("fuse", 200, 200)];
        expect(removeSegment(a, b, [44, -60, 100], 2)).toEqual([44]);
        expect(removeSegment(a, b, [100], 1)).toBeNull();
    });

    it("turns leads with their element: across the page, and from down to across in one bend", () => {
        expect(sidesOf(node("breaker", 0, 0, null, 90))).toEqual(["right", "left"]);
        expect(sidesOf(node("gridConnection", 0, 0, null, 90))).toEqual(["left"]);
        // Two turned symbols on one row: straight across, from the right lead to the left one
        expect(xy(shape(node("breaker", 0, 0, null, 90), node("fuse", 200, 0, null, 90)).points)).toEqual([
            [24, 0],
            [100, 0],
            [100, 0],
            [176, 0],
        ]);
        // Upright to turned: down, then across into the left lead
        expect(xy(shape(node("breaker", 0, 0), node("fuse", 200, 200, null, 90)).points)).toEqual([
            [0, 24],
            [0, 200],
            [176, 200],
        ]);
    });

    it("meets an upright busbar from the side, level with the other element", () => {
        expect(portTowards(node("busbar", 0, 0, 200, 90), { x: 100, y: 50 })).toEqual({ x: 0, y: 50, side: "right" });
    });
});
