/** A key pressed while typing into a field or choosing from a list belongs to it, not to a shortcut. */
export const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.getAttribute("role") === "combobox");
