import test from 'node:test';
import assert from 'node:assert/strict';
import { checkReleaseNotes, createStages, normalizeInput, organizeChanges, runStage, writeReleaseNotes } from '../dist/planner.js';

test('normalizes input and rejects empty or oversized text', () => {
  assert.equal(normalizeInput('  修复登录  '), '修复登录');
  assert.throws(() => normalizeInput(''), /1–8000/);
  assert.throws(() => normalizeInput('x'.repeat(8001)), /1–8000/);
});

test('organizes and de-duplicates release changes', () => {
  const result = organizeChanges('新增 CSV 导出\n修复登录超时\n新增 CSV 导出\n优化首页加载');
  assert.match(result, /Added/);
  assert.match(result, /Fixed/);
  assert.match(result, /Changed/);
  assert.equal(result.match(/CSV 导出/g).length, 1);
});

test('demo provider produces the three-stage release notes contract', () => {
  const stages = createStages();
  assert.deepEqual(stages.map((stage) => stage.id), ['organize', 'write', 'check']);
  const organized = runStage('organize', '新增导出；修复超时', '');
  const markdown = runStage('write', '新增导出；修复超时', organized);
  const check = runStage('check', '新增导出；修复超时', markdown);
  assert.match(markdown, /^# Release notes/m);
  assert.match(markdown, /## Highlights/);
  assert.match(markdown, /## Changes/);
  assert.match(markdown, /## Fixes/);
  assert.match(markdown, /## Verification checklist/);
  assert.match(check, /结构检查通过/);
  assert.equal(checkReleaseNotes(markdown), check);
  assert.match(writeReleaseNotes(organized), /Release notes/);
});
