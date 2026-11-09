/// <reference lib="webworker" />
// Reads one drawing with the .NET CAD reader (public/cad, built by `pnpm cad`). The runtime starts when the worker
// does, and the worker listens with addEventListener: the .NET runtime uses `onmessage` itself, and replacing it, or
// starting the runtime inside a message handler, leaves it starting forever. The app ends the worker after one file.

interface CadExports {
    CadExports: { ReadDrawing(bytes: Uint8Array): string; TakePoints(): Uint8Array };
}

// A runtime file that fails to download leaves dotnet.create() waiting for ever: its errors only arrive here. The
// runtime retries downloads, so the start counts as failed when it has not recovered 5 s after the first error.
const STARTUP_GRACE_MS = 5000;
const failed = new Promise<never>((_resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = () => (timer ??= setTimeout(() => reject(new Error("missing")), STARTUP_GRACE_MS));
    self.addEventListener("unhandledrejection", fail);
    self.addEventListener("error", fail);
});

const runtimeUrl = new URL(`${import.meta.env.BASE_URL}cad/_framework/dotnet.js`, self.location.origin).href;

const exports: Promise<CadExports> = Promise.race([
    import(/* @vite-ignore */ runtimeUrl).then(async ({ dotnet }) => {
        const runtime = await dotnet.create();
        return runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName);
    }),
    failed,
]);

self.addEventListener("message", async (event: MessageEvent<ArrayBuffer>) => {
    let reader: CadExports;
    try {
        reader = await exports;
    } catch {
        return self.postMessage({ ok: false, error: "missing" });
    }
    try {
        const json = reader.CadExports.ReadDrawing(new Uint8Array(event.data));
        // The points are handed over, not copied: they are most of the drawing
        const taken = reader.CadExports.TakePoints();
        const points = taken.byteOffset === 0 && taken.byteLength === taken.buffer.byteLength ? (taken.buffer as ArrayBuffer) : taken.slice().buffer;
        self.postMessage({ ok: true, json, points }, [points]);
    } catch {
        self.postMessage({ ok: false, error: "unreadable" });
    }
});
