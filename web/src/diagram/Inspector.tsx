import {
    AlignCenterHorizontal,
    AlignCenterVertical,
    AlignEndHorizontal,
    AlignEndVertical,
    AlignHorizontalDistributeCenter,
    AlignStartHorizontal,
    AlignStartVertical,
    AlignVerticalDistributeCenter,
    Boxes,
    Cable,
    ChevronRight,
    CircleCheck,
    CopyPlus,
    FileText,
    RotateCw,
    Spline,
    SquareDashed,
    Trash2,
    TriangleAlert,
    TrianglesCenterlineDashedVertical,
    Type,
} from "lucide-react";
import { useId, type ReactNode } from "react";
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

/** What is shown: its symbol in a tile, its name, and what it is. */
function Head({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string | undefined }) {
    return (
        <header className="inspector-head">
            <span className="inspector-icon">{icon}</span>
            <div>
                <h2 dir="auto">{title}</h2>
                {subtitle && <p>{subtitle}</p>}
            </div>
        </header>
    );
}

/** A group of fields on a card, side by side where they fit; `folded` cards open on demand. */
function Card({ title, children, folded }: { title: ReactNode; children: ReactNode; folded?: boolean }) {
    if (folded !== undefined) {
        return (
            <details className="card" open={!folded}>
                <summary>
                    <h3>{title}</h3>
                </summary>
                <div className="fields">{children}</div>
            </details>
        );
    }
    return (
        <section className="card">
            <h3>{title}</h3>
            <div className="fields">{children}</div>
        </section>
    );
}

