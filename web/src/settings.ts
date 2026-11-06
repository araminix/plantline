import { useCallback, useState } from "react";

/** A setting kept in this browser. Storage can be blocked (private windows): the setting then lasts for the visit. */
export function usePersisted<T>(key: string, initial: T, isValid: (value: unknown) => value is T): [T, (value: T) => void] {
    const [value, setValue] = useState<T>(() => {
        const stored = readStored(key);
        return isValid(stored) ? stored : initial;
    });
    const update = useCallback(
        (next: T) => {
            setValue(next);
            writeStored(key, next);
        },
        [key],
    );
    return [value, update];
}

export function readStored(key: string): unknown {
    try {
        const text = localStorage.getItem(key);
        return text === null ? undefined : JSON.parse(text);
    } catch {
        return undefined;
    }
}

export function writeStored(key: string, value: unknown) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage blocked or full: nothing is kept
    }
}
