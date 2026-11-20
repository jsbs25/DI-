export type AgentState = 'Autonomous' | 'Summoned' | 'Engaged' | 'Tasking' | 'Deliver' | 'Resting';

export type Emotion = 'neutral' | 'happy' | 'curious' | 'thinking' | 'surprised' | 'comforting' | 'celebrating' | 'focused';

export type WorkspaceMode =
  | 'learning'
  | 'reading'
  | 'research'
  | 'creation'
  | 'video'
  | 'music'
  | 'files'
  | 'communication'
  | 'general';

export type WorkspaceStatus = 'idle' | 'creating' | 'running' | 'suspended' | 'completed' | 'closed';

export interface CapabilityDef {
  id: string;
  tab: string;
  nameZh: string;
  nameEn: string;
  descriptionZh: string;
  descriptionEn: string;
  intents: string[];
  workspaceMode: WorkspaceMode;
  category: 'core' | 'knowledge' | 'creation' | 'media' | 'social' | 'explore' | 'system';
  preserved: true;
}

export interface TaskPlanStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done';
}

export interface WorkspaceSession {
  id: string;
  capabilityTab: string;
  title: string;
  mode: WorkspaceMode;
  status: WorkspaceStatus;
  progress: number;
  steps: TaskPlanStep[];
  createdAt: number;
  updatedAt: number;
  suspended: boolean;
  intent: string;
}

export interface AgentSnapshot {
  state: AgentState;
  emotion: Emotion;
  statusText: string;
  currentBehavior: string;
  position: { x: number; y: number; facing: 'left' | 'right' };
}

export interface DispatchResult {
  handled: boolean;
  capability?: CapabilityDef;
  responseText: string;
  openTab?: string;
}
