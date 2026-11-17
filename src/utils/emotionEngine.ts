export type CompanionEmotion =
  | 'calm'
  | 'happy'
  | 'excited'
  | 'curious'
  | 'concerned'
  | 'empathetic'
  | 'playful'
  | 'focused'
  | 'thinking';

export type VoiceEmotion = CompanionEmotion;

export interface EmotionAnalysisResult {
  emotion: CompanionEmotion;
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
  emotion: CompanionEmotion;
  pitch: number;
  rate: number;
  baiduSpd: number;
  audioPlaybackRate: number;
  pauseAfterMs: number;
}

const VALID_EMOTIONS: ReadonlySet<string> = new Set([
  'calm',
  'happy',
  'excited',
  'curious',
  'concerned',
  'empathetic',
  'playful',
  'focused',
  'thinking',
]);

const EMOTION_ALIASES: Record<string, CompanionEmotion> = {
  cheerful: 'happy',
  affectionate: 'empathetic',
  empathetic: 'empathetic',
  playful: 'playful',
  excited: 'excited',
  curious: 'curious',
  calm: 'calm',
  happy: 'happy',
  concerned: 'concerned',
  focused: 'focused',
  thinking: 'thinking',
};

export function normalizeCompanionEmotion(raw?: string | null): CompanionEmotion | null {
  if (!raw) return null;
  const key = raw.toLowerCase().trim();
  if (VALID_EMOTIONS.has(key)) return key as CompanionEmotion;
  return EMOTION_ALIASES[key] || null;
}

export function extractEmotionTag(raw: string): { emotion: CompanionEmotion | null; text: string } {
  let detected: CompanionEmotion | null = null;
  const cleaned = raw
    .replace(/\[\[EMO:([a-z_-]+)\]\]\s*/gi, (_all, tag: string) => {
      const normalized = normalizeCompanionEmotion(tag);
      if (normalized) detected = normalized;
      return '';
    })
    .replace(/\[\[EMOTION:([a-z_-]+)\]\]\s*/gi, (_all, tag: string) => {
      const normalized = normalizeCompanionEmotion(tag);
      if (normalized) detected = normalized;
      return '';
    })
    .trimStart();
  return { emotion: detected, text: cleaned };
}

const EMOTION_PROFILES: Record<CompanionEmotion, Omit<EmotionAnalysisResult, 'emotion' | 'intensity'>> = {
  calm: { labelZh: '平静', labelEn: 'Calm', auraHex: 0x8ecfff, basePitch: 1.0, baseRate: 1.12, baiduSpd: 5, audioPlaybackRate: 1.12 },
  happy: { labelZh: '开心', labelEn: 'Happy', auraHex: 0xf9c74f, basePitch: 1.03, baseRate: 1.16, baiduSpd: 6, audioPlaybackRate: 1.14 },
  excited: { labelZh: '雀跃', labelEn: 'Excited', auraHex: 0xff8fab, basePitch: 1.06, baseRate: 1.2, baiduSpd: 6, audioPlaybackRate: 1.18 },
  curious: { labelZh: '好奇', labelEn: 'Curious', auraHex: 0x7dd3fc, basePitch: 1.02, baseRate: 1.14, baiduSpd: 5, audioPlaybackRate: 1.13 },
  concerned: { labelZh: '关切', labelEn: 'Concerned', auraHex: 0xf59e0b, basePitch: 0.99, baseRate: 1.08, baiduSpd: 5, audioPlaybackRate: 1.08 },
  empathetic: { labelZh: '共情', labelEn: 'Empathetic', auraHex: 0xc084fc, basePitch: 0.98, baseRate: 1.06, baiduSpd: 4, audioPlaybackRate: 1.06 },
  playful: { labelZh: '俏皮', labelEn: 'Playful', auraHex: 0x34d399, basePitch: 1.04, baseRate: 1.18, baiduSpd: 6, audioPlaybackRate: 1.16 },
  focused: { labelZh: '专注', labelEn: 'Focused', auraHex: 0x60a5fa, basePitch: 1.0, baseRate: 1.1, baiduSpd: 5, audioPlaybackRate: 1.1 },
  thinking: { labelZh: '思考', labelEn: 'Thinking', auraHex: 0xa78bfa, basePitch: 0.99, baseRate: 1.05, baiduSpd: 4, audioPlaybackRate: 1.05 },
};

export function detectCompanionEmotion(userText: string, replyText = ''): CompanionEmotion {
  const text = `${String(userText || '')}\n${String(replyText || '')}`.toLowerCase();
  if (/累|疲|难受|压力|委屈|难过|抱歉|担心|焦虑|tired|stressed|worried|sorry|sad/.test(text)) return 'empathetic';
  if (/不确定|问题|风险|小心|注意|出错|失败|concern|issue|risk|careful/.test(text)) return 'concerned';
  if (/太棒|开心|高兴|好耶|喜欢|great|awesome|happy|glad|love/.test(text)) return 'happy';
  if (/哇|惊|太酷|马上|立刻|超棒|excited|amazing|wow/.test(text)) return 'excited';
  if (/为什么|怎么|原理|好奇|探索|what if|why|how|curious/.test(text)) return 'curious';
  if (/哈哈|开玩笑|逗|调皮|haha|lol|joke|playful/.test(text)) return 'playful';
  if (/专注|步骤|执行|任务|开始|继续|focus|task|step/.test(text)) return 'focused';
  if (/分析|思考|推理|比较|评估|考虑|think|analy|reason|compare/.test(text)) return 'thinking';
  return 'calm';
}

export function analyzeDialogueEmotion(
  userText: string,
  replyText: string,
  explicitEmotion?: CompanionEmotion | null
): EmotionAnalysisResult {
  const emotion = normalizeCompanionEmotion(explicitEmotion) || detectCompanionEmotion(userText, replyText);
  const profile = EMOTION_PROFILES[emotion] || EMOTION_PROFILES.calm;
  return { emotion, intensity: 0.72, ...profile };
}

/**
 * Builds natural sentence segments for smooth TTS playback.
 */
export function buildExpressivePhrases(
  rawText: string,
  analysis: EmotionAnalysisResult,
  mode: 'audio' | 'speech' = 'audio'
): ProsodyPhrase[] {
  const clean = rawText
    .replace(/\[\[EMO:[a-z_-]+\]\]/gi, '')
    .replace(/\[\[EMOTION:[a-z_-]+\]\]/gi, '')
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
    if (merged.length > 0 && trimmed.length < 14 && merged[merged.length - 1].length + trimmed.length <= 72) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${trimmed}`.trim();
    } else {
      merged.push(trimmed);
    }
  }

  const maxChunkLen = mode === 'audio' ? 95 : 140;
  const finalSegments: string[] = [];
  let acc = '';
  for (const seg of merged) {
    if (!acc) acc = seg;
    else if (acc.length + seg.length <= maxChunkLen) acc = `${acc} ${seg}`;
    else {
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
    pauseAfterMs: 30,
  }));
}

export function inferEmotionFromToolCall(name?: string): CompanionEmotion | null {
  if (!name) return null;
  if (name === 'set_companion_emotion') return null;
  if (/search|lookup|find/.test(name)) return 'curious';
  if (/play|open|navigate|launch/.test(name)) return 'focused';
  return null;
}
