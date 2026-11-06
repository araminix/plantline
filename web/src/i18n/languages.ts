/** The interface languages, in their own names. Arabic and Persian are written right to left. */
export const LANGUAGES = [
    { code: "en", name: "English", dir: "ltr" },
    { code: "zh", name: "中文", dir: "ltr" },
    { code: "hi", name: "हिन्दी", dir: "ltr" },
    { code: "es", name: "Español", dir: "ltr" },
    { code: "fr", name: "Français", dir: "ltr" },
    { code: "ar", name: "العربية", dir: "rtl" },
    { code: "fa", name: "فارسی", dir: "rtl" },
    { code: "pt", name: "Português", dir: "ltr" },
    { code: "ru", name: "Русский", dir: "ltr" },
    { code: "ja", name: "日本語", dir: "ltr" },
    { code: "de", name: "Deutsch", dir: "ltr" },
    { code: "ko", name: "한국어", dir: "ltr" },
    { code: "tr", name: "Türkçe", dir: "ltr" },
    { code: "it", name: "Italiano", dir: "ltr" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const isLanguage = (value: unknown): value is LanguageCode => LANGUAGES.some((language) => language.code === value);

export const directionOf = (code: LanguageCode) => LANGUAGES.find((language) => language.code === code)?.dir ?? "ltr";

/** The first of the browser's languages the app speaks ("pt-BR" is Portuguese), else English. */
export function detectLanguage(preferred: readonly string[]): LanguageCode {
    for (const tag of preferred) {
        const code = tag.toLowerCase().split("-")[0];
        if (isLanguage(code)) return code;
    }
    return "en";
}
