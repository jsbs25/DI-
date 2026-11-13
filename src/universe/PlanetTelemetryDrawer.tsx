/**
 * EARTH ONE - UNIVERSE ENGINE
 * Planet Telemetry & Astrophysical Science Drawer
 * 
 * Displays rigorous physical metrics, NASA planetary data, atmospheric composition,
 * human exploratory missions, and fast camera focus controls.
 */

import React from 'react';
import { 
  X, 
  Orbit, 
  Compass, 
  Thermometer, 
  Weight, 
  Maximize2, 
  Globe2, 
  Sparkles,
  Clock,
  Rocket
} from 'lucide-react';
import { CelestialBody } from './celestialBodies';
import { getPlanetEcosystem } from './planetEcosystems';

interface PlanetTelemetryDrawerProps {
  planet: CelestialBody | null;
  onClose: () => void;
  onFocusPlanet: (planetId: string) => void;
  onEnterEcosystem?: (planetId: string) => void;
}

export const PlanetTelemetryDrawer: React.FC<PlanetTelemetryDrawerProps> = ({
  planet,
  onClose,
  onFocusPlanet,
  onEnterEcosystem
}) => {
  if (!planet) return null;

  const statusBadgeConfig = {
    habitable_homeworld: { label: '人类母星 (Habitable Homeworld)', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
    human_outpost_planned: { label: '前哨基地规划中 (Outpost Planned)', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
    robotic_reconnaissance: { label: '深空探测侦察 (Robotic Survey)', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' },
    scientific_observatory: { label: '恒星观测站 (Solar Observatory)', color: 'bg-orange-500/20 text-orange-300 border-orange-500/40' }
  }[planet.humanityRole.status];

  return (
    <div className="fixed top-18 md:top-32 right-4 bottom-6 w-96 max-w-[calc(100vw-2rem)] bg-slate-950/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-40 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
      {/* Drawer Header */}
      <div className="relative p-5 border-b border-white/10 bg-gradient-to-r from-slate-900/80 to-transparent">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono uppercase tracking-wider text-cyan-400">
                {planet.type.replace('_', ' ')}
              </span>
              <span className="text-xs text-white/40">•</span>
              <span className="text-xs text-white/60 font-mono">
                {planet.physical.meanOrbitRadiusAU > 0 ? `${planet.physical.meanOrbitRadiusAU} AU` : '0 AU (Central Star)'}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              {planet.name} <span className="text-lg font-medium text-white/50">{planet.chineseName}</span>
            </h2>
          </div>
          <button 
            type="button"
            aria-label="关闭天体遥测 (Close celestial telemetry)"
            title="关闭天体遥测 (Close celestial telemetry)"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-2 text-xs text-white/70 leading-relaxed italic">
          "{planet.tagline}"
        </p>

        {/* Humanity Status Tag */}
        <div className="mt-3">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${statusBadgeConfig.color}`}>
            <Sparkles className="w-3 h-3" />
            {statusBadgeConfig.label}
          </span>
        </div>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 text-sm">
        {/* Quick Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onFocusPlanet(planet.id)}
            className="flex-1 py-2 px-3 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 rounded-xl font-medium text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm shadow-cyan-950"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            对焦轨道观测 (Focus Orbit)
          </button>

          {(() => {
            const eco = getPlanetEcosystem(planet.id);
            if (!eco) return null;
            if (!eco.available) {
              return (
                <div className="flex-1 py-2 px-3 bg-white/5 text-white/45 border border-white/10 rounded-xl text-xs flex items-center justify-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  生态建设中 (Under Construction)
                </div>
              );
            }
            return (
              <button
                onClick={() => onEnterEcosystem?.(planet.id)}
                className={`flex-1 py-2 px-3 bg-gradient-to-r ${eco.buttonClass} text-white rounded-xl font-medium text-xs flex items-center justify-center gap-1.5 transition-all shadow-md`}
              >
                <Globe2 className="w-3.5 h-3.5" />
                {`进入${eco.titleZh} (Enter ${eco.titleEn})`}
              </button>
            );
          })()}
        </div>

        {/* Physical Astrophysical Metrics Grid */}
        <div>
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
            天体物理核心常数 (Astrophysical Constants)
          </h3>
          <div className="grid grid-cols-2 gap-2.5 font-mono">
            <div className="p-3 bg-white/5 rounded-xl border border-white/5">
              <div className="flex items-center gap-1.5 text-white/50 text-xs mb-1">
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                <span>平均半径 (Radius)</span>
              </div>
              <div className="text-white font-semibold text-sm">
                {planet.physical.meanRadiusKm.toLocaleString()} <span className="text-xs font-normal text-white/50">km</span>
              </div>
            </div>

            <div className="p-3 bg-white/5 rounded-xl border border-white/5">
              <div className="flex items-center gap-1.5 text-white/50 text-xs mb-1">
                <Weight className="w-3.5 h-3.5 text-purple-400" />
                <span>天体质量 (Mass)</span>
              </div>
              <div className="text-white font-semibold text-xs leading-5">
                {planet.physical.massKg} <span className="font-normal text-white/50">kg</span>
              </div>
            </div>

            <div className="p-3 bg-white/5 rounded-xl border border-white/5">
              <div className="flex items-center gap-1.5 text-white/50 text-xs mb-1">
                <Orbit className="w-3.5 h-3.5 text-blue-400" />
                <span>公转周期 (Orbit)</span>
              </div>
              <div className="text-white font-semibold text-sm">
                {planet.physical.orbitalPeriodEarthDays > 0 
                  ? `${planet.physical.orbitalPeriodEarthDays.toLocaleString()} 天` 
                  : '中心恒星'}
              </div>
            </div>

            <div className="p-3 bg-white/5 rounded-xl border border-white/5">
              <div className="flex items-center gap-1.5 text-white/50 text-xs mb-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>自转周期 (Day)</span>
              </div>
              <div className="text-white font-semibold text-sm">
                {Math.abs(planet.physical.rotationPeriodHours)} <span className="text-xs font-normal text-white/50">h</span>
                {planet.physical.rotationPeriodHours < 0 && <span className="text-[10px] text-amber-400 ml-1">逆行</span>}
              </div>
            </div>

            <div className="p-3 bg-white/5 rounded-xl border border-white/5">
              <div className="flex items-center gap-1.5 text-white/50 text-xs mb-1">
                <Thermometer className="w-3.5 h-3.5 text-rose-400" />
                <span>平均表面温度</span>
              </div>
              <div className="text-white font-semibold text-sm">
                {planet.physical.surfaceTempKelvin.mean} <span className="text-xs font-normal text-white/50">K</span>
                <span className="text-xs font-normal text-white/40 ml-1">
                  ({Math.round(planet.physical.surfaceTempKelvin.mean - 273.15)}°C)
                </span>
              </div>
            </div>

            <div className="p-3 bg-white/5 rounded-xl border border-white/5">
              <div className="flex items-center gap-1.5 text-white/50 text-xs mb-1">
                <Orbit className="w-3.5 h-3.5 text-emerald-400" />
                <span>已知卫星 (Moons)</span>
              </div>
              <div className="text-white font-semibold text-sm">
                {planet.physical.moonsKnownCount} <span className="text-xs font-normal text-white/50">颗</span>
              </div>
            </div>
          </div>
        </div>

        {/* Atmospheric Composition */}
        {planet.visual.atmosphere?.hasAtmosphere && (
          <div>
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2.5">
              大气层结构与成分 (Atmospheric Composition)
            </h3>
            <div className="space-y-2">
              {planet.visual.atmosphere.composition.map((comp) => (
                <div key={comp.gas} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/80">{comp.gas}</span>
                    <span className="font-mono text-cyan-400">{comp.percentage}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-cyan-400 rounded-full" 
                      style={{ width: `${Math.min(100, comp.percentage)}%` }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ring System Details (For Saturn / Uranus) */}
        {planet.visual.rings && (
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/20">
            <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">
              光环构造系统 (Planetary Ring Architecture)
            </h4>
            <p className="text-xs text-white/70 leading-relaxed">
              具有高反射率冰晶光环，卡西尼环缝（Cassini Division，宽 4,800 km）清晰可见，由主B环、A环及内侧微弱C环组成。轴倾角为 {planet.visual.rings.tiltDegrees}°。
            </p>
          </div>
        )}

        {/* Human Scientific Exploration History */}
        <div>
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Rocket className="w-3.5 h-3.5 text-blue-400" />
            人类深空探索任务纪要 (Historical Missions)
          </h3>
          <div className="space-y-2">
            {planet.humanityRole.notableMissions.map((mission) => (
              <div key={mission.name} className="p-3 bg-white/5 border border-white/5 rounded-xl">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-white">{mission.name}</span>
                  <span className="text-[11px] font-mono text-cyan-400/80 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                    {mission.agency} • {mission.year}
                  </span>
                </div>
                <p className="text-xs text-white/60 leading-relaxed">
                  {mission.achievement}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Ecosystem Overview Description */}
        <div className="p-3.5 bg-white/5 border border-white/5 rounded-xl text-xs text-white/70 leading-relaxed">
          <span className="font-semibold text-white block mb-1">地球一号宇宙生态视角：</span>
          {planet.humanityRole.description}
        </div>
      </div>
    </div>
  );
};
