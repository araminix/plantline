import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { apply, compose, invert, transformedBox, type Affine } from "./drawing";
import type { Placement } from "./place";
import { FRAME_SCALE, GREY, unmercator, type Polylines, type Scene } from "./scene";

interface Props {
    scene: Scene | null;
    /** In a point placement, handles move and turn the drawing; each drag ends in one call of `onPlace`. */
    placement: Placement;
    onPlace: (placement: Placement) => void;
    moveLabel: string;
    turnLabel: string;
    satellite: boolean;
    /** Changing it fits the map to the drawing again. */
    fitKey: string;
    active: boolean;
    label: string;
    onMove: (centre: { lat: number; lon: number }) => void;
    /** While true, a click on the map tells where the drawing lies. */
    picking: boolean;
    onPick: (at: { lat: number; lon: number }) => void;
    /** The counted objects' extents, described on hover (a tooltip) and on a click or tap (a popup). */
    targets: Target[];
    describe: (index: number) => HTMLElement;
    /** Changing it shows that object: the map fits it and opens its popup. */
    focus: { index: number; nonce: number } | null;
}

/** Where a counted object lies: its index and extent in latitude and longitude. */
export interface Target {
    index: number;
    south: number;
    west: number;
    north: number;
    east: number;
}

/** The smallest target under a point (an inverter over the table it stands on), or null. */
export function targetAt(targets: readonly Target[], lat: number, lon: number): Target | null {
    let best: Target | null = null;
    let area = Infinity;
    for (const target of targets) {
        if (lat < target.south || lat > target.north || lon < target.west || lon > target.east) continue;
        const size = (target.north - target.south) * (target.east - target.west);
        if (size < area) [best, area] = [target, size];
    }
    return best;
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
/** The turning handle's distance from the drawing's centre, in pixels. */
const TURN_PX = 72;
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

    // Frame units to layer pixels as shown: through the preview of a drag in progress
    _shown(this: { _preview?: Affine | null; _toLayer(): Affine }): Affine {
        return this._preview ? compose(this._preview, this._toLayer()) : this._toLayer();
    },

    _project(this: Internals & { _scene: Scene; _shown(): Affine }) {
        const bounds = this._scene.bounds;
        if (!bounds) return void (this._pxBounds = undefined);
        const [x1, y1, x2, y2] = transformedBox(this._shown(), bounds);
        this._pxBounds = L.bounds([x1, y1], [x2, y2]);
    },

    /** Shows the drawing moved or turned by `delta` (in layer pixels) without projecting it again; null ends it. */
    preview(this: L.Path & { _preview?: Affine | null }, delta: Affine | null) {
        this._preview = delta;
        this.redraw();
    },

    _update() {},

    _updatePath(this: Internals & { _scene: Scene; _paths: ReturnType<typeof scenePaths>; _shown(): Affine; _dots?: Dots }) {
        const renderer = this._renderer;
        if (!renderer._drawing) return;
        const ctx = renderer._ctx;
        const toLayer = this._shown();
        const k = Math.sqrt(Math.abs(toLayer[0] * toLayer[3] - toLayer[1] * toLayer[2]));
        const atLayer = new DOMMatrix([...toLayer]);
        const view = renderer._bounds;
        // The view in frame units, to skip what is out of it
        const [vx1, vy1, vx2, vy2] = transformedBox(invert(toLayer), [view.min!.x, view.min!.y, view.max!.x, view.max!.y]);
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
                const [cx, cy] = apply(toLayer, (box[0] + box[2]) / 2, (box[1] + box[3]) / 2);
                const [rx, ry] = [((box[2] - box[0]) * k) / 2, ((box[3] - box[1]) * k) / 2];
                const x1 = clamp(Math.floor((cx - rx - view.min!.x) * ratio), dots.width);
                const x2 = clamp(Math.ceil((cx + rx - view.min!.x) * ratio), dots.width);
                const y1 = clamp(Math.floor((cy - ry - view.min!.y) * ratio), dots.height);
                const y2 = clamp(Math.ceil((cy + ry - view.min!.y) * ratio), dots.height);
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
}) as unknown as new (scene: Scene) => L.Path & { getBounds(): L.LatLngBounds; preview(delta: Affine | null): void };

