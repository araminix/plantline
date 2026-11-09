import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Logo } from "./Logo";

const shapes = (root: ParentNode) =>
    [...root.querySelectorAll("rect, path, circle")].map((shape) => [shape.tagName, ...["width", "height", "rx", "d", "cx", "cy", "r", "stroke-width"].map((name) => shape.getAttribute(name))].join(" "));

describe("Logo", () => {
    it("draws the same mark as the favicon", () => {
        const favicon = new DOMParser().parseFromString(readFileSync("public/favicon.svg", "utf8"), "image/svg+xml");
        const { container } = render(<Logo size={28} />);
        expect(shapes(container)).toEqual(shapes(favicon));
        expect(shapes(container)).toHaveLength(5);
    });
});
