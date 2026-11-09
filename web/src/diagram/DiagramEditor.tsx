import { Cable, ChevronDown, CircleCheck, Ellipsis, FilePlus, FileText, FolderOpen, Image, Keyboard, Maximize, Plus, Printer, Redo2, Save, ScanSearch, SlidersHorizontal, Sparkles, SquareDashed, Trash2, TriangleAlert, Type, Undo2, Workflow, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useI18n } from "../i18n/i18n";
import { PLANT_ICONS, PLANT_TYPES, type NodeKind, type PlantType } from "../plants";
import { readStored, writeStored } from "../settings";
import { IconButton, Menu, Spoken, type MenuItem } from "../ui/controls";
import { isTyping } from "../ui/keys";
import { Logo } from "../ui/Logo";
import { arrange } from "./arrange";
import { Canvas, type CanvasHandle, type Selection } from "./Canvas";
import { checkDiagram } from "./checks";
import { exampleDiagram } from "./examples";
import type { Wording } from "./DiagramContent";
import { DiagramSheet, diagramSvg, download, fileNameOf, svgToPng } from "./export";
import { FILE_EXTENSION, MAX_FILE_BYTES, parseDiagram, serializeDiagram } from "./file";
import { useHistory } from "./history";
import { Inspector } from "./Inspector";
import { alignNodes, copyItems, distributeNodes, flipNodes, pasteItems, rotateNodes, type Alignment, type Clip } from "./edit";
import { addNode, addNote, connect, emptyDiagram, GRID, moveNodes, removeItems, type Diagram, type DiagramNote, type Point } from "./model";
import { Palette } from "./Palette";
import { Shortcuts } from "./Shortcuts";
import { SymbolIcon } from "./symbols";

/** Where the diagram is kept in this browser. */
export const AUTOSAVE_KEY = "plantline.diagram";
const NONE: Selection = { nodes: [], link: null };

function restore(plant: PlantType): Diagram {
    const stored = readStored(AUTOSAVE_KEY);
    const parsed = typeof stored === "string" ? parseDiagram(stored) : null;
    return parsed?.ok ? parsed.diagram : emptyDiagram(plant);
}


