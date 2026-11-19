import { Type } from '@google/genai';
import { getGeminiClient } from './geminiClient.ts';
import { oneAiRouter } from './oneAi/router.ts';

export type SupportedStudyLang = 'en' | 'ar' | 'ja' | 'fr' | 'es' | 'ko';
export type StudyLevel = 'beginner' | 'intermediate' | 'advanced';

export interface LanguageMeta {
  code: SupportedStudyLang;
  nameZh: string;
  nameEn: string;
  nativeName: string;
  speechLang: string;
  ttsLang: string;
}

export const LANGUAGE_CATALOG: LanguageMeta[] = [
  { code: 'en', nameZh: '英语', nameEn: 'English', nativeName: 'English', speechLang: 'en-US', ttsLang: 'en' },
  { code: 'ar', nameZh: '阿拉伯语', nameEn: 'Arabic', nativeName: 'العربية', speechLang: 'ar-SA', ttsLang: 'ar' },
  { code: 'ja', nameZh: '日语', nameEn: 'Japanese', nativeName: '日本語', speechLang: 'ja-JP', ttsLang: 'ja' },
  { code: 'fr', nameZh: '法语', nameEn: 'French', nativeName: 'Français', speechLang: 'fr-FR', ttsLang: 'fr' },
  { code: 'es', nameZh: '西班牙语', nameEn: 'Spanish', nativeName: 'Español', speechLang: 'es-ES', ttsLang: 'es' },
  { code: 'ko', nameZh: '韩语', nameEn: 'Korean', nativeName: '한국어', speechLang: 'ko-KR', ttsLang: 'ko' },
];

export interface RoleplayScenarioPreset {
  id: string;
  titleZh: string;
  titleEn: string;
  settingZh: string;
  settingEn: string;
  npcRoleZh: string;
  npcRoleEn: string;
  missionsZh: string[];
  missionsEn: string[];
}

