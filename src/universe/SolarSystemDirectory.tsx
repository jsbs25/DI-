import React from 'react';
import { Orbit } from 'lucide-react';
import { CELESTIAL_BODIES } from './celestialBodies';
import { getPlanetEcosystem } from './planetEcosystems';

interface SolarSystemDirectoryProps {
  onSelectPlanet: (planetId: string) => void;
}

export const SolarSystemDirectory: React.FC<SolarSystemDirectoryProps> = ({ onSelectPlanet }) => (
  <section aria-labelledby="solar-system-heading" className="relative z-10 w-full border-t border-white/[0.08] bg-[#030712] px-4 py-10 sm:px-8 lg:px-12">
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.24em] text-cyan-300/70">EARTH ONE · SOLAR SYSTEM</p>
          <h2 id="solar-system-heading" className="mt-2 text-2xl font-semibold text-white sm:text-3xl">太阳系 · 10 个天体</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">地球是人类主世界；从太阳、月球到八大行星，可进入各自已开放的数字生态，未开放的生态会明确标注建设状态。</p>
        </div>
        <button
          type="button"
          onClick={() => onSelectPlanet('')}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.07] px-4 py-2 text-sm font-medium text-cyan-100 transition hover:border-cyan-200/40 hover:bg-cyan-300/[0.12]"
        >
          <Orbit className="h-4 w-4" />
          浏览 3D 太阳系
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {CELESTIAL_BODIES.map(body => {
          const ecosystem = getPlanetEcosystem(body.id);
          return (
            <button
              key={body.id}
              type="button"
              onClick={() => onSelectPlanet(body.id)}
              aria-label={`探索${body.chineseName}，${ecosystem?.available ? `进入${ecosystem.titleZh}` : '生态建设中'}`}
              className="group min-h-32 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 text-left transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
            >
              <span className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="h-10 w-10 shrink-0 rounded-full border border-white/15"
                  style={{ backgroundColor: body.visual.baseColor, boxShadow: `0 0 24px ${body.visual.baseColor}55` }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-base font-semibold text-white">{body.chineseName}</span>
                  <span className="block truncate text-[11px] text-slate-500">{body.name}</span>
                </span>
              </span>
              <span className="mt-4 block text-xs text-slate-400">
                {ecosystem?.available ? `进入${ecosystem.titleZh}` : '生态建设中'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  </section>
);
