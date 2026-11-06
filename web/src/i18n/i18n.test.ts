import { describe, expect, it } from "vitest";
import { NODE_KINDS, LAYOUT_KINDS, PLANT_TYPES } from "../plants";
import { translate } from "./i18n";
import { detectLanguage, directionOf, LANGUAGES } from "./languages";
import en from "./locales/en.json";

const locales = import.meta.glob<Record<string, string>>("./locales/*.json", { eager: true, import: "default" });
const placeholders = (text: string) => [...text.matchAll(/\{\{\w+\}\}/g)].map((match) => match[0]).sort();

describe("translations", () => {
    it("have a file for every language, with exactly the English messages and placeholders", () => {
        expect(Object.keys(locales)).toHaveLength(LANGUAGES.length);
        for (const { code } of LANGUAGES) {
            const messages = locales[`./locales/${code}.json`]!;
            expect(Object.keys(messages).sort(), code).toEqual(Object.keys(en).sort());
            for (const [key, english] of Object.entries(en)) {
                expect(messages[key]!.trim(), `${code} ${key}`).not.toBe("");
                expect(placeholders(messages[key]!), `${code} ${key}`).toEqual(placeholders(english));
            }
        }
    });

    it("name every plant type and every element and object kind", () => {
        const keys = Object.keys(en);
        for (const plant of PLANT_TYPES) expect(keys).toContain(`plant.${plant}`);
        for (const kind of [...NODE_KINDS, ...LAYOUT_KINDS]) expect(keys).toContain(`kind.${kind}`);
    });

    it("write Arabic and Persian right to left, the others left to right", () => {
        const rtl = LANGUAGES.filter((language) => directionOf(language.code) === "rtl").map((language) => language.code);
        expect(rtl).toEqual(["ar", "fa"]);
    });

    it("pick the first browser language the app speaks, else English", () => {
        expect(detectLanguage(["pt-BR", "en-US"])).toBe("pt");
        expect(detectLanguage(["sw", "FA-IR"])).toBe("fa");
        expect(detectLanguage(["sw", "nl"])).toBe("en");
        expect(detectLanguage([])).toBe("en");
    });

    it("fill placeholders and fall back to English for a missing message", () => {
        expect(translate({}, "inspector.selected", { count: 3 })).toBe("3 elements selected");
        expect(translate({ "inspector.selected": "{{count}} seçildi" }, "inspector.selected", { count: 2 })).toBe("2 seçildi");
        expect(translate({}, "issue.unconnected")).toBe("{{name}} is not connected.");
    });
});
