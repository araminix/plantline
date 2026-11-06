import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { I18nProvider } from "./i18n/i18n";

const renderApp = () =>
    render(
        <I18nProvider>
            <App />
        </I18nProvider>,
    );

const palette = () => within(screen.getByRole("complementary", { name: "Elements" }));

describe("the app", () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem("plantline.lang", '"en"');
    });
    afterEach(cleanup);

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
});
