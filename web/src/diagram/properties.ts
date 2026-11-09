import type { MessageKey } from "../i18n/i18n";
import type { NodeKind } from "../plants";

/**
 * The properties an element or a line can have: one schema drives the properties panel, the checks of a file and the
 * details shown on the drawing. Values are stored sparsely: a field left empty is not stored.
 */

export type Spec =
    | { type: "number"; label: MessageKey; unit?: string; integer?: boolean; max?: number }
    | { type: "text"; label: MessageKey; max: number }
    | { type: "choice"; label: MessageKey; choices: readonly string[] };

const kV = { type: "number", unit: "kV" } as const;

export const FIELDS = {
    status: { type: "choice", label: "prop.status", choices: ["existing", "planned", "outOfService"] },
    manufacturer: { type: "text", label: "prop.manufacturer", max: 100 },
    model: { type: "text", label: "prop.model", max: 100 },
    notes: { type: "text", label: "prop.notes", max: 1000 },
    voltageKv: { ...kV, label: "field.voltage" },
    hvKv: { ...kV, label: "prop.hvKv" },
    lvKv: { ...kV, label: "prop.lvKv" },
    tvKv: { ...kV, label: "prop.tvKv" },
    acVoltageKv: { ...kV, label: "prop.acVoltageKv" },
    dcVoltageV: { type: "number", unit: "V", label: "prop.dcVoltageV" },
    maxDcVoltageV: { type: "number", unit: "V", label: "prop.maxDcVoltageV" },
    ratedCurrentA: { type: "number", unit: "A", label: "prop.ratedCurrentA" },
    breakingCurrentKa: { type: "number", unit: "kA", label: "prop.breakingCurrentKa" },
    shortCircuitMva: { type: "number", unit: "MVA", label: "prop.shortCircuitMva" },
    ratedPowerKva: { type: "number", unit: "kVA", label: "prop.ratedPower" },
    ratedPowerKw: { type: "number", unit: "kW", label: "prop.ratedPower" },
    acPowerKva: { type: "number", unit: "kVA", label: "prop.acPowerKva" },
    dcPowerKw: { type: "number", unit: "kW", label: "prop.dcPowerKw" },
    powerKw: { type: "number", unit: "kW", label: "prop.powerKw" },
    peakPowerKwp: { type: "number", unit: "kWp", label: "prop.peakPowerKwp" },
    energyKwh: { type: "number", unit: "kWh", label: "prop.energyKwh" },
    reactiveMvar: { type: "number", unit: "Mvar", label: "prop.reactiveMvar" },
    powerFactor: { type: "number", max: 1, label: "prop.powerFactor" },
    impedancePercent: { type: "number", unit: "%", max: 100, label: "prop.impedancePercent" },
    vectorGroup: { type: "text", max: 20, label: "prop.vectorGroup" },
    ratio: { type: "text", max: 40, label: "prop.ratio" },
    accuracyClass: { type: "text", max: 20, label: "prop.accuracyClass" },
    meterType: { type: "text", max: 60, label: "prop.meterType" },
    mppts: { type: "number", integer: true, label: "prop.mppts" },
    modules: { type: "number", integer: true, label: "prop.modules" },
    modulePowerW: { type: "number", unit: "Wp", label: "prop.modulePowerW" },
    strings: { type: "number", integer: true, label: "prop.strings" },
    modulesPerString: { type: "number", integer: true, label: "prop.modulesPerString" },
    inputs: { type: "number", integer: true, label: "prop.inputs" },
    circuits: { type: "number", integer: true, label: "prop.circuits" },
    conductor: { type: "text", max: 80, label: "prop.conductor" },
    crossSectionMm2: { type: "number", unit: "mm²", label: "prop.crossSectionMm2" },
    lengthKm: { type: "number", unit: "km", label: "field.length" },
    lengthM: { type: "number", unit: "m", label: "field.length" },
    lineKind: { type: "choice", label: "prop.lineKind", choices: ["cable", "overheadLine", "busduct"] },
} as const satisfies Record<string, Spec>;

export type FieldId = keyof typeof FIELDS;
export type Properties = Partial<Record<FieldId, string | number>>;

/** Every element has these, in its general group. */
export const COMMON: readonly FieldId[] = ["status", "manufacturer", "model"];

