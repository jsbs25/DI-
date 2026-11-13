import React, { useState } from 'react';
import { VideoItem, Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import { Eye, Film, Heart, Play, X } from 'lucide-react';

interface VideoCenterProps {
  videos: VideoItem[];
  lang: Language;
}

export const VideoCenter: React.FC<VideoCenterProps> = ({ videos, lang }) => {
  const t = translations[lang];
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});

  const toggleLike = (vidId: string) => {
    setLikedMap(prev => ({ ...prev, [vidId]: !prev[vidId] }));
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="border-b border-[var(--color-one-border)] pb-5">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--color-one-border-strong)] bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-[var(--color-one-text-muted)]">
          <Film className="h-3.5 w-3.5 text-[var(--color-one-accent)]" />
          <span>{lang === 'zh' ? 'ONE 影像 · 真实内容' : 'ONE VIDEO · Real Stories'}</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">{t.videoTab}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-one-text-muted)]">
          {lang === 'zh'
            ? '浏览来自全球创作者的真实短片、纪录与故事内容。'
            : 'Explore real short films, documentaries, and stories from creators around the world.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-5">
        {videos.map(vid => {
          const isLiked = likedMap[vid.id] || vid.liked;
          return (
            <div
              key={vid.id}
              className="group flex cursor-pointer flex-col overflow-hidden rounded-[28px] border border-[var(--color-one-border)] bg-white/[0.03] shadow-[var(--shadow-one-sm)] transition hover:border-[var(--color-one-border-strong)] hover:bg-white/[0.04]"
              onClick={() => setSelectedVideo(vid)}
            >
              <div className="relative aspect-video overflow-hidden bg-[rgba(10,14,22,0.8)]">
                <img src={vid.thumbnailUrl} alt={vid.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors group-hover:bg-black/15">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-[#071018] shadow-lg transition-transform group-hover:scale-105">
                    <Play className="ml-0.5 h-5 w-5 fill-current" />
                  </div>
                </div>
                <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/70 px-2 py-0.5 font-mono text-[11px] text-white backdrop-blur-sm">{vid.duration}</span>
                <span className="absolute left-2.5 top-2.5 rounded-md border border-white/15 bg-black/45 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">{vid.countryName}</span>
              </div>

              <div className="flex flex-1 flex-col justify-between space-y-3 p-4">
                <div className="space-y-1.5">
                  <h3 className="line-clamp-1 text-sm font-semibold text-white transition-colors group-hover:text-[var(--color-one-accent-soft)]">{vid.title}</h3>
                  <p className="line-clamp-2 text-xs leading-relaxed text-[var(--color-one-text-muted)]">{vid.description}</p>
                </div>

                <div className="flex items-center justify-between border-t border-[var(--color-one-border)] pt-2 text-[11px] text-[var(--color-one-text-muted)]">
                  <div className="flex min-w-0 items-center gap-2">
                    <img src={vid.creator.avatar} alt={vid.creator.displayName} className="h-5 w-5 rounded-full object-cover" />
                    <span className="truncate font-medium text-[var(--color-one-text)]">{vid.creator.displayName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5 text-[var(--color-one-text-dim)]" /><span className="tabular-nums">{vid.viewsCount.toLocaleString()}</span></span>
                    <button
                      onClick={e => { e.stopPropagation(); toggleLike(vid.id); }}
                      className={`inline-flex min-h-9 items-center gap-1 rounded-lg px-1.5 transition ${isLiked ? 'text-rose-300' : 'hover:text-rose-200'}`}
                    >
                      <Heart className={`h-3.5 w-3.5 ${isLiked ? 'fill-current' : ''}`} />
                      <span className="tabular-nums">{vid.likesCount + (isLiked ? 1 : 0)}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {videos.length === 0 && (
        <div className="rounded-[28px] border border-dashed border-[var(--color-one-border-strong)] bg-white/[0.02] py-16 text-center text-sm text-[var(--color-one-text-muted)]">
          {lang === 'zh' ? '暂无视频内容。' : 'No videos available yet.'}
        </div>
      )}

      {selectedVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-4xl space-y-4 overflow-hidden rounded-[28px] border border-[var(--color-one-border-strong)] bg-[color:var(--color-one-bg-elevated)] shadow-[var(--shadow-one-lg)]">
            <div className="flex items-center justify-between border-b border-[var(--color-one-border)] p-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="rounded-full border border-[var(--color-one-border)] bg-white/[0.03] px-2.5 py-0.5 text-[10px] font-medium text-[var(--color-one-text-muted)]">{selectedVideo.category}</span>
                <span className="truncate text-xs text-[var(--color-one-text-dim)]">· {selectedVideo.countryName}</span>
              </div>
              <button onClick={() => setSelectedVideo(null)} className="rounded-xl p-2 text-[var(--color-one-text-muted)] hover:bg-white/[0.05] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative aspect-video bg-black">
              <video src={selectedVideo.videoUrl} controls autoPlay className="h-full w-full object-contain" poster={selectedVideo.thumbnailUrl} />
            </div>

            <div className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-white">{selectedVideo.title}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-one-text-muted)]">
                    <span>{selectedVideo.creator.displayName}</span><span>·</span>
                    <span>{selectedVideo.viewsCount.toLocaleString()} {lang === 'zh' ? '次观看' : 'views'}</span><span>·</span>
                    <span>{new Date(selectedVideo.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <button onClick={() => toggleLike(selectedVideo.id)} className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-one-border)] bg-white/[0.03] px-3 py-2 text-xs font-medium text-rose-200 hover:bg-white/[0.06]">
                  <Heart className={`h-4 w-4 ${likedMap[selectedVideo.id] || selectedVideo.liked ? 'fill-current' : ''}`} />
                  <span>{lang === 'zh' ? '喜欢' : 'Like'}</span>
                </button>
              </div>
              <p className="text-sm leading-relaxed text-[var(--color-one-text-muted)]">{selectedVideo.description}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
