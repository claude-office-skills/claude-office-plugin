# WPS → Google Sheets 交互与逻辑体验迁移计划

## 概述

将 WPS Office Claude AI 插件的**整体交互逻辑与 UX 体验**迁移到已有的 Google Sheets Add-on 侧边栏。侧边栏使用纯 HTML/CSS/JS（无 React、无 npm、无构建步骤），所有智能能力通过本地代理 (127.0.0.1:3001) 的 HTTP API 复用。

**核心原则**：交互体验与 WPS 插件保持**功能对等**，在 Apps Script 与 HtmlService 限制下用渐进增强实现。

---

## 当前状态对比

| 能力 | Google Add-on | WPS Plugin |
|------|---------------|------------|
| 基础对话 | ✅ 代理 SSE / 直连 API | ✅ |
| 代码执行 | ✅ `google.script.run.executeGsCode()` | ✅ WPS ET API |
| 表格上下文 | ✅ `getSpreadsheetContext()` | ✅ |
| 消息渲染 | 纯文本 + 简单 code-block | Markdown + 17 种 block |
| 模式选择 | ❌ | Agent / Plan / Ask |
| 模型选择 | ❌ | Sonnet / Opus / Haiku |
| / 斜杠指令 | ❌ | ✅ SlashCommandPopup |
| @ 上下文引用 | ❌ | ✅ AtContextPopup |
| 快捷卡片 | ❌ | ✅ QuickActionCards |
| Diff 面板 | 简单列表 | 跳转单元格、撤回 |
| 历史/会话 | ❌ | ✅ HistoryPanel |
| Agent 多窗口 | ❌ | ✅ AgentListPanel |
| 主题切换 | ❌ | ✅ ThemeToggle |
| 代理功能 | 基础 chat | modes/agents/skills/memory/webSearch |

---

## 技术约束

- **侧边栏**：单个 HTML 文件，内联 `<style>` + `<script>`，无外部 JS 库、无 CDN
- **通信**：`google.script.run`（异步）、`fetch`（代理）、`localStorage`（持久化）
- **代理**：已支持 `/chat`、`/commands`、`/health`、`/health/v2`，SSE 事件含 `token`、`thinking`、`activity`、`agent_info`、`done`、`error`、`mode_info` 等
- **AllInOne.gs**：尽量不改动，仅必要时新增 `google.script.run` 入口（如 `revertChanges`、`navigateToCell` 已存在）

---

## 阶段划分与依赖

```
Phase 1: 消息渲染增强           ──► 立即可测
Phase 2: 模式与模型选择器       ──► 依赖 Phase 1
Phase 3: 斜杠与 @ 引用          ──► 依赖 Phase 1
Phase 4: 快捷卡片与 Diff 增强   ──► 依赖 Phase 1, 2
Phase 5: 历史与会话管理         ──► 依赖 Phase 2
Phase 6: 主题、Onboarding、收尾 ──► 依赖 Phase 1~5
```

---

## Phase 1：消息渲染增强（~1.5 sessions）

### 目标

- 消息气泡支持 Markdown 渲染（标题、列表、表格、粗体、代码块）
- 代码块带语法高亮（可选，或至少语言标签）
- 支持 `thinking` 状态展示（流式时的「思考中...」）
- 支持 `activity` 事件展示（MCP 工具调用等）

### 任务清单

| 序号 | 任务 | 文件 | 工作量 |
|-----|------|------|--------|
| T1.1 | 引入轻量 Markdown 解析：使用 `marked` 或自写简单 parser（正则匹配 `**bold**`、`# header`、`` `code` ``、表格等） | Sidebar.html | 中 |
| T1.2 | 实现 `renderMarkdown(text)`，输出 sanitized HTML（防 XSS） | Sidebar.html | 中 |
| T1.3 | SSE 处理中增加 `thinking` 事件，在流式 div 上方显示「思考中...」占位 | Sidebar.html | 低 |
| T1.4 | SSE 处理中增加 `activity` 事件，在消息内显示简要活动标签（如「🔧 工具调用」） | Sidebar.html | 低 |
| T1.5 | 扩展代理 `/chat` 请求体：传入 `mode`、`model`（为 Phase 2 预留） | Sidebar.html | 低 |

