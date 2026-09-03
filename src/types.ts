export type RunStatus = 'draft' | 'running' | 'completed' | 'cancelled' | 'failed';
export type StageStatus = 'pending' | 'running' | 'done' | 'cancelled' | 'failed';
export type StageId = 'organize' | 'write' | 'check';

export interface FlowStage {
  id: StageId;
  title: string;
  description: string;
  status: StageStatus;
  output?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface FlowRun {
  id: string;
  input: string;
  templateId: 'release-notes';
  provider: 'demo';
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  status: RunStatus;
  stages: FlowStage[];
  markdown: string;
  summary?: string;
  error?: string;
}

export interface StoreData {
  version: 1;
  runs: FlowRun[];
}
