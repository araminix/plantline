import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** A button showing only an icon; the label is its tooltip and accessible name. */
export function IconButton(props: { label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; className?: string; children: ReactNode }) {
    const { label, onClick, disabled, pressed, className, children } = props;
    return (
        <button type="button" className={className ? `icon-button ${className}` : "icon-button"} title={label} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
            {children}
        </button>
    );
}

export interface MenuItem {
    label: string;
    icon: ReactNode;
    onSelect: () => void;
}

/**
 * A button opening a list of actions. The list is drawn over the page (a portal), placed under the button and
 * mirrored in right-to-left languages, so no scrolling toolbar or panel can clip or cover it. Arrow keys, Home and End
 * move between items; Escape, Tab or a click elsewhere closes it and focus returns to the button.
 */
export function Menu({ label, icon, items }: { label: string; icon: ReactNode; items: MenuItem[] }) {
    const [place, setPlace] = useState<CSSProperties | null>(null);
    const button = useRef<HTMLButtonElement>(null);
    const list = useRef<HTMLDivElement>(null);
    const id = useId();

    const close = (refocus: boolean) => {
        setPlace(null);
        if (refocus) button.current?.focus();
    };

    const toggle = () => {
        if (place) return close(false);
        const box = button.current!.getBoundingClientRect();
        const rtl = getComputedStyle(button.current!).direction === "rtl";
        setPlace({ top: box.bottom + 4, ...(rtl ? { right: document.documentElement.clientWidth - box.right } : { left: box.left }) });
    };

    useEffect(() => {
        if (!place) return;
        list.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
        const outside = (event: Event) => {
            const target = event.target as Node;
            if (!list.current?.contains(target) && !button.current?.contains(target)) close(false);
        };
        const away = () => close(false);
        document.addEventListener("pointerdown", outside);
        window.addEventListener("resize", away);
        window.addEventListener("scroll", away, true);
        return () => {
            document.removeEventListener("pointerdown", outside);
            window.removeEventListener("resize", away);
            window.removeEventListener("scroll", away, true);
        };
    }, [place]);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const entries = [...list.current!.querySelectorAll<HTMLButtonElement>("[role=menuitem]")];
        const at = entries.indexOf(document.activeElement as HTMLButtonElement);
        const go = (index: number) => entries[(index + entries.length) % entries.length]?.focus();
        if (event.key === "ArrowDown") go(at + 1);
        else if (event.key === "ArrowUp") go(at - 1);
        else if (event.key === "Home") go(0);
        else if (event.key === "End") go(entries.length - 1);
        else if (event.key === "Escape") close(true);
        else if (event.key === "Tab") close(false);
        else return;
        event.preventDefault();
    };

    return (
        <>
            <button ref={button} type="button" className="button" aria-haspopup="menu" aria-expanded={!!place} aria-controls={id} onClick={toggle}>
                {icon}
                <span>{label}</span>
            </button>
            {place &&
                createPortal(
                    <div ref={list} className="menu-list" role="menu" id={id} aria-label={label} style={place} onKeyDown={onKeyDown}>
                        {items.map((item) => (
                            <button
                                key={item.label}
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    close(true);
                                    item.onSelect();
                                }}
                            >
                                {item.icon}
                                {item.label}
                            </button>
                        ))}
                    </div>,
                    document.body,
                )}
        </>
    );
}

/** A text field that saves when it loses focus or on Enter, so typing a name is one undo step. */
export function TextField({ label, value, onCommit, maxLength = 200 }: { label: string; value: string; onCommit: (value: string) => void; maxLength?: number }) {
    const [draft, setDraft] = useState(value);
    useEffect(() => setDraft(value), [value]);
    const commit = () => draft !== value && onCommit(draft);
    return (
        <label className="field">
            <span>{label}</span>
            <input value={draft} maxLength={maxLength} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => event.key === "Enter" && commit()} />
        </label>
    );
}

/** A number field (empty for none) that saves like TextField; it keeps finite numbers, negative ones when `signed`. */
export function NumberField(props: { label: string; value: number | null; onCommit: (value: number | null) => void; unit?: string; signed?: boolean }) {
    const { label, value, onCommit, unit, signed = false } = props;
    const shown = value === null ? "" : String(value);
    const [draft, setDraft] = useState(shown);
    useEffect(() => setDraft(shown), [shown]);
    const commit = () => {
        const parsed = draft.trim() === "" ? null : Number(draft.replace(",", "."));
        if (parsed !== null && (!Number.isFinite(parsed) || (!signed && parsed < 0))) return setDraft(shown);
        if (parsed !== value) onCommit(parsed);
    };
    return (
        <label className="field">
            <span>
                {label}
                {unit && <small> ({unit})</small>}
            </span>
            <input inputMode="decimal" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => event.key === "Enter" && commit()} />
        </label>
    );
}
