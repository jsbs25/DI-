/**
 * EARTH ONE - Planet Classifier & AI Intent Understanding
 * Combines fast rule heuristics with local Ollama (Qwen3:8B) reasoning.
 */
import { PlanetId, ResourceType, AIIntentResult, ResourceItem } from '../types.ts';
import { aiGateway } from '../../aiGateway.ts';

// Keyword to Planet heuristics map
const PLANET_RULES: Array<{
  planet: PlanetId;
  keywords: RegExp;
  domains?: RegExp;
}> = [
  {
    planet: 'sun',
    keywords: /ai|gpt|llm|ollama|deepseek|claude|openai|model|chat|prompt|agent|人工智能|大模型|生图|算力/i,
    domains: /huggingface\.co|ollama\.com|replicate\.com|openai\.com|anthropic\.com/i
  },
  {
    planet: 'moon',
    keywords: /course|learn|university|pedagogy|arabic|language|grammar|study|class|education|school|课程|大学|学习|阿拉伯语|教程|教学|公开课|语法|听力/i,
    domains: /mit\.edu|coursera\.org|edx\.org|duolingo\.com|khanacademy\.org/i
  },
  {
    planet: 'neptune',
    keywords: /book|library|epub|pdf|novel|literature|author|gutenberg|archive|manuscript|图书|书籍|小说|名著|图书馆|古典|古籍|文献|作者|出版/i,
    domains: /openlibrary\.org|gutenberg\.org|archive\.org|wikisource\.org/i
  },
  {
    planet: 'saturn',
    keywords: /movie|cinema|film|tv|series|episode|anime|bilibili|youtube|actor|trailer|电影|影视|剧集|动漫|纪录片|演员|预告片|B站|观影/i,
    domains: /bilibili\.com|youtube\.com|tvmaze\.com|imdb\.com|douban\.com/i
  },
  {
    planet: 'venus',
    keywords: /music|audio|song|track|album|artist|soundtrack|art|gallery|photo|design|font|音乐|歌曲|专辑|乐团|艺术|画廊|插画|设计|字体|摄影/i,
    domains: /freemusicarchive\.org|soundcloud\.com|unsplash\.com|behance\.net/i
  },
  {
    planet: 'uranus',
    keywords: /github|repo|code|software|dataset|arxiv|paper|research|developer|api|sdk|开源|代码|仓库|论文|研究|科研|算法|预印本|数据集/i,
    domains: /github\.com|arxiv\.org|gitlab\.com|kaggle\.com|paperswithcode\.com/i
  },
  {
    planet: 'mars',
    keywords: /game|gaming|app|desktop|download|steam|itch|tool|software|应用|软件|游戏|独立游戏|客户端|安装包/i,
    domains: /itch\.io|steampowered\.com|gog\.com/i
  },
  {
    planet: 'mercury',
    keywords: /news|finance|economy|market|world|report|data|press|stats|新闻|资讯|快讯|财经|金融|经济|数据|报告|世界银行/i,
    domains: /worldbank\.org|reuters\.com|bloomberg\.com|bbc\.com/i
  },
  {
    planet: 'earth',
    keywords: /map|social|travel|hotel|flight|city|life|community|citizen|human|地球|社交|地图|旅行|城市|生活|美食|交通|社区/i,
    domains: /openstreetmap\.org|booking\.com|tripadvisor\.com/i
  },
  {
    planet: 'jupiter',
    keywords: /browser|search|web|tool|portal|directory|extension|internet|浏览器|搜索|网址|导航|工具|网络/i,
    domains: /wikipedia\.org|searx\.space|google\.com|duckduckgo\.com/i
  }
];

/**
 * Fast deterministic classification based on domain and text rules
 */
export function classifyPlanetByRules(text: string, domain?: string): { planet: PlanetId; confidence: number } {
  const combined = `${domain || ''} ${text}`.toLowerCase();

  for (const rule of PLANET_RULES) {
    if (domain && rule.domains && rule.domains.test(domain)) {
      return { planet: rule.planet, confidence: 0.95 };
    }
  }

  for (const rule of PLANET_RULES) {
    if (rule.keywords.test(combined)) {
      return { planet: rule.planet, confidence: 0.8 };
    }
  }

  return { planet: 'jupiter', confidence: 0.5 };
}

/**
 * AI Natural Language Intent Parsing via Ollama / Qwen3:8B
 * Translates natural human prompt into structured search query, target planet & filter constraints.
 */
