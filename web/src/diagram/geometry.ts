import type { NodeKind } from "../plants";
import { BUSBAR_WIDTH, GRID, NODE_SIZE, snap, type Box, type DiagramLink, type DiagramNode, type Point, type Route } from "./model";

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

const along = (node: DiagramNode, x: number) => {
    const reach = Math.max(0, busbarHalf(node) - BUSBAR_INSET);
    return Math.min(Math.max(x, node.x - reach), node.x + reach);
};

/** The side facing a level: the bottom for one below the element, the top for one above, if the element has it. */
const sideTowards = (node: DiagramNode, y: number): Side => {
    const sides = sidesOf(node);
    const wanted: Side = y > node.y ? "down" : "up";
    return sides.includes(wanted) ? wanted : sides[0]!;
};

/** Where a line leaves an element on a side: the end of its lead, or (a busbar) the point of the bar nearest `x`. */
export function portAt(node: DiagramNode, side: Side, x: number): Port {
    if (node.kind === "busbar") return { x: along(node, x), y: node.y, side };
    return { x: node.x, y: node.y + (side === "up" ? -HALF : HALF), side };
}

/** The port facing a point. */
export const portTowards = (node: DiagramNode, towards: Point): Port => portAt(node, sideTowards(node, towards.y), towards.x);

/** The ports of a routed line: each faces its route's nearest segment; on a busbar, under the nearest vertical one. */
function routePorts(from: DiagramNode, to: DiagramNode, route: Route): [Port, Port] {
    const n = route.length;
    const start = portAt(from, sideTowards(from, route[0]!), n >= 2 ? route[1]! : to.x);
    const end = portAt(to, sideTowards(to, route[n - 1]!), n >= 2 ? route[n - 2]! : start.x);
    return [start, end];
}

function routePoints(start: Point, end: Point, route: Route): Point[] {
    const points: Point[] = [start];
    let x = start.x;
    route.forEach((value, i) => {
        if (i % 2 === 1) x = value;
        points.push({ x, y: i % 2 === 0 ? value : route[i - 1]! });
    });
    points.push({ x: end.x, y: route.at(-1)! }, end);
    return points;
}

/** What the pointer must not cross: a symbol, or a busbar's bar. */
const body = (node: DiagramNode): Box =>
    node.kind === "busbar"
        ? { minX: node.x - busbarHalf(node), minY: node.y - 2, maxX: node.x + busbarHalf(node), maxY: node.y + 2 }
        : { minX: node.x - HALF + 1, minY: node.y - HALF + 1, maxX: node.x + HALF - 1, maxY: node.y + HALF - 1 };

const crosses = (a: Point, b: Point, box: Box) =>
    Math.max(a.x, b.x) > box.minX && Math.min(a.x, b.x) < box.maxX && Math.max(a.y, b.y) > box.minY && Math.min(a.y, b.y) < box.maxY;

/** A route whose line runs through neither end's symbol (a line may arrive at a busbar from either side). */
function clear(from: DiagramNode, to: DiagramNode, route: Route): boolean {
    const points = routePoints(...routePorts(from, to, route), route);
    return points.slice(1).every((point, i) => {
        const a = points[i]!;
        const throughFrom = !(i === 0 && from.kind === "busbar") && crosses(a, point, body(from));
        const throughTo = !(i === points.length - 2 && to.kind === "busbar") && crosses(a, point, body(to));
        return !throughFrom && !throughTo;
    });
}

/**
 * The route a line takes by itself: down from the upper element, across halfway and into the lower one; when a lead
 * points away (a grid connection under its busbar), out of it and around the symbol.
 */
export function autoRoute(from: DiagramNode, to: DiagramNode): Route {
    const start = portTowards(from, to);
    const end = portTowards(to, start);
    const out = (port: Port) => port.y + (port.side === "down" ? GRID : -GRID);
    const [ys, ye] = [out(start), out(end)];
    const beside = (node: DiagramNode) => node.x - HALF - GRID;
    const candidates: Route[] = [
        [(start.y + end.y) / 2],
        [start.side === "down" ? Math.max(ys, ye) : Math.min(ys, ye)],
        [ys, beside(from), ye],
        [ys, beside(to), ye],
        [ys, Math.min(beside(from), beside(to)), ye],
    ];
    return candidates.find((route) => clear(from, to, route)) ?? candidates[0]!;
}

/** Two symbols on one row are joined from side to side, as before routes existed. */
const sideBySide = (from: DiagramNode, to: DiagramNode) => Math.abs(from.y - to.y) < HALF && from.kind !== "busbar" && to.kind !== "busbar" && sidesOf(from).length === 2 && sidesOf(to).length === 2;

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
    const route = link.route ?? autoRoute(from, to);
    return { points: routePoints(...routePorts(from, to, route), route), route };
}

/**
 * The route after dragging one segment to a point. A middle segment moves across its direction. An end segment
 * gains a step out of its lead (on a busbar, it slides along the bar instead). A line without a route takes one.
 */
export function dragSegment(from: DiagramNode, to: DiagramNode, shape: LinkShape, segment: number, at: Point): Route {
    if (!shape.route) return [snap(at.y)];
    const route = [...shape.route];
    const n = route.length;
    const [start, end] = routePorts(from, to, route);
    if (segment >= 1 && segment <= n) {
        route[segment - 1] = snap(segment % 2 === 1 ? at.y : at.x);
        return route;
    }
    const x = snap(at.x);
    const atStart = segment === 0;
    const node = atStart ? from : to;
    if (node.kind === "busbar") {
        if (n === 1) return [route[0]!, x, route[0]!];
        route[atStart ? 1 : n - 2] = x;
        return route;
    }
    const port = atStart ? start : end;
    const step = port.y + (port.side === "down" ? GRID : -GRID);
    return atStart ? [step, x, ...route] : [...route, x, step];
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
        if (n >= 3 && from.kind !== "busbar" && route[1] === start.x) route.splice(0, 2);
        else if (n >= 3 && to.kind !== "busbar" && route[n - 2] === end.x) route.splice(n - 2, 2);
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
    if (n === 1) return null;
    const next = [...route];
    const index = segment <= 0 ? 0 : segment > n ? n - 2 : Math.min(segment - 1, n - 2);
    next.splice(index, 2);
    return tidyRoute(from, to, next);
}

export const pathOf = (points: readonly Point[]) => points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
