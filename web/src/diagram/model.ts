import type { NodeKind, PlantType } from "../plants";

/** An element of the diagram, centred on (x, y). */
export interface DiagramNode {
    id: string;
    kind: NodeKind;
    x: number;
    y: number;
    label: string;
    /** Reference designation, such as "=H02-Q1" (IEC 81346). */
    designation: string;
    voltageKv: number | null;
    ratingKva: number | null;
    /** Busbars only: their length. */
    width: number | null;
    /** Turned clockwise, in degrees; a busbar is either across (0) or upright (90). */
    rotation: Rotation;
    /** The symbol mirrored across its own axis (before it is turned). */
    flip: boolean;
    /** Where the label starts, from the element's centre; null for its usual place. */
    labelAt: Point | null;
}

export type Rotation = 0 | 90 | 180 | 270;

/**
 * A right-angled line's path between its two ends, as the positions of its middle segments: the y of a horizontal
 * segment, then the x of a vertical one, and so on, always an odd count. The segments at the ends run straight out of
 * the elements' leads, so moving an element never breaks a route (see geometry.ts).
 */
export type Route = readonly number[];

/** A connection between two elements; it has no direction. */
export interface DiagramLink {
    id: string;
    from: string;
    to: string;
    /** Its path, once dragged into shape; null while it routes itself. */
    route: Route | null;
    /** Drawn straight from lead to lead instead of at right angles. */
    straight: boolean;
}

export interface Diagram {
    plantType: PlantType;
    name: string;
    nodes: DiagramNode[];
    links: DiagramLink[];
}

export interface Point {
    x: number;
    y: number;
}

export interface Box {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export const GRID = 20;
export const NODE_SIZE = 48;
export const BUSBAR_WIDTH = 240;
/** The room kept beside a symbol for its label. */
export const LABEL_ROOM = 120;

export const snap = (value: number) => Math.round(value / GRID) * GRID;

export const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

export const emptyDiagram = (plantType: PlantType, name = ""): Diagram => ({ plantType, name, nodes: [], links: [] });

/** The room an element takes: its symbol with the label beside it, or a busbar with its label above (or beside it, upright). */
export function footprint(node: Pick<DiagramNode, "kind" | "x" | "y" | "width" | "rotation">): Box {
    if (node.kind === "busbar") {
        const half = (node.width ?? BUSBAR_WIDTH) / 2;
        if (node.rotation % 180 === 90) return { minX: node.x - 8, minY: node.y - half - 8, maxX: node.x + 8, maxY: node.y + half };
        return { minX: node.x - half, minY: node.y - 24, maxX: node.x + half, maxY: node.y + 8 };
    }
    const half = NODE_SIZE / 2;
    // A symbol turned across the page has its label above it
    if (node.rotation % 180 === 90) return { minX: node.x - half, minY: node.y - half - 24, maxX: node.x - half + LABEL_ROOM, maxY: node.y + half };
    return { minX: node.x - half, minY: node.y - half, maxX: node.x + half + LABEL_ROOM, maxY: node.y + half };
}

export const overlaps = (a: Box, b: Box) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
const MAX_RING = 100;

/** The grid point nearest to (x, y), ring by ring, where an element of this kind and width overlaps no other. */
export function freeSpot(diagram: Diagram, kind: NodeKind, width: number | null, x: number, y: number): Point {
    const taken = diagram.nodes.map(footprint);
    const [x0, y0] = [snap(x), snap(y)];
    for (let ring = 0; ring <= MAX_RING; ring++) {
        const spots: Point[] = [];
        for (let i = -ring; i <= ring; i++) {
            for (let j = -ring; j <= ring; j++) {
                if (Math.max(Math.abs(i), Math.abs(j)) === ring) spots.push({ x: x0 + i * GRID, y: y0 + j * GRID });
            }
        }
        spots.sort((a, b) => Math.hypot(a.x - x0, a.y - y0) - Math.hypot(b.x - x0, b.y - y0));
        const free = spots.find((spot) => !taken.some((box) => overlaps(footprint({ kind, width, rotation: 0, ...spot }), box)));
        if (free) return free;
    }
    return { x: x0, y: y0 };
}

/** Adds an element at the free grid point nearest to (x, y): never on top of another. */
export function addNode(diagram: Diagram, kind: NodeKind, x: number, y: number): { diagram: Diagram; id: string } {
    const width = kind === "busbar" ? BUSBAR_WIDTH : null;
    const node: DiagramNode = {
        id: newId("n"),
        kind,
        ...freeSpot(diagram, kind, width, x, y),
        label: "",
        designation: "",
        voltageKv: null,
        ratingKva: null,
        width,
        rotation: 0,
        flip: false,
        labelAt: null,
    };
    return { diagram: { ...diagram, nodes: [...diagram.nodes, node] }, id: node.id };
}

export function updateNode(diagram: Diagram, id: string, patch: Partial<Omit<DiagramNode, "id" | "kind">>): Diagram {
    return { ...diagram, nodes: diagram.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)) };
}

