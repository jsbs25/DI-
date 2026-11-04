import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlanetTelemetryDrawer } from '../src/universe/PlanetTelemetryDrawer.tsx';
import { getCelestialBodyById } from '../src/universe/celestialBodies.ts';

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
      onSwitchToEarthWorld={noop}
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
    html.includes('进入地球生态 (Enter Social World)') === (id === 'earth'),
    `${id}: Earth-world action remains conditional on the Earth selection`
  );
}

const empty = renderToStaticMarkup(
  <PlanetTelemetryDrawer planet={null} onClose={noop} onFocusPlanet={noop} />
);
check(empty === '', 'No celestial selection still renders no drawer');

console.log(`Universe static-render regression: ${passed} passed, 0 failed (not a browser/keyboard test).`);
