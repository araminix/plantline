import type { NodeKind } from "../plants";
import { busbarHalf, connectionPoints, isUpright, linkShape, pathOf } from "./geometry";
import { NODE_SIZE, noteBox, type Diagram, type DiagramNode, type DiagramNote, type Point } from "./model";
import { summary, type Properties } from "./properties";
import { NodeSymbol } from "./symbols";

const HALF = NODE_SIZE / 2;

/** How the drawing words things in the reader's language: the kinds of elements, and numbers in its digits. */
export interface Wording {
    kind: (kind: NodeKind) => string;
    number: (value: number) => string;
}

interface Props {
    diagram: Diagram;
    wording: Wording;
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
export function DiagramContent({ diagram, wording, selectedNodes, selectedLink, targetNode, movingLink, interactive = false }: Props) {
    const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
    const ends = (() => {
        const link = interactive ? diagram.links.find((candidate) => candidate.id === selectedLink) : undefined;
        const [from, to] = [byId.get(link?.from ?? ""), byId.get(link?.to ?? "")];
        return link && from && to ? { link, points: linkShape(link, from, to).points } : null;
    })();
    // A busbar selected alone can be resized by its ends, an area alone by its corner
    const [only] = selectedNodes?.size === 1 ? [...selectedNodes] : [];
    const resizable = interactive ? byId.get(only ?? "") : undefined;
    const area = interactive ? diagram.notes.find((note) => note.id === only && note.kind === "area") : undefined;
    const note = (kind: DiagramNote["kind"]) =>
        diagram.notes.filter((candidate) => candidate.kind === kind).map((candidate) => <Note key={candidate.id} note={candidate} selected={selectedNodes?.has(candidate.id) ?? false} interactive={interactive} />);
    return (
        <>
            {/* Areas behind everything, texts over everything */}
            {note("area")}
            <g className="sld-links" fill="none" stroke="currentColor" strokeWidth={2}>
                {diagram.links.map((link) => {
                    const from = byId.get(link.from);
                    const to = byId.get(link.to);
                    if (!from || !to) return null;
                    const { points } = linkShape(link, from, to);
                    return (
                        <g key={link.id} data-link={link.id} className={classes(link.id === selectedLink && "selected", link.id === movingLink && "moving", link.straight && "straight")} {...statusLook(link.props, "8 5")}>
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
                <g
                    key={node.id}
                    data-node={node.id}
                    transform={`translate(${node.x} ${node.y})`}
                    className={classes("sld-node", selectedNodes?.has(node.id) && "selected", node.id === targetNode && "target")}
                    // On the canvas, Tab reaches every element; its name is its kind and the label as drawn
                    {...(interactive && { tabIndex: 0, role: "button", "aria-label": spokenName(node, wording), "aria-pressed": selectedNodes?.has(node.id) ?? false })}
                >
                    <g {...statusLook(node.props, "4 3")}>
                        {node.kind === "busbar" ? (
                            <rect
                                {...(isUpright(node) ? { x: -3, y: -busbarHalf(node), width: 6, height: busbarHalf(node) * 2 } : { x: -busbarHalf(node), y: -3, width: busbarHalf(node) * 2, height: 6 })}
                                // A planned bar is drawn as a dashed outline
                                {...(node.props.status === "planned" ? { fill: "none", stroke: "currentColor", strokeWidth: 1.5 } : { fill: "currentColor" })}
                            />
                        ) : (
                            <g transform={node.rotation || node.flip ? `rotate(${node.rotation}) scale(${node.flip ? -1 : 1} 1)` : undefined}>
                                <NodeSymbol kind={node.kind} />
                            </g>
                        )}
                    </g>
                    {interactive && <rect className="hit" {...hitBox(node)} fill="transparent" />}
                    <NodeLabel node={node} wording={wording} />
                    {interactive && <Ports node={node} />}
                </g>
            ))}
            {note("text")}
            {/* Over the elements: the selected line's ends, and a lone selected busbar's ends or area's corner, to drag */}
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
            {area && <rect className="resize corner" data-resize="end" x={area.x + area.width - 5} y={area.y + area.height - 5} width={10} height={10} />}
        </>
    );
}

const classes = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ") || undefined;

/** As on paper: planned equipment dashed, equipment out of service faded. Attributes, so exports keep the look. */
const statusLook = (props: Properties, dashes: string) =>
    props.status === "planned" ? { strokeDasharray: dashes } : props.status === "outOfService" ? { opacity: 0.45 } : {};

/** A text, line by line, or an area: a dashed box with its title; an area is picked by its border or title only. */
function Note({ note, selected, interactive }: { note: DiagramNote; selected: boolean; interactive: boolean }) {
    const box = noteBox(note);
    return (
        <g data-note={note.id} className={classes("sld-note", selected && "selected")} {...(interactive && { tabIndex: 0, role: "button", "aria-label": note.text.split("\n")[0], "aria-pressed": selected })}>
            {note.kind === "area" ? (
                <>
                    <rect className="note-area" x={note.x} y={note.y} width={note.width} height={note.height} rx={6} fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="6 4" />
                    {interactive && <rect className="hit" x={note.x} y={note.y} width={note.width} height={note.height} rx={6} fill="none" stroke="transparent" strokeWidth={12} />}
                    <text x={note.x + 8} y={note.y + 18} fontSize={12} fontWeight={600} fill="currentColor" stroke="none">
                        {note.text}
                    </text>
                </>
            ) : (
                <>
                    {interactive && <rect className="hit" x={box.minX} y={box.minY} width={box.maxX - box.minX} height={box.maxY - box.minY} fill="transparent" />}
                    <text x={note.x} y={note.y + 13} fontSize={12} fill="currentColor" stroke="none">
                        {note.text.split("\n").map((line, i) => (
                            <tspan key={i} x={note.x} dy={i === 0 ? 0 : 16}>
                                {line || " "}
                            </tspan>
                        ))}
                    </text>
                </>
            )}
        </g>
    );
}

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

/** The label drawn beside an element: its name (or kind) in bold, then its designation and main ratings. */
function labelText(node: DiagramNode, wording: Wording) {
    return { title: node.label || wording.kind(node.kind), details: [node.designation, ...summary(node.kind, node.props, wording.number)].filter(Boolean).join(" · ") };
}

/** What a screen reader says for an element: its kind, then the label exactly as drawn (so voice control finds it). */
function spokenName(node: DiagramNode, wording: Wording) {
    const { title, details } = labelText(node, wording);
    return [node.label && wording.kind(node.kind), title, details].filter(Boolean).join(" ");
}

function NodeLabel({ node, wording }: { node: DiagramNode; wording: Wording }) {
    const { title, details } = labelText(node, wording);
    const start = labelStart(node);
    // Above a bar lying across, a second line would run into the bar: both lines go up one
    const lift = details && node.kind === "busbar" && !isUpright(node) && !node.labelAt ? 14 : 0;
    const [x, y] = [start.x, start.y - lift];
    return (
        <text data-label="" x={x} y={y} fontSize={11} fill="currentColor" stroke="none">
            <tspan fontWeight={600}>{title}</tspan>
            {/* A space between the lines, so the text reads (and copies) as words */}
            {details && " "}
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
    if (diagram.nodes.length === 0 && diagram.notes.length === 0) return null;
    const boxes = diagram.nodes.map((node) => {
        const label = labelStart(node);
        const [w, h] = node.kind !== "busbar" ? [HALF, HALF] : isUpright(node) ? [3, busbarHalf(node)] : [busbarHalf(node), 3];
        return [Math.min(node.x - w, node.x + label.x), Math.min(node.y - h, node.y + label.y - 16), Math.max(node.x + w, node.x + label.x + 140), Math.max(node.y + h, node.y + label.y + 16)];
    });
    for (const note of diagram.notes) {
        const box = noteBox(note);
        boxes.push([box.minX, box.minY, box.maxX, box.maxY]);
    }
    return [Math.min(...boxes.map((b) => b[0]!)), Math.min(...boxes.map((b) => b[1]!)), Math.max(...boxes.map((b) => b[2]!)), Math.max(...boxes.map((b) => b[3]!))];
}
