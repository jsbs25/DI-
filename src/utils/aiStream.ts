export interface AIRecalledMemorySummary {
  id: string;
  category: string;
  summary: string;
}

export interface AIStreamResult {
  tokens?: number;
  model?: string;
  sessionId?: string;
  intent?: string;
  recalledMemories?: AIRecalledMemorySummary[];
  savedMemories?: Array<{ action: string; summary: string }>;
}

export async function readAIStream(
  response: Response,
  onDelta: (delta: string) => void
): Promise<AIStreamResult> {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `AI request failed (${response.status}).`);
  }

  if (response.headers.get('content-type')?.includes('application/json')) {
    const data = await response.json();
    if (!data.success || typeof data.reply !== 'string') {
      throw new Error(data.error || 'AI returned an invalid response.');
    }
    onDelta(data.reply);
    return {
      tokens: data.tokens,
      model: data.model,
      sessionId: typeof data.sessionId === 'string' ? data.sessionId : undefined,
      intent: typeof data.intent === 'string' ? data.intent : undefined,
      recalledMemories: Array.isArray(data.recalledMemories) ? data.recalledMemories : undefined,
      savedMemories: Array.isArray(data.savedMemories) ? data.savedMemories : undefined,
    };
  }

  if (!response.body) throw new Error('AI stream response body is unavailable.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  let result: AIStreamResult = {};

  const processLine = (line: string) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line);
    if (chunk.error) throw new Error(String(chunk.error));
    if (typeof chunk.delta === 'string') onDelta(chunk.delta);
    if (chunk.done) {
      completed = true;
      result = {
        tokens: chunk.tokens,
        model: chunk.model,
        sessionId: typeof chunk.sessionId === 'string' ? chunk.sessionId : undefined,
        intent: typeof chunk.intent === 'string' ? chunk.intent : undefined,
        recalledMemories: Array.isArray(chunk.recalledMemories) ? chunk.recalledMemories : undefined,
        savedMemories: Array.isArray(chunk.savedMemories) ? chunk.savedMemories : undefined,
      };
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) processLine(line);
    if (done) break;
  }
  if (buffer.trim()) processLine(buffer);
  if (!completed) throw new Error('AI stream ended before completion.');
  return result;
}
