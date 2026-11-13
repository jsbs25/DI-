import assert from 'node:assert/strict';
import { translations } from '../src/i18n/translations.ts';
import type { Language } from '../src/types/index.ts';

const languages: Language[] = ['zh', 'en', 'ar', 'es', 'fr', 'ru'];
const expectedLanguages = [...languages].sort();
const canonicalKeys = Object.keys(translations.zh).sort();
let passed = 0;

function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  passed += 1;
}

check(
  JSON.stringify(Object.keys(translations).sort()) === JSON.stringify(expectedLanguages),
  'Translation dictionaries cover exactly the six supported locales'
);

for (const language of languages) {
  const dictionary = translations[language];
  const keys = Object.keys(dictionary).sort();
  check(
    keys.length === canonicalKeys.length && keys.every((key, index) => key === canonicalKeys[index]),
    `${language}: translation dictionary has the same keys as the canonical locale`
  );
  const incompleteEntries = Object.entries(dictionary)
    .filter(([, value]) => typeof value !== 'string' || value.trim().length === 0)
    .map(([key]) => key);
  check(
    incompleteEntries.length === 0,
    `${language}: all translation values are non-empty strings${incompleteEntries.length ? ` (${incompleteEntries.join(', ')})` : ''}`
  );
}

console.log(
  `Localization regression: ${passed} passed, 0 failed (${languages.length} locales; ${canonicalKeys.length} shared keys; no API calls).`
);
