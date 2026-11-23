import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createTranslator, isLanguagePreference, languageNames, resolveLanguage } from "../src/i18n.ts";

const loadLocale = (locale) => JSON.parse(readFileSync(new URL(`../locales/${locale}.json`, import.meta.url), "utf8"));
const placeholders = (text) => (text.match(/\{[\w.-]+\}/gu) ?? []).sort();

test("all supported languages have the same translation keys and placeholders", () => {
  const english = loadLocale("en");
  for (const language of Object.keys(languageNames)) {
    const dictionary = loadLocale(language);
    assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(english).sort(), language);
    for (const [key, value] of Object.entries(dictionary)) {
      assert.ok(value.trim(), `${language}: ${key}`);
      assert.deepEqual(placeholders(value), placeholders(english[key]), `${language}: ${key}`);
    }
  }
});

test("automatic language follows the Obsidian locale with English fallback", () => {
  for (const [locale, expected] of Object.entries({
    "de-DE": "de", "fr-CA": "fr", "es-419": "es", "it-IT": "it", "nl-NL": "nl", pt: "pt-PT",
    "pt-BR": "pt-BR", "PT_pt": "pt-PT", zh: "zh-CN", "zh-Hans": "zh-CN", "zh-SG": "zh-CN",
    "zh-TW": "en", "zh-Hant": "en", ja: "en", "": "en",
  })) {
    assert.equal(resolveLanguage("auto", locale), expected, locale);
  }
  assert.equal(resolveLanguage("fr", "en"), "fr");
  assert.equal(isLanguagePreference("auto"), true);
  assert.equal(isLanguagePreference("zh-TW"), false);
  assert.equal(isLanguagePreference(undefined), false);
});

test("translated messages interpolate file names and classifications without changing them", () => {
  const translate = createTranslator("fr");
  assert.equal(translate("errors.classificationWrite", { name: "Notes d’équipe" }),
    "Classificator : impossible de classer « Notes d’équipe ».");
  assert.equal(translate("badge.changeValue", { value: "confidential" }), "Modifier la classification : confidential");
});
