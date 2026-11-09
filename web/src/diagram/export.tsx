import type { ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { contentBounds, DiagramContent, type Wording } from "./DiagramContent";
import type { Diagram } from "./model";

const PADDING = 32;

/** The whole diagram as a standalone drawing: black on white, sized to its content. */
export function DiagramSheet({ diagram, wording }: { diagram: Diagram; wording: Wording }) {
    const [minX, minY, maxX, maxY] = contentBounds(diagram) ?? [0, 0, 320, 160];
    const [x, y, width, height] = [minX - PADDING, minY - PADDING, maxX - minX + 2 * PADDING, maxY - minY + 2 * PADDING];
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${x} ${y} ${width} ${height}`} width={width} height={height} color="#111827" fontFamily="system-ui, sans-serif">
            <rect x={x} y={y} width={width} height={height} fill="#ffffff" />
            <DiagramContent diagram={diagram} wording={wording} />
        </svg>
    );
}

/** The SVG markup of an element, rendered outside the page. */
export function renderMarkup(element: ReactElement): string {
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(element));
    const markup = container.innerHTML;
    root.unmount();
    return markup;
}

export const diagramSvg = (diagram: Diagram, wording: Wording) => `<?xml version="1.0" encoding="UTF-8"?>\n${renderMarkup(<DiagramSheet diagram={diagram} wording={wording} />)}\n`;

/** The SVG drawn on a canvas at twice its size, as a PNG. */
export async function svgToPng(svg: string): Promise<Blob> {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth * 2;
        canvas.height = image.naturalHeight * 2;
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
        return await new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed"))), "image/png"));
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** Saves text or a blob as a file through the browser's download. */
export function download(fileName: string, data: string | Blob, type = "application/octet-stream") {
    const url = URL.createObjectURL(typeof data === "string" ? new Blob([data], { type }) : data);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A file name from a title: letters, digits and dashes only. */
export const fileNameOf = (title: string, fallback: string) =>
    title
        .trim()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || fallback;
