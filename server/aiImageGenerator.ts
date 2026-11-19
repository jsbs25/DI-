import { Type } from '@google/genai';
import { getGeminiClient } from './geminiClient.ts';
import { oneAiDb } from './oneAi/db.ts';
import { oneAiRouter } from './oneAi/router.ts';

export type ImageAspectRatio = '1:1' | '16:9' | '4:3' | '3:4';
export type ImageGenMode = 'standalone' | 'dialogue_scene';

export interface GeneratedImageResult {
  imageUrl: string;
  mimeType: string;
  prompt: string;
  enhancedPrompt: string;
  captionZh: string;
  aspectRatio: ImageAspectRatio;
  mode: ImageGenMode;
  engine: string;
  providerLabelZh: string;
  promptDirectorLabelZh: string;
  freePoolChain: string[];
  failoverCount: number;
  createdAt: string;
}

interface FreeImageNodeRuntime {
  id: string;
  labelZh: string;
  kind: 'workers_ai' | 'huggingface' | 'zhipu_free' | 'pollinations' | 'free_llm_composer';
  cooldownUntil: number;
  successCount: number;
  failCount: number;
  lastError?: string;
  lastLatencyMs?: number;
}

const NODE_RUNTIME = new Map<string, FreeImageNodeRuntime>();

function getRuntime(id: string, labelZh: string, kind: FreeImageNodeRuntime['kind']): FreeImageNodeRuntime {
  let entry = NODE_RUNTIME.get(id);
  if (!entry) {
    entry = { id, labelZh, kind, cooldownUntil: 0, successCount: 0, failCount: 0 };
    NODE_RUNTIME.set(id, entry);
  }
  return entry;
}

function markNodeSuccess(node: FreeImageNodeRuntime, latencyMs: number) {
  node.successCount += 1;
  node.cooldownUntil = 0;
  node.lastError = undefined;
  node.lastLatencyMs = latencyMs;
}

function markNodeFailure(node: FreeImageNodeRuntime, reason: string, cooldownMs = 90_000) {
  node.failCount += 1;
  node.lastError = reason.slice(0, 140);
  node.cooldownUntil = Date.now() + cooldownMs;
}

function dimensionsForAspect(aspectRatio: ImageAspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '16:9':
      return { width: 1024, height: 576 };
    case '4:3':
      return { width: 960, height: 720 };
    case '3:4':
      return { width: 768, height: 1024 };
    default:
      return { width: 896, height: 896 };
  }
}

function readFreeCreds() {
  let cfToken = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
  let cfAccount = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  let hfToken = (process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || '').trim();
  let zhipuKey = (process.env.ZHIPU_API_KEY || '').trim();

  try {
    const cf = oneAiDb.getProviderWithCreds('workers_ai');
    if (cf?.hasApiKey && cf.apiKey) cfToken = cf.apiKey;
    if (cf?.accountId) cfAccount = cf.accountId;

    const hf = oneAiDb.getProviderWithCreds('huggingface');
    if (hf?.hasApiKey && hf.apiKey) hfToken = hf.apiKey;

    const zp = oneAiDb.getProviderWithCreds('zhipu');
    if (zp?.hasApiKey && zp.apiKey) zhipuKey = zp.apiKey;
  } catch {
    // ignore before db ready
  }

  return { cfToken, cfAccount, hfToken, zhipuKey };
}

