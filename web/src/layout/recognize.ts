import type { LayoutKind, LayoutRule } from "../plants";
import { polylineLength, type Drawing } from "./drawing";

export interface Total {
    kind: LayoutKind;
    measure: LayoutRule["measure"];
    count: number;
    /** Metres, for "length" rules. */
    lengthM: number;
}

export interface Recognition {
    /** One per kind, in rule order. */
    totals: Total[];
    /** The kind of each block reference of the drawing, or null. */
    insertKinds: (LayoutKind | null)[];
    /** The kind of each shape of the drawing, or null. */
    shapeKinds: (LayoutKind | null)[];
    /** Indexes of the rules whose pattern is not a valid regular expression (they match nothing). */
    invalidRules: number[];
}

/**
 * Applies the rules, the first matching rule winning:
 * - "count" rules count block references whose block or layer name matches, and shapes drawn directly in model space
 *   (depth 0) on a matching layer, so the outline inside a counted block is not counted again;
 * - "length" rules add up the length of every shape on a matching layer, in metres.
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
    const totals = new Map<LayoutKind, Total>();
    for (const rule of rules) totals.set(rule.kind, totals.get(rule.kind) ?? { kind: rule.kind, measure: rule.measure, count: 0, lengthM: 0 });
    const match = (text: string, measure: LayoutRule["measure"]) => compiled.find((rule) => rule.measure === measure && rule.pattern !== "" && rule.regex?.test(text));

    const insertKinds = drawing.inserts.map((insert) => {
        const rule = match(`${insert.block} ${insert.layer}`, "count");
        if (rule) totals.get(rule.kind)!.count++;
        return rule?.kind ?? null;
    });

    const shapeKinds = drawing.shapes.map((shape) => {
        const counted = shape.depth === 0 ? match(shape.layer, "count") : undefined;
        if (counted) {
            totals.get(counted.kind)!.count++;
            return counted.kind;
        }
        const measured = match(shape.layer, "length");
        if (measured) {
            const total = totals.get(measured.kind)!;
            total.count++;
            total.lengthM += polylineLength(shape.points, shape.closed) * metresPerUnit;
        }
        return measured?.kind ?? null;
    });

    return { totals: [...totals.values()], insertKinds, shapeKinds, invalidRules };
}
