# Claude for WPS Excel 插件

WPS Office Excel AI 助手——通过自然语言对话操控表格，由 Claude API 驱动。

## 快速开始

### 1. 配置 API Key

```bash
cp .env.example .env
```

编辑 `.env`，填入你的 Claude API Key：

```
VITE_CLAUDE_API_KEY=sk-ant-api03-xxxxxxxx
VITE_CLAUDE_MODEL=claude-sonnet-4-5
```

### 2. 安装依赖 & 启动开发服务器

```bash
npm install
npm run dev
```

开发服务器启动在 `http://localhost:5173`。

### 3. 在 WPS Office 中加载

#### 方法 A：直接网页预览（无需 WPS）
浏览器打开 `http://localhost:5173` 即可预览插件 UI，此时工作在 Mock 模式（模拟 WPS 数据）。

#### 方法 B：WPS Office 加载项（完整功能）
1. 打开 WPS Excel
2. 菜单：**开发工具 → 加载项 → 浏览**
3. 选择项目根目录下的 `manifest.xml`
4. 插件出现在 Ribbon 栏 **开始 → Claude AI → 打开 Claude**

> **注意**：WPS Web 加载项要求 HTTPS。本地开发时，WPS 允许 `localhost` 使用 HTTP。

## 项目结构

```
src/
├── api/
│   ├── claudeClient.ts   # Claude API 调用（流式响应）
│   └── wpsAdapter.ts     # WPS JS API 封装
├── components/
│   ├── CodeBlock.tsx     # 代码块组件（含执行按钮）
│   └── MessageBubble.tsx # 消息气泡组件
├── types.ts              # TypeScript 类型定义
├── App.tsx               # 主应用（对话逻辑）
└── App.module.css        # 样式
manifest.xml              # WPS 加载项清单
```

## 使用示例

在 WPS 中选中数据区域，然后在对话框输入：

- `"删除 A 列中的重复内容，保留第一条"`
- `"把 B 列的日期统一转换成 YYYY-MM-DD 格式"`
- `"统计 C 列的平均值和总和"`
- `"删除所有空白行"`
- `"把第一行设置为加粗并填充灰色背景"`

Claude 会生成 WPS JS 代码，点击 `[run]` 执行即可。

## MVP 后续计划

- [ ] Phase 2：添加 MCP 工具调用（结构化操作，比代码更安全）
- [ ] Phase 2：操作历史 + 撤销功能
- [ ] Phase 3：多轮对话记忆工作表结构
- [ ] Phase 3：企业版后端（API Key 集中管理、审计日志）
