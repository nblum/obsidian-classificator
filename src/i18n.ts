import de from "../locales/de.json" with { type: "json" };
import en from "../locales/en.json" with { type: "json" };
import es from "../locales/es.json" with { type: "json" };
import fr from "../locales/fr.json" with { type: "json" };
import it from "../locales/it.json" with { type: "json" };
import nl from "../locales/nl.json" with { type: "json" };
import ptBR from "../locales/pt-BR.json" with { type: "json" };
import ptPT from "../locales/pt-PT.json" with { type: "json" };
import zhCN from "../locales/zh-CN.json" with { type: "json" };

export type TranslationKey = keyof typeof en;
type Variables = Readonly<Record<string, string | number>>;
export type Translator = (key: TranslationKey, variables?: Variables) => string;

const translations = {
  de, en, fr, it, es, "pt-BR": ptBR, "pt-PT": ptPT, nl, "zh-CN": zhCN,
} satisfies Record<string, Record<TranslationKey, string>>;

export type Language = keyof typeof translations;
export type LanguagePreference = "auto" | Language;

export const languageNames: Record<Language, string> = {
  de: "Deutsch",
  en: "English",
  fr: "Français",
  it: "Italiano",
  es: "Español",
  "pt-BR": "Português (Brasil)",
  "pt-PT": "Português (Portugal)",
  nl: "Nederlands",
  "zh-CN": "简体中文",
};

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return typeof value === "string" && (value === "auto" || Object.hasOwn(translations, value));
}

export function resolveLanguage(preference: LanguagePreference, locale: string): Language {
  if (preference !== "auto") return preference;
  const detected = locale.toLowerCase().replaceAll("_", "-");
  const base = detected.split("-")[0];
  if (base === "pt") return detected === "pt" || /^pt-pt(?:-|$)/u.test(detected) ? "pt-PT" : "pt-BR";
  if (/^zh(?:$|-(?:cn|sg|hans)(?:-|$))/u.test(detected)) return "zh-CN";
  return isLanguagePreference(base) && base !== "auto" ? base : "en";
}

export function createTranslator(language: Language): Translator {
  return (key, variables = {}) => (translations[language][key] ?? en[key]).replace(
    /\{([\w.-]+)\}/gu,
    (placeholder, name: string) => variables[name] === undefined ? placeholder : String(variables[name]),
  );
}