/**
 * Moves the nodes by (dx, dy); `snapped` puts them back on the grid, as at the end of a drag. A line between two moved
 * elements keeps its shape; a line to an element left behind stretches.
 */
export function moveNodes(diagram: Diagram, ids: ReadonlySet<string>, dx: number, dy: number, snapped: boolean): Diagram {
    const place = (value: number) => (snapped ? snap(value) : value);
    const moved = new Map<string, Point>();
    const nodes = diagram.nodes.map((node) => {
        if (!ids.has(node.id)) return node;
        const next = { ...node, x: place(node.x + dx), y: place(node.y + dy) };
        moved.set(node.id, { x: next.x - node.x, y: next.y - node.y });
        return next;
    });
    const links = diagram.links.map((link) => {
        const shift = moved.get(link.from);
        return link.route && shift && moved.has(link.to) ? { ...link, route: link.route.map((value, i) => value + (i % 2 === 0 ? shift.y : shift.x)) } : link;
    });
    return { ...diagram, nodes, links };
}

export function updateLink(diagram: Diagram, id: string, patch: Partial<Pick<DiagramLink, "route" | "straight">>): Diagram {
    return { ...diagram, links: diagram.links.map((link) => (link.id === id ? { ...link, ...patch } : link)) };
}

/** Removes the nodes with their links, and the links. */
export function removeItems(diagram: Diagram, nodeIds: ReadonlySet<string>, linkIds: ReadonlySet<string> = new Set()): Diagram {
    return {
        ...diagram,
        nodes: diagram.nodes.filter((node) => !nodeIds.has(node.id)),
        links: diagram.links.filter((link) => !linkIds.has(link.id) && !nodeIds.has(link.from) && !nodeIds.has(link.to)),
    };
}

/** Links two nodes; null when they are the same node or already linked. */
export function connect(diagram: Diagram, from: string, to: string): Diagram | null {
    const linked = diagram.links.some((link) => (link.from === from && link.to === to) || (link.from === to && link.to === from));
    if (from === to || linked) return null;
    return { ...diagram, links: [...diagram.links, { id: newId("l"), from, to, route: null, straight: false }] };
}

/** Moves one end of a line to another element; null when that changes nothing, joins an element to itself or repeats a line. */
export function reconnect(diagram: Diagram, linkId: string, end: "from" | "to", nodeId: string): Diagram | null {
    const link = diagram.links.find((candidate) => candidate.id === linkId);
    if (!link || link[end] === nodeId) return null;
    const moved = { ...link, [end]: nodeId, route: null };
    const repeated = diagram.links.some((other) => other.id !== linkId && ((other.from === moved.from && other.to === moved.to) || (other.from === moved.to && other.to === moved.from)));
    if (moved.from === moved.to || repeated) return null;
    return { ...diagram, links: diagram.links.map((candidate) => (candidate.id === linkId ? moved : candidate)) };
}
