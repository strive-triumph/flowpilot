import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const port = 4400 + Math.floor(Math.random() * 300);
const dataDir = await mkdtemp(join(tmpdir(), 'flowpilot-smoke-'));
const env = { ...process.env, FLOWPILOT_HOST: '127.0.0.1', FLOWPILOT_PORT: String(port), FLOWPILOT_DATA_DIR: dataDir };
let child;

try {
  child = spawn(process.execPath, ['dist/server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = `http://127.0.0.1:${port}`;
  await waitForHealth(`${base}/api/health`);
  const health = await get(`${base}/api/health`);
  assert.equal(health.status, 'ok');
  const created = await request(`${base}/api/runs`, 'POST', { input: '新增 CSV 导出；修复登录超时；优化首页加载' });
  assert.equal(created.run.status, 'draft');
  const id = created.run.id;
  await request(`${base}/api/runs/${id}/start`, 'POST');
  let run;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(180);
    run = await get(`${base}/api/runs/${id}`);
    if (run.run.status === 'completed') break;
  }
  assert.equal(run.run.status, 'completed');
  assert.equal(run.run.stages.filter((stage) => stage.status === 'done').length, 3);
  assert.match(run.run.markdown, /## Verification checklist/);
  const exported = await fetch(`${base}/api/runs/${id}/export?format=md`);
  assert.equal(exported.status, 200);
  assert.match(await exported.text(), /# Release notes/);
  child.kill('SIGTERM');
  await onceExit(child);
  child = spawn(process.execPath, ['dist/server.js'], { env, stdio: 'ignore' });
  await waitForHealth(`${base}/api/health`);
  const afterRestart = await get(`${base}/api/runs`);
  assert.equal(afterRestart.runs.length, 1);
  assert.equal(afterRestart.runs[0].id, id);
  const edited = await request(`${base}/api/runs/${id}`, 'PATCH', { markdown: `${run.run.markdown}\n<!-- edited in smoke -->\n` });
  assert.match(edited.run.markdown, /edited in smoke/);
  const cancelled = await request(`${base}/api/runs`, 'POST', { input: '验证取消流程' });
  await request(`${base}/api/runs/${cancelled.run.id}/start`, 'POST');
  await sleep(100);
  await request(`${base}/api/runs/${cancelled.run.id}/cancel`, 'POST');
  let cancelledRun;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(120);
    cancelledRun = await get(`${base}/api/runs/${cancelled.run.id}`);
    if (cancelledRun.run.status === 'cancelled') break;
  }
  assert.equal(cancelledRun.run.status, 'cancelled');
  const invalid = await fetch(`${base}/api/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(invalid.status, 400);
  console.log('Smoke passed: health → create → start → three stages → export → restart → edit → cancel → validation');
} finally {
  if (child && !child.killed) child.kill('SIGTERM');
  await rm(dataDir, { recursive: true, force: true });
}

async function get(url) { const response = await fetch(url); assert.equal(response.ok, true, `GET ${url} failed: ${response.status}`); return response.json(); }
async function request(url, method, body) { const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const payload = await response.json(); assert.equal(response.ok, true, `${method} ${url} failed: ${JSON.stringify(payload)}`); return payload; }
async function waitForHealth(url) { for (let i = 0; i < 40; i += 1) { try { const response = await fetch(url); if (response.ok) return; } catch { /* process is still booting */ } await sleep(100); } throw new Error('server did not become healthy'); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function onceExit(processHandle) { return new Promise((resolve) => processHandle.once('exit', resolve)); }
