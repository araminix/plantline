import type { NodeKind } from "../plants";
import { NODE_SIZE, type Diagram, type DiagramNode } from "./model";
import { NodeSymbol } from "./symbols";

const HALF = NODE_SIZE / 2;

interface Props {
    diagram: Diagram;
    kindName: (kind: NodeKind) => string;
    selectedNodes?: ReadonlySet<string>;
    selectedLink?: string | null;
    /** The canvas adds invisible hit areas for the pointer; an export leaves them out. */
    interactive?: boolean;
}

/** The elements and links of a diagram, in diagram coordinates. Used by the canvas and by every export. */
export function DiagramContent({ diagram, kindName, selectedNodes, selectedLink, interactive = false }: Props) {
    const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
    return (
        <>
            <g className="sld-links" fill="none" stroke="currentColor" strokeWidth={2}>
                {diagram.links.map((link) => {
                    const from = byId.get(link.from);
                    const to = byId.get(link.to);
                    if (!from || !to) return null;
                    const path = linkPath(from, to);
                    return (
                        <g key={link.id} data-link={link.id} className={link.id === selectedLink ? "selected" : undefined}>
                            <path d={path} />
                            {interactive && <path d={path} className="hit" stroke="transparent" strokeWidth={14} />}
                        </g>
                    );
                })}
            </g>
            {diagram.nodes.map((node) => (
                <g key={node.id} data-node={node.id} transform={`translate(${node.x} ${node.y})`} className={selectedNodes?.has(node.id) ? "sld-node selected" : "sld-node"}>
                    {node.kind === "busbar" ? <rect x={-busbarHalf(node)} y={-3} width={busbarHalf(node) * 2} height={6} fill="currentColor" /> : <NodeSymbol kind={node.kind} />}
                    {interactive && <rect className="hit" {...hitBox(node)} fill="transparent" />}
                    <NodeLabel node={node} kindName={kindName} />
                </g>
            ))}
        </>
    );
}

function NodeLabel({ node, kindName }: { node: DiagramNode; kindName: (kind: NodeKind) => string }) {
    const title = node.label || kindName(node.kind);
    const details = [node.designation, node.voltageKv !== null ? `${node.voltageKv} kV` : "", node.ratingKva !== null ? `${node.ratingKva} kVA` : ""].filter(Boolean).join(" · ");
    const [x, y] = node.kind === "busbar" ? [-busbarHalf(node), -10] : [HALF + 6, -2];
    return (
        <text x={x} y={y} fontSize={11} fill="currentColor" stroke="none">
            <tspan fontWeight={600}>{title}</tspan>
            {details && (
                <tspan x={x} dy={14}>
                    {details}
                </tspan>
            )}
        </text>
    );
}

const busbarHalf = (node: DiagramNode) => (node.width ?? 240) / 2;

/** Where the pointer selects an element: the symbol and its label (easier to hit with a finger), or the whole busbar. */
const LABEL_WIDTH = 110;
const hitBox = (node: DiagramNode) =>
    node.kind === "busbar"
        ? { x: -busbarHalf(node), y: -12, width: busbarHalf(node) * 2, height: 24 }
        : { x: -HALF, y: -HALF, width: NODE_SIZE + LABEL_WIDTH, height: NODE_SIZE };

/** Where a link meets an element: the top or bottom connection point, anywhere along a busbar. */
function port(node: DiagramNode, side: "top" | "bottom", towardsX: number): [number, number] {
    if (node.kind === "busbar") {
        const half = busbarHalf(node) - 8;
        return [Math.min(Math.max(towardsX, node.x - half), node.x + half), node.y];
    }
    return [node.x, node.y + (side === "top" ? -HALF : HALF)];
}

/** An orthogonal path from the upper element down to the lower one; side by side when they are on one row. */
export function linkPath(a: DiagramNode, b: DiagramNode): string {
    const [upper, lower] = a.y <= b.y ? [a, b] : [b, a];
    if (Math.abs(upper.y - lower.y) < HALF && upper.kind !== "busbar" && lower.kind !== "busbar") {
        const [left, right] = upper.x <= lower.x ? [upper, lower] : [lower, upper];
        return `M${left.x + HALF} ${left.y} H${right.x - HALF}`;
    }
    const [x1, y1] = port(upper, "bottom", lower.x);
    const [x2, y2] = port(lower, "top", upper.x);
    const middle = (y1 + y2) / 2;
    return `M${x1} ${y1} V${middle} H${x2} V${y2}`;
}

/** The extent of the drawn diagram (minX, minY, maxX, maxY), labels included roughly; null when empty. */
export function contentBounds(diagram: Diagram): [number, number, number, number] | null {
    if (diagram.nodes.length === 0) return null;
    const xs = diagram.nodes.flatMap((node) => (node.kind === "busbar" ? [node.x - busbarHalf(node), node.x + busbarHalf(node)] : [node.x - HALF, node.x + HALF + 140]));
    const ys = diagram.nodes.flatMap((node) => [node.y - HALF - 16, node.y + HALF]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
