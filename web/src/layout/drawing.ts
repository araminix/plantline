/** The drawing JSON the CAD reader returns (cad/Plantline.Cad/Drawing.cs). */
export const LENGTH_UNITS = ["unitless", "mm", "cm", "dm", "m", "km", "in", "ft", "yd", "mi"] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

export const METRES_PER_UNIT: Record<LengthUnit, number> = { unitless: 1, mm: 0.001, cm: 0.01, dm: 0.1, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 };

export interface Shape {
    layer: string;
    /** 0 in model space, 1 inside a block reference, and so on. */
    depth: number;
    closed: boolean;
    /** x1, y1, x2, y2, ... in drawing units. */
    points: number[];
}

export interface InsertRef {
    layer: string;
    block: string;
    depth: number;
    x: number;
    y: number;
    box: [number, number, number, number];
    attributes: Record<string, string>;
}

export interface TextRef {
    layer: string;
    text: string;
    x: number;
    y: number;
}

export interface Drawing {
    units: LengthUnit;
    layers: string[];
    shapes: Shape[];
    inserts: InsertRef[];
    texts: TextRef[];
    truncated: boolean;
}

/** The reader's JSON as a drawing; throws when it is not one (the reader and the app are out of step). */
export function parseDrawing(json: string): Drawing {
    const value = JSON.parse(json) as Partial<Drawing> | null;
    const valid =
        value !== null &&
        typeof value === "object" &&
        LENGTH_UNITS.includes(value.units as LengthUnit) &&
        [value.layers, value.shapes, value.inserts, value.texts].every(Array.isArray) &&
        typeof value.truncated === "boolean";
    if (!valid) throw new Error("Unexpected drawing data");
    return value as Drawing;
}

/** The extent of everything drawn: minX, minY, maxX, maxY; null when the drawing is empty. */
export function drawingBounds(drawing: Drawing): [number, number, number, number] | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const add = (x: number, y: number) => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    };
    for (const shape of drawing.shapes) for (let i = 0; i < shape.points.length - 1; i += 2) add(shape.points[i]!, shape.points[i + 1]!);
    for (const insert of drawing.inserts) add(insert.x, insert.y);
    return minX <= maxX ? [minX, minY, maxX, maxY] : null;
}

/** The length of a polyline in drawing units, closing it when it is closed. */
export function polylineLength(points: readonly number[], closed: boolean): number {
    let length = 0;
    const count = Math.floor(points.length / 2);
    for (let i = 1; i < count + (closed ? 1 : 0); i++) {
        const a = (i - 1) * 2;
        const b = (i % count) * 2;
        length += Math.hypot(points[b]! - points[a]!, points[b + 1]! - points[a + 1]!);
    }
    return length;
}
