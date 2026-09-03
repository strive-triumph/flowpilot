# FlowPilot

> 把零散变更，变成能发布的说明。

FlowPilot（流程小舵手）是一个本地优先的发布说明工作台：粘贴提交记录或工作笔记，运行三个可观察阶段——**整理变更 → 撰写说明 → 检查发布**——得到可以直接复制到 GitHub Release 的 Markdown。

它的 Demo provider 完全离线，不需要账号、API Key 或数据库服务。项目的重点是把“下载 → 安装 → 跑通一次完整流程 → 导出结果”做成一个可复现的开源闭环。

## 30 秒开始

需要 Node.js 20 或更高版本：

```bash
git clone https://github.com/strive-triumph/flowpilot.git
cd flowpilot
npm ci
npm run build
npm start
```

打开 <http://127.0.0.1:4317>，点击左侧示例即可看到完整流程。

也可以使用安装脚本：

```bash
./install.sh
```

安装脚本会自动识别源码仓库和 GitHub Release 的预编译归档：前者执行构建，后者直接安装运行时依赖。

Windows PowerShell：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install.ps1
```

## Docker

```bash
docker compose up -d --build
```

然后打开 <http://127.0.0.1:4317>。运行记录会持久化到 Docker volume `flowpilot-data`。

## 产品流程

1. 粘贴版本变更、提交摘要或工作笔记。
2. 点击“生成并运行”。
3. 观察三个阶段的实时状态和中间输出。
4. 在最终结果框中编辑 Markdown。
5. 下载 `.md` 或 `.json`，作为发布说明或审阅材料。
6. 刷新页面或重启服务，历史运行仍然保留。

默认 Demo 模式使用确定性本地规则，不会发起网络请求，也不会执行 shell 命令。它是一个完整可用的演示模式，不是等待配置后才能使用的半成品。

## 配置

所有配置都是可选的：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `FLOWPILOT_HOST` | `127.0.0.1` | 监听地址；公网部署前请自行配置反向代理和访问控制 |
| `FLOWPILOT_PORT` | `4317` | 监听端口 |
| `FLOWPILOT_DATA_DIR` | `./data` | 本地 JSON 数据目录 |

复制 `.env.example` 可以查看示例。当前版本不保存任何 provider 密钥；未来接入真实模型时，密钥也只应放在本机环境变量中。

## API 快速检查

```bash
curl http://127.0.0.1:4317/api/health
curl http://127.0.0.1:4317/api/templates
```

创建一次运行：

```bash
curl -X POST http://127.0.0.1:4317/api/runs \
  -H 'content-type: application/json' \
  -d '{"input":"新增 CSV 导出；修复登录超时；优化首页加载"}'
```

返回的 `run.id` 传给 `POST /api/runs/:id/start` 即可启动，随后通过 `GET /api/runs/:id` 查询结果；浏览器界面使用同一组 API 和 SSE 事件流。

## 开发与验证

```bash
npm run typecheck   # TypeScript 类型检查
npm test            # 单元测试 + 构建
npm run build       # 生成 dist/
npm run dev         # 监听模式开发
```

项目只使用 Node 内置 HTTP/文件模块和 TypeScript 编译器，减少安装依赖和运行时风险。CI 会在 Node 20 和 Node 22 上执行类型检查、测试和构建。

## 发布下载

项目的 tag workflow 会生成：

- `flowpilot-vX.Y.Z.tar.gz`：包含运行所需源码、`dist/` 和静态资源
- `SHA256SUMS`：压缩包校验和

从 [Releases](https://github.com/strive-triumph/flowpilot/releases) 下载后，解压并执行：

```bash
npm install --omit=dev
npm start
```

如果希望固定版本，请使用具体 tag，不要直接依赖 `main`。

## 安全边界

FlowPilot 默认只监听 loopback，数据保存在本机。它不会主动上传输入，也不会执行任意命令。若将监听地址改为 `0.0.0.0`，请在可信网络或认证反向代理后使用；当前 MVP 没有多用户认证。

详见 [SECURITY.md](SECURITY.md)。

## 许可证

MIT License，见 [LICENSE](LICENSE)。
