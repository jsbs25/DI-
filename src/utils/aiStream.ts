export interface AIStreamResult {
  tokens?: number;
  model?: string;
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
    return { tokens: data.tokens, model: data.model };
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
      result = { tokens: chunk.tokens, model: chunk.model };
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
