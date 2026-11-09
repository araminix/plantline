import { Map as MapIcon, Moon, Network, Sun } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { DiagramEditor } from "./diagram/DiagramEditor";
import { useI18n } from "./i18n/i18n";
import { isLanguage, LANGUAGES } from "./i18n/languages";
import { PlantPicker } from "./PlantPicker";
import { isPlantType, PLANT_TYPES, type PlantType } from "./plants";
import { usePersisted } from "./settings";
import { IconButton } from "./ui/controls";
import { Logo } from "./ui/Logo";

type View = "diagram" | "layout";
type Theme = "light" | "dark";

const isView = (value: unknown): value is View => value === "diagram" || value === "layout";
const isTheme = (value: unknown): value is Theme => value === "light" || value === "dark";
const isPlantOrNone = (value: unknown): value is PlantType | null => value === null || isPlantType(value);
// The plant layout (map, coordinate systems, drawing reader) loads the first time it is opened
const LayoutView = lazy(() => import("./layout/LayoutView").then((module) => ({ default: module.LayoutView })));

const prefersDark = () => typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;

export function App() {
    const { t, lang, setLang } = useI18n();
    const [plant, setPlant] = usePersisted<PlantType | null>("plantline.plant", null, isPlantOrNone);
    const [view, setView] = usePersisted<View>("plantline.view", "diagram", isView);
    const [theme, setTheme] = usePersisted<Theme>("plantline.theme", prefersDark() ? "dark" : "light", isTheme);
    const current = plant ?? "solar";
    const [layoutOpened, setLayoutOpened] = useState(view === "layout");

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
    }, [theme]);

    return (
        <>
            <div className="app">
                <header className="app-header">
                    <a className="brand" href="./">
                        <Logo size={28} />
                        <span>
                            plant<span className="brand-accent">line</span>
                        </span>
                    </a>
                    <nav className="tabs" role="tablist" aria-label={t("nav.label")}>
                        {(["diagram", "layout"] as const).map((name) => (
                            <button
                                key={name}
                                type="button"
                                role="tab"
                                id={`tab-${name}`}
                                aria-controls={`view-${name}`}
                                aria-selected={view === name}
                                onClick={() => {
                                    setView(name);
                                    if (name === "layout") setLayoutOpened(true);
                                }}
                            >
                                {name === "diagram" ? <Network size={18} aria-hidden="true" /> : <MapIcon size={18} aria-hidden="true" />}
                                <span>{t(`nav.${name}`)}</span>
                            </button>
                        ))}
                    </nav>
                    <div className="header-tools">
                        <label className="select">
                            <span className="sr-only">{t("plant.label")}</span>
                            <select value={current} onChange={(event) => setPlant(event.target.value as PlantType)}>
                                {PLANT_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                        {t(`plant.${type}`)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="select">
                            <span className="sr-only">{t("settings.language")}</span>
                            <select value={lang} onChange={(event) => isLanguage(event.target.value) && setLang(event.target.value)}>
                                {LANGUAGES.map((language) => (
                                    <option key={language.code} value={language.code} lang={language.code}>
                                        {language.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <IconButton label={t(theme === "dark" ? "settings.light" : "settings.dark")} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                        </IconButton>
                    </div>
                </header>
                <main className="app-main">
                    <DiagramEditor plant={current} onPlantChange={setPlant} hidden={view !== "diagram"} />
                    {layoutOpened && (
                        <Suspense fallback={null}>
                            <LayoutView plant={current} hidden={view !== "layout"} />
                        </Suspense>
                    )}
                </main>
            </div>
            {plant === null && <PlantPicker onPick={setPlant} />}
        </>
    );
}
