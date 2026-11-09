import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, parseDiagram, serializeDiagram } from "./file";
import { addNode, addNote, connect, emptyDiagram, updateLink, updateNode } from "./model";

const sample = () => {
    const a = addNode(emptyDiagram("hydro", "Unit 1"), "generator", 0, 0);
    const b = addNode(a.diagram, "transformer", 0, 120);
    const c = addNode(b.diagram, "breaker", 200, 240);
    const linked = connect(connect(c.diagram, a.id, b.id)!, b.id, c.id)!;
    const shaped = updateNode(updateLink(linked, linked.links[1]!.id, { route: [180, 120, 200], props: { lineKind: "cable", lengthM: 85, conductor: "NA2XS(F)2Y 1x240" } }), c.id, {
        rotation: 90,
        flip: true,
        labelAt: { x: 30, y: -40 },
        props: { status: "planned", voltageKv: 11, ratedCurrentA: 630 },
    });
    return addNote(addNote(shaped, "text", "Unit 1\nto be built", 300, 0).diagram, "area", "Powerhouse", -60, -60).diagram;
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
        for (const text of ["", "null", "[]", "{", JSON.stringify({ format: "other", version: 2, diagram: sample() }), JSON.stringify({ format: "plantline", version: 4, diagram: sample() })]) {
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
            withDiagram((d) => ((d.nodes as Record<string, unknown>[])[0]!.props = { voltageKv: -1 })),
            withDiagram((d) => ((d.nodes as Record<string, unknown>[])[0]!.props = { hvKv: 33 })),
            withDiagram((d) => ((d.links as Record<string, unknown>[])[0]!.props = { lineKind: "rope" })),
            withDiagram((d) => (d.nodes = Array.from({ length: 5001 }, (_, i) => ({ ...(d.nodes as object[])[0], id: `n${i}` })))),
            withDiagram((d) => ((d.links as Record<string, unknown>[])[1]!.route = [180, 120])),
            withDiagram((d) => ((d.links as Record<string, unknown>[])[1]!.route = [180, "120", 200])),
            withDiagram((d) => ((d.links as Record<string, unknown>[])[1]!.route = Array.from({ length: 65 }, () => 0))),
            withDiagram((d) => delete (d.links as Record<string, unknown>[])[1]!.straight),
            withDiagram((d) => ((d.nodes as Record<string, unknown>[])[0]!.rotation = 45)),
            withDiagram((d) => ((d.nodes as Record<string, unknown>[])[0]!.labelAt = { x: 1e9, y: 0 })),
            withDiagram((d) => ((d.notes as Record<string, unknown>[])[0]!.kind = "image")),
            withDiagram((d) => ((d.notes as Record<string, unknown>[])[0]!.text = "x".repeat(1001))),
            withDiagram((d) => ((d.notes as Record<string, unknown>[])[1]!.id = (d.nodes as Record<string, unknown>[])[0]!.id)),
            withDiagram((d) => delete d.notes),
        ];
        for (const text of cases) expect(parseDiagram(text)).toEqual({ ok: false, error: "invalid" });
    });

    it("read version 1 files, whose lines route themselves", () => {
        const diagram = sample();
        const nodes = diagram.nodes.map(({ rotation: _r, flip: _f, labelAt: _l, props: _p, ...node }) => ({ ...node, voltageKv: 11, ratingKva: 2500 }));
        const { notes: _notes, ...rest } = diagram;
        const old = { format: "plantline", version: 1, diagram: { ...rest, nodes, links: diagram.links.map(({ id, from, to }) => ({ id, from, to })) } };
        const read = parseDiagram(JSON.stringify(old));
        expect(read.ok && read.diagram.links.map((link) => [link.route, link.straight])).toEqual([
            [null, false],
            [null, false],
        ]);
        expect(read.ok && read.diagram.nodes[2]).toMatchObject({ rotation: 0, flip: false, labelAt: null });
        // A voltage and a rating become the kind's own fields; a rating it has no field for goes into its notes
        expect(read.ok && read.diagram.nodes.map((node) => node.props)).toEqual([
            { voltageKv: 11, ratedPowerKva: 2500 },
            { hvKv: 11, ratedPowerKva: 2500 },
            { voltageKv: 11, notes: "2500 kVA" },
        ]);
        expect(read.ok && read.diagram.notes).toEqual([]);
    });

    it("read version 2 files: an element's voltage and rating become its kind's fields; lines have no properties yet", () => {
        const diagram = sample();
        const nodes = diagram.nodes.map(({ props: _p, ...node }) => ({ ...node, voltageKv: 0.4, ratingKva: null }));
        const links = diagram.links.map(({ props: _p, ...link }) => link);
        const read = parseDiagram(JSON.stringify({ format: "plantline", version: 2, diagram: { ...diagram, nodes, links } }));
        expect(read.ok && read.diagram.nodes.map((node) => node.props)).toEqual([{ voltageKv: 0.4 }, { hvKv: 0.4 }, { voltageKv: 0.4 }]);
        expect(read.ok && read.diagram.links.map((link) => link.props)).toEqual([{}, {}]);
        expect(read.ok && read.diagram.nodes[2]!.rotation).toBe(90);
        // Saved again, it is version 3
        expect(read.ok && JSON.parse(serializeDiagram(read.diagram)).version).toBe(3);
    });

    it("refuse a file over the size limit before parsing it", () => {
        expect(parseDiagram(" ".repeat(MAX_FILE_BYTES + 1))).toEqual({ ok: false, error: "tooLarge" });
    });
});
