import { METRES_PER_UNIT, type Box, type LengthUnit } from "./drawing";

/** A plant is at least this wide, in metres, and at most this (a long transmission line). */
const SMALLEST = 10;
const LARGEST = 300_000;
/** The units plant drawings are made in, most common first. */
const UNITS: readonly LengthUnit[] = ["m", "mm", "km", "cm", "ft", "in"];

/** The drawing's larger side in metres, in a unit. */
export const sizeOf = (bounds: Box, unit: LengthUnit) => Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1]) * METRES_PER_UNIT[unit];

/**
 * A unit that gives a plausible plant size when this one does not (a drawing labelled millimetres but drawn in
 * metres would be a plant one metre wide): the most common unit that does. Null when the unit looks right, or when no
 * unit helps.
 */
export function unitAdvice(bounds: Box, unit: LengthUnit): LengthUnit | null {
    const plausible = (u: LengthUnit) => sizeOf(bounds, u) >= SMALLEST && sizeOf(bounds, u) <= LARGEST;
    if (sizeOf(bounds, unit) === 0 || plausible(unit)) return null;
    return UNITS.find(plausible) ?? null;
}

/**
 * Whether the coordinates look projected (a UTM or other Transverse Mercator easting and northing, in metres) rather
 * than local to the drawing.
 */
export function looksProjected(bounds: Box, unit: LengthUnit): boolean {
    const metres = METRES_PER_UNIT[unit];
    const [x, y] = [((bounds[0] + bounds[2]) / 2) * metres, ((bounds[1] + bounds[3]) / 2) * metres];
    return x >= 100_000 && x <= 900_000 && Math.abs(y) >= 100_000 && Math.abs(y) <= 10_000_000;
}
