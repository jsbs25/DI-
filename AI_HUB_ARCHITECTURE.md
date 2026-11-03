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
