import proj4 from "proj4";

/**
 * Where a drawing lies on the earth:
 * - "point": the centre of the drawing at a latitude and longitude, turned by a rotation (a drawing in local coordinates);
 * - "crs": the drawing's coordinates are already in a projected coordinate system, given as a proj4 definition.
 */
export type Placement = { mode: "point"; lat: number; lon: number; rotationDeg: number } | { mode: "crs"; proj: string };

/** A projector turns drawing coordinates into [latitude, longitude]. */
export type Projector = (x: number, y: number) => [number, number];

const METRES_PER_DEGREE = 111_320;

export const utmProj = (zone: number, south: boolean) => `+proj=utm +zone=${zone}${south ? " +south" : ""} +datum=WGS84 +units=m +no_defs`;

/**
 * The projector of a placement; `centre` is the drawing's centre in drawing units. Null when the proj4 definition is
 * not valid. A point placement treats the drawing as flat, which is exact enough for a plant a few kilometres wide.
 */
export function createProjector(placement: Placement, centre: [number, number], metresPerUnit: number): Projector | null {
    if (placement.mode === "point") {
        const turn = (placement.rotationDeg * Math.PI) / 180;
        const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
        const lonScale = METRES_PER_DEGREE * Math.cos((placement.lat * Math.PI) / 180);
        return (x, y) => {
            const dx = (x - centre[0]) * metresPerUnit;
            const dy = (y - centre[1]) * metresPerUnit;
            return [placement.lat + (dx * sin + dy * cos) / METRES_PER_DEGREE, placement.lon + (dx * cos - dy * sin) / lonScale];
        };
    }
    try {
        const converter = proj4(placement.proj, "EPSG:4326");
        const probe = converter.forward([centre[0] * metresPerUnit, centre[1] * metresPerUnit]);
        if (!probe.every(Number.isFinite) || Math.abs(probe[1]!) > 90) return null;
        return (x, y) => {
            const [lon, lat] = converter.forward([x * metresPerUnit, y * metresPerUnit]);
            return [lat!, lon!];
        };
    } catch {
        return null;
    }
}
