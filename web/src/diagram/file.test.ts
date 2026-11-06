import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, parseDiagram, serializeDiagram } from "./file";
import { addNode, connect, emptyDiagram } from "./model";

const sample = () => {
    const a = addNode(emptyDiagram("hydro", "Unit 1"), "generator", 0, 0);
    const b = addNode(a.diagram, "transformer", 0, 120);
    return connect(b.diagram, a.id, b.id)!;
};

const withDiagram = (patch: (diagram: Record<string, unknown>) => void) => {
    const file = JSON.parse(serializeDiagram(sample()));
    patch(file.diagram);
    return JSON.stringify(file);
};

describe("diagram files", () => {
    it("read back exactly what was saved", () => {
        const diagram = sample();
        expect(parseDiagram(serializeDiagram(diagram))).toEqual({ ok: true, diagram });
    });

    it("refuse what is not a plantline diagram", () => {
        for (const text of ["", "null", "[]", "{", JSON.stringify({ format: "other", version: 1, diagram: sample() }), JSON.stringify({ format: "plantline", version: 2, diagram: sample() })]) {
            expect(parseDiagram(text)).toEqual({ ok: false, error: "invalid" });
        }
    });

    it("refuse inconsistent or hostile content", () => {
        const cases = [
            withDiagram((d) => (d.plantType = "nuclear")),
            withDiagram((d) => ((d.nodes as Record<string, unknown>[])[0]!.kind = "<script>")),
            withDiagram((d) => ((d.nodes as Record<string, unknown>[])[0]!.x = 1e12)),
            withDiagram((d) => ((d.nodes as Record<string, unknown>[])[0]!.label = "x".repeat(201))),
            withDiagram((d) => ((d.nodes as Record<string, unknown>[])[1]!.id = (d.nodes as Record<string, unknown>[])[0]!.id)),
            withDiagram((d) => ((d.links as Record<string, unknown>[])[0]!.to = "missing")),
            withDiagram((d) => ((d.nodes as Record<string, unknown>[])[0]!.voltageKv = -1)),
            withDiagram((d) => (d.nodes = Array.from({ length: 5001 }, (_, i) => ({ ...(d.nodes as object[])[0], id: `n${i}` })))),
        ];
        for (const text of cases) expect(parseDiagram(text)).toEqual({ ok: false, error: "invalid" });
    });

    it("refuse a file over the size limit before parsing it", () => {
        expect(parseDiagram(" ".repeat(MAX_FILE_BYTES + 1))).toEqual({ ok: false, error: "tooLarge" });
    });
});