/** The single-line diagram editor: toolbar, palette, canvas and inspector; the diagram is kept in this browser. */
export function DiagramEditor({ plant, onPlantChange, hidden }: { plant: PlantType; onPlantChange: (plant: PlantType) => void; hidden: boolean }) {
    const { t, lang, number } = useI18n();
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
    const clipboard = useRef<Clip | null>(null);
    const [zoom, setZoom] = useState(1);
    const zoomLevel = new Intl.NumberFormat(lang, { style: "percent" }).format(zoom);
    const [shortcuts, setShortcuts] = useState(false);
    const shortcutsButton = useRef<HTMLButtonElement>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const issues = useMemo(() => checkDiagram(diagram), [diagram]);
    // The drawing (and its exports) in the reader's words and digits; no thousands separators, as drawings write them
    const wording = useMemo<Wording>(() => {
        const digits = new Intl.NumberFormat(lang, { maximumFractionDigits: 6, useGrouping: false });
        return { kind: (kind) => t(`kind.${kind}`), number: (value) => digits.format(value) };
    }, [t, lang]);
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

    const addAnnotation = (kind: DiagramNote["kind"]) => {
        const { x, y } = canvas.current?.centre() ?? { x: 200, y: 200 };
        const added = addNote(diagram, kind, t(kind === "text" ? "note.text" : "note.area"), x, y);
        history.commit(added.diagram);
        setSelection({ nodes: [added.id], link: null });
    };

    const chosen = new Set(selection.nodes);
    /** A change to the selected elements, as one step, leaving `nodes` selected. */
    const change = (next: Diagram, nodes = selection.nodes) => {
        if (next === diagram) return;
        history.commit(next);
        setSelection({ nodes, link: null });
    };
    const paste = (clip: Clip | null) => {
        if (!clip || clip.nodes.length === 0) return;
        const pasted = pasteItems(diagram, clip);
        change(pasted.diagram, pasted.ids);
    };
    const groupActions = {
        onRotate: () => change(rotateNodes(diagram, chosen)),
        onFlip: () => change(flipNodes(diagram, chosen)),
        onDuplicate: () => paste(copyItems(diagram, chosen)),
        onAlign: (how: Alignment) => change(alignNodes(diagram, chosen, how)),
        onDistribute: (across: boolean) => change(distributeNodes(diagram, chosen, across)),
    };

    const remove = (of: Selection = selection) => {
        if (of.nodes.length === 0 && !of.link) return;
        history.commit(removeItems(diagram, new Set(of.nodes), new Set(of.link ? [of.link] : [])));
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

    // A ready-made diagram of a plant type (another one switches the plant type), as one step: undo brings the previous one back
    const openExample = (of: PlantType = plant) => {
        if (diagram.nodes.length > 0 && !window.confirm(t("file.confirmNew"))) return;
        history.commit(exampleDiagram(of, t("example.name", { plant: t(`plant.${of}`) })));
        if (of !== plant) onPlantChange(of);
        setSelection(NONE);
        setSheet(null);
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
            if (isTyping(event.target) || shortcuts) return;
            const command = event.ctrlKey || event.metaKey;
            const key = event.key.toLowerCase();
            // With nothing selected, the keys act on the element or note the keyboard is on
            const focused = (document.activeElement as Element | null)?.closest?.("[data-node], [data-note]");
            const focusedId = focused?.getAttribute("data-node") ?? focused?.getAttribute("data-note") ?? null;
            const current: Selection = selection.nodes.length === 0 && !selection.link && focusedId ? { nodes: [focusedId], link: null } : selection;
            const ids = new Set(current.nodes);
            const any = ids.size > 0;
            const arrow = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[key];
            // By the key's place, since Shift changes what a digit types
            const view = event.shiftKey && !command ? { Digit1: "fit", Digit2: "selection", Digit0: "actual" }[event.code] : undefined;
            if (event.key === "?") setShortcuts(true);
            else if (view === "fit") canvas.current?.fit();
            else if (view === "selection") canvas.current?.zoomToItems(current.nodes);
            else if (view === "actual") canvas.current?.zoomTo(1);
            else if (key === "delete" || key === "backspace") remove(current);
            else if (command && key === "a") setSelection({ nodes: diagram.nodes.map((node) => node.id), link: null });
            else if (command && key === "c" && any) clipboard.current = copyItems(diagram, ids);
            else if (command && key === "x" && any) {
                clipboard.current = copyItems(diagram, ids);
                remove(current);
            } else if (command && key === "v" && clipboard.current) paste(clipboard.current);
            else if (command && key === "d" && any) paste(copyItems(diagram, ids));
            else if (arrow && any && !command) {
                // A grid step, five with Shift
                const step = (event.shiftKey ? 5 : 1) * GRID;
                change(moveNodes(diagram, ids, arrow[0]! * step, arrow[1]! * step, true), current.nodes);
            } else if (key === "r" && any && !command) change(rotateNodes(diagram, ids), current.nodes);
            else if (key === "h" && event.shiftKey && any && !command) change(flipNodes(diagram, ids), current.nodes);
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

    const anything = selection.nodes.length > 0 || selection.link !== null;
    const drawn = diagram.nodes.length > 0 || diagram.notes.length > 0;
    const problems = issues.length === 0 ? t("checks.ok") : t("checks.problems", { count: issues.length });
    const arrangeAll = () => {
        history.commit(arrange(diagram));
        requestAnimationFrame(() => canvas.current?.fit());
    };
    // The checks are shown when nothing is selected; on a phone, in the properties sheet
    const showChecks = () => {
        setSelection(NONE);
        setSheet("inspector");
    };
    const fileItems: MenuItem[] = [
        { label: t("file.new"), icon: <FilePlus size={16} />, onSelect: newDiagram },
        { label: t("file.open"), icon: <FolderOpen size={16} />, onSelect: () => fileInput.current?.click() },
        { label: t("file.example"), icon: <Sparkles size={16} />, onSelect: () => openExample() },
        { label: t("file.save"), icon: <Save size={16} />, onSelect: () => download(baseName + FILE_EXTENSION, serializeDiagram(diagram), "application/json") },
        { label: t("file.exportSvg"), icon: <Image size={16} />, onSelect: () => download(`${baseName}.svg`, diagramSvg(diagram, wording), "image/svg+xml") },
        { label: t("file.exportPng"), icon: <Image size={16} />, onSelect: () => void svgToPng(diagramSvg(diagram, wording)).then((png) => download(`${baseName}.png`, png)) },
        { label: t("file.print"), icon: <Printer size={16} />, onSelect: () => setPrinting(true) },
    ];
    // What a narrower toolbar keeps in its More menu (and a phone in the bottom bar's)
    const moreItems: (MenuItem | null)[] = [
        { label: t("action.delete"), icon: <Trash2 size={16} />, keys: "Del", disabled: !anything, onSelect: () => remove() },
        { label: t("action.addText"), icon: <Type size={16} />, onSelect: () => addAnnotation("text") },
        { label: t("action.addArea"), icon: <SquareDashed size={16} />, onSelect: () => addAnnotation("area") },
        null,
        { label: t("action.zoomSelection"), icon: <ScanSearch size={16} />, keys: "⇧ 2", disabled: selection.nodes.length === 0, onSelect: () => canvas.current?.zoomToItems(selection.nodes) },
        { label: t("shortcuts.title"), icon: <Keyboard size={16} />, keys: "?", onSelect: () => setShortcuts(true) },
    ];

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
                <span className="tool-group phone-hide">
                    <Menu label={t("file.menu")} icon={<FileText size={18} aria-hidden="true" />} items={fileItems} />
                </span>
                <span className="separator phone-hide" />
                <IconButton label={t("action.undo")} onClick={history.undo} disabled={!history.canUndo}>
                    <Undo2 size={18} />
                </IconButton>
                <IconButton label={t("action.redo")} onClick={history.redo} disabled={!history.canRedo}>
                    <Redo2 size={18} />
                </IconButton>
                <span className="separator" />
                <IconButton label={t("action.connect")} text={t("toolbar.connect")} pressed={connectFrom !== undefined} onClick={() => (connectFrom === undefined ? startConnect(selection.nodes.length === 1 ? selection.nodes[0]! : null) : setConnectFrom(undefined))}>
                    <Cable size={18} />
                </IconButton>
                <IconButton label={t("action.arrange")} text={t("toolbar.arrange")} onClick={arrangeAll} disabled={diagram.nodes.length === 0}>
                    <Workflow size={18} />
                </IconButton>
                <IconButton label={t("action.delete")} className="extra" onClick={() => remove()} disabled={!anything}>
                    <Trash2 size={18} />
                </IconButton>
                <span className="separator extra" />
                <IconButton label={t("action.addText")} text={t("note.text")} className="extra" onClick={() => addAnnotation("text")}>
                    <Type size={18} />
                </IconButton>
                <IconButton label={t("action.addArea")} text={t("note.area")} className="extra" onClick={() => addAnnotation("area")}>
                    <SquareDashed size={18} />
                </IconButton>
                <span className="separator" />
                <span className="zoom-group">
                    <IconButton label={t("action.zoomOut")} onClick={() => canvas.current?.zoom(1 / 1.25)}>
                        <ZoomOut size={18} />
                    </IconButton>
                    <button type="button" className="zoom-level" title={t("zoom.reset")} aria-label={`${zoomLevel}, ${t("zoom.reset")}`} onClick={() => canvas.current?.zoomTo(1)}>
                        {zoomLevel}
                    </button>
                    <IconButton label={t("action.zoomIn")} onClick={() => canvas.current?.zoom(1.25)}>
                        <ZoomIn size={18} />
                    </IconButton>
                </span>
                <IconButton label={t("action.fit")} text={t("toolbar.fit")} onClick={() => canvas.current?.fit()} disabled={!drawn}>
                    <Maximize size={18} />
                </IconButton>
                <IconButton label={t("action.zoomSelection")} className="extra" onClick={() => canvas.current?.zoomToItems(selection.nodes)} disabled={selection.nodes.length === 0}>
                    <ScanSearch size={18} />
                </IconButton>
                <span className="tool-group more">
                    <Menu label={t("action.more")} icon={<Ellipsis size={18} aria-hidden="true" />} items={moreItems} />
                </span>
                <span className="spacer" />
                {diagram.nodes.length > 0 && (
                    <button type="button" className={issues.length > 0 ? "status-chip warn" : "status-chip"} title={t("checks.show")} aria-label={problems} onClick={showChecks}>
                        {issues.length > 0 ? <TriangleAlert size={16} aria-hidden="true" /> : <CircleCheck size={16} aria-hidden="true" />}
                        <span className="chip-text">{problems}</span>
                    </button>
                )}
                <IconButton label={t("shortcuts.title")} className="extra" onClick={() => setShortcuts(true)} buttonRef={shortcutsButton}>
                    <Keyboard size={18} />
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
                        wording={wording}
                        label={t("canvas.label")}
                        onSelect={setSelection}
                        onPreview={history.preview}
                        onCommit={history.commit}
                        onPick={pick}
                        onActivate={(nodeId) => (connectFrom === undefined ? startConnect(nodeId) : pick(nodeId))}
                        onZoom={setZoom}
                        overviewLabel={t("overview.label")}
                    />
                    {!drawn && !dragging && (
                        <div className="canvas-start">
                            <div className="start-card">
                                <Logo size={48} />
                                <h2>{t("canvas.startTitle")}</h2>
                                <ol>
                                    {([1, 2, 3] as const).map((step) => (
                                        <li key={step}>
                                            <span className="step">{number(step)}</span>
                                            <div>
                                                <strong>{t(`canvas.step${step}`)}</strong>
                                                <span>{t(`canvas.step${step}Hint`)}</span>
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                                <p className="eyebrow">{t("canvas.example")}</p>
                                <ul className="example-grid">
                                    {PLANT_TYPES.map((of) => (
                                        <li key={of}>
                                            <button type="button" aria-current={of === plant ? "true" : undefined} onClick={() => openExample(of)}>
                                                <SymbolIcon kind={PLANT_ICONS[of]} size={28} />
                                                <Spoken message={t("example.name", { plant: "\u0000" })}>{t(`plant.${of}`)}</Spoken>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                                <button type="button" className="button" onClick={() => fileInput.current?.click()}>
                                    <FolderOpen size={17} aria-hidden="true" />
                                    {t("canvas.openFile")}
                                </button>
                                <p className="muted small">
                                    {t("canvas.saved")} <span className="pointer-hint">{t("canvas.shortcutsHint")}</span>
                                </p>
                            </div>
                        </div>
                    )}
                </div>
                {panel(
                    "inspector",
                    t("inspector.title"),
                    <Inspector diagram={diagram} selection={selection} issues={issues} onChange={(next) => history.commit(next)} onSelect={setSelection} onConnectFrom={startConnect} onDelete={() => remove()} {...groupActions} />,
                )}
            </div>
            <nav className="mobile-bar" aria-label={t("toolbar.label")}>
                <button type="button" className="button primary" onClick={() => setSheet("palette")}>
                    <Plus size={18} aria-hidden="true" />
                    {t("action.add")}
                </button>
                <button type="button" className="button" onClick={() => setSheet("inspector")}>
                    <SlidersHorizontal size={18} aria-hidden="true" />
                    {t("inspector.title")}
                    {issues.length > 0 && <span className="badge">{issues.length}</span>}
                </button>
                <Menu label={t("action.more")} icon={<Ellipsis size={20} />} iconOnly alignEnd items={[...fileItems, null, ...moreItems]} />
            </nav>
            <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(event) => void openFile(event)} />
            {shortcuts && (
                <Shortcuts
                    onClose={() => {
                        setShortcuts(false);
                        shortcutsButton.current?.focus();
                    }}
                />
            )}
            {printing && (
                <div className="print-sheet">
                    <DiagramSheet diagram={diagram} wording={wording} />
                </div>
            )}
        </section>
    );
}