export function getFreeImagePoolStatus() {
  const creds = readFreeCreds();
  const now = Date.now();
  const defs: Array<{ id: string; labelZh: string; kind: FreeImageNodeRuntime['kind']; configured: boolean; quotaNote: string }> = [
    {
      id: 'workers_ai_flux',
      labelZh: 'Cloudflare Workers AI · FLUX 免费池',
      kind: 'workers_ai',
      configured: Boolean(creds.cfToken && creds.cfAccount),
      quotaNote: '10,000 Neurons/天 免费额度',
    },
    {
      id: 'zhipu_cogview_flash',
      labelZh: '智谱 CogView-3-Flash 官方免费池',
      kind: 'zhipu_free',
      configured: Boolean(creds.zhipuKey),
      quotaNote: '官方长期免费图像生成模型',
    },
    {
      id: 'huggingface_flux',
      labelZh: 'Hugging Face · FLUX/SDXL 免费推理池',
      kind: 'huggingface',
      configured: Boolean(creds.hfToken),
      quotaNote: 'Hugging Face 免费推理额度',
    },
    {
      id: 'pollinations_flux',
      labelZh: 'Pollinations · FLUX 零门槛免费扩散池',
      kind: 'pollinations',
      configured: true,
      quotaNote: '免密钥共享免费图像池（自动换源）',
    },
    {
      id: 'pollinations_turbo',
      labelZh: 'Pollinations · Turbo 极速免费扩散池',
      kind: 'pollinations',
      configured: true,
      quotaNote: '免密钥极速出图备用池',
    },
    {
      id: 'free_llm_art_composer',
      labelZh: 'ONE AI 免费文本额度重组·矢量画室',
      kind: 'free_llm_composer',
      configured: true,
      quotaNote: '自动聚合 Gemini/Groq/Cerebras/智谱/Kilo 免费文本额度转化为精美插画',
    },
  ];

  return defs.map((d) => {
    const rt = getRuntime(d.id, d.labelZh, d.kind);
    return {
      id: d.id,
      labelZh: d.labelZh,
      kind: d.kind,
      configured: d.configured,
      quotaNote: d.quotaNote,
      status: !d.configured ? 'unconfigured' : rt.cooldownUntil > now ? 'cooldown' : 'ready',
      cooldownRemainingSec: rt.cooldownUntil > now ? Math.ceil((rt.cooldownUntil - now) / 1000) : 0,
      successCount: rt.successCount,
      failCount: rt.failCount,
      lastLatencyMs: rt.lastLatencyMs || null,
      lastError: rt.lastError || null,
    };
  });
}

/**
 * Stage 1: Recompose available free-tier LLM quotas to direct the visual scene
 * (supports both standalone prompts AND conversational/roleplay dialogue illustrations).
 */
async function directVisualPromptFromFreePool(params: {
  rawPrompt: string;
  mode: ImageGenMode;
  dialogueContext?: string;
  style?: string;
}): Promise<{ enhancedPrompt: string; captionZh: string; directorLabelZh: string }> {
  const clean = params.rawPrompt.trim();
  const styleHint = params.style?.trim() ? `Visual style preference: ${params.style.trim()}.` : '';
  const dialogueHint =
    params.mode === 'dialogue_scene' && params.dialogueContext?.trim()
      ? `Recent conversation / roleplay scene context:\n${params.dialogueContext.trim().slice(0, 600)}\nTurn this conversational moment into a vivid, warm visual scene.`
      : '';

  const systemInstruction =
    'You are a visual art director. Convert the user request (and optional dialogue context) into a rich, vivid English image generation prompt (under 65 words: subject, setting, natural lighting, lens/art style, color palette, zero text overlays/watermarks) AND a poetic concise Chinese caption (8–22 Chinese characters). Return strict JSON with keys "enhancedPrompt" and "captionZh".';
  const userContent = `${dialogueHint}\nUser request: "${clean}"\n${styleHint}`.trim();

  // Try ONE AI Free Router first (Groq / Cerebras / Gemini / Zhipu / Kilo free pool)
  try {
    const routed = await oneAiRouter.executeUnifiedTurn({
      requestId: `img_dir_${Date.now()}`,
      userId: null,
      subjectKey: 'free_image_director',
      userTier: 'free',
      prompt: userContent,
      messages: [
        { role: 'system', content: `${systemInstruction}\nOutput raw JSON only.` },
        { role: 'user', content: userContent },
      ],
      mode: 'creative',
      requiresStructuredOutput: true,
      maxTokens: 320,
      stream: false,
    });
    if (routed.success && routed.content.trim()) {
      const cleaned = routed.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const s = cleaned.indexOf('{');
      const e = cleaned.lastIndexOf('}');
      if (s >= 0 && e > s) {
        const parsed = JSON.parse(cleaned.slice(s, e + 1));
        if (parsed?.enhancedPrompt) {
          return {
            enhancedPrompt: String(parsed.enhancedPrompt).trim(),
            captionZh: String(parsed.captionZh || clean.slice(0, 22)).trim(),
            directorLabelZh: `免费路由池 (${routed.selectedProviderId || 'ONE AI'})`,
          };
        }
      }
    }
  } catch {
    // fall through to Gemini free tier
  }

  // Try Gemini 4 Hydrogen Free Tier
  const ai = getGeminiClient();
  if (ai) {
    try {
      const res = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: userContent,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              enhancedPrompt: { type: Type.STRING },
              captionZh: { type: Type.STRING },
            },
            required: ['enhancedPrompt', 'captionZh'],
          },
        },
      });
      const parsed = JSON.parse((res.text ?? '{}').trim());
      if (parsed?.enhancedPrompt) {
        return {
          enhancedPrompt: String(parsed.enhancedPrompt).trim(),
          captionZh: String(parsed.captionZh || clean.slice(0, 22)).trim(),
          directorLabelZh: 'Gemini 免费额度编导',
        };
      }
    } catch {
      // fall through
    }
  }

  return {
    enhancedPrompt: `${clean}${params.style ? `, ${params.style}` : ''}, cinematic natural lighting, highly detailed, fine art composition, atmospheric depth, no text`,
    captionZh: clean.slice(0, 24),
    directorLabelZh: '本地智能提示词重组',
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function tryWorkersAiImage(
  enhancedPrompt: string,
  creds: { cfToken: string; cfAccount: string }
): Promise<{ dataUrl: string; mimeType: string } | null> {
  if (!creds.cfToken || !creds.cfAccount) return null;
  const models = ['@cf/black-forest-labs/flux-1-schnell', '@cf/stabilityai/stable-diffusion-xl-base-1.0'];
  for (const model of models) {
    try {
      const res = await fetchWithTimeout(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(creds.cfAccount)}/ai/run/${model}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${creds.cfToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prompt: enhancedPrompt, num_steps: 4 }),
        },
        16_000
      );
      if (!res.ok) continue;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('application/json')) {
        const json = await res.json().catch(() => null);
        const b64 = json?.result?.image;
        if (typeof b64 === 'string' && b64.length > 500) {
          return { dataUrl: `data:image/jpeg;base64,${b64}`, mimeType: 'image/jpeg' };
        }
      } else if (ct.startsWith('image/')) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 2000) {
          const mime = ct.split(';')[0].trim() || 'image/png';
          return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, mimeType: mime };
        }
      }
    } catch {
      // try next free CF model
    }
  }
  return null;
}

