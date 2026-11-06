import { useCallback, useState } from "react";

/** Undo and redo over immutable states. A preview (a drag in progress) is not a step; its commit is. */
export interface History<T> {
    past: T[];
    present: T;
    future: T[];
}

const LIMIT = 100;

/** The new state becomes one undo step; `base` is the state to return to (the state before a drag's previews). */
export const commit = <T>(history: History<T>, next: T, base: T = history.present): History<T> => ({
    past: [...history.past, base].slice(-LIMIT),
    present: next,
    future: [],
});

export const preview = <T>(history: History<T>, next: T): History<T> => ({ ...history, present: next });

export function undo<T>(history: History<T>): History<T> {
    const previous = history.past.at(-1);
    if (previous === undefined) return history;
    return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo<T>(history: History<T>): History<T> {
    const [next, ...future] = history.future;
    if (next === undefined) return history;
    return { past: [...history.past, history.present], present: next, future };
}

export function useHistory<T>(initial: () => T) {
    const [history, setHistory] = useState<History<T>>(() => ({ past: [], present: initial(), future: [] }));
    return {
        state: history.present,
        canUndo: history.past.length > 0,
        canRedo: history.future.length > 0,
        commit: useCallback((next: T, base?: T) => setHistory((h) => commit(h, next, base)), []),
        preview: useCallback((next: T) => setHistory((h) => preview(h, next)), []),
        undo: useCallback(() => setHistory(undo), []),
        redo: useCallback(() => setHistory(redo), []),
        /** A new document: no undo back into the old one. */
        reset: useCallback((next: T) => setHistory({ past: [], present: next, future: [] }), []),
    };
}
