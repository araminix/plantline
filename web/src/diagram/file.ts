import { isNodeKind, isPlantType } from "../plants";
import type { Diagram, DiagramLink, DiagramNode, DiagramNote, Point, Rotation } from "./model";
import { fieldsOf, lineFieldsOf, readProperties, upgradeProperties, type Properties } from "./properties";

/** A saved diagram (a .plantline.json file). The format is described in docs/architecture.md. */
export interface DiagramFile {
    format: "plantline";
    /**
     * 2 added line routes, turned, mirrored and relabelled elements, and notes; 3 replaced each element's voltage and
     * rating with the properties of its kind and gave lines properties. Versions 1 and 2 are still read.
     */
    version: 3;
    diagram: Diagram;
}

export const FILE_EXTENSION = ".plantline.json";
export const MAX_FILE_BYTES = 5_000_000;
const MAX_NODES = 5_000;
const MAX_LINKS = 10_000;
const MAX_TEXT = 200;
const MAX_COORDINATE = 1_000_000;
const MAX_ROUTE = 63;
const MAX_NOTES = 1_000;
const MAX_NOTE_TEXT = 1_000;
const MAX_SIZE = 100_000;

export type ParseResult = { ok: true; diagram: Diagram } | { ok: false; error: "tooLarge" | "invalid" };

export const serializeDiagram = (diagram: Diagram): string => JSON.stringify({ format: "plantline", version: 3, diagram } satisfies DiagramFile, null, 2);

type Version = 1 | 2 | 3;

/** Reads a diagram file. The file is untrusted: anything unexpected, oversized or inconsistent is refused. */
export function parseDiagram(text: string): ParseResult {
    if (text.length > MAX_FILE_BYTES) return { ok: false, error: "tooLarge" };
    let file: unknown;
    try {
        file = JSON.parse(text);
    } catch {
        return { ok: false, error: "invalid" };
    }
    const diagram = isRecord(file) && file.format === "plantline" && (file.version === 1 || file.version === 2 || file.version === 3) ? readDiagram(file.diagram, file.version) : null;
    return diagram ? { ok: true, diagram } : { ok: false, error: "invalid" };
}

function readDiagram(value: unknown, version: Version): Diagram | null {
    if (!isRecord(value) || !isPlantType(value.plantType) || !isText(value.name)) return null;
    if (!Array.isArray(value.nodes) || !Array.isArray(value.links) || value.nodes.length > MAX_NODES || value.links.length > MAX_LINKS) return null;

    const nodes = value.nodes.map((node) => readNode(node, version));
    const ids = new Set(nodes.map((node) => node?.id));
    if (nodes.some((node) => node === null) || ids.size !== nodes.length) return null;

    const links = value.links.map((link) => readLink(link, version));
    if (links.some((link) => link === null || !ids.has(link.from) || !ids.has(link.to) || link.from === link.to)) return null;

    const notes = version === 1 ? [] : Array.isArray(value.notes) && value.notes.length <= MAX_NOTES ? value.notes.map(readNote) : [null];
    const all = [...ids, ...links.map((link) => link!.id), ...notes.map((note) => note?.id)];
    if (notes.some((note) => note === null) || new Set(all).size !== all.length) return null;

    return { plantType: value.plantType, name: value.name, nodes: nodes as DiagramNode[], links: links as DiagramLink[], notes: notes as DiagramNote[] };
}

function readNode(value: unknown, version: Version): DiagramNode | null {
    if (!isRecord(value) || !isId(value.id) || !isNodeKind(value.kind) || !isCoordinate(value.x) || !isCoordinate(value.y)) return null;
    if (!isText(value.label) || !isText(value.designation) || !isOptionalNumber(value.width)) return null;
    // Before version 3 an element had only a voltage and a rating
    let props: Properties | null;
    if (version < 3) props = isOptionalNumber(value.voltageKv) && isOptionalNumber(value.ratingKva) ? upgradeProperties(value.kind, value.voltageKv, value.ratingKva) : null;
    else props = readProperties(value.props, fieldsOf(value.kind));
    if (!props) return null;
    const placed = version === 1 ? { rotation: 0, flip: false, labelAt: null } : value;
    if (!isRotation(placed.rotation) || typeof placed.flip !== "boolean" || !(placed.labelAt === null || isOffset(placed.labelAt))) return null;
    return {
        id: value.id,
        kind: value.kind,
        x: value.x,
        y: value.y,
        label: value.label,
        designation: value.designation,
        props,
        width: value.width,
        rotation: placed.rotation,
        flip: placed.flip,
        labelAt: placed.labelAt === null ? null : { x: placed.labelAt.x, y: placed.labelAt.y },
    };
}

const isRotation = (value: unknown): value is Rotation => value === 0 || value === 90 || value === 180 || value === 270;
const MAX_OFFSET = 1_000;
const isOffset = (value: unknown): value is Point => isRecord(value) && [value.x, value.y].every((v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_OFFSET);

function readLink(value: unknown, version: Version): DiagramLink | null {
    if (!isRecord(value) || !isId(value.id) || !isId(value.from) || !isId(value.to)) return null;
    const link = { id: value.id, from: value.from, to: value.to };
    if (version === 1) return { ...link, route: null, straight: false, props: {} };
    const props = version === 2 ? {} : readProperties(value.props, lineFieldsOf());
    return isRoute(value.route) && typeof value.straight === "boolean" && props ? { ...link, route: value.route, straight: value.straight, props } : null;
}

function readNote(value: unknown): DiagramNote | null {
    if (!isRecord(value) || !isId(value.id) || (value.kind !== "text" && value.kind !== "area") || !isCoordinate(value.x) || !isCoordinate(value.y)) return null;
    const isSize = (size: unknown): size is number => typeof size === "number" && Number.isFinite(size) && size >= 0 && size <= MAX_SIZE;
    if (!isSize(value.width) || !isSize(value.height) || typeof value.text !== "string" || value.text.length > MAX_NOTE_TEXT) return null;
    return { id: value.id, kind: value.kind, x: value.x, y: value.y, width: value.width, height: value.height, text: value.text };
}

/** null, or an odd count of coordinates (see Route). */
const isRoute = (value: unknown): value is number[] | null =>
    value === null || (Array.isArray(value) && value.length % 2 === 1 && value.length <= MAX_ROUTE && value.every(isCoordinate));

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.length <= MAX_TEXT;
const isId = (value: unknown): value is string => typeof value === "string" && /^[\w-]{1,64}$/.test(value);
const isCoordinate = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
const isOptionalNumber = (value: unknown): value is number | null => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
