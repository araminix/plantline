import type { NodeKind, PlantType } from "../plants";
import { arrange } from "./arrange";
import { addNode, connect, emptyDiagram, updateNode, type Diagram, type Rotation } from "./model";
import type { Properties } from "./properties";

interface Element {
    kind: NodeKind;
    label?: string;
    designation?: string;
    props?: Properties;
    /** Inverters are turned over so their DC side (the top lead) faces the panels or batteries below them. */
    rotation?: Rotation;
    width?: number;
}

/**
 * Elements by key and the lines between them, the upper element first; laid out by Arrange. `upward` draws the plant
 * upside down, its sources on top feeding down to the grid at the bottom (as wind farms are drawn: a turbine's one
 * lead is at the foot of its tower).
 */
type Example = { elements: Record<string, Element>; lines: [string, string][]; upward?: boolean };

const grid = (kv: number, mva: number): Element => ({ kind: "gridConnection", designation: "=E01", props: { voltageKv: kv, shortCircuitMva: mva } });
const bus = (kv: number, designation: string, width = 520): Element => ({ kind: "busbar", label: `${kv} kV`, designation, props: { voltageKv: kv, ratedCurrentA: 1250 }, width });
const breaker = (kv: number, designation: string, amps = 630): Element => ({ kind: "breaker", designation, props: { voltageKv: kv, ratedCurrentA: amps, breakingCurrentKa: 25 } });
const transformer = (label: string, hv: number, lv: number, kva: number, group = "Dyn11"): Element => ({ kind: "transformer", label, props: { hvKv: hv, lvKv: lv, ratedPowerKva: kva, vectorGroup: group, impedancePercent: 7 } });

/** A feeder: its breaker and the chain hanging from it, keys suffixed with the feeder's number. */
function feeder(n: number, kv: number, chain: Element[], into: Example, from = "bus") {
    const keys = [`q${n}`, ...chain.map((_, i) => `e${n}.${i}`)];
    into.elements[`q${n}`] = breaker(kv, `-Q${n}`);
    chain.forEach((element, i) => (into.elements[`e${n}.${i}`] = element));
    into.lines.push([from, keys[0]!]);
    keys.slice(1).forEach((key, i) => into.lines.push([keys[i]!, key]));
}

const EXAMPLES: Record<PlantType, () => Example> = {
    solar: () => {
        const example: Example = { elements: { grid: grid(33, 500), bus: bus(33, "=E01-W1", 640) }, lines: [["grid", "bus"]] };
        for (const [n, field] of [
            [1, "A"],
            [2, "B"],
        ] as const) {
            feeder(n, 33, [transformer(`T${n}`, 33, 0.8, 3150), { kind: "inverter", label: `INV-${n}`, props: { acPowerKva: 3125, dcPowerKw: 3450, acVoltageKv: 0.8, maxDcVoltageV: 1500, mppts: 6 }, rotation: 180 }, { kind: "pvArray", label: `PV-${field}`, props: { peakPowerKwp: 3451.5, modules: 5850, modulePowerW: 590, strings: 225, modulesPerString: 26 } }], example);
        }
        feeder(3, 33, [transformer("T3", 33, 0.4, 100), { kind: "load", props: { voltageKv: 0.4, powerKw: 60 } }], example);
        return example;
    },
    wind: () => {
        const example: Example = { elements: { grid: grid(33, 800), bus: bus(33, "=E01-W1", 640) }, lines: [["grid", "bus"]], upward: true };
        for (const n of [1, 2, 3]) feeder(n, 33, [transformer(`T${n}`, 33, 0.69, 4800), { kind: "windTurbine", label: `WTG-0${n}`, props: { ratedPowerKw: 4500, voltageKv: 0.69, powerFactor: 0.95 } }], example);
        return example;
    },
    storage: () => {
        const example: Example = { elements: { grid: grid(33, 600), bus: bus(33, "=E01-W1") }, lines: [["grid", "bus"]] };
        for (const n of [1, 2]) {
            feeder(n, 33, [transformer(`T${n}`, 33, 0.69, 4200), { kind: "inverter", label: `PCS-${n}`, props: { acPowerKva: 4200, acVoltageKv: 0.69, maxDcVoltageV: 1500 }, rotation: 180 }, { kind: "battery", label: `BESS-${n}`, props: { energyKwh: 8400, powerKw: 4200, dcVoltageV: 1300 } }], example);
        }
        return example;
    },
    hydro: () => {
        const example: Example = { elements: { grid: grid(34.5, 400), bus: bus(34.5, "=E01-W1", 640) }, lines: [["grid", "bus"]] };
        for (const [n, kva] of [
            [1, 7800],
            [2, 7800],
            [3, 1800],
        ] as const) {
            feeder(n, 34.5, [transformer(`T${n}`, 34.5, 6.3, kva === 7800 ? 8000 : 2000, "YNd11"), { kind: "generator", label: `G${n}`, props: { ratedPowerKva: kva, voltageKv: 6.3, powerFactor: 0.9 } }], example);
        }
        return example;
    },
    substation: () => {
        const example: Example = {
            elements: {
                grid: grid(154, 5000),
                hv: bus(154, "=E01-W1", 240),
                qh: breaker(154, "-Q0", 3150),
                tr: transformer("TR1", 154, 33, 100000, "YNd11"),
                qm: breaker(33, "-Q10", 2000),
                bus: bus(33, "=E02-W1", 640),
            },
            lines: [
                ["grid", "hv"],
                ["hv", "qh"],
                ["qh", "tr"],
                ["tr", "qm"],
                ["qm", "bus"],
            ],
        };
        feeder(1, 33, [{ kind: "load", label: "F1", props: { voltageKv: 33, powerKw: 12000 } }], example);
        feeder(2, 33, [{ kind: "load", label: "F2", props: { voltageKv: 33, powerKw: 9000 } }], example);
        feeder(3, 33, [{ kind: "capacitorBank", props: { voltageKv: 33, reactiveMvar: 10 } }], example);
        return example;
    },
    transmission: () => ({
        elements: {
            grid: grid(154, 5000),
            a: bus(154, "=A-W1", 240),
            qa: breaker(154, "=A-Q0", 2000),
            line: { kind: "overheadLine", label: "L1", props: { voltageKv: 154, lengthKm: 13.6, conductor: "1272 MCM", circuits: 1, ratedCurrentA: 1000 } },
            qb: breaker(154, "=B-Q0", 2000),
            b: bus(154, "=B-W1", 360),
            qr: breaker(154, "=B-Q5", 1250),
            reactor: { kind: "reactor", props: { voltageKv: 154, reactiveMvar: 25 } },
        },
        lines: [
            ["grid", "a"],
            ["a", "qa"],
            ["qa", "line"],
            ["line", "qb"],
            ["qb", "b"],
            ["b", "qr"],
            ["qr", "reactor"],
        ],
    }),
};