### 验收标准

- [ ] 助手回复正确显示 Markdown 格式
- [ ] 代码块有语言标签和基础样式
- [ ] 流式过程中显示「思考中」状态
- [ ] activity 事件在消息内可见

### 风险

- **Markdown 库体积**：若用 CDN，需确认 HtmlService 允许；否则用自写轻量 parser

---

## Phase 2：模式与模型选择器（~1 session）

### 目标

- 模式选择：Agent / Plan / Ask，与代理 `mode` 参数一致
- 模型选择：Sonnet / Opus / Haiku（或代理支持的子集）
- 选择结果持久化到 localStorage，并传给 `/chat`

### 任务清单

| 序号 | 任务 | 文件 | 工作量 |
|-----|------|------|--------|
| T2.1 | 在输入区上方实现 ModeSelector：三个选项，点击切换，样式参考 WPS | Sidebar.html | 中 |
| T2.2 | 实现 ModelSelector：下拉或横向 tabs，点击切换 | Sidebar.html | 中 |
| T2.3 | localStorage 存储 `mode`、`model`，启动时恢复 | Sidebar.html | 低 |
| T2.4 | `sendViaProxy` 请求体增加 `mode`、`model` 字段 | Sidebar.html | 低 |
| T2.5 | Plan 模式：解析步骤列表（正则 `\d+[.)]\s+(.+)`），渲染为可执行步骤块（执行按钮待 Phase 4 或简化实现） | Sidebar.html | 中 |

### 验收标准

- [ ] 切换模式/模型后，下次请求携带正确参数
- [ ] 刷新后选择保持
- [ ] Plan 模式回复能识别并展示步骤列表

### 依赖

- Phase 1 完成（消息渲染已支持）

---

## Phase 3：斜杠指令与 @ 引用（~1.5 sessions）

### 目标

- 输入框输入 `/` 时弹出 SlashCommandPopup，调用 `/commands` 获取指令列表
- 支持 `/team`、`/workflow`、`/help` 等系统命令 + 代理返回的技能指令
- 输入 `@` 时弹出 AtContextPopup，列出当前选区、使用区域、工作表名
- 选择后插入对应文本到输入框

### 任务清单

| 序号 | 任务 | 文件 | 工作量 |
|-----|------|------|--------|
| T3.1 | 输入框 `input` 监听 `input`/`keydown`：检测 `/` 或 `@` 开头，显示弹窗 | Sidebar.html | 中 |
| T3.2 | 实现 SlashCommandPopup：fetch `/commands`，渲染列表，支持 ↑↓ 选择、Enter 确认、Esc 关闭 | Sidebar.html | 中 |
| T3.3 | 系统命令：`/team `、`/workflow `、`/help` 填入输入框或直接发送 | Sidebar.html | 低 |
| T3.4 | 实现 AtContextPopup：基于 `spreadsheetCtx` 构建选项（选区、usedRange、各 sheet） | Sidebar.html | 中 |
| T3.5 | 选择 @ 选项后，在光标处插入 `@当前选区(...)` 等文本 | Sidebar.html | 中 |
| T3.6 | `buildContextString` 已支持完整 ctx，需与 `@` 插入格式一致 | Sidebar.html | 低 |

### 验收标准

- [ ] `/` 弹出指令列表，选择后正确执行或填入
- [ ] `@` 弹出上下文选项，选择后插入到输入框
- [ ] 键盘导航（↑↓ Enter Esc）正常

### 依赖

- Phase 1 完成（上下文 `spreadsheetCtx` 已有）

---

## Phase 4：快捷卡片与 Diff 增强（~1 session）

### 目标

- 输入区上方显示 QuickActionCards，水平滚动，点击发送预设 prompt
- Diff 面板支持：点击单元格跳转、撤回按钮（调用 `revertChanges`）

### 任务清单

