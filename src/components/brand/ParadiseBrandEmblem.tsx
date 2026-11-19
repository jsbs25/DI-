import React from 'react';

export type ParadiseEmblemSurface = 'garden-day' | 'garden-night' | 'light' | 'dark';
export type ParadiseEmblemVariant = 'medallion' | 'lockup' | 'crest';

interface ParadiseBrandEmblemProps {
  surface?: ParadiseEmblemSurface;
  variant?: ParadiseEmblemVariant;
  size?: number;
  subtitle?: string;
  className?: string;
}

/**
 * ParadiseBrandEmblem
 *
 * Clean, single-layer presentation of the EARTH ONE logo (`/earth-one-icon.png`)
 * without any overlapping secondary rings or duplicate marks.
 * Adapts border hairline & ambient glow softly to Paradise World day/night tones.
 */
export const ParadiseBrandEmblem: React.FC<ParadiseBrandEmblemProps> = ({
  surface = 'garden-day',
  variant = 'medallion',
  size = 36,
  subtitle,
  className = '',
}) => {
  const isLightLike = surface === 'garden-day' || surface === 'light';

  const medallion = (
    <div
      className={`relative shrink-0 inline-flex items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: '#08101c',
        boxShadow: isLightLike
          ? '0 4px 14px rgba(24, 42, 34, 0.18), 0 0 0 1.5px rgba(255, 252, 245, 0.85)'
          : '0 6px 20px rgba(4, 9, 16, 0.48), 0 0 0 1px rgba(214, 183, 127, 0.35)',
      }}
    >
      <img
        src="/earth-one-icon.png"
        alt="EARTH ONE"
        className="h-full w-full object-cover scale-[1.06]"
        draggable={false}
      />
    </div>
  );

  if (variant === 'medallion') {
    return medallion;
  }

  if (variant === 'crest') {
    return (
      <div className={`inline-flex flex-col items-center gap-3 ${className}`}>
        <div className="relative flex items-center justify-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full"
            style={{
              width: size + 24,
              height: size + 24,
              background: isLightLike
                ? 'radial-gradient(circle, rgba(196,168,118,0.24) 0%, rgba(36,120,100,0.08) 54%, transparent 74%)'
                : 'radial-gradient(circle, rgba(214,183,127,0.22) 0%, rgba(46,139,116,0.10) 54%, transparent 74%)',
            }}
          />
          {medallion}
        </div>
        <div className="text-center">
          <div
            className={`text-base font-semibold tracking-[0.26em] whitespace-nowrap ${
              isLightLike ? 'text-[#1b2b24]' : 'text-[#f7f4ec]'
            }`}
          >
            EARTH ONE
          </div>
          {subtitle && (
            <div
              className={`mt-1 text-xs tracking-[0.14em] ${
                isLightLike ? 'text-[#465b51]' : 'text-[#d9d2c3]/80'
              }`}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2.5 shrink-0 ${className}`}>
      {medallion}
      <div className="flex flex-col leading-none">
        <span
          className={`whitespace-nowrap text-[12px] font-semibold tracking-[0.22em] ${
            isLightLike ? 'text-[#1b2c24]' : 'text-[#f7f4ec]'
          }`}
        >
          EARTH ONE
        </span>
        {subtitle && (
          <span
            className={`mt-0.5 whitespace-nowrap text-[10px] tracking-[0.1em] ${
              isLightLike ? 'text-[#496055]' : 'text-[#d6d0c2]/75'
            }`}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
};

export default ParadiseBrandEmblem;

