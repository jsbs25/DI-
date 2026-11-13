import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Eye,
  Grid,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Sun,
  Moon,
  Contrast
} from 'lucide-react';
import {
  BRAND_COLORS,
  BRAND_CONCEPTS,
  BrandConceptId,
  BrandLockupType,
  BrandMark,
  BrandSurfaceMode,
  buildBrandSvgMarkup,
  getPaletteForMode
} from './brandLogos.tsx';
import { Language } from '../../types/index.ts';

interface BrandIdentitySystemProps {
  lang: Language;
  onBackToGlobe?: () => void;
}

type ChapterId = 'philosophy' | 'concepts' | 'applications' | 'refinement' | 'guidelines';

const CHAPTERS: { id: ChapterId; num: string; zh: string; en: string }[] = [
  { id: 'philosophy', num: '01', zh: '品牌哲学与文化提炼', en: 'Philosophy & Culture' },
  { id: 'concepts', num: '02', zh: '三套原创 Logo 方案', en: 'Three Original Concepts' },
  { id: 'applications', num: '03', zh: '12 大应用场景对比', en: '12 Product Applications' },
  { id: 'refinement', num: '04', zh: '终稿精修与动态标志', en: 'Refinement & Motion' },
  { id: 'guidelines', num: '05', zh: '品牌规范与源文件', en: 'Guidelines & Exports' }
];

const SURFACE_MODES: { id: BrandSurfaceMode; label: string; icon: React.ReactNode }[] = [
  { id: 'dark', label: '深色 Obsidian', icon: <Moon className="w-3.5 h-3.5" /> },
  { id: 'light', label: '浅色 Ivory', icon: <Sun className="w-3.5 h-3.5" /> },
  { id: 'mono-dark', label: '反白 Mono', icon: <Contrast className="w-3.5 h-3.5" /> },
  { id: 'mono-light', label: '纯黑 Mono', icon: <Eye className="w-3.5 h-3.5" /> }
];

const AUDIT_CRITERIA = [
  { id: 1, title: '独特外部轮廓', origin: true, infinity: true, horizon: true },
  { id: 2, title: '脱离文字独立识别', origin: true, infinity: true, horizon: true },
  { id: 3, title: '明确几何构造逻辑', origin: true, infinity: true, horizon: true },
  { id: 4, title: '体现“一源万象”品牌哲学', origin: true, infinity: true, horizon: true },
  { id: 5, title: '避开知名品牌撞车结构', origin: true, infinity: true, horizon: true },
  { id: 6, title: '纯黑白单色完全成立', origin: true, infinity: true, horizon: true },
  { id: 7, title: '16px App 微缩清晰度', origin: true, infinity: false, horizon: true },
  { id: 8, title: '国际无障碍文化认同', origin: true, infinity: true, horizon: true },
  { id: 9, title: '十年以上长期耐看度', origin: true, infinity: true, horizon: true },
  { id: 10, title: '具备独立商标注册潜力（需另行查重）', origin: true, infinity: true, horizon: true }
];

