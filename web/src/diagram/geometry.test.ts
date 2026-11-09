import { describe, expect, it } from "vitest";
import { linkPoints, portTowards, sidesOf } from "./geometry";
import { addNode, emptyDiagram, type DiagramNode } from "./model";

const node = (kind: DiagramNode["kind"], x: number, y: number, width: number | null = null): DiagramNode => ({ ...addNode(emptyDiagram("solar"), kind, x, y).diagram.nodes[0]!, width: width ?? (kind === "busbar" ? 240 : null) });

describe("line geometry", () => {
    it("offers a connection point where a symbol has a lead", () => {
        expect(sidesOf(node("breaker", 0, 0))).toEqual(["up", "down"]);
        expect(sidesOf(node("gridConnection", 0, 0))).toEqual(["down"]);
        expect(sidesOf(node("load", 0, 0))).toEqual(["up"]);
    });

    it("leaves the upper element at the bottom, crosses halfway and enters the lower one at the top", () => {
        expect(linkPoints(node("breaker", 0, 0), node("inverter", 100, 200))).toEqual([
            { x: 0, y: 24, side: "down" },
            { x: 0, y: 100 },
            { x: 100, y: 100 },
            { x: 100, y: 176, side: "up" },
        ]);
    });

    it("meets a busbar straight above or below the other element, within its length", () => {
        const busbar = node("busbar", 0, 0, 200);
        expect(portTowards(busbar, { x: 60, y: 100 })).toEqual({ x: 60, y: 0, side: "down" });
        expect(portTowards(busbar, { x: 500, y: 100 })).toEqual({ x: 92, y: 0, side: "down" });
    });

    it("uses the only lead of a one-sided symbol, and joins two symbols on one row from side to side", () => {
        expect(portTowards(node("gridConnection", 0, 0), { x: 0, y: -300 }).side).toBe("down");
        expect(linkPoints(node("breaker", 200, 0), node("fuse", 0, 0))).toEqual([
            { x: 176, y: 0 },
            { x: 24, y: 0 },
        ]);
    });
});
