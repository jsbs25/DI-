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

const EMOTION_PROFILES: Record<
  VoiceEmotion,
  Omit<EmotionAnalysisResult, 'emotion' | 'intensity'>
> = {
  cheerful: {
    labelZh: '欢快元气',
    labelEn: 'Cheerful',
    auraHex: 0xfbbf24,
    basePitch: 1.22,
    baseRate: 1.06,
    baiduSpd: 5,
    audioPlaybackRate: 1.03,
  },
  affectionate: {
    labelZh: '温柔甜宠',
    labelEn: 'Affectionate',
    auraHex: 0xf472b6,
    basePitch: 1.18,
    baseRate: 0.96,
    baiduSpd: 4,
    audioPlaybackRate: 0.985,
  },
  empathetic: {
    labelZh: '暖心安慰',
    labelEn: 'Empathetic',
    auraHex: 0xc084fc,
    basePitch: 1.05,
    baseRate: 0.92,
    baiduSpd: 4,
    audioPlaybackRate: 0.955,
  },
  playful: {
    labelZh: '俏皮灵动',
    labelEn: 'Playful',
    auraHex: 0xfb7185,
    basePitch: 1.26,
    baseRate: 1.08,
    baiduSpd: 6,
    audioPlaybackRate: 1.045,
  },
  excited: {
    labelZh: '惊喜兴奋',
    labelEn: 'Excited',
    auraHex: 0x34d399,
    basePitch: 1.29,
    baseRate: 1.12,
    baiduSpd: 6,
    audioPlaybackRate: 1.06,
  },
  curious: {
    labelZh: '好奇轻扬',
    labelEn: 'Curious',
    auraHex: 0x38bdf8,
    basePitch: 1.2,
    baseRate: 1.02,
    baiduSpd: 5,
    audioPlaybackRate: 1.015,
  },
  calm: {
    labelZh: '轻柔陪伴',
    labelEn: 'Warm',
    auraHex: 0x8ecfff,
    basePitch: 1.14,
    baseRate: 1.0,
    baiduSpd: 5,
    audioPlaybackRate: 1.0,
  },
};

/**
 * Contextual Emotion Analysis Engine:
 * Evaluates user sentiment + AI reply semantics & punctuation to choose vocal emotion and dynamic intensity.
 */
export function analyzeDialogueEmotion(
  userText: string,
  replyText: string,
  explicitEmotion?: VoiceEmotion | null
): EmotionAnalysisResult {
  if (explicitEmotion && EMOTION_PROFILES[explicitEmotion]) {
    return {
      emotion: explicitEmotion,
      intensity: 0.88,
      ...EMOTION_PROFILES[explicitEmotion],
    };
  }

  const u = (userText || '').toLowerCase();
  const r = (replyText || '').toLowerCase();
  const combined = `${u} ${r}`;

  // 1. Empathy / sadness / fatigue / stress takes top emotional care priority
  if (
    /好累|累死|心累|不开心|难过|伤心|哭|委屈|压力好大|压力大|崩溃|沮丧|心情不好|烦死|焦虑|失眠|孤单|抱抱|摸摸头|辛苦了|别难过|tired|exhausted|sad|lonely|stressed|upset|anxious|hug/.test(
      combined
    )
  ) {
    return {
      emotion: 'empathetic',
      intensity: 0.9,
      ...EMOTION_PROFILES.empathetic,
    };
  }

  // 2. Affection / warmth / goodnight / sweet praise
  if (
    /喜欢你|爱你|想你|害羞|晚安|好梦|早安|可爱|甜|陪着你|陪你|最喜欢|贴心|么么|乖乖|love you|miss you|good night|good morning|sweet dreams|blush/.test(
      combined
    )
  ) {
    return {
      emotion: 'affectionate',
      intensity: 0.92,
      ...EMOTION_PROFILES.affectionate,
    };
  }

  // 3. Playful teasing / humor / lighthearted banter
  if (
    /嘻嘻|哈哈|嘿嘿|哎呀|逗|笑死|笑话|俏皮|干嘛|吃饭了吗|吃什么|偷懒|调皮|开玩笑|haha|hehe|joke|tease|fluffy/.test(
      combined
    )
  ) {
    return {
      emotion: 'playful',
      intensity: 0.86,
      ...EMOTION_PROFILES.playful,
    };
  }

  // 4. Excited / joyful exclamation
  if (
    /太棒了|太好了|超级|哇塞|惊喜|发财|中奖|厉害|冲啊|真棒|赢了|起飞|awesome|amazing|woohoo|fantastic|congrats/.test(
      combined
    ) ||
    (replyText.match(/[！!]/g) || []).length >= 2
  ) {
    return {
      emotion: 'excited',
      intensity: 0.88,
      ...EMOTION_PROFILES.excited,
    };
  }

  // 5. Cheerful music / entertainment / positive greetings
  if (
    /开心|高兴|快乐|听歌|放歌|音乐|好听|晴天|周末|出发|旅游|纪录片|我在呢|你好呀|happy|cheerful|music|song|great/.test(
      combined
    )
  ) {
    return {
      emotion: 'cheerful',
      intensity: 0.8,
      ...EMOTION_PROFILES.cheerful,
    };
  }

  // 6. Curious / questioning
  if (/[？?]|为什么|怎么|难道|真的吗|是不是|吗|呢|what|why|how|really\?/.test(r)) {
    return {
      emotion: 'curious',
      intensity: 0.72,
      ...EMOTION_PROFILES.curious,
    };
  }

  return {
    emotion: 'calm',
    intensity: 0.6,
    ...EMOTION_PROFILES.calm,
  };
}