export const ROLEPLAY_SCENARIOS: RoleplayScenarioPreset[] = [
  {
    id: 'cafe',
    titleZh: '伦敦精品咖啡馆',
    titleEn: 'London Artisan Café',
    settingZh: '雨后清晨，你走进伦敦街角的一家手冲咖啡馆准备点单并找个靠窗座位。',
    settingEn: 'A cozy corner coffee shop in London where you are ordering a drink and pastry.',
    npcRoleZh: '热情友善的咖啡师',
    npcRoleEn: 'Friendly Barista',
    missionsZh: ['自然打招呼并点一杯定制饮品', '说明冰量/奶类偏好或堂食外带', '礼貌询问价格并完成支付'],
    missionsEn: ['Greet and order a customized drink', 'Specify milk/ice preference or for here/to go', 'Ask about payment and thank the barista'],
  },
  {
    id: 'airport',
    titleZh: '国际机场值机与海关',
    titleEn: 'Airport Check-in & Immigration',
    settingZh: '你正在国际机场办理托运行李、选座以及入境边检问答。',
    settingEn: 'Checking in luggage, requesting a seat, and answering immigration questions.',
    npcRoleZh: '航空公司地勤与海关官员',
    npcRoleEn: 'Airline Agent / Officer',
    missionsZh: ['说明航班目的地并请求靠窗座位', '清晰回答出行目的与停留天数', '确认登机口或行李托运信息'],
    missionsEn: ['Request a window seat and check luggage', 'Explain trip purpose and length of stay', 'Confirm boarding gate or baggage details'],
  },
  {
    id: 'hotel',
    titleZh: '海景酒店办理入住',
    titleEn: 'Boutique Hotel Check-in',
    settingZh: '你抵达预订好的海景酒店前台，办理入住并询问早餐与 Wi-Fi。',
    settingEn: 'Arriving at a seaside boutique hotel reception to check in and ask about amenities.',
    npcRoleZh: '酒店前台礼宾员',
    npcRoleEn: 'Hotel Receptionist',
    missionsZh: ['报出预订姓名办理入住', '询问能否升级安静房型或延迟退房', '确认早餐时间与 Wi-Fi 密码'],
    missionsEn: ['Confirm your reservation details', 'Ask about a quiet room or late checkout', 'Confirm breakfast hours and Wi-Fi'],
  },
  {
    id: 'restaurant',
    titleZh: '纽约小酒馆点餐',
    titleEn: 'New York Bistro Dining',
    settingZh: '晚上和朋友在纽约一家口碑餐厅用餐，需要请服务员推荐菜品并说明忌口。',
    settingEn: 'Dining at a lively New York bistro, asking for recommendations and explaining dietary preferences.',
    npcRoleZh: '专业热情的餐厅侍者',
    npcRoleEn: 'Attentive Server',
    missionsZh: ['请服务员推荐招牌主菜', '说明饮食偏好或过敏忌口', '用餐后礼貌要求结账买单'],
    missionsEn: ['Ask for the house special recommendation', 'Mention a dietary preference or allergy', 'Politely ask for the check'],
  },
  {
    id: 'interview',
    titleZh: '外企全英文求职面试',
    titleEn: 'Global Tech Job Interview',
    settingZh: '你正在参加一家国际公司的英文面试，面试官会请你自我介绍并聊聊项目经历。',
    settingEn: 'An English job interview covering your background, strengths, and a key project.',
    npcRoleZh: '温和专业的招聘经理',
    npcRoleEn: 'Hiring Manager',
    missionsZh: ['用简洁自信的口语做 30 秒自我介绍', '分享一个你的核心优势或项目成果', '向面试官提出一个高质量反问'],
    missionsEn: ['Deliver a crisp self-introduction', 'Share a key strength or project outcome', 'Ask a thoughtful question about the role'],
  },
  {
    id: 'shopping',
    titleZh: '街头问路与潮牌购物',
    titleEn: 'City Directions & Shopping',
    settingZh: '你在市中心逛街，想试穿一件外套、询问尺码折扣并顺便问去地铁站的路。',
    settingEn: 'Trying on a jacket in a downtown boutique, asking about sizes, and getting directions.',
    npcRoleZh: '时尚买手店店员',
    npcRoleEn: 'Store Stylist',
    missionsZh: ['询问有没有更合适的尺码或颜色', '请求试穿并询问价格或优惠', '询问最近地铁站的步行路线'],
    missionsEn: ['Ask for another size or color', 'Ask to try it on and check price', 'Ask for directions to the nearest subway'],
  },
  {
    id: 'clinic',
    titleZh: '海外诊所与药房问诊',
    titleEn: 'Clinic & Pharmacy Visit',
    settingZh: '旅途中有点感冒咳嗽，你在当地药房或诊所向药师描述症状并购药。',
    settingEn: 'Describing mild travel symptoms to a pharmacist and asking about dosage.',
    npcRoleZh: '耐心细致的社区药师',
    npcRoleEn: 'Community Pharmacist',
    missionsZh: ['清楚描述自己的主要症状和持续时间', '询问有没有温和不犯困的药物推荐', '确认服药剂量与注意事项'],
    missionsEn: ['Describe symptoms and duration clearly', 'Ask for a non-drowsy medicine option', 'Confirm dosage instructions'],
  },
  {
    id: 'friends',
    titleZh: '国际派对自然交友',
    titleEn: 'International Rooftop Social',
    settingZh: '在天台派对上认识了一位来自海外的新朋友，聊聊彼此的城市、音乐和周末计划。',
    settingEn: 'Meeting a new friend at a relaxed rooftop gathering and chatting about music and travel.',
    npcRoleZh: '健谈幽默的新朋友',
    npcRoleEn: 'Friendly New Acquaintance',
    missionsZh: ['自然破冰寒暄并介绍自己来自哪里', '聊聊共同兴趣（音乐、电影或旅行）', '自然提出交换联系方式'],
    missionsEn: ['Break the ice and introduce yourself', 'Chat about shared interests', 'Naturally offer to stay in touch'],
  },
];

export interface SpokenRescueCard {
  level: 'simple' | 'natural' | 'native';
  labelZh: string;
  targetText: string;
  translationZh: string;
  phonetic: string;
  chunkGuide: string;
}

export interface QuizQuestionItem {
  id: string;
  type: 'multiple_choice' | 'fill_blank' | 'listen_choose' | 'speak_aloud';
  prompt: string;
  promptZh: string;
  contextZh: string;
  targetAudioText: string;
  phonetic: string;
  options: string[];
  correctAnswer: string;
  explanationZh: string;
  spokenTipZh: string;
}

