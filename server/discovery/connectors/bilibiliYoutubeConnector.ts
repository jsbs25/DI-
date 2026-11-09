/**
 * EARTH ONE - Bilibili & YouTube Dual-End Video/Audio Connector
 * Fully preserves and integrates Bilibili and YouTube dual-end streams into the unified discovery engine.
 */
import { discoveryDb } from '../database/db.ts';
import { PlanetId, ResourceType } from '../types.ts';
import { searchBilibiliVideos } from '../../bilibiliCrawler.ts';
import { searchYouTubeVideos } from '../../youtubeSearch.ts';
import { searchYouTubeMusic } from '../../youtubeMusicSearch.ts';

/**
 * Harvest Bilibili video search results into Saturn / Venus ecosystem
 */
export async function harvestBilibiliVideos(query: string, limit = 8): Promise<number> {
  try {
    const results = await searchBilibiliVideos(query, limit);
    let saved = 0;
    for (const v of results) {
      if (!v.sourceUrl || !v.title) continue;
      discoveryDb.insertOrUpdateResource({
        url: v.sourceUrl,
        name: v.title,
        description: v.description || `${v.title} · 哔哩哔哩 (UP主: ${v.author || 'bilibili'})`,
        resourceType: 'video' as ResourceType,
        primaryPlanet: 'saturn' as PlanetId,
        category: 'bilibili_video',
        tags: ['Bilibili', 'B站', v.author || 'UP主', v.duration ? `时长:${v.duration}` : ''].filter(Boolean),
        language: 'zh',
        icon: v.pic,
        source: 'bilibili',
        copyrightStatus: 'official',
        accessType: 'open',
        qualityScore: 90,
        extraMeta: {
          bvid: v.bvid,
          author: v.author,
          play: String(v.play),
          duration: v.duration,
          embedUrl: v.embedUrl
        }
      });
      saved++;
    }
    return saved;
  } catch (err: any) {
    console.warn('[BilibiliConnector] Harvest error:', err.message);
    return 0;
  }
}

/**
 * Harvest YouTube videos into Saturn / Venus ecosystem
 */
export async function harvestYouTubeVideos(query: string, limit = 8): Promise<number> {
  try {
    const results = await searchYouTubeVideos(query, limit);
    let saved = 0;
    for (const v of results) {
      const videoUrl = v.sourceUrl || v.url;
      if (!videoUrl || !v.title) continue;
      discoveryDb.insertOrUpdateResource({
        url: videoUrl,
        name: v.title,
        description: v.snippet || `${v.title} · YouTube 视频`,
        resourceType: 'video' as ResourceType,
        primaryPlanet: 'saturn' as PlanetId,
        category: 'youtube_video',
        tags: ['YouTube', '视频', v.duration ? `时长:${v.duration}` : ''].filter(Boolean),
        language: 'en',
        icon: v.thumbnailUrl,
        source: 'youtube',
        copyrightStatus: 'official',
        accessType: 'open',
        qualityScore: 92,
        extraMeta: {
          duration: v.duration,
          source: v.source
        }
      });
      saved++;
    }
    return saved;
  } catch (err: any) {
    console.warn('[YouTubeConnector] Harvest error:', err.message);
    return 0;
  }
}

/**
 * Harvest YouTube Music tracks into Venus ecosystem
 */
export async function harvestYouTubeMusic(query: string, limit = 8): Promise<number> {
  try {
    const results = await searchYouTubeMusic(query, limit);
    let saved = 0;
    for (const m of results) {
      if (!m.sourceUrl || !m.title) continue;
      discoveryDb.insertOrUpdateResource({
        url: m.sourceUrl,
        name: m.title,
        description: `${m.title} · 艺术家: ${m.artist} · 金星音乐馆`,
        resourceType: 'music' as ResourceType,
        primaryPlanet: 'venus' as PlanetId,
        category: 'music_track',
        tags: ['金星音乐', m.artist, m.album || 'Single', '原声音频'].filter(Boolean),
        language: 'zh',
        icon: m.coverUrl,
        source: 'youtube_music',
        copyrightStatus: 'official',
        accessType: 'open',
        qualityScore: 94,
        extraMeta: {
          videoId: m.id,
          artist: m.artist,
          album: m.album,
          durationSeconds: m.durationSeconds,
          embedUrl: m.embedUrl
        }
      });
      saved++;
    }
    return saved;
  } catch (err: any) {
    console.warn('[YouTubeMusicConnector] Harvest error:', err.message);
    return 0;
  }
}