async function tryZhipuFreeCogView(
  enhancedPrompt: string,
  zhipuKey: string,
  aspectRatio: ImageAspectRatio
): Promise<{ dataUrl: string; mimeType: string } | null> {
  if (!zhipuKey) return null;
  const size =
    aspectRatio === '16:9'
      ? '1344x768'
      : aspectRatio === '3:4'
        ? '768x1344'
        : aspectRatio === '4:3'
          ? '1152x864'
          : '1024x1024';
  try {
    const res = await fetchWithTimeout(
      'https://open.bigmodel.cn/api/paas/v4/images/generations',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${zhipuKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'cogview-3-flash',
          prompt: enhancedPrompt,
          size,
        }),
      },
      18_000
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const imgUrl = data?.data?.[0]?.url;
    if (!imgUrl) return null;
    const imgRes = await fetchWithTimeout(imgUrl, { method: 'GET' }, 12_000);
    if (!imgRes.ok) return null;
    const buf = Buffer.from(await imgRes.arrayBuffer());
    if (buf.length < 2000) return null;
    const mime = (imgRes.headers.get('content-type') || 'image/png').split(';')[0].trim();
    return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, mimeType: mime };
  } catch {
    return null;
  }
}

async function tryHuggingFaceFreeImage(
  enhancedPrompt: string,
  hfToken: string
): Promise<{ dataUrl: string; mimeType: string } | null> {
  if (!hfToken) return null;
  const models = ['black-forest-labs/FLUX.1-schnell', 'stabilityai/stable-diffusion-xl-base-1.0'];
  for (const model of models) {
    try {
      const res = await fetchWithTimeout(
        `https://router.huggingface.co/hf-inference/models/${model}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${hfToken}`,
            'Content-Type': 'application/json',
            Accept: 'image/jpeg',
          },
          body: JSON.stringify({ inputs: enhancedPrompt }),
        },
        18_000
      );
      if (!res.ok) continue;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (!ct.startsWith('image/')) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 2000) {
        const mime = ct.split(';')[0].trim() || 'image/jpeg';
        return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, mimeType: mime };
      }
    } catch {
      // try next HF free model
    }
  }
  return null;
}

