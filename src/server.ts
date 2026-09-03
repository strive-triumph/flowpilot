import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStages, normalizeInput, runStage } from './planner.js';
import { Store } from './store.js';
import type { FlowRun, FlowStage } from './types.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLIC_DIR = resolve(join(ROOT, 'public'));
const PORT = parsePort(process.env.FLOWPILOT_PORT);
const HOST = process.env.FLOWPILOT_HOST?.trim() || '127.0.0.1';
const dataDir = process.env.FLOWPILOT_DATA_DIR?.trim() || join(ROOT, 'data');
const store = new Store(join(dataDir, 'flowpilot.json'));
const PACKAGE_VERSION = readPackageVersion();
const subscribers = new Map<string, Set<ServerResponse>>();
const activeRuns = new Map<string, { cancelled: boolean }>();

class HttpError extends Error {
  public constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

await store.load();

const server = createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    if (error instanceof HttpError) sendError(response, error.status, error.code, message);
    else sendError(response, 500, 'internal_error', message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`FlowPilot listening at http://${HOST}:${PORT}`);
  console.log(`Data file: ${join(dataDir, 'flowpilot.json')}`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/api/health' && method === 'GET') {
    sendJson(response, 200, { status: 'ok', name: 'flowpilot', version: PACKAGE_VERSION, provider: 'demo', uptimeSeconds: Math.round(process.uptime()) });
    return;
  }
  if (pathname === '/api/templates' && method === 'GET') {
    sendJson(response, 200, { templates: [{ id: 'release-notes', name: '发布说明生成器', description: '把版本变更整理成可发布的 Markdown。', provider: 'demo' }] });
    return;
  }
  if (pathname === '/api/runs' && method === 'GET') {
    sendJson(response, 200, { runs: store.listRuns() });
    return;
  }
  if (pathname === '/api/runs' && method === 'POST') {
    const body = await readJson(request);
    const input = parseInput(body.input ?? body.goal);
    const run: FlowRun = {
      id: randomUUID(), input, templateId: 'release-notes', provider: 'demo',
      createdAt: new Date().toISOString(), status: 'draft', stages: createStages(), markdown: '',
    };
    await store.saveRun(run);
    broadcast(run);
    sendJson(response, 201, { run });
    return;
  }

  const match = pathname.match(/^\/api\/runs\/([^/]+)(?:\/(events|start|cancel|export))?$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    const action = match[2];
    if (action === 'events' && method === 'GET') return subscribe(id, response);
    if (action === 'start' && method === 'POST') {
      const run = await startRun(id);
      sendJson(response, 202, { run });
      return;
    }
    if (action === 'cancel' && method === 'POST') {
      const run = cancelRun(id);
      if (!run) sendError(response, 404, 'run_not_found', '找不到这个运行');
      else sendJson(response, 200, { run });
      return;
    }
    if (action === 'export' && method === 'GET') return exportRun(id, url.searchParams.get('format'), response);
    if (!action && method === 'GET') {
      const run = store.getRun(id);
      if (!run) sendError(response, 404, 'run_not_found', '找不到这个运行');
      else sendJson(response, 200, { run });
      return;
    }
    if (!action && method === 'PATCH') {
      const run = await updateRun(id, await readJson(request));
      if (!run) sendError(response, 404, 'run_not_found', '找不到这个运行');
      else sendJson(response, 200, { run });
      return;
    }
    if (!action && method === 'DELETE') {
      const removed = await store.deleteRun(id);
      if (!removed) sendError(response, 404, 'run_not_found', '找不到这个运行');
      else sendJson(response, 200, { ok: true });
      return;
    }
  }

  if (method === 'GET' && pathname.startsWith('/api/')) {
    sendError(response, 404, 'not_found', 'API 资源不存在');
    return;
  }
  if (method === 'GET') return serveStatic(pathname, response);
  sendError(response, 404, 'not_found', '资源不存在');
}

async function updateRun(id: string, body: Record<string, unknown>): Promise<FlowRun | undefined> {
  const run = store.getRun(id);
  if (!run) return undefined;
  if (body.input !== undefined) run.input = parseInput(body.input);
  if (body.markdown !== undefined) {
    if (typeof body.markdown !== 'string' || body.markdown.length > 40_000) throw new HttpError(400, 'invalid_markdown', 'Markdown 内容无效或过大');
    run.markdown = body.markdown;
  }
  await store.saveRun(run);
  broadcast(run);
  return run;
}

async function startRun(id: string): Promise<FlowRun> {
  const run = store.getRun(id);
  if (!run) throw new HttpError(404, 'run_not_found', '找不到这个运行');
  if (run.status === 'running') return run;
  if (run.status !== 'draft') throw new HttpError(409, 'run_not_draft', '这个运行已经结束，不能重复启动');
  if (activeRuns.size > 0) throw new HttpError(409, 'run_busy', '已有另一个运行正在执行');
  run.status = 'running'; run.startedAt = new Date().toISOString();
  activeRuns.set(id, { cancelled: false });
  await store.saveRun(run); broadcast(run); void executeRun(run);
  return run;
}

