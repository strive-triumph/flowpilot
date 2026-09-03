import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { FlowRun, StoreData } from './types.js';

const EMPTY_DATA: StoreData = { version: 1, runs: [] };

export class Store {
  private data: StoreData = { ...EMPTY_DATA, runs: [] };

  public constructor(private readonly filePath: string) {}

  public async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (!isStoreData(parsed)) {
        throw new Error('数据文件格式无效');
      }
      this.data = parsed;
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code !== 'ENOENT') {
        throw error;
      }
      await this.persist();
    }
  }

  public listRuns(): FlowRun[] {
    return this.data.runs.map(cloneRun);
  }

  public getRun(id: string): FlowRun | undefined {
    const run = this.data.runs.find((item) => item.id === id);
    return run ? cloneRun(run) : undefined;
  }

  public async saveRun(run: FlowRun): Promise<void> {
    const index = this.data.runs.findIndex((item) => item.id === run.id);
    if (index === -1) {
      this.data.runs.unshift(cloneRun(run));
    } else {
      this.data.runs[index] = cloneRun(run);
    }
    this.data.runs = this.data.runs.slice(0, 50);
    await this.persist();
  }

  public async deleteRun(id: string): Promise<boolean> {
    const before = this.data.runs.length;
    this.data.runs = this.data.runs.filter((run) => run.id !== id);
    if (this.data.runs.length === before) return false;
    await this.persist();
    return true;
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
    await rename(tempPath, this.filePath);
  }
}

function isStoreData(value: unknown): value is StoreData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoreData>;
  return candidate.version === 1 && Array.isArray(candidate.runs);
}

function cloneRun(run: FlowRun): FlowRun {
  return JSON.parse(JSON.stringify(run)) as FlowRun;
}
