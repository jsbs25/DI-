import React from 'react';
import { ArrowLeft, BookOpen, GraduationCap, Compass, Languages } from 'lucide-react';
import { Language } from '../types/index.ts';
import { DigitalLibrary } from '../components/library/DigitalLibrary.tsx';

interface MoonAcademyProps {
  lang: Language;
  currentUser: { id: string } | null;
  onBack: () => void;
}

export const MoonAcademy: React.FC<MoonAcademyProps> = ({ lang, currentUser, onBack }) => {
  const isZh = lang === 'zh';
  const isAr = lang === 'ar';

  const copy = {
    zh: {
      back: '返回太阳系',
      eyebrow: 'ONE · ACADEMY',
      title: 'ONE ACADEMY',
      tagline: 'Learn Without Limits.',
      desc: '在安静、专注的空间中探索知识与开放资料。课程与阅读内容以现有数字图书馆和真实来源为基础，不提供虚构课程、证书、排行或伪造进度。',
      pillars: [
        { icon: BookOpen, label: '开放图书与文献', hint: '连接 EARTH 数字图书馆与真实开放资料源' },
        { icon: Compass, label: '发现与阅读', hint: '按主题检索、浏览并深入理解内容' },
        { icon: Languages, label: '语言与研习', hint: '与阿拉伯语学习等真实学习空间协同' }
      ],
      focus: '学习焦点',
      focusHint: '从真实馆藏开始，按自己的节奏阅读、检索与理解。'
    },
    en: {
      back: 'Back to Solar System',
      eyebrow: 'ONE · ACADEMY',
      title: 'ONE ACADEMY',
      tagline: 'Learn Without Limits.',
      desc: 'Explore knowledge and open resources in a calm, focused space. Learning content is grounded in the existing digital library and real sources—no fabricated courses, certificates, rankings, or fake progress.',
      pillars: [
        { icon: BookOpen, label: 'Books & open sources', hint: 'Connected to the EARTH digital library and real open resources' },
        { icon: Compass, label: 'Discover & read', hint: 'Search, browse, and read with clarity' },
        { icon: Languages, label: 'Language & study', hint: 'Works alongside real learning spaces such as Arabic learning' }
      ],
      focus: 'Learning focus',
      focusHint: 'Start from real collections—search, read, and understand at your pace.'
    },
    ar: {
      back: 'العودة إلى النظام الشمسي',
      eyebrow: 'ONE · ACADEMY',
      title: 'ONE ACADEMY',
      tagline: 'Learn Without Limits.',
      desc: 'استكشف المعرفة والموارد المفتوحة في مساحة هادئة ومركّزة. يعتمد المحتوى على المكتبة الرقمية الحالية والمصادر الحقيقية—دون دورات أو شهادات أو تصنيفات أو تقدم وهمي.',
      pillars: [
        { icon: BookOpen, label: 'الكتب والمصادر المفتوحة', hint: 'متصل بالمكتبة الرقمية ومصادر مفتوحة حقيقية' },
        { icon: Compass, label: 'الاكتشاف والقراءة', hint: 'ابحث وتصفّح واقرأ بوضوح' },
        { icon: Languages, label: 'اللغة والدراسة', hint: 'يتكامل مع مساحات تعلّم حقيقية مثل تعلّم العربية' }
      ],
      focus: 'تركيز التعلّم',
      focusHint: 'ابدأ من مجموعات حقيقية—ابحث واقرأ وافهم بالوتيرة التي تناسبك.'
    }
  } as const;

  const t = copy[isAr ? 'ar' : isZh ? 'zh' : 'en'];

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="min-h-full text-[color:var(--color-one-text)]"
      style={{
        background:
          'radial-gradient(1000px 520px at 75% -10%, rgba(127,212,255,0.07), transparent 55%), linear-gradient(180deg, #04060a 0%, #05070b 50%, #030508 100%)'
      }}
    >
      <header className="relative overflow-hidden border-b px-4 pb-8 pt-24 sm:px-8 lg:px-12" style={{ borderColor: 'var(--color-one-border)' }}>
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-[10%] h-72 w-72 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(244,243,238,0.45), transparent 70%)' }}
        />
        <div className="relative mx-auto max-w-[1440px]">
          <button type="button" onClick={onBack} className="one-btn one-btn-sm one-btn-ghost mb-6 -ml-2">
            <ArrowLeft className="h-4 w-4" />
            {t.back}
          </button>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="one-badge one-badge-accent inline-flex items-center gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5" />
                  {t.eyebrow}
                </span>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--color-one-text)] sm:text-4xl lg:text-5xl">
                {t.title}
              </h1>
              <p className="mt-1 text-sm font-medium tracking-[0.18em] text-[color:var(--color-one-text-muted)] sm:text-base">
                {t.tagline}
              </p>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--color-one-text-muted)]">{t.desc}</p>
            </div>

            <div
              className="one-surface-subtle flex max-w-md shrink-0 items-start gap-3 p-4"
              style={{ borderColor: 'rgba(127,212,255,0.18)' }}
            >
              <span
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
                style={{ borderColor: 'rgba(127,212,255,0.25)', background: 'rgba(127,212,255,0.1)', color: 'var(--color-one-accent)' }}
              >
                <BookOpen className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--color-one-accent)' }}>
                  {t.focus}
                </p>
                <p className="mt-1 text-sm leading-6 text-[color:var(--color-one-text-muted)]">{t.focusHint}</p>
              </div>
            </div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {t.pillars.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.label} className="one-surface flex items-start gap-3 p-4">
                  <span
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
                    style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.03)', color: 'var(--color-one-text-muted)' }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[color:var(--color-one-text)]">{p.label}</p>
                    <p className="mt-0.5 text-xs leading-5 text-[color:var(--color-one-text-dim)]">{p.hint}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1440px] px-0">
        <DigitalLibrary lang={lang} currentUser={currentUser} />
      </section>
    </div>
  );
};