/** A ready-made single-line diagram of the plant type, connected and laid out, with no problems to check. */
export function exampleDiagram(plant: PlantType, name: string): Diagram {
    const { elements, lines, upward } = EXAMPLES[plant]();
    let diagram = emptyDiagram(plant, name);
    const ids = new Map<string, string>();
    Object.entries(elements).forEach(([key, element], index) => {
        const added = addNode(diagram, element.kind, index * 240, 0);
        diagram = updateNode(added.diagram, added.id, { label: element.label ?? "", designation: element.designation ?? "", props: element.props ?? {}, rotation: element.rotation ?? 0, width: element.width ?? null });
        ids.set(key, added.id);
    });
    for (const [from, to] of lines) diagram = connect(diagram, ids.get(from)!, ids.get(to)!) ?? diagram;
    const laid = straighten(arrange(diagram), lines.map(([from, to]) => [ids.get(from)!, ids.get(to)!]));
    return upward ? upsideDown(laid) : laid;
}

/** The diagram turned upside down: rows mirrored and every element turned over, but turbines kept upright. */
function upsideDown(diagram: Diagram): Diagram {
    const ys = diagram.nodes.map((node) => node.y);
    const [top, bottom] = [Math.min(...ys), Math.max(...ys)];
    return {
        ...diagram,
        nodes: diagram.nodes.map((node) => ({ ...node, y: top + bottom - node.y, rotation: node.kind === "windTurbine" || node.kind === "busbar" ? node.rotation : (((node.rotation + 180) % 360) as Rotation) })),
    };
}

/** An element that is its upper element's only one hangs straight below it, top-down (Arrange centres whole rows). */
function straighten(diagram: Diagram, lines: [string, string][]): Diagram {
    const below = Map.groupBy(lines, ([from]) => from);
    const x = new Map(diagram.nodes.map((node) => [node.id, node.x]));
    const byY = [...diagram.nodes].sort((a, b) => a.y - b.y);
    for (const node of byY) {
        const children = below.get(node.id) ?? [];
        const only = children.length === 1 ? children[0]![1] : null;
        if (only && diagram.nodes.find((n) => n.id === only)?.kind !== "busbar" && node.kind !== "busbar") x.set(only, x.get(node.id)!);
    }
    return { ...diagram, nodes: diagram.nodes.map((node) => ({ ...node, x: x.get(node.id)! })) };
}
