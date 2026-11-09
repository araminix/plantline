import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOSAVE_KEY } from "./diagram/DiagramEditor";
import { ErrorBoundary } from "./ErrorBoundary";
import { I18nProvider } from "./i18n/i18n";

function Broken(): never {
    throw new Error("broken");
}

const renderBroken = () =>
    render(
        <I18nProvider>
            <ErrorBoundary>
                <Broken />
            </ErrorBoundary>
        </I18nProvider>,
    );

describe("the error screen", () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem("plantline.lang", '"en"');
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it("replaces a blank page with what happened, a reload and the kept diagram", () => {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify('{"format":"plantline"}'));
        renderBroken();
        expect(screen.getByRole("heading", { name: "Something went wrong." })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Download the diagram" })).toBeTruthy();
    });

    it("offers no download when no diagram is kept", () => {
        renderBroken();
        expect(screen.queryByRole("button", { name: "Download the diagram" })).toBeNull();
    });
});
