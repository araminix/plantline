import type { NodeKind } from "../plants";
import { BUSBAR_WIDTH, NODE_SIZE, type DiagramNode, type Point } from "./model";

/** The side of an element a line leaves from. */
export type Side = "up" | "down";

export interface Port extends Point {
    side: Side;
}

const HALF = NODE_SIZE / 2;
/** A line meets a busbar at least this far from its ends. */
const BUSBAR_INSET = 8;

/** The sides with a lead: most symbols have one at the top and one at the bottom (see symbols.tsx). */
const ONE_SIDED: Partial<Record<NodeKind, Side>> = {
    gridConnection: "down",
    windTurbine: "down",
    load: "up",
    earthSwitch: "up",
    voltageTransformer: "up",
    surgeArrester: "up",
};

export const sidesOf = (node: Pick<DiagramNode, "kind">): Side[] => {
    const side = ONE_SIDED[node.kind];
    return side ? [side] : ["up", "down"];
};

export const busbarHalf = (node: Pick<DiagramNode, "width">) => (node.width ?? BUSBAR_WIDTH) / 2;

/** Where a line leaves an element on a side: the end of its lead, or (a busbar) the point of the bar nearest `towards`. */
export function portAt(node: DiagramNode, side: Side, towards: Point): Port {
    if (node.kind === "busbar") {
        const reach = Math.max(0, busbarHalf(node) - BUSBAR_INSET);
        return { x: Math.min(Math.max(towards.x, node.x - reach), node.x + reach), y: node.y, side };
    }
    return { x: node.x, y: node.y + (side === "up" ? -HALF : HALF), side };
}

/** The port facing a point: the bottom one for a point below, the top one for a point above, if the element has it. */
export function portTowards(node: DiagramNode, towards: Point): Port {
    const sides = sidesOf(node);
    const wanted: Side = towards.y > node.y ? "down" : "up";
    return portAt(node, sides.includes(wanted) ? wanted : sides[0]!, towards);
}

/**
 * The points of a line between two elements: down from the upper one, across halfway, and down into the lower one,
 * or straight across when two symbols stand on one row.
 */
export function linkPoints(from: DiagramNode, to: DiagramNode): Point[] {
    if (Math.abs(from.y - to.y) < HALF && from.kind !== "busbar" && to.kind !== "busbar") {
        const [left, right] = from.x <= to.x ? [from, to] : [to, from];
        const points = [
            { x: left.x + HALF, y: left.y },
            { x: right.x - HALF, y: right.y },
        ];
        return left === from ? points : points.reverse();
    }
    const start = portTowards(from, to);
    const end = portTowards(to, start);
    const middle = (start.y + end.y) / 2;
    return [start, { x: start.x, y: middle }, { x: end.x, y: middle }, end];
}

export const pathOf = (points: readonly Point[]) => points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