export interface RoleplayMissionItem {
  id: string;
  labelZh: string;
  labelEn: string;
  completed: boolean;
}

export interface RoleplayTurnResponse {
  scenarioId: string;
  scenarioTitle: string;
  npcRole: string;
  targetLang: SupportedStudyLang;
  npcLine: string;
  npcTranslationZh: string;
  npcPhonetic: string;
  npcMood: 'cheerful' | 'curious' | 'empathetic' | 'playful' | 'calm';
  userFeedback?: {
    score: number;
    praiseZh: string;
    betterWay: string;
    betterWayZh: string;
    pronunciationTipZh: string;
  };
  rescueSuggestions: SpokenRescueCard[];
  missions: RoleplayMissionItem[];
}

export interface SpokenRescueResponse {
  targetLang: SupportedStudyLang;
  coachReplyZh: string;
  expressions: SpokenRescueCard[];
}

export function normalizeStudyLang(raw?: string | null): SupportedStudyLang {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'ar' || /arab|阿语|阿拉伯/.test(s)) return 'ar';
  if (s === 'ja' || s === 'jp' || /japan|日语|日文/.test(s)) return 'ja';
  if (s === 'fr' || /french|法语|法文/.test(s)) return 'fr';
  if (s === 'es' || /span|西语|西班牙/.test(s)) return 'es';
  if (s === 'ko' || s === 'kr' || /korean|韩语|韩文/.test(s)) return 'ko';
  return 'en';
}

export function getLangMeta(code: SupportedStudyLang): LanguageMeta {
  return LANGUAGE_CATALOG.find((l) => l.code === code) || LANGUAGE_CATALOG[0];
}

function safeJsonParse<T>(raw: string): T | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const unwrapped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(unwrapped) as T;
  } catch {
    const start = unwrapped.indexOf('{');
    const end = unwrapped.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(unwrapped.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function generateStructuredJson<T>(opts: {
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, any>;
}): Promise<T> {
  const ai = getGeminiClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: opts.prompt,
        config: {
          systemInstruction: opts.systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: opts.responseSchema,
        },
      });
      const parsed = safeJsonParse<T>(response.text ?? '');
      if (parsed) return parsed;
    } catch (err: any) {
      console.warn('[LanguageCoach] Gemini structured call failed, trying router fallback:', err?.message || err);
    }
  }

  // Fallback to ONE AI router if Gemini key is not active
  const routerRes = await oneAiRouter.executeUnifiedTurn({
    requestId: `lang_coach_${Date.now()}`,
    userId: null,
    subjectKey: 'language_coach',
    userTier: 'free',
    prompt: opts.prompt,
    messages: [
      {
        role: 'system',
        content: `${opts.systemInstruction}\nReturn ONLY valid raw JSON with no markdown fences.`,
      },
      { role: 'user', content: opts.prompt },
    ],
    mode: 'language-tutor',
    requiresStructuredOutput: true,
    maxTokens: 2200,
    stream: false,
  });

  if (routerRes.success && routerRes.content) {
    const parsed = safeJsonParse<T>(routerRes.content);
    if (parsed) return parsed;
  }

  throw new Error(routerRes.errorMessage || '语言教练 AI 引擎暂时不可用，请检查 Gemini API 配置后重试。');
}

const RESCUE_CARD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    level: { type: Type.STRING, description: 'One of: simple, natural, native' },
    labelZh: { type: Type.STRING, description: 'Short Chinese label like 新手最稳, 日常自然, 母语地道' },
    targetText: { type: Type.STRING, description: 'Exact spoken sentence in target language' },
    translationZh: { type: Type.STRING, description: 'Natural Chinese translation' },
    phonetic: { type: Type.STRING, description: 'IPA or clear romanized pronunciation guide' },
    chunkGuide: { type: Type.STRING, description: 'Phrase chunking with | separators for spoken rhythm' },
  },
  required: ['level', 'labelZh', 'targetText', 'translationZh', 'phonetic', 'chunkGuide'],
};

