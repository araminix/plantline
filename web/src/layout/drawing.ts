/**
 * The drawing the CAD reader returns (cad/Plantline.Cad/Drawing.cs): every block once, in its own coordinates, placed
 * by references that carry a transform. Placing the references inside each other happens here, never by copying.
 */
export const LENGTH_UNITS = ["unitless", "mm", "cm", "dm", "m", "km", "in", "ft", "yd", "mi"] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

export const METRES_PER_UNIT: Record<LengthUnit, number> = { unitless: 1, mm: 0.001, cm: 0.01, dm: 0.1, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 };

/** x' = a·x + c·y + e and y' = b·x + d·y + f, written [a, b, c, d, e, f] (the order of a canvas transform). */
export type Affine = readonly [number, number, number, number, number, number];

/** minX, minY, maxX, maxY. */
export type Box = [number, number, number, number];

export interface Reference {
    /** Index into `Drawing.blocks`. */
    block: number;
    /** Index into `Drawing.layers`. */
    layer: number;
    /** From the block's coordinates to those of the block (or model space) holding the reference. */
    transform: Affine;
    attributes?: Record<string, string>;
}

/** Model space or a block, in its own coordinates. */
export interface Block {
    name: string;
    /** Four numbers per shape: layer index, 1 when closed (else 0), first point in `Drawing.points`, number of points. */
    shapes: number[];
    references: Reference[];
}

export interface Drawing {
    units: LengthUnit;
    layers: string[];
    blocks: Block[];
    model: Block;
    /** The reader left part of the drawing out (it was larger than its limits). */
    truncated: boolean;
    /** Every shape's points, x and y in turn. */
    points: Float64Array;
}

/** References nested deeper than this are counted but not opened (a self-referencing or exploding block). */
export const MAX_DEPTH = 8;

/** Shapes and references placed at most in one walk; a drawing that nests more copies is cut short (a block bomb). */
export const MAX_PLACED = 5_000_000;

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

/** `outer` after `inner`. */
export const compose = (outer: Affine, inner: Affine): Affine => [
    outer[0] * inner[0] + outer[2] * inner[1],
    outer[1] * inner[0] + outer[3] * inner[1],
    outer[0] * inner[2] + outer[2] * inner[3],
    outer[1] * inner[2] + outer[3] * inner[3],
    outer[0] * inner[4] + outer[2] * inner[5] + outer[4],
    outer[1] * inner[4] + outer[3] * inner[5] + outer[5],
];

export const apply = (t: Affine, x: number, y: number): [number, number] => [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]];

/** The reader's two outputs as a drawing; throws when they are not one (the reader and the app are out of step). */
export function parseDrawing(json: string, pointBytes: ArrayBuffer): Drawing {
    const value = JSON.parse(json) as Partial<Drawing> & { pointCount?: unknown };
    if (pointBytes.byteLength % 16 !== 0) throw new Error("Unexpected drawing data");
    const points = new Float64Array(pointBytes);
    const pointCount = points.length / 2;
    const layers = value.layers;
    const blocks = value.blocks;
    const valid =
        LENGTH_UNITS.includes(value.units as LengthUnit) &&
        typeof value.truncated === "boolean" &&
        value.pointCount === pointCount &&
        Array.isArray(layers) &&
        layers.every((layer) => typeof layer === "string") &&
        Array.isArray(blocks) &&
        [value.model, ...blocks].every((block) => isBlock(block, layers.length, blocks.length, pointCount));
    if (!valid) throw new Error("Unexpected drawing data");
    return { units: value.units!, layers: layers!, blocks: blocks!, model: value.model!, truncated: value.truncated!, points };
}

const isIndex = (value: unknown, length: number) => Number.isInteger(value) && (value as number) >= 0 && (value as number) < length;

function isBlock(value: unknown, layerCount: number, blockCount: number, pointCount: number): value is Block {
    const block = value as Block | null;
    if (typeof block?.name !== "string" || !Array.isArray(block.shapes) || block.shapes.length % 4 !== 0 || !Array.isArray(block.references)) return false;
    for (let i = 0; i < block.shapes.length; i += 4) {
        const [layer, closed, first, count] = block.shapes.slice(i, i + 4) as [number, number, number, number];
        if (!isIndex(layer, layerCount) || (closed !== 0 && closed !== 1) || !isIndex(first, pointCount) || !Number.isInteger(count) || count < 2 || first + count > pointCount) return false;
    }
    return block.references.every(
        (reference) =>
            isIndex(reference?.block, blockCount) &&
            isIndex(reference.layer, layerCount) &&
            Array.isArray(reference.transform) &&
            reference.transform.length === 6 &&
            reference.transform.every(Number.isFinite) &&
            (reference.attributes === undefined || (typeof reference.attributes === "object" && reference.attributes !== null)),
    );
}

