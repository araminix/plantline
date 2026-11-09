import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type Ref, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * A button showing an icon; the label is its tooltip and accessible name. With `text`, a short word follows the icon
 * where the stylesheet has room for it (wide toolbars).
 */
export function IconButton(props: { label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; className?: string; buttonRef?: Ref<HTMLButtonElement>; text?: string; children: ReactNode }) {
    const { label, onClick, disabled, pressed, className, buttonRef, text, children } = props;
    const classes = ["icon-button", text ? "with-text" : "", className ?? ""].filter(Boolean).join(" ");
    return (
        <button ref={buttonRef} type="button" className={classes} title={label} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
            {children}
            {text && <span className="text">{text}</span>}
        </button>
    );
}

export interface MenuItem {
    label: string;
    icon: ReactNode;
    onSelect: () => void;
    /** A shortcut shown at the end of the item, as "Del" or "Shift 2". */
    keys?: string;
    disabled?: boolean;
}

/**
 * Where a list drawn over the page goes: under its button (over it, in the screen's lower half), starting at the
 * button's start (or, `alignEnd`, ending at its end), mirrored in right-to-left languages; null when the button is out
 * of view.
 */
function placeUnder(button: HTMLElement, alignEnd: boolean): CSSProperties | null {
    const box = button.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight || box.right < 0 || box.left > window.innerWidth) return null;
    const rtl = getComputedStyle(button).direction === "rtl";
    // In the lower half of the screen (a bottom bar), the list opens upwards
    const vertical = box.top > window.innerHeight / 2 ? { bottom: window.innerHeight - box.top + 6 } : { top: box.bottom + 6 };
    return { ...vertical, ...(rtl !== alignEnd ? { right: document.documentElement.clientWidth - box.right } : { left: box.left }) };
}

/** Keeps a list drawn over the page under its button while open: it follows scrolling and resizing, and closes on a click elsewhere. */
function useAnchored(open: boolean, button: RefObject<HTMLElement | null>, list: RefObject<HTMLElement | null>, alignEnd: boolean, place: (next: CSSProperties | null) => void, onOpen: () => void) {
    useEffect(() => {
        if (!open) return;
        onOpen();
        const outside = (event: Event) => {
            const target = event.target as Node;
            if (!list.current?.contains(target) && !button.current?.contains(target)) place(null);
        };
        const follow = () => place(button.current ? placeUnder(button.current, alignEnd) : null);
        document.addEventListener("pointerdown", outside);
        window.addEventListener("resize", follow);
        window.addEventListener("scroll", follow, true);
        return () => {
            document.removeEventListener("pointerdown", outside);
            window.removeEventListener("resize", follow);
            window.removeEventListener("scroll", follow, true);
        };
    }, [open]); // only opening and closing: a new position must not move the focus back to the first item
}

/**
 * A button opening a list of actions. The list is drawn over the page (a portal), placed under the button and
 * mirrored in right-to-left languages, so no scrolling toolbar or panel can clip or cover it; it follows the button
 * while the page or a toolbar scrolls, and closes once the button is out of view. Arrow keys, Home and End move between
 * items; Escape, Tab or a click elsewhere closes it and focus returns to the button. A null item is a separator.
 * With `iconOnly`, the button shows its icon and the label is its tooltip and name.
 */
export function Menu({ label, icon, items, iconOnly = false, alignEnd = false, className }: { label: string; icon: ReactNode; items: (MenuItem | null)[]; iconOnly?: boolean; alignEnd?: boolean; className?: string }) {
    const [place, setPlace] = useState<CSSProperties | null>(null);
    const button = useRef<HTMLButtonElement>(null);
    const list = useRef<HTMLDivElement>(null);
    const id = useId();

    const close = (refocus: boolean) => {
        setPlace(null);
        if (refocus) button.current?.focus();
    };
    const toggle = () => (place ? close(false) : setPlace(placeUnder(button.current!, alignEnd)));
    useAnchored(place !== null, button, list, alignEnd, setPlace, () => list.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus());

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const entries = [...list.current!.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)")];
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

    const classes = [iconOnly ? "icon-button" : "button", className].filter(Boolean).join(" ");
    return (
        <>
            <button ref={button} type="button" className={classes} title={iconOnly ? label : undefined} aria-label={iconOnly ? label : undefined} aria-haspopup="menu" aria-expanded={!!place} aria-controls={id} onClick={toggle}>
                {icon}
                {!iconOnly && <span>{label}</span>}
                {!iconOnly && <ChevronDown className="chevron" size={14} aria-hidden="true" />}
            </button>
            {place &&
                createPortal(
                    <div ref={list} className="menu-list" role="menu" id={id} aria-label={label} style={place} onKeyDown={onKeyDown}>
                        {items.map((item, index) =>
                            item === null ? (
                                <hr key={index} />
                            ) : (
                                <button
                                    key={item.label}
                                    type="button"
                                    role="menuitem"
                                    disabled={item.disabled}
                                    onClick={() => {
                                        close(true);
                                        item.onSelect();
                                    }}
                                >
                                    {item.icon}
                                    {item.label}
                                    {item.keys && <kbd aria-hidden="true">{item.keys}</kbd>}
                                </button>
                            ),
                        )}
                    </div>,
                    document.body,
                )}
        </>
    );
}

/**
 * An icon button opening a small panel of settings drawn over the page, under the button and ending at its end;
 * Escape or a click elsewhere closes it, and focus returns to the button.
 */
export function Popover({ label, icon, children }: { label: string; icon: ReactNode; children: (close: () => void) => ReactNode }) {
    const [place, setPlace] = useState<CSSProperties | null>(null);
    const button = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const id = useId();
    const close = () => {
        setPlace(null);
        button.current?.focus();
    };
    useAnchored(place !== null, button, panel, true, setPlace, () => panel.current?.querySelector<HTMLElement>("button, select, input")?.focus());
    return (
        <>
            <button ref={button} type="button" className="icon-button" title={label} aria-label={label} aria-haspopup="dialog" aria-expanded={!!place} aria-controls={id} onClick={() => (place ? setPlace(null) : setPlace(placeUnder(button.current!, true)))}>
                {icon}
            </button>
            {place &&
                createPortal(
                    <div ref={panel} className="popover" role="dialog" id={id} aria-label={label} style={place} onKeyDown={(event) => event.key === "Escape" && close()}>
                        {children(close)}
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
 * A number field (empty for none), its unit inside the box, that saves like TextField. It keeps finite numbers: negative ones only when `signed`,
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
    const input = <input inputMode={integer ? "numeric" : "decimal"} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => event.key === "Enter" && commit()} />;
    return (
        <label className="field">
            <span>{label}</span>
            {unit ? (
                <span className="input-unit">
                    {input}
                    <em>{unit}</em>
                </span>
            ) : (
                input
            )}
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
