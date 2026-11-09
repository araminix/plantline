import { isPlantType, LAYOUT_KINDS, type LayoutKind, type LayoutRule, type PlantType } from "../plants";
import { readStored, writeStored } from "../settings";
import { LENGTH_UNITS, type LengthUnit } from "./drawing";
import type { Placement } from "./place";
import type { Assignments } from "./recognize";

/** What the user set for one drawing, kept in this browser so reopening the file brings it back. */
export interface DrawingSettings {
    unit: LengthUnit;
    placement: Placement | null;
    /** The name patterns, per plant type, so changing the plant type and back keeps the edits. */
    rules: Partial<Record<PlantType, LayoutRule[]>>;
    assignments: Assignments;
    hidden: string[];
    moduleWp: number | null;
    modulesPerTable: number;
}

const KEY = "plantline.drawings";
/** Drawings remembered at most; the least recently used is forgotten first. */
const KEEP = 20;

/** A drawing is known by its file name and size: the same file opened again, wherever it lies. */
export const drawingKey = (file: { name: string; size: number }) => `${file.name}|${file.size}`;

type Stored = Record<string, DrawingSettings & { usedAt: number }>;

function stored(): Stored {
    const value = readStored(KEY);
    return isRecord(value) ? (Object.fromEntries(Object.entries(value).filter(([, entry]) => isSettings(entry))) as Stored) : {};
}

export function recall(key: string): DrawingSettings | null {
    const entry = stored()[key];
    if (!entry) return null;
    const { usedAt: _, ...settings } = entry;
    return settings;
}

/** Keeps a drawing's settings; false when the browser cannot (storage full or blocked). */
export function remember(key: string, settings: DrawingSettings): boolean {
    const known = stored();
    // Later than every other, even within one millisecond
    const usedAt = Math.max(Date.now(), ...Object.values(known).map((entry) => entry.usedAt + 1));
    const entries = Object.entries({ ...known, [key]: { ...settings, usedAt } });
    const kept = entries.sort(([, a], [, b]) => b.usedAt - a.usedAt).slice(0, KEEP);
    return writeStored(KEY, Object.fromEntries(kept));
}

// Storage can hold anything (another version, a hand edit): an entry is used only when every part is as expected
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isKind = (value: unknown): value is LayoutKind => LAYOUT_KINDS.includes(value as LayoutKind);

function isPlacement(value: unknown): value is Placement | null {
    if (value === null) return true;
    if (!isRecord(value)) return false;
    if (value.mode === "crs") return typeof value.proj === "string" && value.proj.length <= 500;
    return value.mode === "point" && isNumber(value.lat) && isNumber(value.lon) && isNumber(value.rotationDeg);
}

const isRule = (value: unknown): value is LayoutRule =>
    isRecord(value) && isKind(value.kind) && typeof value.pattern === "string" && value.pattern.length <= 200 && (value.measure === "count" || value.measure === "length");

const isChoices = (value: unknown, extra: string[]) => isRecord(value) && Object.values(value).every((choice) => isKind(choice) || extra.includes(choice as string));

function isSettings(value: unknown): value is DrawingSettings & { usedAt: number } {
    if (!isRecord(value) || !LENGTH_UNITS.includes(value.unit as LengthUnit) || !isPlacement(value.placement) || !isNumber(value.usedAt)) return false;
    if (!isRecord(value.rules) || !Object.entries(value.rules).every(([plant, rules]) => isPlantType(plant) && Array.isArray(rules) && rules.every(isRule))) return false;
    if (!isRecord(value.assignments) || !isChoices(value.assignments.blocks, ["none", "skip"]) || !isChoices(value.assignments.layers, ["none"])) return false;
    return Array.isArray(value.hidden) && value.hidden.every((name) => typeof name === "string") && (value.moduleWp === null || isNumber(value.moduleWp)) && isNumber(value.modulesPerTable);
}