export const BrandIdentitySystem: React.FC<BrandIdentitySystemProps> = ({ lang, onBackToGlobe }) => {
  const [chapter, setChapter] = useState<ChapterId>('concepts');
  const [surfaceMode, setSurfaceMode] = useState<BrandSurfaceMode>('dark');
  const [selectedConcept, setSelectedConcept] = useState<BrandConceptId>('origin-final');
  const [comparisonConcept, setComparisonConcept] = useState<BrandConceptId>('origin-final');
  const [showGrid, setShowGrid] = useState(false);
  const [activeLockup, setActiveLockup] = useState<BrandLockupType>('full-horizontal');

  // 1.6s Dynamic Logo Player state
  const [motionProgress, setMotionProgress] = useState<number>(1);
  const [isPlayingMotion, setIsPlayingMotion] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (!isPlayingMotion || reducedMotion) return;
    let raf = 0;
    const duration = 1600; // 1.6 seconds strict motion envelope
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.max(0, Math.min(1, (now - start) / duration));
      setMotionProgress(p);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setIsPlayingMotion(false);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlayingMotion, reducedMotion]);

  const handlePlayMotion = () => {
    if (reducedMotion) {
      setMotionProgress(1);
      setIsPlayingMotion(false);
      return;
    }
    setMotionProgress(0);
    setIsPlayingMotion(true);
  };

  const activeMeta = useMemo(
    () => BRAND_CONCEPTS.find(c => c.id === selectedConcept) || BRAND_CONCEPTS[3],
    [selectedConcept]
  );

  const surfacePalette = useMemo(() => getPaletteForMode(surfaceMode), [surfaceMode]);

  const triggerDownloadSvg = (
    concept: BrandConceptId,
    mode: BrandSurfaceMode,
    lockup: BrandLockupType,
    includeBg = false
  ) => {
    const svgText = buildBrandSvgMarkup(concept, mode, lockup, { includeBackground: includeBg });
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `duyi-one-${concept}-${lockup}-${mode}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const triggerDownloadPng = async (
    concept: BrandConceptId,
    mode: BrandSurfaceMode,
    lockup: BrandLockupType,
    transparent = true
  ) => {
    const svgText = buildBrandSvgMarkup(concept, mode, lockup, { includeBackground: !transparent });
    const dims: Record<BrandLockupType, { w: number; h: number }> = {
      symbol: { w: 1024, h: 1024 },
      zh: { w: 880, h: 400 },
      en: { w: 1040, h: 400 },
      'full-vertical': { w: 960, h: 1072 },
      'full-horizontal': { w: 1760, h: 512 }
    };
    const { w, h } = dims[lockup];
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(pngBlob => {
          if (!pngBlob) return;
          const dlUrl = URL.createObjectURL(pngBlob);
          const a = document.createElement('a');
          a.href = dlUrl;
          a.download = `duyi-one-${concept}-${lockup}-${mode}${transparent ? '-transparent' : ''}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(dlUrl);
        }, 'image/png');
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  // Animated stage helpers for Phase 4 Dynamic Logo
  const stage1SeedScale = Math.max(0, Math.min(1, motionProgress / 0.22));
  const stage2AxisProgress = Math.max(0, Math.min(1, (motionProgress - 0.22) / 0.31));
  const stage3RingProgress = Math.max(0, Math.min(1, (motionProgress - 0.53) / 0.28));
  const stage4LockupOpacity = Math.max(0, Math.min(1, (motionProgress - 0.78) / 0.22));

  const currentStageLabel =
    motionProgress < 0.22
      ? '阶段一 · 静谧中心显现 (0–350ms)'
      : motionProgress < 0.53
      ? '阶段二 · 轴线与门桥秩序展开 (350–850ms)'
      : motionProgress < 0.81
      ? '阶段三 · 开放天圆合拢成 ONE 图形 (850–1300ms)'
      : '阶段四 · 独一 ONE 标志稳定呈现 (1300–1600ms)';

  return (
    <div className="min-h-screen bg-[#0B0C0E] text-[#F7F5F0] pb-24">
      {/* Museum / Institutional Editorial Header */}
      <div className="border-b border-white/10 bg-[#0B0C0E]/95">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-8 pb-6">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#A7ADB6] tracking-wider">
                <span>BRAND IDENTITY SYSTEM</span>
                <span aria-hidden="true">·</span>
                <span>EASTERN FUTURISM</span>
                <span aria-hidden="true">·</span>
                <span>全球数字生态视觉识别系统</span>
              </div>
              <div className="mt-3 flex items-center gap-4">
                <BrandMark concept="origin-final" mode="dark" lockup="symbol" size={44} />
                <div>
                  <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-[#F7F5F0]">
                    独一 ONE
                  </h1>
                  <p className="text-sm text-[#A7ADB6] mt-0.5">
                    不止于连接，更在于无限可能 · One World. Infinite Possibilities.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {SURFACE_MODES.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSurfaceMode(m.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    surfaceMode === m.id
                      ? 'bg-[#F7F5F0] text-[#0B0C0E] border-[#F7F5F0]'
                      : 'bg-white/[0.03] text-[#A7ADB6] border-white/10 hover:text-white hover:border-white/25'
                  }`}
                >
                  {m.icon}
                  <span>{m.label}</span>
                </button>
              ))}
              {onBackToGlobe && (
                <button
                  type="button"
                  onClick={onBackToGlobe}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/15 text-[#A7ADB6] hover:text-white hover:border-white/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {lang === 'zh' ? '返回 3D 地球' : 'Back to Earth'}
                </button>
              )}
            </div>
          </div>

          {/* 5-Phase Chapter Navigation */}
          <nav className="mt-7 flex items-center gap-1.5 overflow-x-auto pb-1" aria-label="Brand identity chapters">
            {CHAPTERS.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setChapter(item.id)}
                className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  chapter === item.id
                    ? 'bg-white/[0.1] text-[#F7F5F0] border border-white/20'
                    : 'text-[#A7ADB6] border border-transparent hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <span className="font-mono tabular-nums text-[#C4A876] mr-1.5">{item.num}</span>
                <span>{lang === 'zh' ? item.zh : item.en}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-10 space-y-12">
        {/* PHASE 1: BRAND PHILOSOPHY & EASTERN FUTURISM */}
        {chapter === 'philosophy' && (
          <section className="space-y-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start border-b border-white/10 pb-10">
              <div className="lg:col-span-7 space-y-4">
                <div className="text-xs tracking-widest uppercase text-[#C4A876]">
                  Phase 01 · 品牌定位与核心哲学
                </div>
                <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
                  从一个清醒原点出发，连接世界与无限可能
                </h2>
                <p className="text-sm sm:text-base text-[#A7ADB6] leading-relaxed max-w-2xl">
                  「独一 ONE」不是单一的社交、AI 或信息门户，而是一个面向全球用户、可承载不断演化服务形态的数字生态系统。Logo 必须独立于任何具体功能之外，建立自有视觉母语——东方未来主义（Eastern Futurism）。
                </p>
              </div>
              <div className="lg:col-span-5 rounded-xl border border-white/10 bg-[#14161A] p-6 space-y-3">
                <div className="text-xs font-mono text-[#A7ADB6] uppercase tracking-wider">
                  ONE · 五维品牌含义
                </div>
                <dl className="divide-y divide-white/[0.06] text-sm">
                  {[
                    ['01 · 唯一', '独一无二的文化精神骨架，不随波逐流'],
                    ['02 · 统一', '多元文明、语言与个体在同一秩序中共存'],
                    ['03 · 起源', '万象始于一个纯粹且稳定的精神中心'],
                    ['04 · 连接', '开放门桥连通人与人、知识与未来'],
                    ['05 · 无限', '打破封闭边界，向未来持续生长']
                  ].map(([k, v]) => (
                    <div key={k} className="py-2.5 flex items-baseline justify-between gap-4">
                      <dt className="font-medium text-[#F7F5F0] whitespace-nowrap">{k}</dt>
                      <dd className="text-xs text-[#A7ADB6] text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            {/* Three Civilizations Synthesis */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="rounded-xl border border-white/10 bg-[#14161A] p-6 space-y-3">
                <div className="text-xs font-mono text-[#2E8B74]">01 · 东方美学基因</div>
                <h3 className="text-lg font-semibold text-white">留白 · 天圆地方 · 玉石温润</h3>
                <p className="text-sm text-[#A7ADB6] leading-relaxed">
                  不画山水、龙凤或传统印章纹样，而是提炼玉璧的残缺呼吸感、书法的起笔顿挫张力，以及虚实相生的构图留白，使符号在高密度数字界中自带静气。
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#14161A] p-6 space-y-3">
                <div className="text-xs font-mono text-[#C4A876]">02 · 伊斯兰几何秩序</div>
                <h3 className="text-lg font-semibold text-white">八角模数 · 旋转对称 · 拱门比例</h3>
                <p className="text-sm text-[#A7ADB6] leading-relaxed">
                  不照搬宗教符号、新月或繁复花窗，而是取法其中极高的几何数学秩序：45° 径向斜切角、等比交叠穿插结构与向外延展的无限几何韵律。
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#14161A] p-6 space-y-3">
                <div className="text-xs font-mono text-[#A7ADB6]">03 · 现代国际科技准则</div>
                <h3 className="text-lg font-semibold text-white">零渐变成立 · 全尺度辨识</h3>
                <p className="text-sm text-[#A7ADB6] leading-relaxed">
                  拒绝廉价霓虹、蓝紫渐变与粒子光效。所有方案均在纯黑白矢量平涂下先确立轮廓识别度，确保从 16px 浏览器标签到建筑级载体始终如一。
                </p>
              </div>
            </div>
          </section>
        )}

        {/* PHASE 2: THREE ORIGINAL LOGO CONCEPTS */}
        {chapter === 'concepts' && (
          <section className="space-y-10">
            {/* Control Strip */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <h2 className="text-xl sm:text-2xl font-semibold text-white">三套差异化原创 Logo 方案深度对比</h2>
                <p className="text-xs sm:text-sm text-[#A7ADB6] mt-1">
                  三套方案分别遵循中心起源（ONE ORIGIN）、八向回环（ONE INFINITY）、负空间视界（ONE HORIZON）构建，非简单换色。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowGrid(g => !g)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    showGrid
                      ? 'bg-[#247864]/25 border-[#2E8B74] text-[#F7F5F0]'
                      : 'bg-white/[0.03] border-white/10 text-[#A7ADB6] hover:text-white'
                  }`}
                >
                  <Grid className="w-3.5 h-3.5" />
                  <span>{showGrid ? '隐藏 128×128 几何构造网格' : '显示 128×128 几何构造网格'}</span>
                </button>
              </div>
            </div>

            {/* 3-Concept Comparison Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {BRAND_CONCEPTS.slice(0, 3).map(c => {
                const isSelected = selectedConcept === c.id;
                return (
                  <div
                    key={c.id}
                    className={`rounded-xl border transition-colors overflow-hidden flex flex-col ${
                      isSelected
                        ? 'border-[#C4A876]/70 bg-[#14161A]'
                        : 'border-white/10 bg-[#14161A]/70 hover:border-white/25'
                    }`}
                  >
                    {/* Preview Canvas */}
                    <div
                      className="h-56 flex items-center justify-center relative border-b border-white/10"
                      style={{ backgroundColor: surfacePalette.bg }}
                    >
                      <BrandMark
                        concept={c.id}
                        mode={surfaceMode}
                        lockup="symbol"
                        size={132}
                        showGrid={showGrid}
                      />
                      <div
                        className="absolute top-3 left-3 text-[11px] font-mono tracking-wider"
                        style={{ color: surfacePalette.secondary }}
                      >
                        {c.code} · {c.name}
                      </div>
                      {c.id === 'origin' && (
                        <div
                          className="absolute top-3 right-3 text-[11px] font-medium"
                          style={{ color: surfacePalette.gold }}
                        >
                          优先方向
                        </div>
                      )}
                    </div>

                    {/* Concept Metadata */}
                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-3">
                        <div>
                          <div className="text-lg font-semibold text-white">
                            {c.name} · {c.zhName}
                          </div>
                          <div className="text-xs text-[#A7ADB6] mt-1">
                            {c.keywords.join(' · ')}
                          </div>
                        </div>
                        <p className="text-xs sm:text-sm text-[#A7ADB6] leading-relaxed">
                          {c.philosophy}
                        </p>
                      </div>

                      <div className="pt-2 flex items-center justify-between gap-2 border-t border-white/[0.06]">
                        <button
                          type="button"
                          onClick={() => setSelectedConcept(c.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-[#F7F5F0] text-[#0B0C0E]'
                              : 'bg-white/[0.06] text-white hover:bg-white/[0.12]'
                          }`}
                        >
                          {isSelected ? '正在查看详情' : '查看构造与评审'}
                        </button>
                        <button
                          type="button"
                          onClick={() => triggerDownloadSvg(c.id, surfaceMode, 'symbol', false)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 text-xs text-[#A7ADB6] hover:text-white cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>SVG</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Deep Inspection Panel for Selected Concept */}
            <div className="rounded-xl border border-white/10 bg-[#14161A] p-6 sm:p-8 space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <div className="text-xs font-mono text-[#C4A876]">
                    方案详述 · {activeMeta.code} · {activeMeta.name}
                  </div>
                  <h3 className="text-xl sm:text-2xl font-semibold text-white mt-1">
                    {activeMeta.zhName} — 四种组合形式与几何构造逻辑
                  </h3>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ['symbol', '纯图形'],
                      ['zh', '中文「独一」'],
                      ['en', '英文 ONE'],
                      ['full-horizontal', '横版「独一 ONE」'],
                      ['full-vertical', '竖版组合']
                    ] as [BrandLockupType, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveLockup(id)}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                        activeLockup === id
                          ? 'bg-[#F7F5F0] text-[#0B0C0E]'
                          : 'bg-white/[0.05] text-[#A7ADB6] hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Lockup Stage */}
              <div
                className="rounded-xl border border-white/10 min-h-[220px] flex items-center justify-center p-8"
                style={{ backgroundColor: surfacePalette.bg }}
              >
                <BrandMark
                  concept={activeMeta.id}
                  mode={surfaceMode}
                  lockup={activeLockup}
                  size={activeLockup === 'full-vertical' ? 120 : 104}
                  showGrid={showGrid && activeLockup === 'symbol'}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-mono text-[#A7ADB6] uppercase">几何构造与比例逻辑</div>
                    <p className="mt-1.5 text-[#F7F5F0]/90 leading-relaxed">{activeMeta.geometryLogic}</p>
                  </div>
                  <div>
                    <div className="text-xs font-mono text-[#A7ADB6] uppercase">文化抽象方式</div>
                    <p className="mt-1.5 text-[#F7F5F0]/90 leading-relaxed">{activeMeta.culturalSynthesis}</p>
                  </div>
                  <div>
                    <div className="text-xs font-mono text-[#A7ADB6] uppercase">色彩与字体逻辑</div>
                    <p className="mt-1.5 text-[#F7F5F0]/90 leading-relaxed">
                      {activeMeta.colorLogic} {activeMeta.typeLogic}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="text-xs font-mono text-[#A7ADB6] uppercase">图形元素含义拆解</div>
                  <dl className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                    {activeMeta.elements.map(el => (
                      <div key={el.label} className="py-2.5">
                        <dt className="font-medium text-white">{el.label}</dt>
                        <dd className="text-xs text-[#A7ADB6] mt-0.5 leading-relaxed">{el.meaning}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <div className="text-xs font-medium text-[#2E8B74] mb-1">优势分析</div>
                      <ul className="space-y-1 text-xs text-[#A7ADB6]">
                        {activeMeta.strengths.map(s => (
                          <li key={s}>· {s}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-[#C4A876] mb-1">潜在不足与约束</div>
                      <ul className="space-y-1 text-xs text-[#A7ADB6]">
                        {activeMeta.limitations.map(l => (
                          <li key={l}>· {l}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 10-Point Originality & Trademark Readiness Audit Matrix */}
            <div className="rounded-xl border border-white/10 bg-[#14161A] p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-white/10">
                <div>
                  <h3 className="text-base font-semibold text-white">十二 · 原创性与设计质量 10 项独立审查矩阵</h3>
                  <p className="text-xs text-[#A7ADB6] mt-0.5">
                    注：AI 自检仅作几何与结构评估；正式商用注册前须通过专业知识产权机构进行全球商标图形查重。
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-[#A7ADB6]">
                      <th className="py-2.5 pr-4 font-medium">审查维度</th>
                      <th className="py-2.5 px-4 font-medium">ONE ORIGIN</th>
                      <th className="py-2.5 px-4 font-medium">ONE INFINITY</th>
                      <th className="py-2.5 pl-4 font-medium">ONE HORIZON</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {AUDIT_CRITERIA.map(row => (
                      <tr key={row.id}>
                        <td className="py-2.5 pr-4 text-[#F7F5F0] tabular-nums">
                          {row.id.toString().padStart(2, '0')}. {row.title}
                        </td>
                        <td className="py-2.5 px-4 text-[#2E8B74]">{row.origin ? '完全成立' : '需微缩补偿'}</td>
                        <td className="py-2.5 px-4 text-[#A7ADB6]">{row.infinity ? '成立' : '16px 略密'}</td>
                        <td className="py-2.5 pl-4 text-[#A7ADB6]">{row.horizon ? '成立' : '需补偿'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* PHASE 3: 12 REAL PRODUCT APPLICATIONS COMPARATOR */}
        {chapter === 'applications' && (
          <section className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <h2 className="text-xl sm:text-2xl font-semibold text-white">第三阶段 · 12 大真实产品应用场景同场对比</h2>
                <p className="text-xs sm:text-sm text-[#A7ADB6] mt-1">
                  切换下方三套方案及终稿精修版，即时检视各图形在网页、移动客户端、极小 Favicon 与线下物料的真实表现。
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {BRAND_CONCEPTS.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setComparisonConcept(c.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      comparisonConcept === c.id
                        ? 'bg-[#F7F5F0] text-[#0B0C0E] border-[#F7F5F0]'
                        : 'bg-white/[0.04] text-[#A7ADB6] border-white/10 hover:text-white'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* 1. Website Home Hero */}
              <div className="rounded-xl border border-white/10 bg-[#14161A] p-5 space-y-3">
                <div className="text-xs font-mono text-[#A7ADB6]">01 · 网站首页品牌展示</div>
                <div className="rounded-lg bg-[#0B0C0E] border border-white/10 p-5 flex flex-col items-start justify-between h-44">
                  <BrandMark concept={comparisonConcept} mode="dark" lockup="full-horizontal" size={34} />
                  <div>
                    <div className="text-base font-semibold text-white">不止于连接，更在于无限可能</div>
                    <div className="text-[11px] text-[#A7ADB6] mt-1">One World. Infinite Possibilities.</div>
                  </div>
                </div>
              </div>

              {/* 2. Mobile App Icon (iOS/Android rounded square + small 48px check) */}
              <div className="rounded-xl border border-white/10 bg-[#14161A] p-5 space-y-3">
                <div className="text-xs font-mono text-[#A7ADB6]">02 · 手机 App 图标（纯图形不硬塞文字）</div>
                <div className="rounded-lg bg-[#1A1D22] border border-white/10 p-5 h-44 flex items-center justify-center gap-6">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-20 h-20 rounded-[22px] bg-[#0B0C0E] border border-white/15 flex items-center justify-center shadow-lg">
                      <BrandMark concept={comparisonConcept} mode="dark" lockup="symbol" size={52} />
                    </div>
                    <span className="text-[10px] text-[#A7ADB6]">独一 ONE</span>
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-12 h-12 rounded-[13px] bg-[#F7F5F0] border border-black/10 flex items-center justify-center shadow">
                      <BrandMark concept={comparisonConcept} mode="light" lockup="symbol" size={32} micro />
                    </div>
                    <span className="text-[10px] text-[#A7ADB6]">48px 浅色</span>
                  </div>
                </div>
              </div>

              {/* 3. Desktop Software Icon */}
              <div className="rounded-xl border border-white/10 bg-[#14161A] p-5 space-y-3">
                <div className="text-xs font-mono text-[#A7ADB6]">03 · 桌面软件 Dock 图标</div>
                <div className="rounded-lg bg-[#0E1117] border border-white/10 p-5 h-44 flex flex-col items-center justify-end">
                  <div className="px-4 py-2.5 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.08]" />
                    <div className="w-12 h-12 rounded-xl bg-[#0B0C0E] border border-[#C4A876]/40 flex items-center justify-center -translate-y-1 shadow-xl">
                      <BrandMark concept={comparisonConcept} mode="dark" lockup="symbol" size={34} />
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-white/[0.08]" />
                    <div className="w-10 h-10 rounded-xl bg-white/[0.08]" />
                  </div>
                  <div className="text-[10px] text-[#A7ADB6] mt-3">macOS / Windows 桌面客户端</div>
                </div>
              </div>

              {/* 4. Browser Tab Favicon */}
              <div className="rounded-xl border border-white/10 bg-[#14161A] p-5 space-y-3">
                <div className="text-xs font-mono text-[#A7ADB6]">04 · 浏览器标签页 Favicon（16px 实测）</div>
                <div className="rounded-lg bg-[#161920] border border-white/10 p-5 h-44 flex flex-col justify-center gap-3">
                  <div className="rounded-t-lg bg-[#0B0C0E] border border-white/10 px-3 py-2 flex items-center gap-2 max-w-[230px]">
                    <BrandMark concept={comparisonConcept} mode="dark" lockup="symbol" size={16} micro />
                    <span className="text-xs text-[#F7F5F0] truncate">独一 ONE · 全球数字生态</span>
                  </div>
                  <div className="rounded-t-lg bg-[#F7F5F0] border border-black/10 px-3 py-2 flex items-center gap-2 max-w-[230px]">
                    <BrandMark concept={comparisonConcept} mode="light" lockup="symbol" size={16} micro />
                    <span className="text-xs text-[#0B0C0E] truncate">ONE · Global Ecosystem</span>
                  </div>
                </div>
              </div>

              {/* 5. Website Navbar */}
              <div className="rounded-xl border border-white/10 bg-[#14161A] p-5 space-y-3">
                <div className="text-xs font-mono text-[#A7ADB6]">05 · 网站顶部导航栏</div>
                <div className="rounded-lg bg-[#0B0C0E] border border-white/10 p-4 h-44 flex items-center">
                  <div className="w-full px-3 py-2.5 rounded-lg border border-white/10 bg-[#14161A] flex items-center justify-between gap-2">
                    <BrandMark concept={comparisonConcept} mode="dark" lockup="full-horizontal" size={22} />
                    <div className="flex items-center gap-3 text-[11px] text-[#A7ADB6]">
                      <span>空间</span>
                      <span>图书馆</span>
                      <span>通信</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 6. Auth / Login Screen */}
              <div className="rounded-xl border border-white/10 bg-[#14161A] p-5 space-y-3">
                <div className="text-xs font-mono text-[#A7ADB6]">06 · 登录与注册界面</div>
                <div className="rounded-lg bg-[#0B0C0E] border border-white/10 p-4 h-44 flex items-center justify-center">
                  <div className="w-56 rounded-lg border border-white/10 bg-[#14161A] p-3.5 space-y-2.5 text-center">
                    <div className="flex justify-center">
                      <BrandMark concept={comparisonConcept} mode="dark" lockup="symbol" size={28} />
                    </div>
                    <div className="text-xs font-medium text-white">登录 独一 ONE 账号</div>
                    <div className="h-6 rounded bg-white/[0.04] border border-white/10" />
                    <div className="h-6 rounded bg-[#F7F5F0] text-[#0B0C0E] text-[10px] font-medium flex items-center justify-center">
                      继续
                    </div>
                  </div>
                </div>
              </div>

              {/* 7. App Splash Screen */}
              <div className="rounded-xl border border-white/10 bg-[#14161A] p-5 space-y-3">
                <div className="text-xs font-mono text-[#A7ADB6]">07 · App 启动画面（Splash）</div>
                <div className="rounded-lg bg-[#0B0C0E] border border-white/10 p-5 h-44 flex flex-col items-center justify-between">
                  <div />
                  <BrandMark concept={comparisonConcept} mode="dark" lockup="full-vertical" size={62} />
                  <div className="text-[10px] text-[#A7ADB6] tracking-widest">ONE WORLD · INFINITE POSSIBILITIES</div>
                </div>
              </div>

              {/* 8. Dark Mode UI */}
              <div className="rounded-xl border border-white/10 bg-[#14161A] p-5 space-y-3">
                <div className="text-xs font-mono text-[#A7ADB6]">08 · 深色模式工作台</div>
                <div className="rounded-lg bg-[#0B0C0E] border border-white/10 p-4 h-44 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <BrandMark concept={comparisonConcept} mode="dark" lockup="symbol" size={22} />
                    <span className="text-[10px] text-[#2E8B74]">知识图谱 · 在线</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2 w-2/3 rounded bg-white/15" />
                    <div className="h-2 w-full rounded bg-white/[0.06]" />
                    <div className="h-2 w-4/5 rounded bg-white/[0.06]" />
                  </div>
                </div>
              </div>

              {/* 9. Light Mode UI */}
              <div className="rounded-xl border border-white/10 bg-[#14161A] p-5 space-y-3">
                <div className="text-xs font-mono text-[#A7ADB6]">09 · 浅色玉石白模式界面</div>
                <div className="rounded-lg bg-[#F7F5F0] border border-black/10 p-4 h-44 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <BrandMark concept={comparisonConcept} mode="light" lockup="full-horizontal" size={22} />
                    <span className="text-[10px] text-[#247864]">数字阅读模式</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2 w-2/3 rounded bg-black/20" />
                    <div className="h-2 w-full rounded bg-black/10" />
                    <div className="h-2 w-4/5 rounded bg-black/10" />
                  </div>
                </div>
              </div>

              {/* 10. Brand Poster */}
              <div className="rounded-xl border border-white/10 bg-[#14161A] p-5 space-y-3">
                <div className="text-xs font-mono text-[#A7ADB6]">10 · 品牌宣传海报（留白排版）</div>
                <div className="rounded-lg bg-[#F7F5F0] text-[#0B0C0E] p-5 h-44 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-mono tracking-widest text-[#6B727E]">NO.01 · ARCHIVE</span>
                    <BrandMark concept={comparisonConcept} mode="light" lockup="symbol" size={38} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">不止于连接，更在于无限可能。</div>
                    <div className="text-[10px] text-[#6B727E] mt-0.5">独一 ONE · 全球数字生态</div>
                  </div>
                </div>
              </div>

              {/* 11. Social Media Avatar */}
              <div className="rounded-xl border border-white/10 bg-[#14161A] p-5 space-y-3">
                <div className="text-xs font-mono text-[#A7ADB6]">11 · 社交媒体圆形头像</div>
                <div className="rounded-lg bg-[#0E1117] border border-white/10 p-5 h-44 flex items-center justify-center gap-6">
                  <div className="w-20 h-20 rounded-full bg-[#0B0C0E] border border-white/20 flex items-center justify-center">
                    <BrandMark concept={comparisonConcept} mode="dark" lockup="symbol" size={48} />
                  </div>
                  <div className="w-20 h-20 rounded-full bg-[#F7F5F0] border border-black/10 flex items-center justify-center">
                    <BrandMark concept={comparisonConcept} mode="light" lockup="symbol" size={48} />
                  </div>
                </div>
              </div>

              {/* 12. Business Card / Digital Pass */}
              <div className="rounded-xl border border-white/10 bg-[#14161A] p-5 space-y-3">
                <div className="text-xs font-mono text-[#A7ADB6]">12 · 实体名片与数字身份卡</div>
                <div className="rounded-lg bg-[#1A1D22] border border-white/10 p-5 h-44 flex items-center justify-center">
                  <div className="w-60 h-32 rounded-md bg-[#0B0C0E] border border-[#C4A876]/35 p-4 flex flex-col justify-between shadow-xl">
                    <div className="flex items-center justify-between">
                      <BrandMark concept={comparisonConcept} mode="dark" lockup="symbol" size={24} />
                      <span className="text-[9px] font-mono text-[#C4A876]">CITIZEN PASS</span>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-[#F7F5F0]">独一 ONE 生态联合体</div>
                      <div className="text-[9px] text-[#A7ADB6] mt-0.5">one.world · hello@one.world</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* PHASE 4: FINAL OPTIMIZATION & 1.6s DYNAMIC LOGO */}
        {chapter === 'refinement' && (
          <section className="space-y-10">
            <div className="border-b border-white/10 pb-5">
              <div className="text-xs font-mono text-[#C4A876]">Phase 04 · 终选进化与动态标志系统</div>
              <h2 className="text-2xl font-semibold text-white mt-1">
                优胜方案「ONE ORIGIN · FINAL」工程精修与 1.6 秒四阶段动效
              </h2>
            </div>

            {/* Before vs Final Refinement */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-white/10 bg-[#14161A] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#A7ADB6]">初版草案 · ONE ORIGIN v1</span>
                  <span className="text-xs font-mono text-[#A7ADB6]">等宽 10 单位描边</span>
                </div>
                <div className="h-48 rounded-lg bg-[#0B0C0E] border border-white/10 flex items-center justify-center gap-8">
                  <BrandMark concept="origin" mode="dark" lockup="symbol" size={112} showGrid />
                  <BrandMark concept="origin" mode="dark" lockup="symbol" size={20} />
                </div>
                <p className="text-xs text-[#A7ADB6] leading-relaxed">
                  初版在 20px 以下微缩尺寸中，45° 门桥与中心垂直轴间隙视觉略偏细。
                </p>
              </div>

              <div className="rounded-xl border border-[#C4A876]/50 bg-[#14161A] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">终稿精修 · ONE ORIGIN FINAL</span>
                  <span className="text-xs font-mono text-[#C4A876]">光学 11.5/9 补偿 + Micro 变体</span>
                </div>
                <div className="h-48 rounded-lg bg-[#0B0C0E] border border-white/10 flex items-center justify-center gap-8">
                  <BrandMark concept="origin-final" mode="dark" lockup="symbol" size={112} showGrid />
                  <BrandMark concept="origin-final" mode="dark" lockup="symbol" size={20} micro />
                </div>
                <p className="text-xs text-[#F7F5F0]/85 leading-relaxed">
                  外环加粗至 11.5 单位抵消黑色背景视觉收缩；45° 翡翠门桥改用精确多边形径向切口；内置 Micro 16–24px 加厚版本，小图标同样锐利有力。
                </p>
              </div>
            </div>

            {/* 1.6s Dynamic Logo Player */}
            <div className="rounded-xl border border-white/10 bg-[#14161A] p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">网站与 App 启动动态标志（1.6 秒 · 4 阶段）</h3>
                  <p className="text-xs text-[#A7ADB6] mt-1">{currentStageLabel}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePlayMotion}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#F7F5F0] text-[#0B0C0E] text-xs font-semibold hover:bg-white cursor-pointer"
                  >
                    {isPlayingMotion ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isPlayingMotion ? '播放中' : '播放启动动效'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsPlayingMotion(false); setMotionProgress(1); }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/15 text-xs text-[#A7ADB6] hover:text-white cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>定格终态</span>
                  </button>
                </div>
              </div>

              {/* Dynamic SVG Canvas */}
              <div
                className="rounded-xl border border-white/10 h-64 flex flex-col items-center justify-center gap-4"
                style={{ backgroundColor: surfacePalette.bg }}
              >
                <svg width="128" height="128" viewBox="0 0 128 128">
                  {/* Stage 3: Open Ring drawing */}
                  <path
                    d="M 64 21.5 A 42.5 42.5 0 1 1 21.5 64"
                    fill="none"
                    stroke={surfacePalette.primary}
                    strokeWidth="11.5"
                    strokeLinecap="butt"
                    strokeDasharray="201"
                    strokeDashoffset={201 * (1 - stage3RingProgress)}
                  />
                  {/* Stage 2: 45 deg Jade threshold + stem */}
                  <g style={{ opacity: stage2AxisProgress, transformOrigin: '64px 64px', transform: `scale(${0.7 + 0.3 * stage2AxisProgress})` }}>
                    <polygon points="23.5,48.5 48.5,23.5 54,29 29,54" fill={surfacePalette.jade} />
                    <path d="M 51.5 53 L 64 41.5 L 64 50.5" fill="none" stroke={surfacePalette.primary} strokeWidth="9" strokeLinecap="butt" strokeLinejoin="miter" />
                    <rect x="59.5" y="79.5" width="9" height="15" fill={surfacePalette.primary} />
                  </g>
                  {/* Stage 1: Quiet Origin Seed */}
                  <circle
                    cx="64"
                    cy="64"
                    r={7.8 * stage1SeedScale}
                    fill={surfacePalette.gold}
                  />
                </svg>
                <div
                  className="text-sm font-medium tracking-[0.22em]"
                  style={{ opacity: stage4LockupOpacity, color: surfacePalette.primary }}
                >
                  独一 ONE
                </div>
              </div>

              {/* Scrubber */}
              <div className="space-y-2">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={motionProgress}
                  onChange={e => { setIsPlayingMotion(false); setMotionProgress(Number(e.target.value)); }}
                  className="w-full accent-[#C4A876] cursor-pointer"
                  aria-label="Dynamic logo timeline scrubber"
                />
                <div className="grid grid-cols-4 text-[11px] font-mono tabular-nums text-[#A7ADB6]">
                  <span>01 · 中心显现</span>
                  <span>02 · 结构展开</span>
                  <span>03 · ONE 成型</span>
                  <span className="text-right">04 · 稳定呈现</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* PHASE 5: BRAND GUIDELINES, SPECS & VECTOR/PNG DOWNLOADS */}
        {chapter === 'guidelines' && (
          <section className="space-y-10">
            <div className="border-b border-white/10 pb-5">
              <div className="text-xs font-mono text-[#C4A876]">Phase 05 · 品牌视觉识别规范手册</div>
              <h2 className="text-2xl font-semibold text-white mt-1">
                独一 ONE 标准化执行规范与可编辑源文件导出
              </h2>
            </div>

            {/* 1. Clear Space & Minimum Size */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-white/10 bg-[#14161A] p-6 space-y-4">
                <h3 className="text-base font-semibold text-white">安全距离与最小尺寸规范</h3>
                <div className="rounded-lg bg-[#0B0C0E] border border-white/10 p-6 flex items-center justify-center">
                  <div className="relative p-8 border border-dashed border-[#C4A876]/50">
                    <span className="absolute top-1.5 left-2 text-[10px] font-mono text-[#C4A876]">X = 核心直径 (16u)</span>
                    <span className="absolute bottom-1.5 right-2 text-[10px] font-mono text-[#A7ADB6]">安全留白 ≥ 1X</span>
                    <BrandMark concept="origin-final" mode="dark" lockup="symbol" size={96} showGrid />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs pt-2">
                  <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.08]">
                    <div className="text-[#A7ADB6]">数字屏幕最小尺寸</div>
                    <div className="font-mono tabular-nums text-white mt-1">16×16 px（启用 Micro 变体）</div>
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.08]">
                    <div className="text-[#A7ADB6]">实体印刷最小尺寸</div>
                    <div className="font-mono tabular-nums text-white mt-1">6×6 mm（完整组合 ≥ 18mm）</div>
                  </div>
                </div>
              </div>

              {/* 2. Color System (HEX / RGB / CMYK) */}
              <div className="rounded-xl border border-white/10 bg-[#14161A] p-6 space-y-4">
                <h3 className="text-base font-semibold text-white">标准色彩系统（80% 中性 / 15% 翡翠 / 5% 金）</h3>
                <div className="space-y-2.5">
                  {Object.values(BRAND_COLORS).map(color => (
                    <div
                      key={color.hex}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-white/[0.08] bg-white/[0.02]"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-md border border-white/20 shrink-0"
                          style={{ backgroundColor: color.hex }}
                        />
                        <div>
                          <div className="text-xs font-semibold text-white">
                            {color.name} · {color.enName}
                          </div>
                          <div className="text-[11px] text-[#A7ADB6]">{color.ratio}</div>
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums text-[11px] text-[#A7ADB6]">
                        <div className="text-white">{color.hex}</div>
                        <div>RGB({color.rgb}) · CMYK({color.cmyk})</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Typography & Lockup Standards */}
            <div className="rounded-xl border border-white/10 bg-[#14161A] p-6 space-y-5">
              <h3 className="text-base font-semibold text-white">中英文字体系统与组合规范</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
                <div className="space-y-2">
                  <div className="font-mono text-[#C4A876]">中文主标题字标「独一」</div>
                  <p className="text-[#A7ADB6] leading-relaxed">
                    采用现代克制无衬线体（Noto Sans SC / PingFang SC SemiBold 600），字距设定为 +0.12em，水平笔画稳定，突出东方礼序的静气与清晰度。
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="font-mono text-[#C4A876]">英文定制字标「ONE」</div>
                  <p className="text-[#A7ADB6] leading-relaxed">
                    专属矢量几何无衬线路径：O 为正圆光学内缩（内径比 0.69），N 采用 45° 锐利斜切角呼应门桥角度，E 中横略微上移并缩短 12% 以维持视觉呼吸。
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="font-mono text-[#C4A876]">中英文混排「独一 ONE」</div>
                  <p className="text-[#A7ADB6] leading-relaxed">
                    横版组合中英字高比锁定 1 : 0.88，图形右侧保留 0.5x 分割线留白；竖版组合居中对齐，适用于启动页、证书及礼盒包装。
                  </p>
                </div>
              </div>
            </div>

            {/* 4. Forbidden Uses */}
            <div className="rounded-xl border border-white/10 bg-[#14161A] p-6 space-y-4">
              <div className="flex items-center gap-2 text-base font-semibold text-white">
                <ShieldAlert className="w-4 h-4 text-[#C4A876]" />
                <span>品牌禁止使用规范（严禁破坏结构纯洁性）</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-[11px] text-[#A7ADB6]">
                {[
                  '禁止添加霓虹外发光与粒子特效',
                  '禁止使用蓝紫或彩虹多色渐变',
                  '禁止非等比例拉伸或倾斜变形',
                  '禁止在复杂高噪点背景无衬底直贴',
                  '禁止擅自修改原点位置或闭合缺口',
                  '禁止将完整中英文硬塞入 24px 图标'
                ].map(rule => (
                  <div key={rule} className="p-3 rounded-lg border border-white/10 bg-white/[0.02] leading-relaxed">
                    <div className="text-[#ef4444] font-mono mb-1">DO NOT</div>
                    <div>{rule}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 5. Export Center (Editable SVG & Transparent PNG) */}
            <div className="rounded-xl border border-[#C4A876]/40 bg-[#14161A] p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-white">可编辑 SVG 源文件与透明背景 PNG 导出中心</h3>
                  <p className="text-xs text-[#A7ADB6] mt-0.5">
                    支持按当前所选配色模式（{surfaceMode}）即时导出任意组合的矢量 SVG 与高分辨率透明 PNG，亦可直接下载项目内已生成的全套标准文件。
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(
                  [
                    ['origin-final', 'symbol', '终稿主标志 · 纯图形 (1024px)'],
                    ['origin-final', 'full-horizontal', '终稿主标志 · 横版「独一 ONE」'],
                    ['origin-final', 'full-vertical', '终稿主标志 · 竖版组合'],
                    ['origin-final', 'zh', '中文独立字标「独一」'],
                    ['origin-final', 'en', '英文独立字标「ONE」'],
                    ['infinity', 'symbol', '备选方案二 · ONE INFINITY 图形'],
                    ['horizon', 'symbol', '备选方案三 · ONE HORIZON 图形']
                  ] as [BrandConceptId, BrandLockupType, string][]
                ).map(([cid, lkp, title]) => (
                  <div
                    key={`${cid}-${lkp}`}
                    className="p-4 rounded-lg border border-white/10 bg-[#0B0C0E] flex flex-col justify-between gap-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-white">{title}</span>
                      <BrandMark concept={cid} mode="dark" lockup={lkp === 'full-horizontal' ? 'symbol' : lkp} size={28} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => triggerDownloadSvg(cid, surfaceMode, lkp, false)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.08] hover:bg-white/[0.15] text-xs text-white transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>下载 SVG</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerDownloadPng(cid, surfaceMode, lkp, true)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-[#F7F5F0] hover:bg-white text-xs font-medium text-[#0B0C0E] transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>透明 PNG</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-white/10 text-xs text-[#A7ADB6] flex flex-wrap items-center justify-between gap-2">
                <span>静态仓库资产目录：/brand-identity/svg/ 与 /brand-identity/png/（已随代码同步生成）</span>
                <a
                  href="/brand-identity/svg/duyi-one-origin-final-symbol-dark.svg"
                  download
                  className="text-[#C4A876] hover:underline"
                >
                  直接下载主 SVG 源文件
                </a>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
