const state = { runs: [], current: null, events: null };
const $ = (selector) => document.querySelector(selector);
const input = $('#input-text');

input.addEventListener('input', () => { $('#char-count').textContent = `${input.value.length} / 8000`; });
$('#run-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return toast('先输入几条变更，再开始运行。');
  try {
    const { run } = await api('/api/runs', { method: 'POST', body: JSON.stringify({ input: text }) });
    state.runs = [run, ...state.runs.filter((item) => item.id !== run.id)];
    selectRun(run);
    await api(`/api/runs/${run.id}/start`, { method: 'POST' });
    toast('流程已启动，正在依次处理三个阶段。');
  } catch (error) { toast(error.message, true); }
});

document.querySelectorAll('.example-chip').forEach((button) => button.addEventListener('click', () => {
  input.value = button.dataset.example || ''; input.dispatchEvent(new Event('input')); input.focus();
}));
$('#refresh-button').addEventListener('click', loadRuns);
$('#save-button').addEventListener('click', saveMarkdown);

async function loadRuns() {
  try { const result = await api('/api/runs'); state.runs = result.runs || []; if (state.current) state.current = state.runs.find((run) => run.id === state.current.id) || null; render(); }
  catch (error) { toast(error.message, true); }
}

function selectRun(run) {
  if (state.events) state.events.close();
  state.current = run; render();
  if (run.status === 'running') subscribe(run.id);
}

function subscribe(id) {
  state.events = new EventSource(`/api/runs/${encodeURIComponent(id)}/events`);
  state.events.onmessage = (event) => {
    const run = JSON.parse(event.data); state.current = run;
    state.runs = [run, ...state.runs.filter((item) => item.id !== run.id)]; render();
    if (!['running', 'draft'].includes(run.status)) { state.events.close(); state.events = null; }
  };
  state.events.onerror = () => { /* 浏览器会自动重连；最终状态仍可通过刷新恢复 */ };
}

async function saveMarkdown() {
  if (!state.current) return;
  try {
    const { run } = await api(`/api/runs/${state.current.id}`, { method: 'PATCH', body: JSON.stringify({ markdown: $('#markdown-editor').value }) });
    state.current = run; state.runs = [run, ...state.runs.filter((item) => item.id !== run.id)]; render(); toast('Markdown 已保存到本机。');
  } catch (error) { toast(error.message, true); }
}

async function cancelCurrent() {
  if (!state.current) return;
  try { const { run } = await api(`/api/runs/${state.current.id}/cancel`, { method: 'POST' }); state.current = run; render(); toast('已发出取消请求。'); }
  catch (error) { toast(error.message, true); }
}

async function duplicateCurrent() {
  if (!state.current) return;
  input.value = state.current.input; input.dispatchEvent(new Event('input')); input.focus(); toast('已把输入复制到左侧，可以修改后重新运行。');
}

async function deleteRun(id) {
  if (!confirm('删除这条历史运行？')) return;
  try { await api(`/api/runs/${id}`, { method: 'DELETE' }); state.runs = state.runs.filter((run) => run.id !== id); if (state.current?.id === id) { state.current = null; if (state.events) state.events.close(); } render(); toast('历史运行已删除。'); }
  catch (error) { toast(error.message, true); }
}

function render() { renderHistory(); renderRun(); }

function renderHistory() {
  const container = $('#history-list');
  if (!state.runs.length) { container.innerHTML = '<div class="history-empty">完成第一次运行后，<br>记录会出现在这里。</div>'; return; }
  container.innerHTML = state.runs.map((run) => `<button class="history-item ${state.current?.id === run.id ? 'selected' : ''}" data-id="${escapeHtml(run.id)}"><div class="history-item-title">${escapeHtml(run.input)}</div><div class="history-item-meta"><span>${formatDate(run.createdAt)}</span><span class="history-status ${run.status}">${statusText(run.status)}</span></div></button>`).join('');
  container.querySelectorAll('.history-item').forEach((item) => item.addEventListener('click', () => { const run = state.runs.find((candidate) => candidate.id === item.dataset.id); if (run) selectRun(run); }));
}

function renderRun() {
  const run = state.current;
  $('#run-empty').classList.toggle('hidden', Boolean(run)); $('#run-content').classList.toggle('hidden', !run); $('#run-actions').classList.toggle('hidden', !run);
  if (!run) return;
  $('#current-status').textContent = statusText(run.status); $('#current-status').className = `status-label ${run.status}`;
  $('#current-title').textContent = run.input.split(/\r?\n|[;；]/)[0].slice(0, 70);
  $('#current-time').textContent = formatDate(run.createdAt);
  $('#stages').innerHTML = run.stages.map((stage, index) => `<article class="stage ${stage.status}"><div class="stage-marker">${stage.status === 'done' ? '✓' : index + 1}</div><div class="stage-main"><div class="stage-top"><span class="stage-title">${escapeHtml(stage.title)}</span><span class="stage-state">${stageStateText(stage.status)}</span></div><div class="stage-desc">${escapeHtml(stage.description)}</div>${stage.output ? `<pre class="stage-output">${escapeHtml(stage.output)}</pre>` : ''}</div></article>`).join('');
  $('#markdown-editor').value = run.markdown || '';
  $('#run-summary').textContent = run.summary || (run.error ? `错误：${run.error}` : run.status === 'draft' ? '准备就绪，点击左侧生成并运行。' : '正在等待本地执行器…');
  $('#save-button').disabled = !run.markdown;
  $('#run-actions').innerHTML = run.status === 'running' ? '<button id="cancel-button">取消运行</button>' : '<button id="duplicate-button">复制输入</button><button id="delete-button">删除</button>';
  if ($('#cancel-button')) $('#cancel-button').addEventListener('click', cancelCurrent);
  if ($('#duplicate-button')) $('#duplicate-button').addEventListener('click', duplicateCurrent);
  if ($('#delete-button')) $('#delete-button').addEventListener('click', () => deleteRun(run.id));
  $('#result-actions').innerHTML = `<a class="result-actions-link" href="/api/runs/${encodeURIComponent(run.id)}/export?format=md" download>下载 .md</a><a class="result-actions-link" href="/api/runs/${encodeURIComponent(run.id)}/export?format=json" download>下载 .json</a>`;
}

function statusText(status) { return ({ draft: '草稿', running: '运行中', completed: '已完成', cancelled: '已取消', failed: '失败' })[status] || status; }
function stageStateText(status) { return ({ pending: '等待中', running: '处理中', done: '已完成', cancelled: '已取消', failed: '失败' })[status] || status; }
function formatDate(value) { try { return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); } catch { return ''; } }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
async function api(url, options = {}) { const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error?.message || `请求失败（${response.status}）`); return body; }
let toastTimer;
function toast(message, isError = false) { const node = $('#toast'); node.textContent = message; node.style.background = isError ? '#ffe9ee' : '#eafdf7'; node.style.color = isError ? '#5b1526' : '#092119'; node.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 2800); }

loadRuns();
