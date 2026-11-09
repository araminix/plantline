import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TILES, tileOrigins, withTileOrigins } from "./tiles";

describe("map tiles", () => {
    it("come over HTTPS from the servers named in one place, each with its attribution and terms", () => {
        for (const source of Object.values(TILES)) {
            expect(source.url).toMatch(/^https:\/\/.+\{z\}.+\{(x|y)\}.+\{(x|y)\}/);
            expect(source.attribution).not.toBe("");
            expect(source.terms).toMatch(/^https:\/\//);
        }
        expect(TILES.plain.attribution).toContain('href="https://www.openstreetmap.org/copyright"');
        expect(TILES.satellite.attribution).toContain("Powered by Esri");
    });

    it("write their servers into the page's Content Security Policy, subdomains as a wildcard", () => {
        const page = readFileSync("index.html", "utf8");
        const policy = withTileOrigins(page).match(/img-src [^;]+/)?.[0];
        expect(policy).toBe("img-src 'self' data: blob: https://tile.openstreetmap.org https://server.arcgisonline.com");
        expect(tileOrigins([{ ...TILES.plain, url: "https://{s}.tiles.example.com/{z}/{x}/{y}.png" }])).toEqual(["https://*.tiles.example.com"]);
    });

    it("refuse tiles over plain HTTP and a page without the placeholder", () => {
        expect(() => tileOrigins([{ ...TILES.plain, url: "http://tiles.example.com/{z}/{x}/{y}.png" }])).toThrow(/HTTPS/);
        expect(() => withTileOrigins("<meta content=\"img-src 'self'\">")).toThrow(/%TILE_ORIGINS%/);
    });
});
