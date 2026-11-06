import { useI18n } from "../i18n/i18n";
import { PALETTES, type NodeKind, type PlantType } from "../plants";
import { SymbolIcon } from "./symbols";

/** The elements of the plant type: one tap adds one in the middle of the view. */
export function Palette({ plant, onAdd }: { plant: PlantType; onAdd: (kind: NodeKind) => void }) {
    const { t } = useI18n();
    return (
        <div className="palette">
            <p className="hint">{t("palette.hint")}</p>
            <ul className="palette-grid">
                {PALETTES[plant].map((kind) => (
                    <li key={kind}>
                        <button type="button" onClick={() => onAdd(kind)}>
                            <SymbolIcon kind={kind} />
                            <span>{t(`kind.${kind}`)}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
