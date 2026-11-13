import React from 'react';

export type BrandConceptId = 'origin' | 'infinity' | 'horizon' | 'origin-final';
export type BrandSurfaceMode = 'dark' | 'light' | 'mono-dark' | 'mono-light';
export type BrandLockupType = 'symbol' | 'zh' | 'en' | 'full-horizontal' | 'full-vertical';

export interface BrandPaletteTokens {
  bg: string;
  surface: string;
  primary: string;
  secondary: string;
  jade: string;
  gold: string;
  grid: string;
}

export const BRAND_COLORS = {
  obsidian: {
    name: '黑曜石黑',
    enName: 'Obsidian Black',
    hex: '#0B0C0E',
    rgb: '11, 12, 14',
    cmyk: '75, 68, 65, 90',
    ratio: '80% 主导中性基底'
  },
  ivory: {
    name: '纯净玉石白',
    enName: 'Pure Ivory',
    hex: '#F7F5F0',
    rgb: '247, 245, 240',
    cmyk: '3, 3, 6, 0',
    ratio: '80% 主导中性留白'
  },
  titanium: {
    name: '钛金属银',
    enName: 'Titanium Silver',
    hex: '#A7ADB6',
    rgb: '167, 173, 182',
    cmyk: '35, 26, 22, 2',
    ratio: '结构辅助中性灰'
  },
  jade: {
    name: '东方翡翠绿',
    enName: 'Jade Green',
    hex: '#247864',
    rgb: '36, 120, 100',
    cmyk: '82, 30, 62, 14',
    ratio: '15% 文明意象辅助色'
  },
  gold: {
    name: '微光香槟金',
    enName: 'Champagne Gold',
    hex: '#C4A876',
    rgb: '196, 168, 118',
    cmyk: '22, 30, 56, 4',
    ratio: '5% 起源核心点睛色'
  }
} as const;

export function getPaletteForMode(mode: BrandSurfaceMode): BrandPaletteTokens {
  switch (mode) {
    case 'light':
      return {
        bg: '#F7F5F0',
        surface: '#EFECE4',
        primary: '#0B0C0E',
        secondary: '#6B727E',
        jade: '#247864',
        gold: '#B3935B',
        grid: 'rgba(11,12,14,0.14)'
      };
    case 'mono-dark':
      return {
        bg: '#0B0C0E',
        surface: '#14161A',
        primary: '#FFFFFF',
        secondary: '#FFFFFF',
        jade: '#FFFFFF',
        gold: '#FFFFFF',
        grid: 'rgba(255,255,255,0.16)'
      };
    case 'mono-light':
      return {
        bg: '#FFFFFF',
        surface: '#F4F4F4',
        primary: '#0B0C0E',
        secondary: '#0B0C0E',
        jade: '#0B0C0E',
        gold: '#0B0C0E',
        grid: 'rgba(11,12,14,0.14)'
      };
    case 'dark':
    default:
      return {
        bg: '#0B0C0E',
        surface: '#14161A',
        primary: '#F7F5F0',
        secondary: '#A7ADB6',
        jade: '#2E8B74',
        gold: '#C4A876',
        grid: 'rgba(247,245,240,0.14)'
      };
  }
}

export interface BrandConceptMeta {
  id: BrandConceptId;
  code: string;
  name: string;
  zhName: string;
  keywords: string[];
  philosophy: string;
  geometryLogic: string;
  elements: { label: string; meaning: string }[];
  culturalSynthesis: string;
  colorLogic: string;
  typeLogic: string;
  strengths: string[];
  limitations: string[];
}

