import { BR, CN, DE, ES, FR, GB, IN, IR, IT, JP, KR, RU, SA, TR } from "country-flag-icons/react/3x2";
import type { LanguageCode } from "./languages";

/** The flag beside each interface language: the country it comes from, or for Portuguese, Brazil (the translation is Brazilian). */
const FLAGS: Record<LanguageCode, typeof GB> = { en: GB, zh: CN, hi: IN, es: ES, fr: FR, ar: SA, fa: IR, pt: BR, ru: RU, ja: JP, de: DE, ko: KR, tr: TR, it: IT };

/** A language's flag, as a picture beside its name (screen readers skip it). */
export function Flag({ code }: { code: LanguageCode }) {
    const Shape = FLAGS[code];
    return <Shape className="flag" aria-hidden="true" />;
}
