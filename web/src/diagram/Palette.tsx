import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n/i18n";
import { ChevronDown, GripVertical, Search } from "lucide-react";
import { PALETTE_GROUPS, PALETTES, type NodeKind, type PlantType } from "../plants";
import type { Point } from "./model";
import { SymbolIcon } from "./symbols";

interface Props {
    plant: PlantType;
    /** Adds an element where it was dropped, or (a tap) at the free spot nearest the middle of the view. */
    onAdd: (kind: NodeKind, at?: Point) => void;
    /** The point of the diagram under the pointer, or null where the drawing is not what shows there. */
    dropPoint: (clientX: number, clientY: number) => Point | null;
    /** A drag starts or ends: a phone hides the palette sheet meanwhile, so the drawing shows. */
    onDragging: (dragging: boolean) => void;
}

interface Ghost {
    kind: NodeKind;
    x: number;
    y: number;
    over: boolean;
}

const DRAG_THRESHOLD = 6;
// A finger scrolls the palette; held still this long, it picks the element up instead
const LONG_PRESS_MS = 250;

/**
 * The elements of the plant type in groups, with a search: drag one onto the drawing, or tap it to add it in the middle
 * of the view.
 */
export function Palette({ plant, onAdd, dropPoint, onDragging }: Props) {
    const { t, number } = useI18n();
    const [ghost, setGhost] = useState<Ghost | null>(null);
    const [query, setQuery] = useState("");
    const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
    const dragged = useRef(false);
    const stop = useRef<(() => void) | null>(null);
    useEffect(() => () => stop.current?.(), []);

    const startDrag = (kind: NodeKind, down: ReactPointerEvent<HTMLButtonElement>) => {
        if (down.button !== 0) return;
        stop.current?.();
        dragged.current = false;
        const touch = down.pointerType === "touch";
        const start = { x: down.clientX, y: down.clientY };
        let active = false;
        const show = (x: number, y: number) => setGhost({ kind, x, y, over: dropPoint(x, y) !== null });
        const begin = (x: number, y: number) => {
            active = dragged.current = true;
            onDragging(true);
            show(x, y);
        };
        const timer = touch ? setTimeout(() => begin(start.x, start.y), LONG_PRESS_MS) : undefined;

        const move = (event: PointerEvent) => {
            if (event.pointerId !== down.pointerId) return;
            if (!active) {
                if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_THRESHOLD) return;
                if (touch) return end(); // the finger is scrolling the palette
                begin(event.clientX, event.clientY);
            }
            show(event.clientX, event.clientY);
        };
        const up = (event: PointerEvent) => {
            if (event.pointerId !== down.pointerId) return;
            const at = active && event.type === "pointerup" ? dropPoint(event.clientX, event.clientY) : null;
            end();
            if (at) onAdd(kind, at);
        };
        // Once the element is picked up, a moving finger drags it instead of scrolling the page
        const holdPage = (event: TouchEvent) => {
            if (active) event.preventDefault();
        };
        const end = () => {
            clearTimeout(timer);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
            window.removeEventListener("touchmove", holdPage);
            stop.current = null;
            if (active) {
                setGhost(null);
                onDragging(false);
            }
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
        window.addEventListener("touchmove", holdPage, { passive: false });
        stop.current = end;
    };

    // The plant type's elements in their groups, those matching the search; a search opens every group
    const words = query.trim().toLocaleLowerCase();
    const groups = PALETTE_GROUPS.map((group) => ({
        ...group,
        // In the plant type's own order (its main equipment first)
        kinds: PALETTES[plant].filter((kind) => group.kinds.includes(kind) && (!words || t(`kind.${kind}`).toLocaleLowerCase().includes(words))),
    })).filter((group) => group.kinds.length > 0);

    return (
        <div className="palette">
            <p className="hint">
                <span className="pointer-hint">{t("palette.hint")}</span>
                <span className="touch-hint">{t("palette.touch")}</span>
            </p>
            <label className="search-field">
                <Search size={16} aria-hidden="true" />
                <input type="search" value={query} aria-label={t("palette.search")} placeholder={t("palette.search")} onChange={(event) => setQuery(event.target.value)} />
            </label>
            {groups.length === 0 && <p className="muted small">{t("palette.none")}</p>}
            {groups.map((group) => {
                const open = words !== "" || !closed.has(group.id);
                return (
                    <section key={group.id} className="palette-group">
                        <h3>
                            <button type="button" aria-expanded={open} onClick={() => setClosed((before) => (before.has(group.id) ? new Set([...before].filter((id) => id !== group.id)) : new Set([...before, group.id])))}>
                                <ChevronDown className="chevron" size={14} aria-hidden="true" />
                                {group.id === "plant" ? t(`plant.${plant}`) : t(`palette.group.${group.id}`)}
                                <span className="count">{number(group.kinds.length)}</span>
                            </button>
                        </h3>
                        {open && (
                            <ul className="palette-list">
                                {group.kinds.map((kind) => (
                                    <li key={kind}>
                                        <button
                                            type="button"
                                            onPointerDown={(event) => startDrag(kind, event)}
                                            onClick={() => {
                                                if (!dragged.current) onAdd(kind);
                                                dragged.current = false;
                                            }}
                                            onContextMenu={(event) => event.preventDefault()}
                                        >
                                            <SymbolIcon kind={kind} size={26} />
                                            {t(`kind.${kind}`)}
                                            <GripVertical className="grip" size={15} aria-hidden="true" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                );
            })}
            {ghost &&
                createPortal(
                    <div className={ghost.over ? "palette-ghost over" : "palette-ghost"} style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
                        <SymbolIcon kind={ghost.kind} size={40} />
                    </div>,
                    document.body,
                )}
        </div>
    );
}
