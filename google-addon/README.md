# Google Sheets Add-on — 部署与开发指南

## 架构

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  Google Sheets   │◄────►│  React Sidebar   │◄────►│  Local Proxy    │
│  Apps Script     │      │  (HtmlService)   │      │  (127.0.0.1:3001)│
│  AllInOne.gs     │      │  Sidebar.html    │      │  proxy-server.js│
└─────────────────┘      └──────────────────┘      └─────────────────┘
       │                        │                         │
       │ google.script.run      │ XHR SSE (有代理时)      │ Claude CLI
       │ 上下文/执行/导航       │ GAS 直连 (无代理时)      │ Skill/Mode
```

## 前置条件

1. Node.js 18+
2. Google 账号
3. `clasp` CLI: `npm install -g @google/clasp && clasp login`

## 快速部署

### 方法 A：一键部署（推荐）

```bash
# 首先配置 google-addon/.clasp.json 中的 scriptId
npm run deploy:gsheets
```

### 方法 B：手动部署

```bash
# 1. 构建单文件 HTML
npm run build:gsheets

# 2. 复制到 google-addon 目录
cp dist-gsheets/google-sheets.html google-addon/Sidebar.html

# 3. 推送到 Apps Script
cd google-addon && clasp push
```

## 首次配置

### 1. 创建 Apps Script 项目

方法 A — 从 Google Sheets 创建（推荐）：
1. 打开 Google Sheets → Extensions → Apps Script
2. 记下 URL 中的 script ID
3. 编辑 `google-addon/.clasp.json`，填入 scriptId

方法 B — 命令行创建：
```bash
cd google-addon
clasp create --title "Claude AI 助手" --type sheets --rootDir .
```

### 2. 首次推送

```bash
cd google-addon && clasp push
```

### 3. 使用

1. 在 Google Sheets 中刷新页面
2. 菜单 → Claude AI → 打开助手面板
3. 侧边栏自动检测本地代理服务器

## 两种连接模式

### 模式 1：本地代理（推荐，流式响应）

```bash
# 启动本地代理（另一个终端）
npm run proxy
```

侧边栏会自动检测 `127.0.0.1:3001`，通过 SSE 实现流式响应。
使用 Claude CLI 订阅认证，无需 API Key。

### 模式 2：GAS 直连（无需本地服务，非流式）

无代理时自动回退，需要在 localStorage 中配置 API Key：
```javascript
localStorage.setItem("claude-office-api-key", "sk-ant-api03-...")
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `appsscript.json` | Add-on 清单（权限、运行时） |
| `AllInOne.gs` | 合并的 Apps Script 后端（上下文/执行/API） |
| `Sidebar.html` | React 构建产物（由 `npm run build:gsheets` 生成） |
| `.clasp.json` | clasp 配置（scriptId） |

## 安全注意事项

- `.clasp.json` 中的 `scriptId` 不要公开到公开仓库
- API Key 存储在浏览器 localStorage 中，仅在 GAS 直连模式下使用
- 本地代理通过 Claude CLI 认证，无需暴露任何密钥
