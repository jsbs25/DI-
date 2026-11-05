import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlanetTelemetryDrawer } from '../src/universe/PlanetTelemetryDrawer.tsx';
import { CELESTIAL_BODIES, getCelestialBodyById } from '../src/universe/celestialBodies.ts';
import { SolarSystemDirectory } from '../src/universe/SolarSystemDirectory.tsx';
import { getPlanetEcosystem } from '../src/universe/planetEcosystems.ts';
import { SaturnSpace } from '../src/universe/SaturnSpace.tsx';
import { VenusCreativeStudio } from '../src/universe/VenusCreativeStudio.tsx';

// Static markup checks only: no browser input, focus/keyboard, camera or API behavior is exercised.
let passed = 0;
const noop = () => {};

function check(condition: boolean, description: string) {
  assert.ok(condition, description);
  passed += 1;
}

for (const id of ['earth', 'saturn']) {
  const planet = getCelestialBodyById(id);
  assert.ok(planet, `Missing celestial fixture: ${id}`);
  const html = renderToStaticMarkup(
    <PlanetTelemetryDrawer
      planet={planet}
      onClose={noop}
      onFocusPlanet={noop}
      onEnterEcosystem={noop}
    />
  );

  check(
    html.includes('<button type="button" aria-label="关闭天体遥测 (Close celestial telemetry)"'),
    `${id}: close control has an explicit non-submit type and accessible name`
  );
  check(
    html.includes(planet.name) && html.includes(planet.chineseName),
    `${id}: existing English and Chinese celestial names remain visible`
  );
  check(html.includes('对焦轨道观测 (Focus Orbit)'), `${id}: focus action text is retained`);
  check(
    html.includes('进入人类世界 (Enter Humanity)') === (id === 'earth'),
    `${id}: Earth-world action remains conditional on the Earth selection`
  );
}

const empty = renderToStaticMarkup(
  <PlanetTelemetryDrawer planet={null} onClose={noop} onFocusPlanet={noop} />
);
check(empty === '', 'No celestial selection still renders no drawer');

const directory = renderToStaticMarkup(<SolarSystemDirectory onSelectPlanet={noop} />);
check(CELESTIAL_BODIES.length === 10, 'Solar system source contains the Sun, eight planets and the Moon');
check(directory.includes('太阳系 · 10 个天体'), 'Main-world directory clearly identifies the ten-body solar system');
for (const body of CELESTIAL_BODIES) {
  check(directory.includes(body.chineseName) && directory.includes(body.name), `${body.id}: appears as a bilingual celestial entry`);
}
check(directory.includes('地球是人类主世界'), 'Directory preserves Earth as humanity’s main world');
check(directory.includes('进入创作工坊'), 'Venus is presented as an available creative ecosystem');
check(directory.includes('进入影视探索'), 'Saturn is presented as JUPITER-backed video discovery');
check(!directory.includes('生态建设中'), 'Implemented planetary ecosystems are not mislabeled as under construction');
check(getPlanetEcosystem('venus')?.available === true, 'Venus is available only through its implemented creative ecosystem');
check(getPlanetEcosystem('saturn')?.titleEn === 'Video Discovery', 'Saturn points to the shared video discovery experience');
const venusStudio = renderToStaticMarkup(
  <VenusCreativeStudio articles={[]} lang="zh" onCreateArticle={() => {}} onBack={noop} />
);
check(venusStudio.includes('EARTH ONE · VENUS'), 'Venus opens its own creative-studio experience');
check(venusStudio.includes('撰写长文'), 'Venus reuses the existing creator publishing flow');
check(venusStudio.includes('没有独立音乐库'), 'Venus honestly explains that it has no standalone music catalog');
const saturnSpace = renderToStaticMarkup(
  <SaturnSpace lang="zh" onBack={noop} onOpenInJupiter={noop} />
);
check(saturnSpace.includes('JUPITER 的真实视频搜索'), 'Saturn video discovery clearly reuses JUPITER search');
check(!saturnSpace.includes('YouTube'), 'Saturn does not present itself as a YouTube client');

console.log(`Universe static-render regression: ${passed} passed, 0 failed (not a browser/keyboard test).`);
