import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { compose, type Affine } from "./drawing";
import { FRAME_SCALE, GREY, unmercator, type Polylines, type Scene } from "./scene";

interface Props {
    scene: Scene | null;
    satellite: boolean;
    /** Changing it fits the map to the drawing again. */
    fitKey: string;
    active: boolean;
    label: string;
    onMove: (centre: { lat: number; lon: number }) => void;
}

// Leaflet 1.9: a canvas redraw scheduled just before its layer or map is removed runs after the removal and throws
// ("reading 'clearRect'"); a removed renderer has no context, so its redraw is skipped
const canvas = L.Canvas.prototype as unknown as { _redraw(): void; _ctx?: CanvasRenderingContext2D };
const redraw = canvas._redraw;
canvas._redraw = function (this: typeof canvas) {
    if (this._ctx) redraw.call(this);
};

const TILES = {
    plain: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "© OpenStreetMap contributors", maxNativeZoom: 19 },
    satellite: {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
        maxNativeZoom: 18,
    },
};

const FILL_OPACITY = 0.2;
/** A placed block smaller than this, in pixels, is drawn as a dot of its size. */
const DOT_PX = 4;

function toPath(polylines: Polylines): Path2D {
    const path = new Path2D();
    const { coords, ends, closed } = polylines;
    let start = 0;
    ends.forEach((end, i) => {
        path.moveTo(coords[start * 2]!, coords[start * 2 + 1]!);
        for (let p = start + 1; p < end; p++) path.lineTo(coords[p * 2]!, coords[p * 2 + 1]!);
        if (closed[i]) path.closePath();
        start = end;
    });
    return path;
}

function quadsToPath(quads: number[]): Path2D {
    const path = new Path2D();
    for (let i = 0; i < quads.length; i += 8) {
        path.moveTo(quads[i]!, quads[i + 1]!);
        for (let p = 2; p < 8; p += 2) path.lineTo(quads[i + p]!, quads[i + p + 1]!);
        path.closePath();
    }
    return path;
}

interface Paths {
    lines: Path2D;
    fills: Path2D;
}

/** The scene's paths, made once per scene (canvas paths cannot be made outside a browser, so not in scene.ts). */
function scenePaths(scene: Scene) {
    const paint = (paint: { lines: Polylines; fills: Polylines } | undefined): Paths | undefined => paint && { lines: toPath(paint.lines), fills: toPath(paint.fills) };
    return {
        projected: new Map(scene.colors.map((color) => [color, paint(scene.projected.get(color))])),
        placed: scene.placed.map((block) => ({ block, paths: new Map(scene.colors.map((color) => [color, paint(block.paint.get(color))])), dotColor: block.paint.keys().next().value ?? GREY })),
        boxes: new Map(scene.colors.map((color) => [color, scene.boxes.has(color) ? quadsToPath(scene.boxes.get(color)!) : undefined])),
    };
}

/** A pixel image the size of the map's canvas, cleared for each drawing. */
interface Dots {
    canvas: HTMLCanvasElement;
    /** The image's pixels, one number each. */
    pixels: Uint32Array;
    image: ImageData;
    width: number;
    height: number;
}

