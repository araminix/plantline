import type { PlantType } from "../plants";
import { utmProj, type Placement } from "./place";

/**
 * A made-up drawing per plant type (public/samples, written by cad/Plantline.Cad.Samples) and where it lies: the plants
 * drawn in UTM coordinates on real ground, the storage site and substation in their own site coordinates beside the
 * transmission sample's northern substation (the substation turned so its lines arrive from the south, as the line does).
 */
export const SAMPLES: Record<PlantType, { file: string; placement: Placement }> = {
    solar: { file: "solar-plant.dwg", placement: { mode: "crs", proj: utmProj(36, false) } },
    wind: { file: "wind-farm.dxf", placement: { mode: "crs", proj: utmProj(36, false) } },
    storage: { file: "battery-storage.dxf", placement: { mode: "point", lat: 39.206, lon: 32.7771, rotationDeg: 0 } },
    hydro: { file: "hydro-plant.dxf", placement: { mode: "crs", proj: utmProj(37, false) } },
    substation: { file: "substation.dxf", placement: { mode: "point", lat: 39.2055, lon: 32.7696, rotationDeg: 180 } },
    transmission: { file: "transmission-line.dxf", placement: { mode: "crs", proj: utmProj(36, false) } },
};

export async function fetchSample(plant: PlantType): Promise<File> {
    const { file } = SAMPLES[plant];
    const response = await fetch(`${import.meta.env.BASE_URL}samples/${file}`);
    if (!response.ok) throw new Error(`Sample ${file}: ${response.status}`);
    return new File([await response.blob()], file);
}