// Lucide's "move" and "rotate-ccw" icons (ISC licence), as markup for Leaflet's handles
const icon = (paths: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const MOVE_ICON = icon('<path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/>');
const TURN_ICON = icon('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>');

/** A turn of `radians` counter-clockwise on screen (y down) about a point. */
function turnAbout(x: number, y: number, radians: number): Affine {
    const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
    return [cos, -sin, sin, cos, x - cos * x - sin * y, y + sin * x - cos * y];
}

/** The drawing on a Leaflet map, over the plain map or satellite imagery. */
export function LayoutMap({ scene, placement, onPlace, moveLabel, turnLabel, satellite, fitKey, active, label, onMove, picking, onPick, targets, describe, focus }: Props) {
    const element = useRef<HTMLDivElement>(null);
    const map = useRef<L.Map | null>(null);
    const overlay = useRef<InstanceType<typeof SceneLayer> | null>(null);
    const moved = useRef(onMove);
    moved.current = onMove;
    const placed = useRef(onPlace);
    placed.current = onPlace;
    const picked = useRef(onPick);
    picked.current = onPick;
    const described = useRef(describe);
    described.current = describe;
    // One popup for the map: a new object's replaces the last one's
    const popup = useRef(L.popup({ className: "object-popup" }));

    useEffect(() => {
        const created = L.map(element.current!, { preferCanvas: true, worldCopyJump: true }).setView([20, 0], 2);
        L.control.scale({ imperial: false, position: "bottomright" }).addTo(created);
        const report = () => {
            const centre = created.getCenter();
            moved.current({ lat: centre.lat, lon: centre.lng });
        };
        created.on("moveend", report);
        map.current = created;
        // The map's box can change while the window does not (the layout around it): Leaflet must know, or its middle drifts
        const resized = new ResizeObserver(() => created.invalidateSize());
        resized.observe(element.current!);
        return () => {
            resized.disconnect();
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

    // Handles: one at the centre moves the drawing, one above it turns it; while dragging, the drawing is only redrawn
    useEffect(() => {
        const created = map.current!;
        const layer = overlay.current;
        if (!layer || placement.mode !== "point") return;
        const centre = L.latLng(placement.lat, placement.lon);
        const turn = (placement.rotationDeg * Math.PI) / 180;
        const handle = (kind: string, title: string, html: string, at: L.LatLng) =>
            L.marker(at, { icon: L.divIcon({ className: `map-handle ${kind}`, html, iconSize: [36, 36] }), draggable: true, keyboard: false, title, autoPan: true }).addTo(created);
        const turnerAt = () => {
            const p = created.latLngToLayerPoint(centre);
            return created.layerPointToLatLng([p.x - Math.sin(turn) * TURN_PX, p.y - Math.cos(turn) * TURN_PX]);
        };
        const mover = handle("move", moveLabel, MOVE_ICON, centre);
        const turner = handle("turn", turnLabel, TURN_ICON, turnerAt());
        const keepTurner = () => turner.setLatLng(turnerAt());
        created.on("zoomend", keepTurner);

        mover.on("dragstart", () => turner.setOpacity(0));
        mover.on("drag", () => {
            const [from, to] = [created.latLngToLayerPoint(centre), created.latLngToLayerPoint(mover.getLatLng())];
            layer.preview([1, 0, 0, 1, to.x - from.x, to.y - from.y]);
        });
        mover.on("dragend", () => {
            const { lat, lng } = mover.getLatLng();
            placed.current({ ...placement, lat: Math.max(-85, Math.min(85, lat)), lon: ((((lng + 180) % 360) + 360) % 360) - 180 });
        });

        // The handle's direction from the centre is the drawing's rotation: straight up is 0°, counter-clockwise positive
        const rotationAt = () => {
            const [c, p] = [created.latLngToLayerPoint(centre), created.latLngToLayerPoint(turner.getLatLng())];
            const degrees = (Math.atan2(c.y - p.y, p.x - c.x) * 180) / Math.PI - 90;
            return Math.round((((((degrees + 180) % 360) + 360) % 360) - 180) * 2) / 2;
        };
        turner.on("dragstart", () => mover.setOpacity(0));
        turner.on("drag", () => {
            const c = created.latLngToLayerPoint(centre);
            layer.preview(turnAbout(c.x, c.y, ((rotationAt() - placement.rotationDeg) * Math.PI) / 180));
        });
        turner.on("dragend", () => placed.current({ ...placement, rotationDeg: rotationAt() }));

        return () => {
            created.off("zoomend", keepTurner);
            mover.remove();
            turner.remove();
        };
    }, [scene, placement, moveLabel, turnLabel]);

    // A tooltip follows the pointer over a counted object; a click or tap opens its popup
    useEffect(() => {
        const created = map.current!;
        if (picking || targets.length === 0) return;
        const tooltip = L.tooltip({ direction: "top", offset: [0, -8], className: "object-tooltip" });
        // A scan of the extents is quick enough for every move (tens of thousands of objects)
        let shown: Target | null = null;
        const hover = (event: L.LeafletMouseEvent) => {
            const target = targetAt(targets, event.latlng.lat, event.latlng.wrap().lng);
            if (!target) return leave();
            if (target !== shown) tooltip.setContent(described.current(target.index));
            tooltip.setLatLng(event.latlng);
            if (!shown) tooltip.addTo(created);
            shown = target;
        };
        const leave = () => {
            shown = null;
            tooltip.remove();
        };
        const open = (event: L.LeafletMouseEvent) => {
            const target = targetAt(targets, event.latlng.lat, event.latlng.wrap().lng);
            if (!target) return;
            tooltip.remove();
            popup.current.setLatLng(event.latlng).setContent(described.current(target.index)).openOn(created);
        };
        created.on("mousemove", hover);
        created.on("mouseout", leave);
        created.on("click", open);
        return () => {
            leave();
            created.off("mousemove", hover);
            created.off("mouseout", leave);
            created.off("click", open);
        };
    }, [targets, picking]);

    useEffect(() => {
        const created = map.current!;
        const target = focus && targets.find((candidate) => candidate.index === focus.index);
        if (!target) return;
        const bounds = L.latLngBounds([target.south, target.west], [target.north, target.east]);
        created.fitBounds(bounds, { padding: [80, 80], maxZoom: 20, animate: false });
        popup.current.setLatLng(bounds.getCenter()).setContent(described.current(target.index)).openOn(created);
    }, [focus]); // a new request (its nonce) shows the object; new targets alone do not move the map

    useEffect(() => {
        if (!picking) return;
        const created = map.current!;
        const pick = (event: L.LeafletMouseEvent) => picked.current({ lat: event.latlng.lat, lon: event.latlng.wrap().lng });
        created.getContainer().classList.add("picking");
        created.on("click", pick);
        return () => {
            created.getContainer().classList.remove("picking");
            created.off("click", pick);
        };
    }, [picking]);

    useEffect(() => {
        const bounds = overlay.current?.getBounds();
        if (bounds?.isValid()) map.current?.fitBounds(bounds, { padding: [24, 24], maxZoom: 19 });
    }, [fitKey]); // only a fit request refits; editing the rules or the rotation keeps the view

    useEffect(() => {
        if (active) map.current?.invalidateSize();
    }, [active]);

    return <div ref={element} className="map" role="region" aria-label={label} />;
}