/** The selected element or line, or (nothing selected) the diagram: its name, its size and its checks. */
export function Inspector(props: Props) {
    const { diagram, selection, issues, onChange, onSelect, onConnectFrom, onDelete, onRotate, onFlip, onDuplicate, onAlign, onDistribute } = props;
    const { t, number } = useI18n();
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
        const set = (props: Properties) => onChange(updateLink(diagram, link.id, { props }));
        return (
            <div className="inspector">
                <Head icon={<Spline size={24} />} title={t("inspector.link")} subtitle={`${nameOf(byId.get(link.from))} — ${nameOf(byId.get(link.to))}`} />
                <div className="inspector-actions">
                    {link.route && !link.straight && (
                        <button type="button" className="button" onClick={() => onChange(updateLink(diagram, link.id, { route: null }))}>
                            <Spline size={16} aria-hidden="true" />
                            {t("link.autoRoute")}
                        </button>
                    )}
                    {deleteButton}
                </div>
                <section className="card">
                    <label className="check">
                        <input type="checkbox" checked={link.straight} onChange={(event) => onChange(updateLink(diagram, link.id, { straight: event.target.checked }))} />
                        {t("link.straight")}
                    </label>
                    {!link.straight && <p className="hint">{t("link.hint")}</p>}
                </section>
                <Card title={t("group.general")}>
                    <Fields fields={LINE_GENERAL} props={link.props} onChange={set} />
                </Card>
                <Card title={t("group.electrical")}>
                    <Fields fields={LINE_ELECTRICAL} props={link.props} onChange={set} />
                </Card>
                <Card title={t("prop.notes")} folded={!link.props.notes}>
                    <PropertyField id="notes" props={link.props} onChange={set} />
                </Card>
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
        const kind = t(note.kind === "text" ? "note.text" : "note.area");
        return (
            <div className="inspector" key={note.id}>
                <Head icon={note.kind === "text" ? <Type size={24} /> : <SquareDashed size={24} />} title={kind} />
                <div className="inspector-actions">
                    <IconButton label={t("action.duplicate")} onClick={onDuplicate}>
                        <CopyPlus size={18} />
                    </IconButton>
                    {deleteButton}
                </div>
                <section className="card">
                    <TextField label={t("note.text")} value={note.text} maxLength={1000} multiline={note.kind === "text"} onCommit={(text) => onChange(updateNote(diagram, note.id, { text }))} />
                </section>
            </div>
        );
    }

    if (selection.nodes.length > 1) {
        return (
            <div className="inspector">
                <Head icon={<Boxes size={24} />} title={t("inspector.selected", { count: selection.nodes.length })} />
                <div className="inspector-actions">
                    {shapeButtons}
                    {deleteButton}
                </div>
                <section className="card">
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
                </section>
            </div>
        );
    }

    const [node] = nodes;
    if (node) {
        const set = (patch: Partial<DiagramNode>) => onChange(updateNode(diagram, node.id, patch));
        const kind = t(`kind.${node.kind}`);
        return (
            <div className="inspector" key={node.id}>
                <Head icon={<SymbolIcon kind={node.kind} size={34} />} title={node.label || kind} subtitle={node.label ? kind : undefined} />
                <div className="inspector-actions">
                    {shapeButtons}
                    <IconButton label={t("action.connectFrom")} onClick={() => onConnectFrom(node.id)}>
                        <Cable size={18} />
                    </IconButton>
                    {deleteButton}
                </div>
                <Card title={t("group.general")}>
                    <TextField label={t("field.label")} value={node.label} onCommit={(label) => set({ label })} />
                    <TextField label={t("field.designation")} value={node.designation} onCommit={(designation) => set({ designation })} />
                    <Fields fields={COMMON} props={node.props} onChange={(props) => set({ props })} />
                    {node.kind === "busbar" && <NumberField label={t("field.length")} value={node.width} onCommit={(width) => set({ width: width === null ? null : Math.max(40, Math.min(4000, width)) })} />}
                </Card>
                <Card title={t("group.electrical")}>
                    <Fields fields={ELECTRICAL[node.kind]} props={node.props} onChange={(props) => set({ props })} />
                </Card>
                <Card title={t("prop.notes")} folded={!node.props.notes}>
                    <PropertyField id="notes" props={node.props} onChange={(props) => set({ props })} />
                </Card>
            </div>
        );
    }

    return (
        <div className="inspector">
            <Head icon={<FileText size={24} />} title={t("inspector.diagram")} subtitle={t("inspector.stats", { elements: number(diagram.nodes.length), links: number(diagram.links.length) })} />
            <Card title={t("group.general")}>
                <TextField label={t("field.name")} value={diagram.name} onCommit={(name) => onChange({ ...diagram, name })} />
            </Card>
            <section className="card">
                <h3>
                    {t("checks.title")}
                    {issues.length > 0 && <span className="badge warn">{number(issues.length)}</span>}
                </h3>
                {diagram.nodes.length === 0 ? (
                    <p className="muted">{t("checks.empty")}</p>
                ) : issues.length === 0 ? (
                    <p className="ok with-icon">
                        <CircleCheck size={18} aria-hidden="true" />
                        {t("checks.none")}
                    </p>
                ) : (
                    <ul className="issues">
                        {issues.map((issue, index) => (
                            <li key={index}>
                                <button type="button" disabled={issue.nodeIds.length === 0} onClick={() => onSelect({ nodes: issue.nodeIds, link: null })}>
                                    <TriangleAlert size={18} aria-hidden="true" />
                                    <span>{t(`issue.${issue.code}`, { name: issue.nodeIds.map((id) => nameOf(byId.get(id))).join(" – ") })}</span>
                                    {issue.nodeIds.length > 0 && <ChevronRight className="chevron" size={16} aria-hidden="true" />}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
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

/**
 * One property: a number with its unit, a text, or a choice (the status as a segmented control, pressed again to
 * clear it); notes take several lines, under their own heading.
 */
function PropertyField({ id, props, onChange }: { id: FieldId; props: Properties; onChange: (props: Properties) => void }) {
    const { t } = useI18n();
    const labelId = useId();
    const spec: Spec = FIELDS[id];
    const value = props[id];
    const set = (next: string | number | null) => onChange(withField(props, id, next));
    if (spec.type === "number") return <NumberField label={t(spec.label)} unit={spec.unit} integer={spec.integer} max={spec.max} value={typeof value === "number" ? value : null} onCommit={set} />;
    if (spec.type === "text") return <TextField label={t(spec.label)} value={typeof value === "string" ? value : ""} maxLength={spec.max} multiline={id === "notes"} hideLabel={id === "notes"} onCommit={set} />;
    const label = (choice: string) => t(`${id === "status" ? "status" : "lineKind"}.${choice}` as MessageKey);
    if (id === "status") {
        return (
            <div className="field wide">
                <span id={labelId}>{t(spec.label)}</span>
                <div className="segmented" role="radiogroup" aria-labelledby={labelId}>
                    {spec.choices.map((choice) => (
                        <button key={choice} type="button" role="radio" aria-checked={value === choice} onClick={() => set(value === choice ? "" : choice)}>
                            {label(choice)}
                        </button>
                    ))}
                </div>
            </div>
        );
    }
    return <SelectField label={t(spec.label)} value={typeof value === "string" ? value : ""} options={[{ value: "", label: "—" }, ...spec.choices.map((choice) => ({ value: choice, label: label(choice) }))]} onChange={set} />;
}
