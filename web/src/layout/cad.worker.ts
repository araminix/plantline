/// <reference lib="webworker" />
// Reads one drawing with the .NET CAD reader (public/cad, built by `pnpm cad`). The runtime starts when the worker
// does, and the worker listens with addEventListener: the .NET runtime uses `onmessage` itself, and replacing it, or
// starting the runtime inside a message handler, leaves it starting forever. The app ends the worker after one file.

interface CadExports {
    CadExports: { ReadDrawing(bytes: Uint8Array): string };
}

const runtimeUrl = new URL(`${import.meta.env.BASE_URL}cad/_framework/dotnet.js`, self.location.origin).href;

const exports: Promise<CadExports> = import(/* @vite-ignore */ runtimeUrl).then(async ({ dotnet }) => {
    const runtime = await dotnet.create();
    return runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName);
});

self.addEventListener("message", async (event: MessageEvent<ArrayBuffer>) => {
    try {
        const reader = await exports.catch(() => {
            throw new Error("missing");
        });
        self.postMessage({ ok: true, json: reader.CadExports.ReadDrawing(new Uint8Array(event.data)) });
    } catch (error) {
        self.postMessage({ ok: false, error: error instanceof Error && error.message === "missing" ? "missing" : "unreadable" });
    }
});