export const BRAND_CONCEPTS: BrandConceptMeta[] = [
  {
    id: 'origin',
    code: '01',
    name: 'ONE ORIGIN',
    zhName: '独一之源',
    keywords: ['起源', '唯一', '中心秩序', '天圆地方', '建筑感'],
    philosophy:
      '一切宏大的生态皆始于一个清醒的原点。ONE ORIGIN 以“中心种子 + 开放天圆”构筑独一的精神锚点，表达从单一原点向世界延伸而不被边界囚禁。',
    geometryLogic:
      '基于 128×128 模数网格：外环采用 270° 开放圆弧（直径 84 单位，保留左上角 90° 开放象限作为通往未来的通道）；左上象限嵌入一条与圆心呈 45° 呼应的斜向门楣；中心保留 8 单位留白气韵，承载圆心原点与上下分段构成隐含“1”的建筑轴线。',
    elements: [
      { label: '中心原点 (Origin Seed)', meaning: '代表“独一”与万物起源，克制而稳定的核心力量。' },
      { label: '270° 开放圆环 (Open O)', meaning: '象征“统一”与东方圆融，同时保留左上缺口表达开放边界与持续生长。' },
      { label: '45° 翡翠门桥 (Threshold)', meaning: '融合“天圆地方”角部秩序与伊斯兰几何斜向切面，形成进入核心的时空之门。' },
      { label: '隐含垂直中轴 (Hidden 1)', meaning: '上下留白分段垂直柱体搭配起势肩线，吸取书法顿挫，暗合数字“1”但不落俗套。' }
    ],
    culturalSynthesis:
      '以东方玉璧“缺而有余”的留白取代封闭圆盘，以建筑模数和 45° 斜切角抽象转化伊斯兰几何中的八角斜率比例，零宗教符号、零具象山水。',
    colorLogic:
      '外环与主轴采用玉石白/黑曜石黑确立高对比骨架，45° 门桥使用翡翠绿呼应东方温润生命力，原点采用香槟金点睛（占比严格控制在 5%）。',
    typeLogic:
      '搭配定制几何无衬线英文 ONE（圆润 O、锐角 N、等高三横 E）与现代克制中文无衬线「独一」，形成建筑般的横向与纵向秩序。',
    strengths: [
      '极简高辨识度轮廓，黑白单色下毫无信息损失',
      '同时自然蕴含 O、1 与 Origin 中心点三重意义',
      '极适合 App 图标、硬件压印、动态开屏展开'
    ],
    limitations: [
      '24px 以下极小尺寸时，中心轴线与原点的留白间隙需进行光学加粗补偿（已在阶段四中推出 Micro 优化版解决）'
    ]
  },
  {
    id: 'infinity',
    code: '02',
    name: 'ONE INFINITY',
    zhName: '独一之界',
    keywords: ['无限延伸', '交叠连接', '八角秩序', '开放循环'],
    philosophy:
      '表达“连接不同世界，最终走向无限”。打破常规平面莫比乌斯环与“∞”符号，构建向四面八方有序延展的开放立体回环。',
    geometryLogic:
      '源于两个同心旋转 45° 正方形的数学交错关系（8-fold symmetry），但完全打散封闭星形边界，重组成 4 组相互穿插、在交叉口保留负空间呼吸缝隙的开放折带（Open Chevrons），中心嵌入旋转菱形起源核。',
    elements: [
      { label: '四组开放折带', meaning: '既保持八向对称秩序，又在每条边保留出口，寓意多维服务与文化的无界连接。' },
      { label: '交错负空间切口', meaning: '不画任何投影与立体渐变，仅凭结构断开即形成前后穿插的东方虚实空间感。' },
      { label: '中心菱形源核', meaning: '旋转 45° 的方形锚点，使动态外扩的几何在视觉中心保持绝对稳定。' }
    ],
    culturalSynthesis:
      '深度提取伊斯兰几何艺术中旋转、对称与无限铺陈的数学法则，结合中国古典窗格回纹的线面节奏，彻底剥离宗教图腾感。',
    colorLogic:
      '主折带用黑曜石黑/玉石白构成稳定双轴，交错辅轴用翡翠绿形成节奏辨识，中心微核点以香槟金。',
    typeLogic:
      '适配字重更轻盈的中英文文字组合，凸显生态系统的互联互通与流动性。',
    strengths: [
      '拥有极强的“连接”与“多维生态”象征意义',
      '可天然延伸为辅助图形（Supergraphics）与页面纹理系统'
    ],
    limitations: [
      '多段折带在 16px 浏览器 Favicon 中视觉密度偏高，微缩场景辨识力略逊于 ONE ORIGIN'
    ]
  },
  {
    id: 'horizon',
    code: '03',
    name: 'ONE HORIZON',
    zhName: '独一之境',
    keywords: ['山水虚实', '数字穹门', '空间探索', '未来视界'],
    philosophy:
      '将平台视为人类探索知识、文化与未知未来的精神视界。利用“负空间即结构”的建筑语言，构筑跨越地表与数字文明的地平线。',
    geometryLogic:
      '外轮廓采用超椭圆/建筑石碑方形（Squircle Monolith），内部通过三重不同曲率与台阶高度的水平切面劈开负空间光廊，右上象限留白处悬停一颗象征极点与启明星的微圆。',
    elements: [
      { label: '上穹顶与天光切口', meaning: '借鉴伊斯兰穹拱比例，与东方书画留白形成“天窗”意境。' },
      { label: '翡翠斜向地平线', meaning: '抽象自东方青绿山水的远近层叠关系，构成视觉斜向推进动势。' },
      { label: '下方拱门基座', meaning: '象征稳固的技术底座与面向全球开放的数字入口。' }
    ],
    culturalSynthesis:
      '不画一丝山水线条却有千里纵深；既像现代美术馆建筑立面，又如数字世界的窗口，体现高级东方克制美学。',
    colorLogic:
      '利用大面积黑白实体对比衬托中段翡翠地平线与右上微金点，呈现类似玉器切片的温润层次。',
    typeLogic:
      '搭配大字距人文无衬线字体，整体极具国际高端机构与出版级数字平台气质。',
    strengths: [
      '强烈的现代建筑与美术馆级艺术张力，与常规互联网平台彻底拉开差距',
      '海报、启动页与实体礼盒压纹效果极佳'
    ],
    limitations: [
      '实心块面占比大，若与文字左对齐组合时需额外注意文字与块面的光学权重平衡'
    ]
  },
  {
    id: 'origin-final',
    code: '04',
    name: 'ONE ORIGIN · FINAL',
    zhName: '独一之源 · 终稿精修版',
    keywords: ['终选进化', '光学补偿', '径向45°切角', '全尺寸兼容'],
    philosophy:
      '基于第一至三阶段对比评审，选择潜力最高的 ONE ORIGIN 进行工程级光学精修，作为「独一 ONE」正式全球品牌主标志。',
    geometryLogic:
      '1) 将外环粗细由 10 单位微调至 11.5 单位，内轴线保持 9 单位，抵消视觉错觉；2) 所有终端切口严格对齐中心点 (64,64) 的径向向量与 45° 黄金角；3) 专门建立 Micro-16px 自适应精简版几何规范。',
    elements: [
      { label: '光学加粗主环', meaning: '使图形在深色与浅色界面中拥有完全一致的视觉重量。' },
      { label: '径向精准切面', meaning: '任何放大至户外巨幅广告牌的边界均满足严苛几何对齐。' },
      { label: '微缩自适应变体', meaning: '16–24px 小图标自动加宽缝隙、简化斜肩比例，保证桌面 Dock 与浏览器标签绝对清晰。' }
    ],
    culturalSynthesis:
      '达成“不解释也能被记住，懂东方与几何美学的人能会心共鸣”的终极国际品牌基准。',
    colorLogic:
      '完全遵守 80% 黑白灰 / 15% 翡翠绿 / 5% 香槟金比例，并在单色及纯反白状态下保持 100% 识别度。',
    typeLogic:
      '定制矢量 ONE 字标与「独一」严格遵守 1x 核心半径安全距规范。',
    strengths: [
      '从 16px Favicon 到 10 米建筑幕墙均保持最高品质',
      '独立轮廓无可替代，具备极高长期品牌复利价值'
    ],
    limitations: [
      '投入商业注册前需配合专业商标代理机构针对第 9、35、38、41、42 类进行全球检索核验'
    ]
  }
];

