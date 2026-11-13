import React, { useState } from 'react';
import { VideoItem, Language } from '../../types/index.ts';
import { translations } from '../../i18n/translations.ts';
import {
  Play,
  Film,
  Heart,
  Eye,
  Share2,
  Clock,
  X,
  Sparkles
} from 'lucide-react';

interface VideoCenterProps {
  videos: VideoItem[];
  lang: Language;
}

export const VideoCenter: React.FC<VideoCenterProps> = ({ videos, lang }) => {
  const t = translations[lang];
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});

  const toggleLike = (vidId: string) => {
    setLikedMap(prev => ({
      ...prev,
      [vidId]: !prev[vidId]
    }));
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-2 text-cyan-400 text-xs font-mono mb-1">
          <Film className="w-4 h-4" />
          <span>PLANETARY CINEMA & STORIES</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">
          {t.videoTab}
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Explore short films, cultural landscapes, and scientific chronicles from world creators.
        </p>
      </div>

      {/* Videos Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {videos.map(vid => {
          const isLiked = likedMap[vid.id] || vid.liked;
          return (
            <div
              key={vid.id}
              className="rounded-3xl bg-slate-900/70 border border-slate-800 overflow-hidden shadow-xl hover:border-slate-700 transition-all flex flex-col group cursor-pointer"
              onClick={() => setSelectedVideo(vid)}
            >
              {/* Thumbnail Container */}
              <div className="relative aspect-video overflow-hidden bg-slate-950">
                <img
                  src={vid.thumbnailUrl}
                  alt={vid.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-cyan-500/90 text-slate-950 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Play className="w-5 h-5 fill-slate-950 ml-0.5" />
                  </div>
                </div>
                <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/80 font-mono text-[11px] text-white backdrop-blur-sm">
                  {vid.duration}
                </span>
                <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-slate-900/90 border border-slate-700 text-[10px] text-cyan-300 font-mono">
                  {vid.countryName}
                </span>
              </div>

              {/* Video Info */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <h3 className="font-bold text-sm text-slate-100 group-hover:text-cyan-300 transition-colors line-clamp-1">
                    {vid.title}
                  </h3>
                  <p className="text-xs text-slate-400 line-clamp-2">
                    {vid.description}
                  </p>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center space-x-2">
                    <img
                      src={vid.creator.avatar}
                      alt={vid.creator.displayName}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                    <span className="text-slate-300 font-medium text-[11px]">{vid.creator.displayName}</span>
                  </div>

                  <div className="flex items-center space-x-3 text-[11px]">
                    <span className="flex items-center space-x-1">
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      <span>{vid.viewsCount.toLocaleString()}</span>
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        toggleLike(vid.id);
                      }}
                      className={`flex items-center space-x-1 transition-colors ${
                        isLiked ? 'text-rose-400' : 'hover:text-rose-300'
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-rose-400' : ''}`} />
                      <span>{vid.likesCount + (isLiked ? 1 : 0)}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Video Player Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl space-y-4">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                  {selectedVideo.category}
                </span>
                <span className="text-xs text-slate-400">· {selectedVideo.countryName}</span>
              </div>
              <button
                onClick={() => setSelectedVideo(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Player */}
            <div className="relative aspect-video bg-black">
              <video
                src={selectedVideo.videoUrl}
                controls
                autoPlay
                className="w-full h-full object-contain"
                poster={selectedVideo.thumbnailUrl}
              />
            </div>

            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-100">{selectedVideo.title}</h2>
                  <div className="flex items-center space-x-3 text-xs text-slate-400 mt-1">
                    <span>Creator: {selectedVideo.creator.displayName}</span>
                    <span>·</span>
                    <span>{selectedVideo.viewsCount.toLocaleString()} views</span>
                    <span>·</span>
                    <span>{new Date(selectedVideo.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => toggleLike(selectedVideo.id)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-rose-400 cursor-pointer"
                  >
                    <Heart className="w-4 h-4 fill-rose-400" />
                    <span>Like</span>
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                {selectedVideo.description}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
