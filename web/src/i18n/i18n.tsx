import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePersisted } from "../settings";
import en from "./locales/en.json";
import { detectLanguage, directionOf, isLanguage, type LanguageCode } from "./languages";

export type MessageKey = keyof typeof en;
/** A message, or one per plural form of the language (CLDR categories: zero, one, two, few, many, other) for a count. */
export type Message = string | Partial<Record<Intl.LDMLPluralRule, string>>;
export type Dictionary = Record<MessageKey, Message>;
type Params = Record<string, string | number>;

// English is built in (it is the fallback); the other languages load when chosen
const loaders = import.meta.glob<Dictionary>(["./locales/*.json", "!./locales/en.json"], { import: "default" });

const rules = new Map<string, { plural: Intl.PluralRules; number: Intl.NumberFormat }>();
function rulesOf(lang: string) {
    let found = rules.get(lang);
    if (!found) rules.set(lang, (found = { plural: new Intl.PluralRules(lang), number: new Intl.NumberFormat(lang) }));
    return found;
}

/**
 * The message in the dictionary (else in English), in the plural form for `params.count` (a number), with {{name}}
 * placeholders filled in: numbers written as the language writes them, with its digits.
 */
export function translate(dictionary: Partial<Dictionary>, key: MessageKey, params?: Params, lang = "en"): string {
    const message: Message = dictionary[key] ?? en[key] ?? key;
    const { plural, number } = rulesOf(lang);
    const text = typeof message === "string" ? message : (message[typeof params?.count === "number" ? plural.select(params.count) : "other"] ?? message.other ?? key);
    return params ? text.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (name in params ? (typeof params[name] === "number" ? number.format(params[name]) : params[name]!) : match)) : text;
}

interface I18n {
    lang: LanguageCode;
    dir: "ltr" | "rtl";
    setLang: (lang: LanguageCode) => void;
    t: (key: MessageKey, params?: Params) => string;
    number: (value: number, digits?: number) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
    const [lang, setLang] = usePersisted<LanguageCode>("plantline.lang", detectLanguage(navigator.languages ?? []), isLanguage);
    const [dictionary, setDictionary] = useState<Partial<Dictionary>>(en);

    useEffect(() => {
        let current = true;
        const load = lang === "en" ? Promise.resolve(en) : loaders[`./locales/${lang}.json`]?.();
        void load?.then((loaded) => current && setDictionary(loaded));
        document.documentElement.lang = lang;
        document.documentElement.dir = directionOf(lang);
        return () => {
            current = false;
        };
    }, [lang]);

    const t = useCallback((key: MessageKey, params?: Params) => translate(dictionary, key, params, lang), [dictionary, lang]);
    const number = useCallback((value: number, digits = 0) => new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(value), [lang]);
    const value = useMemo(() => ({ lang, dir: directionOf(lang), setLang, t, number }), [lang, setLang, t, number]);
    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
    const context = useContext(I18nContext);
    if (!context) throw new Error("useI18n outside I18nProvider");
    return context;
}
