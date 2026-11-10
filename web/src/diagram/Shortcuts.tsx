import { useI18n, type MessageKey } from "../i18n/i18n";
import { Dialog } from "../ui/Dialog";

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
    { what: "shortcut.focus", keys: [["Tab"], ["Shift", "Tab"]] },
    { what: "shortcut.connect", keys: [["Enter"]] },
    { what: "shortcut.escape", keys: [["Esc"]] },
    { what: "shortcut.help", keys: [["?"]] },
];

/** The keyboard shortcuts and pointer gestures of the diagram, in a dialog. */
export function Shortcuts({ onClose }: { onClose: () => void }) {
    const { t } = useI18n();

    return (
        <Dialog title={t("shortcuts.title")} onClose={onClose} className="shortcuts">
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
        </Dialog>
    );
}
