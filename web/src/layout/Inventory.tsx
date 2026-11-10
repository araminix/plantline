import { Eye, EyeOff, Search } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../i18n/i18n";
import { LAYOUT_KINDS, MEASURE, type LayoutKind } from "../plants";
import { IconButton, Select } from "../ui/controls";
import type { Assignments, Inventory as Contents } from "./recognize";

interface Props {
    contents: Contents;
    assignments: Assignments;
    onAssign: (assignments: Assignments) => void;
    hidden: ReadonlySet<string>;
    onToggle: (layer: string) => void;
    /** What the name patterns make of a block or a layer, shown as "Automatic". */
    automatic: (name: string, of: "blocks" | "layers") => LayoutKind | null;
}

const COUNTED = LAYOUT_KINDS.filter((kind) => MEASURE[kind] === "count");

/** The drawing's own blocks and layers with their counts: choose what each is, and show or hide layers. */
export function Inventory({ contents, assignments, onAssign, hidden, onToggle, automatic }: Props) {
    const { t, number } = useI18n();
    const [query, setQuery] = useState("");
    const found = (name: string) => name.toLowerCase().includes(query.trim().toLowerCase());

    const choice = (name: string, of: "blocks" | "layers") => {
        const auto = automatic(name, of);
        const value = Object.hasOwn(assignments[of], name) ? assignments[of][name]! : "";
        const set = (next: string) => {
            const { [name]: _, ...rest } = assignments[of];
            onAssign({ ...assignments, [of]: next === "" ? rest : { ...rest, [name]: next } });
        };
        return (
            <Select
                label={name}
                value={value}
                options={[
                    { value: "", label: auto ? t("layout.automatic", { kind: t(`kind.${auto}`) }) : t("layout.automaticNone") },
                    { value: "none", label: t("layout.notCounted") },
                    ...(of === "blocks" ? [{ value: "skip", label: t("layout.leaveOut") }] : []),
                    ...(of === "blocks" ? COUNTED : LAYOUT_KINDS).map((kind) => ({ value: kind, label: t(`kind.${kind}`) })),
                ]}
                onChange={set}
            />
        );
    };

    return (
        <details className="card inventory">
            <summary>
                <h3>{t("layout.inventory")}</h3>
                <span className="summary-text">{t("layout.inventorySummary", { layers: t("count.layers", { count: contents.layers.length }), blocks: t("count.blocks", { count: contents.blocks.length }) })}</span>
            </summary>
            <p className="hint">{t("layout.inventoryHint")}</p>
            <label className="search-field">
                <Search size={16} aria-hidden="true" />
                <input type="search" aria-label={t("layout.search")} placeholder={t("layout.search")} value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <h4>{t("layout.blocks")}</h4>
            <ul className="inventory-list">
                {contents.blocks
                    .filter((block) => found(block.name))
                    .map((block) => (
                        <li key={block.name}>
                            <span className="inventory-name" title={block.name} dir="auto">
                                {block.name}
                            </span>
                            <span className="muted">{number(block.copies)}</span>
                            {choice(block.name, "blocks")}
                        </li>
                    ))}
            </ul>
            <h4>{t("layout.layers")}</h4>
            <ul className="inventory-list">
                {contents.layers
                    .filter((layer) => found(layer.name))
                    .map((layer) => (
                        <li key={layer.name} className={hidden.has(layer.name) ? "hidden-layer" : undefined}>
                            <span className="inventory-name" title={layer.name} dir="auto">
                                {layer.name}
                            </span>
                            <span className="muted">{number(layer.shapes + layer.references)}</span>
                            <IconButton label={`${t("layout.showLayer")}: ${layer.name}`} pressed={!hidden.has(layer.name)} onClick={() => onToggle(layer.name)}>
                                {hidden.has(layer.name) ? <EyeOff size={16} /> : <Eye size={16} />}
                            </IconButton>
                            {choice(layer.name, "layers")}
                        </li>
                    ))}
            </ul>
        </details>
    );
}
