import React from 'react';
import { Community, Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import { Check, Plus, Users2 } from 'lucide-react';

interface CommunityListProps {
  communities: Community[];
  onToggleJoin: (commId: string) => void;
  lang: Language;
}

export const CommunityList: React.FC<CommunityListProps> = ({ communities, onToggleJoin, lang }) => {
  const t = translations[lang];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div className="border-b border-[var(--color-one-border)] pb-5">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--color-one-border)] bg-[var(--color-one-surface)] px-3 py-1 text-[11px] font-medium text-[var(--color-one-text-muted)]">
          <Users2 className="h-3.5 w-3.5 text-[var(--color-one-accent)]" />
          <span>{lang === 'zh' ? 'ONE 社区 · 真实共创空间' : 'ONE COMMUNITY · Real Collectives'}</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{t.communityTab}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-one-text-muted)]">
          {lang === 'zh'
            ? '加入围绕语言、文化、科学与创作的真实社区，与全球用户协作与交流。'
            : 'Join real communities around language, culture, science, and creation to collaborate with people worldwide.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        {communities.map(comm => (
          <div
            key={comm.id}
            className="flex flex-col justify-between space-y-4 rounded-[24px] border border-[var(--color-one-border)] bg-[var(--color-one-surface)] p-5 shadow-[var(--shadow-one-sm)] transition hover:border-[var(--color-one-border-strong)] sm:p-6"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)] text-2xl">
                  {comm.icon}
                </div>
                <span className="rounded-full border border-[var(--color-one-border)] bg-[var(--color-one-surface-soft)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--color-one-text-muted)]">
                  {comm.category}
                </span>
              </div>

              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">{comm.name}</h3>
                <p className="mt-1 text-xs leading-relaxed text-[var(--color-one-text-muted)] sm:text-sm">{comm.description}</p>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--color-one-border)] pt-3 text-xs">
              <div className="text-[var(--color-one-text-muted)]">
                <span className="font-medium tabular-nums text-slate-900 dark:text-white">{comm.membersCount.toLocaleString()}</span>{' '}
                {lang === 'zh' ? '成员' : 'members'}
              </div>

              <button
                onClick={() => onToggleJoin(comm.id)}
                className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                  comm.isJoined
                    ? 'border border-[var(--color-one-border-strong)] bg-[var(--color-one-surface-soft)] text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-white/[0.1]'
                    : 'bg-sky-600 text-white hover:bg-sky-500'
                }`}
              >
                {comm.isJoined ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
                    <span>{t.joined}</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    <span>{t.joinCommunity}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
      {communities.length === 0 && (
        <div className="rounded-[24px] border border-dashed border-[var(--color-one-border-strong)] bg-[var(--color-one-surface)] py-16 text-center text-sm text-[var(--color-one-text-muted)]">
          {lang === 'zh' ? '暂无社区数据。' : 'No communities available yet.'}
        </div>
      )}
    </div>
  );
};
