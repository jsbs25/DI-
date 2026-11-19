export interface NormalizedIdentity {
  canonicalId: string;
  family: string;
  displayName: string;
  modelVersion: string;
  category: 'chat' | 'reasoning' | 'code' | 'vision' | 'audio' | 'tts' | 'embedding';
}

const EXACT_ALIAS_MAP: Record<string, string> = {
  'deepseek-chat': 'deepseek/deepseek-v3',
  'deepseek-v3': 'deepseek/deepseek-v3',
  'deepseek-v3-0324': 'deepseek/deepseek-v3',
  'deepseek/deepseek-chat': 'deepseek/deepseek-v3',
  'deepseek/deepseek-chat-v3': 'deepseek/deepseek-v3',
  'deepseek/deepseek-chat-v3-0324': 'deepseek/deepseek-v3',
  'deepseek-reasoner': 'deepseek/deepseek-r1',
  'deepseek-r1': 'deepseek/deepseek-r1',
  'deepseek-ai/deepseek-r1': 'deepseek/deepseek-r1',
  'deepseek/deepseek-r1-0528': 'deepseek/deepseek-r1',
  'deepseek-r1-distill-llama-70b': 'deepseek/deepseek-r1-distill-llama-70b',
  'llama-3.3-70b-versatile': 'meta/llama-3.3-70b-instruct',
  'llama-3.3-70b': 'meta/llama-3.3-70b-instruct',
  'llama3.3-70b': 'meta/llama-3.3-70b-instruct',
  'meta-llama/llama-3.3-70b-instruct': 'meta/llama-3.3-70b-instruct',
  'llama-3.1-8b-instant': 'meta/llama-3.1-8b-instruct',
  'meta-llama/llama-3.1-8b-instruct': 'meta/llama-3.1-8b-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct': 'meta/llama-4-scout-17b',
  'llama-4-scout-17b-16e-instruct': 'meta/llama-4-scout-17b',
  'qwen-3-32b': 'qwen/qwen3-32b',
  'qwen3-32b': 'qwen/qwen3-32b',
  'qwen/qwen3-32b': 'qwen/qwen3-32b',
  'qwen-plus': 'qwen/qwen-plus',
  'qwen-max': 'qwen/qwen-max',
  'qwen-turbo': 'qwen/qwen-turbo',
  'glm-4-flash': 'zhipu/glm-4-flash',
  'glm-4.5-air': 'zhipu/glm-4.5-air',
  'z-ai/glm-4.5-air': 'zhipu/glm-4.5-air',
  'gemini-2.5-flash': 'google/gemini-2.5-flash',
  'google/gemini-2.5-flash': 'google/gemini-2.5-flash',
  'gemini-2.5-pro': 'google/gemini-2.5-pro',
  'google/gemini-2.5-pro': 'google/gemini-2.5-pro',
  'gemini-3-flash-preview': 'google/gemini-3-flash-preview',
  'google/gemini-3-flash-preview': 'google/gemini-3-flash-preview',
  'gemini-3.8-flash': 'google/gemini-3.8-flash',
  'google/gemini-3.8-flash': 'google/gemini-3.8-flash',
  'gemini-4-hydrogen': 'google/gemini-4-hydrogen',
  'google/gemini-4-hydrogen': 'google/gemini-4-hydrogen',
};

function stripRoutingSuffixes(rawId: string): string {
  return rawId
    .trim()
    .toLowerCase()
    .replace(/:(free|extended|nitro|thinking|exacto|floor|beta)$/i, '')
    .replace(/@[a-z0-9._-]+$/i, '');
}

function inferFamily(canonicalId: string): string {
  const lower = canonicalId.toLowerCase();
  if (lower.includes('deepseek')) return 'deepseek';
  if (lower.includes('gemini')) return 'gemini';
  if (lower.includes('llama')) return 'llama';
  if (lower.includes('qwen')) return 'qwen';
  if (lower.includes('glm')) return 'glm';
  if (lower.includes('claude')) return 'claude';
  if (lower.includes('gpt') || lower.includes('openai/') || lower.includes('o1') || lower.includes('o3') || lower.includes('o4')) return 'openai';
  if (lower.includes('mistral') || lower.includes('mixtral')) return 'mistral';
  if (lower.includes('nemotron') || lower.includes('nvidia')) return 'nvidia';
  if (lower.includes('whisper')) return 'whisper';
  if (lower.includes('bge') || lower.includes('embed')) return 'embedding';
  const slashIdx = lower.indexOf('/');
  return slashIdx > 0 ? lower.slice(0, slashIdx) : 'general';
}

function inferCategory(canonicalId: string, hints?: { supportsImages?: boolean; supportsAudio?: boolean }): NormalizedIdentity['category'] {
  const lower = canonicalId.toLowerCase();
  if (lower.includes('embed') || lower.includes('bge-')) return 'embedding';
  if (lower.includes('tts')) return 'tts';
  if (lower.includes('whisper') || lower.includes('live') || hints?.supportsAudio) return 'audio';
  if (lower.includes('vl') || lower.includes('vision') || hints?.supportsImages) return 'vision';
  if (lower.includes('coder') || lower.includes('codestral') || lower.includes('starcoder')) return 'code';
  if (lower.includes('-r1') || lower.includes('reason') || lower.includes('thinking') || lower.includes('qwq')) return 'reasoning';
  return 'chat';
}

function prettifyName(canonicalId: string, rawDisplay?: string): string {
  if (rawDisplay && rawDisplay.trim()) {
    return rawDisplay
      .replace(/\s*\(free\)\s*/gi, '')
      .replace(/\s*:\s*free$/gi, '')
      .trim();
  }
  const base = canonicalId.includes('/') ? canonicalId.split('/').slice(1).join('/') : canonicalId;
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((seg) => (seg.length <= 3 ? seg.toUpperCase() : seg[0].toUpperCase() + seg.slice(1)))
    .join(' ');
}

export function normalizeCanonicalModelIdentity(
  upstreamModelId: string,
  hints?: { displayName?: string; supportsImages?: boolean; supportsAudio?: boolean }
): NormalizedIdentity {
  const stripped = stripRoutingSuffixes(upstreamModelId);
  const withoutProviderPrefix = stripped
    .replace(/^@cf\/meta\//, 'meta-llama/')
    .replace(/^@cf\/qwen\//, 'qwen/')
    .replace(/^accounts\/fireworks\/models\//, '')
    .replace(/^meta-llama\//, 'meta/');

  let canonicalId = EXACT_ALIAS_MAP[stripped] || EXACT_ALIAS_MAP[withoutProviderPrefix];

  if (!canonicalId) {
    // Strip trailing YYYYMMDD / MMDD date stamps like -20250219 when normalizing
    const noDate = withoutProviderPrefix.replace(/-(20\d{6}|\d{4})$/, '');
    canonicalId = EXACT_ALIAS_MAP[noDate] || noDate;
    if (!canonicalId.includes('/')) {
      const fam = inferFamily(canonicalId);
      const ns = fam === 'llama' ? 'meta' : fam === 'glm' ? 'zhipu' : fam === 'gemini' ? 'google' : fam;
      canonicalId = `${ns}/${canonicalId}`;
    }
  }

  const versionMatch = stripped.match(/(\d+(?:\.\d+)+|v\d+|r\d|20\d{6})/i);
  return {
    canonicalId,
    family: inferFamily(canonicalId),
    displayName: prettifyName(canonicalId, hints?.displayName),
    modelVersion: versionMatch ? versionMatch[1] : 'latest',
    category: inferCategory(canonicalId, hints),
  };
}