function renderSymbolPrimitives(
  concept: BrandConceptId,
  palette: BrandPaletteTokens,
  micro = false
): React.ReactNode {
  if (concept === 'origin') {
    return (
      <g>
        {/* 270 deg open architectural ring: open upper-left quadrant (180 -> 270 deg) */}
        <path
          d="M 64 22 A 42 42 0 1 1 22 64"
          fill="none"
          stroke={palette.primary}
          strokeWidth={10}
          strokeLinecap="butt"
        />
        {/* 45 deg diagonal jade threshold across the open portal */}
        <line
          x1="28"
          y1="48"
          x2="48"
          y2="28"
          stroke={palette.jade}
          strokeWidth={9}
          strokeLinecap="butt"
        />
        {/* Concealed architectural "1" upper calligraphic shoulder + upper stem */}
        <path
          d="M 50 47 L 64 35 L 64 49"
          fill="none"
          stroke={palette.primary}
          strokeWidth={8.5}
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />
        {/* Lower vertical axis anchor */}
        <line
          x1="64"
          y1="79"
          x2="64"
          y2="93"
          stroke={palette.primary}
          strokeWidth={8.5}
          strokeLinecap="butt"
        />
        {/* Center Origin Seed */}
        <circle cx="64" cy="64" r="7.5" fill={palette.gold} />
      </g>
    );
  }

  if (concept === 'origin-final') {
    const ringW = micro ? 13.5 : 11.5;
    const stemW = micro ? 10.5 : 9;
    return (
      <g>
        {/* Optically balanced 270 deg open circular monolith */}
        <path
          d="M 64 21.5 A 42.5 42.5 0 1 1 21.5 64"
          fill="none"
          stroke={palette.primary}
          strokeWidth={ringW}
          strokeLinecap="butt"
        />
        {/* 45-degree radial Jade threshold bridge */}
        <polygon
          points={
            micro
              ? '22.5,48.5 48.5,22.5 54.5,28.5 28.5,54.5'
              : '23.5,48.5 48.5,23.5 54,29 29,54'
          }
          fill={palette.jade}
        />
        {/* Refined upper architectural shoulder of "1" with crisp breathing space from outer ring */}
        <path
          d={micro ? 'M 51 53 L 64 42 L 64 50.5' : 'M 51.5 53 L 64 41.5 L 64 50.5'}
          fill="none"
          stroke={palette.primary}
          strokeWidth={stemW}
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />
        {/* Lower axis pillar */}
        <rect
          x={64 - stemW / 2}
          y={micro ? 80 : 79.5}
          width={stemW}
          height={micro ? 14 : 15}
          fill={palette.primary}
        />
        {/* Exact Origin Seed */}
        <circle cx="64" cy="64" r={micro ? 8.5 : 7.8} fill={palette.gold} />
      </g>
    );
  }

  if (concept === 'infinity') {
    // 4 interlocking open architectural chevrons derived from 8-fold octagonal symmetry
    return (
      <g>
        {/* Primary vertical-horizontal outer open brackets (2 opposite chevrons) */}
        <path
          d="M 38 24 L 64 14 L 90 24 L 104 38"
          fill="none"
          stroke={palette.primary}
          strokeWidth={8.5}
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />
        <path
          d="M 90 104 L 64 114 L 38 104 L 24 90"
          fill="none"
          stroke={palette.primary}
          strokeWidth={8.5}
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />
        {/* Secondary rotated 45 deg Jade open arms with deliberate intersection breathing gaps */}
        <path
          d="M 104 52 L 114 64 L 104 90 L 90 98"
          fill="none"
          stroke={palette.jade}
          strokeWidth={8.5}
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />
        <path
          d="M 24 76 L 14 64 L 24 38 L 38 30"
          fill="none"
          stroke={palette.jade}
          strokeWidth={8.5}
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />
        {/* Inner square-rotated negative space ring segments */}
        <path
          d="M 46 46 L 64 38 L 82 46"
          fill="none"
          stroke={palette.primary}
          strokeWidth={6.5}
          strokeLinecap="butt"
        />
        <path
          d="M 82 82 L 64 90 L 46 82"
          fill="none"
          stroke={palette.primary}
          strokeWidth={6.5}
          strokeLinecap="butt"
        />
        {/* Rotated 45 deg diamond origin core */}
        <polygon points="64,54 74,64 64,74 54,64" fill={palette.gold} />
      </g>
    );
  }

  // Concept 3: ONE HORIZON (asymmetric landscape negative-space & arch monolith)
  return (
    <g>
      {/* Upper Celestial Arch Mass */}
      <path
        d="M 22 50 L 22 36 A 14 14 0 0 1 36 22 L 92 22 A 14 14 0 0 1 106 36 L 106 44 C 84 44 68 56 22 62 Z"
        fill={palette.primary}
      />
      {/* Suspended Zenith Seed in Negative-Space Sky Aperture */}
      <circle cx="84" cy="40" r="6.5" fill={palette.gold} />
      {/* Mid Horizon Sweeping Plane (Jade landscape strata) */}
      <path
        d="M 22 72 C 62 66 84 53 106 53 L 106 69 C 80 69 56 82 22 86 Z"
        fill={palette.jade}
      />
      {/* Foundational Plinth with Centered Architectural Portal Notch */}
      <path
        d="M 22 94 C 54 90 78 78 106 78 L 106 92 A 14 14 0 0 1 92 106 L 73 106 L 73 94 A 9 9 0 0 0 55 94 L 55 106 L 36 106 A 14 14 0 0 1 22 92 Z"
        fill={palette.primary}
      />
    </g>
  );
}

