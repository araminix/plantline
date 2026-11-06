import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

export type LatLng = [number, number];

/** Lines and polygons drawn in one colour (one map layer each, so a large drawing stays fast). */
export interface MapGroup {
    color: string;
    lines: LatLng[][];
    polygons: LatLng[][];
}

interface Props {
    groups: MapGroup[];
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

/** The drawing on a Leaflet map, over the plain map or satellite imagery. */
export function LayoutMap({ groups, satellite, fitKey, active, label, onMove }: Props) {
    const element = useRef<HTMLDivElement>(null);
    const map = useRef<L.Map | null>(null);
    const overlay = useRef<L.LayerGroup | null>(null);
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
        const layer = L.layerGroup();
        for (const group of groups) {
            if (group.lines.length > 0) L.polyline(group.lines, { color: group.color, weight: 1.5, interactive: false }).addTo(layer);
            if (group.polygons.length > 0) L.polygon(group.polygons, { color: group.color, weight: 1.5, fillOpacity: 0.2, interactive: false }).addTo(layer);
        }
        layer.addTo(map.current!);
        overlay.current = layer;
        return () => void layer.remove();
    }, [groups]);

    useEffect(() => {
        const bounds = overlay.current && L.featureGroup(overlay.current.getLayers()).getBounds();
        if (bounds?.isValid()) map.current?.fitBounds(bounds, { padding: [24, 24], maxZoom: 19 });
    }, [fitKey]); // only a fit request refits; editing the rules or the rotation keeps the view

    useEffect(() => {
        if (active) map.current?.invalidateSize();
    }, [active]);

    return <div ref={element} className="map" role="region" aria-label={label} />;
}
