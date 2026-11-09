import type { LayoutKind, LayoutRule } from "../plants";
import { forEachShape, shapeLength, walk, type Block, type Drawing } from "./drawing";

export interface Total {
    kind: LayoutKind;
    measure: LayoutRule["measure"];
    count: number;
    /** Metres, for "length" rules. */
    lengthM: number;
}

/** The kind of each shape and each reference of one block (or model space), or null. */
export interface Kinds {
    shapes: (LayoutKind | null)[];
    references: (LayoutKind | null)[];
}

export interface Recognition {
    /** One per kind, in rule order, over every placed copy of every block. */
    totals: Total[];
    kinds: Map<Block, Kinds>;
    /** Indexes of the rules whose pattern is not a valid regular expression (they match nothing). */
    invalidRules: number[];
    /** False when the drawing places more copies than can be counted (see MAX_PLACED). */
    complete: boolean;
}

/**
 * Applies the rules, the first matching rule winning:
 * - "count" rules count block references whose block or layer name matches, at any depth, and shapes drawn directly
 *   in model space on a matching layer, so the outline inside a counted block is not counted again;
 * - "length" rules add up the length of every shape on a matching layer, in metres, in every placed copy.
 */
export function recognize(drawing: Drawing, rules: readonly LayoutRule[], metresPerUnit: number): Recognition {
    const invalidRules: number[] = [];
    const compiled = rules.map((rule, index) => {
        try {
            return { ...rule, regex: new RegExp(rule.pattern, "i") };
        } catch {
            invalidRules.push(index);
            return { ...rule, regex: null };
        }
    });
    const match = (text: string, measure: LayoutRule["measure"]) => compiled.find((rule) => rule.measure === measure && rule.pattern !== "" && rule.regex?.test(text))?.kind ?? null;
    const counted = (layer: string) => match(layer, "count");
    const measured = (layer: string) => match(layer, "length");

    const kinds = new Map<Block, Kinds>();
    for (const block of [drawing.model, ...drawing.blocks]) {
        const shapes: (LayoutKind | null)[] = [];
        forEachShape(block, (_index, layer) => {
            const name = drawing.layers[layer]!;
            shapes.push((block === drawing.model ? counted(name) : null) ?? measured(name));
        });
        const references = block.references.map((reference) => counted(`${drawing.blocks[reference.block]!.name} ${drawing.layers[reference.layer]}`));
        kinds.set(block, { shapes, references });
    }

    const totals = new Map<LayoutKind, Total>();
    for (const rule of rules) totals.set(rule.kind, totals.get(rule.kind) ?? { kind: rule.kind, measure: rule.measure, count: 0, lengthM: 0 });
    const complete = walk(drawing, null, (block, transform) => {
        const { shapes, references } = kinds.get(block)!;
        for (const kind of references) if (kind) totals.get(kind)!.count++;
        forEachShape(block, (index, _layer, closed, first, count) => {
            const kind = shapes[index];
            if (!kind) return;
            const total = totals.get(kind)!;
            total.count++;
            if (total.measure === "length") total.lengthM += shapeLength(drawing.points, first, count, closed, transform) * metresPerUnit;
        });
        return null;
    });

    return { totals: [...totals.values()], kinds, invalidRules, complete };
}
