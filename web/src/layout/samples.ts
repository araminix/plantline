import type { PlantType } from "../plants";
import { utmProj, type Placement } from "./place";

/** A made-up drawing per plant type (public/samples, written by cad/Plantline.Cad.Samples) and where it lies. */
export const SAMPLES: Record<PlantType, { file: string; placement: Placement }> = {
    solar: { file: "solar-plant.dwg", placement: { mode: "crs", proj: utmProj(36, false) } },
    wind: { file: "wind-farm.dxf", placement: { mode: "point", lat: 38.62, lon: 27.18, rotationDeg: 0 } },
    storage: { file: "battery-storage.dxf", placement: { mode: "point", lat: 37.05, lon: 35.32, rotationDeg: 0 } },
    hydro: { file: "hydro-plant.dxf", placement: { mode: "point", lat: 40.91, lon: 38.92, rotationDeg: 0 } },
    substation: { file: "substation.dxf", placement: { mode: "point", lat: 39.93, lon: 32.85, rotationDeg: 0 } },
    transmission: { file: "transmission-line.dxf", placement: { mode: "point", lat: 38.42, lon: 27.14, rotationDeg: 20 } },
};

export async function fetchSample(plant: PlantType): Promise<File> {
    const { file } = SAMPLES[plant];
    const response = await fetch(`${import.meta.env.BASE_URL}samples/${file}`);
    if (!response.ok) throw new Error(`Sample ${file}: ${response.status}`);
    return new File([await response.blob()], file);
}
