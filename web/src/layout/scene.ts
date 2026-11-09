import { apply, compose, corners, createBoxes, extend, forEachShape, shapesBox, transformedBox, walk, type Affine, type Block, type Box, type Drawing } from "./drawing";
import type { Projector } from "./place";
import type { Recognition } from "./recognize";

/**
 * What the map draws, projected once per placement, so panning and zooming never project again.
 *
 * Coordinates are in a frame: Web Mercator pixels at zoom 0 (Leaflet's), less `origin`, times FRAME_SCALE. Canvas paths
 * keep 32-bit numbers, which would lose metres at map coordinates; small numbers around the drawing keep millimetres.
 *
 * A block placement smaller than LOCAL_METRES is drawn through one transform (the projection is straight enough at that
 * size: under 2 cm off); anything larger, such as model space of a large plant, has its own shapes projected point by
 * point and lets each block inside decide again.
 */
export interface Scene {
    /** Zoom-0 Web Mercator pixel of the frame's origin. */
    origin: [number, number];
    /** The extent of everything drawn, in frame units; null when nothing is. */
    bounds: Box | null;
    /** Drawing order: grey first, so recognised objects lie on top. */
    colors: string[];
    /** Shapes projected point by point, in frame units, by colour. */
    projected: Map<string, Paint>;
    /** Blocks drawn through a transform: their shapes once, in block units less `centre`, and where they are placed. */
    placed: PlacedBlock[];
    /** Recognised block references as quadrilaterals (8 numbers each) in frame units, by colour. */
    boxes: Map<string, number[]>;
    /** False when the drawing places more copies than can be drawn (see MAX_PLACED). */
    complete: boolean;
}

/** Polylines: x and y in turn; polyline i ends before point `ends[i]`. Filled ones are closed and filled as well as stroked. */
export interface Polylines {
    coords: number[];
    ends: number[];
    closed: boolean[];
}

export interface Paint {
    lines: Polylines;
    fills: Polylines;
}

export interface PlacedBlock {
    paint: Map<string, Paint>;
    /** Each placement: its transform (block units less `centre` to frame units) and its extent in frame units. */
    placements: { transform: Affine; box: Box }[];
}

export const FRAME_SCALE = 2 ** 20;
export const LOCAL_METRES = 1000;
export const GREY = "#94a3b8";

/** Leaflet's Web Mercator (EPSG:3857) pixel at zoom 0 of a latitude and longitude. */
export function mercator(lat: number, lon: number): [number, number] {
    const sin = Math.sin((Math.max(-85.0511287798, Math.min(85.0511287798, lat)) * Math.PI) / 180);
    return [256 * (0.5 + lon / 360), 256 * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI))];
}

/** The latitude and longitude of a zoom-0 Web Mercator pixel. */
export const unmercator = (x: number, y: number): [number, number] => [(Math.atan(Math.sinh(Math.PI * (1 - y / 128))) * 180) / Math.PI, (x / 256 - 0.5) * 360];

interface Options {
    project: Projector;
    metresPerUnit: number;
    colorOf: (kind: string) => string;
    /** Whether a closed model-space shape of this kind is filled (counted objects are; measured ones are lines). */
    isFilled: (kind: string) => boolean;
    /** Layers not drawn (by index): their shapes, and the blocks placed on them. */
    hidden?: ReadonlySet<number>;
}

