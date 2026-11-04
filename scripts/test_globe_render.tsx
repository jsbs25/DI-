import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DigitalGlobe } from '../src/components/globe/DigitalGlobe.tsx';
import { HolographicAICompanion } from '../src/components/ai/HolographicAICompanion.tsx';
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
  check(t.crawlerCenter.trim().length > 0, `${lang}: crawler menu label is localized`);
  const html = renderToStaticMarkup(
    <DigitalGlobe
      nodes={[]}
      countries={[]}
      showGlobeTools={false}
      onToggleGlobeTools={noop}
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
    html.includes('aria-expanded="false"') && html.includes(escaped(t.showGlobeTools)),
    `${lang}: the globe-tools disclosure is localized and starts collapsed`
  );
  check(
    ['globe-local-nav', 'globe-mobile-controls', 'globe-telemetry-panel', 'globe-statistics-panel', 'globe-controls-rail']
      .every(id => html.includes(`id="${id}" style="display:none"`)),
    `${lang}: duplicate navigation and globe overlays are hidden by default`
  );
  check(
    html.includes(escaped(t.startExploring)) && html.includes('aria-pressed="false"') &&
      html.includes(escaped(t.issTracker || '国际空间站实时遥测')) &&
      html.includes(escaped(t.seismicMonitor || '全球地震带实时监测')),
    `${lang}: the single explore action and existing live telemetry remain available`
  );

  const openHtml = renderToStaticMarkup(
    <DigitalGlobe
      nodes={[]}
      countries={[]}
      showGlobeTools={true}
      onToggleGlobeTools={noop}
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
    openHtml.includes('aria-expanded="true"') &&
      !openHtml.includes('id="globe-telemetry-panel" style="display:none"') &&
      !openHtml.includes('id="globe-local-nav" style="display:none"'),
    `${lang}: opening the disclosure restores live telemetry and local navigation`
  );
  check(
    [t.globeTab, t.feedTab, t.universeTab, t.communityTab, t.knowledgeTab, t.digitalLibrary, t.apps]
      .every(label => openHtml.includes(escaped(label))),
    `${lang}: existing navigation destinations remain available on demand`
  );
}

const aiLauncherHidden = renderToStaticMarkup(
  <HolographicAICompanion lang="zh" showLauncher={false} />
);
const aiLauncherVisible = renderToStaticMarkup(
  <HolographicAICompanion lang="zh" showLauncher={true} />
);
check(
  aiLauncherHidden.includes('id="globe-ai-launcher"') &&
    !aiLauncherHidden.includes('aria-label="打开地球计划 AI 对话"') &&
    aiLauncherVisible.includes('aria-label="打开地球计划 AI 对话"'),
  'the floating AI launcher is hidden by request and remains available on demand'
);

console.log(`Globe static-render regression: ${passed} passed, 0 failed (${languages.length} locales; not a browser/WebGL test).`);
