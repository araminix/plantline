import { Check, ChevronDown } from "lucide-react";
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
 * Where a list drawn over the page goes: under its button (over it, in the screen's lower half), at least as wide,
 * starting at the button's start (or, `alignEnd`, ending at its end), mirrored in right-to-left languages; null when
 * the button is out of view. `--room` is the height left to the screen's edge, which the list keeps within.
 */
function placeUnder(button: HTMLElement, alignEnd: boolean): CSSProperties | null {
    const box = button.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight || box.right < 0 || box.left > window.innerWidth) return null;
    const rtl = getComputedStyle(button).direction === "rtl";
    // In the lower half of the screen (a bottom bar), the list opens upwards
    const up = box.top > window.innerHeight / 2;
    const vertical = up ? { bottom: window.innerHeight - box.top + 6 } : { top: box.bottom + 6 };
    const room = { "--room": `${Math.round(up ? box.top - 14 : window.innerHeight - box.bottom - 14)}px` } as CSSProperties;
    return { ...vertical, ...room, minWidth: box.width, ...(rtl !== alignEnd ? { right: document.documentElement.clientWidth - box.right } : { left: box.left }) };
}

/** Keeps a list drawn over the page under its button while open: it follows scrolling and resizing, and closes on a click elsewhere. */
function useAnchored(open: boolean, button: RefObject<HTMLElement | null>, list: RefObject<HTMLElement | null>, alignEnd: boolean, place: (next: CSSProperties | null) => void, onOpen: () => void) {
    useEffect(() => {
        if (!open) return;
        onOpen();
        const outside = (event: Event) => {
            const target = event.target as Node;
            // A list opened from inside (a Select in a Popover) is drawn elsewhere but belongs to it
            const nested = target instanceof Element && target.closest(".select-list");
            if (!list.current?.contains(target) && !button.current?.contains(target) && !nested) place(null);
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
    useAnchored(place !== null, button, panel, true, setPlace, () => panel.current?.querySelector<HTMLElement>("button, [role=combobox], input")?.focus());
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

export interface Choice<T extends string> {
    value: T;
    label: string;
    /** Shown before the label, in the list and, once chosen, on the button. */
    icon?: ReactNode;
    /** The language the label is written in ("中文" is Chinese), so screen readers say it right. */
    lang?: string;
}

/**
 * A list to choose one value from, drawn like the app's menus (the browser's own list cannot be styled): a button
 * showing the chosen value opens the list over the page, under the button. Keys follow the select-only combobox
 * pattern: arrows, Home, End, Page Up and Page Down move through the list, typing jumps to a value, Enter, Space or
 * Tab chooses, Escape closes; the focus stays on the button. Labelled by `labelledBy` (a visible label) or `label`.
 */
export function Select<T extends string>(props: { label: string; labelledBy?: string; value: T; options: readonly Choice<T>[]; onChange: (value: T) => void; className?: string }) {
    const { label, labelledBy, value, options, onChange, className = "select" } = props;
    const [place, setPlace] = useState<CSSProperties | null>(null);
    const [active, setActive] = useState(0);
    const button = useRef<HTMLDivElement>(null);
    const list = useRef<HTMLUListElement>(null);
    const typed = useRef({ text: "", at: 0 });
    const id = useId();
    const chosen = Math.max(0, options.findIndex((option) => option.value === value));
    const shown = options[chosen];
    const last = options.length - 1;

    const open = (at: number) => {
        setActive(Math.max(0, Math.min(last, at)));
        setPlace(placeUnder(button.current!, false));
    };
    const choose = (index: number) => {
        setPlace(null);
        const option = options[index];
        if (option && option.value !== value) onChange(option.value);
    };
    useAnchored(place !== null, button, list, false, setPlace, () => {});
    useEffect(() => {
        if (place) list.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
    }, [place !== null, active]);

    // The next value starting with what was typed; one letter pressed again steps through the values starting with it
    const find = (key: string, from: number) => {
        const now = Date.now();
        typed.current = { text: now - typed.current.at > 700 ? key : typed.current.text + key, at: now };
        const text = typed.current.text.toLocaleLowerCase();
        const starts = (step: number, prefix: string) => options[(from + step) % options.length]!.label.toLocaleLowerCase().startsWith(prefix);
        for (let step = 0; step < options.length; step++) if (text.length > 1 && starts(step, text)) return (from + step) % options.length;
        for (let step = 1; step <= options.length; step++) if (starts(step, text[0]!)) return (from + step) % options.length;
        return -1;
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const at = place ? active : chosen;
        const move = (to: number) => (place ? setActive(Math.max(0, Math.min(last, to))) : open(to));
        if (event.key === "ArrowDown") move(place ? at + 1 : at);
        else if (event.key === "ArrowUp") move(place ? at - 1 : at);
        else if (event.key === "Home") move(0);
        else if (event.key === "End") move(last);
        else if (event.key === "PageDown") move(at + 10);
        else if (event.key === "PageUp") move(at - 10);
        else if (event.key === "Enter" || event.key === " ") {
            if (place) choose(active);
            else open(chosen);
        } else if (event.key === "Escape" && place) setPlace(null);
        else if (event.key === "Tab") {
            if (place) choose(active);
            return;
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const found = find(event.key, at);
            if (found >= 0) move(found);
        } else return;
        event.preventDefault();
        event.stopPropagation();
    };

    return (
        <>
            <div
                ref={button}
                role="combobox"
                tabIndex={0}
                className={className}
                aria-label={labelledBy ? undefined : label}
                aria-labelledby={labelledBy}
                aria-haspopup="listbox"
                aria-expanded={!!place}
                aria-controls={place ? id : undefined}
                aria-activedescendant={place ? `${id}-${active}` : undefined}
                onClick={() => (place ? setPlace(null) : open(chosen))}
                onKeyDown={onKeyDown}
            >
                {shown?.icon}
                <span className="select-value" lang={shown?.lang}>
                    {shown?.label}
                </span>
                <ChevronDown className="chevron" size={14} aria-hidden="true" />
            </div>
            {place &&
                createPortal(
                    // Pressing an option keeps the focus on the button
                    <ul ref={list} className="select-list" role="listbox" id={id} aria-label={label} style={place} onMouseDown={(event) => event.preventDefault()}>
                        {options.map((option, index) => (
                            <li
                                key={option.value}
                                id={`${id}-${index}`}
                                role="option"
                                aria-selected={index === active}
                                className={index === active ? "active" : undefined}
                                lang={option.lang}
                                onPointerMove={() => index !== active && setActive(index)}
                                onClick={() => choose(index)}
                            >
                                {option.icon}
                                <span>{option.label}</span>
                                {index === chosen && <Check className="check-mark" size={16} aria-hidden="true" />}
                            </li>
                        ))}
                    </ul>,
                    document.body,
                )}
        </>
    );
}

/** A list to choose one value from, with its label above; it saves at once. */
export function SelectField<T extends string>(props: { label: string; value: T; options: readonly Choice<T>[]; onChange: (value: T) => void }) {
    const id = useId();
    return (
        <div className="field">
            <span id={id}>{props.label}</span>
            <Select labelledBy={id} {...props} />
        </div>
    );
}

/**
 * Visible words inside a message only screen readers hear in full: "Example: {{plant}}" shows the plant and reads
 * "Example: Hydropower". The message is given with its placeholder filled by NUL, so word order follows the language.
 */
export function Spoken({ message, children }: { message: string; children: ReactNode }) {
    const [before = "", after = ""] = message.split("\u0000");
    return (
        <>
            {before && <span className="sr-only">{before}</span>}
            {children}
            {after && <span className="sr-only">{after}</span>}
        </>
    );
}
