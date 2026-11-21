import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { oneAiDb } from './oneAi/db.ts';

dotenv.config();

let cachedClient: GoogleGenAI | null = null;
let cachedLiveClient: GoogleGenAI | null = null;
let cachedKey = '';

export function getGeminiApiKey(): string {
  const envKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  if (envKey && envKey !== 'MY_GEMINI_API_KEY') {
    return envKey;
  }
  try {
    const dbCreds = oneAiDb.getProviderWithCreds('gemini');
    const dbKey = (dbCreds?.apiKey || '').trim();
    if (dbKey && dbKey !== 'MY_GEMINI_API_KEY') {
      return dbKey;
    }
  } catch {
    // ignore before db ready
  }
  return '';
}

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = getGeminiApiKey();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!cachedClient || cachedKey !== apiKey) {
    cachedKey = apiKey;
    cachedClient = new GoogleGenAI({
      apiKey,
      apiVersion: 'v1beta',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    cachedLiveClient = cachedClient;
  }
  return cachedClient;
}

export function getGeminiLiveClient(): GoogleGenAI | null {
  const apiKey = getGeminiApiKey();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!cachedLiveClient || cachedKey !== apiKey) {
    getGeminiClient();
  }
  return cachedLiveClient;
}
