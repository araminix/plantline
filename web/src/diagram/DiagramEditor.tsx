import { Cable, ChevronDown, FilePlus, FileText, FolderOpen, Image, Maximize, Plus, Printer, Redo2, Save, SlidersHorizontal, Trash2, Undo2, Workflow, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useI18n } from "../i18n/i18n";
import type { NodeKind, PlantType } from "../plants";
import { readStored, writeStored } from "../settings";
import { IconButton, Menu } from "../ui/controls";
import { arrange } from "./arrange";
import { Canvas, type CanvasHandle, type Selection } from "./Canvas";
import { checkDiagram } from "./checks";
import { DiagramSheet, diagramSvg, download, fileNameOf, svgToPng } from "./export";
import { FILE_EXTENSION, MAX_FILE_BYTES, parseDiagram, serializeDiagram } from "./file";
import { useHistory } from "./history";
import { Inspector } from "./Inspector";
import { addNode, connect, emptyDiagram, removeItems, type Diagram, type Point } from "./model";
import { Palette } from "./Palette";

/** Where the diagram is kept in this browser. */
export const AUTOSAVE_KEY = "plantline.diagram";
const NONE: Selection = { nodes: [], link: null };

function restore(plant: PlantType): Diagram {
    const stored = readStored(AUTOSAVE_KEY);
    const parsed = typeof stored === "string" ? parseDiagram(stored) : null;
    return parsed?.ok ? parsed.diagram : emptyDiagram(plant);
}

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** The single-line diagram editor: toolbar, palette, canvas and inspector; the diagram is kept in this browser. */
export function DiagramEditor({ plant, onPlantChange, hidden }: { plant: PlantType; onPlantChange: (plant: PlantType) => void; hidden: boolean }) {
    const { t } = useI18n();
    const history = useHistory(() => restore(plant));
    const { preview } = history;
    const diagram = history.state;
    const [selection, setSelection] = useState<Selection>(NONE);
    const [connectFrom, setConnectFrom] = useState<string | null | undefined>(undefined);
    const [sheet, setSheet] = useState<"palette" | "inspector" | null>(null);
    const [dragging, setDragging] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [printing, setPrinting] = useState(false);
    const canvas = useRef<CanvasHandle>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const issues = useMemo(() => checkDiagram(diagram), [diagram]);
    const kindName = (kind: NodeKind) => t(`kind.${kind}`);
    const baseName = fileNameOf(diagram.name, "diagram");

    // Saved once per change: a drag's frames are previews and are not saved, its end is. A full or blocked storage is reported.
    const [notKept, setNotKept] = useState(false);
    useEffect(() => setNotKept(!writeStored(AUTOSAVE_KEY, serializeDiagram(diagram))), [history.version, diagram.plantType]);

    // The plant type is chosen in the header; an undone step never brings an old one back
    useEffect(() => {
        if (diagram.plantType !== plant) preview({ ...diagram, plantType: plant });
    }, [plant, diagram, preview]);

    useEffect(() => {
        if (!printing) return;
        window.print();
        setPrinting(false);
    }, [printing]);

    const add = (kind: NodeKind, at?: Point) => {
        const { x, y } = at ?? canvas.current?.centre() ?? { x: 200, y: 200 };
        const added = addNode(diagram, kind, x, y);
        history.commit(added.diagram);
        setSelection({ nodes: [added.id], link: null });
        setSheet(null);
    };

    const remove = () => {
        if (selection.nodes.length === 0 && !selection.link) return;
        history.commit(removeItems(diagram, new Set(selection.nodes), new Set(selection.link ? [selection.link] : [])));
        setSelection(NONE);
    };

    const pick = (nodeId: string) => {
        if (!connectFrom) return setConnectFrom(nodeId);
        const linked = connect(diagram, connectFrom, nodeId);
        if (linked) history.commit(linked);
        setConnectFrom(null);
    };

    const startConnect = (nodeId: string | null) => {
        setConnectFrom(nodeId);
        setSheet(null);
    };

    const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        const result = file.size > MAX_FILE_BYTES ? ({ ok: false, error: "tooLarge" } as const) : parseDiagram(await file.text());
        if (!result.ok) return setNotice(t(result.error === "tooLarge" ? "file.tooLarge" : "file.invalid"));
        history.reset(result.diagram);
        onPlantChange(result.diagram.plantType);
        setSelection(NONE);
        setNotice(null);
        requestAnimationFrame(() => canvas.current?.fit());
    };

    const newDiagram = () => {
        if (diagram.nodes.length > 0 && !window.confirm(t("file.confirmNew"))) return;
        history.reset(emptyDiagram(plant));
        setSelection(NONE);
    };

    useEffect(() => {
        if (hidden) return;
        const onKey = (event: KeyboardEvent) => {
            if (isTyping(event.target)) return;
            const command = event.ctrlKey || event.metaKey;
            const key = event.key.toLowerCase();
            if (key === "delete" || key === "backspace") remove();
            else if (key === "escape") {
                setConnectFrom(undefined);
                setSelection(NONE);
            } else if (command && key === "z") (event.shiftKey ? history.redo : history.undo)();
            else if (command && key === "y") history.redo();
            else return;
            event.preventDefault();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    const panel = (name: "palette" | "inspector", title: string, content: ReactNode) => (
        <aside className={`panel ${name}${sheet === name ? " open" : ""}${dragging && name === "palette" ? " dragging" : ""}`} aria-label={title}>
            <header className="panel-header">
                <h2>{title}</h2>
                <IconButton label={t("action.close")} className="sheet-close" onClick={() => setSheet(null)}>
                    <ChevronDown size={18} />
                </IconButton>
            </header>
            {content}
        </aside>
    );

    return (
        <section className="editor" id="view-diagram" role="tabpanel" aria-labelledby="tab-diagram" hidden={hidden}>
            <div className="toolbar" role="toolbar" aria-label={t("toolbar.label")}>
                <Menu
                    label={t("file.menu")}
                    icon={<FileText size={18} aria-hidden="true" />}
                    items={[
                        { label: t("file.new"), icon: <FilePlus size={16} />, onSelect: newDiagram },
                        { label: t("file.open"), icon: <FolderOpen size={16} />, onSelect: () => fileInput.current?.click() },
                        { label: t("file.save"), icon: <Save size={16} />, onSelect: () => download(baseName + FILE_EXTENSION, serializeDiagram(diagram), "application/json") },
                        { label: t("file.exportSvg"), icon: <Image size={16} />, onSelect: () => download(`${baseName}.svg`, diagramSvg(diagram, kindName), "image/svg+xml") },
                        { label: t("file.exportPng"), icon: <Image size={16} />, onSelect: () => void svgToPng(diagramSvg(diagram, kindName)).then((png) => download(`${baseName}.png`, png)) },
                        { label: t("file.print"), icon: <Printer size={16} />, onSelect: () => setPrinting(true) },
                    ]}
                />
                <span className="separator" />
                <IconButton label={t("action.undo")} onClick={history.undo} disabled={!history.canUndo}>
                    <Undo2 size={18} />
                </IconButton>
                <IconButton label={t("action.redo")} onClick={history.redo} disabled={!history.canRedo}>
                    <Redo2 size={18} />
                </IconButton>
                <span className="separator" />
                <IconButton label={t("action.connect")} pressed={connectFrom !== undefined} onClick={() => (connectFrom === undefined ? startConnect(selection.nodes.length === 1 ? selection.nodes[0]! : null) : setConnectFrom(undefined))}>
                    <Cable size={18} />
                </IconButton>
                <IconButton label={t("action.delete")} onClick={remove} disabled={selection.nodes.length === 0 && !selection.link}>
                    <Trash2 size={18} />
                </IconButton>
                <IconButton
                    label={t("action.arrange")}
                    onClick={() => {
                        history.commit(arrange(diagram));
                        requestAnimationFrame(() => canvas.current?.fit());
                    }}
                    disabled={diagram.nodes.length === 0}
                >
                    <Workflow size={18} />
                </IconButton>
                <span className="separator" />
                <IconButton label={t("action.zoomOut")} onClick={() => canvas.current?.zoom(1 / 1.25)}>
                    <ZoomOut size={18} />
                </IconButton>
                <IconButton label={t("action.zoomIn")} onClick={() => canvas.current?.zoom(1.25)}>
                    <ZoomIn size={18} />
                </IconButton>
                <IconButton label={t("action.fit")} onClick={() => canvas.current?.fit()} disabled={diagram.nodes.length === 0}>
                    <Maximize size={18} />
                </IconButton>
            </div>
            {connectFrom !== undefined && <p className="banner">{t(connectFrom ? "connect.second" : "connect.first")}</p>}
            {notKept && (
                <p className="banner error" role="alert">
                    {t("file.notKept")}
                </p>
            )}
            {notice && (
                <p className="banner error" role="alert">
                    {notice}
                    <IconButton label={t("action.close")} onClick={() => setNotice(null)}>
                        <X size={16} />
                    </IconButton>
                </p>
            )}
            <div className="editor-body">
                {panel("palette", t("palette.title"), <Palette plant={plant} onAdd={add} dropPoint={(x, y) => canvas.current?.pointAt(x, y) ?? null} onDragging={setDragging} />)}
                <div className="canvas-area">
                    <Canvas
                        ref={canvas}
                        diagram={diagram}
                        selection={selection}
                        connectFrom={connectFrom}
                        kindName={kindName}
                        label={t("canvas.label")}
                        onSelect={setSelection}
                        onPreview={history.preview}
                        onCommit={history.commit}
                        onPick={pick}
                    />
                    {diagram.nodes.length === 0 && <p className="canvas-empty">{t("canvas.empty")}</p>}
                </div>
                {panel(
                    "inspector",
                    t("inspector.title"),
                    <Inspector diagram={diagram} selection={selection} issues={issues} onChange={(next) => history.commit(next)} onSelect={setSelection} onConnectFrom={startConnect} onDelete={remove} />,
                )}
            </div>
            <nav className="mobile-bar" aria-label={t("toolbar.label")}>
                <button type="button" className="button" onClick={() => setSheet("palette")}>
                    <Plus size={18} aria-hidden="true" />
                    {t("action.add")}
                </button>
                <button type="button" className="button" onClick={() => setSheet("inspector")}>
                    <SlidersHorizontal size={18} aria-hidden="true" />
                    {t("inspector.title")}
                    {issues.length > 0 && <span className="badge">{issues.length}</span>}
                </button>
            </nav>
            <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(event) => void openFile(event)} />
            {printing && (
                <div className="print-sheet">
                    <DiagramSheet diagram={diagram} kindName={kindName} />
                </div>
            )}
        </section>
    );
}
