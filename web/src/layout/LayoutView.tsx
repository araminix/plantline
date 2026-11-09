import { ChevronDown, Crosshair, Download, FileUp, Layers, Map as MapIcon, RotateCcw, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useI18n } from "../i18n/i18n";
import { LAYOUT_RULES, type LayoutKind, type LayoutRule, type PlantType } from "../plants";
import { download } from "../diagram/export";
import { usePersisted } from "../settings";
import { IconButton, NumberField, TextField } from "../ui/controls";
import { CadReadError, fitsDevice, readDrawing, type CadError } from "./cad";
import { drawingBounds, LENGTH_UNITS, METRES_PER_UNIT, type Drawing, type LengthUnit } from "./drawing";
import { toCsv, toGeoJson } from "./exports";
import { LayoutMap } from "./LayoutMap";
import { createProjector, utmProj, type Placement } from "./place";
import { recognize } from "./recognize";
import { buildScene, GREY } from "./scene";
import { fetchSample, SAMPLES } from "./samples";
import { looksProjected, sizeOf, unitAdvice } from "./where";

const COLORS = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#9333ea", "#0891b2", "#db2777", "#65a30d", "#475569"];
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

/** Opens a plant drawing, recognises and counts its objects, and shows it on the map. */
export function LayoutView({ plant, hidden }: { plant: PlantType; hidden: boolean }) {
    const { t, number } = useI18n();
    const [drawing, setDrawing] = useState<Drawing | null>(null);
    const [fileName, setFileName] = useState("");
    const [status, setStatus] = useState<"idle" | "loading" | Exclude<CadError, "cancelled">>("idle");
    const [elapsed, setElapsed] = useState(0);
    const reading = useRef<AbortController | null>(null);
    const lastRead = useRef<{ file: File; preset?: Placement | undefined } | null>(null);
    const [unit, setUnit] = useState<LengthUnit>("m");
    // Null until the user shows on the map where a drawing in local coordinates lies
    const [placement, setPlacement] = useState<Placement | null>(null);
    const [rules, setRules] = useState<LayoutRule[]>(() => [...LAYOUT_RULES[plant]]);
    const [satellite, setSatellite] = usePersisted("plantline.satellite", false, isBoolean);
    const [mapCentre, setMapCentre] = useState({ lat: 0, lon: 0 });
    const [fitNonce, setFitNonce] = useState(0);
    const [solar, setSolar] = useState({ modulesPerTable: 56, moduleWp: 550 });
    const [panelOpen, setPanelOpen] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    useEffect(() => setRules([...LAYOUT_RULES[plant]]), [plant]);

    const metres = METRES_PER_UNIT[unit];
    const bounds = useMemo(() => (drawing ? drawingBounds(drawing) : null), [drawing]);
    const centre = useMemo<[number, number]>(() => (bounds ? [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2] : [0, 0]), [bounds]);
    const projector = useMemo(() => (drawing && placement ? createProjector(placement, centre, metres) : null), [drawing, placement, centre, metres]);
    const advice = bounds ? unitAdvice(bounds, unit) : null;
    const zoneMissing = placement?.mode === "crs" && placement.proj === "";
    const recognition = useMemo(() => (drawing ? recognize(drawing, rules, metres) : null), [drawing, rules, metres]);
    const colorOf = useMemo(() => (kind: LayoutKind) => COLORS[rules.findIndex((rule) => rule.kind === kind) % COLORS.length] ?? GREY, [rules]);
    const scene = useMemo(() => {
        if (!drawing || !recognition || !projector) return null;
        const counted = new Set<string>(rules.filter((rule) => rule.measure === "count").map((rule) => rule.kind));
        return buildScene(drawing, recognition, { project: projector, metresPerUnit: metres, colorOf: (kind) => colorOf(kind as LayoutKind), isFilled: (kind) => counted.has(kind) });
    }, [drawing, recognition, projector, metres, colorOf, rules]);
    const kindName = (kind: LayoutKind) => t(`kind.${kind}`);

    useEffect(() => {
        if (status !== "loading") return;
        const started = Date.now();
        setElapsed(0);
        const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
        return () => clearInterval(timer);
    }, [status]);

    // A newer reading replaces an older one; only the newest may change what is shown
    const load = async (file: File, preset?: Placement) => {
        if (!fitsDevice(file) && !window.confirm(t("layout.largeConfirm", { size: number(file.size / 2 ** 20, 0) }))) return;
        reading.current?.abort();
        const controller = new AbortController();
        reading.current = controller;
        lastRead.current = { file, preset };
        setStatus("loading");
        try {
            const loaded = await readDrawing(file, controller.signal);
            if (reading.current !== controller) return;
            const loadedUnit = loaded.units === "unitless" ? "m" : loaded.units;
            setDrawing(loaded);
            setFileName(file.name);
            setUnit(loadedUnit);
            setPlacement(preset ?? suggestedPlacement(loaded, loadedUnit));
            setFitNonce((n) => n + 1);
            setStatus("idle");
        } catch (error) {
            if (reading.current !== controller) return;
            const code = error instanceof CadReadError ? error.code : "unreadable";
            setStatus(code === "cancelled" ? "idle" : code);
        } finally {
            if (reading.current === controller) reading.current = null;
        }
    };

    const openFile = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void load(file);
    };

    const openSample = () => {
        setStatus("loading");
        fetchSample(plant)
            .then((file) => load(file, SAMPLES[plant].placement))
            .catch(() => setStatus("unreadable"));
    };

    // While reading: the time so far and Cancel; after a failure: what happened and, where it may help, Try again
    const retry = lastRead.current;
    const readingStatus =
        status === "loading" ? (
            <div className="row reading">
                <p role="status">
                    {t("layout.loading")} <span className="muted">{t("layout.elapsed", { seconds: number(elapsed) })}</span>
                </p>
                <button type="button" className="button" onClick={() => reading.current?.abort()}>
                    {t("action.cancel")}
                </button>
            </div>
        ) : status !== "idle" ? (
            <>
                <p className="error" role="alert">
                    {t(`layout.error.${status}`)}
                </p>
                {(status === "missing" || status === "unreadable") && retry && (
                    <button type="button" className="button" onClick={() => void load(retry.file, retry.preset)}>
                        <RotateCcw size={16} aria-hidden="true" />
                        {t("layout.tryAgain")}
                    </button>
                )}
            </>
        ) : null;

    const fileButtons = (
        <>
            <button type="button" className="button primary" onClick={() => fileInput.current?.click()} disabled={status === "loading"}>
                <FileUp size={18} aria-hidden="true" />
                {t("layout.open")}
            </button>
            <input ref={fileInput} type="file" accept=".dwg,.dxf" hidden onChange={openFile} />
        </>
    );

    if (!drawing) {
        return (
            <section className="layout" id="view-layout" role="tabpanel" aria-labelledby="tab-layout" hidden={hidden}>
                <div className="layout-empty">
                    <MapIcon size={40} aria-hidden="true" />
                    <h2>{t("layout.title")}</h2>
                    <p>{t("layout.intro")}</p>
                    <div className="row">
                        {fileButtons}
                        <button type="button" className="button" onClick={openSample} disabled={status === "loading"}>
                            <Sparkles size={18} aria-hidden="true" />
                            {t("layout.sample", { plant: t(`plant.${plant}`) })}
                        </button>
                    </div>
                    {readingStatus}
                    <p className="muted small">{t("layout.private")}</p>
                </div>
            </section>
        );
    }

    const fitKey = `${fileName}:${unit}:${fitNonce}:${placement === null ? "none" : placement.mode === "crs" ? placement.proj : "point"}`;
    const tables = recognition?.totals.find((total) => total.kind === "pvTable")?.count ?? 0;
    const kwp = (tables * solar.modulesPerTable * solar.moduleWp) / 1000;
    const baseName = fileName.replace(/\.(dwg|dxf)$/i, "");
    const amount = (lengthM: number) => (lengthM >= 1000 ? `${number(lengthM / 1000, 2)} km` : `${number(lengthM, 1)} m`);
    const useUnit = (next: LengthUnit) => {
        setUnit(next);
        // Not placed yet: where it lies may look different in the right unit
        if (placement === null || zoneMissing) setPlacement(suggestedPlacement(drawing, next));
    };
    // Over the map: a unit that looks wrong, then what placing the drawing still needs
    const notices = (
        <div className="map-notices">
            {advice && bounds && (
                <p className="map-banner" role="status">
                    {t("layout.unitAdvice", { unit, size: amount(sizeOf(bounds, unit)), suggested: advice })}
                    <button type="button" className="button" onClick={() => useUnit(advice)}>
                        {t("layout.useUnit", { unit: advice })}
                    </button>
                </p>
            )}
            {placement === null && <p className="map-banner">{t("layout.pick")}</p>}
            {zoneMissing && <p className="map-banner">{t("layout.zonePrompt", { section: t("layout.placement") })}</p>}
        </div>
    );

    return (
        <section className="layout" id="view-layout" role="tabpanel" aria-labelledby="tab-layout" hidden={hidden}>
            <div className="layout-body">
                <div className="map-area">
                    <LayoutMap
                        scene={scene}
                        placement={placement ?? { mode: "crs", proj: "" }}
                        onPlace={setPlacement}
                        moveLabel={t("layout.move")}
                        turnLabel={t("layout.turn")}
                        satellite={satellite}
                        fitKey={fitKey}
                        active={!hidden}
                        label={t("layout.map")}
                        onMove={setMapCentre}
                        picking={placement === null}
                        onPick={({ lat, lon }) => {
                            setPlacement({ mode: "point", lat, lon, rotationDeg: 0 });
                            setFitNonce((n) => n + 1);
                        }}
                    />
                    {notices}
                    <div className="map-tools">
                        <IconButton label={t("layout.satellite")} pressed={satellite} onClick={() => setSatellite(!satellite)}>
                            <Layers size={18} />
                        </IconButton>
                        <IconButton label={t("action.fit")} onClick={() => setFitNonce((n) => n + 1)}>
                            <Crosshair size={18} />
                        </IconButton>
                    </div>
                </div>
                <aside className={panelOpen ? "panel layout-panel open" : "panel layout-panel"} aria-label={t("layout.details")}>
                    <header className="panel-header">
                        <h2 title={fileName}>{fileName}</h2>
                        <div className="row">
                            <IconButton label={t("layout.close")} onClick={() => setDrawing(null)}>
                                <X size={18} />
                            </IconButton>
                            <IconButton label={t("action.close")} className="sheet-close" onClick={() => setPanelOpen(false)}>
                                <ChevronDown size={18} />
                            </IconButton>
                        </div>
                    </header>
                    {readingStatus}
                    {(drawing.truncated || recognition?.complete === false) && <p className="banner error">{t("layout.truncated")}</p>}

                    <h3>{t("layout.objects")}</h3>
                    <table className="totals">
                        <tbody>
                            {recognition?.totals.map((total) => (
                                <tr key={total.kind} className={total.count === 0 ? "muted" : undefined}>
                                    <td>
                                        <span className="dot" style={{ background: colorOf(total.kind) }} />
                                        {kindName(total.kind)}
                                    </td>
                                    <td>{total.measure === "length" ? amount(total.lengthM) : number(total.count)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {plant === "solar" && (
                        <div className="solar">
                            <NumberField label={t("layout.modulesPerTable")} value={solar.modulesPerTable} onCommit={(value) => setSolar({ ...solar, modulesPerTable: value ?? 0 })} />
                            <NumberField label={t("layout.moduleWp")} unit="Wp" value={solar.moduleWp} onCommit={(value) => setSolar({ ...solar, moduleWp: value ?? 0 })} />
                            <p className="capacity">
                                {t("layout.capacity")}: <strong>{kwp >= 1000 ? `${number(kwp / 1000, 2)} MWp` : `${number(kwp, 1)} kWp`}</strong>
                            </p>
                        </div>
                    )}

                    <h3>{t("layout.placement")}</h3>
                    <label className="field">
                        <span>{t("layout.units")}</span>
                        <select value={unit} onChange={(event) => useUnit(event.target.value as LengthUnit)}>
                            {LENGTH_UNITS.filter((u) => u !== "unitless").map((u) => (
                                <option key={u} value={u}>
                                    {u}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="segmented" role="radiogroup" aria-label={t("layout.placement")}>
                        <button type="button" role="radio" aria-checked={placement?.mode !== "crs"} onClick={() => placement?.mode === "crs" && setPlacement(null)}>
                            {t("layout.modePoint")}
                        </button>
                        <button type="button" role="radio" aria-checked={placement?.mode === "crs"} onClick={() => placement?.mode !== "crs" && setPlacement({ mode: "crs", proj: "" })}>
                            {t("layout.modeCrs")}
                        </button>
                    </div>
                    {placement === null ? (
                        <p className="hint">{t("layout.pick")}</p>
                    ) : placement.mode === "point" ? (
                        <>
                            <div className="row">
                                <NumberField signed label={t("layout.latitude")} value={round(placement.lat)} onCommit={(lat) => setPlacement({ ...placement, lat: Math.max(-85, Math.min(85, lat ?? 0)) })} />
                                <NumberField signed label={t("layout.longitude")} value={round(placement.lon)} onCommit={(lon) => setPlacement({ ...placement, lon: Math.max(-180, Math.min(180, lon ?? 0)) })} />
                            </div>
                            <button type="button" className="button" onClick={() => setPlacement({ ...placement, lat: mapCentre.lat, lon: mapCentre.lon })}>
                                <Crosshair size={16} aria-hidden="true" />
                                {t("layout.placeHere")}
                            </button>
                            <label className="field">
                                <span>
                                    {t("layout.rotation")} <small>({placement.rotationDeg}°)</small>
                                </span>
                                <input type="range" min={-180} max={180} step={0.5} value={placement.rotationDeg} onChange={(event) => setPlacement({ ...placement, rotationDeg: Number(event.target.value) })} />
                            </label>
                        </>
                    ) : (
                        <>
                            <label className="field">
                                <span>{t("layout.utm")}</span>
                                <select value={utmZoneOf(placement.proj)} onChange={(event) => setPlacement({ mode: "crs", proj: event.target.value })}>
                                    <option value="">—</option>
                                    {Array.from({ length: 60 }, (_, i) => i + 1).flatMap((zone) =>
                                        [false, true].map((south) => (
                                            <option key={`${zone}${south}`} value={utmProj(zone, south)}>
                                                {zone}
                                                {south ? "S" : "N"}
                                            </option>
                                        )),
                                    )}
                                </select>
                            </label>
                            <TextField label={t("layout.proj")} value={placement.proj} maxLength={500} onCommit={(proj) => setPlacement({ mode: "crs", proj })} />
                            {zoneMissing ? <p className="hint">{t("layout.zonePrompt", { section: t("layout.placement") })}</p> : !projector && <p className="error">{t("layout.projInvalid")}</p>}
                        </>
                    )}

                    <details className="rules">
                        <summary>{t("layout.rules")}</summary>
                        <p className="muted small">{t("layout.rulesHint")}</p>
                        {rules.map((rule, index) => (
                            <label key={rule.kind} className="field">
                                <span>
                                    <span className="dot" style={{ background: colorOf(rule.kind) }} />
                                    {kindName(rule.kind)}
                                </span>
                                <input
                                    value={rule.pattern}
                                    maxLength={200}
                                    aria-invalid={recognition?.invalidRules.includes(index)}
                                    onChange={(event) => setRules(rules.map((r, i) => (i === index ? { ...r, pattern: event.target.value } : r)))}
                                />
                            </label>
                        ))}
                        <button type="button" className="button" onClick={() => setRules([...LAYOUT_RULES[plant]])}>
                            <RotateCcw size={16} aria-hidden="true" />
                            {t("layout.resetRules")}
                        </button>
                    </details>

                    <h3>{t("layout.export")}</h3>
                    <div className="row">
                        <button type="button" className="button" disabled={!projector} onClick={() => projector && recognition && download(`${baseName}.geojson`, toGeoJson(drawing, recognition, projector), "application/geo+json")}>
                            <Download size={16} aria-hidden="true" />
                            GeoJSON
                        </button>
                        <button type="button" className="button" onClick={() => recognition && download(`${baseName}.csv`, toCsv(recognition.totals, kindName), "text/csv")}>
                            <Download size={16} aria-hidden="true" />
                            CSV
                        </button>
                    </div>
                    <div className="row">{fileButtons}</div>
                </aside>
            </div>
            <nav className="mobile-bar" aria-label={t("layout.details")}>
                <button type="button" className="button" onClick={() => setPanelOpen(!panelOpen)}>
                    <SlidersHorizontal size={18} aria-hidden="true" />
                    {t("layout.details")}
                </button>
            </nav>
        </section>
    );
}

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/** Map coordinates (the zone still to choose) when the coordinates look projected; else null, to be shown on the map. */
function suggestedPlacement(drawing: Drawing | null, unit: LengthUnit): Placement | null {
    const bounds = drawing && drawingBounds(drawing);
    return bounds && looksProjected(bounds, unit) ? { mode: "crs", proj: "" } : null;
}
const utmZoneOf = (proj: string) => (/^\+proj=utm \+zone=\d+( \+south)? \+datum=WGS84 \+units=m \+no_defs$/.test(proj) ? proj : "");
