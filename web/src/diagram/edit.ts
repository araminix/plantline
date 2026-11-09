import { BUSBAR_WIDTH, footprint, GRID, NODE_SIZE, newId, overlaps, snap, updateNode, type Box, type Diagram, type DiagramLink, type DiagramNode, type Point, type Rotation } from "./model";

/** Group editing: selecting by area, copying, turning, mirroring, aligning and spacing elements. */

/** The drawn element without its label: the symbol, or the bar. */
export function extent(node: DiagramNode): Box {
    if (node.kind !== "busbar") return { minX: node.x - NODE_SIZE / 2, minY: node.y - NODE_SIZE / 2, maxX: node.x + NODE_SIZE / 2, maxY: node.y + NODE_SIZE / 2 };
    const half = (node.width ?? BUSBAR_WIDTH) / 2;
    const [w, h] = node.rotation % 180 === 90 ? [3, half] : [half, 3];
    return { minX: node.x - w, minY: node.y - h, maxX: node.x + w, maxY: node.y + h };
}

/**
 * The elements in an area, as in CAD: dragged left to right, those wholly inside it; right to left (`crossing`), those
 * it touches.
 */
export function nodesInBox(diagram: Diagram, box: Box, crossing: boolean): string[] {
    const inside = (e: Box) => e.minX >= box.minX && e.maxX <= box.maxX && e.minY >= box.minY && e.maxY <= box.maxY;
    return diagram.nodes.filter((node) => (crossing ? overlaps(extent(node), box) : inside(extent(node)))).map((node) => node.id);
}

/** Copied elements with the lines between them. */
export interface Clip {
    nodes: DiagramNode[];
    links: DiagramLink[];
}

export const copyItems = (diagram: Diagram, ids: ReadonlySet<string>): Clip => ({
    nodes: diagram.nodes.filter((node) => ids.has(node.id)),
    links: diagram.links.filter((link) => ids.has(link.from) && ids.has(link.to)),
});

/** Adds copies with new ids, a few grid steps down and to the right: the first place where they overlap nothing. */
export function pasteItems(diagram: Diagram, clip: Clip): { diagram: Diagram; ids: string[] } {
    const taken = diagram.nodes.map(footprint);
    const fitsAt = (d: number) => clip.nodes.every((node) => !taken.some((box) => overlaps(footprint({ ...node, x: node.x + d, y: node.y + d }), box)));
    let d = 2 * GRID;
    while (d < 100 * GRID && !fitsAt(d)) d += 2 * GRID;
    const ids = new Map(clip.nodes.map((node) => [node.id, newId("n")]));
    const nodes = clip.nodes.map((node) => ({ ...node, id: ids.get(node.id)!, x: node.x + d, y: node.y + d }));
    const links = clip.links.map((link) => ({ ...link, id: newId("l"), from: ids.get(link.from)!, to: ids.get(link.to)!, route: link.route?.map((value) => value + d) ?? null }));
    return { diagram: { ...diagram, nodes: [...diagram.nodes, ...nodes], links: [...diagram.links, ...links] }, ids: nodes.map((node) => node.id) };
}

