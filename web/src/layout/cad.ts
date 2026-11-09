import { parseDrawing, type Drawing } from "./drawing";

export const MAX_DRAWING_BYTES = 100 * 1024 * 1024;

export type CadError = "tooLarge" | "unsupported" | "unreadable" | "missing" | "cancelled";

export class CadReadError extends Error {
    constructor(readonly code: CadError) {
        super(code);
    }
}

// The reader needs many times a file's size in memory: about 70 times for a DWG (compressed), 15 for a DXF (text)
const MEMORY_PER_BYTE = { dwg: 70, dxf: 15 };

/**
 * Whether reading the file is likely to fit in this device: within a quarter of its memory (as the browser reports it,
 * else 4 GB). A worker shares the page's memory, so a drawing too large for the device can close the page; the app
 * asks before reading one.
 */
export function fitsDevice(file: Pick<File, "name" | "size">): boolean {
    const gigabytes = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
    return file.size * MEMORY_PER_BYTE[/\.dwg$/i.test(file.name) ? "dwg" : "dxf"] <= (gigabytes * 2 ** 30) / 4;
}

/**
 * Reads a DWG or DXF file in a worker of its own, ended afterwards (also when `signal` cancels the reading). The file
 * never leaves the browser.
 */
export async function readDrawing(file: File, signal?: AbortSignal): Promise<Drawing> {
    if (!/\.(dwg|dxf)$/i.test(file.name)) throw new CadReadError("unsupported");
    if (file.size > MAX_DRAWING_BYTES) throw new CadReadError("tooLarge");
    const bytes = await file.arrayBuffer();
    if (signal?.aborted) throw new CadReadError("cancelled");
    const worker = new Worker(new URL("./cad.worker.ts", import.meta.url), { type: "module" });
    let cancel = () => {};
    try {
        const reply = await new Promise<{ ok: true; json: string; points: ArrayBuffer } | { ok: false; error: CadError }>((resolve, reject) => {
            cancel = () => reject(new CadReadError("cancelled"));
            signal?.addEventListener("abort", cancel);
            worker.onmessage = (event) => resolve(event.data);
            worker.onerror = () => reject(new CadReadError("unreadable"));
            worker.postMessage(bytes, [bytes]);
        });
        if (!reply.ok) throw new CadReadError(reply.error);
        return parseDrawing(reply.json, reply.points);
    } finally {
        signal?.removeEventListener("abort", cancel);
        worker.terminate();
    }
}
