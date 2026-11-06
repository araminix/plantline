/** What a plant is: it decides the diagram palette and how a drawing of it is recognised. */
export const PLANT_TYPES = ["solar", "wind", "storage", "hydro", "substation", "transmission"] as const;
export type PlantType = (typeof PLANT_TYPES)[number];

export const isPlantType = (value: unknown): value is PlantType => PLANT_TYPES.includes(value as PlantType);

/** Every element a single-line diagram can hold. */
export const NODE_KINDS = [
    "gridConnection",
    "busbar",
    "breaker",
    "disconnector",
    "earthSwitch",
    "fuse",
    "transformer",
    "transformer3w",
    "currentTransformer",
    "voltageTransformer",
    "surgeArrester",
    "meter",
    "load",
    "capacitorBank",
    "reactor",
    "overheadLine",
    "cableLine",
    "pvArray",
    "combinerBox",
    "inverter",
    "windTurbine",
    "battery",
    "generator",
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const isNodeKind = (value: unknown): value is NodeKind => NODE_KINDS.includes(value as NodeKind);

const SWITCHGEAR: readonly NodeKind[] = ["gridConnection", "busbar", "breaker", "disconnector", "transformer", "meter", "currentTransformer", "voltageTransformer", "surgeArrester"];

/** The palette of each plant type: its own equipment first, then the switchgear every plant has. */
export const PALETTES: Record<PlantType, readonly NodeKind[]> = {
    solar: ["pvArray", "combinerBox", "inverter", ...SWITCHGEAR, "fuse", "earthSwitch", "load"],
    wind: ["windTurbine", ...SWITCHGEAR, "cableLine", "earthSwitch", "reactor", "capacitorBank"],
    storage: ["battery", "inverter", ...SWITCHGEAR, "fuse", "earthSwitch", "load"],
    hydro: ["generator", ...SWITCHGEAR, "earthSwitch", "load"],
    substation: [...SWITCHGEAR, "transformer3w", "earthSwitch", "capacitorBank", "reactor", "overheadLine", "cableLine", "load"],
    transmission: ["overheadLine", "cableLine", ...SWITCHGEAR, "earthSwitch", "reactor", "capacitorBank"],
};

/** Elements that join two voltage levels (or DC and AC), so their links may differ in voltage. */
export const CONVERTERS: ReadonlySet<NodeKind> = new Set<NodeKind>(["transformer", "transformer3w", "inverter"]);

/** What can be recognised in a plant drawing. */
export const LAYOUT_KINDS = [
    "pvTable",
    "pvString",
    "inverter",
    "combinerBox",
    "transformer",
    "windTurbine",
    "battery",
    "generator",
    "breaker",
    "disconnector",
    "busbar",
    "tower",
    "substation",
    "building",
    "cable",
    "overheadLine",
    "road",
    "fence",
] as const;
export type LayoutKind = (typeof LAYOUT_KINDS)[number];

/**
 * How objects of a drawing are recognised: a block reference or shape whose block or layer name matches the pattern (a
 * case-insensitive regular expression) is of that kind. "count" counts them, "length" adds up their lengths.
 */
export interface LayoutRule {
    kind: LayoutKind;
    pattern: string;
    measure: "count" | "length";
}

const rule = (kind: LayoutKind, pattern: string, measure: LayoutRule["measure"] = "count"): LayoutRule => ({ kind, pattern, measure });

/** The default rules of each plant type, for the layer and block names design tools commonly use. */
export const LAYOUT_RULES: Record<PlantType, readonly LayoutRule[]> = {
    solar: [
        rule("pvTable", "table"),
        rule("pvString", "string"),
        rule("inverter", "inv"),
        rule("combinerBox", "combiner|\\bscb\\b"),
        rule("transformer", "transformer|trafo|station"),
        rule("cable", "cable", "length"),
        rule("fence", "fence", "length"),
        rule("road", "road", "length"),
    ],
    wind: [rule("windTurbine", "wtg|turbine"), rule("substation", "substation"), rule("cable", "cable", "length"), rule("road", "road", "length")],
    storage: [
        rule("battery", "bess|batter"),
        rule("inverter", "pcs|inverter"),
        rule("transformer", "transformer|trafo"),
        rule("cable", "cable", "length"),
        rule("fence", "fence", "length"),
    ],
    hydro: [rule("generator", "generator|unit"), rule("transformer", "transformer|trafo"), rule("building", "building|powerhouse"), rule("road", "road", "length")],
    substation: [
        rule("transformer", "transformer|trafo"),
        rule("breaker", "\\bcb|breaker"),
        rule("disconnector", "\\bds|disconnect|isolator"),
        rule("busbar", "busbar", "length"),
        rule("building", "building"),
        rule("fence", "fence", "length"),
    ],
    transmission: [rule("tower", "tower|pylon"), rule("substation", "substation"), rule("overheadLine", "ohl|overhead", "length"), rule("road", "road", "length")],
};

/** The symbol that stands for each plant type in the plant type picker. */
export const PLANT_ICONS: Record<PlantType, NodeKind> = {
    solar: "pvArray",
    wind: "windTurbine",
    storage: "battery",
    hydro: "generator",
    substation: "transformer",
    transmission: "overheadLine",
};
