# EARTH ONE - AI HUB ARCHITECTURE & GATEWAY

## 1. Vision & Architecture

The EARTH ONE AI HUB provides a unified gateway integrating advanced AI models (Google Gemini 2.5 Flash, Gemini 2.5 Pro, and open models) to provide:
1. **Real-Time Cross-Language Chat Translation**: Automatic bidirectional translation in instant messaging so users across China, USA, Jordan, Saudi Arabia, France, Spain, and Russia can communicate seamlessly while having 1-click access to the original text.
2. **AI Multimodal Assistant**: Global knowledge base for international geography, history, cultural norms, and coding.
3. **AI Creator Assistant**: Long-form article summarization, headline polishing, multilingual translation, and creative writing prompts.
4. **AI Language Tutor**: Interactive conversation practice in English, Mandarin, Arabic, Spanish, French, or Russian.

## 2. API Gateway Pattern

```
[ Client Request ]
       │
       ▼
[ /api/ai/chat /translate /summarize ] (Server-side Proxy)
       │
       ├─► Check Quotas & Rate Limits
       ├─► Inject System Grounding & Prompt Directives
       ├─► Call Google GenAI SDK (@google/genai)
       └─► Fallback to Secondary Resilient Providers if needed
       │
       ▼
[ Client Response with Token & Quota Metrics ]
```

## 3. Supported Model Identifiers
- `gemini-2.5-flash`: Fast response, ideal for live chat translation and quick answers (Default).
- `gemini-2.5-pro`: Deep reasoning, ideal for long article analysis and creative writing.
- `earth-polyglot-translator`: Specialized translation engine with cultural nuance preservation.

## 4. OpenAI-Compatible Provider (vLLM / Ollama)

The custom model entry uses the OpenAI Chat Completions contract and is implemented in
`server/ai/providers/openAICompatibleProvider.ts`. It accepts a base URL, model name and
optional bearer token, then normalizes common forms such as `http://localhost:11434/v1`,
`http://localhost:8000/v1`, or a full `/chat/completions` endpoint.

Typical local configurations are:

```text
Ollama: http://localhost:11434/v1   model: llama3.2
vLLM:   http://localhost:8000/v1    model: meta-llama/Llama-3.1-8B-Instruct
```

The provider applies a request timeout, parses standard `choices[0].message.content` and
`usage.total_tokens`, and returns actionable errors for invalid URLs, timeouts, authentication
failures, empty responses, and unavailable local services. A local regression test is available
with `npm run test:ai-provider`.
