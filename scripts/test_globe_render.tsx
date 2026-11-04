import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DigitalGlobe } from '../src/components/globe/DigitalGlobe.tsx';
import { translations } from '../src/i18n/translations.ts';
import type { Language } from '../src/types/index.ts';

// Static rendering deliberately runs no WebGL effects, browser actions or API calls.
// These checks protect markup/content contracts; they do not prove visual geometry or RTL interaction.
const languages: Language[] = ['zh', 'en', 'ar', 'es', 'fr', 'ru'];
let passed = 0;
const noop = () => {};

function check(condition: boolean, description: string) {
  assert.ok(condition, description);
  passed += 1;
}

function escaped(text: string) {
  return renderToStaticMarkup(<>{text}</>);
}

for (const lang of languages) {
  const t = translations[lang];
  const html = renderToStaticMarkup(
    <DigitalGlobe
      nodes={[]}
      countries={[]}
      activeCountry={null}
      onSelectCountry={noop}
      onSelectUser={noop}
      onSelectTab={noop}
      onExploreUniverse={noop}
      onExploreCommunity={noop}
      lang={lang}
    />
  );

  check(
    [t.universeOverview, t.peopleOnEarth, t.planets, t.starsInGalaxy].every(label => html.includes(escaped(label))),
    `${lang}: overview title and all three translated metric labels are retained`
  );
  check(
    />\s*8\.0B\+\s*<\/div>/.test(html) && />\s*8\s*<\/div>/.test(html) && />\s*100B\+\s*<\/div>/.test(html),
    `${lang}: all three existing metric values are retained`
  );
  check(
    html.includes('class="grid grid-cols-3 gap-x-2 gap-y-3"') &&
      (html.match(/min-w-0 border-s border-slate-800 text-center/g) || []).length === 2,
    `${lang}: three-column markup and logical-direction metric dividers are retained`
  );
  check(
    html.includes('col-span-3 hidden justify-center border-t border-slate-800/60 pt-2 sm:flex') &&
      html.includes('M 0,22 Q 15,22 25,10 T 50,26 T 75,6 T 100,18'),
    `${lang}: existing waveform is retained on a separate responsive row`
  );
}

console.log(`Globe static-render regression: ${passed} passed, 0 failed (${languages.length} locales; not a browser/WebGL test).`);
