import { BUSBAR_WIDTH, NODE_SIZE, snap, type Diagram, type DiagramNode } from "./model";

const ROW = 120;
const GAP = 40;
const LABEL = 120;
const MARGIN = 80;

/** The room an element takes in a row: a busbar its length, any other its symbol and the label beside it. */
const slot = (node: DiagramNode) => (node.kind === "busbar" ? (node.width ?? BUSBAR_WIDTH) : NODE_SIZE + LABEL);

/**
 * Lays the diagram out in rows, top-down from the grid connection: each element one row below the element it hangs
 * from, rows centred on each other (a single feeder hangs straight down), and separate groups side by side. The order
 * inside a row follows the current x, so a manual order is kept.
 */
export function arrange(diagram: Diagram): Diagram {
    const neighbours = new Map(diagram.nodes.map((node) => [node.id, [] as string[]]));
    for (const link of diagram.links) {
        neighbours.get(link.from)?.push(link.to);
        neighbours.get(link.to)?.push(link.from);
    }
    const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
    const roots = [...diagram.nodes].sort((a, b) => Number(b.kind === "gridConnection") - Number(a.kind === "gridConnection") || a.y - b.y || a.x - b.x);
    const placed = new Map<string, { x: number; y: number }>();
    let left = MARGIN;

    for (const root of roots) {
        if (placed.has(root.id)) continue;
        const rows = layers(root, neighbours, byId, placed);
        const rowWidth = (row: DiagramNode[]) => row.reduce((sum, node) => sum + slot(node), 0) + GAP * (row.length - 1);
        const width = Math.max(...rows.map(rowWidth));
        const middle = left + width / 2;
        rows.forEach((row, level) => {
            let x = 0;
            const centres = [...row]
                .sort((a, b) => a.x - b.x)
                .map((node) => {
                    // A symbol sits at the start of its slot, its label after it; a busbar fills its slot
                    const centre = x + (node.kind === "busbar" ? slot(node) / 2 : NODE_SIZE / 2);
                    x += slot(node) + GAP;
                    return { node, centre };
                });
            const shift = middle - (centres[0]!.centre + centres.at(-1)!.centre) / 2;
            for (const { node, centre } of centres) placed.set(node.id, { x: snap(centre + shift), y: snap(MARGIN + level * ROW) });
        });
        left += width + 2 * GAP;
    }

    const arranged = diagram.nodes.map((node) => ({ ...node, ...placed.get(node.id) }));
    return { ...diagram, nodes: arranged.map((node) => (node.kind === "busbar" ? { ...node, width: busbarSpan(node, arranged, neighbours) } : node)) };
}

/** A busbar long enough to reach every element hanging from it, so its feeders drop straight down. */
function busbarSpan(busbar: DiagramNode, nodes: DiagramNode[], neighbours: Map<string, string[]>): number {
    const linked = new Set(neighbours.get(busbar.id));
    const reach = nodes.filter((node) => linked.has(node.id) && node.y > busbar.y).map((node) => Math.abs(node.x - busbar.x));
    return Math.max(busbar.width ?? BUSBAR_WIDTH, snap(2 * Math.max(0, ...reach) + 2 * GAP));
}

/** The nodes reachable from the root and not yet placed, by distance (breadth-first). */
function layers(root: DiagramNode, neighbours: Map<string, string[]>, byId: Map<string, DiagramNode>, placed: Map<string, unknown>): DiagramNode[][] {
    const seen = new Set([root.id]);
    const rows: DiagramNode[][] = [];
    let current = [root];
    while (current.length > 0) {
        rows.push(current);
        const next: DiagramNode[] = [];
        for (const node of current) {
            for (const id of neighbours.get(node.id) ?? []) {
                const neighbour = byId.get(id);
                if (neighbour && !seen.has(id) && !placed.has(id)) {
                    seen.add(id);
                    next.push(neighbour);
                }
            }
        }
        current = next;
    }
    return rows;
}
