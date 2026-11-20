import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Sparkles, Search, X, Leaf, MoonStar, SunMedium, Mic, MicOff, RotateCcw, LayoutGrid } from 'lucide-react';
import type { Language } from '../types/index.ts';
import { CAPABILITIES, capabilityLabel } from '../agent/capabilities';
import { orchestrate } from '../agent/orchestrator';
import { advanceWorkspace, createWorkspace, resumeWorkspace, suspendWorkspace } from '../agent/workspaceEngine';
import {
  deliverTick,
  engagedTick,
  nextAutonomousTick,
  restingTick,
  summonedTick,
  taskingTick,
  type LifeTick,
} from '../agent/lifeEngine';
import type { WorkspaceSession, CapabilityDef } from '../agent/types';

type Props = {
  lang: Language;
  currentTab: string;
  commsActive: boolean;
  onSelectTab: (tab: string) => void;
  immersive?: boolean;
};

type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';
type Weather = 'clear' | 'cloudy' | 'rain' | 'snow';
type Season = 'spring' | 'summer' | 'autumn' | 'winter';
type LogItem = { role: 'user' | 'ai'; text: string; t: number };
type PersistedAgentState = {
  workspace: WorkspaceSession | null;
  suspended: WorkspaceSession[];
  log: LogItem[];
};

const LS_KEY = 'earth-one-living-agent:v1';

function loadPersisted(): PersistedAgentState {
  if (typeof window === 'undefined') return { workspace: null, suspended: [], log: [] };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { workspace: null, suspended: [], log: [] };
    const v = JSON.parse(raw);
    return {
      workspace: v?.workspace ?? null,
      suspended: Array.isArray(v?.suspended) ? v.suspended : [],
      log: Array.isArray(v?.log) ? v.log.slice(-20) : [],
    };
  } catch {
    return { workspace: null, suspended: [], log: [] };
  }
}
function savePersisted(s: PersistedAgentState) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

function useDayPhase(): DayPhase {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const h = now.getHours();
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'dusk';
  return 'night';
}

function getSeason(d: Date): Season {
  const m = d.getMonth(); // 0-11
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

function pickWeather(phase: DayPhase, season: Season): Weather {
  const r = Math.random();
  if (season === 'winter') {
    if (r < 0.18) return 'snow';
    if (r < 0.35) return 'cloudy';
    return 'clear';
  }
  if (season === 'summer') {
    if (r < 0.12 && (phase === 'dusk' || phase === 'night')) return 'rain';
    if (r < 0.28) return 'cloudy';
    return 'clear';
  }
  if (r < 0.12) return 'rain';
  if (r < 0.3) return 'cloudy';
  return 'clear';
}

const SKY: Record<DayPhase, string> = {
  dawn: 'linear-gradient(180deg, #18263f 0%, #3a4a74 30%, #c77962 62%, #f7d9a8 100%)',
  day: 'linear-gradient(180deg, #5ec3ff 0%, #bdeaff 38%, #e9f9e5 70%, #cfeec4 100%)',
  dusk: 'linear-gradient(180deg, #1f2447 0%, #5b3560 35%, #e07852 68%, #ffd7a1 100%)',
  night: 'linear-gradient(180deg, #040712 0%, #09142a 42%, #10223d 72%, #0c1a2b 100%)',
};

const EMOJI: Record<string, string> = {
  happy: '😊', celebrating: '😄', curious: '🧐', thinking: '🤔', focused: '🤔',
  surprised: '😮', comforting: '🥰', neutral: '🙂',
};

function speakLine(text: string, lang: string) {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'en' ? 'en-US' : lang === 'ar' ? 'ar-SA' : 'zh-CN';
    u.rate = 1.02;
    window.speechSynthesis.speak(u);
  } catch {}
}

const GENERAL_CAP: CapabilityDef = {
  id: 'general-workspace',
  tab: 'aihub',
  nameZh: '通用工作空间',
  nameEn: 'General Workspace',
  descriptionZh: '在亭子中为你梳理与执行通用任务',
  descriptionEn: 'General task workspace in the pavilion',
  intents: [],
  workspaceMode: 'general',
  category: 'core',
  preserved: true,
};

function modeLabel(mode: string, isEn: boolean): string {
  const map: Record<string, [string, string]> = {
    learning: ['学习空间', 'Learning Space'],
    reading: ['阅读空间', 'Reading Space'],
    research: ['研究空间', 'Research Space'],
    creation: ['创作空间', 'Creation Space'],
    video: ['影音空间', 'Video Space'],
    music: ['音乐空间', 'Music Space'],
    files: ['文件工作室', 'Files Workspace'],
    communication: ['通信空间', 'Communication'],
    general: ['通用工作空间', 'General Workspace'],
  };
  const m = map[mode] || map.general;
  return isEn ? m[1] : m[0];
}

function seasonLabel(season: Season, isEn: boolean) {
  const map: Record<Season, [string, string]> = { spring: ['春', 'Spring'], summer: ['夏', 'Summer'], autumn: ['秋', 'Autumn'], winter: ['冬', 'Winter'] };
  return isEn ? map[season][1] : map[season][0];
}
function weatherLabel(w: Weather, isEn: boolean) {
  const map: Record<Weather, [string, string]> = { clear: ['晴', 'Clear'], cloudy: ['多云', 'Cloudy'], rain: ['细雨', 'Rain'], snow: ['飘雪', 'Snow'] };
  return isEn ? map[w][1] : map[w][0];
}