/**
 * Splits a reply into natural spoken phrases with clause-level pitch, tempo,
 * questioning upward lift, exclamation energy, and realistic breathing pauses.
 */
export function buildExpressivePhrases(
  rawText: string,
  analysis: EmotionAnalysisResult,
  mode: 'audio' | 'speech' = 'audio'
): ProsodyPhrase[] {
  const clean = rawText
    .replace(/\[\[EMO:[a-z_-]+\]\]/gi, '')
    .replace(/\[\[ACTION:[\s\S]*?\]\]/g, '')
    .replace(/[*_#`>~～]/g, (m) => (m === '~' || m === '～' ? '～' : ''))
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return [];

  // Sentence-level split for fluid neural MP3 audio; finer clause-level for Web Speech API
  const rawChunks =
    mode === 'audio'
      ? clean.match(/[^。！？!?;；\n]+[。！？!?;；\n]?/g) || [clean]
      : clean.match(/[^。！？!?;；，,、\n]+[。！？!?;；，,、\n]?/g) || [clean];

  const merged: string[] = [];
  for (const piece of rawChunks) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    // Merge very short fragments into previous only when length < 5 (except lively interjections)
    const isInterjection = /^(哇|呀|嘻嘻|哈哈|哎呀|嗯嗯|摸摸头|好哒|好呀|嘿嘿)[！!～~，,]?$/.test(trimmed);
    if (
      merged.length > 0 &&
      !isInterjection &&
      trimmed.length < 6 &&
      merged[merged.length - 1].length < 48
    ) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${trimmed}`.trim();
    } else {
      merged.push(trimmed);
    }
  }

  // Combine tiny audio segments if there are too many chunks (>3) so playback stays seamless
  const finalSegments: string[] = [];
  if (mode === 'audio' && merged.length > 3) {
    let acc = '';
    for (const seg of merged) {
      if (!acc) {
        acc = seg;
      } else if (acc.length + seg.length <= 58) {
        acc = `${acc} ${seg}`;
      } else {
        finalSegments.push(acc);
        acc = seg;
      }
    }
    if (acc) finalSegments.push(acc);
  } else {
    finalSegments.push(...merged);
  }

  return finalSegments.map((seg, idx) => {
    const isQuestion = /[？?]$|[吗呢呀嘛][？?]?$/.test(seg);
    const isExclaim = /[！!～~]$/.test(seg);
    const isGentlePause = /[…\.]{2,}|摸摸头|抱抱|晚安|休息/.test(seg);
    const isInterjection = /^(哇|嘻嘻|哈哈|哎呀|嗯哼|嘿嘿|哇塞)/.test(seg);

    let pitch = analysis.basePitch;
    let rate = analysis.baseRate;
    let audioRate = analysis.audioPlaybackRate;
    let baiduSpd = analysis.baiduSpd;
    let pauseAfterMs = analysis.emotion === 'empathetic' || analysis.emotion === 'affectionate' ? 140 : 80;

    if (isQuestion) {
      pitch += 0.08;
      audioRate = Math.min(1.08, audioRate + 0.02);
      pauseAfterMs += 30;
    }
    if (isExclaim) {
      pitch += 0.06;
      rate = Math.min(1.18, rate + 0.04);
      audioRate = Math.min(1.08, audioRate + 0.025);
    }
    if (isInterjection) {
      pitch += 0.08;
      rate = Math.min(1.16, rate + 0.05);
      audioRate = Math.min(1.07, audioRate + 0.02);
      pauseAfterMs = 55;
    }
    if (isGentlePause) {
      pitch = Math.max(0.98, pitch - 0.05);
      rate = Math.max(0.88, rate - 0.06);
      audioRate = Math.max(0.93, audioRate - 0.03);
      baiduSpd = Math.max(4, baiduSpd - 1);
      pauseAfterMs = 190;
    }

    // Subtle ending cadence warmth on the closing phrase
    if (idx === finalSegments.length - 1 && !isQuestion && !isExclaim) {
      rate = Math.max(0.9, rate - 0.03);
    }

    return {
      text: seg,
      emotion: analysis.emotion,
      pitch: Math.max(0.92, Math.min(1.36, Number(pitch.toFixed(2)))),
      rate: Math.max(0.86, Math.min(1.18, Number(rate.toFixed(2)))),
      baiduSpd: Math.max(3, Math.min(6, baiduSpd)),
      audioPlaybackRate: Math.max(0.93, Math.min(1.08, Number(audioRate.toFixed(3)))),
      pauseAfterMs,
    };
  });
}