async function tryPollinationsNode(
  enhancedPrompt: string,
  width: number,
  height: number,
  modelName: 'flux' | 'turbo'
): Promise<{ dataUrl: string; mimeType: string } | null> {
  const seed = Math.floor(Math.random() * 999999) + 1;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    enhancedPrompt
  )}?model=${modelName}&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=true`;

  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'EarthOne/1.0',
          Accept: 'image/jpeg,image/png,image/webp,*/*',
        },
      },
      14_000
    );
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2400) return null;
    const mimeType = ct.split(';')[0].trim() || 'image/jpeg';
    return {
      dataUrl: `data:${mimeType};base64,${buf.toString('base64')}`,
      mimeType,
    };
  } catch {
    return null;
  }
}

function sanitizeSvgMarkup(rawSvg: string, width: number, height: number): string | null {
  const start = rawSvg.indexOf('<svg');
  const end = rawSvg.lastIndexOf('</svg>');
  if (start < 0 || end < 0 || end <= start) return null;
  let svg = rawSvg.slice(start, end + 6);
  svg = svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
  if (!/xmlns=/.test(svg)) {
    svg = svg.replace('<svg', `<svg xmlns="http://www.w3.org/2000/svg"`);
  }
  if (!/viewBox=/i.test(svg)) {
    svg = svg.replace('<svg', `<svg viewBox="0 0 ${width} ${height}"`);
  }
  return svg;
}

/**
 * Recompose ANY available free text-LLM quota (Gemini 4 Hydrogen / Groq / Cerebras / Zhipu / Kilo)
 * into a rich, multi-layered SVG artwork whenever raster diffusion quotas are exhausted or unavailable.
 */
async function composeArtworkFromFreeTextPool(
  rawPrompt: string,
  enhancedPrompt: string,
  width: number,
  height: number
): Promise<{ svg: string; providerName: string } | null> {
  const systemPrompt = `You are a master editorial digital illustrator creating a gallery-grade layered SVG artwork (viewBox="0 0 ${width} ${height}").