export const LivingGarden: React.FC<Props> = ({ lang, currentTab, commsActive, onSelectTab, immersive }) => {
  const isEn = lang === 'en';
  const phase = useDayPhase();
  const isNight = phase === 'night' || phase === 'dusk';
  const season = useMemo(() => getSeason(new Date()), []);
  const [weather, setWeather] = useState<Weather>(() => pickWeather(phase, season));

  // occasionally shift weather (lightweight life)
  useEffect(() => {
    const t = setInterval(() => {
      setWeather(w => (Math.random() < 0.35 ? pickWeather(phase, season) : w));
    }, 90000);
    return () => clearInterval(t);
  }, [phase, season]);

  const persisted = useMemo(() => loadPersisted(), []);
  const [life, setLife] = useState<LifeTick>(() => {
    const ws = persisted.workspace;
    if (ws) {
      if (ws.status === 'completed') return deliverTick(ws.intent || ws.title, ws.intent || ws.title);
      if (ws.status === 'suspended') return restingTick();
      return taskingTick(ws.intent || ws.title, ws.intent || ws.title);
    }
    return nextAutonomousTick();
  });
  const [workspace, setWorkspace] = useState<WorkspaceSession | null>(persisted.workspace);
  const [suspended, setSuspended] = useState<WorkspaceSession[]>(persisted.suspended);
  const [intentText, setIntentText] = useState('');
  const [xiaoxiaoOpen, setXiaoxiaoOpen] = useState(false);
  const [showCapabilities, setShowCapabilities] = useState(false);
  const [capQuery, setCapQuery] = useState('');
  const [log, setLog] = useState<LogItem[]>(persisted.log);
  const [pendingSwitch, setPendingSwitch] = useState<{ intent: string; cap: CapabilityDef; responseText: string } | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState('');

  const [cat, setCat] = useState({ x: 34, y: 18, facing: 1, mood: 'idle' as 'idle'|'walk'|'sleep'|'play'|'watch' });
  const [catNote, setCatNote] = useState('');
  const [interactionNote, setInteractionNote] = useState('');
  const [butterA, setButterA] = useState({ x: 22, y: 44 });
  const [butterB, setButterB] = useState({ x: 70, y: 50 });
  const [birdX, setBirdX] = useState(12);

  const lifeRef = useRef(life);
  lifeRef.current = life;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recRef = useRef<any>(null);
  const deliveredRef = useRef<string | null>(null);

  useEffect(() => { savePersisted({ workspace, suspended, log: log.slice(-20) }); }, [workspace, suspended, log]);

  // Ambient motion (creatures)
  useEffect(() => {
    const t = setInterval(() => {
      setCat(prev => {
        const r = Math.random();
        let mood = prev.mood;
        if (r < 0.22) mood = 'sleep';
        else if (r < 0.45) mood = 'watch';
        else if (r < 0.7) mood = 'walk';
        else mood = 'play';
        let nx = prev.x;
        let ny = prev.y;
        let facing = prev.facing;
        if (mood === 'walk' || mood === 'play') {
          const dx = (Math.random() * 18 - 9);
          nx = Math.max(6, Math.min(90, prev.x + dx));
          ny = 14 + Math.random() * 8;
          facing = dx < 0 ? -1 : 1;
        } else if (mood === 'watch') {
          nx = Math.max(58, Math.min(86, prev.x + (Math.random() * 8 - 4)));
          ny = 14 + Math.random() * 4; // near pond sometimes
        } else {
          nx = prev.x + (Math.random() * 4 - 2);
          ny = prev.y;
        }
        return { x: nx, y: ny, facing, mood };
      });
      setButterA(p => ({ x: Math.max(5, Math.min(45, p.x + (Math.random() * 10 - 5))), y: Math.max(34, Math.min(58, p.y + (Math.random() * 8 - 4))) }));
      setButterB(p => ({ x: Math.max(50, Math.min(92, p.x + (Math.random() * 10 - 5))), y: Math.max(36, Math.min(60, p.y + (Math.random() * 8 - 4))) }));
      setBirdX(x => (x > 100 ? -8 : x + 5 + Math.random() * 5));
    }, 5000);
    return () => clearInterval(t);
  }, []);

  // Life interaction: cat & Xiaoxiao (e.g. startles fish while Xiaoxiao is fishing)
  useEffect(() => {
    if (commsActive) return;
    if (life.state !== 'Autonomous') return;
    if (life.behaviorId !== 'pond-fish') return;
    const t = setTimeout(() => {
      if (lifeRef.current.state !== 'Autonomous' || lifeRef.current.behaviorId !== 'pond-fish') return;
      setCat(c => ({ ...c, x: Math.max(58, Math.min(76, lifeRef.current.position.x + 6)), y: 20, facing: -1, mood: 'play' }));
      setInteractionNote(isEn ? 'The kitten ran over and startled the fish!' : '小猫突然跑来，吓跑了鱼！');
      // brief surprised reaction then resume autonomous flow naturally
      setLife(prev => prev.state === 'Autonomous' && prev.behaviorId === 'pond-fish'
        ? { ...prev, emotion: 'surprised', statusTextZh: '哎呀，小猫吓跑了鱼…', statusTextEn: 'Oh! The kitten startled the fish…' }
        : prev);
      setTimeout(() => setInteractionNote(''), 3200);
    }, 2600 + Math.random() * 2200);
    return () => clearTimeout(t);
  }, [life.state, life.behaviorId, commsActive, isEn]);

  // Communication independence
  useEffect(() => {
    if (commsActive) {
      if (workspaceRef.current && !workspaceRef.current.suspended && workspaceRef.current.status !== 'completed' && workspaceRef.current.status !== 'closed') {
        setWorkspace(ws => (ws ? suspendWorkspace(ws) : ws));
      }
      setLife(restingTick());
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      const ws = workspaceRef.current;
      if (ws && ws.suspended) {
        const restored = resumeWorkspace(ws);
        setWorkspace(restored);
        setLife(restored.status === 'completed'
          ? deliverTick(restored.intent || restored.title, restored.intent || restored.title)
          : taskingTick(restored.intent || '你的任务', restored.intent || 'your task'));
      } else if (lifeRef.current.state === 'Resting') {
        if (ws && ws.status === 'completed') setLife(deliverTick(ws.intent || ws.title, ws.intent || ws.title));
        else if (ws && (ws.status === 'running' || ws.status === 'creating')) setLife(taskingTick(ws.intent || ws.title, ws.intent || ws.title));
        else setLife(nextAutonomousTick(lifeRef.current));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commsActive]);

  // Autonomous loop
  useEffect(() => {
    if (commsActive) return;
    if (life.state !== 'Autonomous') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setLife(prev => nextAutonomousTick(prev)), life.durationMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [life, commsActive]);

  // Workspace progress
  useEffect(() => {
    if (!workspace) { if (advRef.current) clearInterval(advRef.current); return; }
    if (workspace.status === 'creating' || workspace.status === 'running') {
      if (advRef.current) clearInterval(advRef.current);
      advRef.current = setInterval(() => {
        setWorkspace(ws => {
          if (!ws) return ws;
          const next = advanceWorkspace(ws);
          if (next.status === 'completed' && ws.status !== 'completed') {
            setLife(deliverTick(next.intent || next.title, next.intent || next.title));
          }
          return next;
        });
      }, 1400);
    } else {
      if (advRef.current) clearInterval(advRef.current);
    }
    return () => { if (advRef.current) clearInterval(advRef.current); };
  }, [workspace?.id, workspace?.status]);

  // Deliver announcement once
  useEffect(() => {
    if (workspace?.status === 'completed' && deliveredRef.current !== workspace.id) {
      deliveredRef.current = workspace.id;
      const msg = isEn ? `Ready: ${workspace.title}. Would you like to begin now?` : `「${workspace.title}」已准备好，要现在开始吗？`;
      setLog(l => [...l.slice(-18), { role: 'ai', text: msg, t: Date.now() }]);
    }
    if (!workspace) deliveredRef.current = null;
  }, [workspace?.id, workspace?.status, isEn, workspace?.title]);

  const appendLog = (role: 'user' | 'ai', text: string) => setLog(l => [...l.slice(-18), { role, text, t: Date.now() }]);
  const lifeStatus = isEn ? life.statusTextEn : life.statusTextZh;

  const summonXiaoxiao = (openPanel = true) => {
    if (commsActive) return;
    if (openPanel) setXiaoxiaoOpen(true);
    if (lifeRef.current.state === 'Autonomous') {
      setLife(summonedTick(lifeRef.current.position));
      setTimeout(() => setLife(prev => (prev.state === 'Summoned' ? engagedTick() : prev)), 2200);
    } else if (lifeRef.current.state === 'Deliver') {
      setLife(engagedTick());
    } else if (lifeRef.current.state !== 'Tasking' && lifeRef.current.state !== 'Resting' && lifeRef.current.state !== 'Summoned') {
      setLife(engagedTick());
    }
  };

  const startTaskWithCap = (cap: CapabilityDef, intent: string, responseText: string, fromVoice: boolean) => {
    appendLog('ai', responseText);
    if (fromVoice) speakLine(responseText, lang);
    if (cap.tab === 'chat') {
      setWorkspace(null);
      setLife(taskingTick(cap.nameZh, cap.nameEn));
      onSelectTab('chat');
      return;
    }
    const ws = createWorkspace(cap, intent);
    setWorkspace(ws);
    setLife(taskingTick(cap.nameZh, cap.nameEn));
  };

  const startGeneralTask = (intent: string, responseText: string, fromVoice: boolean) => {
    appendLog('ai', responseText);
    if (fromVoice) speakLine(responseText, lang);
    const short = intent.slice(0, 16) || '你的需求';
    const ws = createWorkspace(GENERAL_CAP, intent);
    setWorkspace(ws);
    setLife(taskingTick(short, intent.slice(0, 24) || 'your request'));
  };

  const executeIntent = (rawInput: string, { fromVoice = false } = {}) => {
    const raw = rawInput.trim();
    if (!raw) return;

    const wakeOnly = /^(小小|xiaoxiao)[！!。.,，\s]*$/i.test(raw);
    if (wakeOnly) {
      appendLog('user', raw);
      setXiaoxiaoOpen(true);
      summonXiaoxiao(true);
      const greet = isEn ? 'I’m here! What would you like to do?' : '我在！你想做什么？';
      appendLog('ai', greet);
      if (fromVoice) speakLine(greet, lang);
      if (lifeRef.current.state !== 'Tasking' && lifeRef.current.state !== 'Resting') setLife(prev => (prev.state === 'Summoned' ? prev : engagedTick()));
      return;
    }

    appendLog('user', raw);
    setIntentText('');
    setXiaoxiaoOpen(true);
    setPendingSwitch(null);

    const lower = raw.toLowerCase();

    // stop / pause current task
    if (/(取消任务|停止任务|结束任务|先不做了|算了不用了|暂停任务|stop task|cancel task|pause task|never ?mind)/i.test(raw) || (/^(取消|停止|暂停|算了|不用了)$/i.test(raw) && workspaceRef.current)) {
      if (workspaceRef.current) {
        pauseWorkspace();
      } else {
        const msg = isEn ? 'No active task to stop.' : '当前没有进行中的任务。';
        appendLog('ai', msg);
        if (fromVoice) speakLine(msg, lang);
      }
      return;
    }

    if ((lower.includes('继续') || lower.includes('恢复') || lower.includes('resume') || lower.includes('continue')) && suspendedRef.current.length > 0 && !/(学习|学英语|学阿拉伯|音乐|歌|搜|查|看|玩|读|写|聊|打开|open|play|search|read|write|watch|browse)/.test(lower)) {
      const last = suspendedRef.current[suspendedRef.current.length - 1];
      setSuspended(prev => prev.slice(0, -1));
      const restored = resumeWorkspace(last);
      setWorkspace(restored);
      const msg = isEn ? `Resuming "${restored.title}".` : `好的，继续为你处理「${restored.title}」。`;
      appendLog('ai', msg);
      setLife(restored.status === 'completed'
        ? deliverTick(restored.intent || restored.title, restored.intent || restored.title)
        : taskingTick(restored.intent || restored.title, restored.intent || restored.title));
      if (fromVoice) speakLine(msg, lang);
      return;
    }

    if (lifeRef.current.state === 'Autonomous') {
      setLife(summonedTick(lifeRef.current.position));
      setTimeout(() => setLife(prev => (prev.state === 'Summoned' ? engagedTick() : prev)), 1800);
    }

    const res = orchestrate({ text: raw, lang });
    const activeWs = workspaceRef.current;
    const isActiveTask = activeWs && (activeWs.status === 'creating' || activeWs.status === 'running');

    if (res.capability) {
      const cap = res.capability;
      if (isActiveTask && cap.tab !== activeWs.capabilityTab) {
        setPendingSwitch({ intent: raw, cap, responseText: res.responseText });
        const ask = isEn
          ? `You’re currently working on "${activeWs.title}". Keep its progress and switch to ${cap.nameEn}?`
          : `你当前正在进行「${activeWs.title}」。要保留当前进度并切换到「${cap.nameZh}」吗？`;
        appendLog('ai', ask);
        if (fromVoice) speakLine(ask, lang);
        return;
      }
      if (isActiveTask && cap.tab === activeWs.capabilityTab) {
        const msg = isEn ? `Continuing with ${cap.nameEn} in the pavilion.` : `继续在亭子中为你处理「${cap.nameZh}」。`;
        appendLog('ai', msg);
        if (fromVoice) speakLine(msg, lang);
        return;
      }
      startTaskWithCap(cap, raw, res.responseText, fromVoice);
      return;
    }

    if (isActiveTask) {
      setPendingSwitch({ intent: raw, cap: GENERAL_CAP, responseText: res.responseText });
      const ask = isEn
        ? `You’re currently working on "${activeWs.title}". Keep its progress and switch to this new request?`
        : `你当前正在进行「${activeWs.title}」。要保留当前进度并切换到这个新需求吗？`;
      appendLog('ai', ask);
      if (fromVoice) speakLine(ask, lang);
      return;
    }
    startGeneralTask(raw, res.responseText, fromVoice);
  };

  const confirmSwitch = (keepProgress: boolean) => {
    const p = pendingSwitch;
    if (!p) return;
    setPendingSwitch(null);
    const activeWs = workspaceRef.current;
    if (keepProgress && activeWs && (activeWs.status === 'creating' || activeWs.status === 'running')) {
      setSuspended(prev => [...prev.slice(-4), suspendWorkspace(activeWs)]);
    }
    if (p.cap.id === 'general-workspace') startGeneralTask(p.intent, p.responseText, false);
    else startTaskWithCap(p.cap, p.intent, p.responseText, false);
  };

  const cancelSwitch = () => {
    setPendingSwitch(null);
    appendLog('ai', isEn ? 'Okay, I’ll keep working on the current task.' : '好的，继续当前任务。');
  };

  const submitIntent = (text: string) => executeIntent(text, { fromVoice: false });

  const openWorkspaceCapability = () => { if (workspace) onSelectTab(workspace.capabilityTab); };

  const closeWorkspace = () => {
    setWorkspace(null);
    if (!commsActive) setLife(engagedTick());
    appendLog('ai', isEn ? 'Workspace closed.' : '工作空间已关闭。');
  };

  const pauseWorkspace = () => {
    const ws = workspaceRef.current;
    if (!ws) return;
    if (ws.status === 'completed' || ws.status === 'closed') {
      setWorkspace(null);
      if (!commsActive) setLife(engagedTick());
      return;
    }
    const kept = suspendWorkspace(ws);
    setSuspended(prev => [...prev.slice(-4), kept]);
    setWorkspace(null);
    if (!commsActive) setLife(engagedTick());
    appendLog('ai', isEn ? `Paused "${kept.title}" - progress kept. You can resume anytime.` : `已暂停「${kept.title}」，进度已保留，你可以随时继续。`);
  };

  const restoreSuspended = (id: string) => {
    const target = suspended.find(s => s.id === id);
    if (!target) return;
    if (workspace && (workspace.status === 'creating' || workspace.status === 'running')) {
      setSuspended(prev => [...prev.filter(s => s.id !== id), suspendWorkspace(workspace)]);
    } else {
      setSuspended(prev => prev.filter(s => s.id !== id));
    }
    const restored = resumeWorkspace(target);
    setWorkspace(restored);
    setLife(restored.status === 'completed'
      ? deliverTick(restored.intent || restored.title, restored.intent || restored.title)
      : taskingTick(restored.intent || restored.title, restored.intent || restored.title));
    appendLog('ai', isEn ? `Resumed "${restored.title}".` : `已恢复「${restored.title}」。`);
  };

  const filteredCaps = useMemo(() => {
    const q = capQuery.trim().toLowerCase();
    if (!q) return CAPABILITIES;
    return CAPABILITIES.filter(c => c.nameZh.toLowerCase().includes(q) || c.nameEn.toLowerCase().includes(q) || c.tab.toLowerCase().includes(q) || c.intents.some(i => i.toLowerCase().includes(q)));
  }, [capQuery]);

  const toggleVoiceListen = async () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setVoiceHint(isEn ? 'Voice recognition not supported in this browser.' : '当前浏览器不支持语音识别。'); return; }
    if (listening) { try { recRef.current?.stop?.(); } catch {} setListening(false); return; }
    try {
      const rec = new SR();
      rec.lang = isEn ? 'en-US' : 'zh-CN';
      rec.interimResults = false;
      rec.continuous = false;
      rec.onstart = () => { setListening(true); setVoiceHint(isEn ? 'Listening… say "Xiaoxiao" and your request.' : '正在聆听…可以说「小小」并说出你的需求。'); if (lifeRef.current.state === 'Autonomous') summonXiaoxiao(true); };
      rec.onresult = (e: any) => {
        const text = (e?.results?.[0]?.[0]?.transcript || '').trim();
        if (!text) return;
        const cleaned = text.replace(/^小小[，,！!\s]?/i, '').replace(/^xiaoxiao[,\s!]?/i, '').trim() || text;
        executeIntent(cleaned, { fromVoice: true });
      };
      rec.onerror = () => setVoiceHint(isEn ? 'Voice input unavailable. You can type instead.' : '语音输入不可用，可改为输入文字。');
      rec.onend = () => setListening(false);
      recRef.current = rec;
      rec.start();
    } catch { setListening(false); setVoiceHint(isEn ? 'Voice input unavailable.' : '语音输入不可用。'); }
  };

  useEffect(() => () => { try { recRef.current?.stop?.(); } catch {} }, []);

  const onCatClick = () => {
    const near = Math.abs(cat.x - lifeRef.current.position.x) < 12 && Math.abs((100 - cat.y) - lifeRef.current.position.y) < 18;
    if (near && (lifeRef.current.state === 'Autonomous' || lifeRef.current.state === 'Engaged')) {
      const m = isEn ? 'Xiaoxiao and the kitten play together for a moment.' : '小小和小猫一起玩了一会儿。';
      setCatNote(m);
      setInteractionNote(isEn ? 'Playful moment ✨' : '一起玩耍 ✨');
      setLife(prev => prev.state === 'Autonomous' ? { ...prev, emotion: 'happy', statusTextZh: '和小猫开心地玩耍', statusTextEn: 'Playing happily with the kitten' } : prev);
      setTimeout(() => setInteractionNote(''), 2400);
    } else {
      const msgs = isEn
        ? ['Meow~ the kitten rubs against you.', 'The kitten is chasing a butterfly!', 'The kitten naps by the pavilion.', 'The kitten watches the fish in the pond.']
        : ['喵～小猫蹭了蹭你。', '小猫正在追蝴蝶！', '小猫在亭子旁打盹。', '小猫在池塘边看鱼。'];
      setCatNote(msgs[Math.floor(Math.random() * msgs.length)]);
    }
    setCat(c => ({ ...c, mood: 'play' }));
    setTimeout(() => setCatNote(''), 2600);
  };

  const sky = SKY[phase];
  const suggestions = isEn
    ? ['I want to learn Arabic', 'Play some music', 'Search for materials', 'Open messages', 'Read a book', 'Write an article']
    : ['我想学习阿拉伯语', '放首歌', '帮我查资料', '打开消息', '我想看书', '帮我写文章'];

  if (currentTab !== 'globe') return null;

  const xiaoxiaoScaleX = life.position.facing === 'left' ? -1 : 1;
  const motionEmoji = life.state === 'Summoned' ? '🏃' : life.state === 'Tasking' ? '💼' : null;
  const pavilionActive = workspace && (workspace.status === 'running' || workspace.status === 'creating');

  const weatherOverlay = weather === 'rain'
    ? Array.from({ length: 40 }).map((_, i) => <span key={`r${i}`} className="pointer-events-none absolute w-[1px] bg-sky-200/50" style={{ left: `${(i * 17) % 100}%`, top: `${(i * 13) % 60}%`, height: 10 + (i % 4) * 4, animation: `rain ${0.8 + (i % 5) * 0.15}s linear ${i * 0.05}s infinite` }} />)
    : weather === 'snow'
    ? Array.from({ length: 30 }).map((_, i) => <span key={`s${i}`} className="pointer-events-none absolute rounded-full bg-white/80" style={{ left: `${(i * 19) % 100}%`, top: `${(i * 11) % 60}%`, width: 2 + (i % 3), height: 2 + (i % 3), animation: `snow ${4 + (i % 5)}s linear ${i * 0.2}s infinite` }} />)
    : weather === 'cloudy'
    ? <div className="pointer-events-none absolute inset-x-0 top-0 h-[35%] bg-gradient-to-b from-slate-300/20 to-transparent" />
    : null;

  const seasonTint = season === 'autumn' ? 'saturate-[0.95] hue-rotate-[-8deg]' : season === 'winter' ? 'saturate-[0.85] brightness-[0.98]' : season === 'summer' ? 'saturate-[1.05]' : '';
  const foliageColor = season === 'autumn' ? (isNight ? 'radial-gradient(circle,#7a5a3a,#3a2a1a)' : 'radial-gradient(circle,#f3b36b,#d97a3a)') : isNight ? 'radial-gradient(circle,#6d4b6a,#3a2440)' : 'radial-gradient(circle,#ffd6e8,#f4a9c8)';

  return (
    <div className={`relative h-[100dvh] w-full overflow-hidden select-none ${seasonTint}`} style={{ background: '#07111f' }}>
      <div className="absolute inset-0 transition-all duration-[3000ms]" style={{ background: sky }} />
      {isNight && (
        <div className="pointer-events-none absolute inset-0">
          {Array.from({ length: 56 }).map((_, i) => (
            <span key={i} className="absolute rounded-full bg-white" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 19) % 46}%`, width: i % 4 === 0 ? 2 : 1, height: i % 4 === 0 ? 2 : 1, opacity: 0.35 + (i % 5) * 0.12 }} />
          ))}
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={`f${i}`} className="absolute h-1.5 w-1.5 rounded-full bg-yellow-200/80 shadow-[0_0_8px_rgba(255,240,150,0.9)]" style={{ left: `${10 + (i * 9) % 80}%`, top: `${50 + (i * 7) % 30}%`, animation: `float ${5 + (i % 4)}s ease-in-out ${i * 0.4}s infinite` }} />
          ))}
        </div>
      )}
      <div className="pointer-events-none absolute" style={{ left: phase === 'night' ? '78%' : phase === 'dusk' ? '82%' : '76%', top: phase === 'night' ? '10%' : '9%' }}>
        {isNight ? <MoonStar className="h-10 w-10 text-yellow-100/90" /> : <SunMedium className="h-12 w-12 text-amber-200/90 drop-shadow" />}
      </div>

      {!isNight && (
        <div className="pointer-events-none absolute inset-x-0 top-[8%] h-[18%] opacity-60">
          <div className="absolute left-[8%] top-[20%] h-8 w-32 rounded-full bg-white/70 blur-[2px]" style={{ animation: 'drift 40s linear infinite' }} />
          <div className="absolute left-[45%] top-[40%] h-6 w-24 rounded-full bg-white/60 blur-[2px]" style={{ animation: 'drift 55s linear infinite reverse' }} />
          <div className="absolute left-[70%] top-[10%] h-7 w-28 rounded-full bg-white/65 blur-[2px]" style={{ animation: 'drift 48s linear infinite' }} />
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-[1]">{weatherOverlay}</div>

      <svg className="pointer-events-none absolute bottom-[28%] left-0 h-[30%] w-full" viewBox="0 0 1200 320" preserveAspectRatio="none">
        <path d="M0,320 L0,190 L120,90 L260,180 L380,50 L520,170 L660,30 L820,160 L980,60 L1120,180 L1200,120 L1200,320 Z" fill={isNight ? '#0e2038' : '#5f9268'} opacity="0.96" />
        <path d="M0,320 L0,230 L180,130 L320,230 L480,120 L640,230 L800,130 L960,230 L1100,160 L1200,230 L1200,320 Z" fill={isNight ? '#132a45' : '#7fb07f'} opacity="0.92" />
        <rect x="652" y="90" width="10" height="140" fill={isNight ? '#6fb7d8' : '#cfefff'} opacity="0.55" rx="4"><animate attributeName="opacity" values="0.35;0.7;0.35" dur="2.6s" repeatCount="indefinite" /></rect>
        <ellipse cx="657" cy="235" rx="26" ry="8" fill={isNight ? '#6fb7d8' : '#e6f8ff'} opacity="0.35" />
      </svg>
      <div className="absolute bottom-0 left-0 h-[34%] w-full" style={{ background: isNight ? 'linear-gradient(180deg,#1b3a2a 0%, #102217 100%)' : season === 'winter' ? 'linear-gradient(180deg,#dfeee4 0%, #b8d4c4 55%, #8fb39c 100%)' : 'linear-gradient(180deg,#7fcb6d 0%, #4f9f47 55%, #3b7a36 100%)' }} />
      <svg className="pointer-events-none absolute bottom-0 left-0 h-[34%] w-full" viewBox="0 0 1200 260" preserveAspectRatio="none">
        <path d="M520,0 C500,60 420,120 380,260 L700,260 C660,140 610,70 580,0 Z" fill={isNight ? '#6b5a3e' : '#ddc996'} opacity="0.58" />
      </svg>
      <div className="absolute rounded-[50%]" style={{ right: '7%', bottom: '7%', width: '27%', height: '13%', background: isNight ? 'radial-gradient(ellipse at 40% 35%, #4a8fb8, #123a56)' : 'radial-gradient(ellipse at 40% 35%, #8fe2ff, #2f95cf)', opacity: 0.88, boxShadow: 'inset 0 0 24px rgba(255,255,255,0.18)' }}>
        <div className="absolute inset-[12%] rounded-[50%] border border-white/30" style={{ animation: 'ripple 4s ease-in-out infinite' }} />
      </div>
      <div className="absolute" style={{ right: '15%', bottom: '13%', width: '11%', height: '3.2%', borderRadius: 999, background: isNight ? '#6b4f2e' : '#b7894f', transform: 'rotate(-8deg)', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }} />

      <div className="absolute" style={{ left: '5%', bottom: '22%' }}><div className="mx-auto h-16 w-2 rounded bg-[#6b4b2a]" /><div className="-mt-16 -ml-8 h-20 w-20 rounded-full" style={{ background: foliageColor }} /></div>
      <div className="absolute" style={{ left: '17%', bottom: '24%' }}><div className="mx-auto h-12 w-2 rounded bg-[#6b4b2a]" /><div className="-mt-12 -ml-6 h-14 w-14 rounded-full" style={{ background: foliageColor }} /></div>
      <div className="absolute" style={{ left: '82%', bottom: '23%' }}><div className="mx-auto h-14 w-2 rounded bg-[#6b4b2a]" /><div className="-mt-14 -ml-7 h-16 w-16 rounded-full" style={{ background: isNight ? 'radial-gradient(circle,#2f4a3a,#1f3328)' : 'radial-gradient(circle,#6fbf6a,#3f8f45)' }} /></div>
      <div className="absolute flex items-end gap-1" style={{ left: '28%', bottom: '22%' }}>{[18, 24, 20, 26, 22].map((h, i) => (<div key={i} className="w-1.5 rounded-t" style={{ height: h, background: isNight ? '#2f5a3a' : '#4fa05a' }} />))}</div>
      {season !== 'winter' && <>
        <div className="pointer-events-none absolute bottom-[20%] left-[10%] text-lg opacity-80">🌷</div>
        <div className="pointer-events-none absolute bottom-[19%] left-[40%] text-base opacity-80">🌼</div>
        <div className="pointer-events-none absolute bottom-[21%] left-[58%] text-base opacity-80">🌸</div>
      </>}

      {Array.from({ length: 10 }).map((_, i) => (
        <span key={i} className="pointer-events-none absolute" style={{ left: `${8 + i * 8}%`, top: `${18 + (i % 4) * 6}%`, fontSize: 10 + (i % 3) * 4, color: season === 'autumn' ? '#f0b35a' : 'rgba(255,210,225,0.85)', animation: `petal ${7 + (i % 5)}s linear ${i * 0.6}s infinite` }}>{season === 'autumn' ? '🍂' : '❀'}</span>
      ))}
      <div className="pointer-events-none absolute text-sm transition-all duration-[4500ms] ease-linear" style={{ left: `${birdX}%`, top: '18%', opacity: 0.7 }}>🐦</div>

      {/* Pavilion */}
      <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: '33%', width: 190 }}>
        <div className="relative mx-auto">
          <div className="mx-auto h-0 w-0" style={{ borderLeft: '100px solid transparent', borderRight: '100px solid transparent', borderBottom: `48px solid ${isNight ? '#2c3e58' : '#5a3e2b'}` }} />
          <div className="-mt-1 mx-auto h-2 w-[178px] rounded" style={{ background: isNight ? '#3a5678' : '#704c33' }} />
          <div className="mx-auto mt-1 flex h-20 w-[156px] items-end justify-around rounded-b-md border-x border-b" style={{ borderColor: isNight ? 'rgba(180,210,255,0.25)' : 'rgba(90,60,30,0.5)', background: workspace ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)' }}>
            {[0,1,2,3].map(i => <span key={i} className="h-full w-1.5 rounded" style={{ background: isNight ? '#5a4633' : '#7a5230' }} />)}
            {life.state === 'Resting' && <span className="absolute bottom-3 text-xl">😴</span>}
          </div>
          {pavilionActive && (
            <>
              <div className="pointer-events-none absolute -inset-7 rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,210,140,0.30) 0%, rgba(255,180,220,0.14) 45%, transparent 72%)', animation: 'pulseGlow 3s ease-in-out infinite' }} />
              {Array.from({ length: 6 }).map((_, i) => (<span key={i} className="pointer-events-none absolute text-pink-200" style={{ left: `${20 + i * 12}%`, top: `${-10 + (i % 3) * 6}%`, animation: `petal ${4 + (i % 3)}s linear ${i * 0.5}s infinite` }}>✿</span>))}
            </>
          )}
        </div>
        <div className="mt-1 text-center text-[11px] font-medium" style={{ color: isNight ? '#d8e6ff' : '#2f3e2f' }}>
          {isEn ? 'Pavilion · Dynamic Workspace' : '亭子 · 动态工作空间'}
        </div>
      </div>

      <div className="pointer-events-none absolute transition-all duration-[4000ms] ease-in-out" style={{ left: `${butterA.x}%`, top: `${butterA.y}%`, animation: 'float 5s ease-in-out infinite' }}><span className="text-lg">🦋</span></div>
      <div className="pointer-events-none absolute transition-all duration-[4000ms] ease-in-out" style={{ left: `${butterB.x}%`, top: `${butterB.y}%`, animation: 'float 6s ease-in-out infinite reverse' }}><span className="text-base">🦋</span></div>

      {/* Cat (clickable, non-blocking) */}
      <div className="absolute z-10 transition-all duration-[4500ms] ease-in-out" style={{ left: `${cat.x}%`, bottom: `${cat.y}%`, transform: `scaleX(${cat.facing})` }}>
        <button type="button" onClick={onCatClick} className="pointer-events-auto cursor-pointer text-2xl drop-shadow transition-transform hover:scale-110" title={isEn ? 'Kitten' : '小猫'}>
          {cat.mood === 'sleep' ? '😺' : cat.mood === 'play' ? '🐈' : '🐈'}
        </button>
        {catNote && <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/45 px-2 py-0.5 text-[10px] text-white" style={{ transform: `translateX(-50%) scaleX(${cat.facing})` }}>{catNote}</div>}
      </div>

      {/* Xiaoxiao (clickable summon) */}
      <div className="absolute ease-in-out" style={{ left: `${life.position.x}%`, top: `${life.position.y}%`, transform: `translate(-50%, -50%) scaleX(${xiaoxiaoScaleX})`, transition: `left ${life.state === 'Summoned' ? 900 : 2200}ms, top ${life.state === 'Summoned' ? 900 : 2200}ms`, zIndex: 12 }}>
        <button type="button" onClick={() => summonXiaoxiao(true)} className="relative flex flex-col items-center cursor-pointer rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-300/40" aria-label={isEn ? 'Call Xiaoxiao' : '呼唤小小'}>
          {(life.state === 'Tasking' || life.state === 'Deliver') && <span className="absolute -top-7 text-xl" style={{ animation: 'float 2s ease-in-out infinite' }}>✨</span>}
          {life.state === 'Summoned' && <span className="absolute -right-5 top-0 text-sm">💨</span>}
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/70 shadow-lg" style={{ background: 'radial-gradient(circle at 35% 30%, #fff7dd, #ffd36e 45%, #ff9ec4 100%)', animation: life.state === 'Summoned' ? 'bounce 0.6s ease-in-out infinite' : (life.state === 'Engaged' || life.state === 'Deliver') ? 'bob 2.4s ease-in-out infinite' : 'none' }}>
            <span className="text-xl" style={{ transform: `scaleX(${xiaoxiaoScaleX})` }}>{motionEmoji ? motionEmoji : (EMOJI[life.emotion] || '🙂')}</span>
          </div>
          <span className="mt-0.5 rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm" style={{ transform: `scaleX(${xiaoxiaoScaleX})` }}>小小</span>
        </button>
        {interactionNote && (
          <div className="pointer-events-none absolute -top-12 left-1/2 w-max max-w-[220px] -translate-x-1/2 rounded-xl bg-black/55 px-2.5 py-1 text-center text-[11px] text-white backdrop-blur-sm" style={{ transform: 'translateX(-50%)' }}>{interactionNote}</div>
        )}
      </div>

      {/* Top bar */}
      {!immersive && (
        <>
          <div className="absolute left-3 right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex items-center gap-2 pl-0 md:pl-[5.5rem]">
            <div className="flex items-center gap-2 rounded-2xl border border-white/20 bg-black/25 px-3 py-2 text-white shadow-lg backdrop-blur-xl">
              <Leaf className="h-4 w-4 text-emerald-300" />
              <div className="leading-tight">
                <div className="text-xs font-semibold">{isEn ? 'EARTH ONE · Living Garden' : 'EARTH ONE · 数字花园'}</div>
                <div className="text-[10px] text-white/75">{seasonLabel(season, isEn)} · {weatherLabel(weather, isEn)} · {isEn ? 'Call "Xiaoxiao" anytime' : '随时呼唤「小小」'}</div>
              </div>
            </div>
          </div>
          {/* Compact side communication entry (independent system) */}
          <button
            type="button"
            onClick={() => onSelectTab('chat')}
            className="absolute right-2 md:right-4 top-[max(5.5rem,calc(env(safe-area-inset-top)+4.5rem))] z-30 flex flex-col items-center gap-1 rounded-2xl border border-cyan-300/40 bg-cyan-500/20 px-2.5 py-3 text-white shadow-lg backdrop-blur-xl hover:bg-cyan-500/30"
            title={isEn ? 'Communication (independent)' : '通信（独立系统）'}
          >
            <MessageCircle className="h-5 w-5" />
            <span className="text-[10px] font-semibold leading-tight" style={{ writingMode: 'vertical-rl' as any }}>{isEn ? 'Comms' : '通信'}</span>
          </button>
        </>
      )}

      {/* Xiaoxiao bubble */}
      <div className="absolute z-20" style={{ left: '50%', bottom: immersive ? 24 : 110, transform: 'translateX(-50%)' }}>
        <button type="button" onClick={() => summonXiaoxiao(true)} className="max-w-[min(92vw,520px)] rounded-2xl border border-white/25 bg-black/35 px-4 py-2.5 text-left text-white shadow-xl backdrop-blur-xl hover:bg-black/45">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-300" /><span className="text-xs font-semibold">{isEn ? 'Xiaoxiao' : '小小'}</span>
            <span className="text-[10px] text-white/70">· {life.state === 'Autonomous' ? (isEn ? 'living freely' : '自主生活中') : life.state === 'Resting' ? (isEn ? 'resting in pavilion' : '亭中休息') : life.state === 'Tasking' ? (isEn ? 'working in pavilion' : '亭中工作') : life.state === 'Deliver' ? (isEn ? 'ready' : '已就绪') : life.state === 'Summoned' ? (isEn ? 'coming to you' : '赶来中') : (isEn ? 'listening' : '倾听中')}</span>
          </div>
          <div className="mt-1 text-sm text-white/95">{lifeStatus}</div>
          <div className="mt-1 text-[11px] text-cyan-200/90">{isEn ? 'Tap to call Xiaoxiao · say or type what you need' : '点击呼唤小小 · 说出或输入你的需求'}</div>
        </button>
      </div>

      {/* Intent panel */}
      {xiaoxiaoOpen && (
        <div className="absolute z-30 w-[min(92vw,440px)] rounded-2xl border border-white/20 bg-[#0b1424]/88 p-3 text-white shadow-2xl backdrop-blur-2xl" style={{ left: '50%', bottom: immersive ? 90 : 185, transform: 'translateX(-50%)' }}>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-amber-300" />{isEn ? 'Xiaoxiao · Intent' : '小小 · 意图交互'}</div>
            <button type="button" onClick={() => setXiaoxiaoOpen(false)} className="rounded p-1 hover:bg-white/10"><X className="h-4 w-4" /></button>
          </div>
          <div className="mb-2 max-h-40 space-y-1.5 overflow-y-auto pr-1">
            {log.length === 0 && <div className="text-xs text-white/70">{isEn ? 'I understand intent, coordinate capabilities, and prepare workspaces in the pavilion. Try:' : '我能理解意图、调度能力并在亭子中准备工作空间。试试：'}</div>}
            {log.slice(-10).map((m, i) => (
              <div key={i} className={`text-xs leading-relaxed ${m.role === 'ai' ? 'text-cyan-100' : 'text-white/90'}`}><span className="mr-1 font-semibold">{m.role === 'ai' ? (isEn ? 'Xiaoxiao:' : '小小：') : (isEn ? 'You:' : '你：')}</span>{m.text}</div>
            ))}
            {pendingSwitch && (
              <div className="mt-2 rounded-xl border border-amber-300/30 bg-amber-500/10 p-2">
                <div className="text-xs text-amber-100">{isEn ? 'Keep progress of the current task and switch?' : '保留当前任务进度并切换吗？'}</div>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => confirmSwitch(true)} className="rounded-lg bg-amber-400 px-2.5 py-1.5 text-[11px] font-semibold text-slate-900">{isEn ? 'Keep & switch' : '保留并切换'}</button>
                  <button type="button" onClick={cancelSwitch} className="rounded-lg border border-white/20 px-2.5 py-1.5 text-[11px] text-white/90">{isEn ? 'Cancel' : '取消'}</button>
                </div>
              </div>
            )}
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {suggestions.map(s => (<button key={s} type="button" onClick={() => submitIntent(s)} className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/85 hover:bg-white/10">{s}</button>))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={toggleVoiceListen} className={`flex h-9 w-9 items-center justify-center rounded-xl border ${listening ? 'border-rose-300/50 bg-rose-500/30' : 'border-white/15 bg-white/10 hover:bg-white/15'}`} title={isEn ? 'Voice' : '语音'}>{listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>
            <input value={intentText} onChange={e => setIntentText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitIntent(intentText); }} placeholder={isEn ? 'Tell Xiaoxiao what you want…' : '告诉小小你想做什么…'} className="flex-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/45 outline-none focus:border-cyan-300/50" />
            <button type="button" onClick={() => submitIntent(intentText)} className="rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-400">{isEn ? 'Send' : '发送'}</button>
          </div>
          {(voiceHint || listening) && <div className="mt-1.5 text-[11px] text-cyan-200/85">{listening ? (isEn ? 'Listening…' : '正在聆听…') : voiceHint}</div>}
          <div className="mt-2 flex items-center justify-between">
            <button type="button" onClick={() => setShowCapabilities(s => !s)} className="inline-flex items-center gap-1 text-[11px] text-cyan-200 underline underline-offset-2 hover:text-cyan-100"><LayoutGrid className="h-3.5 w-3.5" />{isEn ? 'All capabilities (preserved)' : '全部能力（保底直达）'}</button>
            <span className="text-[10px] text-white/50">{isEn ? 'All original modules preserved' : '原有功能全部保留并可调度'}</span>
          </div>
        </div>
      )}

      {/* Pavilion workspace panel */}
      {workspace && (
        <div className="absolute right-3 z-30 w-[min(92vw,360px)] rounded-2xl border border-amber-200/30 bg-[#101a2bcc] p-3 text-white shadow-2xl backdrop-blur-2xl md:right-6" style={{ top: immersive ? 16 : 86 }}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-200/90">{isEn ? 'Pavilion · ' : '亭子 · '}{modeLabel(workspace.mode, isEn)}</div>
              <div className="text-[10px] text-white/50">{isEn ? 'Xiaoxiao is coordinating capabilities for you' : '小小正在为你调度能力并准备空间'}</div>
              <div className="mt-0.5 text-sm font-semibold">{workspace.title}</div>
              <div className="text-[11px] text-white/65">{workspace.status === 'completed' ? (isEn ? 'Completed — ready to begin' : '已完成 — 准备开始') : workspace.suspended ? (isEn ? 'Suspended (progress kept)' : '已挂起（进度已保留）') : (isEn ? 'In progress…' : '执行中…')}</div>
            </div>
            <button type="button" onClick={closeWorkspace} className="rounded p-1 hover:bg-white/10"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-pink-300 transition-all duration-500" style={{ width: `${workspace.progress}%` }} /></div>
          <div className="mt-2 space-y-1">
            {workspace.steps.map(s => (
              <div key={s.id} className="flex items-center gap-2 text-[11px]">
                <span className={`inline-block h-2 w-2 rounded-full ${s.status === 'done' ? 'bg-emerald-400' : s.status === 'active' ? 'animate-pulse bg-amber-300' : 'bg-white/25'}`} />
                <span className={s.status === 'done' ? 'text-white/80' : s.status === 'active' ? 'text-white' : 'text-white/50'}>{s.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={openWorkspaceCapability} className="flex-1 min-w-[120px] rounded-xl bg-amber-400/90 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-amber-300">{workspace.status === 'completed' ? (isEn ? 'Open & start' : '打开并开始') : (isEn ? 'Open workspace' : '打开工作空间')}</button>
            {(workspace.status === 'creating' || workspace.status === 'running') && (
              <button type="button" onClick={pauseWorkspace} className="rounded-xl border border-white/20 px-3 py-2 text-xs text-white/90 hover:bg-white/10">{isEn ? 'Pause & keep' : '暂停保留'}</button>
            )}
            {workspace.status === 'completed' && <span className="text-[11px] text-emerald-200">{isEn ? 'Ready ✓' : '已就绪 ✓'}</span>}
          </div>
          {suspended.length > 0 && (
            <div className="mt-3 border-t border-white/10 pt-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/55">{isEn ? 'Suspended tasks (progress kept)' : '已挂起任务（进度已保留）'}</div>
              <div className="space-y-1">
                {suspended.slice(-3).map(s => (
                  <button key={s.id} type="button" onClick={() => restoreSuspended(s.id)} className="flex w-full items-center justify-between rounded-lg bg-white/5 px-2 py-1.5 text-left text-[11px] hover:bg-white/10">
                    <span className="truncate pr-2">{s.title || s.intent}</span>
                    <span className="inline-flex items-center gap-1 text-cyan-200"><RotateCcw className="h-3 w-3" />{isEn ? 'Resume' : '继续'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!workspace && suspended.length > 0 && !immersive && (
        <div className="absolute right-3 top-[86px] z-20 rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-white backdrop-blur-xl md:right-6">
          <div className="text-[11px] text-white/80">{isEn ? 'Suspended tasks kept:' : '已保留的挂起任务：'} {suspended.length}</div>
          <button type="button" onClick={() => restoreSuspended(suspended[suspended.length - 1].id)} className="mt-1 inline-flex items-center gap-1 text-[11px] text-cyan-200 hover:text-cyan-100"><RotateCcw className="h-3 w-3" />{isEn ? 'Resume last' : '继续上一个'}</button>
        </div>
      )}

      {showCapabilities && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-black/45 p-3 md:items-center" onClick={() => setShowCapabilities(false)}>
          <div className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-white/15 bg-[#0b1424]/95 text-white shadow-2xl backdrop-blur-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <div className="text-sm font-semibold">{isEn ? 'All Capabilities (Preserved · Direct Access)' : '全部能力（完整保留 · 可直达）'}</div>
                <div className="text-[11px] text-white/60">{isEn ? 'Every existing module remains available. Xiaoxiao can orchestrate by intent, or you can open any capability directly.' : '所有原有模块均保留。小小可按意图调度，你也可直接打开任一能力。'}</div>
              </div>
              <button type="button" onClick={() => setShowCapabilities(false)} className="rounded p-1 hover:bg-white/10"><X className="h-4 w-4" /></button>
            </div>
            <div className="border-b border-white/10 p-3">
              <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2">
                <Search className="h-4 w-4 text-white/60" />
                <input value={capQuery} onChange={e => setCapQuery(e.target.value)} placeholder={isEn ? 'Search capabilities…' : '搜索能力/模块…'} className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/40" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3">
              {filteredCaps.map(cap => (
                <button key={cap.id} type="button" onClick={() => { onSelectTab(cap.tab); setShowCapabilities(false); }} className="rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10">
                  <div className="text-sm font-medium">{capabilityLabel(cap, lang)}</div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] text-white/60">{isEn ? cap.descriptionEn : cap.descriptionZh}</div>
                  <div className="mt-1 text-[10px] text-cyan-200/80">#{cap.tab}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes float { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-8px) } }
        @keyframes drift { 0%{ transform: translateX(-20%) } 100%{ transform: translateX(120%) } }
        @keyframes ripple { 0%,100%{ transform: scale(0.92); opacity: .15 } 50%{ transform: scale(1.05); opacity: .35 } }
        @keyframes petal { 0%{ transform: translateY(-10px) translateX(0) rotate(0deg); opacity: 0 } 10%{ opacity: .8 } 100%{ transform: translateY(140px) translateX(30px) rotate(120deg); opacity: 0 } }
        @keyframes pulseGlow { 0%,100%{ opacity: .55 } 50%{ opacity: 1 } }
        @keyframes bounce { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-4px) } }
        @keyframes bob { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-2px) } }
        @keyframes rain { 0%{ transform: translateY(-20px); opacity: 0 } 20%{ opacity: .7 } 100%{ transform: translateY(220px); opacity: 0 } }
        @keyframes snow { 0%{ transform: translateY(-10px) translateX(0); opacity: 0 } 20%{ opacity: .9 } 100%{ transform: translateY(200px) translateX(20px); opacity: 0 } }
      `}</style>
    </div>
  );
};

export default LivingGarden;
