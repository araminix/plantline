import { describe, expect, it } from "vitest";
import { PALETTES, PLANT_TYPES } from "../plants";
import { checkDiagram } from "./checks";
import { exampleDiagram } from "./examples";
import { serializeDiagram, parseDiagram } from "./file";

describe("examples", () => {
    it("give every plant type a connected diagram of its own elements, with no problems to check", () => {
        for (const plant of PLANT_TYPES) {
            const diagram = exampleDiagram(plant, "Example");
            expect(diagram.plantType).toBe(plant);
            expect(diagram.nodes.length, plant).toBeGreaterThanOrEqual(6);
            expect(diagram.links.length, plant).toBe(diagram.nodes.length - 1);
            expect(diagram.nodes.every((node) => PALETTES[plant].includes(node.kind)), plant).toBe(true);
            expect(checkDiagram(diagram), plant).toEqual([]);
        }
    });

    it("are laid out without elements on top of each other, and save and open again unchanged", () => {
        for (const plant of PLANT_TYPES) {
            const diagram = exampleDiagram(plant, "Example");
            const places = new Set(diagram.nodes.map((node) => `${node.x},${node.y}`));
            expect(places.size, plant).toBe(diagram.nodes.length);
            const reopened = parseDiagram(serializeDiagram(diagram));
            expect(reopened.ok && reopened.diagram, plant).toEqual(diagram);
        }
    });
});
