import { Check, EllipsisVertical, Map as MapIcon, Monitor, Moon, Network, Sun } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { DiagramEditor, type DiagramEditorHandle } from "./diagram/DiagramEditor";
import { SymbolIcon } from "./diagram/symbols";
import { useI18n } from "./i18n/i18n";
import { Flag } from "./i18n/Flag";
import { LANGUAGES } from "./i18n/languages";
import { PlantPicker } from "./PlantPicker";
import { isPlantType, PLANT_ICONS, PLANT_TYPES, type PlantType } from "./plants";
import { usePersisted } from "./settings";
import { IconButton, Popover, Select } from "./ui/controls";
import { Logo } from "./ui/Logo";

type View = "diagram" | "layout";
type Theme = "light" | "dark" | "system";

const isView = (value: unknown): value is View => value === "diagram" || value === "layout";
const isTheme = (value: unknown): value is Theme => value === "light" || value === "dark" || value === "system";
const isPlantOrNone = (value: unknown): value is PlantType | null => value === null || isPlantType(value);
// The plant layout (map, coordinate systems, drawing reader) loads the first time it is opened
const LayoutView = lazy(() => import("./layout/LayoutView").then((module) => ({ default: module.LayoutView })));

const darkQuery = () => (typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null);

/** Whether the system asks for dark colours, following it as it changes. */
function useSystemDark() {
    const [dark, setDark] = useState(() => darkQuery()?.matches ?? false);
    useEffect(() => {
        const query = darkQuery();
        const change = () => setDark(query?.matches ?? false);
        query?.addEventListener("change", change);
        return () => query?.removeEventListener("change", change);
    }, []);
    return dark;
}

export function App() {
    const { t, lang, setLang } = useI18n();
    const [plant, setPlant] = usePersisted<PlantType | null>("plantline.plant", null, isPlantOrNone);
    const [view, setView] = usePersisted<View>("plantline.view", "diagram", isView);
    const [theme, setTheme] = usePersisted<Theme>("plantline.theme", "system", isTheme);
    const systemDark = useSystemDark();
    const dark = theme === "dark" || (theme === "system" && systemDark);
    const current = plant ?? "solar";
    const [layoutOpened, setLayoutOpened] = useState(view === "layout");

    useEffect(() => {
        document.documentElement.dataset.theme = dark ? "dark" : "light";
    }, [dark]);

    const editor = useRef<DiagramEditorHandle>(null);

    // The plant type and language as pills on wide screens; on phones they move into the settings menu
    const plantSelect = (
        <Select
            className="pill"
            label={t("plant.label")}
            value={current}
            options={PLANT_TYPES.map((type) => ({ value: type, label: t(`plant.${type}`), icon: <SymbolIcon kind={PLANT_ICONS[type]} size={20} /> }))}
            onChange={setPlant}
        />
    );
    // In the settings menu, choosing a language closes the menu
    const languageSelect = (after?: () => void) => (
        <Select
            className="pill"
            label={t("settings.language")}
            value={lang}
            options={LANGUAGES.map((language) => ({ value: language.code, label: language.name, lang: language.code, icon: <Flag code={language.code} /> }))}
            onChange={(code) => {
                setLang(code);
                after?.();
            }}
        />
    );

    return (
        <>
            <div className="app">
                <header className="app-header">
                    {/* The logo starts a new diagram */}
                    <button
                        type="button"
                        className="brand"
                        title={t("file.new")}
                        aria-label={`plantline, ${t("file.new")}`}
                        onClick={() => {
                            setView("diagram");
                            editor.current?.startNew();
                        }}
                    >
                        <Logo size={30} />
                        <span className="brand-name">
                            plant<span className="brand-accent">line</span>
                        </span>
                    </button>
                    <nav className="tabs" role="tablist" aria-label={t("nav.label")}>
                        {(["diagram", "layout"] as const).map((name) => (
                            <button
                                key={name}
                                type="button"
                                role="tab"
                                id={`tab-${name}`}
                                // The plant layout's panel is there only once it was first opened
                                aria-controls={name === "diagram" || layoutOpened ? `view-${name}` : undefined}
                                aria-selected={view === name}
                                aria-label={t(`nav.${name}`)}
                                onClick={() => {
                                    setView(name);
                                    if (name === "layout") setLayoutOpened(true);
                                }}
                            >
                                {name === "diagram" ? <Network size={17} aria-hidden="true" /> : <MapIcon size={17} aria-hidden="true" />}
                                <span className="long">{t(`nav.${name}`)}</span>
                                <span className="short">{t(`nav.${name}Short`)}</span>
                            </button>
                        ))}
                    </nav>
                    <div className="header-tools">
                        {plantSelect}
                        {languageSelect()}
                        <IconButton className="ghost" label={t(dark ? "settings.light" : "settings.dark")} onClick={() => setTheme(dark ? "light" : "dark")}>
                            {dark ? <Sun size={19} /> : <Moon size={19} />}
                        </IconButton>
                    </div>
                    <div className="header-menu">
                        <Popover label={t("settings.menu")} icon={<EllipsisVertical size={20} />}>
                            {(close) => (
                                <>
                                    <p className="popover-label">{t("plant.label")}</p>
                                    <div role="radiogroup" aria-label={t("plant.label")} className="popover-options">
                                        {PLANT_TYPES.map((type) => (
                                            <button
                                                key={type}
                                                type="button"
                                                role="radio"
                                                aria-checked={type === current}
                                                onClick={() => {
                                                    setPlant(type);
                                                    close();
                                                }}
                                            >
                                                <SymbolIcon kind={PLANT_ICONS[type]} size={20} />
                                                {t(`plant.${type}`)}
                                                {type === current && <Check className="check-mark" size={16} aria-hidden="true" />}
                                            </button>
                                        ))}
                                    </div>
                                    <hr />
                                    <p className="popover-label">{t("settings.language")}</p>
                                    {languageSelect(close)}
                                    <hr />
                                    <p className="popover-label">{t("theme.label")}</p>
                                    <div className="segmented" role="radiogroup" aria-label={t("theme.label")}>
                                        {(
                                            [
                                                ["light", Sun],
                                                ["system", Monitor],
                                                ["dark", Moon],
                                            ] as const
                                        ).map(([value, Icon]) => (
                                            <button key={value} type="button" role="radio" aria-checked={theme === value} onClick={() => setTheme(value)}>
                                                <Icon size={15} aria-hidden="true" />
                                                {t(`theme.${value}`)}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </Popover>
                    </div>
                </header>
                <main className="app-main">
                    <DiagramEditor ref={editor} plant={current} onPlantChange={setPlant} hidden={view !== "diagram"} />
                    {layoutOpened && (
                        <Suspense fallback={<section className="layout" id="view-layout" role="tabpanel" aria-labelledby="tab-layout" aria-busy="true" hidden={view !== "layout"} />}>
                            <LayoutView plant={current} onPlantChange={setPlant} hidden={view !== "layout"} />
                        </Suspense>
                    )}
                </main>
            </div>
            {plant === null && <PlantPicker onPick={setPlant} />}
        </>
    );
}
