import React from 'react';
import { ArrowLeft, PenTool, Sparkles, FileText, Heart } from 'lucide-react';
import { CreatorArticle, Language } from '../types/index.ts';
import { CreatorHub } from '../components/creator/CreatorHub.tsx';

type CreatorArticleDraft = Pick<CreatorArticle, 'title' | 'summary' | 'content' | 'coverUrl' | 'category'>;

interface VenusCreativeStudioProps {
  articles: CreatorArticle[];
  lang: Language;
  onCreateArticle: (article: CreatorArticleDraft) => void;
  onBack: () => void;
}

export const VenusCreativeStudio: React.FC<VenusCreativeStudioProps> = ({
  articles,
  lang,
  onCreateArticle,
  onBack
}) => {
  const isZh = lang === 'zh';
  const isAr = lang === 'ar';

  const copy = {
    zh: {
      back: '返回太阳系',
      eyebrow: 'ONE · STUDIO',
      title: 'ONE STUDIO',
      tagline: 'Imagine. Create. Express.',
      desc: '从想法到作品的安静创作空间。连接 EARTH 现有的创作者文章发布与阅读服务：撰写、发布、阅读与支持均基于真实能力。当前没有独立音乐库或授权播放源，不展示虚构内容或未接入的生成工具。',
      pillars: [
        { icon: Sparkles, label: '想法与草稿', hint: '在清晰的写作区组织标题、摘要与正文' },
        { icon: FileText, label: '作品发布与阅读', hint: '使用现有文章服务发布并浏览真实内容' },
        { icon: Heart, label: '表达与支持', hint: '读者可阅读并为真实作品提供支持' }
      ]
    },
    en: {
      back: 'Back to Solar System',
      eyebrow: 'ONE · STUDIO',
      title: 'ONE STUDIO',
      tagline: 'Imagine. Create. Express.',
      desc: 'A calm space from idea to work. Connected to EARTH’s existing creator publishing and reading service—writing, publishing, reading, and support reflect real capabilities. No standalone music catalog or licensed playback source is available, and no fabricated content or unconnected generation tools are shown.',
      pillars: [
        { icon: Sparkles, label: 'Ideas & drafts', hint: 'Shape title, summary, and body in a clear workspace' },
        { icon: FileText, label: 'Publish & read', hint: 'Use the existing article service for real works' },
        { icon: Heart, label: 'Express & support', hint: 'Readers can read and support real creations' }
      ]
    },
    ar: {
      back: 'العودة إلى النظام الشمسي',
      eyebrow: 'ONE · STUDIO',
      title: 'ONE STUDIO',
      tagline: 'Imagine. Create. Express.',
      desc: 'مساحة هادئة من الفكرة إلى العمل. متصلة بخدمة نشر وقراءة مقالات المبدعين الحالية في EARTH—الكتابة والنشر والقراءة والدعم تعكس قدرات حقيقية. لا تتوفر مكتبة موسيقى مستقلة أو مصدر تشغيل مرخّص، ولا تُعرض محتويات وهمية أو أدوات توليد غير متصلة.',
      pillars: [
        { icon: Sparkles, label: 'الأفكار والمسودات', hint: 'نظّم العنوان والملخص والنص في مساحة واضحة' },
        { icon: FileText, label: 'النشر والقراءة', hint: 'استخدم خدمة المقالات الحالية للأعمال الحقيقية' },
        { icon: Heart, label: 'التعبير والدعم', hint: 'يمكن للقراء قراءة الأعمال الحقيقية ودعمها' }
      ]
    }
  } as const;

  const t = copy[isAr ? 'ar' : isZh ? 'zh' : 'en'];

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="min-h-full text-[color:var(--color-one-text)]"
      style={{
        background:
          'radial-gradient(1000px 520px at 70% -10%, rgba(215,182,118,0.08), transparent 55%), linear-gradient(180deg, #04060a 0%, #05070b 50%, #030508 100%)'
      }}
    >
      <header className="relative overflow-hidden border-b px-4 pb-8 pt-24 sm:px-8 lg:px-12" style={{ borderColor: 'var(--color-one-border)' }}>
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-[8%] h-72 w-72 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(215,182,118,0.45), transparent 70%)' }}
        />
        <div className="relative mx-auto max-w-[1440px]">
          <button type="button" onClick={onBack} className="one-btn one-btn-sm one-btn-ghost mb-6 -ml-2">
            <ArrowLeft className="h-4 w-4" />
            {t.back}
          </button>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="one-badge one-badge-gold inline-flex items-center gap-1.5">
                  <PenTool className="h-3.5 w-3.5" />
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
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {t.pillars.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.label} className="one-surface flex items-start gap-3 p-4">
                  <span
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
                    style={{ borderColor: 'var(--color-one-border)', background: 'rgba(244,243,238,0.03)', color: 'var(--color-one-gold)' }}
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
        <CreatorHub articles={articles} onCreateArticle={onCreateArticle} lang={lang} />
      </section>
    </div>
  );
};
