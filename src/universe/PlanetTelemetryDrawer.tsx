/**
 * EARTH ONE - UNIVERSE ENGINE
 * Planet Telemetry & Astrophysical Science Drawer
 *
 * Displays real physical metrics, atmospheric composition, and exploration
 * history from celestialBodies data. No fabricated telemetry.
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
  Rocket,
  ArrowRight
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
    habitable_homeworld: { label: '人类母星 · Habitable Homeworld', tone: 'var(--color-one-success)', bg: 'rgba(76,195,138,0.12)', border: 'rgba(76,195,138,0.28)' },
    human_outpost_planned: { label: '前哨规划 · Outpost Planned', tone: 'var(--color-one-gold)', bg: 'rgba(215,182,118,0.12)', border: 'rgba(215,182,118,0.28)' },
    robotic_reconnaissance: { label: '深空探测 · Robotic Survey', tone: 'var(--color-one-accent)', bg: 'rgba(127,212,255,0.12)', border: 'rgba(127,212,255,0.28)' },
    scientific_observatory: { label: '恒星观测 · Solar Observatory', tone: 'var(--color-one-warning)', bg: 'rgba(227,179,65,0.12)', border: 'rgba(227,179,65,0.28)' }
  }[planet.humanityRole.status];

  const eco = getPlanetEcosystem(planet.id);

  return (
    <aside
      className="fixed inset-x-3 bottom-3 top-auto z-40 flex max-h-[72vh] flex-col overflow-hidden rounded-2xl border md:inset-x-auto md:bottom-5 md:right-4 md:top-24 md:max-h-none md:w-[380px]"
      style={{
        background: 'color-mix(in srgb, var(--color-one-surface-elevated) 88%, rgba(5,7,11,0.92))',
        borderColor: 'var(--color-one-border-strong)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}
      role="complementary"
      aria-label="Celestial telemetry"
    >
      {/* Header */}
      <div className="relative border-b px-4 py-4 sm:px-5" style={{ borderColor: 'var(--color-one-border)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <span className="font-mono uppercase tracking-[0.14em]" style={{ color: 'var(--color-one-accent)' }}>
                {planet.type.replace(/_/g, ' ')}
              </span>
              <span style={{ color: 'var(--color-one-text-dim)' }}>·</span>
              <span className="font-mono" style={{ color: 'var(--color-one-text-dim)' }}>
                {planet.physical.meanOrbitRadiusAU > 0 ? `${planet.physical.meanOrbitRadiusAU} AU` : '0 AU · Central Star'}
              </span>
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-[color:var(--color-one-text)]">
              {planet.chineseName}
              <span className="ml-2 text-base font-medium text-[color:var(--color-one-text-muted)]">{planet.name}</span>
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--color-one-text-muted)]">{planet.tagline}</p>
          </div>
          <button
            type="button"
            aria-label="关闭天体信息"
            title="关闭"
            onClick={onClose}
            className="one-btn one-btn-sm one-btn-ghost shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
            style={{ color: statusBadgeConfig.tone, background: statusBadgeConfig.bg, borderColor: statusBadgeConfig.border }}
          >
            <Sparkles className="h-3 w-3" />
            {statusBadgeConfig.label}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 text-sm sm:px-5">
        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => onFocusPlanet(planet.id)}
            className="one-btn one-btn-md one-btn-secondary flex-1 justify-center"
          >
            <Maximize2 className="h-4 w-4" />
            <span>对焦观测</span>
          </button>

          {eco ? (
            eco.available ? (
              <button
                onClick={() => onEnterEcosystem?.(planet.id)}
                className="one-btn one-btn-md one-btn-primary flex-1 justify-center"
              >
                <Globe2 className="h-4 w-4" />
                <span>进入 {eco.titleZh}</span>
                <ArrowRight className="h-3.5 w-3.5 opacity-70" />
              </button>
            ) : (
              <div
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs"
                style={{ borderColor: 'var(--color-one-border)', color: 'var(--color-one-text-dim)', background: 'rgba(244,243,238,0.03)' }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                生态建设中
              </div>
            )
          ) : null}
        </div>

        {eco && (
          <div
            className="rounded-xl border px-3.5 py-3 text-xs leading-relaxed"
            style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.02)' }}
          >
            <span className="font-medium text-[color:var(--color-one-text)]">{eco.titleZh}</span>
            <span className="text-[color:var(--color-one-text-dim)]"> · {eco.titleEn}</span>
            <p className="mt-1 text-[color:var(--color-one-text-muted)]">{eco.descriptionZh}</p>
          </div>
        )}

        {/* Physical metrics */}
        <div>
          <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-one-text-dim)]">
            天体物理常数 · Physical Constants
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <Metric icon={<Compass className="h-3.5 w-3.5" />} label="平均半径" value={`${planet.physical.meanRadiusKm.toLocaleString()} km`} />
            <Metric icon={<Weight className="h-3.5 w-3.5" />} label="质量" value={`${planet.physical.massKg} kg`} small />
            <Metric
              icon={<Orbit className="h-3.5 w-3.5" />}
              label="公转周期"
              value={planet.physical.orbitalPeriodEarthDays > 0 ? `${planet.physical.orbitalPeriodEarthDays.toLocaleString()} 天` : '中心恒星'}
            />
            <Metric
              icon={<Clock className="h-3.5 w-3.5" />}
              label="自转周期"
              value={`${Math.abs(planet.physical.rotationPeriodHours)} h${planet.physical.rotationPeriodHours < 0 ? ' 逆行' : ''}`}
            />
            <Metric
              icon={<Thermometer className="h-3.5 w-3.5" />}
              label="平均表面温度"
              value={`${planet.physical.surfaceTempKelvin.mean} K (${Math.round(planet.physical.surfaceTempKelvin.mean - 273.15)}°C)`}
            />
            <Metric icon={<Orbit className="h-3.5 w-3.5" />} label="已知卫星" value={`${planet.physical.moonsKnownCount} 颗`} />
          </div>
        </div>

        {/* Atmosphere */}
        {planet.visual.atmosphere?.hasAtmosphere && (
          <div>
            <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-one-text-dim)]">
              大气成分 · Atmosphere
            </h3>
            <div className="space-y-2.5">
              {planet.visual.atmosphere.composition.map((comp) => (
                <div key={comp.gas}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-[color:var(--color-one-text-muted)]">{comp.gas}</span>
                    <span className="font-mono" style={{ color: 'var(--color-one-accent)' }}>
                      {comp.percentage}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(244,243,238,0.08)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, comp.percentage)}%`,
                        background: 'linear-gradient(90deg, rgba(127,212,255,0.7), rgba(127,212,255,0.35))'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rings */}
        {planet.visual.rings && (
          <div className="rounded-xl border px-3.5 py-3" style={{ borderColor: 'rgba(215,182,118,0.22)', background: 'rgba(215,182,118,0.06)' }}>
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--color-one-gold)' }}>
              光环系统 · Ring System
            </h4>
            <p className="text-xs leading-relaxed text-[color:var(--color-one-text-muted)]">
              高反射率冰晶光环，卡西尼环缝（Cassini Division）可见，由主 B/A 环及内侧 C 环等结构组成。轴倾角 {planet.visual.rings.tiltDegrees}°。
            </p>
          </div>
        )}

        {/* Missions */}
        <div>
          <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-one-text-dim)]">
            <Rocket className="h-3.5 w-3.5" style={{ color: 'var(--color-one-accent)' }} />
            探索任务 · Missions
          </h3>
          <div className="space-y-2">
            {planet.humanityRole.notableMissions.map((mission) => (
              <div key={mission.name} className="rounded-xl border p-3" style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.02)' }}>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-[color:var(--color-one-text)]">{mission.name}</span>
                  <span className="rounded-md px-1.5 py-0.5 font-mono text-[10px]" style={{ color: 'var(--color-one-accent)', background: 'rgba(127,212,255,0.1)' }}>
                    {mission.agency} · {mission.year}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-[color:var(--color-one-text-muted)]">{mission.achievement}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border px-3.5 py-3 text-xs leading-relaxed" style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.02)' }}>
          <span className="mb-1 block font-medium text-[color:var(--color-one-text)]">空间视角</span>
          <span className="text-[color:var(--color-one-text-muted)]">{planet.humanityRole.description}</span>
        </div>
      </div>
    </aside>
  );
};

function Metric({
  icon,
  label,
  value,
  small
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.02)' }}>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-[color:var(--color-one-text-dim)]">
        <span style={{ color: 'var(--color-one-accent)' }}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className={`font-medium text-[color:var(--color-one-text)] ${small ? 'text-xs leading-5' : 'text-sm'}`}>{value}</div>
    </div>
  );
}
