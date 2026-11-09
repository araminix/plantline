import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { I18nProvider } from "./i18n/i18n";

const renderApp = () =>
    render(
        <I18nProvider>
            <App />
        </I18nProvider>,
    );

const palette = () => within(screen.getByRole("complementary", { name: "Elements" }));
const keptNodes = (): { label: string; kind: string }[] => JSON.parse(JSON.parse(localStorage.getItem("plantline.diagram")!)).diagram.nodes;
const diagramWrites = (setItem: { mock: { calls: unknown[][] } }) => setItem.mock.calls.filter(([key]) => key === "plantline.diagram").length;

describe("the app", () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem("plantline.lang", '"en"');
    });
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it("asks for the plant type on the first visit and shows that plant's elements first", () => {
        renderApp();
        fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Wind farm" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(palette().getAllByRole("listitem")[0]!.textContent).toBe("Wind turbine");
    });

    it("changes the palette with the plant type and keeps the diagram", () => {
        localStorage.setItem("plantline.plant", '"solar"');
        const { container } = renderApp();
        expect(palette().getAllByRole("listitem")[0]!.textContent).toBe("PV array");
        fireEvent.click(palette().getByRole("button", { name: "Inverter" }));
        fireEvent.change(screen.getByRole("combobox", { name: "Plant type" }), { target: { value: "storage" } });
        expect(palette().getAllByRole("listitem")[0]!.textContent).toBe("Battery");
        expect(palette().queryByRole("button", { name: "PV array" })).toBeNull();
        expect(container.querySelectorAll("[data-node]")).toHaveLength(1);
    });

    it("adds an element from the palette, selects it, and undoes it", () => {
        localStorage.setItem("plantline.plant", '"substation"');
        const { container } = renderApp();
        fireEvent.click(palette().getByRole("button", { name: "Transformer" }));
        expect(container.querySelectorAll("[data-node]")).toHaveLength(1);
        expect(screen.getByRole("heading", { name: "Transformer" })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(container.querySelectorAll("[data-node]")).toHaveLength(0);
    });

    it("keeps the diagram in the browser between visits", () => {
        localStorage.setItem("plantline.plant", '"hydro"');
        const first = renderApp();
        fireEvent.click(palette().getByRole("button", { name: "Generator" }));
        first.unmount();
        const { container } = renderApp();
        expect(container.querySelectorAll("[data-node]")).toHaveLength(1);
    });

    it("turns the page right to left in Arabic", async () => {
        localStorage.setItem("plantline.plant", '"solar"');
        renderApp();
        fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: "ar" } });
        await waitFor(() => expect(screen.getByRole("tab", { name: "المخطط أحادي الخط" })).toBeTruthy());
        expect(document.documentElement.dir).toBe("rtl");
        expect(document.documentElement.lang).toBe("ar");
    });

    it("switches between the light and dark themes", () => {
        localStorage.setItem("plantline.plant", '"solar"');
        localStorage.setItem("plantline.theme", '"light"');
        renderApp();
        act(() => fireEvent.click(screen.getByRole("button", { name: "Dark theme" })));
        expect(document.documentElement.dataset.theme).toBe("dark");
        expect(screen.getByRole("button", { name: "Light theme" })).toBeTruthy();
    });

    it("saves typed text onto the element it was typed for, not the one clicked next", () => {
        localStorage.setItem("plantline.plant", '"substation"');
        const { container } = renderApp();
        fireEvent.click(palette().getByRole("button", { name: "Transformer" }));
        fireEvent.click(palette().getByRole("button", { name: "Circuit breaker" }));
        const [transformer, breaker] = [...container.querySelectorAll("[data-node]")] as [Element, Element];
        fireEvent.pointerDown(transformer, { pointerId: 1 });
        fireEvent.pointerUp(transformer, { pointerId: 1 });
        const field = screen.getByRole("textbox", { name: "Label" });
        act(() => field.focus());
        fireEvent.change(field, { target: { value: "T1" } });
        fireEvent.pointerDown(breaker, { pointerId: 1 });
        // A browser moves focus away from the field after the pointer goes down
        act(() => (document.activeElement as HTMLElement | null)?.blur());
        expect(keptNodes().map((node) => [node.kind, node.label])).toEqual([
            ["transformer", "T1"],
            ["breaker", ""],
        ]);
        expect((screen.getByRole("textbox", { name: "Label" }) as HTMLInputElement).value).toBe("");
    });

    it("saves a drag once, at its end, not on every frame", () => {
        localStorage.setItem("plantline.plant", '"substation"');
        const { container } = renderApp();
        fireEvent.click(palette().getByRole("button", { name: "Transformer" }));
        const svg = container.querySelector("svg.canvas")!;
        const node = container.querySelector("[data-node]")!;
        const setItem = vi.spyOn(Storage.prototype, "setItem");
        fireEvent.pointerDown(node, { pointerId: 1, clientX: 100, clientY: 100 });
        for (let step = 1; step <= 10; step++) fireEvent.pointerMove(svg, { pointerId: 1, clientX: 100 + step * 10, clientY: 100 });
        fireEvent.pointerUp(svg, { pointerId: 1, clientX: 200, clientY: 100 });
        expect(diagramWrites(setItem)).toBe(1);
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(diagramWrites(setItem)).toBe(2);
    });

    it("says so when the browser cannot keep the diagram", () => {
        localStorage.setItem("plantline.plant", '"substation"');
        renderApp();
        expect(screen.queryByRole("alert")).toBeNull();
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new DOMException("full", "QuotaExceededError");
        });
        fireEvent.click(palette().getByRole("button", { name: "Transformer" }));
        expect(screen.getByRole("alert").textContent).toMatch(/could not keep the diagram/);
    });
});