const V = "voltageKv";
/** Each kind's electrical fields, most telling first. */
export const ELECTRICAL: Record<NodeKind, readonly FieldId[]> = {
    gridConnection: [V, "shortCircuitMva"],
    busbar: [V, "ratedCurrentA"],
    breaker: [V, "ratedCurrentA", "breakingCurrentKa"],
    disconnector: [V, "ratedCurrentA"],
    earthSwitch: [V],
    fuse: [V, "ratedCurrentA"],
    transformer: ["hvKv", "lvKv", "ratedPowerKva", "vectorGroup", "impedancePercent"],
    transformer3w: ["hvKv", "lvKv", "tvKv", "ratedPowerKva", "vectorGroup", "impedancePercent"],
    currentTransformer: [V, "ratio", "accuracyClass"],
    voltageTransformer: [V, "ratio", "accuracyClass"],
    surgeArrester: [V],
    meter: [V, "meterType", "accuracyClass"],
    load: [V, "powerKw"],
    capacitorBank: [V, "reactiveMvar"],
    reactor: [V, "reactiveMvar"],
    overheadLine: [V, "lengthKm", "conductor", "circuits", "ratedCurrentA"],
    cableLine: [V, "lengthKm", "conductor", "crossSectionMm2", "circuits", "ratedCurrentA"],
    pvArray: ["peakPowerKwp", "modules", "modulePowerW", "strings", "modulesPerString", "dcVoltageV"],
    combinerBox: ["inputs", "ratedCurrentA", "dcVoltageV"],
    inverter: ["acPowerKva", "dcPowerKw", "acVoltageKv", "maxDcVoltageV", "mppts"],
    windTurbine: ["ratedPowerKw", V, "powerFactor"],
    battery: ["energyKwh", "powerKw", "dcVoltageV"],
    generator: ["ratedPowerKva", V, "powerFactor"],
};

/** A line's fields: what it is, then its electrical data. */
export const LINE_GENERAL: readonly FieldId[] = ["lineKind", "status"];
export const LINE_ELECTRICAL: readonly FieldId[] = [V, "lengthM", "conductor", "crossSectionMm2", "circuits", "ratedCurrentA"];
export const LINE_FIELDS: readonly FieldId[] = [...LINE_GENERAL, ...LINE_ELECTRICAL];

/** The fields an element of a kind may have, notes last. */
export const fieldsOf = (kind: NodeKind): readonly FieldId[] => [...COMMON, ...ELECTRICAL[kind], "notes"];
export const lineFieldsOf = (): readonly FieldId[] => [...LINE_FIELDS, "notes"];

/** A value this field may hold. */
export function isFieldValue(id: FieldId, value: unknown): value is string | number {
    const spec: Spec = FIELDS[id];
    if (spec.type === "number") return typeof value === "number" && Number.isFinite(value) && value >= 0 && (spec.max === undefined || value <= spec.max) && (!spec.integer || Number.isInteger(value));
    if (spec.type === "text") return typeof value === "string" && value !== "" && value.length <= spec.max;
    return typeof value === "string" && spec.choices.includes(value);
}

/** Properties read from a file: only known fields of this kind (or a line) with valid values; null otherwise. */
export function readProperties(value: unknown, allowed: readonly FieldId[]): Properties | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const entries = Object.entries(value);
    if (!entries.every(([id, field]) => allowed.includes(id as FieldId) && isFieldValue(id as FieldId, field))) return null;
    return Object.fromEntries(entries) as Properties;
}

/** The properties with one field set, or removed when empty. */
export function withField(properties: Properties, id: FieldId, value: string | number | null): Properties {
    const { [id]: _, ...rest } = properties;
    return value === null || value === "" ? rest : { ...rest, [id]: value };
}

/** The voltage and power fields an element of version 1 or 2 had, for each kind; other values go into its notes. */
export function upgradeProperties(kind: NodeKind, voltageKv: number | null, ratingKva: number | null): Properties {
    const props: Properties = {};
    const lost: string[] = [];
    const fields = ELECTRICAL[kind];
    if (voltageKv !== null) {
        if (fields.includes(V)) props.voltageKv = voltageKv;
        else if (fields.includes("hvKv")) props.hvKv = voltageKv;
        else if (fields.includes("acVoltageKv")) props.acVoltageKv = voltageKv;
        else props.dcVoltageV = voltageKv * 1000;
    }
    if (ratingKva !== null) {
        const field = (["ratedPowerKva", "acPowerKva", "ratedPowerKw", "powerKw", "peakPowerKwp"] as const).find((id) => fields.includes(id));
        if (field) props[field] = ratingKva;
        else if (fields.includes("reactiveMvar")) props.reactiveMvar = ratingKva / 1000;
        else lost.push(`${ratingKva} kVA`);
    }
    if (lost.length > 0) props.notes = lost.join("\n");
    return props;
}

/**
 * What the drawing shows under an element's name: its voltage (or voltages) and its main ratings, the numbers written
 * by `format` (the reader's digits).
 */
export function summary(kind: NodeKind, props: Properties, format: (value: number) => string = String): string[] {
    const numeric = (id: FieldId) => (typeof props[id] === "number" ? props[id] : null);
    const amount = (id: FieldId) => {
        const value = numeric(id);
        return value === null ? null : `${format(value)} ${(FIELDS[id] as { unit: string }).unit}`;
    };
    const voltages = (["hvKv", "lvKv", "tvKv"] as const).map(numeric).filter((value) => value !== null);
    const parts = [
        voltages.length > 0 ? `${voltages.map(format).join("/")} kV` : null,
        ...(["voltageKv", "acVoltageKv", "dcVoltageV"] as const).map(amount),
        ...ELECTRICAL[kind].filter((id) => ["ratedPowerKva", "ratedPowerKw", "acPowerKva", "powerKw", "peakPowerKwp", "energyKwh", "reactiveMvar", "shortCircuitMva"].includes(id)).map(amount),
    ];
    return parts.filter((part): part is string => !!part);
}
