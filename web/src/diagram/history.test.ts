import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { commit, preview, redo, undo, useHistory, type History } from "./history";

const start: History<number> = { past: [], present: 0, future: [] };

describe("undo history", () => {
    it("undoes and redoes committed steps, and a new step clears redo", () => {
        const two = commit(commit(start, 1), 2);
        expect(undo(two).present).toBe(1);
        expect(redo(undo(two)).present).toBe(2);
        expect(commit(undo(two), 5).future).toEqual([]);
        expect(undo(start)).toBe(start);
        expect(redo(start)).toBe(start);
    });

    it("makes a drag one step: previews are not steps, the commit returns to the state before the drag", () => {
        const dragged = commit(preview(preview(start, 1), 2), 3, start.present);
        expect(dragged.past).toEqual([0]);
        expect(undo(dragged).present).toBe(0);
    });

    it("counts the changes worth saving: steps, undo, redo and a new document, never a preview", () => {
        const { result } = renderHook(() => useHistory(() => 0));
        const versions = [result.current.version];
        const record = (change: () => void) => {
            act(change);
            versions.push(result.current.version);
        };
        record(() => result.current.preview(1));
        record(() => result.current.preview(2));
        record(() => result.current.commit(3, 0));
        record(() => result.current.undo());
        record(() => result.current.redo());
        record(() => result.current.reset(9));
        expect(versions).toEqual([0, 0, 0, 1, 2, 3, 4]);
        expect(result.current.state).toBe(9);
        expect(result.current.canUndo).toBe(false);
    });
});
