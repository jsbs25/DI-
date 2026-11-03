import React, { useState } from 'react';
import { Community, Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import {
  Users2,
  Plus,
  Sparkles,
  Check,
  Globe2,
  ExternalLink
} from 'lucide-react';

interface CommunityListProps {
  communities: Community[];
  onToggleJoin: (commId: string) => void;
  lang: Language;
}

export const CommunityList: React.FC<CommunityListProps> = ({
  communities,
  onToggleJoin,
  lang
}) => {
  const t = translations[lang];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-2 text-cyan-400 text-xs font-mono mb-1">
          <Users2 className="w-4 h-4" />
          <span>GLOBAL COLLECTIVES</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">
          {t.communityTab}
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Join international guilds dedicated to polyglot learning, biophilic architecture, cosmology, and world arts.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {communities.map(comm => (
          <div
            key={comm.id}
            className="rounded-3xl bg-slate-900/70 border border-slate-800 overflow-hidden shadow-xl hover:border-slate-700 transition-all flex flex-col justify-between p-6 space-y-4"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-2xl shadow-inner">
                  {comm.icon}
                </div>
                <span className="text-[10px] uppercase font-mono px-2.5 py-1 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-800">
                  {comm.category}
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-100">{comm.name}</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {comm.description}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <div className="text-slate-400">
                <span className="font-mono font-bold text-slate-200">
                  {comm.membersCount.toLocaleString()}
                </span>{' '}
                citizens
              </div>

              <button
                onClick={() => onToggleJoin(comm.id)}
                className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                  comm.isJoined
                    ? 'bg-slate-800 text-slate-300 border border-slate-700'
                    : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md'
                }`}
              >
                {comm.isJoined ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t.joined}</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t.joinCommunity}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
