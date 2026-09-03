import type { FlowStage, StageId } from './types.js';

const STAGE_META: Array<Pick<FlowStage, 'id' | 'title' | 'description'>> = [
  { id: 'organize', title: '整理变更', description: '把零散输入归类成新增、改进和修复。' },
  { id: 'write', title: '撰写说明', description: '将结构化要点写成面向用户的 Release notes。' },
  { id: 'check', title: '检查发布', description: '检查是否缺少验证信息，并补上可执行清单。' },
];

export function normalizeInput(value: unknown): string {
  if (typeof value !== 'string') throw new Error('变更内容必须是文本');
  const input = value.trim();
  if (input.length < 1 || input.length > 8_000) {
    throw new Error('变更内容长度需要在 1–8000 个字符之间');
  }
  return input;
}

export function createStages(): FlowStage[] {
  return STAGE_META.map((stage) => ({ ...stage, status: 'pending' as const }));
}

export function organizeChanges(input: string): string {
  const lines = input
    .split(/\r?\n|[;；]+/)
    .map((line) => line.replace(/^[-*\d.)、\s]+/, '').trim())
    .filter(Boolean);
  const unique = [...new Set(lines)];
  const buckets: Record<string, string[]> = { Added: [], Changed: [], Fixed: [], Other: [] };
  for (const line of unique) {
    const lower = line.toLocaleLowerCase();
    const bucket = /新增|添加|支持|增加|add|new|support|feature/.test(lower)
      ? 'Added'
      : /修复|解决|错误|fix|bug|修正/.test(lower)
        ? 'Fixed'
        : /优化|改进|更新|调整|升级|change|improve|update|refactor/.test(lower)
          ? 'Changed'
          : 'Other';
    buckets[bucket].push(line);
  }
  return Object.entries(buckets)
    .filter(([, values]) => values.length > 0)
    .map(([name, values]) => `### ${name}\n${values.map((value) => `- ${value}`).join('\n')}`)
    .join('\n\n');
}

export function writeReleaseNotes(organized: string): string {
  const sections = organized || '### Changes\n- 本次版本包含若干体验和稳定性改进。';
  return `# Release notes\n\n## Highlights\n\n本版本聚焦于让核心流程更清晰、更可靠。\n\n## Changes\n\n${sections}\n\n## Fixes\n\n- 已将输入内容整理为可追溯的发布条目。\n\n## Verification checklist\n\n- [ ] 完成核心路径 smoke test\n- [ ] 检查配置与文档是否同步\n- [ ] 确认回滚或后续跟进项\n`;
}

export function checkReleaseNotes(markdown: string): string {
  const missing: string[] = [];
  for (const heading of ['## Highlights', '## Changes', '## Fixes', '## Verification checklist']) {
    if (!markdown.includes(heading)) missing.push(heading.replace('## ', ''));
  }
  if (missing.length === 0) return '结构检查通过：四个标准区块齐全，可以进入人工发布前检查。';
  return `结构检查提示：缺少 ${missing.join('、')}。建议在发布前补齐。`;
}

export function runStage(stage: StageId, input: string, previous: string): string {
  if (stage === 'organize') return organizeChanges(input);
  if (stage === 'write') return writeReleaseNotes(previous);
  return checkReleaseNotes(previous);
}