/** The middle of the elements' centres (exact, so mirrored places stay on the grid). */
function middle(nodes: DiagramNode[]): Point {
    const xs = nodes.map((node) => node.x);
    const ys = nodes.map((node) => node.y);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/** Changes the chosen elements; their lines route themselves again, since their leads moved. */
function reshape(diagram: Diagram, ids: ReadonlySet<string>, change: (node: DiagramNode, centre: Point) => DiagramNode): Diagram {
    const chosen = diagram.nodes.filter((node) => ids.has(node.id));
    if (chosen.length === 0) return diagram;
    const centre = middle(chosen);
    return {
        ...diagram,
        nodes: diagram.nodes.map((node) => (ids.has(node.id) ? { ...change(node, centre), labelAt: null } : node)),
        links: diagram.links.map((link) => (ids.has(link.from) || ids.has(link.to) ? { ...link, route: null } : link)),
    };
}

/** Turns the elements a quarter clockwise around their middle; a busbar goes from across to upright and back. */
export const rotateNodes = (diagram: Diagram, ids: ReadonlySet<string>) =>
    reshape(diagram, ids, (node, c) => ({
        ...node,
        x: snap(c.x - (node.y - c.y)),
        y: snap(c.y + (node.x - c.x)),
        rotation: ((node.kind === "busbar" ? (node.rotation + 90) % 180 : (node.rotation + 90) % 360) as Rotation),
    }));

/** Mirrors the elements left to right around their middle. */
export const flipNodes = (diagram: Diagram, ids: ReadonlySet<string>) =>
    reshape(diagram, ids, (node, c) => ({
        ...node,
        x: snap(2 * c.x - node.x),
        flip: !node.flip,
        // Mirroring a turned symbol turns it the other way
        rotation: (node.kind === "busbar" ? node.rotation : (360 - node.rotation) % 360) as Rotation,
    }));

export type Alignment = "left" | "centre" | "right" | "top" | "middle" | "bottom";

/** Lines the elements up on their edges or centres, within the area they take together. */
export function alignNodes(diagram: Diagram, ids: ReadonlySet<string>, how: Alignment): Diagram {
    const chosen = diagram.nodes.filter((node) => ids.has(node.id));
    if (chosen.length < 2) return diagram;
    const boxes = chosen.map(extent);
    const across = how === "left" || how === "centre" || how === "right";
    const [min, max] = across ? [Math.min(...boxes.map((b) => b.minX)), Math.max(...boxes.map((b) => b.maxX))] : [Math.min(...boxes.map((b) => b.minY)), Math.max(...boxes.map((b) => b.maxY))];
    return {
        ...diagram,
        nodes: diagram.nodes.map((node) => {
            if (!ids.has(node.id)) return node;
            const box = extent(node);
            const [low, high, centre] = across ? [box.minX, box.maxX, node.x] : [box.minY, box.maxY, node.y];
            const shift = how === "left" || how === "top" ? min - low : how === "right" || how === "bottom" ? max - high : (min + max) / 2 - centre;
            return across ? { ...node, x: snap(node.x + shift) } : { ...node, y: snap(node.y + shift) };
        }),
    };
}

/** Spaces the elements' centres evenly between the first and the last, across or down. */
export function distributeNodes(diagram: Diagram, ids: ReadonlySet<string>, across: boolean): Diagram {
    const key = across ? "x" : "y";
    const chosen = diagram.nodes.filter((node) => ids.has(node.id)).sort((a, b) => a[key] - b[key]);
    if (chosen.length < 3) return diagram;
    const [first, last] = [chosen[0]![key], chosen.at(-1)![key]];
    const placed = new Map(chosen.map((node, i) => [node.id, snap(first + ((last - first) * i) / (chosen.length - 1))]));
    return { ...diagram, nodes: diagram.nodes.map((node) => (placed.has(node.id) ? { ...node, [key]: placed.get(node.id)! } : node)) };
}

const MAX_BUSBAR = 4000;

/** A busbar resized by dragging one end: the other end stays, the length in steps of two grid units. */
export function resizeBusbar(diagram: Diagram, id: string, end: "start" | "end", at: Point): Diagram {
    const node = diagram.nodes.find((candidate) => candidate.id === id);
    if (!node || node.kind !== "busbar") return diagram;
    const upright = node.rotation % 180 === 90;
    const along = (point: Point) => (upright ? point.y : point.x);
    const sign = end === "end" ? 1 : -1;
    const fixed = along(node) - (sign * (node.width ?? BUSBAR_WIDTH)) / 2;
    const width = Math.min(MAX_BUSBAR, Math.max(2 * GRID, Math.round((sign * (along(at) - fixed)) / (2 * GRID)) * 2 * GRID));
    const centre = fixed + (sign * width) / 2;
    return updateNode(diagram, id, upright ? { y: centre, width } : { x: centre, width });
}
