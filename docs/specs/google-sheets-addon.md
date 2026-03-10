# Google Sheets Workspace Add-on — Phase 1 Spec

## 目标

将 Claude Office AI 助手从 WPS 专属扩展为支持 Google Sheets，以 Google Workspace Add-on 形式集成。

## 用户故事

> 作为 Google Sheets 用户，我希望在侧边栏中与 Claude AI 对话、分析数据、生成公式和图表，以便提升工作效率。

## 架构概览

```
┌──────────────────────┐       ┌──────────────────┐
│  Google Sheets UI    │       │  Sidebar (React)  │
│  SpreadsheetApp API  │◄─────►│  HtmlService      │
│  (Apps Script 后端)   │       │  google.script.run │
└──────────┬───────────┘       └────────┬──────────┘
           │ UrlFetchApp                │ postMessage
           ▼                            ▼
┌──────────────────────────────────────────────────┐
│              Cloud Proxy (Express)                │
│  - Claude AI 调用                                 │
│  - Skill 匹配                                    │
│  - 代码生成                                       │
│  - Session 管理                                   │
└──────────────────────────────────────────────────┘
```

### 数据流

1. 用户在 Sidebar 输入消息
2. Sidebar JS 调用 `google.script.run.getSpreadsheetContext()` 获取表格上下文
3. Sidebar JS 调用 `google.script.run.sendToProxy(payload)` 发送到云端 Proxy
4. Proxy 调用 Claude API，匹配 Skill，返回响应（含代码块）
5. 如有代码需要执行，Sidebar 调用 `google.script.run.executeCode(code)`
6. `Executor.gs` 在 Apps Script 环境执行代码，操作 SpreadsheetApp
7. 结果返回 Sidebar 渲染

## 文件结构

```
google-addon/
├── appsscript.json          # Workspace Add-on 清单
├── Code.gs                  # 入口：菜单、侧边栏打开
├── Context.gs               # 上下文收集 (SpreadsheetApp)
├── ProxyClient.gs           # 云端 Proxy 通信 (UrlFetchApp)
├── Executor.gs              # 代码执行 + diff 捕获
├── Sidebar.html             # 侧边栏 HTML 外壳 (嵌入 React)
├── Config.gs                # 配置管理 (PropertiesService)
└── .clasp.json              # clasp 本地配置
```

## 功能边界

### In Scope (Phase 1)
- [x] 侧边栏 UI（复用现有 React 应用）
- [x] 上下文收集（工作簿名、Sheet 列表、选区、已用范围）
- [x] 与云端 Proxy 通信（发消息、收流式响应）
- [x] Apps Script 代码执行（读写单元格、格式化）
- [x] Diff 捕获（执行前后快照对比）
- [x] Google Sheets API Skill

### Out of Scope (Phase 2+)
- 云端 Proxy 部署（本阶段用开发隧道）
- OAuth 用户认证
- Marketplace 发布
- Google Docs / Slides 支持

## 关键技术决策

| 决策 | 方案 | 理由 |
|------|------|------|
| Sidebar 渲染 | HtmlService + 内联 JS（无外部依赖） | 无需外部服务器托管前端；HTTPS 必须 |
| 前后端通信 | google.script.run (异步 RPC) | Apps Script 标准方式；最多 10 并发 |
| Proxy 通信 | UrlFetchApp → HTTPS | Apps Script 不支持 WebSocket |
| Chat 模式 | 异步提交 + 轮询（submitChat → pollChatResult） | Add-on 函数调用限 30s，Claude 响应可能 > 30s |
| 代码执行 | new Function() in Executor.gs | V8 runtime 支持；Apps Script 沙箱自带安全隔离 |
| 数据序列化 | Date→String, ''→null | google.script.run 只允许 primitives/objects/arrays |
| 开发工具 | clasp CLI | Google 官方 Apps Script 开发工具 |

## Apps Script 限制与应对（深度研究）

参考:
- [Quotas](https://developers.google.com/apps-script/guides/services/quotas)
- [Client-Server Communication](https://developers.google.com/apps-script/guides/html/communication)
- [HTML Restrictions](https://developers.google.com/apps-script/guides/html/restrictions)
- [Best Practices](https://developers.google.com/apps-script/guides/html/best-practices)

| 限制 | 数值 | 应对 |
|------|------|------|
| Script runtime | 6 min / execution | Executor 加超时保护 |
| Add-on function call | 30s / execution | Chat 拆为 submit + poll 两步 |
| google.script.run 并发 | 10 concurrent | 前端 pendingCallCount 计数器 |
| UrlFetchApp calls | 20K/day (consumer), 100K/day (Workspace) | Poll 间隔 800ms，不做无意义轮询 |
| UrlFetchApp POST size | 50 MB | 上下文采样 20 行，远小于限制 |
| Properties total storage | 500 KB | 仅存 PROXY_URL + SESSION_ID |
| 参数/返回值类型 | primitives, objects, arrays only | Date→String；不传 Function/DOM |
| IFRAME sandbox | HTTPS only; no top navigation | `<base target="_top">`; 无外部 HTTP 资源 |
| Private functions | 尾部 `_` 后缀 | helper 函数用 `_` 后缀隐藏 |

## 验收标准

1. 在 Google Sheets 中打开侧边栏，能看到 Claude AI 聊天界面
2. 发送消息后能收到 AI 回复（即使 Claude 响应 > 30s 也不超时）
3. AI 能读取当前选区和工作表数据
4. AI 生成的 Apps Script 代码能执行并修改表格
5. 执行结果正确显示 diff（变更了哪些单元格）
6. Date 类型正确序列化为字符串，无 "TypeError: Failed due to illegal value"
