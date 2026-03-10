# Claude Office Plugin

跨平台办公套件 AI 助手——通过自然语言对话操控表格，由 Claude API 驱动。

![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-3.0.0-orange)
![Platform](https://img.shields.io/badge/platform-WPS%20|%20Google%20Sheets%20|%20Office-blue)

## 支持平台

| 平台 | 状态 | 说明 |
|------|------|------|
| **WPS Office ET** | ✅ 已完成 | 通过 WPS Plugin Host + 本地代理 |
| **Google Sheets** | 🚧 开发中 | 通过 Apps Script + HtmlService 侧边栏 |
| **Microsoft Office Excel** | 📋 规划中 | 通过 Office.js Add-in |

## 功能特性

- **自然语言对话**：直接用中文描述需求，AI 自动生成并执行平台原生代码
- **三种交互模式**：Agent（自动执行）/ Plan（步骤规划）/ Ask（只读分析）
- **实时上下文感知**：自动读取当前工作表、选区数据，智能匹配 Skill
- **代码执行桥**：生成的代码可一键在表格应用中执行，支持结果回传 + 一键修复
- **流式响应**：SSE 流式输出，Markdown 渲染 + 代码块语法高亮
- **会话历史**：自动保存对话记录，支持多会话切换和恢复
- **模块化 Skills/Commands**：可扩展的技能和命令体系（9 Skills + 14 Commands）
- **连接器系统**：通过 MCP 协议接入外部数据源（网络搜索、企业知识库）
- **工作流模板**：预定义多步骤任务（如月度报告自动生成）
- **剪贴板增强**：支持粘贴文本、表格、图片
- **模型选择**：Sonnet 4.6 / Opus 4.6 / Haiku 4.5
- **统一代码库**：一套 React 代码 + HostAdapter 抽象层，输出多平台构建产物

## 架构概览

```
                    ┌──────────────────┐
                    │   React Sidebar  │
                    │   src/App.tsx    │
                    │  (HostAdapter)   │
                    └────────┬─────────┘
                             │
               ┌─────────────┼─────────────┐
               │             │             │
   ┌───────────▼──┐  ┌──────▼───────┐  ┌──▼──────────┐
   │  WPS Plugin  │  │ Google Sheets│  │ Office.js   │
   │  Host (ET)   │  │ (Apps Script)│  │ (未来)      │
   │  wpsAdapter  │  │ gsAdapter    │  │             │
   └──────────────┘  └──────────────┘  └─────────────┘
               │             │
               └──────┬──────┘
                      │
              ┌───────▼───────┐
              │ Proxy Server  │
              │ (Express:3001)│
              │ Claude CLI    │
              └───────────────┘
```

### 构建产物

| 平台 | 输出目录 | 构建命令 | 说明 |
|------|---------|---------|------|
| WPS ET | `dist/` | `npm run build` | 多文件，通过 TaskPane 加载 |
| Google Sheets | `dist-gsheets/` | `npm run build:gsheets` | 单文件 HTML，通过 HtmlService 加载 |

## 快速开始

### 前置条件

- **Node.js** >= 18
- **Claude CLI**：`npm install -g @anthropic-ai/claude-code && claude login`
- **WPS Office**（可选，浏览器可独立预览）

### 1. 克隆并配置

```bash
git clone https://github.com/claude-office-skills/claude-wps-plugin.git
cd claude-wps-plugin
cp .env.example .env
```

编辑 `.env` 选择模型（默认 Sonnet 4.5）：

```
VITE_CLAUDE_MODEL=claude-sonnet-4-5
```

### 2. 安装依赖 & 启动

```bash
npm install

# 一键启动（Proxy + Dev Server）
npm start

# 或分别启动
npm run proxy   # 启动代理服务器 :3001
npm run dev     # 启动前端开发服务器 :5173
```

### 3. 使用方式

#### 方法 A：浏览器预览（无需 WPS）
打开 `http://localhost:5173` 即可预览插件 UI，工作在 Mock 模式（模拟 WPS 数据）。

#### 方法 B：WPS Office 加载项（完整功能）

**自动安装**（推荐）：
```bash
# macOS 一键启动 + 注入 WPS
bash install-to-wps.sh

# 或双击「启动插件.command」
```

**手动安装**：
1. 确保 proxy 和 dev server 已启动
2. 打开 WPS Excel → **开发工具 → 加载项 → 浏览**
3. 选择项目根目录下的 `manifest.xml`
4. 插件出现在 Ribbon 栏 → 点击 **打开 Claude**

### 4. 构建生产包

```bash
npm run build          # WPS 前端构建
npm run build:gsheets  # Google Sheets 单文件 HTML 构建
npm run build:all      # 同时构建 WPS + Google Sheets
npm run build:dist     # WPS 完整分发包（Skill 嵌入 + 混淆 + tarball）
```

### 5. Google Sheets 部署

```bash
# 一键部署（构建 + clasp push）
npm run deploy:gsheets

# 详细步骤见 google-addon/README.md
```

## 项目结构

```
claude-office-plugin/
├── src/                           # React 前端（跨平台侧边栏）
│   ├── api/
│   │   ├── hostAdapter.ts         # 平台无关接口定义
│   │   ├── platformDetect.ts      # 平台检测 + HostAdapter 工厂
│   │   ├── wpsAdapter.ts          # WPS 平台适配器
│   │   ├── googleSheetsAdapter.ts # Google Sheets 平台适配器
│   │   ├── claudeClient.ts        # Claude API 调用（SSE + GAS 回退）
│   │   └── sessionStore.ts        # 会话持久化（CRUD + 记忆）
│   ├── components/
│   │   ├── CodeBlock.tsx           # 代码块（语法高亮 + Run/Copy）
│   │   ├── MessageBubble.tsx       # 消息气泡（Markdown 渲染）
│   │   ├── QuickActionCards.tsx    # 快捷命令卡片（按模式切换）
│   │   ├── ModeSelector.tsx        # 交互模式选择器（Agent/Plan/Ask）
│   │   ├── ModelSelector.tsx       # AI 模型选择器
│   │   ├── AttachmentMenu.tsx      # 附件菜单（剪贴板/PDF/图片）
│   │   └── HistoryPanel.tsx        # 历史会话面板
│   ├── App.tsx                     # 主应用（对话 + 状态管理）
│   └── types.ts                    # TypeScript 类型定义
├── proxy-server.js                 # Express 代理服务器（:3001）
├── skills/                         # 技能系统
│   ├── bundled/                    # 内置 Skills（9 个）
│   │   ├── wps-core-api/           #   WPS ET API 完整参考
│   │   ├── code-rules/             #   代码生成规范
│   │   ├── data-cleaning/          #   数据清洗
│   │   ├── formula-operations/     #   公式运算
│   │   ├── conditional-formatting/ #   条件格式
│   │   ├── data-analysis/          #   数据分析
│   │   ├── financial-modeling/     #   金融建模
│   │   ├── chart-creation/         #   图表创建
│   │   └── template-generation/    #   模板生成
│   ├── modes/                      # 交互模式（3 个）
│   │   ├── agent/                  #   自动执行模式
│   │   ├── plan/                   #   步骤规划模式
│   │   └── ask/                    #   只读分析模式
│   ├── connectors/                 # MCP 连接器（2 个）
│   │   ├── web-search/             #   网络搜索
│   │   └── knowledge-base/         #   企业知识库
│   └── workflows/                  # 工作流模板（1 个）
│       └── monthly-report/         #   月度报告生成
├── commands/                       # 快捷命令（14 个 .md 文件）
├── wps-addon/                      # WPS 加载项运行时
│   ├── main.js                     #   Plugin Host 入口
│   ├── ribbon.xml                  #   Ribbon 栏 UI 定义
│   └── *.png                       #   图标资源
├── google-addon/                   # Google Sheets Add-on
│   ├── AllInOne.gs                 #   合并的 Apps Script 后端
│   ├── appsscript.json             #   Add-on 清单
│   ├── .clasp.json                 #   clasp 配置
│   └── Sidebar.html                #   构建生成的侧边栏 UI
├── google-sheets.html              # Google Sheets 构建入口
├── vite.gsheets.config.ts          # Google Sheets Vite 配置
├── deploy-gsheets.mjs              # Google Sheets 部署脚本
├── manifest.xml                    # WPS 加载项清单
├── .claude-plugin/plugin.json      # 插件元数据
├── .mcp.json                       # MCP 连接器配置
├── AGENTS.md                       # AI Agent 行为定义
├── CONNECTORS.md                   # 连接器使用说明
├── build-dist.mjs                  # 生产构建脚本
├── install-to-wps.sh               # 自动安装脚本
└── 启动插件.command                 # macOS 双击启动器
```

## 使用示例

在 WPS 中选中数据区域，然后在对话框输入：

- `"删除 A 列中的重复内容，保留第一条"`
- `"把 B 列的日期统一转换成 YYYY-MM-DD 格式"`
- `"统计 C 列的平均值和总和"`
- `"删除所有空白行"`
- `"把第一行设置为加粗并填充灰色背景"`
- `"生成一个销售数据柱状图"`
- `"智能填充缺失的邮编数据"`

Claude 会生成 WPS JS 代码，点击 `[Run]` 执行即可。执行失败时可一键重试修复。

### 交互模式

| 模式 | 适用场景 | 特点 |
|------|---------|------|
| **Agent** | 直接操作表格 | 自动生成并执行代码，快速完成任务 |
| **Plan** | 复杂多步骤任务 | 先输出计划，逐步确认后执行 |
| **Ask** | 数据分析咨询 | 只读模式，纯文本回答，不生成代码 |

## 自定义与扩展

### 添加自定义 Skill

在 `skills/bundled/` 下创建新目录，编写 `SKILL.md`：

```markdown
---
name: my-custom-skill
description: 我的自定义技能
version: 1.0.0
context:
  keywords: [关键词1, 关键词2]
  always: false
---

## 技能描述

在此编写 System Prompt 内容...
```

### 添加自定义 Command

在 `commands/` 下创建 `.md` 文件：

```markdown
---
icon: 🎯
label: 我的命令
description: 命令描述
scope: general
---

命令的 prompt 内容...
```

### 配置 MCP 连接器

编辑 `.mcp.json` 填入你的 MCP 服务器地址：

```json
{
  "mcpServers": {
    "tavily-search": {
      "type": "http",
      "url": "https://your-tavily-mcp-endpoint"
    }
  }
}
```

详见 `CONNECTORS.md`。

## Fork 指南

Fork 本项目后，你可能需要修改以下内容：

| 文件 | 需要改什么 |
|------|-----------|
| `.env` | 选择你偏好的 Claude 模型 |
| `.mcp.json` | 配置你的 MCP 连接器 URL |
| `.claude-plugin/plugin.json` | 修改 `author` 字段为你的信息 |
| `manifest.xml` | 修改 `ProviderName` 和 `Id` |
| `skills/bundled/` | 添加/修改内置技能 |
| `commands/` | 添加/修改快捷命令 |
| `skills/modes/` | 自定义交互模式行为 |

### 扩展架构

```
skills/
├── bundled/     → 内置技能（随插件分发）
├── modes/       → 交互模式定义
├── connectors/  → MCP 数据源连接器
├── workflows/   → 多步骤工作流模板
├── managed/     → 社区技能（预留）
└── workspace/   → 用户自定义技能（预留）
```

所有技能文件均采用 **Markdown + YAML frontmatter** 格式，无需修改代码即可扩展功能。

## 版本日志

### v1.6.0 (2026-02-27) — 主题系统 + Multi-Agent 并行设计

**深色/浅色/自动主题切换**
- 历史记录按钮旁新增主题切换按钮，支持 `dark` / `light` / `auto` 三种模式
- 自动模式跟随系统偏好（`window.matchMedia('prefers-color-scheme')`）
- CSS 自定义属性（Custom Properties）驱动全局色彩，迁移所有硬编码颜色值
- 通过 `localStorage` 持久化用户选择
- `useTheme.ts` Hook 封装三态逻辑及 `matchMedia` 监听

**Multi-Agent 并行执行设计**（OfficeExcelPlugin.pen）
- Agent 侧边标签栏：各 Agent 状态（Running / Done / Queued）+ 实时动作步骤
- 活跃 Agent 对话视图：消息流、代码块流式输出、实时活动 Feed
- 新建 Agent 流程：4 步引导（选模式 → 绑上下文 → 描述任务 → 启动并行）
- 核心逻辑架构：AgentManager 中央管理、生命周期状态机、并发调度（MAX_CONCURRENT=3）、冲突解决策略
- 7 个 REST API 端点设计 + 实现优先级与工作量估算（P0/P1/P2，~7.5 人天）

**默认行为变更**
- 默认主题从 `dark` 改为 `auto`（跟随系统）

### v1.5.0 (2026-02-26) — 单元格动画 + DiffPanel + 选区引用

**新增功能**
- 单元格逐行动画：Claude 生成表格数据后，逐行逐单元格填充，提供可视化"AI 正在工作"效果
- DiffPanel 组件：代码执行前后的变更对比展示
- 选区引用功能：聊天时可引用当前选中的单元格区域作为上下文
- 新建子表检测：Claude 代码创建新 Sheet 时，自动调整 diff 基准为空白状态

**改进**
- 侧边栏默认位置从右侧改为左侧
- 加载动画颜色从紫色改为 Excel 品牌绿（#217346）
- Ribbon 标题改为 "Claude for Excel"

**修复**
- 修复单元格动画中 `ws.Cells` 不可用问题（改用 `ws.Range("A1").Value2`）
- 修复代码执行后白屏问题
- 修复流式输出中断问题
- 修复 TaskPane 崩溃后无法重新打开问题

### v1.4.0 (2026-02-26) — 多模式交互 + 连接器 + 工作流

**交互模式系统**
- 新增 `ModeSelector` 组件，支持 Agent / Plan / Ask 三种模式切换
- 模式定义文件化（`skills/modes/*.md`），通过 frontmatter `enforcement` 控制行为
- Ask 模式禁止生成代码块，Plan 模式先规划后执行
- QuickActionCards 根据当前模式动态切换推荐操作
- `/modes` API 端点返回模式元数据和快捷操作

**MCP 连接器**
- 新增连接器架构（`skills/connectors/`），通过 `~~category` 占位符实现工具无关设计
- 内置 `web-search`（网络搜索）和 `knowledge-base`（企业知识库）连接器
- `.mcp.json` 配置文件，支持替换为任意同类 MCP 服务器
- `CONNECTORS.md` 文档说明连接器约定

**工作流模板**
- 新增工作流架构（`skills/workflows/`），预定义多步骤任务
- 内置 `monthly-report` 工作流（月度报告自动生成）
- 工作流可指定首选模式、所需技能、触发关键词

**plugin.json 升级**
- 完整声明 modes / connectors / workflows 能力清单

### v1.3.0 (2026-02-26) — 会话持久化 + 交互增强

**会话历史管理**
- 新增 `sessionStore.ts`：会话 CRUD + 自动标题生成 + 用户记忆
- 新增 `HistoryPanel` 组件：历史会话列表、切换、删除
- 启动时自动恢复最近一次会话
- 消息变化后 1s 去抖自动保存

**交互体验优化**
- Proxy 连接检测改为自动重试（最多 10 次，间隔 2s）
- 代码执行失败支持一键"重试修复"
- 剪贴板增强：支持粘贴图片（macOS PNGf）和 HTML 表格
- System Prompt 强化：上下文优先级、代码长度限制、ActiveSheet 强制

**WPS Plugin Host 增强**
- 重构为后台同步架构：定时推送上下文 + 轮询执行代码队列
- TaskPane 管理：持久化面板 ID，支持 toggle 显示/隐藏

**工程化**
- 新增 `build-dist.mjs` 生产构建脚本
- `npm start` 一键启动 proxy + dev

### v1.2.0 (2026-02-25) — 数据驱动的能力补齐

- 新增 5 个 Skills：`data-cleaning`、`formula-operations`、`conditional-formatting`、`data-analysis`、`financial-modeling`
- 新增 5 个 Commands：`smart-split`、`freeze-header`、`fill-cells`、`beautify-table`、`conditional-format`
- 上下文感知 Skill 匹配：用户消息关键词 + 选区特征自动加载对应 Skill

### v1.1.0 (2026-02-25) — Cowork 风格模块化重构

- Skills/Commands 模块化（借鉴 Anthropic Cowork + OpenClaw 架构）
- Skill Loader 按需匹配加载，减少 token 消耗
- 三层 skill 目录：`bundled/` → `managed/` → `workspace/`

### v1.0.0 (2026-02-25) — MVP 完整版

- React Task Pane (Vite + React + TypeScript) 侧边栏 UI
- Express Proxy Server (:3001)，通过 claude CLI 执行 AI 对话 (SSE 流式)
- WPS Plugin Host 上下文同步 + 代码执行桥
- Markdown 渲染 + 代码块语法高亮 + 9 个快捷操作
- 附件菜单：剪贴板读取、PDF 提取、图片上传

---

## 后续计划

- [x] Phase 3：Skills/Commands 模块化重构（v1.1.0）
- [x] Phase 4：数据驱动能力补齐 + 上下文感知（v1.2.0）
- [x] Phase 5A：会话持久化 + 交互增强（v1.3.0）
- [x] Phase 5B：多模式交互 + 连接器 + 工作流（v1.4.0）
- [x] Phase 5C：单元格动画 + DiffPanel + 选区引用（v1.5.0）
- [x] Phase 5D：主题系统 + Multi-Agent 并行设计（v1.6.0）
- [ ] Phase 6：Multi-Agent 并行执行实现（基于 v1.6.0 设计）
- [ ] Phase 7：操作历史 + 撤销功能
- [ ] Phase 8：跨应用上下文（表格 → 演示 → 文档）
- [ ] Phase 9：企业版后端（API Key 集中管理、审计日志）

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite 7 |
| 样式 | CSS Modules |
| AI | Claude CLI (SSE 流式) |
| 代理 | Express 5 |
| 宿主 | WPS Office JS API (ET) |
| 连接器 | MCP (Model Context Protocol) |
| 渲染 | react-markdown + remark-gfm + react-syntax-highlighter |

## 贡献指南

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feat/my-feature`
3. 提交更改：`git commit -m "feat: 添加新功能"`
4. 推送分支：`git push origin feat/my-feature`
5. 创建 Pull Request

### Commit 规范

```
feat: 新功能
fix: 修复 Bug
refactor: 重构（非新增功能/非修复）
docs: 文档更新
chore: 构建/工具链
```

### 添加新 Skill

参见 [自定义与扩展](#自定义与扩展) 部分，所有技能均为 Markdown 文件，无需修改代码。

## 相关项目

| 项目 | 说明 |
|------|------|
| [claude-wps-ppt-plugin](https://github.com/claude-office-skills/claude-wps-ppt-plugin) | Claude for WPS PowerPoint |
| [claude-wps-word-plugin](https://github.com/claude-office-skills/claude-wps-word-plugin) | Claude for WPS Word |

## License

[MIT](./LICENSE)

---

# 上线前测试用例

> **测试环境要求**
> - WPS Office（最新版）已安装并登录
> - 终端执行 `node proxy-server.js` 已启动
> - 已在 WPS 中安装插件（运行 `./install-to-wps.sh` 或手动导入 `manifest.xml`）
> - 打开 WPS ET，点击 Ribbon 中「Claude for Excel」按钮，侧边栏成功弹出

## 测试前准备

1. 新建一个空白工作簿（工作表名保持默认 Sheet1）
2. 启动 proxy-server：
   ```bash
   cd ~/需求讨论/claude-wps-plugin
   node proxy-server.js
   ```
3. 确认侧边栏顶部状态条显示 **WPS**（非 mock）

---

## 模块 1：基础连通性

### TC-01 代理服务器健康检查
- **操作**：在浏览器中访问 `http://127.0.0.1:3001/health`
- **预期**：返回 `{"status":"ok"}` 或类似成功响应
- **通过标准**：HTTP 200

### TC-02 侧边栏正常加载
- **操作**：点击 WPS Ribbon「Claude for Excel」按钮
- **预期**：
  - 侧边栏从**左侧**弹出（非右侧）
  - 显示欢迎语「你好！我是 Claude，你的 WPS Excel AI 助手。」
  - 顶部显示 Claude 图标 + "Claude for Excel" + "Beta" 徽章
- **通过标准**：界面完整，无白屏

### TC-03 WPS 上下文识别
- **操作**：在 Sheet1 的 A1:D3 选中 4 列 3 行
- **预期**：侧边栏顶部出现蓝色选区上下文条，显示 `Sheet1!A1:D3（3 行 × 4 列）`，右侧显示 **WPS** 标签
- **通过标准**：上下文条内容与实际选区一致

### TC-04 代理未启动警告
- **操作**：关闭 `proxy-server.js` 进程后，在侧边栏发送任意消息
- **预期**：显示黄色警告条「⚠ 代理服务器未运行...」；发送消息后显示「无法连接代理服务器」错误
- **通过标准**：提示清晰，界面不崩溃

---

## 模块 2：Agent 模式（自动执行）

> 测试前确认底部模式选择器已选中 **Agent**

### TC-10 建表 — 生成简单表格
- **前置**：选中 A1 单元格
- **输入**：`帮我建一个 5 行的员工信息表，包含姓名、部门、工资、入职日期`
- **预期**：
  - 流式输出代码及说明
  - 代码自动执行（Agent 模式自动触发）
  - Sheet1 中出现表头 + 5 行示例数据
  - 消息气泡下方显示「✓ 执行成功」及 Diff 变更数量
- **通过标准**：表格写入成功，无报错气泡

### TC-11 数据清洗 — 去重
- **前置**：在 A 列输入 10 行数据，其中有 3 行重复（如姓名列多行相同）
- **操作**：选中 A 列数据区域
- **输入**：`去掉重复的行`
- **预期**：重复行被删除，数据精简，执行结果描述重复删除数量
- **通过标准**：去重后行数正确

### TC-12 公式操作
- **前置**：在 A1:A10 填写随机数字
- **操作**：选中 B1
- **输入**：`在 B 列用公式计算 A 列每个数的平方`
- **预期**：B1:B10 填入 `=A1^2` 等公式（或直接计算值）
- **通过标准**：B 列数据正确，无执行错误

### TC-13 格式化操作
- **前置**：有一个包含数字的表格（如 C 列为金额）
- **输入**：`把 C 列的数字设置为货币格式，保留 2 位小数`
- **预期**：C 列单元格格式变为货币样式
- **通过标准**：格式应用成功，无脚本错误

### TC-14 逐行动画效果
- **输入**：`生成一个 10 行的销售记录表，包含产品名称、数量、单价`
- **预期**：单元格逐行填充，能看到数据逐行出现的动画效果（非一次性刷新）
- **通过标准**：有明显逐行写入的视觉效果

### TC-15 代码执行失败 → 修复重试
- **输入**：发送一条指令，等其执行后如果出现红色错误气泡
- **预期**：
  - 消息气泡显示红色错误信息
  - 气泡底部出现「修复」按钮
  - 点击修复按钮，自动发送修复请求并重新执行
- **通过标准**：修复流程完整，最终写入成功

---

## 模块 3：Plan 模式（步骤规划）

> 切换底部模式选择器至 **Plan**

### TC-20 规划模式输出格式
- **输入**：`帮我分析当前工作簿的数据并生成月度汇总报告`
- **预期**：
  - 输出编号步骤计划（如「步骤 1: 读取数据...」）
  - **不自动执行代码**
  - 代码块（如有）显示「应用」按钮而非自动执行
- **通过标准**：无自动执行，输出为步骤计划文本

### TC-21 Plan 模式代码块可手动应用
- **操作**：接 TC-20，若有代码块，点击「应用」按钮
- **预期**：代码被执行，显示执行结果
- **通过标准**：手动应用成功

---

## 模块 4：Ask 模式（只读分析）

> 切换底部模式选择器至 **Ask**

### TC-30 Ask 模式无代码输出
- **前置**：Sheet1 有数据
- **输入**：`分析一下当前表格的数据规律`
- **预期**：
  - 回复为纯文字分析，**无代码块**
  - 若模型尝试给出代码，应被替换为提示「此处为代码操作，请切换至 Agent 模式执行」
- **通过标准**：无可执行代码块渲染

### TC-31 Ask 模式切换提示
- **输入**：`帮我清洗数据`（需要操作的指令）
- **预期**：
  - 回复末尾出现「切换至 Agent 模式」提示按钮
  - 点击按钮，模式自动切换为 Agent
- **通过标准**：切换按钮出现且功能正常

---

## 模块 5：图表创建

### TC-40 创建折线图
- **前置**：在 A1:B6 写入年份+数值数据（如 2020-2024 的营收）
- **操作**：选中数据区域
- **输入**：`根据这个数据创建一个折线图`
- **预期**：
  - 生成图表，定位在数据**右侧**（而非下方）
  - 图表类型为折线图
  - 有标题和图例
- **通过标准**：图表正常显示，不遮挡数据

### TC-41 量级差异处理
- **前置**：准备两列量级差异超过 5 倍的数据（如营收 5000 vs 净利率 0.15）
- **输入**：`为这两个指标分别创建图表，展示趋势`
- **预期**：生成**两张独立图表**，不合并在同一图表中
- **通过标准**：两张图表分别展示，Y 轴刻度各自合适

---

## 模块 6：上下文切换健壮性

### TC-50 切换工作表后上下文刷新
- **操作**：
  1. 在 Sheet1 发送「统计 A 列数据」
  2. 新建 Sheet2 并切换过去
  3. 发送「现在帮我在当前表写入标题行」
- **预期**：第二条消息操作的是 **Sheet2**，而非 Sheet1
- **通过标准**：代码执行写入 Sheet2，而不是 Sheet1

### TC-51 选区引用功能
- **操作**：
  1. 选中 B2:D10
  2. 点击选区上下文条的「引用」按钮
- **预期**：输入框出现引用标签「Sheet1!B2:D10（9×3）」
- **通过标准**：引用 chip 正确显示，可通过 × 移除

### TC-52 选区防抖稳定性
- **操作**：快速在多个单元格之间点击，触发频繁选区变化
- **预期**：上下文条不频繁闪烁，有短暂防抖后才更新
- **通过标准**：上下文条稳定，无快速跳动

---

## 模块 7：会话管理

### TC-60 历史记录保存
- **操作**：发送 3 条消息后，点击右上角「历史记录」图标
- **预期**：历史面板显示当前会话，标题为第一条用户消息的前 30 字
- **通过标准**：会话列表可见且内容正确

### TC-61 切换历史会话
- **操作**：在历史面板点击一条历史会话
- **预期**：
  - 消息列表切换为该历史会话内容
  - loading 状态清除（无永久加载圈）
  - 模型选择器同步恢复为该会话使用的模型
- **通过标准**：切换流畅，界面无异常

### TC-62 新对话清空
- **操作**：点击右上角「新对话」图标
- **预期**：
  - 消息列表清空，只剩欢迎语
  - 输入框清空
  - 当前进行中的请求（若有）被中断
- **通过标准**：新会话状态干净

---

## 模块 8：附件与文件

### TC-70 粘贴表格数据
- **操作**：复制 Excel 表格中的一段数据（Ctrl+C），在输入框中粘贴（Ctrl+V）
- **预期**：输入框出现「粘贴表格」chip，附带行列数信息
- **通过标准**：表格数据以 chip 形式附加

### TC-71 图片上传（如功能可用）
- **操作**：点击输入框左下角附件按钮，选择一张截图
- **预期**：图片以缩略图 chip 形式显示在输入框中
- **通过标准**：图片 chip 出现，发送后 Claude 能描述图片内容

---

## 模块 9：停止与中断

### TC-80 停止生成
- **操作**：发送一个较长任务（如「生成 50 行数据」），在流式输出过程中点击「停止」按钮
- **预期**：
  - 流式输出停止
  - loading 状态消失
  - 消息气泡保留已输出部分，末尾显示「（已中止生成）」
  - 已发送的输入文字恢复到输入框
- **通过标准**：停止后界面状态完全正常，可继续发送新消息

### TC-81 网络中断恢复
- **操作**：手动停止 `proxy-server.js`，然后发送消息，再重启 proxy
- **预期**：
  - 停止期间发送消息显示连接错误
  - proxy 重启后（约 3 秒内），警告条消失，可正常发消息
- **通过标准**：自动重连检测生效（错误时 3s 重试）

---

## 模块 10：健壮性边界

### TC-90 空消息不可发送
- **操作**：输入框为空，点击发送按钮
- **预期**：发送按钮处于禁用状态（灰色），点击无反应
- **通过标准**：不发送空消息

### TC-91 发送中不可重复提交
- **操作**：发送消息后，在 loading 期间再次点击发送或按 Enter
- **预期**：无新请求发出，界面保持单次请求状态
- **通过标准**：无重复消息气泡

### TC-92 超长输入截断保护
- **操作**：尝试粘贴超过 20,000 字符的文本到输入框
- **预期**：超出部分被丢弃，输入框字符数不超过 20,000
- **通过标准**：字符限制生效

### TC-93 模型切换
- **操作**：在模型选择器中切换为 `Haiku 4.5`，发送一条简单消息
- **预期**：Claude 以 Haiku 模型响应（响应速度明显更快）
- **通过标准**：切换生效，正常响应

### TC-94 主题切换
- **操作**：点击右上角主题按钮，循环切换 auto / light / dark
- **预期**：界面配色随主题实时切换
- **通过标准**：三种主题均正常渲染，刷新后记忆上次主题

---

## 模块 11：快捷指令卡片

### TC-100 选区快捷指令
- **前置**：选中包含数据的区域
- **操作**：点击快捷卡片「去重复」「数据统计」等
- **预期**：自动填充对应 prompt 并发送，执行相应操作
- **通过标准**：快捷指令功能正确触发

### TC-101 无选区时快捷指令状态
- **操作**：取消所有单元格选中，查看快捷卡片
- **预期**：选区相关的快捷指令（如「去重复」）显示为灰色或不显示
- **通过标准**：快捷指令按上下文正确启用/禁用

---

## 测试结果记录表

| 用例 | 模块 | 状态 | 备注 |
|------|------|------|------|
| TC-01 | 连通性 | ⬜ | |
| TC-02 | 连通性 | ⬜ | |
| TC-03 | 连通性 | ⬜ | |
| TC-04 | 连通性 | ⬜ | |
| TC-10 | Agent | ⬜ | |
| TC-11 | Agent | ⬜ | |
| TC-12 | Agent | ⬜ | |
| TC-13 | Agent | ⬜ | |
| TC-14 | Agent | ⬜ | |
| TC-15 | Agent | ⬜ | |
| TC-20 | Plan | ⬜ | |
| TC-21 | Plan | ⬜ | |
| TC-30 | Ask | ⬜ | |
| TC-31 | Ask | ⬜ | |
| TC-40 | 图表 | ⬜ | |
| TC-41 | 图表 | ⬜ | |
| TC-50 | 上下文 | ⬜ | |
| TC-51 | 上下文 | ⬜ | |
| TC-52 | 上下文 | ⬜ | |
| TC-60 | 会话 | ⬜ | |
| TC-61 | 会话 | ⬜ | |
| TC-62 | 会话 | ⬜ | |
| TC-70 | 附件 | ⬜ | |
| TC-71 | 附件 | ⬜ | |
| TC-80 | 中断 | ⬜ | |
| TC-81 | 中断 | ⬜ | |
| TC-90 | 健壮性 | ⬜ | |
| TC-91 | 健壮性 | ⬜ | |
| TC-92 | 健壮性 | ⬜ | |
| TC-93 | 健壮性 | ⬜ | |
| TC-94 | 健壮性 | ⬜ | |
| TC-100 | 快捷指令 | ⬜ | |
| TC-101 | 快捷指令 | ⬜ | |

> 状态：⬜ 待测 / ✅ 通过 / ❌ 失败 / ⚠️ 部分通过

---

## 上线 Checklist

**强制通过（上线前必须全部 ✅）：**
- [ ] TC-01 代理健康检查
- [ ] TC-02 侧边栏正常加载
- [ ] TC-03 WPS 上下文识别
- [ ] TC-10 建表基础功能
- [ ] TC-11 数据清洗
- [ ] TC-80 停止生成
- [ ] TC-90 空消息保护
- [ ] TC-91 防重复提交

**建议通过率 ≥ 85% 再发布正式版本。**
