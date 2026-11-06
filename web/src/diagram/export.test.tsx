import { describe, expect, it } from "vitest";
import { diagramSvg, fileNameOf } from "./export";
import { addNode, connect, emptyDiagram, updateNode } from "./model";

describe("diagram exports", () => {
    it("draw a standalone SVG with every element and line, and escape what users typed", () => {
        const a = addNode(emptyDiagram("wind"), "windTurbine", 0, 0);
        const b = addNode(a.diagram, "transformer", 0, 120);
        const diagram = updateNode(connect(b.diagram, a.id, b.id)!, a.id, { label: `<script>alert("x")</script>` });

        const svg = diagramSvg(diagram, (kind) => kind);
        expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
        expect(svg.match(/data-node=/g)).toHaveLength(2);
        expect(svg.match(/data-link=/g)).toHaveLength(1);
        expect(svg).not.toContain("<script>");
        expect(svg).toContain("&lt;script&gt;");
        expect(svg).not.toContain('class="hit"');
    });

    it("name files after the diagram, in any script, or a fallback", () => {
        expect(fileNameOf("Sivas GES / Phase 2", "diagram")).toBe("Sivas-GES-Phase-2");
        expect(fileNameOf("  محطة الرياح  ", "diagram")).toBe("محطة-الرياح");
        expect(fileNameOf(" ../ ", "diagram")).toBe("diagram");
    });
});
