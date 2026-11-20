import type { AgentState, Emotion } from './types';

export interface LifeTick {
  state: AgentState;
  emotion: Emotion;
  behaviorId: string;
  statusTextZh: string;
  statusTextEn: string;
  position: { x: number; y: number; facing: 'left' | 'right' };
  durationMs: number;
}

interface BehaviorDef {
  id: string;
  zh: string;
  en: string;
  durationMs: [number, number];
  x: [number, number];
  y: [number, number];
  emotion: Emotion;
}

const AUTONOMOUS: BehaviorDef[] = [
  { id: 'stroll-garden', zh: '在花园里悠闲散步', en: 'Strolling through the garden', durationMs: [5000, 9000], x: [12, 82], y: [58, 78], emotion: 'neutral' },
  { id: 'stroll-path', zh: '沿着小路慢慢走着', en: 'Walking along the path', durationMs: [4500, 8000], x: [38, 58], y: [54, 68], emotion: 'neutral' },
  { id: 'pavilion-rest', zh: '在亭子里安静休息', en: 'Resting quietly in the pavilion', durationMs: [6000, 11000], x: [46, 52], y: [40, 46], emotion: 'neutral' },
  { id: 'pond-fish', zh: '在池塘边静静钓鱼', en: 'Fishing by the pond', durationMs: [7000, 13000], x: [64, 80], y: [60, 72], emotion: 'focused' },
  { id: 'watch-butterfly', zh: '蹲下来观察蝴蝶', en: 'Watching butterflies', durationMs: [4000, 7000], x: [18, 36], y: [46, 62], emotion: 'curious' },
  { id: 'sakura-play', zh: '在樱花树下开心玩耍', en: 'Playing under the cherry blossoms', durationMs: [4500, 8000], x: [6, 22], y: [44, 56], emotion: 'happy' },
  { id: 'cat-interact', zh: '和小猫温柔互动', en: 'Playing gently with the kitten', durationMs: [4000, 7500], x: [26, 48], y: [58, 72], emotion: 'happy' },
  { id: 'listen-birds', zh: '抬头听小鸟歌唱', en: 'Listening to birdsong', durationMs: [4000, 7000], x: [30, 55], y: [50, 64], emotion: 'curious' },
  { id: 'bridge-view', zh: '在石桥上看水面波光', en: 'Watching ripples from the stone bridge', durationMs: [5000, 8500], x: [60, 72], y: [54, 62], emotion: 'neutral' },
  { id: 'tired-back', zh: '走累了回亭子休息', en: 'Heading back to the pavilion to rest', durationMs: [5000, 9000], x: [47, 51], y: [40, 46], emotion: 'neutral' },
];

function rand(min: number, max: number) { return Math.floor(min + Math.random() * (max - min + 1)); }
function pick(arr: BehaviorDef[], avoidId?: string): BehaviorDef {
  if (arr.length <= 1) return arr[0];
  let c = arr[Math.floor(Math.random() * arr.length)];
  let g = 0;
  while (avoidId && c.id === avoidId && g++ < 12) c = arr[Math.floor(Math.random() * arr.length)];
  return c;
}

export function nextAutonomousTick(prev?: LifeTick): LifeTick {
  const b = pick(AUTONOMOUS, prev?.behaviorId);
  const x = rand(b.x[0], b.x[1]);
  const y = rand(b.y[0], b.y[1]);
  const prevX = prev?.position.x ?? 50;
  return {
    state: 'Autonomous',
    emotion: b.emotion,
    behaviorId: b.id,
    statusTextZh: b.zh,
    statusTextEn: b.en,
    position: { x, y, facing: x < prevX ? 'left' : 'right' },
    durationMs: rand(b.durationMs[0], b.durationMs[1]),
  };
}

export function summonedTick(from?: { x: number; y: number }): LifeTick {
  return { state: 'Summoned', emotion: 'happy', behaviorId: 'summoned', statusTextZh: '听到呼唤，开心地跑来…', statusTextEn: 'Heard you! Happily running over…', position: { x: 50, y: 72, facing: (from?.x ?? 50) <= 50 ? 'right' : 'left' }, durationMs: 2200 };
}
export function engagedTick(): LifeTick {
  return { state: 'Engaged', emotion: 'happy', behaviorId: 'engaged', statusTextZh: '我在这儿，想做什么？', statusTextEn: 'I’m here — what would you like to do?', position: { x: 50, y: 74, facing: 'right' }, durationMs: 999999 };
}
export function taskingTick(labelZh: string, labelEn?: string): LifeTick {
  const en = labelEn ?? labelZh;
  return {
    state: 'Tasking', emotion: 'focused', behaviorId: 'tasking',
    statusTextZh: `正在亭中处理：${labelZh}`,
    statusTextEn: `Working in the pavilion: ${en}`,
    position: { x: 49, y: 42, facing: 'right' }, durationMs: 999999,
  };
}
export function deliverTick(labelZh?: string, labelEn?: string): LifeTick {
  const en = labelEn ?? labelZh;
  return {
    state: 'Deliver', emotion: 'celebrating', behaviorId: 'deliver',
    statusTextZh: labelZh ? `「${labelZh}」已准备好，要现在开始吗？` : '准备好了，要现在开始吗？',
    statusTextEn: en ? `"${en}" is ready. Want to start now?` : 'All ready. Want to start now?',
    position: { x: 50, y: 66, facing: 'right' }, durationMs: 999999,
  };
}
export function restingTick(): LifeTick {
  return { state: 'Resting', emotion: 'neutral', behaviorId: 'resting', statusTextZh: '通信中，小小在亭子里休息', statusTextEn: 'Resting in the pavilion during communication', position: { x: 49, y: 42, facing: 'left' }, durationMs: 999999 };
}
