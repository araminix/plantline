import { describe, expect, it } from "vitest";
import { apply, compose, createBoxes, drawingBounds, invert, MAX_DEPTH, parseDrawing, shapeLength, transformedBox, walk, type Affine, type Drawing } from "./drawing";
import { makeDrawing, solarFixture } from "./fixture";

/** The reader's two outputs for a drawing: its JSON (without points) and its points as bytes. */
const readerOutput = (drawing: Drawing, change: (json: Record<string, unknown>) => void = () => {}): [string, ArrayBuffer] => {
    const { points, ...rest } = drawing;
    const json: Record<string, unknown> = { ...structuredClone(rest), pointCount: points.length / 2 };
    change(json);
    return [JSON.stringify(json), points.slice().buffer];
};

/** Blocks L0 to L{levels - 1}, each placing the next one unit to the right; model space places L0. */
const chain = (levels: number) =>
    makeDrawing(
        "m",
        { references: [{ block: "L0", layer: "0", at: [0, 0] }] },
        Object.fromEntries(Array.from({ length: levels }, (_, i) => [`L${i}`, { shapes: [{ layer: "0", points: [0, 0, 1, 0] }], references: i + 1 < levels ? [{ block: `L${i + 1}`, layer: "0", at: [1, 0] as [number, number] }] : [] }])),
    );

describe("drawing data", () => {
    it("accepts the reader's output and refuses anything else", () => {
        const drawing = solarFixture();
        expect(parseDrawing(...readerOutput(drawing))).toEqual(drawing);
        expect(() => parseDrawing("null", new ArrayBuffer(0))).toThrow();
        expect(() => parseDrawing(...readerOutput(drawing, (json) => (json.units = "furlong")))).toThrow();
        expect(() => parseDrawing(...readerOutput(drawing, (json) => (json.pointCount = 3)))).toThrow();
        expect(() => parseDrawing(...readerOutput(drawing, (json) => ((json.model as { shapes: number[] }).shapes[3] = 999)))).toThrow();
        expect(() => parseDrawing(...readerOutput(drawing, (json) => ((json.model as { references: { block: number }[] }).references[0]!.block = 9)))).toThrow();
        expect(() => parseDrawing(...readerOutput(drawing, (json) => ((json.blocks as { references: { transform: unknown[] }[] }[])[0]!.references[0]!.transform = [1, 0, 0, 1, 0])))).toThrow();
        expect(() => parseDrawing(readerOutput(drawing)[0], new ArrayBuffer(24))).toThrow();
    });

    it("places nested blocks through their transforms and opens them at most MAX_DEPTH levels deep", () => {
        const visits: [string, number, Affine][] = [];
        expect(walk(chain(12), null, (block, transform, depth) => void visits.push([block.name, depth, transform]))).toBe(true);
        expect(visits.map(([name, depth]) => `${name}@${depth}`)).toEqual(["*Model_Space@0", ...Array.from({ length: MAX_DEPTH }, (_, i) => `L${i}@${i + 1}`)]);
        expect(apply(visits.at(-1)![2], 0, 0)).toEqual([MAX_DEPTH - 1, 0]);
    });

    it("opens a block that contains itself only to the depth limit", () => {
        const drawing = makeDrawing("m", { references: [{ block: "SELF", layer: "0", at: [0, 0] }] }, { SELF: { references: [{ block: "SELF", layer: "0", at: [1, 0] }] } });
        let visits = 0;
        expect(walk(drawing, null, () => void visits++)).toBe(true);
        expect(visits).toBe(MAX_DEPTH + 1);
    });

    it("stops a block bomb instead of placing a hundred million copies", () => {
        const tenOf = (block: string) => ({ references: Array.from({ length: 10 }, (_, i) => ({ block, layer: "0", at: [i, 0] as [number, number] })) });
        const blocks = Object.fromEntries(Array.from({ length: 8 }, (_, level) => [`B${level}`, level < 7 ? tenOf(`B${level + 1}`) : { shapes: [{ layer: "0", points: [0, 0, 1, 1] }] }]));
        const bomb = makeDrawing("m", tenOf("B0"), blocks);
        expect(walk(bomb, null, () => null)).toBe(false);
    });

    it("measures extents and lengths through transforms", () => {
        expect(drawingBounds(solarFixture())).toEqual([-20000, -20000, 60000, 20000]);
        expect(drawingBounds(makeDrawing("m", {}))).toBeNull();
        const turned = makeDrawing("m", { references: [{ block: "BAR", layer: "0", at: [100, 0], rotation: 90, scale: 2 }] }, { BAR: { shapes: [{ layer: "0", points: [0, 0, 10, 0] }] } });
        const box = drawingBounds(turned)!;
        expect(box.map((value) => Math.round(value * 1e9) / 1e9)).toEqual([100, 0, 100, 20]);
        expect(createBoxes(turned)(turned.blocks[0]!, 1)).toEqual([0, 0, 10, 0]);
        const points = new Float64Array([0, 0, 3, 4, 0, 10, 10, 10, 10, 20]);
        expect(shapeLength(points, 0, 2, false)).toBe(5);
        expect(shapeLength(points, 0, 2, false, [2, 0, 0, 2, 7, 7])).toBe(10);
        expect(shapeLength(new Float64Array([0, 0, 10, 0, 10, 10, 0, 10]), 0, 4, true)).toBe(40);
        expect(shapeLength(new Float64Array([0, 0, 10, 0, 10, 10, 0, 10]), 0, 4, false)).toBe(30);
    });

    it("undoes a transform and measures a box after one", () => {
        const t: Affine = [0, 2, -2, 0, 5, 7];
        const round = (values: readonly number[]) => values.map((value) => Math.round(value * 1e12) / 1e12 + 0);
        expect(round(compose(t, invert(t)))).toEqual([1, 0, 0, 1, 0, 0]);
        expect(round(apply(invert(t), ...apply(t, 3, 4)))).toEqual([3, 4]);
        expect(round(transformedBox(t, [0, 0, 1, 2]))).toEqual([1, 7, 5, 9]);
    });
});

