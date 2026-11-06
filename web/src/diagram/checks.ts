import { CONVERTERS } from "../plants";
import type { Diagram, DiagramNode } from "./model";

export type IssueCode = "noGrid" | "unconnected" | "voltageMismatch" | "duplicateDesignation";

/** Something to fix before the diagram is shared, with the elements it concerns. */
export interface Issue {
    code: IssueCode;
    nodeIds: string[];
}

export function checkDiagram(diagram: Diagram): Issue[] {
    if (diagram.nodes.length === 0) return [];
    const issues: Issue[] = [];
    const byId = new Map(diagram.nodes.map((node) => [node.id, node]));

    if (!diagram.nodes.some((node) => node.kind === "gridConnection")) issues.push({ code: "noGrid", nodeIds: [] });

    const linked = new Set(diagram.links.flatMap((link) => [link.from, link.to]));
    for (const node of diagram.nodes) {
        if (!linked.has(node.id)) issues.push({ code: "unconnected", nodeIds: [node.id] });
    }

    for (const link of diagram.links) {
        const ends = [byId.get(link.from), byId.get(link.to)].filter((node): node is DiagramNode => node !== undefined);
        const [a, b] = ends;
        if (a && b && a.voltageKv !== null && b.voltageKv !== null && a.voltageKv !== b.voltageKv && !CONVERTERS.has(a.kind) && !CONVERTERS.has(b.kind)) {
            issues.push({ code: "voltageMismatch", nodeIds: [a.id, b.id] });
        }
    }

    const byDesignation = Map.groupBy(
        diagram.nodes.filter((node) => node.designation.trim() !== ""),
        (node) => node.designation.trim(),
    );
    for (const nodes of byDesignation.values()) {
        if (nodes.length > 1) issues.push({ code: "duplicateDesignation", nodeIds: nodes.map((node) => node.id) });
    }

    return issues;
}
