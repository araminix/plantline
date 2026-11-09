import type { NodeKind } from "../plants";
import { busbarHalf, linkPoints, pathOf, sidesOf } from "./geometry";
import { NODE_SIZE, type Diagram, type DiagramNode } from "./model";
import { NodeSymbol } from "./symbols";

const HALF = NODE_SIZE / 2;

interface Props {
    diagram: Diagram;
    kindName: (kind: NodeKind) => string;
    selectedNodes?: ReadonlySet<string>;
    selectedLink?: string | null;
    /** The element a line being drawn would connect to. */
    targetNode?: string | null;
    /** The line whose end is being moved, drawn faintly meanwhile. */
    movingLink?: string | null;
    /** The canvas adds hit areas, connection points and line ends for the pointer; an export leaves them out. */
    interactive?: boolean;
}

/** The elements and links of a diagram, in diagram coordinates. Used by the canvas and by every export. */
export function DiagramContent({ diagram, kindName, selectedNodes, selectedLink, targetNode, movingLink, interactive = false }: Props) {
    const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
    const ends = (() => {
        const link = interactive ? diagram.links.find((candidate) => candidate.id === selectedLink) : undefined;
        const [from, to] = [byId.get(link?.from ?? ""), byId.get(link?.to ?? "")];
        return link && from && to ? { link, points: linkPoints(from, to) } : null;
    })();
    return (
        <>
            <g className="sld-links" fill="none" stroke="currentColor" strokeWidth={2}>
                {diagram.links.map((link) => {
                    const from = byId.get(link.from);
                    const to = byId.get(link.to);
                    if (!from || !to) return null;
                    const path = pathOf(linkPoints(from, to));
                    return (
                        <g key={link.id} data-link={link.id} className={classes(link.id === selectedLink && "selected", link.id === movingLink && "moving")}>
                            <path d={path} />
                            {interactive && <path d={path} className="hit" stroke="transparent" strokeWidth={14} />}
                        </g>
                    );
                })}
            </g>
            {diagram.nodes.map((node) => (
                <g key={node.id} data-node={node.id} transform={`translate(${node.x} ${node.y})`} className={classes("sld-node", selectedNodes?.has(node.id) && "selected", node.id === targetNode && "target")}>
                    {node.kind === "busbar" ? <rect x={-busbarHalf(node)} y={-3} width={busbarHalf(node) * 2} height={6} fill="currentColor" /> : <NodeSymbol kind={node.kind} />}
                    {interactive && <rect className="hit" {...hitBox(node)} fill="transparent" />}
                    <NodeLabel node={node} kindName={kindName} />
                    {interactive && <Ports node={node} />}
                </g>
            ))}
            {/* The selected line's ends, over the elements: drag one to another element */}
            {ends && (
                <g data-link-ends={ends.link.id}>
                    <circle className="link-end" data-end="from" cx={ends.points[0]!.x} cy={ends.points[0]!.y} r={6} />
                    <circle className="link-end" data-end="to" cx={ends.points.at(-1)!.x} cy={ends.points.at(-1)!.y} r={6} />
                </g>
            )}
        </>
    );
}

const classes = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ") || undefined;

/** The connection points a line can be dragged from: each lead's end, or along a busbar. Shown on hover and selection. */
function Ports({ node }: { node: DiagramNode }) {
    const points =
        node.kind === "busbar"
            ? [-1, 0, 1].map((at) => ({ key: at, x: at * Math.max(0, busbarHalf(node) - 8), y: 0 }))
            : sidesOf(node).map((side) => ({ key: side, x: 0, y: side === "up" ? -HALF : HALF }));
    return (
        <>
            {points.map(({ key, x, y }) => (
                <g key={key} className="port" data-port={key}>
                    <circle cx={x} cy={y} r={9} fill="transparent" stroke="none" />
                    <circle cx={x} cy={y} r={4.5} className="port-dot" />
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

/** Where the pointer selects an element: the symbol and its label (easier to hit with a finger), or the whole busbar. */
const LABEL_WIDTH = 110;
const hitBox = (node: DiagramNode) =>
    node.kind === "busbar"
        ? { x: -busbarHalf(node), y: -12, width: busbarHalf(node) * 2, height: 24 }
        : { x: -HALF, y: -HALF, width: NODE_SIZE + LABEL_WIDTH, height: NODE_SIZE };

/** The extent of the drawn diagram (minX, minY, maxX, maxY), labels included roughly; null when empty. */
export function contentBounds(diagram: Diagram): [number, number, number, number] | null {
    if (diagram.nodes.length === 0) return null;
    const xs = diagram.nodes.flatMap((node) => (node.kind === "busbar" ? [node.x - busbarHalf(node), node.x + busbarHalf(node)] : [node.x - HALF, node.x + HALF + 140]));
    const ys = diagram.nodes.flatMap((node) => [node.y - HALF - 16, node.y + HALF]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
