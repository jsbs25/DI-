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
    .replace(/\[\[EMO:([a-z_-]+)\]\]\s*/gi, (_all, tag: string) => {
      const normalized = tag.toLowerCase().trim();
      if (VALID_EMOTIONS.has(normalized)) {
        detected = normalized as VoiceEmotion;
      }
      return '';
    })
    .trimStart();
  return { emotion: detected, text: cleaned };
}

const NATURAL_HUMAN_PROFILE: Omit<EmotionAnalysisResult, 'emotion' | 'intensity'> = {
  labelZh: '自然对话',
  labelEn: 'Natural',
  auraHex: 0x8ecfff,
  basePitch: 1.0,
  baseRate: 1.16,
  baiduSpd: 6,
  audioPlaybackRate: 1.16,
};

const EMOTION_PROFILES: Record<
  VoiceEmotion,
  Omit<EmotionAnalysisResult, 'emotion' | 'intensity'>
> = {
  cheerful: NATURAL_HUMAN_PROFILE,
  affectionate: NATURAL_HUMAN_PROFILE,
  empathetic: NATURAL_HUMAN_PROFILE,
  playful: NATURAL_HUMAN_PROFILE,
  excited: NATURAL_HUMAN_PROFILE,
  curious: NATURAL_HUMAN_PROFILE,
  calm: NATURAL_HUMAN_PROFILE,
};

/**
 * Unified Natural Human Voice Profile:
 * Uses one steady, pleasant, natural voice with crisp ~1.16x conversational pacing
 * and zero abrupt speed, pitch, or mood shifts.
 */
export function analyzeDialogueEmotion(
  _userText: string,
  _replyText: string,
  _explicitEmotion?: VoiceEmotion | null
): EmotionAnalysisResult {
  return {
    emotion: 'calm',
    intensity: 0.7,
    ...NATURAL_HUMAN_PROFILE,
  };
}

/**
 * Splits a reply into natural full-sentence segments for smooth, crisp,
 * human-sounding speech delivery with uniform natural pitch and pacing.
 */
export function buildExpressivePhrases(
  rawText: string,
  analysis: EmotionAnalysisResult,
  mode: 'audio' | 'speech' = 'audio'
): ProsodyPhrase[] {
  const clean = rawText
    .replace(/\[\[EMO:[a-z_-]+\]\]/gi, '')
    .replace(/\[\[ACTION:[\s\S]*?\]\]/g, '')
    .replace(/[*_#`>~～]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return [];

  const rawChunks =
    clean.match(/[^。！？!?;；\n]+[。！？!?;；\n]?/g) || [clean];

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

  return finalSegments.map((seg) => ({
    text: seg,
    emotion: analysis.emotion,
    pitch: analysis.basePitch,
    rate: analysis.baseRate,
    baiduSpd: analysis.baiduSpd,
    audioPlaybackRate: analysis.audioPlaybackRate,
    pauseAfterMs: 20,
  }));
}
