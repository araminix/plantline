import { Cable, Trash2 } from "lucide-react";
import { useI18n } from "../i18n/i18n";
import { NumberField, TextField } from "../ui/controls";
import type { Selection } from "./Canvas";
import type { Issue } from "./checks";
import { updateNode, type Diagram, type DiagramNode } from "./model";
import { SymbolIcon } from "./symbols";

interface Props {
    diagram: Diagram;
    selection: Selection;
    issues: Issue[];
    onChange: (diagram: Diagram) => void;
    onSelect: (selection: Selection) => void;
    onConnectFrom: (nodeId: string) => void;
    onDelete: () => void;
}

/** The selected element or line, or (nothing selected) the diagram: its name, its size and its checks. */
export function Inspector({ diagram, selection, issues, onChange, onSelect, onConnectFrom, onDelete }: Props) {
    const { t } = useI18n();
    const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
    const nameOf = (node: DiagramNode | undefined) => (node ? node.label || node.designation || t(`kind.${node.kind}`) : "?");
    const nodes = selection.nodes.map((id) => byId.get(id)).filter((node): node is DiagramNode => node !== undefined);
    const link = diagram.links.find((l) => l.id === selection.link);
    const deleteButton = (
        <button type="button" className="button danger" onClick={onDelete}>
            <Trash2 size={16} aria-hidden="true" />
            {t("action.delete")}
        </button>
    );

    if (link) {
        return (
            <div className="inspector">
                <h2>{t("inspector.link")}</h2>
                <p>
                    {nameOf(byId.get(link.from))} — {nameOf(byId.get(link.to))}
                </p>
                {deleteButton}
            </div>
        );
    }

    if (nodes.length > 1) {
        return (
            <div className="inspector">
                <h2>{t("inspector.selected", { count: nodes.length })}</h2>
                {deleteButton}
            </div>
        );
    }

    const [node] = nodes;
    if (node) {
        const set = (patch: Partial<DiagramNode>) => onChange(updateNode(diagram, node.id, patch));
        return (
            <div className="inspector" key={node.id}>
                <h2 className="with-icon">
                    <SymbolIcon kind={node.kind} size={28} />
                    {t(`kind.${node.kind}`)}
                </h2>
                <TextField label={t("field.label")} value={node.label} onCommit={(label) => set({ label })} />
                <TextField label={t("field.designation")} value={node.designation} onCommit={(designation) => set({ designation })} />
                <NumberField label={t("field.voltage")} unit="kV" value={node.voltageKv} onCommit={(voltageKv) => set({ voltageKv })} />
                <NumberField label={t("field.rating")} unit="kVA" value={node.ratingKva} onCommit={(ratingKva) => set({ ratingKva })} />
                {node.kind === "busbar" && <NumberField label={t("field.length")} value={node.width} onCommit={(width) => set({ width: width === null ? null : Math.max(40, Math.min(4000, width)) })} />}
                <div className="row">
                    <button type="button" className="button" onClick={() => onConnectFrom(node.id)}>
                        <Cable size={16} aria-hidden="true" />
                        {t("action.connectFrom")}
                    </button>
                    {deleteButton}
                </div>
            </div>
        );
    }

    return (
        <div className="inspector">
            <h2>{t("inspector.diagram")}</h2>
            <TextField label={t("field.name")} value={diagram.name} onCommit={(name) => onChange({ ...diagram, name })} />
            <p className="muted">{t("inspector.stats", { elements: diagram.nodes.length, links: diagram.links.length })}</p>
            <h3>{t("checks.title")}</h3>
            {diagram.nodes.length === 0 ? (
                <p className="muted">{t("checks.empty")}</p>
            ) : issues.length === 0 ? (
                <p className="ok">{t("checks.none")}</p>
            ) : (
                <ul className="issues">
                    {issues.map((issue, index) => (
                        <li key={index}>
                            <button type="button" disabled={issue.nodeIds.length === 0} onClick={() => onSelect({ nodes: issue.nodeIds, link: null })}>
                                {t(`issue.${issue.code}`, { name: issue.nodeIds.map((id) => nameOf(byId.get(id))).join(" – ") })}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