/**
 * Custom Geometric Vector Wordmark "独一"
 * Architectural sans-serif strokes on an 88x44 grid matching the weight and 45-deg chamfers of "ONE".
 */
function renderDuyiWordmarkPaths(color: string, xOffset = 0, yOffset = 0, scale = 1): React.ReactNode {
  return (
    <g transform={`translate(${xOffset}, ${yOffset}) scale(${scale})`}>
      {/* Character 独 (0..44, 0..44) */}
      <g fill="none" stroke={color} strokeWidth="4.4" strokeLinecap="square" strokeLinejoin="miter">
        {/* Left radical 犭 */}
        <path d="M 14.5 3.5 L 3.5 15.5" />
        <path d="M 5.5 6.5 Q 13.5 18 11 40.5 L 6.5 38" />
        <path d="M 11.5 18.5 L 3 28.5" />
        {/* Right radical 虫 */}
        <rect x="20" y="13.5" width="21" height="14.5" />
        <line x1="30.5" y1="2.5" x2="30.5" y2="35.2" />
        <path d="M 17.5 39.5 L 39 35.5" />
        <path d="M 37.5 31.5 L 43 40.5" />
      </g>
      {/* Character 一 (51..90) with subtle eastern chamfered terminal */}
      <path d="M 51 19.5 L 90 19.5 L 87.5 25 L 51 25 Z" fill={color} />
    </g>
  );
}

