# FlowPilot 产品规范（MVP）

## 1. 产品定义

FlowPilot（流程小舵手）是一个无需账号、无需 API Key 的本地发布说明工作台。用户粘贴版本变更或零散工作笔记，FlowPilot 将内容依次整理、撰写、检查，生成可直接复制到 GitHub Release 的 Markdown，并在本机保存运行记录。

一句话价值：**把零散变更记录变成一份能直接发布的说明。**

## 2. 目标用户与场景

- 想快速试用“AI 工作流”形态，但不想先配置云服务的人。
- 需要把提交记录、修复项整理成清晰发布说明的开发者。
- 想下载一个开源项目，几分钟内看到完整产品闭环的开发者。

## 3. MVP 用户流程

1. 安装依赖并启动 FlowPilot。
2. 在首页粘贴版本变更，例如“修复登录超时；新增 CSV 导出；优化首页加载”。
3. 点击“生成流程”，本地规则引擎生成“整理 → 撰写 → 检查”三个阶段。
4. 用户可以修改最终 Markdown，并保存或导出。
5. 点击“开始运行”，三个阶段按顺序执行，界面实时显示 pending / running / done。
6. 每一步生成一段可追溯的本地执行记录；流程结束后显示 Release notes Markdown。
7. 刷新页面或重启服务，运行记录仍然存在。

## 4. 产品边界

MVP 默认不调用外部模型、不执行任意 shell、不上传用户数据。阶段执行是确定性的本地 Demo provider，目的是打通产品闭环和安装体验。后续可以在不改变 UI/API 合约的前提下替换为 OpenAI-compatible provider。

## 5. 功能需求

### F1. 发布说明生成

- 输入变更文本长度 1–8000 字符。
- 固定生成三个阶段：整理变更、撰写说明、检查发布风险。
- 最终结果包含 `Highlights`、`Changes`、`Fixes`、`Verification checklist` 四个区块。

### F2. 流程编辑

- 编辑最终 Markdown 并保存。

### F3. 流程执行

- 同一时刻只运行一个流程。
- 阶段状态按 `pending → running → done` 变化。
- 可取消运行；取消后未执行阶段保持 `pending`。
- 运行结果、输入和结束时间写入本地数据文件。

### F4. 历史记录与导出

- 展示最近 20 次运行。
- 可打开历史详情、复制为新运行。
- 可导出 Markdown 和 JSON。
- 数据目录可通过 `FLOWPILOT_DATA_DIR` 覆盖。

### F5. 可安装与可发布

- Node.js 20+，`npm install && npm run build && npm start` 可运行。
- 提供 Dockerfile、docker-compose、Linux/macOS 安装脚本和 Windows PowerShell 安装脚本。
- GitHub Actions 在 push/PR 时执行类型检查、构建和测试；tag 时生成可下载压缩包。

## 6. 非功能要求

- 默认只监听 `127.0.0.1`，避免误暴露。
- 不收集遥测，不需要账号，不把输入发往网络。
- API 返回统一 JSON 错误结构。
- 核心逻辑使用 Node 内置模块，降低安装失败面。
- UI 在桌面和窄屏浏览器均可用。

## 7. 验收标准

- [ ] 新机器按 README 命令可启动首页。
- [ ] 输入变更文本后能生成三阶段流程。
- [ ] 能编辑阶段和最终 Markdown 并成功运行。
- [ ] 运行进度在 UI 中可见，完成后有 Release notes 摘要。
- [ ] 能下载 Markdown 和 JSON 结果。
- [ ] 重启服务后历史仍在。
- [ ] `npm test`、`npm run typecheck`、`npm run build` 全部通过。
- [ ] Docker 构建并启动后可访问健康检查和首页。
- [ ] GitHub Actions 配置能在干净 runner 上执行。
