import type { Block, Drawing, LengthUnit, Reference } from "./drawing";

interface ShapeSpec {
    layer: string;
    closed?: boolean;
    points: number[];
}

interface ReferenceSpec {
    block: string;
    layer: string;
    at: [number, number];
    /** Degrees, counter-clockwise. */
    rotation?: number;
    scale?: number;
    attributes?: Record<string, string>;
}

interface BlockSpec {
    shapes?: ShapeSpec[];
    references?: ReferenceSpec[];
}

/** A drawing as the reader returns it, written the way a person reads one: blocks by name, layers by name. */
export function makeDrawing(units: LengthUnit, model: BlockSpec, blocks: Record<string, BlockSpec> = {}, truncated = false): Drawing {
    const names = Object.keys(blocks);
    const all = [model, ...Object.values(blocks)];
    const layers = [...new Set(all.flatMap((spec) => [...(spec.shapes ?? []), ...(spec.references ?? [])].map((item) => item.layer)))].sort();
    const points: number[] = [];
    const build = (name: string, spec: BlockSpec): Block => ({
        name,
        shapes: (spec.shapes ?? []).flatMap((shape) => {
            const first = points.length / 2;
            points.push(...shape.points);
            return [layers.indexOf(shape.layer), shape.closed ? 1 : 0, first, shape.points.length / 2];
        }),
        references: (spec.references ?? []).map((reference): Reference => {
            const turn = ((reference.rotation ?? 0) * Math.PI) / 180;
            const scale = reference.scale ?? 1;
            const [cos, sin] = [Math.cos(turn) * scale, Math.sin(turn) * scale];
            const block = names.indexOf(reference.block);
            if (block < 0) throw new Error(`No block ${reference.block}`);
            return { block, layer: layers.indexOf(reference.layer), transform: [cos, sin, -sin + 0 /* JSON gives −0 back as 0 */, cos, ...reference.at], ...(reference.attributes && { attributes: reference.attributes }) };
        }),
    });
    const built = { model: build("*Model_Space", model), blocks: names.map((name) => build(name, blocks[name]!)) };
    return { units, layers, ...built, truncated, points: new Float64Array(points) };
}

const rectangle = (layer: string, x1: number, y1: number, x2: number, y2: number): ShapeSpec => ({ layer, closed: true, points: [x1, y1, x2, y1, x2, y2, x1, y2] });

/**
 * A small solar drawing in millimetres: 2 tables (each with a module block inside), 2 strings, an inverter, a 14 m
 * cable and a fence.
 */
export const solarFixture = (): Drawing =>
    makeDrawing(
        "mm",
        {
            shapes: [
                { layer: "PV-STRINGS", points: [-9000, -1000, 9000, -1000] },
                { layer: "PV-STRINGS", points: [13000, -1000, 31000, -1000] },
                { layer: "CABLES", points: [0, 0, 6000, 0, 6000, 8000] },
                rectangle("FENCE", -20000, -20000, 60000, 20000),
            ],
            references: [
                { block: "PV_TABLE_2x28", layer: "PV-TABLES", at: [0, 0] },
                { block: "PV_TABLE_2x28", layer: "PV-TABLES", at: [22000, 0], attributes: { ID: "=T2" } },
                { block: "INVERTER_250KW", layer: "INVERTERS", at: [40000, 10000], attributes: { ID: "INV-01" } },
            ],
        },
        {
            PV_TABLE_2x28: { shapes: [rectangle("PV-TABLES", -10000, -2000, 10000, 2000)], references: [{ block: "MODULE", layer: "0", at: [0, 0] }] },
            MODULE: { shapes: [rectangle("0", -500, -1000, 500, 1000)] },
            INVERTER_250KW: { shapes: [rectangle("INVERTERS", -1000, -500, 1000, 500)] },
        },
    );