/**
 * Custom Geometric Vector Wordmark "ONE"
 * Pure geometric paths — zero dependency on installed system fonts.
 */
function renderOneWordmarkPaths(color: string, xOffset = 0, yOffset = 0, scale = 1): React.ReactNode {
  return (
    <g transform={`translate(${xOffset}, ${yOffset}) scale(${scale})`} fill={color}>
      {/* Geometric O (outer diameter 44, optical stroke 6.5) */}
      <path
        fillRule="evenodd"
        d="M 22 0 A 22 22 0 1 0 22 44 A 22 22 0 1 0 22 0 Z M 22 6.8 A 15.2 15.2 0 1 1 22 37.2 A 15.2 15.2 0 1 1 22 6.8 Z"
      />
      {/* Architectural N (width 32, clean mitered diagonal) */}
      <path d="M 56 44 L 56 0 L 63.2 0 L 82.8 31.2 L 82.8 0 L 89.6 0 L 89.6 44 L 82.4 44 L 62.8 12.8 L 62.8 44 Z" />
      {/* Balanced E (with subtle optical bar length hierarchy) */}
      <path d="M 104 44 L 104 0 L 134 0 L 134 6.6 L 111 6.6 L 111 18.4 L 130.5 18.4 L 130.5 24.8 L 111 24.8 L 111 37.4 L 134.5 37.4 L 134.5 44 Z" />
    </g>
  );
}

