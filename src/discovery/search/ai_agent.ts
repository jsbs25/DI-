import { ResourceRecord } from '../types/index.js';

interface SearchIntent {
  planet: string;
  category: string;
  keywords: string[];
  filters?: {
    isFree?: boolean;
    language?: string;
  };
}

export async function analyzeSearchIntent(query: string): Promise<SearchIntent> {
  // In a full implementation, this calls Ollama Qwen3:8B locally.
  // For safety and resource limits, we start with a heuristic fallback
  // that can be later replaced with the real fetch to `http://localhost:11434/api/generate`

  const lowerQuery = query.toLowerCase();

  const intent: SearchIntent = {
    planet: 'jupiter',
    category: 'all',
    keywords: query.split(/\s+/).filter(k => k.length > 0)
  };

  // Basic Heuristic Intent parsing for Earth One Planets
  if (lowerQuery.includes('arabic') || lowerQuery.includes('learn') || lowerQuery.includes('course') || lowerQuery.includes('university')) {
    intent.planet = 'moon'; // Education
  }
  if (lowerQuery.includes('movie') || lowerQuery.includes('film') || lowerQuery.includes('video') || lowerQuery.includes('watch')) {
    intent.planet = 'saturn'; // Movies/Videos
  }
  if (lowerQuery.includes('book') || lowerQuery.includes('read') || lowerQuery.includes('pdf')) {
    intent.planet = 'neptune'; // Digital Library
  }
  if (lowerQuery.includes('music') || lowerQuery.includes('art') || lowerQuery.includes('design') || lowerQuery.includes('audio')) {
    intent.planet = 'venus'; // Art & Music
  }
  if (lowerQuery.includes('software') || lowerQuery.includes('app') || lowerQuery.includes('game') || lowerQuery.includes('download')) {
    intent.planet = 'mars'; // Software & Games
  }
  if (lowerQuery.includes('news') || lowerQuery.includes('data') || lowerQuery.includes('information')) {
    intent.planet = 'mercury'; // News & Information
  }
  if (lowerQuery.includes('ai ') || lowerQuery.includes('artificial intelligence') || lowerQuery.includes('model')) {
    intent.planet = 'sun'; // AI
  }
  if (lowerQuery.includes('open source') || lowerQuery.includes('github') || lowerQuery.includes('code')) {
    intent.planet = 'uranus'; // Tech & Open Source
  }
  if (lowerQuery.includes('shop') || lowerQuery.includes('travel') || lowerQuery.includes('hotel') || lowerQuery.includes('flight')) {
    intent.planet = 'earth'; // Real life & services
  }

  // Filter parsing
  if (lowerQuery.includes('free') || lowerQuery.includes('免费')) {
    intent.filters = { isFree: true };
  }
  if (lowerQuery.includes('arabic') || lowerQuery.includes('阿拉伯语')) {
    intent.filters = { ...intent.filters, language: 'arabic' };
  }

  return intent;
}

export async function summarizeResults(query: string, results: ResourceRecord[]): Promise<string> {
  // To be connected to Ollama Qwen3:8B for natural language summary
  if (results.length === 0) return "I couldn't find any resources matching your query.";
  return `I found ${results.length} resources related to "${query}", primarily on the planet ${results[0]?.planet.toUpperCase()}.`;
}