export function buildScene(drawing: Drawing, recognition: Recognition, { project, metresPerUnit, colorOf, isFilled, hidden = new Set() }: Options): Scene {
    const boxOf = createBoxes(drawing);
    const whole = boxOf(drawing.model, 0);
    const origin = whole ? mercator(...project((whole[0] + whole[2]) / 2, (whole[1] + whole[3]) / 2)) : ([0, 0] as [number, number]);
    // Drawing units to frame units, point by point
    const frame = (x: number, y: number): [number, number] => {
        const [px, py] = mercator(...project(x, y));
        return [(px - origin[0]) * FRAME_SCALE, (py - origin[1]) * FRAME_SCALE];
    };
    // The projection near a point as a transform, from three points one metre apart
    const local = (x: number, y: number): Affine => {
        const step = 1 / metresPerUnit;
        const [p, px, py] = [frame(x, y), frame(x + step, y), frame(x, y + step)];
        const [a, b, c, d] = [(px[0] - p[0]) / step, (px[1] - p[1]) / step, (py[0] - p[0]) / step, (py[1] - p[1]) / step];
        return [a, b, c, d, p[0] - a * x - c * y, p[1] - b * x - d * y];
    };

    const colors = new Set([GREY]);
    const colorFor = (kind: string | null) => {
        const color = kind ? colorOf(kind) : GREY;
        colors.add(color);
        return color;
    };
    const bounds: Box = [Infinity, Infinity, -Infinity, -Infinity];
    const projected = new Map<string, Paint>();
    const boxes = new Map<string, number[]>();
    const placedByBlock = new Map<Block, (PlacedBlock & { centre: Affine; own: Box }) | null>();

    // A block's own shapes by colour, in its units less the centre of its shapes (kept once per block); null without shapes
    const placedBlock = (block: Block) => {
        if (placedByBlock.has(block)) return placedByBlock.get(block)!;
        const own = shapesBox(drawing, block);
        let result = null;
        if (own) {
            const [cx, cy] = [(own[0] + own[2]) / 2, (own[1] + own[3]) / 2];
            const paint = new Map<string, Paint>();
            addShapes(drawing, block, recognition, colorFor, isFilled, hidden, paint, (x, y) => [x - cx, y - cy]);
            result = { paint, placements: [], centre: [1, 0, 0, 1, cx, cy] as Affine, own };
        }
        placedByBlock.set(block, result);
        return result;
    };

    const complete = walk<Affine | null>(drawing, null, (block, transform, depth, inherited) => {
        // A transform to the frame, inherited from a small enough placement around this one, or taken here
        let toFrame = inherited;
        if (!toFrame) {
            const box = boxOf(block, depth);
            const extent = box && transformedBox(transform, box);
            if (extent && Math.max(extent[2] - extent[0], extent[3] - extent[1]) * metresPerUnit <= LOCAL_METRES) {
                toFrame = local((extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2);
            }
        }

        if (toFrame) {
            const target = placedBlock(block);
            if (target) {
                const box = transformedBox(compose(toFrame, transform), target.own);
                target.placements.push({ transform: compose(compose(toFrame, transform), target.centre), box });
                extend(bounds, box[0], box[1]);
                extend(bounds, box[2], box[3]);
            }
        } else {
            addShapes(drawing, block, recognition, colorFor, isFilled, hidden, projected, (x, y) => {
                const point = frame(...apply(transform, x, y));
                extend(bounds, ...point);
                return point;
            });
        }

        // Recognised references: the box of what they draw, as a quadrilateral
        const kinds = recognition.kinds.get(block)!;
        block.references.forEach((reference, i) => {
            const kind = kinds.references[i];
            const box = kind && !hidden.has(reference.layer) && boxOf(drawing.blocks[reference.block]!, depth + 1);
            if (!kind || !box) return;
            const toDrawing = compose(transform, reference.transform);
            const color = colorFor(kind);
            const target = boxes.get(color) ?? boxes.set(color, []).get(color)!;
            for (const [x, y] of corners(box)) target.push(...(toFrame ? apply(compose(toFrame, toDrawing), x, y) : frame(...apply(toDrawing, x, y))));
        });
        return toFrame;
    }, (reference) => !hidden.has(reference.layer) && recognition.enters(reference));

    const placed: PlacedBlock[] = [...placedByBlock.values()].filter((block) => block !== null && block.placements.length > 0).map((block) => ({ paint: block!.paint, placements: block!.placements }));
    return { origin, bounds: bounds[0] <= bounds[2] ? bounds : null, colors: [...colors], projected, placed, boxes, complete };
}

function addShapes(
    drawing: Drawing,
    block: Block,
    recognition: Recognition,
    colorFor: (kind: string | null) => string,
    isFilled: (kind: string) => boolean,
    hidden: ReadonlySet<number>,
    paint: Map<string, Paint>,
    map: (x: number, y: number) => [number, number],
) {
    const kinds = recognition.kinds.get(block)!;
    forEachShape(block, (index, layer, closed, first, count) => {
        if (hidden.has(layer)) return;
        const kind = kinds.shapes[index] ?? null;
        const color = colorFor(kind);
        const target = paint.get(color) ?? paint.set(color, { lines: emptyPolylines(), fills: emptyPolylines() }).get(color)!;
        const filled = closed && kind !== null && block === drawing.model && isFilled(kind);
        const polylines = filled ? target.fills : target.lines;
        for (let p = first; p < first + count; p++) polylines.coords.push(...map(drawing.points[p * 2]!, drawing.points[p * 2 + 1]!));
        polylines.ends.push(polylines.coords.length / 2);
        polylines.closed.push(closed);
    });
}

const emptyPolylines = (): Polylines => ({ coords: [], ends: [], closed: [] });
