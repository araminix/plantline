/** A key pressed while typing into a field belongs to the field, not to a shortcut. */
export const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
