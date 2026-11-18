export type VoiceEmotion =
  | 'cheerful'
  | 'affectionate'
  | 'empathetic'
  | 'playful'
  | 'excited'
  | 'curious'
  | 'calm';

export interface EmotionAnalysisResult {
  emotion: VoiceEmotion;
  intensity: number; // 0.35 - 1.0
  labelZh: string;
  labelEn: string;
  auraHex: number;
  basePitch: number;
  baseRate: number;
  baiduSpd: number;
  audioPlaybackRate: number;
}

export interface ProsodyPhrase {
  text: string;
  emotion: VoiceEmotion;
  pitch: number;
  rate: number;
  baiduSpd: number;
  audioPlaybackRate: number;
  pauseAfterMs: number;
}

const VALID_EMOTIONS: ReadonlySet<string> = new Set([
  'cheerful',
  'affectionate',
  'empathetic',
  'playful',
  'excited',
  'curious',
  'calm',
]);

export function extractEmotionTag(raw: string): { emotion: VoiceEmotion | null; text: string } {
  let detected: VoiceEmotion | null = null;
  const cleaned = raw
    .replace(/\[\[(?:EMO|EMOTION):([a-z_-]+)\]\]\s*/gi, (_all, tag: string) => {
      const normalized = tag.toLowerCase().trim();
      if (VALID_EMOTIONS.has(normalized)) {
        detected = normalized as VoiceEmotion;
      }
      return '';
    })
    .replace(/\[\[ACTION:[\s\S]*?\]\]\s*/gi, '')
    .trimStart();
  return { emotion: detected, text: cleaned };
}

const EMOTION_PROFILES: Record<
  VoiceEmotion,
  Omit<EmotionAnalysisResult, 'emotion' | 'intensity'>
> = {
  excited: {
    labelZh: '兴奋雀跃',
    labelEn: 'Excited',
    auraHex: 0xfb923c,
    basePitch: 1.06,
    baseRate: 1.18,
    baiduSpd: 6,
    audioPlaybackRate: 1.15,
  },
  cheerful: {
    labelZh: '愉悦开心',
    labelEn: 'Cheerful',
    auraHex: 0xf5c451,
    basePitch: 1.04,
    baseRate: 1.14,
    baiduSpd: 6,
    audioPlaybackRate: 1.12,
  },
  curious: {
    labelZh: '好奇探索',
    labelEn: 'Curious',
    auraHex: 0x34d399,
    basePitch: 1.03,
    baseRate: 1.12,
    baiduSpd: 5,
    audioPlaybackRate: 1.1,
  },
  empathetic: {
    labelZh: '温柔共情',
    labelEn: 'Empathetic',
    auraHex: 0xf472b6,
    basePitch: 0.97,
    baseRate: 1.02,
    baiduSpd: 5,
    audioPlaybackRate: 1.04,
  },
  affectionate: {
    labelZh: '暖心陪伴',
    labelEn: 'Warm',
    auraHex: 0xfbbf24,
    basePitch: 0.99,
    baseRate: 1.06,
    baiduSpd: 5,
    audioPlaybackRate: 1.06,
  },
  playful: {
    labelZh: '俏皮轻快',
    labelEn: 'Playful',
    auraHex: 0x2dd4bf,
    basePitch: 1.07,
    baseRate: 1.16,
    baiduSpd: 6,
    audioPlaybackRate: 1.14,
  },
  calm: {
    labelZh: '平静聆听',
    labelEn: 'Calm',
    auraHex: 0x8ecfff,
    basePitch: 1.0,
    baseRate: 1.1,
    baiduSpd: 5,
    audioPlaybackRate: 1.1,
  },
};

/**
 * Genuine context-sensitive Emotional Engine:
 * Analyzes explicit emotion tags, user sentiment, and assistant reply warmth/energy
 * to drive orb aura colors, UI status, and vocal prosody subtly and naturally.
 */
