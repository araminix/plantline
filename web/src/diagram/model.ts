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
}

/** A connection between two elements; it has no direction. */
export interface DiagramLink {
    id: string;
    from: string;
    to: string;
}

export interface Diagram {
    plantType: PlantType;
    name: string;
    nodes: DiagramNode[];
    links: DiagramLink[];
}

export const GRID = 20;
export const NODE_SIZE = 48;
export const BUSBAR_WIDTH = 240;

export const snap = (value: number) => Math.round(value / GRID) * GRID;

export const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

export const emptyDiagram = (plantType: PlantType, name = ""): Diagram => ({ plantType, name, nodes: [], links: [] });

export function addNode(diagram: Diagram, kind: NodeKind, x: number, y: number): { diagram: Diagram; id: string } {
    const node: DiagramNode = {
        id: newId("n"),
        kind,
        x: snap(x),
        y: snap(y),
        label: "",
        designation: "",
        voltageKv: null,
        ratingKva: null,
        width: kind === "busbar" ? BUSBAR_WIDTH : null,
    };
    return { diagram: { ...diagram, nodes: [...diagram.nodes, node] }, id: node.id };
}

export function updateNode(diagram: Diagram, id: string, patch: Partial<Omit<DiagramNode, "id" | "kind">>): Diagram {
    return { ...diagram, nodes: diagram.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)) };
}

/** Moves the nodes by (dx, dy); `snapped` puts them back on the grid, as at the end of a drag. */
export function moveNodes(diagram: Diagram, ids: ReadonlySet<string>, dx: number, dy: number, snapped: boolean): Diagram {
    const place = (value: number) => (snapped ? snap(value) : value);
    return { ...diagram, nodes: diagram.nodes.map((node) => (ids.has(node.id) ? { ...node, x: place(node.x + dx), y: place(node.y + dy) } : node)) };
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
    return { ...diagram, links: [...diagram.links, { id: newId("l"), from, to }] };
}
