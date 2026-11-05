import React from 'react';
import { ArrowLeft, BookOpen, Moon } from 'lucide-react';
import { Language } from '../types/index.ts';
import { DigitalLibrary } from '../components/library/DigitalLibrary.tsx';

interface MoonAcademyProps {
  lang: Language;
  currentUser: { id: string } | null;
  onBack: () => void;
}

export const MoonAcademy: React.FC<MoonAcademyProps> = ({ lang, currentUser, onBack }) => (
  <div className="min-h-full bg-[#030712]">
    <header className="border-b border-white/[0.08] bg-[radial-gradient(ellipse_at_top_right,rgba(125,155,255,0.12),transparent_55%)] px-4 pb-8 pt-24 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
        >
          <ArrowLeft className="h-4 w-4" />
          {lang === 'zh' ? '返回太阳系' : 'Back to Solar System'}
        </button>
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-sky-200/20 bg-sky-200/[0.08] text-sky-100">
            <Moon className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.22em] text-sky-200/70">EARTH ONE · MOON</p>
            <h1 className="mt-1 text-3xl font-semibold text-white">{lang === 'zh' ? '全球学院' : 'Global Academy'}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              {lang === 'zh'
                ? '从现有数字图书馆与开放资料开始学习。书目、全文和版权状态以来源实际提供的信息为准；这里不会用虚构课程或伪造内容填充。'
                : 'Learn from the existing digital library and open resources. Titles, full text, and rights are shown according to their actual sources; no courses or content are fabricated.'}
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-sky-200/10 bg-sky-200/[0.04] px-3 py-1.5 text-xs text-sky-100/80">
              <BookOpen className="h-3.5 w-3.5" />
              {lang === 'zh' ? '连接 EARTH 数字图书馆与开放资料源' : 'Connected to the EARTH library and open sources'}
            </div>
          </div>
        </div>
      </div>
    </header>
    <DigitalLibrary lang={lang} currentUser={currentUser} />
  </div>
);
