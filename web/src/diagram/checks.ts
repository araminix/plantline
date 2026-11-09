import type { NodeKind } from "../plants";
import { linkLeads, type Side } from "./geometry";
import type { Diagram, DiagramNode } from "./model";

export type IssueCode = "noGrid" | "unconnected" | "voltageMismatch" | "duplicateDesignation" | "inverterSides" | "moduleCount";

/** Something to fix before the diagram is shared, with the elements it concerns. */
export interface Issue {
    code: IssueCode;
    nodeIds: string[];
}

/** Direct current comes from these; an inverter takes it at its top lead. */
const DC_SOURCES: ReadonlySet<NodeKind> = new Set<NodeKind>(["pvArray", "combinerBox", "battery"]);
/** These are alternating current only; an inverter meets them at its bottom lead. */
const AC_ONLY: ReadonlySet<NodeKind> = new Set<NodeKind>(["gridConnection", "transformer", "transformer3w", "generator", "windTurbine"]);

const numberOf = (node: DiagramNode, id: keyof DiagramNode["props"]) => {
    const value = node.props[id];
    return typeof value === "number" ? value : null;
};

/**
 * The voltage an element has where a line leaves it, in kV: a transformer's top lead is its HV side and its bottom lead
 * its LV side; an inverter's bottom lead is its AC side (its top, DC side has no AC voltage). Null when not known.
 */
function voltageAt(node: DiagramNode, lead: Side | null): number | null {
    if (node.kind === "transformer" || node.kind === "transformer3w") return lead === "up" ? numberOf(node, "hvKv") : lead === "down" ? numberOf(node, "lvKv") : null;
    if (node.kind === "inverter") return lead === "down" ? numberOf(node, "acVoltageKv") : null;
    return numberOf(node, "voltageKv");
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
        const [a, b] = [byId.get(link.from), byId.get(link.to)];
        if (!a || !b) continue;
        const leads = linkLeads(link, a, b);
        const [va, vb] = [voltageAt(a, leads[0]), voltageAt(b, leads[1])];
        if (va !== null && vb !== null && va !== vb) issues.push({ code: "voltageMismatch", nodeIds: [a.id, b.id] });
        for (const [inverter, lead, other] of [
            [a, leads[0], b],
            [b, leads[1], a],
        ] as const) {
            if (inverter.kind !== "inverter" || lead === null) continue;
            if ((lead === "up" && AC_ONLY.has(other.kind)) || (lead === "down" && DC_SOURCES.has(other.kind))) issues.push({ code: "inverterSides", nodeIds: [inverter.id, other.id] });
        }
    }

    for (const node of diagram.nodes) {
        const [modules, strings, perString] = [numberOf(node, "modules"), numberOf(node, "strings"), numberOf(node, "modulesPerString")];
        if (modules !== null && strings !== null && perString !== null && modules !== strings * perString) issues.push({ code: "moduleCount", nodeIds: [node.id] });
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
