import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { NodeKind } from "../plants";
import { contentBounds, DiagramContent } from "./DiagramContent";
import { GRID, moveNodes, type Diagram, type Point } from "./model";

export interface Selection {
    nodes: string[];
    link: string | null;
}

export interface CanvasHandle {
    fit(): void;
    zoom(factor: number): void;
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
}

interface View {
    x: number;
    y: number;
    k: number;
}

type Gesture =
    | { type: "pan"; start: { x: number; y: number }; view: View }
    | { type: "drag"; start: { x: number; y: number }; base: Diagram; ids: Set<string>; moved: boolean }
    | { type: "pinch"; distance: number; view: View; middle: { x: number; y: number } };

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const DRAG_THRESHOLD = 3;
const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

/** The editable drawing: pan, zoom (wheel or pinch), select, drag on the grid, and pick elements to connect. */
export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(props, ref) {
    const { diagram, selection, connectFrom, kindName, label, onSelect, onPreview, onCommit, onPick } = props;
    const svgRef = useRef<SVGSVGElement>(null);
    const [view, setView] = useState<View>({ x: 40, y: 40, k: 1 });
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const gesture = useRef<Gesture | null>(null);
    // A diagram opened with content is fitted once; an empty one is not, so adding the first element does not zoom
    const fitted = useRef(diagram.nodes.length === 0);

    const size = () => svgRef.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 800, height: 600 };

    const zoomAt = (factor: number, screenX: number, screenY: number) =>
        setView((v) => {
            const k = clampZoom(v.k * factor);
            return { k, x: screenX - ((screenX - v.x) * k) / v.k, y: screenY - ((screenY - v.y) * k) / v.k };
        });

    const fit = () => {
        const bounds = contentBounds(diagram);
        const { width, height } = size();
        if (!bounds || width === 0) return;
        const [minX, minY, maxX, maxY] = bounds;
        const k = clampZoom(Math.min(1.5, (width - 48) / (maxX - minX), (height - 48) / (maxY - minY)));
        setView({ k, x: (width - (maxX - minX) * k) / 2 - minX * k, y: (height - (maxY - minY) * k) / 2 - minY * k });
    };

    useImperativeHandle(ref, () => ({
        fit,
        zoom: (factor) => {
            const { width, height } = size();
            zoomAt(factor, width / 2, height / 2);
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
            if (gesture.current?.type === "drag") onPreview(gesture.current.base);
            const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
            gesture.current = { type: "pinch", distance: Math.hypot(a.x - b.x, a.y - b.y), view, middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
            return;
        }

        const target = event.target as Element;
        const nodeId = target.closest("[data-node]")?.getAttribute("data-node");
        const linkId = target.closest("[data-link]")?.getAttribute("data-link");
        const additive = event.shiftKey || event.ctrlKey || event.metaKey;

        if (nodeId && connectFrom !== undefined) {
            onPick(nodeId);
        } else if (nodeId) {
            const selected = selection.nodes.includes(nodeId);
            const nodes = additive ? (selected ? selection.nodes.filter((id) => id !== nodeId) : [...selection.nodes, nodeId]) : selected ? selection.nodes : [nodeId];
            onSelect({ nodes, link: null });
            if (nodes.includes(nodeId)) gesture.current = { type: "drag", start: point, base: diagram, ids: new Set(nodes), moved: false };
        } else if (linkId) {
            onSelect({ nodes: [], link: linkId });
        } else {
            if (!additive) onSelect({ nodes: [], link: null });
            gesture.current = { type: "pan", start: point, view };
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
            setView({ ...current.view, x: current.view.x + point.x - current.start.x, y: current.view.y + point.y - current.start.y });
        } else if (current?.type === "drag") {
            const [dx, dy] = [point.x - current.start.x, point.y - current.start.y];
            if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            current.moved = true;
            onPreview(moveNodes(current.base, current.ids, dx / view.k, dy / view.k, false));
        }
    };

    const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
        const point = local(event);
        const current = gesture.current;
        pointers.current.delete(event.pointerId);
        if (current?.type === "drag" && current.moved) {
            onCommit(moveNodes(current.base, current.ids, (point.x - current.start.x) / view.k, (point.y - current.start.y) / view.k, true), current.base);
        }
        gesture.current = null;
    };

    const selectedNodes = new Set(connectFrom ? [connectFrom] : selection.nodes);
    return (
        <svg
            ref={svgRef}
            className={connectFrom !== undefined ? "canvas connecting" : "canvas"}
            aria-label={label}
            // A drawing reads left to right in every language
            style={{ direction: "ltr", backgroundSize: `${GRID * view.k}px ${GRID * view.k}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        >
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
                <DiagramContent diagram={diagram} kindName={kindName} selectedNodes={selectedNodes} selectedLink={selection.link} interactive />
            </g>
        </svg>
    );
});