Output ONLY a single clean <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">...</svg>.
Artcraft rules:
- Build rich atmospheric depth: multi-stop <linearGradient> and <radialGradient> skies/lighting, soft <feGaussianBlur> glow layers, distinct background/midground/foreground silhouettes, recognizable expressive subjects (characters, animals, cafes, architecture, botanicals, reflections, starry skies, etc.), and cohesive editorial color harmony.
- NEVER include <script>, external URLs, or text watermarks. Keep SVG clean and complete under 9500 chars.`;

  const userPrompt = `Illustrate: "${rawPrompt}"\nArt direction: ${enhancedPrompt}`;

  // 1. Try Gemini 4 Hydrogen Free Tier
  const ai = getGeminiClient();
  if (ai) {
    try {
      const res = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: userPrompt,
        config: { systemInstruction: systemPrompt },
      });
      const svg = sanitizeSvgMarkup(res.text ?? '', width, height);
      if (svg) return { svg, providerName: 'Gemini 免费额度·矢量画室' };
    } catch {
      // fall through to ONE AI free router pool
    }
  }

  // 2. Dynamically rotate across ONE AI Free Text Pool (Groq / Cerebras / Zhipu / Kilo / OpenRouter:free)
  try {
    const routed = await oneAiRouter.executeUnifiedTurn({
      requestId: `free_art_${Date.now()}`,
      userId: null,
      subjectKey: 'free_image_composer',
      userTier: 'free',
      prompt: userPrompt,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      mode: 'creative',
      maxTokens: 2800,
      stream: false,
    });
    if (routed.success && routed.content) {
      const svg = sanitizeSvgMarkup(routed.content, width, height);
      if (svg) {
        return {
          svg,
          providerName: `免费池重组 (${routed.selectedProviderId || 'ONE AI'})·矢量画室`,
        };
      }
    }
  } catch {
    // ignore
  }

  return null;
}

export async function generateAiImage(params: {
  prompt: string;
  mode?: ImageGenMode;
  dialogueContext?: string;
  style?: string;
  aspectRatio?: ImageAspectRatio;
}): Promise<GeneratedImageResult> {
  const cleanPrompt = params.prompt.trim();
  if (!cleanPrompt) {
    throw new Error('请描述你想要生成的图片或对话画面内容。');
  }

  const mode: ImageGenMode = params.mode === 'dialogue_scene' ? 'dialogue_scene' : 'standalone';
  const aspectRatio: ImageAspectRatio =
    params.aspectRatio === '16:9' || params.aspectRatio === '4:3' || params.aspectRatio === '3:4'
      ? params.aspectRatio
      : '4:3';
  const { width, height } = dimensionsForAspect(aspectRatio);

  // Stage 1: Use free-tier LLM pool to craft art-directed visual prompt
  const { enhancedPrompt, captionZh, directorLabelZh } = await directVisualPromptFromFreePool({
    rawPrompt: cleanPrompt,
    mode,
    dialogueContext: params.dialogueContext,
    style: params.style,
  });

  // Stage 2: Dynamically assemble & rotate across ALL active free-tier image nodes
  const creds = readFreeCreds();
  const now = Date.now();
  const chainAttempted: string[] = [];
  let failoverCount = 0;

  type Candidate = {
    runtime: FreeImageNodeRuntime;
    run: () => Promise<{ dataUrl: string; mimeType: string; overrideLabel?: string } | null>;
  };

  const candidates: Candidate[] = [];

  if (creds.cfToken && creds.cfAccount) {
    const rt = getRuntime('workers_ai_flux', 'Cloudflare Workers AI · FLUX 免费池', 'workers_ai');
    if (rt.cooldownUntil <= now) {
      candidates.push({
        runtime: rt,
        run: () => tryWorkersAiImage(enhancedPrompt, creds),
      });
    }
  }

  if (creds.zhipuKey) {
    const rt = getRuntime('zhipu_cogview_flash', '智谱 CogView-3-Flash 官方免费池', 'zhipu_free');
    if (rt.cooldownUntil <= now) {
      candidates.push({
        runtime: rt,
        run: () => tryZhipuFreeCogView(enhancedPrompt, creds.zhipuKey, aspectRatio),
      });
    }
  }

  if (creds.hfToken) {
    const rt = getRuntime('huggingface_flux', 'Hugging Face · FLUX 免费推理池', 'huggingface');
    if (rt.cooldownUntil <= now) {
      candidates.push({
        runtime: rt,
        run: () => tryHuggingFaceFreeImage(enhancedPrompt, creds.hfToken),
      });
    }
  }

  const pollFlux = getRuntime('pollinations_flux', 'Pollinations · FLUX 免费扩散池', 'pollinations');
  if (pollFlux.cooldownUntil <= now) {
    candidates.push({
      runtime: pollFlux,
      run: () => tryPollinationsNode(enhancedPrompt, width, height, 'flux'),
    });
  }

  const pollTurbo = getRuntime('pollinations_turbo', 'Pollinations · Turbo 极速免费池', 'pollinations');
  if (pollTurbo.cooldownUntil <= now) {
    candidates.push({
      runtime: pollTurbo,
      run: () => tryPollinationsNode(enhancedPrompt, width, height, 'turbo'),
    });
  }

  // Always include Free-LLM Art Composer as dynamic quota-recomposition backbone
  const composerRt = getRuntime('free_llm_art_composer', 'ONE AI 免费文本额度重组·矢量画室', 'free_llm_composer');
  candidates.push({
    runtime: composerRt,
    run: async () => {
      const composed = await composeArtworkFromFreeTextPool(cleanPrompt, enhancedPrompt, width, height);
      if (!composed) return null;
      return {
        dataUrl: `data:image/svg+xml;base64,${Buffer.from(composed.svg, 'utf8').toString('base64')}`,
        mimeType: 'image/svg+xml',
        overrideLabel: composed.providerName,
      };
    },
  });

  for (const cand of candidates) {
    chainAttempted.push(cand.runtime.labelZh);
    const t0 = Date.now();
    try {
      const out = await cand.run();
      if (out?.dataUrl) {
        markNodeSuccess(cand.runtime, Date.now() - t0);
        return {
          imageUrl: out.dataUrl,
          mimeType: out.mimeType,
          prompt: cleanPrompt,
          enhancedPrompt,
          captionZh,
          aspectRatio,
          mode,
          engine: cand.runtime.id,
          providerLabelZh: out.overrideLabel || cand.runtime.labelZh,
          promptDirectorLabelZh: directorLabelZh,
          freePoolChain: chainAttempted,
          failoverCount,
          createdAt: new Date().toISOString(),
        };
      }
      failoverCount += 1;
      markNodeFailure(cand.runtime, 'Empty or busy response', 75_000);
    } catch (err: any) {
      failoverCount += 1;
      markNodeFailure(cand.runtime, String(err?.message || 'Timeout'), 75_000);
    }
  }

  throw new Error('所有免费图像与文本重组节点当前均繁忙，请稍后重试或在 ONE AI 中枢检查免费节点状态。');
}