function sizedDots(dots: Dots | undefined, width: number, height: number): Dots {
    if (dots && dots.width === width && dots.height === height) {
        dots.pixels.fill(0);
        return dots;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const buffer = new ArrayBuffer(width * height * 4);
    return { canvas, pixels: new Uint32Array(buffer), image: new ImageData(new Uint8ClampedArray(buffer), width, height), width, height };
}

const clamp = (value: number, size: number) => Math.max(0, Math.min(size - 1, value));

// "#rrggbb" as one opaque pixel (ImageData is red, green, blue, alpha in memory, read here as a little-endian number)
const packedColor = (color: string) => (0xff000000 | (parseInt(color.slice(5, 7), 16) << 16) | (parseInt(color.slice(3, 5), 16) << 8) | parseInt(color.slice(1, 3), 16)) >>> 0;

interface Internals {
    _map: L.Map;
    _renderer: { _ctx: CanvasRenderingContext2D; _drawing: boolean; _bounds: L.Bounds };
    _pxBounds?: L.Bounds | undefined;
}

/**
 * The scene as one Leaflet path on the map's canvas renderer, which places, pans and zooms the canvas; this layer only
 * draws, at the end of each move or zoom. Leaflet 1.9 internals: `_project`, `_update`, `_updatePath` and `_pxBounds`.
 */
const SceneLayer = L.Path.extend({
    options: { interactive: false },

    initialize(this: L.Path & { _scene: Scene; _paths: ReturnType<typeof scenePaths> }, scene: Scene) {
        this._scene = scene;
        this._paths = scenePaths(scene);
    },

    // Frame units to the renderer's layer pixels at the current zoom
    _toLayer(this: Internals & { _scene: Scene }): Affine {
        const zoom = 2 ** this._map.getZoom();
        const pixelOrigin = this._map.getPixelOrigin();
        const k = zoom / FRAME_SCALE;
        return [k, 0, 0, k, this._scene.origin[0] * zoom - pixelOrigin.x, this._scene.origin[1] * zoom - pixelOrigin.y];
    },

    _project(this: Internals & { _scene: Scene; _toLayer(): Affine }) {
        const bounds = this._scene.bounds;
        if (!bounds) return void (this._pxBounds = undefined);
        const [k, , , , x, y] = this._toLayer();
        this._pxBounds = L.bounds([bounds[0] * k + x, bounds[1] * k + y], [bounds[2] * k + x, bounds[3] * k + y]);
    },

    _update() {},

    _updatePath(this: Internals & { _scene: Scene; _paths: ReturnType<typeof scenePaths>; _toLayer(): Affine; _dots?: Dots }) {
        const renderer = this._renderer;
        if (!renderer._drawing) return;
        const ctx = renderer._ctx;
        const toLayer = this._toLayer();
        const [k, , , , ox, oy] = toLayer;
        const atLayer = new DOMMatrix([...toLayer]);
        const view = renderer._bounds;
        const [vx1, vy1, vx2, vy2] = [(view.min!.x - ox) / k, (view.min!.y - oy) / k, (view.max!.x - ox) / k, (view.max!.y - oy) / k];
        const visible = (box: readonly number[]) => box[2]! >= vx1 && box[0]! <= vx2 && box[3]! >= vy1 && box[1]! <= vy2;
        const tiny = (box: readonly number[]) => Math.max(box[2]! - box[0]!, box[3]! - box[1]!) * k < DOT_PX;

        // Blocks too small to show their shapes become dots of their size, written as pixels into one image: thousands
        // of tiny shapes cost a canvas far more than the rest of the drawing
        const dots = (this._dots = sizedDots(this._dots, ctx.canvas.width, ctx.canvas.height));
        const ratio = ctx.canvas.width / (view.max!.x - view.min!.x);
        let anyDot = false;
        for (const { block, dotColor } of this._paths.placed) {
            const color = packedColor(dotColor);
            for (const { box } of block.placements) {
                if (!visible(box) || !tiny(box)) continue;
                const x1 = clamp(Math.floor((box[0] * k + ox - view.min!.x) * ratio), dots.width);
                const x2 = clamp(Math.ceil((box[2] * k + ox - view.min!.x) * ratio), dots.width);
                const y1 = clamp(Math.floor((box[1] * k + oy - view.min!.y) * ratio), dots.height);
                const y2 = clamp(Math.ceil((box[3] * k + oy - view.min!.y) * ratio), dots.height);
                for (let y = y1; y <= y2; y++) dots.pixels.fill(color, y * dots.width + x1, y * dots.width + x2 + 1);
                anyDot = true;
            }
        }
        if (anyDot) {
            dots.canvas.getContext("2d")!.putImageData(dots.image, 0, 0);
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(dots.canvas, 0, 0);
            ctx.restore();
        }

        ctx.save();

        // The rest as one path per colour in layer pixels, stroked once, in lines one screen pixel wide: canvases draw
        // those on a fast path, about nine times faster than wider lines
        ctx.lineWidth = 1 / ctx.getTransform().a;
        for (const color of this._scene.colors) {
            const lines = new Path2D();
            const fills = new Path2D();
            const projected = this._paths.projected.get(color);
            if (projected) {
                lines.addPath(projected.lines, atLayer);
                fills.addPath(projected.fills, atLayer);
            }
            for (const { block, paths } of this._paths.placed) {
                const blockPaths = paths.get(color);
                if (!blockPaths) continue;
                for (const { transform, box } of block.placements) {
                    if (!visible(box) || tiny(box)) continue;
                    const at = new DOMMatrix([...compose(toLayer, transform)]);
                    lines.addPath(blockPaths.lines, at);
                    fills.addPath(blockPaths.fills, at);
                }
            }
            const boxes = this._paths.boxes.get(color);
            if (boxes) fills.addPath(boxes, atLayer);
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.stroke(lines);
            ctx.globalAlpha = FILL_OPACITY;
            ctx.fill(fills);
            ctx.globalAlpha = 1;
            ctx.stroke(fills);
        }
        ctx.restore();
    },

    _containsPoint: () => false,

    getBounds(this: { _scene: Scene }) {
        const bounds = this._scene.bounds;
        if (!bounds) return L.latLngBounds([]);
        const [x0, y0] = this._scene.origin;
        return L.latLngBounds([unmercator(x0 + bounds[0] / FRAME_SCALE, y0 + bounds[1] / FRAME_SCALE), unmercator(x0 + bounds[2] / FRAME_SCALE, y0 + bounds[3] / FRAME_SCALE)]);
    },
}) as unknown as new (scene: Scene) => L.Path & { getBounds(): L.LatLngBounds };

/** The drawing on a Leaflet map, over the plain map or satellite imagery. */
export function LayoutMap({ scene, satellite, fitKey, active, label, onMove }: Props) {
    const element = useRef<HTMLDivElement>(null);
    const map = useRef<L.Map | null>(null);
    const overlay = useRef<{ getBounds(): L.LatLngBounds } | null>(null);
    const moved = useRef(onMove);
    moved.current = onMove;

    useEffect(() => {
        const created = L.map(element.current!, { preferCanvas: true, worldCopyJump: true }).setView([20, 0], 2);
        const report = () => {
            const centre = created.getCenter();
            moved.current({ lat: centre.lat, lon: centre.lng });
        };
        created.on("moveend", report);
        map.current = created;
        return () => {
            created.remove();
            map.current = null;
        };
    }, []);

    useEffect(() => {
        const tiles = satellite ? TILES.satellite : TILES.plain;
        const layer = L.tileLayer(tiles.url, { attribution: tiles.attribution, maxZoom: 21, maxNativeZoom: tiles.maxNativeZoom, className: satellite ? "tiles-satellite" : "tiles-plain" });
        layer.addTo(map.current!);
        return () => void layer.remove();
    }, [satellite]);

    useEffect(() => {
        if (!scene) return;
        const layer = new SceneLayer(scene);
        layer.addTo(map.current!);
        overlay.current = layer;
        return () => {
            layer.remove();
            overlay.current = null;
        };
    }, [scene]);

    useEffect(() => {
        const bounds = overlay.current?.getBounds();
        if (bounds?.isValid()) map.current?.fitBounds(bounds, { padding: [24, 24], maxZoom: 19 });
    }, [fitKey]); // only a fit request refits; editing the rules or the rotation keeps the view

    useEffect(() => {
        if (active) map.current?.invalidateSize();
    }, [active]);

    return <div ref={element} className="map" role="region" aria-label={label} />;
}
