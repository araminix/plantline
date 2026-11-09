import { isNodeKind, isPlantType } from "../plants";
import type { Diagram, DiagramLink, DiagramNode } from "./model";

/** A saved diagram (a .plantline.json file). The format is described in docs/architecture.md. */
export interface DiagramFile {
    format: "plantline";
    /** 2 added line routes; version 1 files are still read (their lines route themselves). */
    version: 2;
    diagram: Diagram;
}

export const FILE_EXTENSION = ".plantline.json";
export const MAX_FILE_BYTES = 5_000_000;
const MAX_NODES = 5_000;
const MAX_LINKS = 10_000;
const MAX_TEXT = 200;
const MAX_COORDINATE = 1_000_000;
const MAX_ROUTE = 63;

export type ParseResult = { ok: true; diagram: Diagram } | { ok: false; error: "tooLarge" | "invalid" };

export const serializeDiagram = (diagram: Diagram): string => JSON.stringify({ format: "plantline", version: 2, diagram } satisfies DiagramFile, null, 2);

/** Reads a diagram file. The file is untrusted: anything unexpected, oversized or inconsistent is refused. */
export function parseDiagram(text: string): ParseResult {
    if (text.length > MAX_FILE_BYTES) return { ok: false, error: "tooLarge" };
    let file: unknown;
    try {
        file = JSON.parse(text);
    } catch {
        return { ok: false, error: "invalid" };
    }
    const diagram = isRecord(file) && file.format === "plantline" && (file.version === 1 || file.version === 2) ? readDiagram(file.diagram, file.version) : null;
    return diagram ? { ok: true, diagram } : { ok: false, error: "invalid" };
}

function readDiagram(value: unknown, version: 1 | 2): Diagram | null {
    if (!isRecord(value) || !isPlantType(value.plantType) || !isText(value.name)) return null;
    if (!Array.isArray(value.nodes) || !Array.isArray(value.links) || value.nodes.length > MAX_NODES || value.links.length > MAX_LINKS) return null;

    const nodes = value.nodes.map(readNode);
    const ids = new Set(nodes.map((node) => node?.id));
    if (nodes.some((node) => node === null) || ids.size !== nodes.length) return null;

    const links = value.links.map((link) => readLink(link, version));
    if (links.some((link) => link === null || !ids.has(link.from) || !ids.has(link.to) || link.from === link.to)) return null;

    return { plantType: value.plantType, name: value.name, nodes: nodes as DiagramNode[], links: links as DiagramLink[] };
}

function readNode(value: unknown): DiagramNode | null {
    if (!isRecord(value) || !isId(value.id) || !isNodeKind(value.kind) || !isCoordinate(value.x) || !isCoordinate(value.y)) return null;
    if (!isText(value.label) || !isText(value.designation)) return null;
    if (!isOptionalNumber(value.voltageKv) || !isOptionalNumber(value.ratingKva) || !isOptionalNumber(value.width)) return null;
    return {
        id: value.id,
        kind: value.kind,
        x: value.x,
        y: value.y,
        label: value.label,
        designation: value.designation,
        voltageKv: value.voltageKv,
        ratingKva: value.ratingKva,
        width: value.width,
    };
}

function readLink(value: unknown, version: 1 | 2): DiagramLink | null {
    if (!isRecord(value) || !isId(value.id) || !isId(value.from) || !isId(value.to)) return null;
    const link = { id: value.id, from: value.from, to: value.to };
    if (version === 1) return { ...link, route: null, straight: false };
    return isRoute(value.route) && typeof value.straight === "boolean" ? { ...link, route: value.route, straight: value.straight } : null;
}

/** null, or an odd count of coordinates (see Route). */
const isRoute = (value: unknown): value is number[] | null =>
    value === null || (Array.isArray(value) && value.length % 2 === 1 && value.length <= MAX_ROUTE && value.every(isCoordinate));

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.length <= MAX_TEXT;
const isId = (value: unknown): value is string => typeof value === "string" && /^[\w-]{1,64}$/.test(value);
const isCoordinate = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
const isOptionalNumber = (value: unknown): value is number | null => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
