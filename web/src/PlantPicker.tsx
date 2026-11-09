import { useI18n } from "./i18n/i18n";
import { PLANT_ICONS, PLANT_TYPES, type PlantType } from "./plants";
import { SymbolIcon } from "./diagram/symbols";
import { trapFocus } from "./ui/focus";

/** Asked on the first visit: the plant type decides the diagram elements and how drawings are read. */
export function PlantPicker({ onPick }: { onPick: (plant: PlantType) => void }) {
    const { t } = useI18n();
    return (
        <div className="overlay">
            <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="picker-title" onKeyDown={trapFocus}>
                <h1 id="picker-title">{t("start.title")}</h1>
                <p>{t("start.intro")}</p>
                <ul className="plant-grid">
                    {PLANT_TYPES.map((plant, index) => (
                        <li key={plant}>
                            <button type="button" autoFocus={index === 0} onClick={() => onPick(plant)}>
                                <SymbolIcon kind={PLANT_ICONS[plant]} size={44} />
                                <span>{t(`plant.${plant}`)}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
