import type { NodeKind } from "../plants";
import { BUSBAR_WIDTH, GRID, NODE_SIZE, snap, type Box, type DiagramLink, type DiagramNode, type Point, type Route } from "./model";

/** The side of an element a line leaves from. */
export type Side = "up" | "right" | "down" | "left";

export interface Port extends Point {
    side: Side;
}

/** The direction of a lead: down the page ("v", for up and down) or across it ("h"). */
type Axis = "v" | "h";

const HALF = NODE_SIZE / 2;
/** A line meets a busbar at least this far from its ends. */
const BUSBAR_INSET = 8;
const CLOCKWISE: Side[] = ["up", "right", "down", "left"];
const OUT: Record<Side, Point> = { up: { x: 0, y: -1 }, right: { x: 1, y: 0 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

const axisOf = (side: Side): Axis => (side === "up" || side === "down" ? "v" : "h");
/** A point's coordinate along an axis, and across it. */
const main = (axis: Axis, point: Point) => (axis === "v" ? point.y : point.x);
const cross = (axis: Axis, point: Point) => (axis === "v" ? point.x : point.y);
const make = (axis: Axis, along: number, across: number): Point => (axis === "v" ? { x: across, y: along } : { x: along, y: across });

/** The sides with a lead before turning: most symbols have one at the top and one at the bottom (see symbols.tsx). */
const ONE_SIDED: Partial<Record<NodeKind, Side>> = {
    gridConnection: "down",
    windTurbine: "down",
    load: "up",
    earthSwitch: "up",
    voltageTransformer: "up",
    surgeArrester: "up",
};

const turn = (side: Side, degrees: number) => CLOCKWISE[(CLOCKWISE.indexOf(side) + degrees / 90) % 4]!;

/** The sides an element has a lead on, turned with it. */
export const sidesOf = (node: Pick<DiagramNode, "kind" | "rotation">): Side[] => {
    const side = ONE_SIDED[node.kind];
    return (side ? [side] : (["up", "down"] as Side[])).map((base) => turn(base, node.rotation));
};

export const busbarHalf = (node: Pick<DiagramNode, "width">) => (node.width ?? BUSBAR_WIDTH) / 2;
/** An upright busbar runs down the page. */
export const isUpright = (node: Pick<DiagramNode, "kind" | "rotation">) => node.kind === "busbar" && node.rotation % 180 === 90;

/** Where a line leaves an element on a side: the end of its lead, or (a busbar) the point of the bar nearest `across`. */
export function portAt(node: DiagramNode, side: Side, across: number): Port {
    if (node.kind === "busbar") {
        const axis = axisOf(side);
        const reach = Math.max(0, busbarHalf(node) - BUSBAR_INSET);
        const centre = cross(axis, node);
        return { ...make(axis, main(axis, node), Math.min(Math.max(across, centre - reach), centre + reach)), side };
    }
    return { x: node.x + OUT[side].x * HALF, y: node.y + OUT[side].y * HALF, side };
}

/** The points a line can be drawn from: each lead's end, or three points along a busbar. */
export function connectionPoints(node: DiagramNode): { key: string; point: Port }[] {
    if (node.kind !== "busbar") return sidesOf(node).map((side) => ({ key: side, point: portAt(node, side, 0) }));
    const side: Side = isUpright(node) ? "right" : "down";
    const reach = Math.max(0, busbarHalf(node) - BUSBAR_INSET);
    return [-1, 0, 1].map((k) => ({ key: String(k), point: portAt(node, side, cross(axisOf(side), node) + k * reach) }));
}

/** The side facing a position along the element's leads (or a point), if the element has a lead there. */
function sideFacing(node: DiagramNode, towards: number | Point): Side {
    const sides = sidesOf(node);
    const axis = axisOf(sides[0]!);
    const value = typeof towards === "number" ? towards : main(axis, towards);
    const wanted: Side = axis === "v" ? (value > node.y ? "down" : "up") : value > node.x ? "right" : "left";
    return sides.includes(wanted) ? wanted : sides[0]!;
}

/** The port facing a point. */
export function portTowards(node: DiagramNode, towards: Point): Port {
    const side = sideFacing(node, towards);
    return portAt(node, side, cross(axisOf(side), towards));
}

/** A grid step out of a port, where a line turns at the earliest. */
const stepOut = (port: Port): Point => ({ x: port.x + OUT[port.side].x * GRID, y: port.y + OUT[port.side].y * GRID });

/**
 * The ports of a routed line: each faces its route's nearest segment. A line meets a busbar under the nearest segment
 * running along its leads, or, without one, opposite the other end.
 */
function routePorts(from: DiagramNode, to: DiagramNode, route: Route): [Port, Port] {
    const n = route.length;
    const startSide = sideFacing(from, n > 0 ? route[0]! : to);
    const endSide = sideFacing(to, n > 0 ? route[n - 1]! : from);
    if (n >= 2) return [portAt(from, startSide, route[1]!), portAt(to, endSide, route[n - 2]!)];
    if (from.kind === "busbar" && to.kind !== "busbar") {
        const end = portAt(to, endSide, 0);
        return [portAt(from, startSide, cross(axisOf(startSide), stepOut(end))), end];
    }
    const start = portAt(from, startSide, cross(axisOf(startSide), to));
    return [start, portAt(to, endSide, cross(axisOf(endSide), stepOut(start)))];
}

/** A route has an odd count when both ends' leads run the same way, an even one when they cross. */
const fits = (route: Route, start: Port, end: Port) => route.length % 2 === (axisOf(start.side) === axisOf(end.side) ? 1 : 0);

/** The corners of a route, between its two ports. */
function routePoints(start: Port, end: Port, route: Route): Point[] {
    const axis = axisOf(start.side);
    // Each segment's fixed coordinate: across the start's leads for segments along them (even), along them for the others
    const values = [cross(axis, start), ...route, cross(axisOf(end.side), end)];
    const corners = values.slice(1).map((value, k) => (k % 2 === 0 ? make(axis, value, values[k]!) : make(axis, values[k]!, value)));
    return [start, ...corners, end];
}

/** What a line must not cross: a symbol, or a busbar's bar. */
function body(node: DiagramNode): Box {
    if (node.kind !== "busbar") return { minX: node.x - HALF + 1, minY: node.y - HALF + 1, maxX: node.x + HALF - 1, maxY: node.y + HALF - 1 };
    const [w, h] = isUpright(node) ? [2, busbarHalf(node)] : [busbarHalf(node), 2];
    return { minX: node.x - w, minY: node.y - h, maxX: node.x + w, maxY: node.y + h };
}

const crosses = (a: Point, b: Point, box: Box) => Math.max(a.x, b.x) > box.minX && Math.min(a.x, b.x) < box.maxX && Math.max(a.y, b.y) > box.minY && Math.min(a.y, b.y) < box.maxY;

/** A route whose line runs through neither end's symbol (a line may arrive at a busbar from either side). */
function clear(from: DiagramNode, to: DiagramNode, route: Route): boolean {
    const [start, end] = routePorts(from, to, route);
    if (!fits(route, start, end)) return false;
    const points = routePoints(start, end, route);
    return points.slice(1).every((point, i) => {
        const a = points[i]!;
        const throughFrom = !(i === 0 && from.kind === "busbar") && crosses(a, point, body(from));
        const throughTo = !(i === points.length - 2 && to.kind === "busbar") && crosses(a, point, body(to));
        return !throughFrom && !throughTo;
    });
}

/**
 * The route a line takes by itself: out of the facing leads and across halfway; when a lead points away (a grid
 * connection under its busbar), out of it and around the symbol. The first of these that crosses neither symbol.
 */
export function autoRoute(from: DiagramNode, to: DiagramNode): Route {
    const start = portTowards(from, to);
    const end = portTowards(to, start);
    const [a, b] = [axisOf(start.side), axisOf(end.side)];
    const [ss, se] = [main(a, stepOut(start)), main(b, stepOut(end))];
    if (a !== b) return [[], [ss, se]].find((route) => clear(from, to, route)) ?? [];
    const beside = (node: DiagramNode) => cross(a, node) - HALF - GRID;
    const outward = main(a, OUT[start.side]) > 0;
    const candidates: Route[] = [
        [(main(a, start) + main(a, end)) / 2],
        [outward ? Math.max(ss, se) : Math.min(ss, se)],
        [ss, beside(from), se],
        [ss, beside(to), se],
        [ss, Math.min(beside(from), beside(to)), se],
    ];
    return candidates.find((route) => clear(from, to, route)) ?? candidates[0]!;
}

/** Two upright symbols on one row are joined from side to side, as before routes existed. */
const sideBySide = (from: DiagramNode, to: DiagramNode) =>
    Math.abs(from.y - to.y) < HALF && [from, to].every((node) => node.kind !== "busbar" && sidesOf(node).length === 2 && axisOf(sidesOf(node)[0]!) === "v");

export interface LinkShape {
    points: Point[];
    /** The route the points follow; null for a straight line and for two symbols joined from side to side. */
    route: Route | null;
}

export function linkShape(link: Pick<DiagramLink, "route" | "straight">, from: DiagramNode, to: DiagramNode): LinkShape {
    if (link.straight) {
        const start = portTowards(from, to);
        return { points: [start, portTowards(to, start)], route: null };
    }
    if (!link.route && sideBySide(from, to)) {
        const [left, right] = from.x <= to.x ? [from, to] : [to, from];
        const points = [
            { x: left.x + HALF, y: left.y },
            { x: right.x - HALF, y: right.y },
        ];
        return { points: left === from ? points : points.reverse(), route: null };
    }
    const stored = link.route;
    const ports = stored ? routePorts(from, to, stored) : null;
    // A stored route that no longer fits the leads (an element was turned) gives way to the automatic one
    const route = stored && ports && fits(stored, ...ports) ? stored : autoRoute(from, to);
    return { points: routePoints(...(route === stored ? ports! : routePorts(from, to, route)), route), route };
}

/**
 * The route after dragging one segment to a point. A middle segment moves across its direction. An end segment
 * gains a step out of its lead (on a busbar, it slides along the bar instead). A line without a route takes one.
 */
export function dragSegment(from: DiagramNode, to: DiagramNode, shape: LinkShape, segment: number, at: Point): Route {
    const [start, end] = routePorts(from, to, shape.route ?? []);
    if (!shape.route) return [snap(main(axisOf(start.side), at))];
    const route = [...shape.route];
    const n = route.length;
    const axis = axisOf(start.side);
    if (segment >= 1 && segment <= n) {
        // Odd segments run across the start's leads (their position is along them), even ones along
        route[segment - 1] = snap(segment % 2 === 1 ? main(axis, at) : cross(axis, at));
        return route;
    }
    const atStart = segment === 0;
    const port = atStart ? start : end;
    const across = snap(cross(axisOf(port.side), at));
    if ((atStart ? from : to).kind === "busbar") {
        if (n === 1) return [route[0]!, across, route[0]!];
        if (n >= 2) route[atStart ? 1 : n - 2] = across;
        return route;
    }
    const step = main(axisOf(port.side), stepOut(port));
    return atStart ? [step, across, ...route] : [...route, across, step];
}

/**
 * The route without its steps of zero length, so dragged routes stay tidy. The value that places a line on a busbar
 * is kept.
 */
export function tidyRoute(from: DiagramNode, to: DiagramNode, input: Route): Route {
    const route = [...input];
    for (;;) {
        const [start, end] = routePorts(from, to, route);
        const n = route.length;
        // On a busbar, route[1] (route[n - 2] at the end) is where the line meets the bar
        const keeps = (index: number) => (from.kind === "busbar" && index === 1) || (to.kind === "busbar" && index === n - 2);
        if (n >= 3 && from.kind !== "busbar" && route[1] === cross(axisOf(start.side), start)) route.splice(0, 2);
        else if (n >= 3 && to.kind !== "busbar" && route[n - 2] === cross(axisOf(end.side), end)) route.splice(n - 2, 2);
        else {
            const i = route.findIndex((value, index) => index + 2 < n && value === route[index + 2] && !keeps(index + 1) && !keeps(index + 2));
            if (i < 0) return route;
            route.splice(i + 1, 2);
        }
    }
}

/** The route without one segment (a double click on it); null, the line routing itself, when no bend is left. */
export function removeSegment(from: DiagramNode, to: DiagramNode, route: Route, segment: number): Route | null {
    const n = route.length;
    if (n <= 1) return null;
    const next = [...route];
    next.splice(segment <= 0 ? 0 : Math.min(segment - 1, n - 2), 2);
    return tidyRoute(from, to, next);
}

export const pathOf = (points: readonly Point[]) => points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
