import { MEASURE, type LayoutKind, type LayoutRule } from "../plants";
import { forEachShape, shapeLength, walk, type Block, type Drawing, type Reference } from "./drawing";

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

/**
 * What the user chose for blocks and layers, by name; the others follow the rules. "none": not counted; "skip" (blocks
 * only): left out with everything inside, as a small key plan that repeats the whole plant should be.
 */
export interface Assignments {
    blocks: Readonly<Record<string, LayoutKind | "none" | "skip">>;
    layers: Readonly<Record<string, LayoutKind | "none">>;
}

export const NO_ASSIGNMENTS: Assignments = { blocks: {}, layers: {} };

export interface Recognition {
    /** One per kind, in rule order then the chosen kinds, over every placed copy of every block. */
    totals: Total[];
    kinds: Map<Block, Kinds>;
    /** Indexes of the rules whose pattern is not a valid regular expression (they match nothing). */
    invalidRules: number[];
    /** False when the drawing places more copies than can be counted (see MAX_PLACED). */
    complete: boolean;
}

/** The rules compiled: the kind the first matching rule of a measure gives a name, or null. */
export function createMatcher(rules: readonly LayoutRule[]) {
    const invalid: number[] = [];
    const compiled = rules.map((rule, index) => {
        try {
            return { ...rule, regex: new RegExp(rule.pattern, "i") };
        } catch {
            invalid.push(index);
            return { ...rule, regex: null };
        }
    });
    const match = (text: string, measure: LayoutRule["measure"]) => compiled.find((rule) => rule.measure === measure && rule.pattern !== "" && rule.regex?.test(text))?.kind ?? null;
    return { match, invalid };
}

const chosen = <T,>(map: Readonly<Record<string, T>>, name: string) => (Object.hasOwn(map, name) ? map[name] : undefined);

/** Whether a walk opens a reference: not when its block is left out. */
export const entersBlock = (drawing: Drawing, assignments: Assignments) => (reference: Reference) => chosen(assignments.blocks, drawing.blocks[reference.block]!.name) !== "skip";

/**
 * Applies the user's choices, then the rules (the first matching rule winning):
 * - a reference is of the kind chosen for its block, else of a counted kind chosen for its layer, else of the first
 *   "count" rule matching its block or layer name; it is counted at any depth;
 * - a shape is of the kind chosen for its layer, else of a matching rule. Counted kinds count shapes drawn directly in
 *   model space only, so the outline inside a counted block is not counted again; measured kinds ("length") add up
 *   the length of every shape, in metres, in every placed copy.
 */
export function recognize(drawing: Drawing, rules: readonly LayoutRule[], metresPerUnit: number, assignments: Assignments = NO_ASSIGNMENTS): Recognition {
    const { match, invalid } = createMatcher(rules);

    const kinds = new Map<Block, Kinds>();
    for (const block of [drawing.model, ...drawing.blocks]) {
        const inModel = block === drawing.model;
        const shapes: (LayoutKind | null)[] = [];
        forEachShape(block, (_index, layer) => {
            const name = drawing.layers[layer]!;
            const choice = chosen(assignments.layers, name);
            if (choice === undefined) shapes.push((inModel ? match(name, "count") : null) ?? match(name, "length"));
            else shapes.push(choice !== "none" && (inModel || MEASURE[choice] === "length") ? choice : null);
        });
        const references = block.references.map((reference) => {
            const [blockName, layerName] = [drawing.blocks[reference.block]!.name, drawing.layers[reference.layer]!];
            const forBlock = chosen(assignments.blocks, blockName);
            if (forBlock !== undefined) return forBlock === "none" || forBlock === "skip" ? null : forBlock;
            const forLayer = chosen(assignments.layers, layerName);
            if (forLayer !== undefined && forLayer !== "none" && MEASURE[forLayer] === "count") return forLayer;
            return match(`${blockName} ${layerName}`, "count");
        });
        kinds.set(block, { shapes, references });
    }

    const totals = new Map<LayoutKind, Total>();
    const chosenKinds = [...Object.values(assignments.blocks), ...Object.values(assignments.layers)].filter((kind): kind is LayoutKind => kind !== "none" && kind !== "skip");
    for (const kind of [...rules.map((rule) => rule.kind), ...chosenKinds]) {
        if (!totals.has(kind)) totals.set(kind, { kind, measure: MEASURE[kind], count: 0, lengthM: 0 });
    }
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
    }, entersBlock(drawing, assignments));

    return { totals: [...totals.values()], kinds, invalidRules: invalid, complete };
}

/** The drawing's blocks and layers in use, most used first: each block's placed copies, each layer's shapes and references. */
export interface Inventory {
    blocks: { name: string; copies: number }[];
    layers: { name: string; shapes: number; references: number }[];
}

export function inventory(drawing: Drawing): Inventory {
    const copies = new Uint32Array(drawing.blocks.length);
    const shapes = new Uint32Array(drawing.layers.length);
    const references = new Uint32Array(drawing.layers.length);
    walk(drawing, null, (block) => {
        forEachShape(block, (_index, layer) => shapes[layer]!++);
        for (const reference of block.references) {
            copies[reference.block]!++;
            references[reference.layer]!++;
        }
        return null;
    });
    return {
        blocks: drawing.blocks.map((block, i) => ({ name: block.name, copies: copies[i]! })).filter((block) => block.copies > 0).sort((a, b) => b.copies - a.copies),
        layers: drawing.layers
            .map((name, i) => ({ name, shapes: shapes[i]!, references: references[i]! }))
            .filter((layer) => layer.shapes + layer.references > 0)
            .sort((a, b) => b.shapes + b.references - (a.shapes + a.references)),
    };
}
