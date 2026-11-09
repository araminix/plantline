import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/i18n";
import { NODE_KINDS } from "../plants";
import { Inspector } from "./Inspector";
import { addNode, connect, emptyDiagram, type Diagram } from "./model";
import { COMMON, ELECTRICAL } from "./properties";

const actions = { onSelect: vi.fn(), onConnectFrom: vi.fn(), onDelete: vi.fn(), onRotate: vi.fn(), onFlip: vi.fn(), onDuplicate: vi.fn(), onAlign: vi.fn(), onDistribute: vi.fn() };

function show(diagram: Diagram, selection: { nodes: string[]; link: string | null }) {
    const onChange = vi.fn<(diagram: Diagram) => void>();
    const { container } = render(
        <I18nProvider>
            <Inspector diagram={diagram} selection={selection} issues={[]} onChange={onChange} {...actions} />
        </I18nProvider>,
    );
    return { onChange, fields: () => container.querySelectorAll(".field") };
}

describe("the properties panel", () => {
    beforeEach(() => localStorage.setItem("plantline.lang", '"en"'));
    afterEach(cleanup);

    it("shows every element's general fields, its kind's electrical fields and its notes", () => {
        for (const kind of NODE_KINDS) {
            const added = addNode(emptyDiagram("substation"), kind, 0, 0);
            const { fields } = show(added.diagram, { nodes: [added.id], link: null });
            // Label and designation, the common fields, a busbar's length, the electrical fields and the notes
            expect(fields().length, kind).toBe(2 + COMMON.length + (kind === "busbar" ? 1 : 0) + ELECTRICAL[kind].length + 1);
            cleanup();
        }
    });

    it("saves a property with its unit's number, and refuses a fraction of a module", () => {
        const added = addNode(emptyDiagram("solar"), "pvArray", 0, 0);
        const { onChange } = show(added.diagram, { nodes: [added.id], link: null });
        const modules = screen.getByRole("textbox", { name: "Modules" });
        fireEvent.change(modules, { target: { value: "10.5" } });
        fireEvent.blur(modules);
        expect(onChange).not.toHaveBeenCalled();
        expect((modules as HTMLInputElement).value).toBe("");
        const power = screen.getByRole("textbox", { name: /^Peak power/ });
        fireEvent.change(power, { target: { value: "1250,5" } });
        fireEvent.blur(power);
        expect(onChange.mock.calls[0]![0].nodes[0]!.props).toEqual({ peakPowerKwp: 1250.5 });
    });

    it("gives a line its kind, status and electrical fields", () => {
        const a = addNode(emptyDiagram("solar"), "inverter", 0, 0);
        const b = addNode(a.diagram, "transformer", 0, 200);
        const linked = connect(b.diagram, a.id, b.id)!;
        const { onChange } = show(linked, { nodes: [], link: linked.links[0]!.id });
        fireEvent.change(screen.getByRole("combobox", { name: "Kind" }), { target: { value: "cable" } });
        expect(onChange.mock.calls[0]![0].links[0]!.props).toEqual({ lineKind: "cable" });
        expect(screen.getByRole("textbox", { name: /^Length/ })).toBeTruthy();
    });
});
