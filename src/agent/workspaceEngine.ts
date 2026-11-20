import type { CapabilityDef, TaskPlanStep, WorkspaceMode, WorkspaceSession } from './types';

let seq = 0;
const uid = () => `ws_${Date.now()}_${++seq}`;

const MODE_STEPS: Record<WorkspaceMode, string[]> = {
  learning: ['理解学习需求', '检索与筛选学习资源', '整理课程、词汇与练习', '生成学习工作空间'],
  reading: ['定位阅读内容', '准备阅读与检索上下文', '打开阅读空间'],
  research: ['理解研究目标', '检索并筛选资料', '整理结果与来源', '呈现研究空间'],
  creation: ['理解创作意图', '组织素材与思路', '生成创作空间'],
  video: ['定位影音内容', '准备影音空间'],
  music: ['定位音乐内容', '准备音乐空间'],
  files: ['理解文件任务', '准备文件工作空间'],
  communication: ['打开独立通信空间'],
  general: ['理解你的需求', '调度相关能力', '准备工作空间'],
};

export function createWorkspace(cap: CapabilityDef, userIntent: string): WorkspaceSession {
  const steps: TaskPlanStep[] = (MODE_STEPS[cap.workspaceMode] || MODE_STEPS.general).map((label, i) => ({
    id: `s${i}`, label, status: i === 0 ? 'active' : 'pending',
  }));
  const titleBase = cap.nameZh;
  return {
    id: uid(),
    capabilityTab: cap.tab,
    title: userIntent ? `${titleBase}` : titleBase,
    mode: cap.workspaceMode,
    status: 'creating',
    progress: 10,
    steps,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    suspended: false,
    intent: userIntent,
  };
}

export function advanceWorkspace(ws: WorkspaceSession): WorkspaceSession {
  if (ws.status === 'completed' || ws.status === 'suspended' || ws.status === 'closed') return ws;
  const steps = ws.steps.map(s => ({ ...s }));
  const activeIdx = steps.findIndex(s => s.status === 'active');
  if (activeIdx >= 0) {
    steps[activeIdx].status = 'done';
    if (activeIdx + 1 < steps.length) steps[activeIdx + 1].status = 'active';
  }
  const done = steps.filter(s => s.status === 'done').length;
  const completed = done === steps.length;
  const progress = completed ? 100 : Math.max(18, Math.round((done / Math.max(1, steps.length)) * 100));
  return { ...ws, steps, progress, status: completed ? 'completed' : 'running', updatedAt: Date.now() };
}

export function suspendWorkspace(ws: WorkspaceSession): WorkspaceSession {
  return { ...ws, status: 'suspended', suspended: true, updatedAt: Date.now() };
}
export function resumeWorkspace(ws: WorkspaceSession): WorkspaceSession {
  if (!ws.suspended) return ws;
  return { ...ws, status: ws.progress >= 100 ? 'completed' : 'running', suspended: false, updatedAt: Date.now() };
}
