import type { PlantType } from "../plants";
import { utmProj, type Placement } from "./place";

/**
 * A made-up drawing per plant type (public/samples, written by cad/Plantline.Cad.Samples) and where it lies: the plants
 * drawn in UTM coordinates on real ground, the storage site and substation in their own site coordinates beside the
 * transmission sample's northern substation (the substation turned so its lines arrive from the south, as the line does).
 */
/** What each sample holds, for its card: a figure, and a count of its main objects (a message and the number). */
export interface SampleFacts {
    figure: string;
    count?: { key: "layout.sampleTables" | "layout.sampleTurbines" | "layout.sampleContainers" | "layout.sampleUnits" | "layout.sampleTowers"; value: number };
}

export const SAMPLES: Record<PlantType, { file: string; placement: Placement; facts: SampleFacts }> = {
    solar: { file: "solar-plant.dwg", placement: { mode: "crs", proj: utmProj(36, false) }, facts: { figure: "10 MWp", count: { key: "layout.sampleTables", value: 316 } } },
    wind: { file: "wind-farm.dxf", placement: { mode: "crs", proj: utmProj(36, false) }, facts: { figure: "45 MW", count: { key: "layout.sampleTurbines", value: 10 } } },
    storage: { file: "battery-storage.dxf", placement: { mode: "point", lat: 39.206, lon: 32.7771, rotationDeg: 0 }, facts: { figure: "50 MW / 100 MWh", count: { key: "layout.sampleContainers", value: 24 } } },
    hydro: { file: "hydro-plant.dxf", placement: { mode: "crs", proj: utmProj(37, false) }, facts: { figure: "13 MW", count: { key: "layout.sampleUnits", value: 3 } } },
    substation: { file: "substation.dxf", placement: { mode: "point", lat: 39.2055, lon: 32.7696, rotationDeg: 180 }, facts: { figure: "154/33 kV · 2 × 100 MVA" } },
    transmission: { file: "transmission-line.dxf", placement: { mode: "crs", proj: utmProj(36, false) }, facts: { figure: "154 kV", count: { key: "layout.sampleTowers", value: 38 } } },
};

export async function fetchSample(plant: PlantType): Promise<File> {
    const { file } = SAMPLES[plant];
    const response = await fetch(`${import.meta.env.BASE_URL}samples/${file}`);
    if (!response.ok) throw new Error(`Sample ${file}: ${response.status}`);
    return new File([await response.blob()], file);
}
