import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Menu } from "./controls";

afterEach(cleanup);

describe("menu", () => {
    const open = () => {
        const onSelect = vi.fn();
        render(
            <div style={{ overflow: "auto" }}>
                <Menu label="File" icon={null} items={["New", "Open", "Save"].map((label) => ({ label, icon: null, onSelect: () => onSelect(label) }))} />
            </div>,
        );
        fireEvent.click(screen.getByRole("button", { name: "File" }));
        return onSelect;
    };

    it("opens over the page, outside any scrolling container, with the first item focused", () => {
        open();
        const menu = screen.getByRole("menu", { name: "File" });
        expect(menu.parentElement).toBe(document.body);
        expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "New" }));
        expect(screen.getByRole("button", { name: "File" }).getAttribute("aria-expanded")).toBe("true");
    });

    it("moves with the arrow keys, Home and End, wrapping around", () => {
        open();
        const menu = screen.getByRole("menu");
        const focused = () => document.activeElement?.textContent;
        fireEvent.keyDown(menu, { key: "ArrowDown" });
        expect(focused()).toBe("Open");
        fireEvent.keyDown(menu, { key: "End" });
        expect(focused()).toBe("Save");
        fireEvent.keyDown(menu, { key: "ArrowDown" });
        expect(focused()).toBe("New");
        fireEvent.keyDown(menu, { key: "ArrowUp" });
        expect(focused()).toBe("Save");
        fireEvent.keyDown(menu, { key: "Home" });
        expect(focused()).toBe("New");
    });

    it("closes with Escape and gives focus back to its button", () => {
        open();
        fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
        expect(screen.queryByRole("menu")).toBeNull();
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "File" }));
    });

    it("runs the chosen action once and closes; a click elsewhere just closes", () => {
        const onSelect = open();
        fireEvent.click(screen.getByRole("menuitem", { name: "Save" }));
        expect(onSelect).toHaveBeenCalledExactlyOnceWith("Save");
        expect(screen.queryByRole("menu")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "File" }));
        fireEvent.pointerDown(document.body);
        expect(screen.queryByRole("menu")).toBeNull();
    });
});
