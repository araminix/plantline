import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { NodeKind } from "../plants";
import { isTyping } from "../ui/keys";
import { contentBounds, DiagramContent, labelStart } from "./DiagramContent";
import { extent, itemsInBox, resizeBusbar } from "./edit";
import { connectionPoints, dragSegment, linkShape, removeSegment, tidyRoute } from "./geometry";
import { connect, GRID, moveNodes, noteBox, reconnect, snap, updateLink, updateNode, updateNote, type Box, type Diagram, type Point } from "./model";

export interface Selection {
    /** The selected elements and notes. */
    nodes: string[];
    link: string | null;
}

export interface CanvasHandle {
    fit(): void;
    zoom(factor: number): void;
    /** To a zoom level, around the middle of the view (1 is 100 %). */
    zoomTo(k: number): void;
    /** To the elements and notes with these ids. */
    zoomToItems(ids: readonly string[]): void;
    /** The middle of the visible area, in diagram coordinates: where a new element goes. */
    centre(): Point;
    /** The point of the diagram under a point of the screen, or null where the drawing is not what shows there. */
    pointAt(clientX: number, clientY: number): Point | null;
}

interface Props {
    diagram: Diagram;
    selection: Selection;
    /** Connect mode: the first element picked, or null while waiting for it; undefined when not connecting. */
    connectFrom: string | null | undefined;
    kindName: (kind: NodeKind) => string;
    label: string;
    onSelect: (selection: Selection) => void;
    onPreview: (diagram: Diagram) => void;
    onCommit: (diagram: Diagram, base: Diagram) => void;
    onPick: (nodeId: string) => void;
    /** The zoom level changed (1 is 100 %). */
    onZoom: (k: number) => void;
    /** The overview's accessible name. */
    overviewLabel: string;
}

interface View {
    x: number;
    y: number;
    k: number;
}

type Gesture =
    | { type: "pan"; start: Point; view: View; moved: boolean }
    /** An area selected by dragging over the empty drawing (on a touch screen, after holding still) */
    | { type: "box"; additive: boolean; before: string[] }
    | { type: "label"; start: Point; base: Diagram; id: string; origin: Point; moved: boolean }
    /** A busbar's end, or an area's corner */
    | { type: "resize"; base: Diagram; id: string; end: "start" | "end"; moved: boolean }
    | { type: "drag"; start: { x: number; y: number }; base: Diagram; ids: Set<string>; moved: boolean }
    /** A line drawn from a connection point (or, `end` set, an existing line's end being moved) */
    | { type: "line"; from: string; end: { link: string; end: "from" | "to" } | null }
    | { type: "segment"; start: Point; base: Diagram; link: string; segment: number; moved: boolean }
    | { type: "pinch"; distance: number; view: View; middle: { x: number; y: number } };

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const DRAG_THRESHOLD = 3;
// A finger held still this long on the empty drawing starts an area selection instead of panning
const LONG_PRESS_MS = 400;
const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

/**
 * The editable drawing. Zoom with the wheel or two fingers; pan with the middle button, Space and drag, or a finger;
 * select by clicking or by dragging an area (a finger holds still first); drag elements, labels, busbar ends, line
 * segments and line ends; draw lines from connection points; pick elements to connect.
 */
