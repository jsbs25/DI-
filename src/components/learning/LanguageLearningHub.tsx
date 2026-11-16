import React, { useState } from 'react';
import { GraduationCap, Languages, BookOpen } from 'lucide-react';
import type { Language } from '../../types/index.ts';
import { ArabicLearningHub } from './ArabicLearningHub.tsx';
import { EnglishLearningPanel } from './EnglishLearningPanel.tsx';

interface Props {
  lang: Language;
  onOpenLibrary: () => void;
}

type Track = 'english' | 'arabic';

export const LanguageLearningHub: React.FC<Props> = ({ lang, onOpenLibrary }) => {
  const [track, setTrack] = useState<Track>('english');
  const isZh = lang === 'zh';
  const isAr = lang === 'ar';
  const tr = (zh: string, en: string, ar: string) => (isZh ? zh : isAr ? ar : en);

  return (
    <section
      dir={isAr ? 'rtl' : 'ltr'}
      className="w-full px-4 py-4 text-[color:var(--color-one-text)] sm:px-6 sm:py-6 lg:px-10"
      style={{ background: 'transparent' }}
    >
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
        <header className="one-surface-elevated relative overflow-hidden px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-4">
              <div
                className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border"
                style={{ borderColor: 'rgba(127,212,255,0.28)', background: 'rgba(127,212,255,0.1)', color: 'var(--color-one-accent)' }}
              >
                <Languages className="h-6 w-6" />
              </div>
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="one-badge one-badge-accent">ONE · LEARNING</span>
                  <span className="one-badge one-badge-neutral">EN · AR</span>
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--color-one-text)] sm:text-3xl">
                  {tr('语言学习中心', 'Language Learning', 'مركز تعلم اللغات')}
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[color:var(--color-one-text-muted)]">
                  {tr(
                    '英语与阿拉伯语学习：常用表达、发音跟读、间隔复习与经典文献资源。选择语言即可开始。',
                    'Learn English and Arabic with everyday phrases, pronunciation, spaced review, and classical resources. Choose a language to begin.',
                    'تعلم الإنجليزية والعربية من خلال العبارات اليومية والنطق والمراجعة المتباعدة والمصادر الكلاسيكية. اختر لغة للبدء.'
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTrack('english')}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all"
              style={
                track === 'english'
                  ? { background: 'rgba(127,212,255,0.14)', border: '1px solid rgba(127,212,255,0.28)', color: 'var(--color-one-accent)' }
                  : { border: '1px solid var(--color-one-border)', color: 'var(--color-one-text-muted)', background: 'rgba(244,243,238,0.02)' }
              }
            >
              <GraduationCap className="h-4 w-4" />
              <span>English · {tr('英语', 'English', 'الإنجليزية')}</span>
            </button>
            <button
              type="button"
              onClick={() => setTrack('arabic')}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all"
              style={
                track === 'arabic'
                  ? { background: 'rgba(215,182,118,0.14)', border: '1px solid rgba(215,182,118,0.28)', color: 'var(--color-one-gold)' }
                  : { border: '1px solid var(--color-one-border)', color: 'var(--color-one-text-muted)', background: 'rgba(244,243,238,0.02)' }
              }
            >
              <BookOpen className="h-4 w-4" />
              <span>العربية · {tr('阿拉伯语', 'Arabic', 'العربية')}</span>
            </button>
          </div>
        </header>

        {track === 'english' ? (
          <div className="one-surface-subtle p-4 sm:p-6">
            <EnglishLearningPanel lang={lang} />
          </div>
        ) : (
          <ArabicLearningHub lang={lang} onOpenLibrary={onOpenLibrary} embedded />
        )}
      </div>
    </section>
  );
};