| 序号 | 任务 | 文件 | 工作量 |
|-----|------|------|--------|
| T4.1 | 实现 QuickActionCards：fetch `/quick-actions` 或使用硬编码 prompt 列表（分析数据、创建图表等） | Sidebar.html | 中 |
| T4.2 | 卡片样式：小图标 + 文案，hover 高亮 | Sidebar.html | 低 |
| T4.3 | 点击卡片将 prompt 填入输入框或直接发送 | Sidebar.html | 低 |
| T4.4 | Diff 面板：每个变更行可点击，调用 `google.script.run.navigateToCell(sheetName, cellAddress)` | Sidebar.html | 低 |
| T4.5 | Diff 面板：增加「撤回」按钮，调用 `google.script.run.revertChanges(diff)` | Sidebar.html | 低 |
| T4.6 | 存储最近一次执行产生的 diff 引用，供撤回使用 | Sidebar.html | 低 |

### 验收标准

- [ ] 快捷卡片显示且可点击发送
- [ ] Diff 中单元格可跳转
- [ ] 撤回按钮能正确还原变更

### 依赖

- AllInOne.gs 已有 `navigateToCell`、`revertChanges`（需确认 `revertChanges` 签名）

### 说明

- `/quick-actions` 若代理未提供，可使用 WPS 侧的默认列表硬编码

---

## Phase 5：历史与会话管理（~1.5 sessions）

### 目标

- 会话列表：展示历史会话，支持切换、新建、删除
- 数据存储：localStorage（key 如 `gsheets_claude_sessions`）
- 新建会话：清空当前消息，创建新会话 ID
- 切换会话：加载对应消息列表并渲染

### 任务清单

| 序号 | 任务 | 文件 | 工作量 |
|-----|------|------|--------|
| T5.1 | 设计会话数据结构：`{ id, title, messages, model, mode, updatedAt }` | Sidebar.html | 低 |
| T5.2 | 实现 `saveSession`、`loadSession`、`listSessions`、`deleteSession`（纯 client-side） | Sidebar.html | 中 |
| T5.3 | 实现 HistoryPanel 弹窗：列表展示，点击加载 | Sidebar.html | 中 |
| T5.4 | 顶部或 status-bar 增加「历史」按钮，打开 HistoryPanel | Sidebar.html | 低 |
| T5.5 | 当前会话变化时自动保存（如消息更新后 1s 防抖） | Sidebar.html | 中 |
| T5.6 | 新会话标题：取首条用户消息前 30 字或「新对话」 | Sidebar.html | 低 |

### 验收标准

- [ ] 新建、切换、删除会话正常
- [ ] 刷新后会话列表保持
- [ ] 切换会话后消息正确展示

### 依赖

- Phase 2 完成（mode/model 需随会话保存）

### 说明

- 若代理有 `/sessions` API，可考虑同步；本阶段以 localStorage 为主

---

## Phase 6：主题、Onboarding 与收尾（~1 session）

### 目标

- 主题切换：亮/暗（或跟随系统），CSS 变量控制
- 首次使用 Onboarding：简短引导（3–4 步），完成后写入 localStorage
- AttachmentMenu 精简版：Web 搜索开关（传给代理 `webSearch`）
- 其他 polish：错误提示优化、状态栏信息完善

### 任务清单

| 序号 | 任务 | 文件 | 工作量 |
|-----|------|------|--------|
| T6.1 | 定义亮/暗主题 CSS 变量，实现 ThemeToggle 按钮 | Sidebar.html | 中 |
| T6.2 | localStorage 存储 `theme`，启动时应用 | Sidebar.html | 低 |
| T6.3 | Onboarding：检测 `onboarded`，未完成则显示引导 overlay | Sidebar.html | 中 |
| T6.4 | Web 搜索开关：小图标/开关，状态存 localStorage，请求时传 `webSearch` | Sidebar.html | 低 |
| T6.5 | 错误提示统一、status 文案优化 | Sidebar.html | 低 |

### 验收标准

