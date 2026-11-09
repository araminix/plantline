import { parseDrawing, type Drawing } from "./drawing";

export const MAX_DRAWING_BYTES = 100 * 1024 * 1024;
const TIMEOUT_MS = 120_000;

export type CadError = "tooLarge" | "unsupported" | "unreadable" | "missing" | "timeout";

export class CadReadError extends Error {
    constructor(readonly code: CadError) {
        super(code);
    }
}

/**
 * Reads a DWG or DXF file in a worker of its own, which is ended afterwards: a drawing that crashes or hangs the
 * reader takes only the worker down, never the page. The file never leaves the browser.
 */
export async function readDrawing(file: File): Promise<Drawing> {
    if (!/\.(dwg|dxf)$/i.test(file.name)) throw new CadReadError("unsupported");
    if (file.size > MAX_DRAWING_BYTES) throw new CadReadError("tooLarge");
    const bytes = await file.arrayBuffer();
    const worker = new Worker(new URL("./cad.worker.ts", import.meta.url), { type: "module" });
    try {
        const reply = await new Promise<{ ok: true; json: string; points: ArrayBuffer } | { ok: false; error: CadError }>((resolve, reject) => {
            const timer = setTimeout(() => reject(new CadReadError("timeout")), TIMEOUT_MS);
            worker.onmessage = (event) => {
                clearTimeout(timer);
                resolve(event.data);
            };
            worker.onerror = () => {
                clearTimeout(timer);
                reject(new CadReadError("unreadable"));
            };
            worker.postMessage(bytes, [bytes]);
        });
        if (!reply.ok) throw new CadReadError(reply.error);
        return parseDrawing(reply.json, reply.points);
    } finally {
        worker.terminate();
    }
}
