import { MEASURE, type LayoutKind } from "../plants";
import { apply, compose, corners, createBoxes, forEachShape, shapesBox, walk, type Drawing } from "./drawing";
import type { Recognition } from "./recognize";

/** A counted object of the drawing: a placed block, or a closed shape in model space. */
export interface Found {
    kind: LayoutKind;
    /** Its ID (or tag, name, number) from its attributes, else its block or layer name and a number. */
    label: string;
    /** Null for a shape. */
    block: string | null;
    layer: string;
    attributes: Readonly<Record<string, string>>;
    /** The corners of what it draws, in drawing units. */
    corners: [number, number][];
}

const NAMING = ["id", "tag", "name", "no", "number"];

/** The attribute that names an object: ID first, else TAG, NAME, NO, NUMBER, else the first one. */
export function nameOf(attributes: Readonly<Record<string, string>>): string | null {
    const entries = Object.entries(attributes).filter(([, value]) => value.trim() !== "");
    for (const wanted of NAMING) {
        const found = entries.find(([key]) => key.toLowerCase() === wanted);
        if (found) return found[1];
    }
    return entries[0]?.[1] ?? null;
}

/** Every counted object of every placed copy, in drawing order. */
export function findObjects(drawing: Drawing, recognition: Recognition): Found[] {
    const boxOf = createBoxes(drawing);
    const numbers = new Map<string, number>();
    const fallback = (name: string) => {
        const n = (numbers.get(name) ?? 0) + 1;
        numbers.set(name, n);
        return `${name} ${n}`;
    };
    const found: Found[] = [];
    walk(
        drawing,
        null,
        (block, transform, depth) => {
            const kinds = recognition.kinds.get(block)!;
            block.references.forEach((reference, i) => {
                const kind = kinds.references[i];
                const box = kind && MEASURE[kind] === "count" && boxOf(drawing.blocks[reference.block]!, depth + 1);
                if (!kind || !box) return;
                const name = drawing.blocks[reference.block]!.name;
                const attributes = reference.attributes ?? {};
                const placed = compose(transform, reference.transform);
                found.push({ kind, label: nameOf(attributes) ?? fallback(name), block: name, layer: drawing.layers[reference.layer]!, attributes, corners: corners(box).map(([x, y]) => apply(placed, x, y)) });
            });
            if (block !== drawing.model) return null;
            forEachShape(block, (index, layer, closed) => {
                const kind = kinds.shapes[index];
                if (!kind || !closed || MEASURE[kind] !== "count") return;
                const box = shapesBox(drawing, { name: "", shapes: block.shapes.slice(index * 4, index * 4 + 4), references: [] })!;
                const name = drawing.layers[layer]!;
                found.push({ kind, label: fallback(name), block: null, layer: name, attributes: {}, corners: corners(box) });
            });
            return null;
        },
        recognition.enters,
    );
    return found;
}

/** The module power a name tells, such as "PV_MODULE_550W" or "590Wp", when all the names agree; else null. */
export function moduleWp(names: Iterable<string>): number | null {
    const powers = new Set([...names].map((name) => /(?:^|[^\d])(\d{3})\s?wp?(?![a-z])/i.exec(name)?.[1]).filter((power) => power !== undefined));
    return powers.size === 1 ? Number([...powers][0]) : null;
}
