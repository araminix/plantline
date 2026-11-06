import { useEffect, useId, useRef, useState, type ReactNode } from "react";

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

/** A button opening a list of actions; Escape or a click elsewhere closes it. */
export function Menu({ label, icon, items }: { label: string; icon: ReactNode; items: MenuItem[] }) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const id = useId();

    useEffect(() => {
        if (!open) return;
        const close = (event: Event) => {
            if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener("pointerdown", close);
        document.addEventListener("keydown", close);
        return () => {
            document.removeEventListener("pointerdown", close);
            document.removeEventListener("keydown", close);
        };
    }, [open]);

    return (
        <div className="menu" ref={root}>
            <button type="button" className="button" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
                {icon}
                <span>{label}</span>
            </button>
            {open && (
                <div className="menu-list" role="menu" id={id}>
                    {items.map((item) => (
                        <button
                            key={item.label}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                setOpen(false);
                                item.onSelect();
                            }}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
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