/** Calls `visit` for each shape of a block: its index, layer, whether it is closed, its first point and point count. */
export function forEachShape(block: Block, visit: (index: number, layer: number, closed: boolean, first: number, count: number) => void) {
    const shapes = block.shapes;
    for (let i = 0; i < shapes.length; i += 4) visit(i / 4, shapes[i]!, shapes[i + 1] === 1, shapes[i + 2]!, shapes[i + 3]!);
}

/**
 * Places model space and every block it uses, nested ones included: `visit` gets each placed block with the transform
 * from its coordinates to the drawing's and its depth (model space 0, a block placed in it 1, and so on). References at
 * MAX_DEPTH are not opened. `visit` returns what the blocks placed inside receive as `inherited` (model space gets
 * `root`). Returns false when the walk stopped at MAX_PLACED.
 */
export function walk<T>(drawing: Drawing, root: T, visit: (block: Block, transform: Affine, depth: number, inherited: T) => T): boolean {
    let placed = 0;
    const stack: [Block, Affine, number, T][] = [[drawing.model, IDENTITY, 0, root]];
    while (stack.length > 0) {
        const [block, transform, depth, inherited] = stack.pop()!;
        placed += block.shapes.length / 4 + block.references.length;
        if (placed > MAX_PLACED) return false;
        const passed = visit(block, transform, depth, inherited);
        if (depth >= MAX_DEPTH) continue;
        // Pushed last to first, so blocks are visited in the drawing's order
        for (let i = block.references.length - 1; i >= 0; i--) {
            const reference = block.references[i]!;
            stack.push([drawing.blocks[reference.block]!, compose(transform, reference.transform), depth + 1, passed]);
        }
    }
    return true;
}

/** The extent of a block's own shapes, in its coordinates; null when it has none. */
export function shapesBox(drawing: Drawing, block: Block): Box | null {
    const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
    forEachShape(block, (_index, _layer, _closed, first, count) => {
        for (let p = first; p < first + count; p++) extend(box, drawing.points[p * 2]!, drawing.points[p * 2 + 1]!);
    });
    return box[0] <= box[2] ? box : null;
}

/**
 * The extent of what a block draws (its shapes and the blocks it places, opened as deep as `walk` opens them) in its
 * own coordinates, or null when it draws nothing. Each block and depth is measured once.
 */
export function createBoxes(drawing: Drawing): (block: Block, depth: number) => Box | null {
    const known = new Map<Block, (Box | null)[]>();
    const boxOf = (block: Block, depth: number): Box | null => {
        const byDepth = known.get(block) ?? known.set(block, []).get(block)!;
        if (depth in byDepth) return byDepth[depth]!;
        const box = shapesBox(drawing, block) ?? ([Infinity, Infinity, -Infinity, -Infinity] as Box);
        if (depth < MAX_DEPTH) {
            for (const reference of block.references) {
                const inner = boxOf(drawing.blocks[reference.block]!, depth + 1);
                if (inner) for (const [x, y] of corners(inner)) extend(box, ...apply(reference.transform, x, y));
            }
        }
        byDepth[depth] = box[0] <= box[2] ? box : null;
        return byDepth[depth]!;
    };
    return boxOf;
}

/** The extent of everything drawn, in drawing units; null when the drawing is empty. */
export const drawingBounds = (drawing: Drawing): Box | null => createBoxes(drawing)(drawing.model, 0);

export const corners = ([x1, y1, x2, y2]: Box): [number, number][] => [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
];

export function extend(box: Box, x: number, y: number) {
    if (x < box[0]) box[0] = x;
    if (y < box[1]) box[1] = y;
    if (x > box[2]) box[2] = x;
    if (y > box[3]) box[3] = y;
}

/** The length of a shape after a transform, closing it when it is closed. */
export function shapeLength(points: Float64Array, first: number, count: number, closed: boolean, t: Affine = IDENTITY): number {
    let length = 0;
    for (let i = 1; i < count + (closed ? 1 : 0); i++) {
        const a = (first + i - 1) * 2;
        const b = (first + (i % count)) * 2;
        const [dx, dy] = [points[b]! - points[a]!, points[b + 1]! - points[a + 1]!];
        length += Math.hypot(t[0] * dx + t[2] * dy, t[1] * dx + t[3] * dy);
    }
    return length;
}