export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(props, ref) {
    const { diagram, selection, connectFrom, kindName, label, onSelect, onPreview, onCommit, onPick, onZoom, overviewLabel } = props;
    const svgRef = useRef<SVGSVGElement>(null);
    const [view, setView] = useState<View>({ x: 40, y: 40, k: 1 });
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const gesture = useRef<Gesture | null>(null);
    // The line being drawn, in diagram coordinates, and the element it would connect to
    const [line, setLine] = useState<{ start: Point; end: Point; target: string | null; moving: string | null } | null>(null);
    // The area being selected, in diagram coordinates
    const [box, setBox] = useState<{ start: Point; end: Point } | null>(null);
    // Space held: dragging pans, whatever is under the pointer
    const [spaceHeld, setSpaceHeld] = useState(false);
    const space = useRef(false);
    // A diagram opened with content is fitted once; an empty one is not, so adding the first element does not zoom
    const fitted = useRef(diagram.nodes.length === 0);

    const size = () => svgRef.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 800, height: 600 };

    const zoomAt = (factor: number, screenX: number, screenY: number) =>
        setView((v) => {
            const k = clampZoom(v.k * factor);
            return { k, x: screenX - ((screenX - v.x) * k) / v.k, y: screenY - ((screenY - v.y) * k) / v.k };
        });

    /** Shows an area of the diagram whole, zoomed in at most to `most`. */
    const show = ([minX, minY, maxX, maxY]: [number, number, number, number], most: number) => {
        const { width, height } = size();
        if (width === 0) return;
        const k = clampZoom(Math.min(most, (width - 48) / Math.max(1, maxX - minX), (height - 48) / Math.max(1, maxY - minY)));
        setView({ k, x: (width - (maxX - minX) * k) / 2 - minX * k, y: (height - (maxY - minY) * k) / 2 - minY * k });
    };
    const fit = () => {
        const bounds = contentBounds(diagram);
        if (bounds) show(bounds, 1.5);
    };

    useEffect(() => onZoom(view.k), [view.k, onZoom]);

    useImperativeHandle(ref, () => ({
        fit,
        zoom: (factor) => {
            const { width, height } = size();
            zoomAt(factor, width / 2, height / 2);
        },
        zoomTo: (k) => {
            const { width, height } = size();
            zoomAt(k / view.k, width / 2, height / 2);
        },
        zoomToItems: (ids) => {
            const wanted = new Set(ids);
            const boxes: Box[] = [...diagram.nodes.filter((node) => wanted.has(node.id)).map(extent), ...diagram.notes.filter((note) => wanted.has(note.id)).map(noteBox)];
            if (boxes.length === 0) return;
            const PAD = 60;
            show([Math.min(...boxes.map((b) => b.minX)) - PAD, Math.min(...boxes.map((b) => b.minY)) - PAD, Math.max(...boxes.map((b) => b.maxX)) + PAD, Math.max(...boxes.map((b) => b.maxY)) + PAD], 2);
        },
        centre: () => {
            const { width, height } = size();
            return { x: (width / 2 - view.x) / view.k, y: (height / 2 - view.y) / view.k };
        },
        pointAt: (clientX, clientY) => {
            const svg = svgRef.current;
            if (!svg?.contains(document.elementFromPoint(clientX, clientY))) return null;
            const { x, y } = local({ clientX, clientY });
            return { x: (x - view.x) / view.k, y: (y - view.y) / view.k };
        },
    }));

    // Fit a diagram opened with content once the canvas has a size
    useEffect(() => {
        if (!fitted.current && diagram.nodes.length > 0 && size().width > 0) {
            fitted.current = true;
            fit();
        }
    });

    // The wheel zooms; the listener is not passive, so the page does not scroll
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const { left, top } = svg.getBoundingClientRect();
            zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - left, event.clientY - top);
        };
        svg.addEventListener("wheel", onWheel, { passive: false });
        return () => svg.removeEventListener("wheel", onWheel);
    }, []);

    useEffect(() => {
        const shown = () => (svgRef.current?.getClientRects().length ?? 0) > 0;
        const down = (event: KeyboardEvent) => {
            if (event.key !== " " || !shown() || isTyping(event.target) || event.target instanceof HTMLButtonElement) return;
            event.preventDefault();
            space.current = true;
            setSpaceHeld(true);
        };
        const up = (event: KeyboardEvent) => {
            if (event.key !== " ") return;
            space.current = false;
            setSpaceHeld(false);
        };
        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        return () => {
            window.removeEventListener("keydown", down);
            window.removeEventListener("keyup", up);
        };
    }, []);

    const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
    const toDiagram = (point: Point): Point => ({ x: (point.x - view.x) / view.k, y: (point.y - view.y) / view.k });
    /** The diagram with the line drawn to `target`, or null when it cannot go there. */
    const lineResult = (current: Extract<Gesture, { type: "line" }>, target: string) =>
        current.end ? reconnect(diagram, current.end.link, current.end.end, target) : connect(diagram, current.from, target);

    /** The diagram with a line's segment dragged to a point of the screen; at the end of the drag, tidied. Null for a straight line. */
    const draggedRoute = (current: Extract<Gesture, { type: "segment" }>, point: Point, end: boolean) => {
        const link = current.base.links.find((candidate) => candidate.id === current.link);
        const nodes = new Map(current.base.nodes.map((node) => [node.id, node]));
        const [from, to] = [nodes.get(link?.from ?? ""), nodes.get(link?.to ?? "")];
        if (!link || link.straight || !from || !to) return null;
        const route = dragSegment(from, to, linkShape(link, from, to), current.segment, toDiagram(point));
        return updateLink(current.base, link.id, { route: end ? tidyRoute(from, to, route) : route });
    };

    /** A double click on a segment of a dragged route removes that bend; with none left, the line routes itself. */
    const onDoubleClick = (event: ReactMouseEvent<SVGSVGElement>) => {
        // The canvas captures the pointer, so the event's own target is the canvas
        const target = document.elementFromPoint(event.clientX, event.clientY);
        if (!target) return;
        const link = diagram.links.find((candidate) => candidate.id === target.closest("[data-link]")?.getAttribute("data-link"));
        const segment = Number(target.closest("[data-segment]")?.getAttribute("data-segment") ?? NaN);
        const [from, to] = [byId.get(link?.from ?? ""), byId.get(link?.to ?? "")];
        if (!link?.route || link.straight || !from || !to || Number.isNaN(segment)) return;
        onCommit(updateLink(diagram, link.id, { route: removeSegment(from, to, link.route, segment) }), diagram);
    };

    const local = (event: { clientX: number; clientY: number }) => {
        const { left, top } = size();
        return { x: event.clientX - left, y: event.clientY - top };
    };

    const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
        // A field being edited saves to its own element before the selection moves on
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        const point = local(event);
        pointers.current.set(event.pointerId, point);
        event.currentTarget.setPointerCapture?.(event.pointerId);

        if (pointers.current.size === 2) {
            // A second finger: pinch, and undo any drag preview of the first
            if (gesture.current?.type === "drag" || gesture.current?.type === "label" || gesture.current?.type === "resize") onPreview(gesture.current.base);
            setBox(null);
            const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
            gesture.current = { type: "pinch", distance: Math.hypot(a.x - b.x, a.y - b.y), view, middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
            return;
        }

        if (event.button === 1 || space.current) {
            event.preventDefault();
            gesture.current = { type: "pan", start: point, view, moved: true };
            return;
        }

        const target = event.target as Element;
        const nodeId = target.closest("[data-node]")?.getAttribute("data-node");
        const itemId = nodeId ?? target.closest("[data-note]")?.getAttribute("data-note");
        const linkId = target.closest("[data-link]")?.getAttribute("data-link") ?? target.closest("[data-link-ends]")?.getAttribute("data-link-ends");
        const port = target.closest("[data-port]")?.getAttribute("data-port");
        const end = target.closest("[data-end]")?.getAttribute("data-end");
        const resize = target.closest("[data-resize]")?.getAttribute("data-resize");
        const onLabel = target.closest("[data-label]") !== null;
        const additive = event.shiftKey || event.ctrlKey || event.metaKey;
        const at = toDiagram(point);
        const [only] = selection.nodes.length === 1 ? selection.nodes : [];

        if (only && (resize === "start" || resize === "end")) {
            gesture.current = { type: "resize", base: diagram, id: only, end: resize, moved: false };
        } else if (linkId && (end === "from" || end === "to")) {
            // The other end stays; this one follows the pointer to another element
            const link = diagram.links.find((candidate) => candidate.id === linkId)!;
            const { points } = linkShape(link, byId.get(link.from)!, byId.get(link.to)!);
            const fixed = end === "from" ? link.to : link.from;
            gesture.current = { type: "line", from: fixed, end: { link: linkId, end } };
            setLine({ start: end === "from" ? points.at(-1)! : points[0]!, end: at, target: null, moving: linkId });
        } else if (nodeId && port && connectFrom === undefined) {
            const start = connectionPoints(byId.get(nodeId)!).find((candidate) => candidate.key === port)?.point ?? at;
            gesture.current = { type: "line", from: nodeId, end: null };
            setLine({ start, end: at, target: null, moving: null });
        } else if (nodeId && connectFrom !== undefined) {
            onPick(nodeId);
        } else if (nodeId && onLabel && nodeId === only && !additive) {
            // The label of the element selected alone moves by itself
            gesture.current = { type: "label", start: point, base: diagram, id: nodeId, origin: labelStart(byId.get(nodeId)!), moved: false };
        } else if (itemId) {
            const selected = selection.nodes.includes(itemId);
            const nodes = additive ? (selected ? selection.nodes.filter((id) => id !== itemId) : [...selection.nodes, itemId]) : selected ? selection.nodes : [itemId];
            onSelect({ nodes, link: null });
            if (nodes.includes(itemId)) gesture.current = { type: "drag", start: point, base: diagram, ids: new Set(nodes), moved: false };
        } else if (linkId) {
            onSelect({ nodes: [], link: linkId });
            const segment = Number(target.closest("[data-segment]")?.getAttribute("data-segment") ?? NaN);
            if (!Number.isNaN(segment)) gesture.current = { type: "segment", start: point, base: diagram, link: linkId, segment, moved: false };
        } else {
            if (!additive) onSelect({ nodes: [], link: null });
            if (event.pointerType === "touch") {
                // A finger pans, unless it holds still first
                const pan: Gesture = { type: "pan", start: point, view, moved: false };
                gesture.current = pan;
                setTimeout(() => {
                    if (gesture.current !== pan || pan.moved) return;
                    gesture.current = { type: "box", additive: false, before: [] };
                    setBox({ start: at, end: at });
                }, LONG_PRESS_MS);
            } else {
                gesture.current = { type: "box", additive, before: additive ? selection.nodes : [] };
                setBox({ start: at, end: at });
            }
        }
    };

    const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
        if (!pointers.current.has(event.pointerId)) return;
        const point = local(event);
        pointers.current.set(event.pointerId, point);
        const current = gesture.current;
        if (current?.type === "pinch") {
            const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
            const k = clampZoom((current.view.k * Math.hypot(a.x - b.x, a.y - b.y)) / current.distance);
            const { middle, view: start } = current;
            setView({ k, x: middle.x - ((middle.x - start.x) * k) / start.k, y: middle.y - ((middle.y - start.y) * k) / start.k });
        } else if (current?.type === "pan") {
            if (!current.moved && Math.hypot(point.x - current.start.x, point.y - current.start.y) < DRAG_THRESHOLD) return;
            current.moved = true;
            setView({ ...current.view, x: current.view.x + point.x - current.start.x, y: current.view.y + point.y - current.start.y });
        } else if (current?.type === "box") {
            setBox((area) => area && { ...area, end: toDiagram(point) });
        } else if (current?.type === "label") {
            if (!current.moved && Math.hypot(point.x - current.start.x, point.y - current.start.y) < DRAG_THRESHOLD) return;
            current.moved = true;
            onPreview(movedLabel(current, point));
        } else if (current?.type === "resize") {
            current.moved = true;
            onPreview(resized(current, point));
        } else if (current?.type === "line") {
            const id = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-node]")?.getAttribute("data-node") ?? null;
            const target = id && lineResult(current, id) ? id : null;
            setLine((drawn) => drawn && { ...drawn, end: toDiagram(point), target });
        } else if (current?.type === "drag") {
            const [dx, dy] = [point.x - current.start.x, point.y - current.start.y];
            if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            current.moved = true;
            onPreview(moveNodes(current.base, current.ids, dx / view.k, dy / view.k, false));
        } else if (current?.type === "segment") {
            if (!current.moved && Math.hypot(point.x - current.start.x, point.y - current.start.y) < DRAG_THRESHOLD) return;
            const dragged = draggedRoute(current, point, false);
            if (!dragged) return;
            current.moved = true;
            onPreview(dragged);
        }
    };

    const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
        const point = local(event);
        const current = gesture.current;
        pointers.current.delete(event.pointerId);
        if (current?.type === "drag" && current.moved) {
            onCommit(moveNodes(current.base, current.ids, (point.x - current.start.x) / view.k, (point.y - current.start.y) / view.k, true), current.base);
        } else if (current?.type === "box" && box) {
            const [start, end] = [box.start, toDiagram(point)];
            const area = { minX: Math.min(start.x, end.x), minY: Math.min(start.y, end.y), maxX: Math.max(start.x, end.x), maxY: Math.max(start.y, end.y) };
            // A click, not an area: the selection was already cleared
            if ((area.maxX - area.minX) * view.k > DRAG_THRESHOLD || (area.maxY - area.minY) * view.k > DRAG_THRESHOLD) {
                const inside = itemsInBox(diagram, area, end.x < start.x);
                onSelect({ nodes: [...new Set([...current.before, ...inside])], link: null });
            }
        } else if (current?.type === "label" && current.moved) {
            onCommit(movedLabel(current, point), current.base);
        } else if (current?.type === "resize" && current.moved) {
            onCommit(resized(current, point), current.base);
        } else if (current?.type === "segment" && current.moved) {
            const dragged = draggedRoute(current, point, true);
            if (dragged) onCommit(dragged, current.base);
        } else if (current?.type === "line") {
            const result = line?.target && event.type === "pointerup" ? lineResult(current, line.target) : null;
            if (result) onCommit(result, diagram);
            setLine(null);
        }
        gesture.current = null;
        setBox(null);
    };

    /** A busbar resized from one end, or an area from its corner (at least two grid units each way). */
    const resized = (current: Extract<Gesture, { type: "resize" }>, point: Point) => {
        const at = toDiagram(point);
        const area = current.base.notes.find((note) => note.id === current.id);
        if (!area) return resizeBusbar(current.base, current.id, current.end, at);
        return updateNote(current.base, area.id, { width: Math.max(2 * GRID, snap(at.x - area.x)), height: Math.max(2 * GRID, snap(at.y - area.y)) });
    };

    const movedLabel = (current: Extract<Gesture, { type: "label" }>, point: Point) =>
        updateNode(current.base, current.id, {
            labelAt: { x: Math.round(current.origin.x + (point.x - current.start.x) / view.k), y: Math.round(current.origin.y + (point.y - current.start.y) / view.k) },
        });

    const selectedNodes = new Set(connectFrom ? [connectFrom] : selection.nodes);
    return (
        <>
        <svg
            ref={svgRef}
            className={["canvas", (connectFrom !== undefined || line) && "connecting", spaceHeld && "panning"].filter(Boolean).join(" ")}
            aria-label={label}
            // A drawing reads left to right in every language
            style={{ direction: "ltr", backgroundSize: `${GRID * view.k}px ${GRID * view.k}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={onDoubleClick}
        >
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
                <DiagramContent diagram={diagram} kindName={kindName} selectedNodes={selectedNodes} selectedLink={selection.link} targetNode={line?.target ?? null} movingLink={line?.moving ?? null} interactive />
                {line && <line className={line.target ? "drawn-line ready" : "drawn-line"} x1={line.start.x} y1={line.start.y} x2={line.end.x} y2={line.end.y} />}
                {box && (
                    // Left to right selects what is wholly inside (solid), right to left what it touches (dashed)
                    <rect
                        className={box.end.x < box.start.x ? "select-box crossing" : "select-box"}
                        x={Math.min(box.start.x, box.end.x)}
                        y={Math.min(box.start.y, box.end.y)}
                        width={Math.abs(box.end.x - box.start.x)}
                        height={Math.abs(box.end.y - box.start.y)}
                    />
                )}
            </g>
        </svg>
        {(diagram.nodes.length > 0 || diagram.notes.length > 0) && (
            <Overview diagram={diagram} view={view} size={size()} label={overviewLabel} onCentre={(at) => setView((v) => ({ ...v, x: size().width / 2 - at.x * v.k, y: size().height / 2 - at.y * v.k }))} />
        )}
        </>
    );
});

const OVERVIEW = { width: 180, height: 120 };

/**
 * The whole diagram small, with the part in view outlined: elements as their outlines, lines straight between them.
 * Pressing or dragging on it moves the view there.
 */
function Overview({ diagram, view, size, label, onCentre }: { diagram: Diagram; view: View; size: { width: number; height: number }; label: string; onCentre: (at: Point) => void }) {
    const shown = { minX: -view.x / view.k, minY: -view.y / view.k, maxX: (size.width - view.x) / view.k, maxY: (size.height - view.y) / view.k };
    const [cMinX, cMinY, cMaxX, cMaxY] = contentBounds(diagram)!;
    const [minX, minY] = [Math.min(cMinX, shown.minX), Math.min(cMinY, shown.minY)];
    const scale = Math.min(OVERVIEW.width / (Math.max(cMaxX, shown.maxX) - minX), OVERVIEW.height / (Math.max(cMaxY, shown.maxY) - minY));
    const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
    const centre = (event: ReactPointerEvent<SVGSVGElement>) => {
        if (event.buttons !== 1) return;
        const box = event.currentTarget.getBoundingClientRect();
        onCentre({ x: minX + (event.clientX - box.left) / scale, y: minY + (event.clientY - box.top) / scale });
    };
    return (
        <svg
            className="overview"
            role="img"
            aria-label={label}
            width={OVERVIEW.width}
            height={OVERVIEW.height}
            viewBox={`${minX} ${minY} ${OVERVIEW.width / scale} ${OVERVIEW.height / scale}`}
            onPointerDown={(event) => {
                event.currentTarget.setPointerCapture?.(event.pointerId);
                centre(event);
            }}
            onPointerMove={centre}
        >
            {diagram.notes.map((note) => {
                const box = noteBox(note);
                return <rect key={note.id} className="overview-note" x={box.minX} y={box.minY} width={box.maxX - box.minX} height={box.maxY - box.minY} />;
            })}
            {diagram.links.map((link) => {
                const [from, to] = [byId.get(link.from), byId.get(link.to)];
                return from && to ? <line key={link.id} className="overview-link" x1={from.x} y1={from.y} x2={to.x} y2={to.y} /> : null;
            })}
            {diagram.nodes.map((node) => {
                const box = extent(node);
                return <rect key={node.id} className="overview-node" x={box.minX} y={box.minY} width={box.maxX - box.minX} height={box.maxY - box.minY} />;
            })}
            <rect className="overview-view" x={shown.minX} y={shown.minY} width={shown.maxX - shown.minX} height={shown.maxY - shown.minY} />
        </svg>
    );
}