async function executeRun(run: FlowRun): Promise<void> {
  const control = activeRuns.get(run.id); if (!control) return;
  let previous = run.input;
  try {
    for (const stage of run.stages) {
      if (control.cancelled) { cancelPending(run.stages); run.status = 'cancelled'; break; }
      stage.status = 'running'; stage.startedAt = new Date().toISOString();
      await store.saveRun(run); broadcast(run); await wait(650);
      if (control.cancelled) { stage.status = 'cancelled'; cancelPending(run.stages); run.status = 'cancelled'; break; }
      stage.output = runStage(stage.id, run.input, previous); previous = stage.output;
      stage.status = 'done'; stage.finishedAt = new Date().toISOString();
      if (stage.id === 'write') run.markdown = stage.output;
      await store.saveRun(run); broadcast(run);
    }
    if (run.status === 'running') { run.status = 'completed'; run.summary = '三阶段流程已完成。你可以编辑 Markdown，再下载到发布工具中。'; }
    else if (run.status === 'cancelled') run.summary = `流程已取消，完成 ${run.stages.filter((stage) => stage.status === 'done').length}/3 个阶段。`;
    run.finishedAt = new Date().toISOString(); await store.saveRun(run); broadcast(run);
  } catch (error) {
    run.status = 'failed'; run.error = error instanceof Error ? error.message : '执行失败'; run.finishedAt = new Date().toISOString();
    await store.saveRun(run); broadcast(run);
  } finally { activeRuns.delete(run.id); }
}

function cancelRun(id: string): FlowRun | undefined {
  const run = store.getRun(id); const control = activeRuns.get(id);
  if (!run) return undefined; if (control && run.status === 'running') control.cancelled = true; return run;
}

function subscribe(id: string, response: ServerResponse): void {
  const run = store.getRun(id); if (!run) return sendError(response, 404, 'run_not_found', '找不到这个运行');
  response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  response.write(`data: ${JSON.stringify(run)}\n\n`);
  const set = subscribers.get(id) ?? new Set<ServerResponse>(); set.add(response); subscribers.set(id, set);
  response.on('close', () => { set.delete(response); if (set.size === 0) subscribers.delete(id); });
}

function broadcast(run: FlowRun): void {
  const set = subscribers.get(run.id); if (!set) return; const payload = `data: ${JSON.stringify(run)}\n\n`;
  for (const response of set) if (!response.destroyed) response.write(payload);
}

async function exportRun(id: string, format: string | null, response: ServerResponse): Promise<void> {
  const run = store.getRun(id); if (!run) return sendError(response, 404, 'run_not_found', '找不到这个运行');
  if (format === 'json') { response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="flowpilot-${id}.json"` }); response.end(JSON.stringify(run, null, 2)); return; }
  if (format !== 'md' && format !== null) return sendError(response, 400, 'invalid_format', 'format 只支持 md 或 json');
  response.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="release-notes-${id}.md"` }); response.end(run.markdown || '# Release notes\n');
}

async function serveStatic(pathname: string, response: ServerResponse): Promise<void> {
  const requested = pathname === '/' ? '/index.html' : pathname; const candidate = normalize(join(PUBLIC_DIR, requested));
  if (!candidate.startsWith(`${PUBLIC_DIR}/`) && candidate !== PUBLIC_DIR) return sendError(response, 400, 'invalid_path', '非法路径');
  const filePath = existsSync(candidate) ? candidate : join(PUBLIC_DIR, 'index.html'); const body = await readFile(filePath);
  response.writeHead(200, { 'Content-Type': contentType(extname(filePath)) }); response.end(body);
}

async function readJson(request: IncomingMessage): Promise<Record<string, any>> {
  let raw = ''; for await (const chunk of request) { raw += chunk.toString(); if (raw.length > 64 * 1024) throw new HttpError(413, 'body_too_large', '请求体过大'); }
  if (!raw) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new HttpError(400, 'invalid_json', '请求体不是合法 JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HttpError(400, 'invalid_body', '请求体必须是 JSON 对象'); return parsed as Record<string, any>;
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(payload)); }
function sendError(response: ServerResponse, status: number, code: string, message: string): void { sendJson(response, status, { error: { code, message } }); }
function cancelPending(stages: FlowStage[]): void { for (const stage of stages) if (stage.status === 'pending') stage.status = 'cancelled'; }
function wait(ms: number): Promise<void> { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }
function parsePort(value: string | undefined): number { const port = Number(value ?? 4317); return Number.isInteger(port) && port > 0 && port < 65536 ? port : 4317; }
function contentType(extension: string): string { return ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' } as Record<string, string>)[extension] ?? 'application/octet-stream'; }
function readPackageVersion(): string {
  try {
    const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version?: unknown };
    return typeof packageJson.version === 'string' ? packageJson.version : 'unknown';
  } catch {
    return 'unknown';
  }
}
function parseInput(value: unknown): string {
  try { return normalizeInput(value); }
  catch (error) { throw new HttpError(400, 'invalid_input', error instanceof Error ? error.message : '变更内容无效'); }
}