- [ ] 主题切换生效
- [ ] 首次打开显示 Onboarding，完成后不再显示
- [ ] Web 搜索开关可切换并传给代理

### 依赖

- Phase 1~5 完成

---

## 优先级与 UX 价值排序

| 优先级 | 阶段 | 主要价值 |
|--------|------|----------|
| P0 | Phase 1 | 消息可读性、专业感 |
| P0 | Phase 2 | 工作流核心（Agent/Plan/Ask） |
| P1 | Phase 3 | 输入效率（/ 与 @） |
| P1 | Phase 4 | 快捷操作、Diff 可操作性 |
| P2 | Phase 5 | 多会话管理 |
| P3 | Phase 6 | 体验 polish |

**建议执行顺序**：Phase 1 → Phase 2 → Phase 3 → Phase 4，每阶段完成后做一次端到端验证。

---

## AllInOne.gs 变更清单（最小化）

| 变更 | 必要性 | 说明 |
|------|--------|------|
| `navigateToCell(sheetName, cellAddress)` | 已存在 | 无需改动 |
| `revertChanges(diff)` | 已存在 | 需确认调用方式（参数为 diff 对象） |
| `getSpreadsheetContext()` | 已存在 | 无需改动 |
| `getSheetData(sheetName, maxRows)` | 可选 | 若 @ 引用需要按 sheet 拉全表数据时使用 |
| 其他 | 无 | 保持现状 |

---

## 代理 API 使用清单

| 接口 | 用途 |
|------|------|
| `POST /chat` | 发送消息，SSE 流式响应。body: `messages`, `context`, `model`, `mode`, `webSearch`, `attachments`, `agentName` |
| `GET /commands` | 斜杠指令列表 |
| `GET /health` | 代理存活检测 |
| `GET /quick-actions` | 快捷卡片（若存在） |
| `GET /health/v2` | 心跳（可选） |

**SSE 事件类型**（需在 Sidebar 中处理）：

- `token`：文本流
- `thinking`：思考过程
- `activity`：工具/活动
- `agent_info`：当前 Agent 信息
- `mode_info`：模式信息
- `plan_created`：计划步骤
- `done`：结束
- `error`：错误

---

## 测试策略

| 类型 | 范围 |
|------|------|
| 手动 | 每 Phase 完成后在 Sheets 中打开侧边栏，发送消息、切换模式、执行代码，验证渲染与行为 |
| 代理 | 确保 `node proxy-server.js` 运行，Sidebar 能连上 3001 |
| 回归 | 每 Phase 后确认：基础对话、代码执行、Diff 显示 仍正常 |

---

## 成功标准

1. **交互对等**：用户能获得与 WPS 插件相近的输入/输出体验（模式、模型、指令、引用、快捷操作）
2. **代理复用**：所有智能逻辑（modes、agents、skills、memory、webSearch）通过代理实现，侧边栏仅做 UI 与编排
3. **可维护**：Sidebar.html 结构清晰，关键逻辑有注释，便于后续扩展
4. **每阶段可测**：每个 Phase 完成后即可独立验证，不阻塞后续阶段

---

## 附录：WPS 17 种 Block 与 Google 侧简化映射

| WPS Block | Google 侧实现 |
|------------|---------------|
| code-js, code-python, code-html, code-json | 统一为带语言标签的 code-block，仅 JS 可执行 |
| terminal | 显示为代码块，不执行（或提示「仅 Agent 模式支持」） |
| mcp-tool | 通过 activity 事件展示简要信息 |
| thinking | 流式时「思考中」占位 |
| plan-steps | 解析并渲染步骤列表，可点击执行（Phase 2/4） |
| exec-result | 执行成功后在 code-block 下方显示 |
| data-table | 可选：Markdown 表格渲染 |
| cell-change | 即 Diff 面板 |
| chart-image | 若有 base64 图片，用 img 展示 |
| skill-create, memory, progress, approval, reference | 按需简化或跳过 |
| 其他 | 降级为 Markdown 文本 |

---

*文档版本：1.0 | 创建日期：2026-03-10*