export interface BrandMarkProps {
  concept: BrandConceptId;
  mode?: BrandSurfaceMode;
  lockup?: BrandLockupType;
  size?: number;
  micro?: boolean;
  showGrid?: boolean;
  className?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({
  concept,
  mode = 'dark',
  lockup = 'symbol',
  size = 128,
  micro = false,
  showGrid = false,
  className = ''
}) => {
  const palette = getPaletteForMode(mode);

  if (lockup === 'symbol') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 128 128"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        role="img"
        aria-label={`独一 ONE — ${concept} brand symbol`}
      >
        {showGrid && (
          <g stroke={palette.grid} strokeWidth="0.7" fill="none">
            <rect x="16" y="16" width="96" height="96" strokeDasharray="3 3" />
            <circle cx="64" cy="64" r="42.5" strokeDasharray="2 2" />
            <circle cx="64" cy="64" r="24" strokeDasharray="2 2" />
            <line x1="64" y1="6" x2="64" y2="122" />
            <line x1="6" y1="64" x2="122" y2="64" />
            <line x1="12" y1="12" x2="116" y2="116" strokeDasharray="3 3" />
            <line x1="116" y1="12" x2="12" y2="116" strokeDasharray="3 3" />
          </g>
        )}
        {renderSymbolPrimitives(concept, palette, micro)}
      </svg>
    );
  }

  if (lockup === 'en') {
    return (
      <svg
        width={Math.round(size * 2.6)}
        height={size}
        viewBox="0 0 260 100"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        role="img"
        aria-label="ONE wordmark"
      >
        {renderOneWordmarkPaths(palette.primary, 40, 22, 1.28)}
      </svg>
    );
  }

  if (lockup === 'zh') {
    return (
      <svg
        width={Math.round(size * 2.2)}
        height={size}
        viewBox="0 0 220 100"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        role="img"
        aria-label="独一 中文品牌字标"
      >
        {renderDuyiWordmarkPaths(palette.primary, 44, 20, 1.38)}
      </svg>
    );
  }

  if (lockup === 'full-vertical') {
    return (
      <svg
        width={Math.round(size * 1.35)}
        height={Math.round(size * 1.5)}
        viewBox="0 0 240 268"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        role="img"
        aria-label={`独一 ONE — ${concept} vertical lockup`}
      >
        <g transform="translate(56, 16)">
          {renderSymbolPrimitives(concept, palette, false)}
        </g>
        {renderDuyiWordmarkPaths(palette.primary, 75, 162, 0.96)}
        {renderOneWordmarkPaths(palette.secondary, 69, 218, 0.76)}
      </svg>
    );
  }

  // full-horizontal
  return (
    <svg
      width={Math.round(size * 3.4)}
      height={size}
      viewBox="0 0 440 128"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={`独一 ONE — ${concept} horizontal lockup`}
    >
      <g transform="translate(8, 0)">
        {renderSymbolPrimitives(concept, palette, false)}
      </g>
      <line x1="158" y1="36" x2="158" y2="92" stroke={palette.secondary} strokeOpacity="0.28" strokeWidth="1.5" />
      {renderDuyiWordmarkPaths(palette.primary, 178, 40, 1.05)}
      {renderOneWordmarkPaths(palette.secondary, 294, 42, 0.92)}
    </svg>
  );
};

