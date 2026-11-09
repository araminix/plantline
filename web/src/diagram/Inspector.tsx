import {
    AlignCenterHorizontal,
    AlignCenterVertical,
    AlignEndHorizontal,
    AlignEndVertical,
    AlignHorizontalDistributeCenter,
    AlignStartHorizontal,
    AlignStartVertical,
    AlignVerticalDistributeCenter,
    Cable,
    CopyPlus,
    RotateCw,
    Spline,
    SquareDashed,
    Trash2,
    TrianglesCenterlineDashedVertical,
    Type,
} from "lucide-react";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { IconButton, NumberField, SelectField, TextField } from "../ui/controls";
import type { Selection } from "./Canvas";
import type { Issue } from "./checks";
import type { Alignment } from "./edit";
import { updateLink, updateNode, updateNote, type Diagram, type DiagramNode } from "./model";
import { COMMON, ELECTRICAL, FIELDS, LINE_ELECTRICAL, LINE_GENERAL, withField, type FieldId, type Properties, type Spec } from "./properties";
import { SymbolIcon } from "./symbols";

interface Props {
    diagram: Diagram;
    selection: Selection;
    issues: Issue[];
    onChange: (diagram: Diagram) => void;
    onSelect: (selection: Selection) => void;
    onConnectFrom: (nodeId: string) => void;
    onDelete: () => void;
    onRotate: () => void;
    onFlip: () => void;
    onDuplicate: () => void;
    onAlign: (how: Alignment) => void;
    onDistribute: (across: boolean) => void;
}

const ALIGNMENTS = [
    ["left", AlignStartVertical],
    ["centre", AlignCenterVertical],
    ["right", AlignEndVertical],
    ["top", AlignStartHorizontal],
    ["middle", AlignCenterHorizontal],
    ["bottom", AlignEndHorizontal],
] as const;