export async function generateLanguageQuizPack(params: {
  targetLang: SupportedStudyLang;
  level?: StudyLevel;
  topic?: string;
  count?: number;
}): Promise<{
  targetLang: SupportedStudyLang;
  topicTitleZh: string;
  level: StudyLevel;
  questions: QuizQuestionItem[];
}> {
  const langMeta = getLangMeta(params.targetLang);
  const level: StudyLevel = params.level || 'intermediate';
  const count = Math.max(4, Math.min(8, params.count || 6));
  const topic = (params.topic || '日常实景口语与高频沟通').trim();

  const systemInstruction = `You are a world-class ${langMeta.nameEn} (${langMeta.nameZh}) language coach designing engaging, practical spoken-language quiz exercises for Chinese-speaking learners.
- Create ${count} varied, real-life questions mixing all 4 types: "multiple_choice", "fill_blank", "listen_choose", and "speak_aloud" (include at least 2 speak_aloud or listen_choose items).
- Keep every sentence authentic, modern, and immediately usable in real life.
- For "multiple_choice" and "listen_choose", provide exactly 4 distinct options where one exactly matches correctAnswer.
- For "fill_blank", include "___" in prompt and provide 4 word/phrase options where one exactly matches correctAnswer.
- For "speak_aloud", options can be an empty array [], correctAnswer is the exact target spoken sentence, and targetAudioText is that same sentence so the learner can listen and shadow it.
- Always provide crisp Chinese explanations (explanationZh) and spoken pronunciation tips (spokenTipZh).`;

  const prompt = `Generate a ${count}-question interactive ${langMeta.nameEn} (${langMeta.nativeName}) practice pack.
Difficulty: ${level}.
Topic / Scene: ${topic}.
Make every question vivid, situational, and practical.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      topicTitleZh: { type: Type.STRING },
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            type: { type: Type.STRING, description: 'multiple_choice | fill_blank | listen_choose | speak_aloud' },
            prompt: { type: Type.STRING },
            promptZh: { type: Type.STRING },
            contextZh: { type: Type.STRING },
            targetAudioText: { type: Type.STRING },
            phonetic: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctAnswer: { type: Type.STRING },
            explanationZh: { type: Type.STRING },
            spokenTipZh: { type: Type.STRING },
          },
          required: [
            'id',
            'type',
            'prompt',
            'promptZh',
            'contextZh',
            'targetAudioText',
            'phonetic',
            'options',
            'correctAnswer',
            'explanationZh',
            'spokenTipZh',
          ],
        },
      },
    },
    required: ['topicTitleZh', 'questions'],
  };

  const result = await generateStructuredJson<{ topicTitleZh: string; questions: QuizQuestionItem[] }>({
    systemInstruction,
    prompt,
    responseSchema: schema,
  });

  const validTypes = new Set(['multiple_choice', 'fill_blank', 'listen_choose', 'speak_aloud']);
  const normalizedQuestions = (Array.isArray(result.questions) ? result.questions : []).map((q, idx) => ({
    id: q.id || `q_${Date.now()}_${idx}`,
    type: (validTypes.has(q.type) ? q.type : 'multiple_choice') as QuizQuestionItem['type'],
    prompt: String(q.prompt || '').trim(),
    promptZh: String(q.promptZh || '').trim(),
    contextZh: String(q.contextZh || '').trim(),
    targetAudioText: String(q.targetAudioText || q.correctAnswer || q.prompt || '').trim(),
    phonetic: String(q.phonetic || '').trim(),
    options: Array.isArray(q.options) ? q.options.map((o) => String(o).trim()).filter(Boolean) : [],
    correctAnswer: String(q.correctAnswer || '').trim(),
    explanationZh: String(q.explanationZh || '').trim(),
    spokenTipZh: String(q.spokenTipZh || '').trim(),
  }));

  if (normalizedQuestions.length === 0) {
    throw new Error('未能生成有效题目，请重试。');
  }

  return {
    targetLang: params.targetLang,
    topicTitleZh: result.topicTitleZh || topic,
    level,
    questions: normalizedQuestions,
  };
}

export async function startRoleplaySession(params: {
  targetLang: SupportedStudyLang;
  scenarioId?: string;
  customScenario?: string;
  level?: StudyLevel;
}): Promise<RoleplayTurnResponse> {
  const langMeta = getLangMeta(params.targetLang);
  const level: StudyLevel = params.level || 'intermediate';
  const preset = ROLEPLAY_SCENARIOS.find((s) => s.id === params.scenarioId) || ROLEPLAY_SCENARIOS[0];
  const isCustom = Boolean(params.customScenario && params.customScenario.trim());

  const scenarioTitle = isCustom ? params.customScenario!.trim() : preset.titleZh;
  const scenarioSetting = isCustom
    ? `Real-world spoken scenario requested by the learner: ${params.customScenario!.trim()}`
    : `${preset.titleEn} — ${preset.settingEn}`;
  const npcRole = isCustom ? `Friendly native ${langMeta.nameEn} conversation partner` : `${preset.npcRoleEn} (${preset.npcRoleZh})`;

  const systemInstruction = `You are playing an immersive, lifelike real-world spoken roleplay character in ${langMeta.nameEn} (${langMeta.nativeName}) for a Chinese-speaking learner (level: ${level}).
- Speak naturally like a real native person in the scene (1–2 crisp, warm spoken sentences, NOT robotic textbook lines).
- Always output the target-language line (npcLine), accurate natural Chinese translation (npcTranslationZh), spoken phonetic/rhythm hint (npcPhonetic), and 3 graded rescue suggestions (simple / natural / native) that the learner can immediately say back to you if they get stuck.
- Provide 3 short, concrete conversational missions for the learner to accomplish during this scene.`;

  const prompt = `Start a fresh real-world spoken roleplay session.
Target language: ${langMeta.nameEn} (${langMeta.nativeName})
Scenario: ${scenarioSetting}
Your role: ${npcRole}
Learner level: ${level}
Deliver your opening spoken greeting/question to kick off the scene naturally.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      scenarioTitle: { type: Type.STRING },
      npcRole: { type: Type.STRING },
      npcLine: { type: Type.STRING },
      npcTranslationZh: { type: Type.STRING },
      npcPhonetic: { type: Type.STRING },
      npcMood: { type: Type.STRING, description: 'cheerful | curious | empathetic | playful | calm' },
      rescueSuggestions: { type: Type.ARRAY, items: RESCUE_CARD_SCHEMA },
      missions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            labelZh: { type: Type.STRING },
            labelEn: { type: Type.STRING },
            completed: { type: Type.BOOLEAN },
          },
          required: ['id', 'labelZh', 'labelEn', 'completed'],
        },
      },
    },
    required: ['scenarioTitle', 'npcRole', 'npcLine', 'npcTranslationZh', 'npcPhonetic', 'npcMood', 'rescueSuggestions', 'missions'],
  };

  const out = await generateStructuredJson<any>({
    systemInstruction,
    prompt,
    responseSchema: schema,
  });

  const moods = new Set(['cheerful', 'curious', 'empathetic', 'playful', 'calm']);
  const missions: RoleplayMissionItem[] =
    Array.isArray(out.missions) && out.missions.length > 0
      ? out.missions.slice(0, 4).map((m: any, idx: number) => ({
          id: String(m.id || `m_${idx + 1}`),
          labelZh: String(m.labelZh || preset.missionsZh[idx] || '完成自然交流'),
          labelEn: String(m.labelEn || preset.missionsEn[idx] || 'Complete exchange'),
          completed: false,
        }))
      : preset.missionsZh.map((zh, idx) => ({
          id: `m_${idx + 1}`,
          labelZh: zh,
          labelEn: preset.missionsEn[idx] || zh,
          completed: false,
        }));

  return {
    scenarioId: isCustom ? 'custom' : preset.id,
    scenarioTitle: isCustom ? out.scenarioTitle || scenarioTitle : preset.titleZh,
    npcRole: out.npcRole || npcRole,
    targetLang: params.targetLang,
    npcLine: String(out.npcLine || '').trim(),
    npcTranslationZh: String(out.npcTranslationZh || '').trim(),
    npcPhonetic: String(out.npcPhonetic || '').trim(),
    npcMood: (moods.has(out.npcMood) ? out.npcMood : 'cheerful') as RoleplayTurnResponse['npcMood'],
    rescueSuggestions: normalizeRescueCards(out.rescueSuggestions),
    missions,
  };
}

