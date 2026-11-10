import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { Menu, Select } from "./controls";

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

    it("follows its button while the page or a toolbar scrolls, keeping the focus, and closes once the button is out of view", () => {
        open();
        const button = screen.getByRole("button", { name: "File" });
        const buttonAt = (top: number) => vi.spyOn(button, "getBoundingClientRect").mockReturnValue({ top, bottom: top + 30, left: 10, right: 70, x: 10, y: top, width: 60, height: 30, toJSON: () => ({}) });
        fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
        buttonAt(100);
        fireEvent.scroll(window);
        expect(screen.getByRole("menu").style.top).toBe("136px");
        expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Open" }));
        buttonAt(-100);
        fireEvent.scroll(window);
        expect(screen.queryByRole("menu")).toBeNull();
    });
});

describe("select", () => {
    const ZONES = ["1N", "2N", "35N", "36N", "36S", "37N"];
    function Zones({ onChange }: { onChange: (value: string) => void }) {
        const [value, setValue] = useState("35N");
        return (
            <Select
                label="Zone"
                value={value}
                options={ZONES.map((zone) => ({ value: zone, label: zone }))}
                onChange={(next) => {
                    setValue(next);
                    onChange(next);
                }}
            />
        );
    }
    const show = () => {
        const onChange = vi.fn();
        render(<Zones onChange={onChange} />);
        const box = screen.getByRole("combobox", { name: "Zone" });
        box.focus();
        return { onChange, box, active: () => document.getElementById(box.getAttribute("aria-activedescendant") ?? "")?.textContent };
    };

    it("shows the chosen value and opens its list over the page, the chosen value ticked", () => {
        const { box } = show();
        expect(box.textContent).toBe("35N");
        fireEvent.click(box);
        const list = screen.getByRole("listbox", { name: "Zone" });
        expect(list.parentElement).toBe(document.body);
        expect(box.getAttribute("aria-expanded")).toBe("true");
        expect(screen.getByRole("option", { name: "35N" }).querySelector(".check-mark")).toBeTruthy();
    });

    it("moves with the arrow keys from the chosen value, chooses with Enter and keeps the focus", () => {
        const { box, onChange, active } = show();
        fireEvent.keyDown(box, { key: "ArrowDown" });
        expect(active()).toBe("35N");
        fireEvent.keyDown(box, { key: "ArrowDown" });
        fireEvent.keyDown(box, { key: "End" });
        fireEvent.keyDown(box, { key: "ArrowDown" });
        expect(active()).toBe("37N");
        fireEvent.keyDown(box, { key: "Home" });
        fireEvent.keyDown(box, { key: "ArrowDown" });
        fireEvent.keyDown(box, { key: "Enter" });
        expect(onChange).toHaveBeenCalledExactlyOnceWith("2N");
        expect(screen.queryByRole("listbox")).toBeNull();
        expect(document.activeElement).toBe(box);
    });

    it("jumps to what is typed, and one letter again steps through the values starting with it", () => {
        const { box, active } = show();
        fireEvent.keyDown(box, { key: "3" });
        expect(active()).toBe("36N");
        fireEvent.keyDown(box, { key: "6" });
        expect(active()).toBe("36N");
        fireEvent.keyDown(box, { key: "S" });
        expect(active()).toBe("36S");
    });

    it("closes with Escape or a click elsewhere without choosing; a click on a value chooses it", () => {
        const { box, onChange } = show();
        fireEvent.keyDown(box, { key: "ArrowDown" });
        fireEvent.keyDown(box, { key: "ArrowDown" });
        fireEvent.keyDown(box, { key: "Escape" });
        expect(screen.queryByRole("listbox")).toBeNull();
        fireEvent.click(box);
        fireEvent.pointerDown(document.body);
        expect(screen.queryByRole("listbox")).toBeNull();
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.click(box);
        fireEvent.click(screen.getByRole("option", { name: "1N" }));
        expect(onChange).toHaveBeenCalledExactlyOnceWith("1N");
        expect(box.textContent).toBe("1N");
    });
});
