import { describe, expect, it } from "vitest";
import { NODE_KINDS, LAYOUT_KINDS, PLANT_TYPES } from "../plants";
import { translate, type Dictionary, type Message } from "./i18n";
import { detectLanguage, directionOf, LANGUAGES } from "./languages";
import en from "./locales/en.json";

const locales = import.meta.glob<Dictionary>("./locales/*.json", { eager: true, import: "default" });
const placeholders = (text: string) => [...text.matchAll(/\{\{\w+\}\}/g)].map((match) => match[0]).sort();
/** The plural forms a language uses for whole numbers, and "other" (the fallback). */
function formsFor(lang: string) {
    const rules = new Intl.PluralRules(lang);
    return new Set(["other", ...Array.from({ length: 1001 }, (_, n) => rules.select(n))]);
}

describe("translations", () => {
    it("have a file for every language, with exactly the English messages and placeholders", () => {
        expect(Object.keys(locales)).toHaveLength(LANGUAGES.length);
        for (const { code } of LANGUAGES) {
            const messages = locales[`./locales/${code}.json`]!;
            const forms = formsFor(code);
            expect(Object.keys(messages).sort(), code).toEqual(Object.keys(en).sort());
            for (const [key, english] of Object.entries(en) as [string, Message][]) {
                const message = messages[key as keyof Dictionary];
                if (typeof english === "string") {
                    expect(typeof message === "string" && message.trim(), `${code} ${key}`).toBeTruthy();
                    expect(placeholders(message as string), `${code} ${key}`).toEqual(placeholders(english));
                    continue;
                }
                // A count: every plural form the language uses for whole numbers, none it does not have
                expect(typeof message, `${code} ${key}`).toBe("object");
                const plural = message as Exclude<Message, string>;
                expect(new Set(Object.keys(plural)), `${code} ${key}`).toEqual(forms);
                expect(placeholders(plural.other!), `${code} ${key} other`).toEqual(placeholders(english.other!));
                for (const [form, text] of Object.entries(plural)) {
                    expect(text.trim(), `${code} ${key} ${form}`).not.toBe("");
                    // A form for one exact number (Arabic "two") may say the number in words
                    for (const placeholder of placeholders(text)) expect(placeholders(english.other!), `${code} ${key} ${form}`).toContain(placeholder);
                }
            }
        }
    });

    it("choose the plural form of the language for a count, written in its digits", () => {
        const dictionary = (code: string) => locales[`./locales/${code}.json`]!;
        const [ru, ar, fa] = [dictionary("ru"), dictionary("ar"), dictionary("fa")];
        const problems = (dictionary: Partial<Dictionary>, lang: string, count: number) => translate(dictionary, "checks.problems", { count }, lang);
        expect([1, 2, 1234].map((count) => problems({}, "en", count))).toEqual(["1 problem", "2 problems", "1,234 problems"]);
        expect([1, 3, 5, 11, 21, 22].map((count) => problems(ru, "ru", count))).toEqual(["1 проблема", "3 проблемы", "5 проблем", "11 проблем", "21 проблема", "22 проблемы"]);
        const arabic = new Intl.NumberFormat("ar");
        expect([0, 1, 2, 3, 11, 100].map((count) => problems(ar, "ar", count))).toEqual(["لا مشكلات", "مشكلة واحدة", "مشكلتان", `${arabic.format(3)} مشكلات`, `${arabic.format(11)} مشكلة`, `${arabic.format(100)} مشكلة`]);
        expect([1, 12].map((count) => problems(fa, "fa", count))).toEqual(["۱ مشکل", "۱۲ مشکل"]);
        // Several counts in one message, each in its own form
        expect(translate(ru, "inspector.stats", { elements: translate(ru, "count.elements", { count: 2 }, "ru"), links: translate(ru, "count.lines", { count: 5 }, "ru") }, "ru")).toBe("2 элемента, 5 линий");
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
