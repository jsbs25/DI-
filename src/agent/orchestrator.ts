import { resolveCapabilityFromIntent, getCapabilityByTab } from './capabilities';
import type { DispatchResult } from './types';

export interface OrchestratorInput {
  text: string;
  lang: string;
}

export function orchestrate(input: OrchestratorInput): DispatchResult {
  const raw = (input.text || '').trim();
  const isEn = input.lang === 'en';
  if (!raw) return { handled: false, responseText: isEn ? 'Tell me what you need.' : '告诉我你想做什么。' };

  const cap = resolveCapabilityFromIntent(raw);
  if (cap) {
    const isComms = cap.workspaceMode === 'communication' || cap.tab === 'chat';
    const name = isEn ? cap.nameEn : cap.nameZh;
    const responseText = isComms
      ? (isEn ? `Opening ${name}. I'll rest in the pavilion while you communicate.` : `好的，已为你打开${name}。通信期间我会在亭子里休息。`)
      : (isEn ? `Understood. I'll go to the pavilion and prepare ${name} for you.` : `收到，我去亭子里为你调度「${name}」并准备工作空间。`);
    return { handled: true, capability: cap, responseText, openTab: cap.tab };
  }

  // General intent: stay in garden, engage and prepare a general workspace (no forced navigation away)
  return {
    handled: true,
    capability: undefined,
    responseText: isEn
      ? 'I understand. I’ll think it through in the pavilion and help you step by step — tell me a bit more if needed.'
      : '我明白了。我会在亭子里为你梳理思路并一步步协助——如果需要，你可以再补充一点细节。',
  };
}
