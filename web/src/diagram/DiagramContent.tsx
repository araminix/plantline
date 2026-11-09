import type { NodeKind } from "../plants";
import { busbarHalf, connectionPoints, isUpright, linkShape, pathOf } from "./geometry";
import { NODE_SIZE, type Diagram, type DiagramNode, type Point } from "./model";
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
    /** The canvas adds hit areas, connection points, line ends and busbar handles for the pointer; an export leaves them out. */
    interactive?: boolean;
}

/** The elements and links of a diagram, in diagram coordinates. Used by the canvas and by every export. */
export function DiagramContent({ diagram, kindName, selectedNodes, selectedLink, targetNode, movingLink, interactive = false }: Props) {
    const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
    const ends = (() => {
        const link = interactive ? diagram.links.find((candidate) => candidate.id === selectedLink) : undefined;
        const [from, to] = [byId.get(link?.from ?? ""), byId.get(link?.to ?? "")];
        return link && from && to ? { link, points: linkShape(link, from, to).points } : null;
    })();
    // A busbar selected alone can be resized by its ends
    const [only] = selectedNodes?.size === 1 ? [...selectedNodes] : [];
    const resizable = interactive ? byId.get(only ?? "") : undefined;
    return (
        <>
            <g className="sld-links" fill="none" stroke="currentColor" strokeWidth={2}>
                {diagram.links.map((link) => {
                    const from = byId.get(link.from);
                    const to = byId.get(link.to);
                    if (!from || !to) return null;
                    const { points } = linkShape(link, from, to);
                    return (
                        <g key={link.id} data-link={link.id} className={classes(link.id === selectedLink && "selected", link.id === movingLink && "moving", link.straight && "straight")}>
                            <path d={pathOf(points)} />
                            {/* One hit area per segment, so a segment can be dragged or double-clicked */}
                            {interactive &&
                                points.slice(1).map((point, segment) => {
                                    const start = points[segment]!;
                                    return <line key={segment} className={start.y === point.y ? "hit across" : "hit"} data-segment={segment} x1={start.x} y1={start.y} x2={point.x} y2={point.y} stroke="transparent" strokeWidth={14} />;
                                })}
                        </g>
                    );
                })}
            </g>
            {diagram.nodes.map((node) => (
                <g key={node.id} data-node={node.id} transform={`translate(${node.x} ${node.y})`} className={classes("sld-node", selectedNodes?.has(node.id) && "selected", node.id === targetNode && "target")}>
                    {node.kind === "busbar" ? (
                        isUpright(node) ? (
                            <rect x={-3} y={-busbarHalf(node)} width={6} height={busbarHalf(node) * 2} fill="currentColor" />
                        ) : (
                            <rect x={-busbarHalf(node)} y={-3} width={busbarHalf(node) * 2} height={6} fill="currentColor" />
                        )
                    ) : (
                        <g transform={node.rotation || node.flip ? `rotate(${node.rotation}) scale(${node.flip ? -1 : 1} 1)` : undefined}>
                            <NodeSymbol kind={node.kind} />
                        </g>
                    )}
                    {interactive && <rect className="hit" {...hitBox(node)} fill="transparent" />}
                    <NodeLabel node={node} kindName={kindName} />
                    {interactive && <Ports node={node} />}
                </g>
            ))}
            {/* Over the elements: the selected line's ends, and a lone selected busbar's ends, to drag */}
            {ends && (
                <g data-link-ends={ends.link.id}>
                    <circle className="link-end" data-end="from" cx={ends.points[0]!.x} cy={ends.points[0]!.y} r={6} />
                    <circle className="link-end" data-end="to" cx={ends.points.at(-1)!.x} cy={ends.points.at(-1)!.y} r={6} />
                </g>
            )}
            {resizable?.kind === "busbar" && (
                <g data-resize-node={resizable.id}>
                    {(["start", "end"] as const).map((end) => {
                        const reach = end === "end" ? busbarHalf(resizable) : -busbarHalf(resizable);
                        const [x, y] = isUpright(resizable) ? [resizable.x, resizable.y + reach] : [resizable.x + reach, resizable.y];
                        return <rect key={end} className={isUpright(resizable) ? "resize upright" : "resize"} data-resize={end} x={x - 5} y={y - 5} width={10} height={10} />;
                    })}
                </g>
            )}
        </>
    );
}

const classes = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ") || undefined;

/** The connection points a line can be dragged from: each lead's end, or along a busbar. Shown on hover and selection. */
function Ports({ node }: { node: DiagramNode }) {
    return (
        <>
            {connectionPoints(node).map(({ key, point }) => (
                <g key={key} className="port" data-port={key}>
                    <circle cx={point.x - node.x} cy={point.y - node.y} r={9} fill="transparent" stroke="none" />
                    <circle cx={point.x - node.x} cy={point.y - node.y} r={4.5} className="port-dot" />
                </g>
            ))}
        </>
    );
}

/** A symbol turned across the page has its leads left and right, so its label goes above it. */
const across = (node: DiagramNode) => node.kind !== "busbar" && node.rotation % 180 === 90;

/** Where a label starts, from the element's centre: beside a symbol (above one turned across), above a busbar, beside an upright busbar's top. */
export function labelStart(node: DiagramNode): Point {
    if (node.labelAt) return node.labelAt;
    if (across(node)) return { x: -HALF, y: -HALF - 8 };
    if (node.kind !== "busbar") return { x: HALF + 6, y: -2 };
    return isUpright(node) ? { x: 10, y: -busbarHalf(node) + 10 } : { x: -busbarHalf(node), y: -10 };
}

function NodeLabel({ node, kindName }: { node: DiagramNode; kindName: (kind: NodeKind) => string }) {
    const title = node.label || kindName(node.kind);
    const details = [node.designation, node.voltageKv !== null ? `${node.voltageKv} kV` : "", node.ratingKva !== null ? `${node.ratingKva} kVA` : ""].filter(Boolean).join(" · ");
    const { x, y } = labelStart(node);
    return (
        <text data-label="" x={x} y={y} fontSize={11} fill="currentColor" stroke="none">
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
function hitBox(node: DiagramNode) {
    if (across(node)) return { x: -HALF, y: -HALF - 22, width: LABEL_WIDTH, height: NODE_SIZE + 22 };
    if (node.kind !== "busbar") return { x: -HALF, y: -HALF, width: NODE_SIZE + LABEL_WIDTH, height: NODE_SIZE };
    const half = busbarHalf(node);
    return isUpright(node) ? { x: -12, y: -half, width: 24, height: half * 2 } : { x: -half, y: -12, width: half * 2, height: 24 };
}

/** The extent of the drawn diagram (minX, minY, maxX, maxY), labels included roughly; null when empty. */
export function contentBounds(diagram: Diagram): [number, number, number, number] | null {
    if (diagram.nodes.length === 0) return null;
    const boxes = diagram.nodes.map((node) => {
        const label = labelStart(node);
        const [w, h] = node.kind !== "busbar" ? [HALF, HALF] : isUpright(node) ? [3, busbarHalf(node)] : [busbarHalf(node), 3];
        return [Math.min(node.x - w, node.x + label.x), Math.min(node.y - h, node.y + label.y - 16), Math.max(node.x + w, node.x + label.x + 140), Math.max(node.y + h, node.y + label.y + 16)];
    });
    return [Math.min(...boxes.map((b) => b[0]!)), Math.min(...boxes.map((b) => b[1]!)), Math.max(...boxes.map((b) => b[2]!)), Math.max(...boxes.map((b) => b[3]!))];
}
