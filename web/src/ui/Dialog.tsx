import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useI18n } from "../i18n/i18n";
import { IconButton } from "./controls";
import { FOCUSABLE, trapFocus } from "./focus";

/**
 * A modal dialog over the page, closed by Escape, its close button or a click outside it. Tab stays inside; the focus
 * goes to the control marked `data-autofocus` (else the first one) on opening, and back where it was on closing.
 */
export function Dialog({ title, icon, onClose, className, children }: { title: string; icon?: ReactNode; onClose: () => void; className?: string; children: ReactNode }) {
    const { t } = useI18n();
    const box = useRef<HTMLDivElement>(null);
    const titleId = useId();

    useEffect(() => {
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        (box.current?.querySelector<HTMLElement>("[data-autofocus]") ?? box.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
        return () => opener?.focus();
    }, []);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            onClose();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [onClose]);

    return (
        <div className="overlay" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
            <div ref={box} className={["dialog", className].filter(Boolean).join(" ")} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={trapFocus}>
                <header className="panel-header">
                    <h2 id={titleId}>
                        {icon}
                        {title}
                    </h2>
                    <IconButton label={t("action.close")} onClick={onClose}>
                        <X size={18} />
                    </IconButton>
                </header>
                {children}
            </div>
        </div>
    );
}