export async function parseNaturalLanguageIntent(userPrompt: string): Promise<AIIntentResult> {
  const promptTrimmed = userPrompt.trim();
  const ruleGuess = classifyPlanetByRules(promptTrimmed);

  // If prompt is short, rule guess is fast and sufficient
  if (promptTrimmed.length < 12) {
    return {
      originalQuery: promptTrimmed,
      targetPlanet: ruleGuess.planet,
      suggestedKeywords: [promptTrimmed],
      isFreePreferred: /免费|free|开源|open/i.test(promptTrimmed),
      reasoning: `基于关键词规则快速归类至 ${ruleGuess.planet.toUpperCase()}`
    };
  }

  // Construct structured prompt for local Ollama
  const systemInstructions = `你是 EARTH ONE 全球资源发现引擎的意图理解中枢。
根据用户的自然语言输入，判断用户真正想寻找的资源属性。
可选星球代号:
- sun (人工智能与智能工具)
- earth (现实生活与全球服务)
- moon (教育与在线学习、语言学习)
- jupiter (全球互联网、网站、浏览器)
- saturn (影视、影音、B站、YouTube)
- mars (软件、游戏、应用)
- neptune (全球数字图书馆、公版图书、古籍、文献)
- venus (艺术、音乐、设计素材)
- mercury (全球新闻、宏观数据、财经)
- uranus (开源项目、GitHub、科研论文、arXiv)

必须严格输出合法的 JSON 格式，不要输出任何思考过程或标记以外的文本：
{
  "targetPlanet": "moon",
  "category": "language_learning",
  "keywords": ["关键词1", "关键词2"],
  "isFreePreferred": true,
  "languageFilter": "zh",
  "reasoning": "简要分析"
}`;

  try {
    const res = await aiGateway.generateContent(
      'qwen-2.5-open',
      promptTrimmed,
      systemInstructions
    );
    const rawAiOutput = res.content || '';

    // Extract JSON from response
    const jsonMatch = rawAiOutput.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validPlanets: PlanetId[] = ['sun', 'earth', 'moon', 'jupiter', 'saturn', 'mars', 'neptune', 'venus', 'mercury', 'uranus'];
      const planet = validPlanets.includes(parsed.targetPlanet) ? parsed.targetPlanet : ruleGuess.planet;

      return {
        originalQuery: promptTrimmed,
        targetPlanet: planet,
        suggestedKeywords: Array.isArray(parsed.keywords) && parsed.keywords.length > 0 ? parsed.keywords : [promptTrimmed],
        extractedCategory: parsed.category || undefined,
        isFreePreferred: Boolean(parsed.isFreePreferred),
        languageFilter: parsed.languageFilter || undefined,
        reasoning: parsed.reasoning || `AI 识别归属为 ${planet.toUpperCase()}`
      };
    }
  } catch (err: any) {
    console.warn('[PlanetClassifier] Local AI parse fallback to rules:', err.message);
  }

  // Graceful rule-based fallback
  return {
    originalQuery: promptTrimmed,
    targetPlanet: ruleGuess.planet,
    suggestedKeywords: [promptTrimmed],
    isFreePreferred: /免费|free|开源|open/i.test(promptTrimmed),
    reasoning: `本地 AI 离线模式 · 规则匹配至 ${ruleGuess.planet.toUpperCase()}`
  };
}

/**
 * Synthesize comparison summary across search results
 */
export async function summarizeSearchResultsWithAi(
  userPrompt: string,
  results: ResourceItem[]
): Promise<string> {
  if (results.length === 0) {
    return '未找到完全匹配的资源，建议尝试更换关键词或在对应星球探索公开源。';
  }

  const itemsExcerpt = results.slice(0, 5).map((r, i) =>
    `[${i + 1}] ${r.name} (${r.url})\n星球: ${r.primaryPlanet.toUpperCase()} | 访问: ${r.accessType} | 来源: ${r.source}\n简介: ${r.description}`
  ).join('\n\n');

  const prompt = `用户提问: "${userPrompt}"
以下是实际检索到的真实资源:
${itemsExcerpt}

请根据上述检索到的真实结果，为用户撰写一份 2~3 句的精炼引导与比较摘要。
要求：
1. 必须基于上述真实条目，不得虚构链接或平台。
2. 指出哪个资源最匹配、是否免费，以及来自哪个星球。`;

  try {
    const res = await aiGateway.generateContent('qwen-2.5-open', prompt);
    return res.content || '';
  } catch {
    const top = results[0];
    return `已为您检索到 ${results.length} 条关联资源。首选推荐「${top.name}」（${top.primaryPlanet.toUpperCase()} 星球，${top.accessType === 'open' ? '免费开放' : '可用'}），可点击直接访问。`;
  }
}
