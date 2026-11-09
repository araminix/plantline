import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";

/** A button showing only an icon; the label is its tooltip and accessible name. */
export function IconButton(props: { label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; className?: string; buttonRef?: Ref<HTMLButtonElement>; children: ReactNode }) {
    const { label, onClick, disabled, pressed, className, buttonRef, children } = props;
    return (
        <button ref={buttonRef} type="button" className={className ? `icon-button ${className}` : "icon-button"} title={label} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
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
 * mirrored in right-to-left languages, so no scrolling toolbar or panel can clip or cover it; it follows the button
 * while the page or a toolbar scrolls, and closes once the button is out of view. Arrow keys, Home and End move between
 * items; Escape, Tab or a click elsewhere closes it and focus returns to the button.
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

    // Under the button, or null when the button is out of view
    const placeUnder = (): CSSProperties | null => {
        const box = button.current!.getBoundingClientRect();
        if (box.bottom < 0 || box.top > window.innerHeight || box.right < 0 || box.left > window.innerWidth) return null;
        const rtl = getComputedStyle(button.current!).direction === "rtl";
        return { top: box.bottom + 4, ...(rtl ? { right: document.documentElement.clientWidth - box.right } : { left: box.left }) };
    };

    const toggle = () => (place ? close(false) : setPlace(placeUnder()));

    const open = place !== null;
    useEffect(() => {
        if (!open) return;
        list.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
        const outside = (event: Event) => {
            const target = event.target as Node;
            if (!list.current?.contains(target) && !button.current?.contains(target)) close(false);
        };
        const follow = () => setPlace(placeUnder());
        document.addEventListener("pointerdown", outside);
        window.addEventListener("resize", follow);
        window.addEventListener("scroll", follow, true);
        return () => {
            document.removeEventListener("pointerdown", outside);
            window.removeEventListener("resize", follow);
            window.removeEventListener("scroll", follow, true);
        };
    }, [open]); // only opening and closing: a new position must not move the focus back to the first item

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

/** A text field that saves when it loses focus or on Enter (several lines: on leaving), so typing is one undo step. */
export function TextField(props: { label: string; value: string; onCommit: (value: string) => void; maxLength?: number; multiline?: boolean; hideLabel?: boolean }) {
    const { label, value, onCommit, maxLength = 200, multiline = false, hideLabel = false } = props;
    const [draft, setDraft] = useState(value);
    useEffect(() => setDraft(value), [value]);
    const commit = () => draft !== value && onCommit(draft);
    return (
        <label className="field">
            <span className={hideLabel ? "sr-only" : undefined}>{label}</span>
            {multiline ? (
                <textarea dir="auto" rows={4} value={draft} maxLength={maxLength} onChange={(event) => setDraft(event.target.value)} onBlur={commit} />
            ) : (
                <input dir="auto" value={draft} maxLength={maxLength} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => event.key === "Enter" && commit()} />
            )}
        </label>
    );
}

/**
 * A number field (empty for none) that saves like TextField. It keeps finite numbers: negative ones only when `signed`,
 * whole ones only when `integer`, none above `max`; anything else goes back to the saved value.
 */
export function NumberField(props: { label: string; value: number | null; onCommit: (value: number | null) => void; unit?: string | undefined; signed?: boolean; integer?: boolean | undefined; max?: number | undefined }) {
    const { label, value, onCommit, unit, signed = false, integer = false, max } = props;
    const shown = value === null ? "" : String(value);
    const [draft, setDraft] = useState(shown);
    useEffect(() => setDraft(shown), [shown]);
    const commit = () => {
        const parsed = draft.trim() === "" ? null : Number(draft.replace(",", "."));
        const wrong = parsed !== null && (!Number.isFinite(parsed) || (!signed && parsed < 0) || (integer && !Number.isInteger(parsed)) || (max !== undefined && parsed > max));
        if (wrong) return setDraft(shown);
        if (parsed !== value) onCommit(parsed);
    };
    return (
        <label className="field">
            <span>
                {label}
                {unit && <small> ({unit})</small>}
            </span>
            <input inputMode={integer ? "numeric" : "decimal"} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => event.key === "Enter" && commit()} />
        </label>
    );
}

/** A list to choose one value from; it saves at once. */
export function SelectField(props: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
    const { label, value, options, onChange } = props;
    return (
        <label className="field">
            <span>{label}</span>
            <select value={value} onChange={(event) => onChange(event.target.value)}>
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </label>
    );
}
