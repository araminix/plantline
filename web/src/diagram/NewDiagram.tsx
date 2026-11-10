import { FilePlus, Save, Sparkles, SquareDashed, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../i18n/i18n";
import { PLANT_ICONS, PLANT_TYPES, type PlantType } from "../plants";
import { Dialog } from "../ui/Dialog";
import { SymbolIcon } from "./symbols";

export type Start = "empty" | "example";

/**
 * Starts a diagram: its plant type, an empty sheet or the plant type's example, and its name. When a diagram is open,
 * it says that diagram is replaced (Undo brings it back) and offers to save it first.
 */
export function NewDiagram(props: { plant: PlantType; start: Start; replacing: boolean; onSave: () => void; onCreate: (plant: PlantType, start: Start, name: string) => void; onClose: () => void }) {
    const { plant, start, replacing, onSave, onCreate, onClose } = props;
    const { t } = useI18n();
    const [chosen, setChosen] = useState(plant);
    const [from, setFrom] = useState(start);
    const [name, setName] = useState("");

    return (
        <Dialog title={t("file.new")} icon={<FilePlus size={20} aria-hidden="true" />} onClose={onClose} className="new-diagram">
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    onCreate(chosen, from, name.trim());
                }}
            >
                <fieldset>
                    <legend>{t("plant.label")}</legend>
                    <div className="choice-tiles">
                        {PLANT_TYPES.map((type) => (
                            <label key={type} className="choice-tile">
                                <input type="radio" name="plant" value={type} checked={type === chosen} data-autofocus={type === chosen || undefined} onChange={() => setChosen(type)} />
                                <SymbolIcon kind={PLANT_ICONS[type]} size={28} />
                                <span>{t(`plant.${type}`)}</span>
                            </label>
                        ))}
                    </div>
                </fieldset>
                <fieldset>
                    <legend>{t("new.start")}</legend>
                    <div className="choice-cards">
                        {(
                            [
                                ["empty", SquareDashed],
                                ["example", Sparkles],
                            ] as const
                        ).map(([value, Icon]) => (
                            <label key={value} className="choice-card">
                                <input type="radio" name="start" value={value} checked={value === from} onChange={() => setFrom(value)} />
                                <Icon size={20} aria-hidden="true" />
                                <span>
                                    <strong>{t(`new.${value}`)}</strong>
                                    <small>{t(`new.${value}Hint`)}</small>
                                </span>
                            </label>
                        ))}
                    </div>
                </fieldset>
                <label className="field">
                    <span>{t("field.name")}</span>
                    <input dir="auto" maxLength={200} value={name} placeholder={from === "example" ? t("example.name", { plant: t(`plant.${chosen}`) }) : undefined} onChange={(event) => setName(event.target.value)} />
                </label>
                {replacing && (
                    <div className="dialog-note">
                        <TriangleAlert size={18} aria-hidden="true" />
                        <p>{t("new.replaces")}</p>
                        <button type="button" className="button" onClick={onSave}>
                            <Save size={16} aria-hidden="true" />
                            {t("file.save")}
                        </button>
                    </div>
                )}
                <footer className="dialog-actions">
                    <button type="button" className="button" onClick={onClose}>
                        {t("action.cancel")}
                    </button>
                    <button type="submit" className="button primary">
                        {t("new.create")}
                    </button>
                </footer>
            </form>
        </Dialog>
    );
}
