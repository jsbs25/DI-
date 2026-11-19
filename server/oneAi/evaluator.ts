import type { EvaluationRunRecord } from './types.ts';
import { oneAiDb } from './db.ts';
import { getProviderAdapter } from './providers.ts';

interface BenchmarkCase {
  id: string;
  dimension: 'reasoning' | 'coding' | 'json' | 'multilingual';
  prompt: string;
  verify: (output: string) => boolean;
}

const GOLDEN_SUITE_VERSION = 'one-eval-v1.0';

const BENCHMARK_CASES: BenchmarkCase[] = [
  {
    id: 'reason_math_logic',
    dimension: 'reasoning',
    prompt: 'A train leaves at 09:15 traveling 120 km/h. Another leaves 45 minutes later at 150 km/h on a parallel track. In how many minutes after the second train departs will it catch up? Reply with ONLY the integer number of minutes.',
    verify: (out) => /\b180\b/.test(out),
  },
  {
    id: 'reason_anti_hallucination',
    dimension: 'reasoning',
    prompt: 'Is there any verified factual proof in the prompt I just gave you about what color my shirt is? Answer strictly "NO" if unknown.',
    verify: (out) => /\bno\b|不知道|无法判断|没有/i.test(out),
  },
  {
    id: 'code_ts_debounce',
    dimension: 'coding',
    prompt: 'Write a concise TypeScript function `clamp(val: number, min: number, max: number): number` that returns Math.min(Math.max(val, min), max). Return only code.',
    verify: (out) => /(?:function|const)\s+clamp|\bclamp\s*[:=]/.test(out) && /Math\.min/.test(out) && /Math\.max/.test(out),
  },
  {
    id: 'json_strict_schema',
    dimension: 'json',
    prompt: 'Return ONLY valid raw JSON (no markdown fences) matching {"city":"Beijing","countryCode":"CN","populationMillions":21.8}.',
    verify: (out) => {
      const cleaned = out.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      try {
        const parsed = JSON.parse(cleaned);
        return parsed?.city === 'Beijing' && parsed?.countryCode === 'CN' && typeof parsed?.populationMillions === 'number';
      } catch {
        return false;
      }
    },
  },
  {
    id: 'multi_zh_ar_en',
    dimension: 'multilingual',
    prompt: 'Translate "知识连接世界" into both English and Arabic on two lines.',
    verify: (out) => /(knowledge|connect)/i.test(out) && /[\u0600-\u06FF]{4,}/.test(out),
  },
];

export async function runObjectiveBenchmark(endpointId: string): Promise<EvaluationRunRecord> {
  const endpoint = oneAiDb.getEndpoint(endpointId);
  if (!endpoint) throw new Error('Endpoint not found');
  const provider = oneAiDb.getProviderWithCreds(endpoint.providerId);
  if (!provider) throw new Error('Provider not found');
  if (!provider.hasApiKey && !(provider.id === 'kilo' && endpoint.isFreeTier)) {
    throw new Error(`Provider ${provider.name} 尚未配置 API Key，无法执行实测评测`);
  }

  const adapter = getProviderAdapter(provider.adapterType);
  const results: Array<{ id: string; dimension: string; passed: boolean; ttftMs: number; sample: string; error?: string }> = [];

  for (const tc of BENCHMARK_CASES) {
    const start = Date.now();
    let ttftMs = 0;
    let output = '';
    let errMsg: string | undefined;

    for await (const chunk of adapter.invokeChat(
      {
        requestId: `eval_${tc.id}_${Date.now()}`,
        endpointId: endpoint.endpointId,
        upstreamModelId: endpoint.upstreamModelId,
        baseUrl: provider.baseUrl,
        messages: [{ role: 'user', content: tc.prompt }],
        temperature: 0.1,
        maxTokens: 320,
        stream: true,
        privacyMode: 'standard',
        timeoutMs: 18_000,
        firstByteTimeoutMs: 10_000,
      },
      { apiKey: provider.apiKey, accountId: provider.accountId }
    )) {
      if (chunk.type === 'delta' && chunk.textDelta) {
        if (!ttftMs) ttftMs = Date.now() - start;
        output += chunk.textDelta;
      } else if (chunk.type === 'error' && chunk.error) {
        errMsg = `${chunk.error.category}: ${chunk.error.rawMessage}`;
      }
    }

    const passed = !errMsg && tc.verify(output);
    results.push({
      id: tc.id,
      dimension: tc.dimension,
      passed,
      ttftMs: ttftMs || Date.now() - start,
      sample: output.slice(0, 140),
      error: errMsg,
    });
  }

  const dimScore = (dim: BenchmarkCase['dimension']) => {
    const sub = results.filter((r) => r.dimension === dim);
    if (!sub.length) return 0;
    return Math.round((sub.filter((r) => r.passed).length / sub.length) * 100);
  };

  const passedCases = results.filter((r) => r.passed).length;
  const overallScore = Math.round((passedCases / BENCHMARK_CASES.length) * 100);
  const avgTtftMs = Math.round(results.reduce((a, b) => a + b.ttftMs, 0) / Math.max(1, results.length));

  const record: EvaluationRunRecord = {
    id: `eval_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    endpointId,
    suiteVersion: GOLDEN_SUITE_VERSION,
    overallScore,
    codingScore: dimScore('coding'),
    reasoningScore: dimScore('reasoning'),
    jsonSchemaScore: dimScore('json'),
    multilingualScore: dimScore('multilingual'),
    avgTtftMs,
    passedCases,
    totalCases: BENCHMARK_CASES.length,
    runAt: new Date().toISOString(),
    reportJson: JSON.stringify(results),
  };

  oneAiDb.recordEvaluation(record);
  oneAiDb.updateEndpointQualityScore(
    endpointId,
    Math.max(35, overallScore),
    endpoint.approvalStatus === 'approved' ? undefined : 'evaluated'
  );
  if (passedCases > 0) {
    oneAiDb.recordEndpointTelemetry(endpointId, { ok: true, ttftMs: avgTtftMs });
  }

  return record;
}