export function analyzeDialogueEmotion(
  userText: string,
  replyText: string,
  explicitEmotion?: VoiceEmotion | null
): EmotionAnalysisResult {
  if (explicitEmotion && EMOTION_PROFILES[explicitEmotion]) {
    return {
      emotion: explicitEmotion,
      intensity: 0.85,
      ...EMOTION_PROFILES[explicitEmotion],
    };
  }

  const u = (userText || '').trim();
  const r = (replyText || '').trim();
  const combined = `${u} ${r}`;

  let emotion: VoiceEmotion = 'calm';
  let intensity = 0.68;

  if (/好累|累死了|疲惫|心累|难过|伤心|委屈|压力|焦虑|孤单|辛苦了|抱抱|sorry|tired|sad|stress|lonely|overwhelmed/i.test(combined)) {
    emotion = 'empathetic';
    intensity = 0.88;
  } else if (/哈哈|笑死|逗我|幽默|开玩笑|俏皮|haha|lol|joke|playful/i.test(combined)) {
    emotion = 'playful';
    intensity = 0.84;
  } else if (/太棒|太牛|厉害|兴奋|哇塞|惊喜|冲|amazing|awesome|excited|woohoo|!{2,}|！{2,}/i.test(combined)) {
    emotion = 'excited';
    intensity = 0.9;
  } else if (/喜欢你|爱你|贴心|温柔|陪着你|暖心|thank you|love you|appreciate/i.test(combined)) {
    emotion = 'affectionate';
    intensity = 0.85;
  } else if (/为什么|怎么|好奇|探索|原理|是什么|查一下|看看|curious|wonder|explore|how does|why/i.test(u)) {
    emotion = 'curious';
    intensity = 0.78;
  } else if (/开心|高兴|快乐|好呀|没问题|搞定|顺利|happy|glad|great|enjoy/i.test(combined)) {
    emotion = 'cheerful';
    intensity = 0.8;
  }

  return {
    emotion,
    intensity,
    ...EMOTION_PROFILES[emotion],
  };
}

/**
 * Splits a reply into natural full-sentence segments for smooth, crisp,
 * human-sounding speech delivery with emotion-matched prosody.
 */
export function buildExpressivePhrases(
  rawText: string,
  analysis: EmotionAnalysisResult,
  mode: 'audio' | 'speech' = 'audio'
): ProsodyPhrase[] {
  const clean = rawText
    .replace(/\[\[(?:EMO|EMOTION):[a-z_-]+\]\]/gi, '')
    .replace(/\[\[ACTION:[\s\S]*?\]\]/g, '')
    .replace(/[*_#`>~～]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return [];

  const rawChunks = clean.match(/[^。！？!?;；\n]+[。！？!?;；\n]?/g) || [clean];

  const merged: string[] = [];
  for (const piece of rawChunks) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    if (
      merged.length > 0 &&
      trimmed.length < 14 &&
      merged[merged.length - 1].length + trimmed.length <= 72
    ) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${trimmed}`.trim();
    } else {
      merged.push(trimmed);
    }
  }

  const maxChunkLen = mode === 'audio' ? 95 : 140;
  const finalSegments: string[] = [];
  let acc = '';
  for (const seg of merged) {
    if (!acc) {
      acc = seg;
    } else if (acc.length + seg.length <= maxChunkLen) {
      acc = `${acc} ${seg}`;
    } else {
      finalSegments.push(acc);
      acc = seg;
    }
  }
  if (acc) finalSegments.push(acc);

  const pauseMs =
    analysis.emotion === 'empathetic' || analysis.emotion === 'affectionate'
      ? 55
      : analysis.emotion === 'excited'
        ? 15
        : 25;

  return finalSegments.map((seg) => ({
    text: seg,
    emotion: analysis.emotion,
    pitch: analysis.basePitch,
    rate: analysis.baseRate,
    baiduSpd: analysis.baiduSpd,
    audioPlaybackRate: analysis.audioPlaybackRate,
    pauseAfterMs: pauseMs,
  }));
}