export async function continueRoleplayTurn(params: {
  targetLang: SupportedStudyLang;
  scenarioId?: string;
  scenarioTitle: string;
  npcRole: string;
  level?: StudyLevel;
  history: Array<{ role: 'npc' | 'user'; text: string }>;
  userMessage: string;
  missions?: RoleplayMissionItem[];
}): Promise<RoleplayTurnResponse> {
  const langMeta = getLangMeta(params.targetLang);
  const level: StudyLevel = params.level || 'intermediate';
  const histText = params.history
    .slice(-10)
    .map((h) => `${h.role === 'npc' ? 'NPC' : 'Learner'}: ${h.text}`)
    .join('\n');
  const missionText = (params.missions || [])
    .map((m) => `- [${m.completed ? 'DONE' : 'TODO'}] (${m.id}) ${m.labelZh} / ${m.labelEn}`)
    .join('\n');

  const systemInstruction = `You are continuing a live spoken roleplay in ${langMeta.nameEn} (${langMeta.nativeName}) with a Chinese-speaking learner (level: ${level}).
- Stay completely in character as "${params.npcRole}" in "${params.scenarioTitle}".
- Keep npcLine natural, engaging, and concise (1–2 spoken sentences) so the conversation flows smoothly.
- Provide warm, practical spoken feedback on the learner's latest turn (score 60-100, concise Chinese praise, a more natural/idiomatic way to say what they meant, Chinese meaning, and 1 crisp pronunciation tip).
- If the learner wrote in Chinese or broken ${langMeta.nameEn}, gently understand their intent, keep the scene going smoothly in ${langMeta.nameEn}, and show them the idiomatic ${langMeta.nameEn} phrasing in betterWay!
- Update mission completion booleans accurately based on what the learner has accomplished so far.
- Always supply 3 fresh graded rescueSuggestions (simple / natural / native) for how the learner can reply to your NEW npcLine.`;

  const prompt = `Scenario: ${params.scenarioTitle}
NPC Role: ${params.npcRole}
Target language: ${langMeta.nameEn} (${langMeta.nativeName})
Missions so far:
${missionText || '(general conversation)'}

Conversation so far:
${histText}

Learner's latest spoken/typed reply:
"${params.userMessage}"

Respond in character, coach the learner's last turn gently, update missions, and provide 3 rescue replies for the next turn.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      npcLine: { type: Type.STRING },
      npcTranslationZh: { type: Type.STRING },
      npcPhonetic: { type: Type.STRING },
      npcMood: { type: Type.STRING },
      userFeedback: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          praiseZh: { type: Type.STRING },
          betterWay: { type: Type.STRING },
          betterWayZh: { type: Type.STRING },
          pronunciationTipZh: { type: Type.STRING },
        },
        required: ['score', 'praiseZh', 'betterWay', 'betterWayZh', 'pronunciationTipZh'],
      },
      rescueSuggestions: { type: Type.ARRAY, items: RESCUE_CARD_SCHEMA },
      missions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            labelZh: { type: Type.STRING },
            labelEn: { type: Type.STRING },
            completed: { type: Type.BOOLEAN },
          },
          required: ['id', 'labelZh', 'labelEn', 'completed'],
        },
      },
    },
    required: ['npcLine', 'npcTranslationZh', 'npcPhonetic', 'npcMood', 'userFeedback', 'rescueSuggestions', 'missions'],
  };

  const out = await generateStructuredJson<any>({
    systemInstruction,
    prompt,
    responseSchema: schema,
  });

  const moods = new Set(['cheerful', 'curious', 'empathetic', 'playful', 'calm']);
  return {
    scenarioId: params.scenarioId || 'custom',
    scenarioTitle: params.scenarioTitle,
    npcRole: params.npcRole,
    targetLang: params.targetLang,
    npcLine: String(out.npcLine || '').trim(),
    npcTranslationZh: String(out.npcTranslationZh || '').trim(),
    npcPhonetic: String(out.npcPhonetic || '').trim(),
    npcMood: (moods.has(out.npcMood) ? out.npcMood : 'cheerful') as RoleplayTurnResponse['npcMood'],
    userFeedback: out.userFeedback
      ? {
          score: Math.max(50, Math.min(100, Math.round(Number(out.userFeedback.score) || 85))),
          praiseZh: String(out.userFeedback.praiseZh || '表达很清晰！').trim(),
          betterWay: String(out.userFeedback.betterWay || '').trim(),
          betterWayZh: String(out.userFeedback.betterWayZh || '').trim(),
          pronunciationTipZh: String(out.userFeedback.pronunciationTipZh || '').trim(),
        }
      : undefined,
    rescueSuggestions: normalizeRescueCards(out.rescueSuggestions),
    missions:
      Array.isArray(out.missions) && out.missions.length > 0
        ? out.missions.map((m: any, idx: number) => ({
            id: String(m.id || params.missions?.[idx]?.id || `m_${idx + 1}`),
            labelZh: String(m.labelZh || params.missions?.[idx]?.labelZh || ''),
            labelEn: String(m.labelEn || params.missions?.[idx]?.labelEn || ''),
            completed: Boolean(m.completed),
          }))
        : params.missions || [],
  };
}

export async function generateSpokenRescue(params: {
  targetLang: SupportedStudyLang;
  situation?: string;
  lastNpcLine?: string;
  userIntentZh?: string;
  level?: StudyLevel;
}): Promise<SpokenRescueResponse> {
  const langMeta = getLangMeta(params.targetLang);
  const level: StudyLevel = params.level || 'intermediate';

  const systemInstruction = `You are a warm, fast, encouraging spoken ${langMeta.nameEn} (${langMeta.nameZh}) coach.
The learner just told you "我不知道该怎么讲" (they are stuck and need immediate ready-to-speak phrasing!).
- Give a super-concise, encouraging 1-sentence Chinese coaching line (coachReplyZh).
- Immediately provide 3 graded ready-to-say spoken replies in ${langMeta.nameEn} (${langMeta.nativeName}):
  1. level="simple" (labelZh="新手最稳"): ultra-easy, short, foolproof spoken sentence.
  2. level="natural" (labelZh="日常自然"): smooth everyday phrasing.
  3. level="native" (labelZh="母语地道"): idiomatic, charming native expression.
- Include accurate Chinese meaning, clear IPA/pronunciation hint, and phrase chunking with "|" for rhythm.`;

  const prompt = `Target language: ${langMeta.nameEn} (${langMeta.nativeName})
Level: ${level}
Current scene: ${params.situation || '日常真实口语对话'}
What the other person just said: "${params.lastNpcLine || '(opening greeting)'}"
What the learner wants to say or asked for help with: "${params.userIntentZh || '我不知道该怎么接话，请给我可以直接开口说的句子'}"

Give 3 immediately usable spoken expressions right now.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      coachReplyZh: { type: Type.STRING },
      expressions: { type: Type.ARRAY, items: RESCUE_CARD_SCHEMA },
    },
    required: ['coachReplyZh', 'expressions'],
  };

  const out = await generateStructuredJson<any>({
    systemInstruction,
    prompt,
    responseSchema: schema,
  });

  return {
    targetLang: params.targetLang,
    coachReplyZh: String(out.coachReplyZh || '别紧张，直接选下面任意一句开口说就行，点小喇叭可以先听示范：').trim(),
    expressions: normalizeRescueCards(out.expressions),
  };
}

function normalizeRescueCards(raw: any): SpokenRescueCard[] {
  if (!Array.isArray(raw)) return [];
  const levels: Array<'simple' | 'natural' | 'native'> = ['simple', 'natural', 'native'];
  const defaultLabels = ['新手最稳', '日常自然', '母语地道'];
  return raw.slice(0, 3).map((item, idx) => {
    const lv = item?.level === 'simple' || item?.level === 'natural' || item?.level === 'native'
      ? item.level
      : levels[idx] || 'natural';
    return {
      level: lv,
      labelZh: String(item?.labelZh || defaultLabels[idx] || '地道表达').trim(),
      targetText: String(item?.targetText || '').trim(),
      translationZh: String(item?.translationZh || '').trim(),
      phonetic: String(item?.phonetic || '').trim(),
      chunkGuide: String(item?.chunkGuide || item?.targetText || '').trim(),
    };
  }).filter((c) => Boolean(c.targetText));
}
