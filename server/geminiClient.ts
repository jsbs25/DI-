import { GoogleGenAI } from '@google/genai';

export const GEMINI_TEXT_MODEL = 'gemini-4-hydrogen';
export const GEMINI_FAST_MODEL = 'gemini-3.1-flash-lite';
export const GEMINI_LIVE_MODEL = 'gemini-3.8-live';
export const GEMINI_TTS_MODEL = 'gemini-3.8-flash-lite-tts';

export function hasGeminiApiKey(): boolean {
  return Boolean((process.env.GEMINI_API_KEY || '').trim());
}

export function createGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}
