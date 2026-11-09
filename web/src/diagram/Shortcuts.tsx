import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useI18n, type MessageKey } from "../i18n/i18n";
import { IconButton } from "../ui/controls";

const COMMAND = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";

/** What each shortcut does, and its keys (pressed together; alternatives separated) or, for a gesture, how. */
const ROWS: { what: MessageKey; keys?: string[][]; how?: MessageKey }[] = [
    { what: "shortcut.select", how: "gesture.click" },
    { what: "shortcut.area", how: "gesture.area" },
    { what: "shortcut.all", keys: [[COMMAND, "A"]] },
    { what: "shortcut.clipboard", keys: [[COMMAND, "C"], [COMMAND, "X"], [COMMAND, "V"]] },
    { what: "action.duplicate", keys: [[COMMAND, "D"]] },
    { what: "action.delete", keys: [["Delete"], ["Backspace"]] },
    { what: "shortcut.nudge", keys: [["←"], ["↑"], ["→"], ["↓"]] },
    { what: "action.rotate", keys: [["R"]] },
    { what: "action.flip", keys: [["Shift", "H"]] },
    { what: "shortcut.undo", keys: [[COMMAND, "Z"], [COMMAND, "Shift", "Z"]] },
    { what: "shortcut.line", how: "gesture.line" },
    { what: "shortcut.bend", how: "gesture.bend" },
    { what: "shortcut.pan", how: "gesture.pan" },
    { what: "shortcut.zoom", how: "gesture.zoom" },
    { what: "action.fit", keys: [["Shift", "1"]] },
    { what: "action.zoomSelection", keys: [["Shift", "2"]] },
    { what: "zoom.reset", keys: [["Shift", "0"]] },
    { what: "shortcut.escape", keys: [["Esc"]] },
    { what: "shortcut.help", keys: [["?"]] },
];

/** The keyboard shortcuts and pointer gestures of the diagram, in a dialog closed by Escape, its button or outside it. */
export function Shortcuts({ onClose }: { onClose: () => void }) {
    const { t } = useI18n();
    const close = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        close.current?.focus();
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
            <div className="dialog shortcuts" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
                <header className="panel-header">
                    <h2 id="shortcuts-title">{t("shortcuts.title")}</h2>
                    <IconButton label={t("action.close")} onClick={onClose} buttonRef={close}>
                        <X size={18} />
                    </IconButton>
                </header>
                <table>
                    <tbody>
                        {ROWS.map(({ what, keys, how }) => (
                            <tr key={what}>
                                <th scope="row">{t(what)}</th>
                                <td>
                                    {how
                                        ? t(how)
                                        : keys!.map((combo, i) => (
                                              <span key={i} className="keys">
                                                  {combo.map((key) => (
                                                      <kbd key={key}>{key}</kbd>
                                                  ))}
                                              </span>
                                          ))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