/** The selected element or line, or (nothing selected) the diagram: its name, its size and its checks. */
export function Inspector(props: Props) {
    const { diagram, selection, issues, onChange, onSelect, onConnectFrom, onDelete, onRotate, onFlip, onDuplicate, onAlign, onDistribute } = props;
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
                <label className="check">
                    <input type="checkbox" checked={link.straight} onChange={(event) => onChange(updateLink(diagram, link.id, { straight: event.target.checked }))} />
                    {t("link.straight")}
                </label>
                {!link.straight && <p className="hint">{t("link.hint")}</p>}
                <div className="row">
                    {link.route && !link.straight && (
                        <button type="button" className="button" onClick={() => onChange(updateLink(diagram, link.id, { route: null }))}>
                            <Spline size={16} aria-hidden="true" />
                            {t("link.autoRoute")}
                        </button>
                    )}
                    {deleteButton}
                </div>
                <h3>{t("group.general")}</h3>
                <Fields fields={LINE_GENERAL} props={link.props} onChange={(props) => onChange(updateLink(diagram, link.id, { props }))} />
                <h3>{t("group.electrical")}</h3>
                <Fields fields={LINE_ELECTRICAL} props={link.props} onChange={(props) => onChange(updateLink(diagram, link.id, { props }))} />
                <h3>{t("prop.notes")}</h3>
                <PropertyField id="notes" props={link.props} onChange={(props) => onChange(updateLink(diagram, link.id, { props }))} />
            </div>
        );
    }

    // Turn, mirror and copy, for one element or several
    const shapeButtons = (
        <>
            <IconButton label={t("action.rotate")} onClick={onRotate}>
                <RotateCw size={18} />
            </IconButton>
            <IconButton label={t("action.flip")} onClick={onFlip}>
                <TrianglesCenterlineDashedVertical size={18} />
            </IconButton>
            <IconButton label={t("action.duplicate")} onClick={onDuplicate}>
                <CopyPlus size={18} />
            </IconButton>
        </>
    );

    const note = selection.nodes.length === 1 ? diagram.notes.find((candidate) => candidate.id === selection.nodes[0]) : undefined;
    if (note) {
        return (
            <div className="inspector" key={note.id}>
                <h2 className="with-icon">
                    {note.kind === "text" ? <Type size={22} aria-hidden="true" /> : <SquareDashed size={22} aria-hidden="true" />}
                    {t(note.kind === "text" ? "note.text" : "note.area")}
                </h2>
                <TextField label={t("note.text")} value={note.text} maxLength={1000} multiline={note.kind === "text"} onCommit={(text) => onChange(updateNote(diagram, note.id, { text }))} />
                <div className="row">
                    <IconButton label={t("action.duplicate")} onClick={onDuplicate}>
                        <CopyPlus size={18} />
                    </IconButton>
                    {deleteButton}
                </div>
            </div>
        );
    }

    if (selection.nodes.length > 1) {
        return (
            <div className="inspector">
                <h2>{t("inspector.selected", { count: selection.nodes.length })}</h2>
                <div className="row">{shapeButtons}</div>
                <h3>{t("align.title")}</h3>
                <div className="row">
                    {ALIGNMENTS.map(([how, Icon]) => (
                        <IconButton key={how} label={t(`align.${how}`)} onClick={() => onAlign(how)}>
                            <Icon size={18} />
                        </IconButton>
                    ))}
                    <IconButton label={t("align.across")} onClick={() => onDistribute(true)} disabled={nodes.length < 3}>
                        <AlignHorizontalDistributeCenter size={18} />
                    </IconButton>
                    <IconButton label={t("align.down")} onClick={() => onDistribute(false)} disabled={nodes.length < 3}>
                        <AlignVerticalDistributeCenter size={18} />
                    </IconButton>
                </div>
                <div className="row inspector-actions">{deleteButton}</div>
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
                <div className="row">
                    {shapeButtons}
                    <IconButton label={t("action.connectFrom")} onClick={() => onConnectFrom(node.id)}>
                        <Cable size={18} />
                    </IconButton>
                    {deleteButton}
                </div>
                <h3>{t("group.general")}</h3>
                <TextField label={t("field.label")} value={node.label} onCommit={(label) => set({ label })} />
                <TextField label={t("field.designation")} value={node.designation} onCommit={(designation) => set({ designation })} />
                <Fields fields={COMMON} props={node.props} onChange={(props) => set({ props })} />
                {node.kind === "busbar" && <NumberField label={t("field.length")} value={node.width} onCommit={(width) => set({ width: width === null ? null : Math.max(40, Math.min(4000, width)) })} />}
                <h3>{t("group.electrical")}</h3>
                <Fields fields={ELECTRICAL[node.kind]} props={node.props} onChange={(props) => set({ props })} />
                <h3>{t("prop.notes")}</h3>
                <PropertyField id="notes" props={node.props} onChange={(props) => set({ props })} />
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

/** A field per property; each saves on its own. */
function Fields({ fields, props, onChange }: { fields: readonly FieldId[]; props: Properties; onChange: (props: Properties) => void }) {
    return (
        <>
            {fields.map((id) => (
                <PropertyField key={id} id={id} props={props} onChange={onChange} />
            ))}
        </>
    );
}

/** One property: a number with its unit, a text, or a choice; notes take several lines, under their own heading. */
function PropertyField({ id, props, onChange }: { id: FieldId; props: Properties; onChange: (props: Properties) => void }) {
    const { t } = useI18n();
    const spec: Spec = FIELDS[id];
    const value = props[id];
    const set = (next: string | number | null) => onChange(withField(props, id, next));
    if (spec.type === "number") return <NumberField label={t(spec.label)} unit={spec.unit} integer={spec.integer} max={spec.max} value={typeof value === "number" ? value : null} onCommit={set} />;
    if (spec.type === "text") return <TextField label={t(spec.label)} value={typeof value === "string" ? value : ""} maxLength={spec.max} multiline={id === "notes"} hideLabel={id === "notes"} onCommit={set} />;
    const options = spec.choices.map((choice) => ({ value: choice, label: t(`${id === "status" ? "status" : "lineKind"}.${choice}` as MessageKey) }));
    return <SelectField label={t(spec.label)} value={typeof value === "string" ? value : ""} options={[{ value: "", label: "—" }, ...options]} onChange={set} />;
}