/**
 * Generates clean standalone editable SVG markup for export and download.
 */
export function buildBrandSvgMarkup(
  concept: BrandConceptId,
  mode: BrandSurfaceMode,
  lockup: BrandLockupType = 'symbol',
  options?: { includeBackground?: boolean; roundedAppIcon?: boolean }
): string {
  const palette = getPaletteForMode(mode);
  const bgRect = options?.includeBackground
    ? `<rect width="100%" height="100%" ${options.roundedAppIcon ? 'rx="28"' : ''} fill="${palette.bg}" />`
    : '';

  const pColor = palette.primary;
  const sColor = palette.secondary;
  const jColor = palette.jade;
  const gColor = palette.gold;

  let innerSymbol = '';
  if (concept === 'origin') {
    innerSymbol = `
    <path d="M 64 22 A 42 42 0 1 1 22 64" fill="none" stroke="${pColor}" stroke-width="10" stroke-linecap="butt" />
    <line x1="28" y1="48" x2="48" y2="28" stroke="${jColor}" stroke-width="9" stroke-linecap="butt" />
    <path d="M 50 47 L 64 35 L 64 49" fill="none" stroke="${pColor}" stroke-width="8.5" stroke-linecap="butt" stroke-linejoin="miter" />
    <line x1="64" y1="79" x2="64" y2="93" stroke="${pColor}" stroke-width="8.5" stroke-linecap="butt" />
    <circle cx="64" cy="64" r="7.5" fill="${gColor}" />`;
  } else if (concept === 'origin-final') {
    innerSymbol = `
    <path d="M 64 21.5 A 42.5 42.5 0 1 1 21.5 64" fill="none" stroke="${pColor}" stroke-width="11.5" stroke-linecap="butt" />
    <polygon points="23.5,48.5 48.5,23.5 54,29 29,54" fill="${jColor}" />
    <path d="M 51.5 53 L 64 41.5 L 64 50.5" fill="none" stroke="${pColor}" stroke-width="9" stroke-linecap="butt" stroke-linejoin="miter" />
    <rect x="59.5" y="79.5" width="9" height="15" fill="${pColor}" />
    <circle cx="64" cy="64" r="7.8" fill="${gColor}" />`;
  } else if (concept === 'infinity') {
    innerSymbol = `
    <path d="M 38 24 L 64 14 L 90 24 L 104 38" fill="none" stroke="${pColor}" stroke-width="8.5" stroke-linecap="butt" stroke-linejoin="miter" />
    <path d="M 90 104 L 64 114 L 38 104 L 24 90" fill="none" stroke="${pColor}" stroke-width="8.5" stroke-linecap="butt" stroke-linejoin="miter" />
    <path d="M 104 52 L 114 64 L 104 90 L 90 98" fill="none" stroke="${jColor}" stroke-width="8.5" stroke-linecap="butt" stroke-linejoin="miter" />
    <path d="M 24 76 L 14 64 L 24 38 L 38 30" fill="none" stroke="${jColor}" stroke-width="8.5" stroke-linecap="butt" stroke-linejoin="miter" />
    <path d="M 46 46 L 64 38 L 82 46" fill="none" stroke="${pColor}" stroke-width="6.5" stroke-linecap="butt" />
    <path d="M 82 82 L 64 90 L 46 82" fill="none" stroke="${pColor}" stroke-width="6.5" stroke-linecap="butt" />
    <polygon points="64,54 74,64 64,74 54,64" fill="${gColor}" />`;
  } else {
    innerSymbol = `
    <path d="M 22 50 L 22 36 A 14 14 0 0 1 36 22 L 92 22 A 14 14 0 0 1 106 36 L 106 44 C 84 44 68 56 22 62 Z" fill="${pColor}" />
    <circle cx="84" cy="40" r="6.5" fill="${gColor}" />
    <path d="M 22 72 C 62 66 84 53 106 53 L 106 69 C 80 69 56 82 22 86 Z" fill="${jColor}" />
    <path d="M 22 94 C 54 90 78 78 106 78 L 106 92 A 14 14 0 0 1 92 106 L 73 106 L 73 94 A 9 9 0 0 0 55 94 L 55 106 L 36 106 A 14 14 0 0 1 22 92 Z" fill="${pColor}" />`;
  }

  const duyiPaths = (fill: string, tx: number, ty: number, sc: number) => `
  <g transform="translate(${tx}, ${ty}) scale(${sc})">
    <g fill="none" stroke="${fill}" stroke-width="4.4" stroke-linecap="square" stroke-linejoin="miter">
      <path d="M 14.5 3.5 L 3.5 15.5" />
      <path d="M 5.5 6.5 Q 13.5 18 11 40.5 L 6.5 38" />
      <path d="M 11.5 18.5 L 3 28.5" />
      <rect x="20" y="13.5" width="21" height="14.5" />
      <line x1="30.5" y1="2.5" x2="30.5" y2="35.2" />
      <path d="M 17.5 39.5 L 39 35.5" />
      <path d="M 37.5 31.5 L 43 40.5" />
    </g>
    <path d="M 51 19.5 L 90 19.5 L 87.5 25 L 51 25 Z" fill="${fill}" />
  </g>`;

  const onePaths = (fill: string, tx: number, ty: number, sc: number) => `
  <g transform="translate(${tx}, ${ty}) scale(${sc})" fill="${fill}">
    <path fill-rule="evenodd" d="M 22 0 A 22 22 0 1 0 22 44 A 22 22 0 1 0 22 0 Z M 22 6.8 A 15.2 15.2 0 1 1 22 37.2 A 15.2 15.2 0 1 1 22 6.8 Z" />
    <path d="M 56 44 L 56 0 L 63.2 0 L 82.8 31.2 L 82.8 0 L 89.6 0 L 89.6 44 L 82.4 44 L 62.8 12.8 L 62.8 44 Z" />
    <path d="M 104 44 L 104 0 L 134 0 L 134 6.6 L 111 6.6 L 111 18.4 L 130.5 18.4 L 130.5 24.8 L 111 24.8 L 111 37.4 L 134.5 37.4 L 134.5 44 Z" />
  </g>`;

  if (lockup === 'symbol') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="512" height="512">
  ${bgRect}
  <g>${innerSymbol}
  </g>
</svg>`;
  }

  if (lockup === 'en') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 100" width="520" height="200">
  ${bgRect}
  ${onePaths(pColor, 40, 22, 1.28)}
</svg>`;
  }

  if (lockup === 'zh') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 100" width="440" height="200">
  ${bgRect}
  ${duyiPaths(pColor, 44, 20, 1.38)}
</svg>`;
  }

  if (lockup === 'full-vertical') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 268" width="480" height="536">
  ${bgRect}
  <g transform="translate(56, 16)">${innerSymbol}
  </g>
  ${duyiPaths(pColor, 75, 162, 0.96)}
  ${onePaths(sColor, 69, 218, 0.76)}
</svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 128" width="880" height="256">
  ${bgRect}
  <g transform="translate(8, 0)">${innerSymbol}
  </g>
  <line x1="158" y1="36" x2="158" y2="92" stroke="${sColor}" stroke-opacity="0.28" stroke-width="1.5" />
  ${duyiPaths(pColor, 178, 40, 1.05)}
  ${onePaths(sColor, 294, 42, 0.92)}
</svg>`;
}
